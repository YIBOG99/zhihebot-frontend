-- ============================================
-- 钱包读写函数（全部 SECURITY DEFINER，前端零直写）
-- 口径：
--   available_balance = 可花余额；frozen_amount = 「已扣款、订单尚未发卡」的在途金额（仅审计视图）
--   wallet_transactions (order_id, kind) 唯一索引 = 幂等关口，重复调用不会二次入账/扣款
-- 返回约定沿用本项目惯例：TEXT，NULL = 成功，非 NULL = 错误文案
-- ============================================

-- 0) 取或建本人钱包行（带行锁），供其余函数内部复用
CREATE OR REPLACE FUNCTION public.wallet_for_update(_uid UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  bal NUMERIC;
BEGIN
  SELECT available_balance INTO bal FROM public.user_wallets WHERE user_id = _uid FOR UPDATE;
  IF bal IS NULL THEN
    INSERT INTO public.user_wallets (user_id) VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;
    SELECT available_balance INTO bal FROM public.user_wallets WHERE user_id = _uid FOR UPDATE;
  END IF;
  RETURN bal;
END;
$func$;

REVOKE ALL ON FUNCTION public.wallet_for_update(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_for_update(UUID) TO authenticated;


-- 1) 余额支付：校验 → 扣款 → 发卡 → 记流水，单事务原子完成
CREATE OR REPLACE FUNCTION public.order_pay_with_balance(_order_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  o RECORD;
  bal NUMERIC;
  need NUMERIC;
  assign_ok BOOLEAN;
  assign_msg TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN '请先登录后再使用余额支付'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = btrim(_order_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN '订单不存在'; END IF;
  IF o.user_id IS DISTINCT FROM auth.uid() THEN RETURN '只能支付自己的订单'; END IF;

  -- 幂等：已完成且确实是余额付的，视为成功
  IF o.status = 'completed' AND o.payment_method = 'balance' THEN RETURN NULL; END IF;
  IF o.status NOT IN ('pending_payment', 'pay_processing') THEN
    RETURN '该订单当前状态无法使用余额支付';
  END IF;
  IF o.card_secret IS NOT NULL THEN RETURN '订单已完成发货，无需再次支付'; END IF;

  need := round(o.amount, 2);
  IF need <= 0 THEN RETURN '订单金额异常，请联系客服'; END IF;

  bal := public.wallet_for_update(auth.uid());
  IF bal < need THEN
    RETURN format('余额不足，当前可用 ¥%s，本单应付 ¥%s，请先充值',
      to_char(bal, 'FM999999990.00'), to_char(need, 'FM999999990.00'));
  END IF;

  -- 先扣钱，再拿卡密：任一步失败整个事务回滚
  UPDATE public.user_wallets
     SET available_balance = available_balance - need,
         total_spent = total_spent + need,
         updated_at = NOW()
   WHERE user_id = auth.uid();

  SELECT ok, message INTO assign_ok, assign_msg FROM public.order_assign_card(btrim(_order_id));

  INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, order_id, ref, note)
  VALUES (auth.uid(), 'spend', -need,
          (SELECT available_balance FROM public.user_wallets WHERE user_id = auth.uid()),
          btrim(_order_id), NULL,
          CASE WHEN assign_ok THEN '余额支付成功' ELSE coalesce(assign_msg, '余额已扣，待补发卡') END);

  UPDATE public.orders
     SET payment_method = 'balance',
         payment_ref = coalesce(payment_ref, 'balance_' || to_char(now(), 'YYYYMMDDHH24MISS')),
         timeline = timeline || jsonb_build_object('at', now(), 'label', '余额支付'),
         updated_at = NOW()
   WHERE id = btrim(_order_id);

  IF NOT assign_ok THEN
    RETURN '已从余额扣款 ¥' || to_char(need, 'FM999999990.00')
      || '，但该商品暂时缺货，店主补录卡密后会自动发放，请稍后到查单页核实';
  END IF;
  RETURN NULL; -- NULL = 成功
EXCEPTION WHEN OTHERS THEN
  RETURN '余额支付失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.order_pay_with_balance(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_pay_with_balance(TEXT) TO authenticated;


-- 2) 充值到账入账（云端核验任务调用，同一笔支付宝交易号只入账一次）
CREATE OR REPLACE FUNCTION public.wallet_credit_recharge(
  _order_id TEXT, _amount NUMERIC, _trade_no TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  o RECORD;
  amt NUMERIC;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = btrim(_order_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN '订单不存在'; END IF;
  IF o.user_id IS NULL THEN RETURN '游客订单不能入余额，请登录后重新充值'; END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE order_id = btrim(_order_id) AND kind = 'recharge') THEN
    RETURN NULL; -- 幂等：已入账
  END IF;

  amt := round(coalesce(_amount, o.amount), 2);
  IF amt <= 0 THEN RETURN '充值金额异常'; END IF;

  PERFORM public.wallet_for_update(o.user_id);
  UPDATE public.user_wallets
     SET available_balance = available_balance + amt,
         total_recharged = total_recharged + amt,
         updated_at = NOW()
   WHERE user_id = o.user_id;

  INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, order_id, ref, note)
  VALUES (o.user_id, 'recharge', amt,
          (SELECT available_balance FROM public.user_wallets WHERE user_id = o.user_id),
          btrim(_order_id), nullif(btrim(coalesce(_trade_no, '')), ''), '在线充值到账');

  UPDATE public.orders
     SET status = 'completed',
         card_secret = NULL,
         payment_ref = coalesce(nullif(btrim(coalesce(_trade_no, '')), ''), payment_ref),
         timeline = timeline || jsonb_build_object('at', now(), 'label', '充值到账 ¥' || to_char(amt, 'FM999999990.00')),
         updated_at = NOW()
   WHERE id = btrim(_order_id);

  RETURN NULL;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL; -- 并发重复入账：唯一索引兜住，视为已成功
WHEN OTHERS THEN
  RETURN '充值入账失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.wallet_credit_recharge(TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_credit_recharge(TEXT, NUMERIC, TEXT) TO authenticated;


-- 3) 超时解冻退回（云端任务对「余额已扣但未发卡」的在途单调用）
CREATE OR REPLACE FUNCTION public.wallet_unfreeze_pending(_order_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  o RECORD;
  amt NUMERIC;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = btrim(_order_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN '订单不存在'; END IF;
  IF o.user_id IS NULL THEN RETURN NULL; END IF;
  IF o.status <> 'paid_pending_delivery' OR o.payment_method <> 'balance' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE order_id = btrim(_order_id) AND kind = 'unfreeze') THEN
    RETURN NULL; -- 幂等
  END IF;

  amt := round(o.amount, 2);
  PERFORM public.wallet_for_update(o.user_id);
  UPDATE public.user_wallets
     SET available_balance = available_balance + amt,
         total_spent = GREATEST(0, total_spent - amt),
         updated_at = NOW()
   WHERE user_id = o.user_id;

  INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, order_id, note)
  VALUES (o.user_id, 'unfreeze', amt,
          (SELECT available_balance FROM public.user_wallets WHERE user_id = o.user_id),
          btrim(_order_id), '商品缺货，余额已退回');

  UPDATE public.orders
     SET status = 'closed', close_reason = 'timeout_auto',
         timeline = timeline || jsonb_build_object('at', now(), 'label', '未补发卡，余额原路退回'),
         updated_at = NOW()
   WHERE id = btrim(_order_id);

  IF o.coupon_code IS NOT NULL AND o.discount_amount > 0 THEN
    UPDATE public.referral_rewards SET status = 'available', used_at = NULL
     WHERE code = o.coupon_code AND status = 'used';
  END IF;
  RETURN NULL;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL;
WHEN OTHERS THEN
  RETURN '退回失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.wallet_unfreeze_pending(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_unfreeze_pending(TEXT) TO authenticated;


-- 4) 管理员退款退回余额（仅针对已完成的余额支付订单，一单只退一次）
CREATE OR REPLACE FUNCTION public.wallet_refund_order(_order_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  o RECORD;
  amt NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RETURN '无权限执行该操作'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = btrim(_order_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN '订单不存在'; END IF;
  IF o.user_id IS NULL THEN RETURN '该订单没有关联账号，无法退回余额'; END IF;
  IF o.payment_method <> 'balance' THEN RETURN '该订单不是余额支付，无需退回余额'; END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE order_id = btrim(_order_id) AND kind = 'refund') THEN
    RETURN NULL; -- 幂等：已退过
  END IF;

  amt := round(o.amount, 2);
  PERFORM public.wallet_for_update(o.user_id);
  UPDATE public.user_wallets
     SET available_balance = available_balance + amt,
         total_spent = GREATEST(0, total_spent - amt),
         updated_at = NOW()
   WHERE user_id = o.user_id;

  INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, order_id, note)
  VALUES (o.user_id, 'refund', amt,
          (SELECT available_balance FROM public.user_wallets WHERE user_id = o.user_id),
          btrim(_order_id), '管理员退款退回余额');

  UPDATE public.orders
     SET timeline = timeline || jsonb_build_object('at', now(), 'label', '余额已退款 ¥' || to_char(amt, 'FM999999990.00')),
         updated_at = NOW()
   WHERE id = btrim(_order_id);

  RETURN NULL;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL;
WHEN OTHERS THEN
  RETURN '退款失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.wallet_refund_order(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_refund_order(TEXT) TO authenticated;


-- 5) 我的钱包视图（余额 + 最近流水，一条 RPC 拿齐）
CREATE OR REPLACE FUNCTION public.my_wallet()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  uid UUID;
  w RECORD;
  tx JSONB;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RETURN '{}'::JSONB; END IF;

  SELECT * INTO w FROM public.user_wallets WHERE user_id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', 0, 'frozen', 0, 'total_recharged', 0,
                              'total_spent', 0, 'transactions', '[]'::JSONB);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'amount', t.amount, 'balance_after', t.balance_after,
      'order_id', t.order_id, 'note', t.note, 'created_at', t.created_at) ORDER BY t.created_at DESC), '[]'::JSONB)
    INTO tx
    FROM (SELECT * FROM public.wallet_transactions WHERE user_id = uid
          ORDER BY created_at DESC LIMIT 20) t;

  RETURN jsonb_build_object('available', w.available_balance, 'frozen', w.frozen_amount,
                            'total_recharged', w.total_recharged, 'total_spent', w.total_spent,
                            'transactions', tx);
END;
$func$;

REVOKE ALL ON FUNCTION public.my_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_wallet() TO authenticated;

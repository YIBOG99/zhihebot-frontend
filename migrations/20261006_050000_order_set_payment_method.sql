-- ============================================
-- 新增 order_set_payment_method：建单成功后顾客改选支付方式时重算手续费
-- 背景：确认订单页不再展示支付方式，改为「提交订单 → 进入选择支付方式页统一挑选」。
--       因此建单时无法预知通道，order_create 只能按免手续费口径落库；
--       顾客选定支付宝类通道后必须把通道写回订单并按费率重算 amount/channel_fee，
--       否则前端展示的应付金额与订单实际金额不一致（收银页收款码金额会错）。
-- 口径：与 order_create / 前端 calcPayable 完全等价
--       fee = round(round(goods_amount - discount_amount, 2) × rate / 100, 2)
--       amount = round(goods_amount - discount_amount + fee, 2)
-- 守卫：仅本人、仅未发卡且未关闭的在途单可改；余额支付不走这里（由
--       order_pay_with_balance 自己扣款），故白名单只收四条真实付款通道。
-- 返回：标量 TEXT，NULL = 成功，非 NULL = 错误文案（与其它订单 RPC 同口径）
-- ============================================

CREATE OR REPLACE FUNCTION public.order_set_payment_method(_order_id TEXT, _method TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  o RECORD;
  c JSONB;
  m TEXT;
  rate NUMERIC(8,6);
  fee_on BOOLEAN;
  fee NUMERIC(10,2);
  goods NUMERIC(10,2);
  disc NUMERIC(10,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '请先登录后再更换支付方式';
  END IF;

  m := lower(btrim(coalesce(_method, '')));
  IF m NOT IN ('alipay', 'alipay_qr', 'alipay_manual', 'wechat') THEN
    RETURN '该支付方式不可用，请重新选择';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = btrim(_order_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN '订单不存在'; END IF;
  IF o.user_id IS DISTINCT FROM auth.uid() THEN RETURN '无权操作该订单'; END IF;
  IF o.card_secret IS NOT NULL THEN RETURN '订单已完成发货，无法更换支付方式'; END IF;
  IF o.status NOT IN ('pending_payment', 'pay_processing') THEN
    RETURN '该订单当前状态无法更换支付方式';
  END IF;

  -- 手续费率：与 order_create 同一份配置、同一套非法值回退规则
  SELECT s.value INTO c FROM public.site_settings s WHERE s.key = 'billing';
  fee_on := coalesce((c->>'fee_enabled')::BOOLEAN, true);
  rate := coalesce((c->>'alipay_fee_rate')::NUMERIC, 4.6);
  IF rate < 0 OR rate > 20 THEN rate := 4.6; END IF;

  goods := coalesce(o.goods_amount, round(o.amount, 2));
  disc := coalesce(o.discount_amount, 0);
  IF fee_on AND m IN ('alipay', 'alipay_qr', 'alipay_manual') THEN
    fee := round(round(goods - disc, 2) * rate / 100, 2);
  ELSE
    fee := 0;
  END IF;

  UPDATE public.orders
     SET payment_method = m,
         goods_amount = goods,
         channel_fee = fee,
         amount = round(goods - disc + fee, 2),
         timeline = timeline || jsonb_build_object('at', now(), 'label', '更换支付方式：' || m),
         updated_at = NOW()
   WHERE id = o.id;

  RETURN NULL; -- NULL = 成功
EXCEPTION WHEN OTHERS THEN
  RETURN '更换失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.order_set_payment_method(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_set_payment_method(TEXT, TEXT) TO authenticated;

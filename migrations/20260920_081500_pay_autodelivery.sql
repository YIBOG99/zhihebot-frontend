-- 支付自动发卡：抽取共用发卡事务 order_assign_card，新增 order_pay_sync（供 Edge Function 以 service role 调用）
-- 重写 order_confirm_payment 内部复用 order_assign_card（签名与返回结构保持不变）

-- 1) 共用发卡逻辑：行锁订单 → 分配 unused 卡密 → completed；无卡密则置 paid_pending_delivery 等人工补发
CREATE OR REPLACE FUNCTION public.order_assign_card(_order_id TEXT)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o RECORD;
  cs RECORD;
  new_timeline JSONB;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '订单不存在';
    RETURN;
  END IF;
  IF o.status = 'completed' THEN
    RETURN QUERY SELECT true, '订单已完成';
    RETURN;
  END IF;
  IF o.status NOT IN ('pending_payment', 'pay_processing', 'paid_pending_delivery') THEN
    RETURN QUERY SELECT false, '当前状态不可发货';
    RETURN;
  END IF;

  SELECT * INTO cs FROM public.card_secrets
    WHERE product_id = o.product_id AND status = 'unused' ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    new_timeline := o.timeline || jsonb_build_object('at', now(), 'label', '已收款，暂无卡密待补发');
    UPDATE public.orders SET status = 'paid_pending_delivery', timeline = new_timeline, updated_at = NOW()
      WHERE id = _order_id;
    RETURN QUERY SELECT true, '已收款，但该商品暂无可用卡密，请导入后手动发货';
    RETURN;
  END IF;

  UPDATE public.card_secrets SET status = 'used', order_id = _order_id, used_at = NOW() WHERE id = cs.id;
  new_timeline := o.timeline || jsonb_build_object('at', now(), 'label', '在线支付到账') || jsonb_build_object('at', now(), 'label', '自动发货完成');
  UPDATE public.orders
    SET status = 'completed', card_secret = cs.code, payment_ref = coalesce(payment_ref, 'alipay_auto'),
        timeline = new_timeline, updated_at = NOW()
    WHERE id = _order_id;
  RETURN QUERY SELECT true, '支付成功，已自动发货';
END;
$$;

-- 2) 支付对账落库：仅由 Edge Function（service_role）在查证支付宝 TRADE_SUCCESS 后调用
CREATE OR REPLACE FUNCTION public.order_mark_paid(_order_id TEXT, _trade_no TEXT)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
    SET payment_ref = coalesce(_trade_no, payment_ref), updated_at = NOW()
    WHERE id = _order_id AND status IN ('pending_payment', 'pay_processing');
  RETURN QUERY SELECT ok, message FROM public.order_assign_card(_order_id);
END;
$$;

-- 3) 重写后台确认收款：保持原签名/返回，内部复用 order_assign_card
CREATE OR REPLACE FUNCTION public.order_confirm_payment(_order_id TEXT)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o RECORD;
  new_timeline JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN QUERY SELECT false, '无权限执行该操作';
    RETURN;
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false, '订单不存在'; RETURN; END IF;
  IF o.status NOT IN ('pending_payment', 'pay_processing', 'paid_pending_delivery') THEN
    RETURN QUERY SELECT false, '当前状态不可确认收款';
    RETURN;
  END IF;
  IF o.status <> 'paid_pending_delivery' THEN
    new_timeline := o.timeline || jsonb_build_object('at', now(), 'label', '已确认收款');
    UPDATE public.orders SET status = 'paid_pending_delivery',
      payment_ref = coalesce(payment_ref, '后台确认'), timeline = new_timeline, updated_at = NOW()
      WHERE id = _order_id;
  END IF;
  RETURN QUERY SELECT ok, message FROM public.order_assign_card(_order_id);
END;
$$;

COMMENT ON COLUMN public.orders.status IS 'pending_payment | pay_processing | paid_pending_delivery | completed | closed';

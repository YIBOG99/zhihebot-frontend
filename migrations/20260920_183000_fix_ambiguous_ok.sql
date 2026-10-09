-- 修复 SQLSTATE 42702 "column reference \"ok\" is ambiguous"
-- 根因：函数自身 RETURNS TABLE (ok, message)，末尾又写
--   RETURN QUERY SELECT ok, message FROM public.order_assign_card(_order_id);
-- 裸 ok / message 同时匹配「OUT 参数列」与「子查询返回列」，PostgreSQL 无法判定 → 抛错。
-- 影响：后台「确认收款」完全不可用；支付宝对账回写（order_mark_paid）同样会炸。
-- 修法：改为显式表别名取列，杜绝歧义。行为、签名、返回结构均保持不变。

-- 1) 后台确认收款
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
  RETURN QUERY SELECT a.ok, a.message FROM public.order_assign_card(_order_id) AS a;
END;
$$;

-- 2) 支付对账落库（Edge Function service_role 调用），同样的歧义写法一并修正
CREATE OR REPLACE FUNCTION public.order_mark_paid(_order_id TEXT, _trade_no TEXT)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
    SET payment_ref = coalesce(_trade_no, payment_ref), updated_at = NOW()
    WHERE id = _order_id AND status IN ('pending_payment', 'pay_processing');
  RETURN QUERY SELECT a.ok, a.message FROM public.order_assign_card(_order_id) AS a;
END;
$$;

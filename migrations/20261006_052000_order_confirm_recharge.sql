-- Manual confirmation must settle recharge orders into the wallet, not route them to card inventory.
-- Apply only after the reviewed baseline and wallet migrations have been installed in order.
CREATE OR REPLACE FUNCTION public.order_confirm_payment(_order_id TEXT)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  o RECORD;
  v_message TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN QUERY SELECT false, '无权限执行该操作'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO o
    FROM public.orders
   WHERE id = btrim(_order_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '订单不存在'::TEXT;
    RETURN;
  END IF;

  IF o.status NOT IN ('pending_payment', 'pay_processing', 'paid_pending_delivery') THEN
    RETURN QUERY SELECT false, '当前状态不可确认收款'::TEXT;
    RETURN;
  END IF;

  -- Recharge orders have no card inventory. Credit wallet exactly once instead.
  IF coalesce(o.is_recharge, false) THEN
    v_message := public.wallet_credit_recharge(
      btrim(_order_id),
      o.amount,
      coalesce(nullif(btrim(coalesce(o.payment_ref, '')), ''), 'manual-confirm')
    );
    IF v_message IS NOT NULL THEN
      RETURN QUERY SELECT false, v_message;
    ELSE
      RETURN QUERY SELECT true, '充值已人工确认并入账'::TEXT;
    END IF;
    RETURN;
  END IF;

  IF o.status <> 'paid_pending_delivery' THEN
    UPDATE public.orders
       SET status = 'paid_pending_delivery',
           payment_ref = coalesce(payment_ref, '后台确认'),
           timeline = timeline || jsonb_build_object('at', now(), 'label', '已确认收款'),
           updated_at = NOW()
     WHERE id = btrim(_order_id);
  END IF;

  RETURN QUERY
    SELECT assigned.ok, assigned.message
      FROM public.order_assign_card(btrim(_order_id)) AS assigned;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, '确认失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.order_confirm_payment(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_confirm_payment(TEXT) TO authenticated;

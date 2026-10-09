-- Deliver the full purchased quantity atomically instead of consuming only one card.
-- This replaces the latest order_assign_card implementation while preserving the
-- auto-whitelist hook and the existing RPC signature used by checkout/payment flows.

CREATE OR REPLACE FUNCTION public.order_assign_card(_order_id TEXT)
RETURNS TABLE (ok BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  o RECORD;
  v_required INTEGER;
  v_available INTEGER;
  v_delivered INTEGER;
  v_card_ids UUID[];
  v_codes TEXT;
  new_timeline JSONB;
BEGIN
  SELECT *
    INTO o
    FROM public.orders
   WHERE id = btrim(_order_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '订单不存在'::TEXT;
    RETURN;
  END IF;

  IF o.status = 'completed' THEN
    PERFORM public.auto_whitelist_check(btrim(_order_id));
    RETURN QUERY SELECT true, '订单已完成'::TEXT;
    RETURN;
  END IF;

  IF o.status NOT IN ('pending_payment', 'pay_processing', 'paid_pending_delivery') THEN
    RETURN QUERY SELECT false, '当前状态不可发货'::TEXT;
    RETURN;
  END IF;

  v_required := GREATEST(1, LEAST(COALESCE(o.quantity, 1), 10));

  -- Lock the first requested inventory rows. SKIP LOCKED prevents concurrent paid
  -- orders from racing for the same cards. Inventory is consumed only if the full
  -- requested quantity is available, so shortages never partially consume stock.
  SELECT COALESCE(array_agg(selected.id), ARRAY[]::UUID[])
    INTO v_card_ids
    FROM (
      SELECT id
        FROM public.card_secrets
       WHERE product_id = o.product_id
         AND status = 'unused'
       ORDER BY created_at ASC, id ASC
       LIMIT v_required
       FOR UPDATE SKIP LOCKED
    ) AS selected;

  v_available := COALESCE(array_length(v_card_ids, 1), 0);

  IF v_available < v_required THEN
    new_timeline := COALESCE(o.timeline, '[]'::JSONB)
      || jsonb_build_object('at', now(), 'label', '已收款，卡密数量不足待补发');
    UPDATE public.orders
       SET status = 'paid_pending_delivery',
           timeline = new_timeline,
           updated_at = NOW()
     WHERE id = btrim(_order_id);

    PERFORM public.auto_whitelist_check(btrim(_order_id));
    RETURN QUERY SELECT true,
      format('已收款，但卡密库存不足：订单需要 %s 条，当前可分配 %s 条，请补充库存后重新发货', v_required, v_available);
    RETURN;
  END IF;

  UPDATE public.card_secrets
     SET status = 'used',
         order_id = btrim(_order_id),
         used_at = NOW()
   WHERE id = ANY(v_card_ids)
     AND status = 'unused';
  GET DIAGNOSTICS v_delivered = ROW_COUNT;

  IF COALESCE(v_delivered, 0) <> v_required THEN
    RAISE EXCEPTION '卡密库存发生并发变化，请重试发货';
  END IF;

  SELECT string_agg(cs.code, E'\n' ORDER BY cs.created_at ASC, cs.id ASC)
    INTO v_codes
    FROM public.card_secrets AS cs
   WHERE cs.id = ANY(v_card_ids)
     AND cs.order_id = btrim(_order_id);

  new_timeline := COALESCE(o.timeline, '[]'::JSONB)
    || jsonb_build_object('at', now(), 'label', '收款已确认')
    || jsonb_build_object('at', now(), 'label', format('自动发货完成（%s 条卡密）', v_required));

  UPDATE public.orders
     SET status = 'completed',
         card_secret = v_codes,
         payment_ref = COALESCE(payment_ref, 'payment_confirmed'),
         timeline = new_timeline,
         updated_at = NOW()
   WHERE id = btrim(_order_id);

  PERFORM public.auto_whitelist_check(btrim(_order_id));
  RETURN QUERY SELECT true, format('支付成功，已自动发放 %s 条卡密', v_required);

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, '发货失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.order_assign_card(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_assign_card(TEXT) TO authenticated;

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

  -- Lock up to the requested quantity. SKIP LOCKED prevents concurrent paid orders
  -- from racing for the same inventory. Nothing is consumed unless the full quantity
  -- is available, so customers never lose part of their inventory on an undersupply.
  WITH chosen AS MATERIALIZED (
    SELECT id
      FROM public.card_secrets
     WHERE product_id = o.product_id
       AND status = 'unused'
     ORDER BY created_at ASC, id ASC
     LIMIT v_required
     FOR UPDATE SKIP LOCKED
  )
  SELECT count(*)::INTEGER
    INTO v_available
    FROM chosen;

  IF COALESCE(v_available, 0) < v_required THEN
    new_timeline := COALESCE(o.timeline, '[]'::JSONB)
      || jsonb_build_object('at', now(), 'label', '已收款，卡密数量不足待补发');
    UPDATE public.orders
       SET status = 'paid_pending_delivery',
           timeline = new_timeline,
           updated_at = NOW()
     WHERE id = btrim(_order_id);

    PERFORM public.auto_whitelist_check(btrim(_order_id));
    RETURN QUERY SELECT true,
      format('已收款，但卡密库存不足：订单需要 %s 条，当前可分配 %s 条，请补充库存后重新发货', v_required, COALESCE(v_available, 0));
    RETURN;
  END IF;

  WITH chosen AS MATERIALIZED (
    SELECT id, code, created_at
      FROM public.card_secrets
     WHERE product_id = o.product_id
       AND status = 'unused'
     ORDER BY created_at ASC, id ASC
     LIMIT v_required
     FOR UPDATE SKIP LOCKED
  ),
  enough AS (
    SELECT count(*)::INTEGER AS n FROM chosen
  ),
  updated AS (
    UPDATE public.card_secrets AS cs
       SET status = 'used',
           order_id = btrim(_order_id),
           used_at = NOW()
     WHERE cs.id IN (SELECT id FROM chosen)
       AND (SELECT n FROM enough) = v_required
    RETURNING cs.id, cs.code
  )
  SELECT string_agg(updated.code, E'\n' ORDER BY chosen.created_at ASC, chosen.id ASC),
         count(*)::INTEGER
    INTO v_codes, v_delivered
    FROM updated
    JOIN chosen USING (id);

  IF COALESCE(v_delivered, 0) <> v_required THEN
    -- A concurrent change can only lead here if inventory was modified by a different
    -- database path. Roll back this function call rather than mark a partial delivery.
    RAISE EXCEPTION '卡密库存发生并发变化，请重试发货';
  END IF;

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

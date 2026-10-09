-- ============================================
-- 云端到账核验的取单通道修正
-- 背景：SQL 型定时任务无法访问外网（本库未启用 pg_net），真实的支付宝查单只能在
--       Edge Function 内完成；而 Edge Function 被调度触发时不携带用户 JWT，
--       数据库侧 auth.uid() 恒为 NULL，原先「必须是 admin」的守卫必然失败。
-- 方案：把「取候选 + 本地清理」独立成 alipay_sweep_pick(_secret)，
--       允许持有调度口令的调用（即本站核验函数）执行；业务表权限完全不放开。
-- 说明：alipay_sweep_run 保留给店主在后台手动触发（走 admin 身份），两者互不影响。
-- ============================================

CREATE OR REPLACE FUNCTION public.alipay_sweep_pick(_limit INT DEFAULT 40, _secret TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  uid    UUID;
  secret TEXT;
  rows   JSONB;
BEGIN
  SELECT value->>'secret' INTO secret FROM public.site_settings WHERE key = 'sweep';

  -- 放行条件：调度口令正确（云端核验函数）或调用者是店主本人
  IF _secret IS NULL OR secret IS NULL OR btrim(_secret) = '' OR btrim(_secret) <> secret THEN
    uid := auth.uid();
    IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
      RETURN jsonb_build_object('error', 'FORBIDDEN', 'orders', '[]'::JSONB);
    END IF;
  END IF;

  -- 1) 从未出码且已过时限的待付款单：无需向支付宝复核，直接关闭
  UPDATE public.orders
     SET status = 'closed',
         close_reason = 'timeout_auto',
         timeline = timeline || jsonb_build_object('at', now(), 'label', '超时自动关闭'),
         updated_at = NOW()
   WHERE card_secret IS NULL
     AND status = 'pending_payment'
     AND expires_at IS NOT NULL
     AND expires_at < NOW();

  -- 2) 余额已扣但缺货待补发且已超过时限 → 原路退回（内部有状态与幂等守卫）
  PERFORM public.wallet_unfreeze_pending(o.id)
    FROM (SELECT id FROM public.orders
           WHERE status = 'paid_pending_delivery' AND payment_method = 'balance'
             AND card_secret IS NULL
             AND expires_at IS NOT NULL AND expires_at < NOW()
           LIMIT 10) o;

  -- 3) 需要向支付宝网关复核的在途单
  rows := public.alipay_sweep_candidates(_limit);

  RETURN jsonb_build_object('orders', coalesce(rows, '[]'::JSONB));
END;
$func$;

REVOKE ALL ON FUNCTION public.alipay_sweep_pick(INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alipay_sweep_pick(INT, TEXT) TO anon, authenticated;

-- 上一版为 SQL 型任务准备的 HTTP 桥接函数在本库无 pg_net，确认无用后移除
DROP FUNCTION IF EXISTS public.alipay_sweep_trigger();

-- ============================================
-- 云端到账核验的调度身份适配
-- 背景：alipay_sweep_run 内部要求调用者是 admin（防止任意登录用户凭 RPC 探测他人订单）。
--       定时任务以 <完整库名>_authenticator 角色执行，该角色没有 JWT、也不在任何角色表里，
--       因此为它单独开一条「函数级调度口令」通道：只有持正确口令的调用（即 Edge Function）
--       才被放行，且该角色仅被授予这一个函数的 EXECUTE，拿不到任何表数据。
-- 口令来源：site_settings.sweep.secret（后台 JSON 编辑或本文件设置），非公开信息。
-- ============================================

-- 1) 调度口令（若已存在则不覆盖，避免每次迁移轮换口令导致线上函数失配）
INSERT INTO public.site_settings (key, value)
SELECT 'sweep', jsonb_build_object(
         'secret', encode(gen_random_bytes(24), 'hex'),
         'note', '云端到账核验调度口令，修改后需同步更新 alipay-sweep 函数'
       )::JSONB
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'sweep')
ON CONFLICT (key) DO NOTHING;

-- 2) 放宽守卫：admin 身份 或 提供正确调度口令
CREATE OR REPLACE FUNCTION public.alipay_sweep_run(_limit INT DEFAULT 40, _secret TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  uid UUID;
  rows JSONB;
  secret TEXT;
BEGIN
  SELECT (value->>'secret') INTO secret FROM public.site_settings WHERE key = 'sweep';

  IF _secret IS NOT NULL AND secret IS NOT NULL AND btrim(_secret) <> '' AND btrim(_secret) = secret THEN
    -- 调度口令通过：由云端核验任务触发
    NULL;
  ELSE
    uid := auth.uid();
    IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
      RETURN jsonb_build_object('error', 'FORBIDDEN', 'orders', '[]'::JSONB);
    END IF;
  END IF;

  -- 1) 超时未付款单先做本地关单（未出码的单没有可向支付宝复核的必要）
  UPDATE public.orders
     SET status = 'closed',
         close_reason = 'timeout_auto',
         timeline = timeline || jsonb_build_object('at', now(), 'label', '超时自动关闭'),
         updated_at = NOW()
   WHERE card_secret IS NULL
     AND status = 'pending_payment'
     AND expires_at IS NOT NULL
     AND expires_at < NOW();

  -- 2) 余额已扣但未发卡且已超过时限 → 原路退回（函数内含状态与幂等守卫）
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

REVOKE ALL ON FUNCTION public.alipay_sweep_run(INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alipay_sweep_run(INT, TEXT) TO authenticated, anon;

-- 旧签名（单参）已由上面的新签名取代；显式删除避免 PostgreSQL 重载歧义 42725
DROP FUNCTION IF EXISTS public.alipay_sweep_run(INT);

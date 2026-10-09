-- ============================================
-- 云端到账核验的取单通道 v2
-- 变更点：alipay_sweep_pick 不再要求调用方出示调度口令。
--   原因：核验函数由平台定时任务触发，既不带用户 JWT、也不便额外注入口令，
--         而本库未启用 pg_net，SQL 侧无法访问外网，真实查单只能在函数内做。
--   安全：该函数只返回「订单号 + 金额 + 状态 + 时限」这类对账必需字段，
--         不含联系方式、卡密与用户身份；真正的资金动作仍由各 RPC 的状态守卫
--         与 (order_id, kind) 唯一流水关口把关，外部即使读到清单也无法伪造到账。
--   本地清理（超时关单、余额缺货退回）逻辑保持不变。
-- ⚠️ PostgreSQL 重载坑：参数列表变化即新签名，必须显式 DROP 旧的 (INT, TEXT)。
-- ============================================

DROP FUNCTION IF EXISTS public.alipay_sweep_pick(INT, TEXT);

CREATE OR REPLACE FUNCTION public.alipay_sweep_pick(_limit INT DEFAULT 40)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  uid  UUID;
  rows JSONB;
BEGIN
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

REVOKE ALL ON FUNCTION public.alipay_sweep_pick(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alipay_sweep_pick(INT) TO anon, authenticated;

-- 店主手动触发的那版（走 admin 身份）保留，供后台按钮使用
-- alipay_sweep_run(INT, TEXT) 不动。

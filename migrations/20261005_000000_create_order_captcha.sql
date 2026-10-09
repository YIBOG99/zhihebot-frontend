-- ============================================
-- 下单人机校验：题目签发与一次性凭证存储
-- 目的：过滤脚本批量下单后恶意退款
-- ============================================

-- 1) 题目表：答案只存 sha256，明文不落库；RLS 不给 anon/authenticated 任何权限，
--    只有 Edge Function（service role）写入、order_create RPC（security definer）读取核验。
CREATE TABLE IF NOT EXISTS public.order_captcha_challenges (
  id TEXT PRIMARY KEY,
  answer_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

COMMENT ON TABLE public.order_captcha_challenges IS '下单人机校验题目；answer_hash = sha256(正确答案字符串)，一次性使用';

ALTER TABLE public.order_captcha_challenges ENABLE ROW LEVEL SECURITY;

-- 不创建任何 policy：开启 RLS 且无策略 = 对 anon / authenticated 完全不可见（含 SELECT/INSERT）。
-- service_role 绕过 RLS，role authenticator 无需表权限（只通过 RPC 间接访问）。

CREATE INDEX IF NOT EXISTS order_captcha_expiry_idx
  ON public.order_captcha_challenges (expires_at);

-- 2) 清理函数：删除过期或已使用的题目行（供定时任务调用，幂等）
CREATE OR REPLACE FUNCTION public.order_captcha_purge()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM public.order_captcha_challenges
   WHERE expires_at < NOW() - INTERVAL '1 hour' OR used_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$func$;

REVOKE ALL ON FUNCTION public.order_captcha_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_captcha_purge() TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_captcha_purge() TO anon;

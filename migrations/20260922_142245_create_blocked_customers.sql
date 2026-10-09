-- 客户黑名单：手动拉黑恶意卡单客户
CREATE TABLE IF NOT EXISTS public.blocked_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'phone')),
  contact_value TEXT NOT NULL,
  raw_value TEXT,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.blocked_customers IS '客户黑名单：按联系方式（邮箱/手机号）拦截下单';
COMMENT ON COLUMN public.blocked_customers.contact_value IS '归一化后的联系方式（邮箱转小写去空格，手机号去空格）';
COMMENT ON COLUMN public.blocked_customers.raw_value IS '管理员录入时的原始值，仅用于展示';
COMMENT ON COLUMN public.blocked_customers.is_active IS 'false 表示已解除拉黑（软删除，保留历史）';

-- 同一联系方式只允许一条生效记录（部分唯一索引，允许多条已解除历史）
CREATE UNIQUE INDEX IF NOT EXISTS blocked_customers_active_key
  ON public.blocked_customers (contact_type, contact_value)
  WHERE is_active;

-- 下单拦截高频查询索引
CREATE INDEX IF NOT EXISTS blocked_customers_lookup_idx
  ON public.blocked_customers (contact_value, is_active);

ALTER TABLE public.blocked_customers ENABLE ROW LEVEL SECURITY;

-- 仅管理员可读写；游客与普通用户完全不可见（下单拦截走 order_create RPC 内部直查，不依赖 SELECT 策略）
DROP POLICY IF EXISTS admins_select_blocked_customers ON public.blocked_customers;
CREATE POLICY admins_select_blocked_customers ON public.blocked_customers
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS admins_insert_blocked_customers ON public.blocked_customers;
CREATE POLICY admins_insert_blocked_customers ON public.blocked_customers
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS admins_update_blocked_customers ON public.blocked_customers;
CREATE POLICY admins_update_blocked_customers ON public.blocked_customers
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

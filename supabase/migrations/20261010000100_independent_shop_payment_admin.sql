-- Independent digital shop foundation
-- Payment configurations
create table if not exists public.payment_configs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  enabled boolean not null default false,
  qr_url text,
  pay_url text,
  deep_link text,
  wallet_address text,
  network text,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Admin roles extension
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz default now()
);

-- Blacklist
create table if not exists public.blacklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  reason text,
  created_at timestamptz default now()
);

-- Card inventory
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  code text not null,
  status text not null default 'available',
  order_id uuid,
  created_at timestamptz default now()
);

-- Orders payment tracking fields
alter table if exists public.orders add column if not exists payment_method text;
alter table if exists public.orders add column if not exists payment_status text default 'pending';
alter table if exists public.orders add column if not exists confirmed_at timestamptz;

insert into public.payment_configs(code,name,enabled,sort_order) values
('alipay_1','支付宝1',false,1),
('alipay_2','支付宝2',false,2),
('alipay_3','支付宝3',false,3),
('wechat','微信支付',false,4),
('usdt','USDT',false,5)
on conflict (code) do nothing;

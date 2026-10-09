# 独立后端部署与后台启用指南

本项目是独立运行的 React/Vite 商城。源代码曾从其他平台导出，但线上运行不依赖该平台；新部署只需要自己的 Supabase 项目与 Cloudflare Pages/Workers 静态托管。

## 当前状态

- 前台快照模式默认开启：可在没有后端时展示导出的公开内容。
- 登录、订单、支付、卡密交付、管理操作需要独立 Supabase 后端完成配置。
- `/admin` 是完整管理后台入口；它不是免登录页面，必须使用 Supabase Auth 用户并拥有 `admin` 角色。
- `/boss` 是单独的老板数据看板，依赖 `boss-api` Edge Function 和 `BOSS_KEY`，不是商品/订单编辑后台。

## 1. 创建 Supabase 项目

1. 在 Supabase 创建一个全新的项目。
2. 从项目设置中复制 Project URL 与 anon/public key。
3. **不要把 `migrations/` 目录中的所有 SQL 一次性全选执行。** 该目录包含重复版本、函数签名升级和非幂等的策略创建语句；其中种子数据还含有旧收款配置与旧站点地址。先按 [数据库迁移审计说明](DATABASE_MIGRATION_AUDIT.md) 选择并验证迁移，再初始化数据库。
4. 在 Supabase Authentication 中启用所需登录方式，并配置正式站点的 Site URL 与 Redirect URLs。
5. 创建自己的管理员登录用户。完成注册后，在 SQL Editor 执行以下语句，将邮箱对应的 Auth 用户授予管理员角色（把邮箱替换为你自己的登录邮箱）：

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('替换为你的管理员邮箱')
on conflict (user_id, role) do nothing;
```

执行前确认 `public.user_roles` 与 `public.app_role` 已由仓库迁移创建。不要把 service-role key 放进前端环境变量。

## 2. 配置前端

将仓库根目录 `.env.example` 复制为本地 `.env.local`，填写：

- `VITE_SUPABASE_URL`：新 Supabase 项目 URL
- `VITE_SUPABASE_ANON_KEY`：该项目 anon/public key
- `VITE_PUBLIC_SNAPSHOT_MODE=false`：让公开数据从新后端读取

`VITE_ONEDAY_APP_ID` 仅作为可选的兼容请求标识；独立 Supabase 部署不需要依赖原平台项目。所有以 `VITE_` 开头的值都会进入浏览器，不能放任何服务端密钥。

## 3. 部署 Edge Functions

仓库 `functions/` 中的函数需要部署到你自己的 Supabase 项目，并按代码要求设置 secrets。至少先检查：

- `order-captcha`：需要对应的验证码表及站点设置数据。
- `boss-api`：需要 `BOSS_KEY`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。service-role key 只能保存在 Supabase Function secrets 中。

使用 Supabase CLI 登录并链接新项目后，根据 Supabase 当前 CLI 文档部署各函数；不要把 secrets 写入 Git、Cloudflare 的公开前端变量或提交到仓库。

## 4. Cloudflare 部署

项目的 `wrangler.jsonc` 将 `dist/` 作为静态资源目录，构建命令为 `npm run build`。Cloudflare 部署前，在构建环境中设置上述三个前端变量，并确保 `VITE_PUBLIC_SNAPSHOT_MODE=false`。如果使用 Cloudflare Pages，请将构建命令设为 `npm run build`、输出目录设为 `dist`。

## 5. 登录与验收清单

1. 打开正式域名的 `/login`，使用刚创建的 Auth 用户登录。
2. 访问 `/admin`。若仍提示无管理员权限，核对当前登录邮箱对应的 `auth.users.id` 是否存在于 `public.user_roles`，并检查 `has_role` RPC 是否部署成功。
3. 依次验证数据概览、商品编辑、订单查询、卡密库、站点设置与黑名单。每项都要确认保存后数据库记录实际变化，再刷新页面验证持久化。
4. 在正式收款前完成支付回调验签、重复回调幂等、订单状态流转、卡密并发发放与 RLS 权限测试。

**重要：** 配好 Supabase 环境并不自动代表支付和自动发卡已经可用于生产。必须为所选支付渠道单独配置商户参数、回调地址和服务端验签逻辑，并完成真实/沙箱测试。

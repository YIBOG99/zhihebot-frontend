# 独立后端部署与后台启用指南

本项目是独立运行的 React/Vite 商城。源代码曾从其他平台导出，但线上运行不依赖该平台；新部署只需要自己的 Supabase 项目与 Cloudflare Pages/Workers 静态托管。

## 当前状态

- 前台快照模式默认开启：可在没有后端时展示导出的公开内容。
- 登录、订单、支付、卡密交付、管理操作需要独立 Supabase 后端完成配置。
- `/admin` 是完整管理后台入口；它不是免登录页面，必须使用 Supabase Auth 用户并拥有 `admin` 角色。
- `/boss` 是单独的老板数据看板，依赖 `boss-api` Edge Function 和 `BOSS_KEY`，不是商品/订单编辑后台。
- 支付方式界面当前按 **支付宝1、支付宝2、支付宝3、微信、USDT** 五种外部通道配置；登录用户还可能看到独立的站内余额支付入口。
- 支付宝1/2 可以上传二维码图片，并在后台用「从当前配置提取收款链接」本地解码；只有二维码内容本身包含可用的支付宝收款链接，手机端才会尝试深链唤起 App。图片上传本身无法凭空生成支付宝收银台链接。
- 个人码/手动转账/微信/USDT 没有自动对账接口，需后台人工核账确认；当前「退回余额」仅用于符合条件的余额支付订单，不等于支付宝/微信/USDT 原路退款。

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


## 2026-10-10 当前支付与账号验收状态

### 支付方式

- 前台通道配置已区分支付宝1（`payment.alipay_primary`）、支付宝2（`payment.alipay_qr`）、支付宝3（`payment.alipay`）、微信（`payment.wechat`）和 USDT（`payment.usdt`）；账户余额支付为额外的站内支付方式。
- 支付宝1、支付宝2使用收银页展示各自的收款码/链接。仅上传图片时只支持扫码；只有从图片中识别出的真实支付宝收款链接，才会显示「打开支付宝立即付款」按钮。深链会尝试唤起支付宝，但能否成功取决于链接有效性、手机系统、浏览器和支付宝版本，不承诺所有环境都可跳转。
- 深链仅接受 `qr.alipay.com`、`render.alipay.com`、`mobilecodec.alipay.com` 等明确允许的支付宝链接主机；普通网页 URL 不再被误当作支付链接。
- 个人收款码/微信码/USDT 地址属于转账型通道：页面展示和订单记录不等于支付自动核验。除非接入官方支付网关并成功收到服务端回调，否则不能声称已实现自动对账或自动发卡。
- 支付宝官方在线支付组件仍依赖 `alipay-pay` Edge Function、商户配置和服务端密钥；必须在目标 Supabase 项目中部署并验收后才可使用。

### 账号与管理后台

- 登录、注册页面代码存在；登录使用 Supabase Auth，注册要求邮箱验证码。是否可成功注册/登录取决于独立 Supabase URL/anon key、Auth 邮件模板/SMTP、数据库迁移和 RLS 均已配置。
- `login-lookup` Edge Function 可辅助旧用户名映射；部署前必须在目标项目验证函数权限、CORS、profiles 字段和服务角色密钥，且不得将 service-role key 暴露给浏览器。
- `/admin` 需要已登录的 Supabase 用户和 `user_roles` 中的管理员角色。仅有页面不代表后台已完成可登录验收。
- 退款、发卡和订单状态更新依赖数据库 RPC/触发器与服务端权限。未在目标项目执行并测试最终迁移前，不应处理真实订单或承诺退款可用。

### 发布门槛

- 本分支的 GitHub Actions 验证通过仅证明前端静态检查/构建通过，不代表生产环境支付、邮件、管理员权限、数据库迁移或 Cloudflare 部署已验证。
- 上线前须在独立 Supabase 项目完成：从空库按审定顺序初始化、配置 Auth 邮件、设置管理员角色、部署并配置 Edge Functions、用测试订单走通建单/支付回调/发卡/退款，再进行 Cloudflare Pages 生产部署和回归。

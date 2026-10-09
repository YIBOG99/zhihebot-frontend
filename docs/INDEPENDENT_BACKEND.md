# 独立后端部署与后台启用指南

本项目是独立运行的 React/Vite 商城。源代码曾从其他平台导出，但线上运行不依赖该平台；新部署只需要自己的 Supabase 项目与 Cloudflare Pages/Workers 静态托管。

## 当前状态

- 生产构建默认使用自己的 Supabase 公开数据；只有显式设置 `VITE_PUBLIC_SNAPSHOT_MODE=true` 才启用快照预览。
- 登录、订单、支付、卡密交付、管理操作需要独立 Supabase 后端完成配置。
- `/admin` 是管理后台入口；它不是免登录页面，必须使用 Supabase Auth 用户并拥有 `admin` 角色。支付设置现有独立 Tab，可分别编辑支付宝1/2/3、微信和 USDT。
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

## 当前目标 Supabase 项目

本次目标项目 URL 已指定为 `https://aqoryvygjavngcgkmuom.supabase.co`。将此 URL 与对应的 publishable/anon 公钥配置到前端部署平台的环境变量：

- `VITE_SUPABASE_URL=https://aqoryvygjavngcgkmuom.supabase.co`
- `VITE_SUPABASE_ANON_KEY`：使用该项目提供的 publishable key
- `VITE_PUBLIC_SNAPSHOT_MODE=false`

**注意：** publishable key 只用于浏览器公开客户端，不具备数据库管理员权限，不能用来执行 migration、创建管理员、设置 Edge Function secrets 或部署函数。上述操作需要 Supabase Dashboard/CLI 的项目权限以及适当的管理凭据。不要将 service-role key 放进前端变量或提交到 Git。

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
- `login-lookup` Edge Function 的开发分支版本已改为：服务端接收用户名与密码、在服务端调用 Supabase Auth 验证凭据，只向浏览器返回会话令牌，不返回账号邮箱。部署最新函数前，用户名登录会因前后端协议不一致而失败；发布时必须同步部署前端与函数，并确认 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_ANON_KEY` secrets 已设置。不得将 service-role key 暴露给浏览器。
- `/admin` 需要已登录的 Supabase 用户和 `user_roles` 中的管理员角色。使用 `docs/ADMIN_BOOTSTRAP.md` 将已验证邮箱的 Auth 用户提升为 admin；仅有页面不代表后台已完成可登录验收。
- 退款、发卡和订单状态更新依赖数据库 RPC/触发器与服务端权限。未在目标项目执行并测试最终迁移前，不应处理真实订单或承诺退款可用。

### 发布门槛

- 本分支的 GitHub Actions 验证通过仅证明前端静态检查/构建通过，不代表生产环境支付、邮件、管理员权限、数据库迁移或 Cloudflare 部署已验证。
- 上线前须在独立 Supabase 项目完成：从空库按审定顺序初始化、配置 Auth 邮件、设置管理员角色、部署并配置 Edge Functions、用测试订单走通建单/支付回调/发卡/退款，再进行 Cloudflare Pages 生产部署和回归。


## 本次独立商城改造补充

- 新增 migration: migrations/20261010_000100_independent_shop_auth_payment_audit.sql，为 profiles.email、订单支付确认审计字段和退款审计表补齐结构，并让 Auth 新用户触发器保存邮箱。该 migration 尚需应用到目标 Supabase 项目后才会生效。
- /admin 的「支付设置」已独立成 Tab，分别配置支付宝1（二维码与可选付款链接）、支付宝2、支付宝3、微信收款码和 USDT 地址/网络。
- 支付宝1可分开保存二维码与付款链接。收银页仅对可信支付宝收款链接生成付款二维码并尝试手机深链；图片或普通网站链接不会伪装成可唤起的支付链接。
- 后台「退回余额」继续由 wallet_refund_order 完成真实余额操作；成功后额外写入 order_refunds 审计记录。若新 migration 尚未应用，钱包退款流水仍是权威记录，订单审计表写入会告警而不回滚已完成退款。


## 管理员启用与用户名登录协议

- 管理员授予步骤见 [ADMIN_BOOTSTRAP.md](./ADMIN_BOOTSTRAP.md)。必须先通过网站注册并验证邮箱，再由 Supabase SQL Editor 向 `public.user_roles` 添加 `admin` 角色。
- 用户名登录依赖最新版本的 `functions/login-lookup/index.ts`；函数在服务端校验密码，不再向浏览器返回邮箱。前端和 Edge Function 必须同步部署；部署前需要通过目标项目的实际登录回归测试。
- 代码仓库变更无法自行设置 Supabase secrets、部署 Edge Functions、应用 migration 或创建实际管理员账号。这些属于目标 Supabase 项目的部署/配置步骤，当前不能宣称已经在线完成。

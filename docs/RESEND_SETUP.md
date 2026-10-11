# Resend 邮件接入指南

本项目是 React/Vite 前端，认证由 Supabase Auth 负责，静态站点部署在 Cloudflare Pages/Workers。**不要在前端调用 Resend，也不要把 Resend API Key 写入 Git。**

## 邮件发送架构

- 注册验证码：继续使用 Supabase Auth 的 `signUp` + `verifyOtp(type: 'signup')`。
- 登录邮箱验证码：使用 Supabase Auth 的 `signInWithOtp` + `verifyOtp(type: 'email')`，仅允许已有用户登录（`shouldCreateUser: false`）。
- 邮件投递：在 Supabase Auth 的服务器端 SMTP 设置中使用 Resend SMTP。这样验证码由 Supabase Auth 生成、验证和限流，Resend 负责投递。
- 普通通知邮件：由 Supabase Edge Function `send-notification` 调用 Resend API。此函数只允许已登录且拥有 admin 角色的用户向指定收件人发送通知，不能从浏览器直接访问 Resend API。

## 1. 配置 Resend SMTP（注册/登录验证码）

在 Resend 中确认域名 `zhihebot.shop` 为 Verified，并使用发件人：

`ZhiheBot <noreply@zhihebot.shop>`

在 Supabase Dashboard 打开 Authentication / SMTP Settings（菜单名称可能随 Dashboard 版本略有变化），启用自定义 SMTP，填写：

- Host：`smtp.resend.com`
- Port：`465`（SSL）或 `587`（STARTTLS）
- Username：`resend`
- Password：Resend API Key（仅填写在 Supabase 的 SMTP 密码字段）
- Sender email：`noreply@zhihebot.shop`
- Sender name：`ZhiheBot`

不要把 SMTP 密码复制到 GitHub、Cloudflare 的 `VITE_*` 变量或浏览器代码。

在 Supabase Authentication 的 Email Templates 中检查确认邮件模板，确保模板包含 6 位验证码变量（例如 `{{ .Token }}`），而不是只发送确认链接。注册代码当前调用 `verifyOtp({ email, token, type: 'signup' })`，因此邮件模板与 OTP 流程必须一致。登录验证码邮件也使用 Supabase Auth 的邮件模板设置。

同时在 Supabase Authentication 的 URL Configuration 中设置正式站点 Site URL，并把 `https://zhihebot.shop/auth/callback` 加入允许的 Redirect URLs；如实际使用 www 子域名，也要加入对应地址。

## 2. 配置通知邮件 Edge Function

在你自己的 Supabase 项目中设置以下 Edge Function secrets（Dashboard 的 Edge Functions / Secrets，或安全的 Supabase CLI secrets 流程）：

- `RESEND_API_KEY`：Resend API Key，建议使用仅有发送权限的 key。
- `RESEND_FROM_EMAIL`：`ZhiheBot <noreply@zhihebot.shop>`
- `SUPABASE_URL`：当前 Supabase 项目的 URL。
- `SUPABASE_ANON_KEY`：该项目的公开 anon/publishable key。
- `SUPABASE_SERVICE_ROLE_KEY`：该项目的 service-role key，只能存在于 Supabase Function secrets。

部署函数目录 `functions/send-notification` 到同一个 Supabase 项目，函数名为 `send-notification`。不要将任何 secret 加入仓库或 Cloudflare 前端变量。

函数当前是管理员受限的通知发送接口；它提供安全的服务器端发信能力，但**不会自动订阅订单或注册事件**。若要自动发送订单付款、发货等通知，需要把函数调用接到相应的服务端业务事件中，并在测试环境验证后发布。

## 3. Cloudflare Pages 前端变量

前端只保留公开配置：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PUBLIC_SNAPSHOT_MODE=false`

不要创建 `VITE_RESEND_API_KEY`，也不要把 Resend API Key、Supabase service-role key 或 SMTP 密码放进任何 `VITE_*` 变量。

## 4. 验收步骤

1. 在 Supabase Authentication 中确认自定义 SMTP 已启用，且发件人地址与已验证域名一致。
2. 在正式域名 `https://zhihebot.shop/register` 用你控制的测试邮箱注册，确认收到 6 位验证码并成功验证。
3. 在 `/login` 切换到邮箱验证码登录，确认已有账号可以收到验证码并登录；对未注册邮箱不应自动创建账号。
4. 使用管理员登录后，从受信任的管理员界面/服务端调用 `send-notification`，向自己控制的测试邮箱发送普通通知。
5. 检查 Resend Logs 与 Supabase Auth logs。不要在日志里记录验证码、API Key、密码或邮件正文。
6. 验证未登录用户和非管理员不能调用通知发送函数。

仅提交 GitHub 代码不会自动设置 Supabase secrets、SMTP、部署 Edge Function 或发布 Cloudflare Pages；这些步骤必须在对应控制台完成。

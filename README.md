# 知禾机器人商城（独立部署版）

本项目是独立运行的 React + Vite 商城前端。源码最初由其他平台导出，但当前部署不依赖该平台；请使用自己的 Supabase 后端和 Cloudflare 静态托管。

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

开发服务器默认端口为 `3015`。生产构建与类型检查：

```bash
npm run build
npm run typecheck
```

## 部署与后端

- 前台默认从本项目 Supabase 读取公开数据；只有显式设置 `VITE_PUBLIC_SNAPSHOT_MODE=true` 时才展示仓库内的只读快照。
- 生产环境必须配置自己的 Supabase URL/anon key，并保持 `VITE_PUBLIC_SNAPSHOT_MODE=false`。缺少后端配置时，公开页面可能回退到快照，但登录、建单及后台操作不可用。
- 管理后台入口是 `/admin`，需要 Supabase Auth 用户与 `public.user_roles` 中的 admin 角色。
- `/boss` 是独立的老板数据看板，不等同于商城管理后台。
- `wrangler.jsonc` 使用 `dist/` 作为静态资源目录。

请先阅读 [独立后端部署与后台启用指南](docs/INDEPENDENT_BACKEND.md)，按顺序部署数据库迁移与 Edge Functions，并完成后台验收后再开放交易。

## 安全提醒

不要提交 `.env.local`、service-role key、支付商户私钥或 webhook 密钥。任何 `VITE_*` 环境变量都会被打包到浏览器端，只能放可公开的配置值。

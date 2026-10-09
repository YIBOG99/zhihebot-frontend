# 管理员账号启用

此步骤用于你自己的 Supabase 项目。它**不会创建登录密码**，也不会让未登录用户获得管理员权限。

## 1. 先注册一个专用管理员账号

1. 在已部署的商城打开 `/register`，用你控制的邮箱注册。
2. 收到验证码后完成邮箱验证，并确认可以在 `/login` 正常登录。
3. 记下注册邮箱。建议为后台使用单独的邮箱，开启邮箱本身的多重验证，并使用独立强密码。

## 2. 在 Supabase SQL Editor 授予 admin 角色

打开目标项目的 **SQL Editor**，确认当前项目是正式商城使用的那个项目，然后把下面的邮箱替换成注册时的邮箱并执行。该语句只会给已存在的 Auth 用户添加 `admin` 角色；如果邮箱不存在，会明确报错，不会默默创建任何账号。

```sql
DO $$
DECLARE
  target_email text := lower(btrim('REPLACE_WITH_ADMIN_EMAIL'));
  target_user_id uuid;
BEGIN
  IF target_email = '' OR target_email = 'replace_with_admin_email' THEN
    RAISE EXCEPTION '请先把 REPLACE_WITH_ADMIN_EMAIL 替换成实际管理员邮箱';
  END IF;

  SELECT id
    INTO target_user_id
    FROM auth.users
   WHERE lower(email) = target_email
   LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth 用户不存在；请先在网站完成注册与邮箱验证';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- 验证角色已赋予（应返回一行，role = admin）
SELECT u.email, r.role
  FROM auth.users AS u
  JOIN public.user_roles AS r ON r.user_id = u.id
 WHERE lower(u.email) = lower('REPLACE_WITH_ADMIN_EMAIL')
   AND r.role = 'admin'::public.app_role;
```

## 3. 验证后台访问

1. 退出商城并重新登录管理员账号。
2. 打开 `/admin`，确认能看到概览与后台栏目。
3. 测试前先确认数据库迁移已按审定顺序应用，且 RLS 规则已经创建。

若 SQL 报错提示 `public.user_roles`、`public.app_role` 或 `public.has_role` 不存在，说明目标数据库初始化不完整。不要通过关闭 RLS 或将 service-role key 放到前端绕过错误；先完成经审核的数据库初始化。

## 安全注意事项

- 不要把登录密码、Supabase service-role key、支付宝商户私钥或 webhook 密钥提交到 Git。
- 只给你自己控制的邮箱授予管理员角色；不要把此 SQL 放进公开注册流程。
- 新角色只对目标 Supabase 项目生效，不会自动同步到其他环境。
- 添加 admin 只完成授权，不代表付款、退款、卡密发放或生产部署已经通过验收。

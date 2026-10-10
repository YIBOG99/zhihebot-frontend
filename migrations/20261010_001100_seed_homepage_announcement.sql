-- Seed a safe, editable homepage announcement for new installations.
INSERT INTO public.site_settings (key, value, updated_at)
VALUES (
  'announcement',
  jsonb_build_object(
    'enabled', true,
    'title', '欢迎来到智核',
    'subtitle', '精选数字权益与 AI 工具商品，购买前请仔细阅读商品说明。',
    'cta_label', '我知道了，进入商城',
    'snooze_label', '24 小时内不再提醒',
    'snooze_hours', 24,
    'official_url', 'https://zhihebot.shop',
    'security_note', '请认准官方网址，谨防仿冒；任何人都不会向你索取账号密码或验证码。',
    'warning_note', '数字商品交付时间与售后范围以商品详情和订单状态为准。',
    'links', '[]'::jsonb
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
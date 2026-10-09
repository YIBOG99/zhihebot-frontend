-- Never use the exported Meoo template's legacy contact details or payment credentials
-- as the live independent shop's defaults. This is deliberately narrow: only values that
-- exactly match the known template defaults are cleared; merchant values configured later
-- are kept intact. Review site_settings after applying all seed migrations.

UPDATE public.site_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(value, '{alipay,account}', '""'::jsonb, true),
    '{alipay,name}', '""'::jsonb, true),
  '{alipay,note}', '""'::jsonb, true)
WHERE key = 'payment'
  AND value->'alipay'->>'account' = 'zhihe999@outlook.com';

UPDATE public.site_settings
SET value = jsonb_set(value, '{usdt,address}', '""'::jsonb, true)
WHERE key = 'payment'
  AND value->'usdt'->>'address' = 'XU6YcNKqAqxGZrLbs0P5bHh8svtkaeGGit';

UPDATE public.site_settings
SET value = jsonb_set(
  jsonb_set(value, '{wechat,account_name}', '""'::jsonb, true),
  '{wechat,note}', '""'::jsonb, true)
WHERE key = 'payment'
  AND value->'wechat'->>'account_name' = '智核数字服务'
  AND value->'wechat'->>'qr_url' = ''
  AND value->'wechat'->>'note' LIKE '请添加店主微信后转账%';

-- Remove template contact routes only when they still exactly match the exported defaults.
UPDATE public.site_settings
SET value =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(value, '{wechat}', '""'::jsonb, true),
        '{qq}', '""'::jsonb, true),
      '{email}', '""'::jsonb, true),
    '{workTime}', '""'::jsonb, true)
WHERE key = 'contact'
  AND value->>'wechat' = 'zhihe-service'
  AND value->>'qq' = '88001234'
  AND value->>'email' = 'support@zhihe.shop';

-- The exported announcement points at an old Meoo hostname. Disable that default
-- announcement and replace its official URL, rather than silently promoting the old domain.
UPDATE public.site_settings
SET value = jsonb_set(
  jsonb_set(value, '{enabled}', 'false'::jsonb, true),
  '{official_url}', '"https://zhihebot.shop"'::jsonb, true)
WHERE key = 'announcement'
  AND value->>'official_url' = 'nl8068w5.meoo.info';

-- AI customer support was explicitly retired from this independent storefront.
DELETE FROM public.site_settings WHERE key = 'ai_support';

-- Replace the exact legacy AI-recharge brand/SEO seed with generic digital-goods copy.
-- Do not overwrite operator-customized branding.
UPDATE public.site_settings
SET value = jsonb_set(
  jsonb_set(value, '{slogan}', '"数字商品自助商城"'::jsonb, true),
  '{subtitle}', '"数字商品 · 订单可查 · 安全交付"'::jsonb, true)
WHERE key = 'brand'
  AND value->>'slogan' = 'AI 会员自助充值商城'
  AND value->>'subtitle' = '海外 AI 订阅 · 正规渠道 · 自动发卡';

UPDATE public.site_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(value, '{title}', '"智核数字商品商城"'::jsonb, true),
    '{description}', '"数字商品在线选购、订单查询与安全交付。"'::jsonb, true),
  '{keywords}', '"数字商品,虚拟商品,订单查询,卡密"'::jsonb, true)
WHERE key = 'seo'
  AND value->>'title' = '智核 · AI 会员自助充值商城'
  AND value->>'description' = 'ChatGPT Plus / Pro、Claude Pro / Max、Grok Super、Gemini AI Pro 等海外 AI 订阅正规渠道代充，自动发卡、订单可查、售后有保障。';

UPDATE public.site_settings
SET value = jsonb_set(value, '{tagline}', '"DIGITAL GOODS · SECURE DELIVERY"'::jsonb, true)
WHERE key = 'branding'
  AND value->>'tagline' = 'AI 会员自助充值';

-- Empty values are intentionally not real payment settings. The operator must upload the
-- current QR codes, enter merchant-approved payment URLs and verify the USDT network/address
-- in /admin before accepting payments.

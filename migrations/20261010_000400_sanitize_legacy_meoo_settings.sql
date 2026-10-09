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

-- Empty values are intentionally not real payment settings. The operator must upload the
-- current QR codes, enter merchant-approved payment URLs and verify the USDT network/address
-- in /admin before accepting payments.

-- Configure the three community/support cards in the homepage announcement popup.
UPDATE public.site_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{links}',
  jsonb_build_array(
    jsonb_build_object(
      'label', 'QQ 交流通知群',
      'description', '点击尝试唤起 QQ，直达加群页面',
      'action', 'qq_group',
      'icon', 'qq',
      'url', 'https://qun.qq.com/universal-share/share?ac=1&authKey=otAIsPrJJlvqLPIQXE%2FQ2rfB2hsBN3TA1vHpu3k10KR2wfgNNd2b9Z7NFrzk4l9v&busi_data=eyJncm91cENvZGUiOiI5MDcxMDQ4NjAiLCJ0b2tlbiI6IkpQWWpDZnJhWUtDMlcwL3FVM3htN09Bc3d2Tmh1cjBrMFJaYTdCQnlsV2l6Z1VabXYybnZDR0FOWDdrOXQ5dVIiLCJ1aW4iOiIzMjU5NTU1NjM0In0%3D&data=uExYlCqRJfqIRxHaXtw6b37u1zgp34O4ZzfSyIk1b0hz5LxvhGH8H70D9jAlvA-8QYqSiP6H5GxLM18zelW-oA&svctype=4&tempid=h5_group_info',
      'account_id', '907104860'
    ),
    jsonb_build_object(
      'label', '微信客服',
      'description', '点击查看客服微信号并复制添加',
      'action', 'wechat',
      'icon', 'chat',
      'url', '',
      'account_id', 'zhihe-service'
    ),
    jsonb_build_object(
      'label', 'Telegram 交流群',
      'description', '请在后台配置 Telegram 群邀请链接',
      'action', 'url',
      'icon', 'telegram',
      'url', ''
    )
  ),
  true
),
updated_at = now()
WHERE key = 'announcement';

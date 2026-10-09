-- Provision the two user-supplied, verified Alipay QR images as safe defaults.
-- Existing non-empty merchant configuration always wins; no credentials are embedded here.
INSERT INTO public.site_settings (key, value)
VALUES (
  'payment',
  jsonb_build_object(
    'alipay_primary', jsonb_build_object(
      'qr_url', '/payment-codes/payment-qr-1.png',
      'pay_url', 'https://qr.alipay.com/fkx1539453hgmrbkkrl0e84',
      'name', '支付宝1',
      'note', '付款后请保留订单号，店主核账后发货。'
    ),
    'alipay_qr', jsonb_build_object(
      'qr_url', '/payment-codes/payment-qr-2.png',
      'name', '支付宝2',
      'note', '付款时请备注订单号，店主核账后发货。'
    )
  )
)
ON CONFLICT (key) DO UPDATE
SET value = public.site_settings.value
  || jsonb_build_object(
    'alipay_primary',
    (COALESCE(public.site_settings.value->'alipay_primary', '{}'::jsonb)
      || jsonb_build_object(
        'qr_url', COALESCE(NULLIF(public.site_settings.value->'alipay_primary'->>'qr_url', ''), '/payment-codes/payment-qr-1.png'),
        'pay_url', COALESCE(NULLIF(public.site_settings.value->'alipay_primary'->>'pay_url', ''), 'https://qr.alipay.com/fkx1539453hgmrbkkrl0e84'),
        'name', COALESCE(NULLIF(public.site_settings.value->'alipay_primary'->>'name', ''), '支付宝1'),
        'note', COALESCE(NULLIF(public.site_settings.value->'alipay_primary'->>'note', ''), '付款后请保留订单号，店主核账后发货。')
      )),
    'alipay_qr',
    (COALESCE(public.site_settings.value->'alipay_qr', '{}'::jsonb)
      || jsonb_build_object(
        'qr_url', COALESCE(NULLIF(public.site_settings.value->'alipay_qr'->>'qr_url', ''), '/payment-codes/payment-qr-2.png'),
        'name', COALESCE(NULLIF(public.site_settings.value->'alipay_qr'->>'name', ''), '支付宝2'),
        'note', COALESCE(NULLIF(public.site_settings.value->'alipay_qr'->>'note', ''), '付款时请备注订单号，店主核账后发货。')
      ))
  ),
  updated_at = now();

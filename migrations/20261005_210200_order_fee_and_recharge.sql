-- ============================================
-- 支付宝通道手续费 + 余额充值商品 + 订单金额口径扩展
-- 需求：三个支付宝通道按商品价加收 4.6% 渠道手续费，其余通道免手续费；
--       费率与最终金额由服务端建单时算定并落库，前端显示 / 支付宝收款 / 后台看到三者永远一致。
-- ============================================

-- 1) orders 加三列：商品小计、渠道手续费、是否充值类订单
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS goods_amount NUMERIC(12,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS channel_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_recharge BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.orders.channel_fee IS '渠道手续费（仅支付宝类通道 >0），amount = goods_amount - discount + channel_fee';
COMMENT ON COLUMN public.orders.is_recharge IS 'true = 余额充值订单，到账后入钱包而非发卡';

-- 2) site_settings 新增计费与推荐配置（默认值即用户要求的口径）
INSERT INTO public.site_settings (key, value)
VALUES ('billing', '{"alipay_fee_rate": 4.6, "fee_enabled": true}'::JSONB)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.site_settings (key, value)
VALUES ('recommend', '{"enabled": true, "note": "推荐使用支付宝付款，到账最快", "label": "优先推荐"}'::JSONB)
ON CONFLICT (key) DO NOTHING;

-- 3) 分类「余额充值」（必须先于商品插入，products.category_slug 有外键约束）
INSERT INTO public.categories (slug, name, description, sort_order)
VALUES ('recharge', '余额充值', '提前充值存好余额，下单时用余额支付，免渠道手续费、秒发货', 5)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 4) 余额充值商品（固定四档 + 自定义）。自定义档走 price=1 作为最小单位，
--    下单时以 quantity 表示充值元数（上限 10 沿用现有数量约束 → 单笔最多 ¥10）。
INSERT INTO public.products (id, category_slug, badge, title, subtitle, price, original_price,
  cover_url, delivery_method, stock_level, sold_base, tips_title, tips_body,
  official_title, support_title, faq, payment_methods, is_active, is_hot, sort_order, redeem_url)
VALUES
  ('recharge-50',  'recharge', '余额', '账户余额充值 ¥50',  '充值的金额直接进入账户余额，可用于站内支持余额支付的商品', 50,  NULL,
   NULL, 'auto', 'many', 0, '充值说明', '余额仅限在本站内消费使用，不可提现、不可转让、不计利息。', '退款政策', '常见问题',
   '[{"q":"余额可以到期限后退吗？","a":"余额长期有效，不设过期时间，但不可提现。"},{"q":"充值需要手续费吗？","a":"用支付宝充值同样按页面标示收取渠道手续费，微信与 USDT 免手续费。"}]'::JSONB,
   '["balance","alipay","wechat","alipay_qr","usdt","alipay_manual"]'::JSONB, true, false, 100, NULL),
  ('recharge-100', 'recharge', '余额', '账户余额充值 ¥100', '充值的金额直接进入账户余额，可用于站内支持余额支付的商品', 100, NULL,
   NULL, 'auto', 'many', 0, '充值说明', '余额仅限在本站内消费使用，不可提现、不可转让、不计利息。', '退款政策', '常见问题',
   '[{"q":"余额可以到期限后退吗？","a":"余额长期有效，不设过期时间，但不可提现。"},{"q":"充值需要手续费吗？","a":"用支付宝充值同样按页面标示收取渠道手续费，微信与 USDT 免手续费。"}]'::JSONB,
   '["balance","alipay","wechat","alipay_qr","usdt","alipay_manual"]'::JSONB, true, false, 101, NULL),
  ('recharge-200', 'recharge', '余额', '账户余额充值 ¥200', '充值的金额直接进入账户余额，可用于站内支持余额支付的商品', 200, NULL,
   NULL, 'auto', 'many', 0, '充值说明', '余额仅限在本站内消费使用，不可提现、不可转让、不计利息。', '退款政策', '常见问题',
   '[{"q":"余额可以到期限后退吗？","a":"余额长期有效，不设过期时间，但不可提现。"},{"q":"充值需要手续费吗？","a":"用支付宝充值同样按页面标示收取渠道手续费，微信与 USDT 免手续费。"}]'::JSONB,
   '["balance","alipay","wechat","alipay_qr","usdt","alipay_manual"]'::JSONB, true, true, 102, NULL),
  ('recharge-500', 'recharge', '余额', '账户余额充值 ¥500', '充值的金额直接进入账户余额，可用于站内支持余额支付的商品', 500, NULL,
   NULL, 'auto', 'many', 0, '充值说明', '余额仅限在本站内消费使用，不可提现、不可转让、不计利息。', '退款政策', '常见问题',
   '[{"q":"余额可以到期限后退吗？","a":"余额长期有效，不设过期时间，但不可提现。"},{"q":"充值需要手续费吗？","a":"用支付宝充值同样按页面标示收取渠道手续费，微信与 USDT 免手续费。"}]'::JSONB,
   '["balance","alipay","wechat","alipay_qr","usdt","alipay_manual"]'::JSONB, true, false, 103, NULL),
  ('recharge-custom', 'recharge', '余额', '账户余额自定义充值', '按件计价，1 件 = ¥1，可自由组合充值金额', 1, NULL,
   NULL, 'auto', 'many', 0, '充值说明', '余额仅限在本站内消费使用，不可提现、不可转让、不计利息。', '退款政策', '常见问题',
   '[{"q":"可以充多少？","a":"单笔 ¥1 至 ¥10，如需更多请分多次充值或选择固定档位。"}]'::JSONB,
   '["balance","alipay","wechat","alipay_qr","usdt","alipay_manual"]'::JSONB, true, false, 104, NULL)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, price = EXCLUDED.price,
  payment_methods = EXCLUDED.payment_methods, is_active = true, updated_at = NOW();

-- 5) 全站商品支付方式白名单补 balance（除订阅代充类外均可用余额）
--    判定口径：delivery_method='auto' 且 id 不以 'sub-' 开头的商品开放余额支付。
UPDATE public.products
   SET payment_methods = payment_methods || '["balance"]'::JSONB,
       updated_at = NOW()
 WHERE delivery_method = 'auto'
   AND id NOT LIKE 'sub-%'
   AND NOT (payment_methods @> '["balance"]'::JSONB);

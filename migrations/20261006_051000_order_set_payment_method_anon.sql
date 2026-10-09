-- ============================================
-- 修正 order_set_payment_method：允许「未登录游客单」更换支付方式
-- 背景：本商城主流程是游客下单（凭订单号+联系方式+查询密码取货），
--       上一版用 auth.uid() 做硬守卫，导致游客在建单后的「选择支付方式」屏
--       点任何通道都会被拒（"请先登录后再更换支付方式"），流程直接卡死。
-- 新口径：未登录时改为校验「查询密码」——与查单页同一把钥匙。
--       服务端只比对 SHA-256 摘要（lookup_password_hash 存的就是摘要），
--       不接触明文；顾客在确认订单页设置过该密码，本机 buyer-vault 也存了掩码，
--       因此前端可无感带上。已登录用户仍额外要求 user_id 归属本人。
-- 其余逻辑（费率读取、手续费公式、状态守卫、时间线留痕）保持不变。
-- 参数列表新增第 3 个 → 必须 DROP 旧签名，否则 42725 function is not unique。
-- ============================================

DROP FUNCTION IF EXISTS public.order_set_payment_method(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.order_set_payment_method(
  _order_id TEXT,
  _method TEXT,
  _lookup_password_hash TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  o RECORD;
  c JSONB;
  m TEXT;
  rate NUMERIC(8,6);
  fee_on BOOLEAN;
  fee NUMERIC(10,2);
  goods NUMERIC(10,2);
  disc NUMERIC(10,2);
  uid UUID;
BEGIN
  m := lower(btrim(coalesce(_method, '')));
  -- wechat 也在内：本通道免手续费，但必须把通道写回订单，否则后台订单列表
  -- 的支付方式列会一直空着（建单时 payment_method 为 NULL）。
  IF m NOT IN ('alipay', 'alipay_qr', 'alipay_manual', 'wechat', 'usdt') THEN
    RETURN '该支付方式不可用，请重新选择';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = btrim(_order_id) FOR UPDATE;
  IF NOT FOUND THEN RETURN '订单不存在'; END IF;
  IF o.card_secret IS NOT NULL THEN RETURN '订单已完成发货，无法更换支付方式'; END IF;
  IF o.status NOT IN ('pending_payment', 'pay_processing') THEN
    RETURN '该订单当前状态无法更换支付方式';
  END IF;

  -- 归属校验：登录单看 user_id；游客单看查询密码摘要
  uid := auth.uid();
  IF uid IS NOT NULL THEN
    IF o.user_id IS DISTINCT FROM uid THEN RETURN '无权操作该订单'; END IF;
  ELSE
    IF o.user_id IS NOT NULL THEN RETURN '该订单需登录原账号后更换支付方式'; END IF;
    IF _lookup_password_hash IS NULL OR length(_lookup_password_hash) <> 64
       OR o.lookup_password_hash IS NULL
       OR _lookup_password_hash <> o.lookup_password_hash THEN
      RETURN '身份校验未通过，请返回重新输入查询密码';
    END IF;
  END IF;

  -- 手续费率：与 order_create 同一份配置、同一套非法值回退规则
  SELECT s.value INTO c FROM public.site_settings s WHERE s.key = 'billing';
  fee_on := coalesce((c->>'fee_enabled')::BOOLEAN, true);
  rate := coalesce((c->>'alipay_fee_rate')::NUMERIC, 4.6);
  IF rate < 0 OR rate > 20 THEN rate := 4.6; END IF;

  goods := coalesce(o.goods_amount, round(o.amount + coalesce(o.discount_amount, 0), 2));
  disc := coalesce(o.discount_amount, 0);
  IF fee_on AND m IN ('alipay', 'alipay_qr', 'alipay_manual') THEN
    fee := round(round(goods - disc, 2) * rate / 100, 2);
  ELSE
    fee := 0;
  END IF;

  UPDATE public.orders
     SET payment_method = m,
         goods_amount = goods,
         channel_fee = fee,
         amount = round(goods - disc + fee, 2),
         timeline = timeline || jsonb_build_object('at', now(), 'label', '更换支付方式：' || m),
         updated_at = NOW()
   WHERE id = o.id;

  RETURN NULL; -- NULL = 成功
EXCEPTION WHEN OTHERS THEN
  RETURN '更换失败：' || SQLERRM;
END;
$func$;

REVOKE ALL ON FUNCTION public.order_set_payment_method(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_set_payment_method(TEXT, TEXT, TEXT) TO anon, authenticated;

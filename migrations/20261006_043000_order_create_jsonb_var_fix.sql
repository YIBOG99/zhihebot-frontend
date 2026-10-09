-- ============================================
-- 修复 order_create 建单必然失败（线上「提交订单失败，无法创建订单」根因）
-- 根因：DECLARE 段把 c 声明成 RECORD，而函数体用 (c->>'enabled') / (c->>'fee_enabled')
--       这类 JSONB 操作符读取 site_settings.value。PL/pgSQL 在运行到该行时报
--       [42883] operator does not exist: record ->> unknown —— 未捕获异常直接抛出，
--       于是所有下单请求全部失败（手续费改造上线后一单都没建成）。
-- 修法：c 改为 JSONB（site_settings.value 本身就是 JSONB）；o 保持 RECORD
--       （它承接 referral_rewards / challenge 的整行记录，不能改）。
-- 参数列表未变 → CREATE OR REPLACE 直接生效，无需 DROP。
-- ============================================

CREATE OR REPLACE FUNCTION public.order_create(
  _id TEXT,
  _product_id TEXT,
  _product_snapshot JSONB,
  _quantity INT,
  _contact_email TEXT,
  _contact_phone TEXT,
  _lookup_password_hash TEXT,
  _note TEXT,
  _amount NUMERIC,
  _coupon_code TEXT DEFAULT NULL,
  _challenge_id TEXT DEFAULT NULL,
  _challenge_answer TEXT DEFAULT NULL,
  _payment_method TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, order_id TEXT, message TEXT, discount NUMERIC, fee NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  p RECORD;
  o RECORD;
  c JSONB;                 -- ⚠️ 必须是 JSONB：site_settings.value，旧版误写成 RECORD 导致 ->> 报错
  total NUMERIC(10,2);
  disc NUMERIC(10,2) := 0;
  fee NUMERIC(10,2) := 0;
  payable NUMERIC(10,2);
  rate NUMERIC(8,6);
  fee_on BOOLEAN;
  uid UUID;
  method TEXT;
  cap_max INT;
  cap_window INT;
  recent INT;
BEGIN
  IF _id IS NULL OR _id !~ '^ZH\d{8}[A-Z0-9]{6}$' THEN
    RETURN QUERY SELECT false, NULL::TEXT, '订单号格式不正确', 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  IF _lookup_password_hash IS NULL OR length(_lookup_password_hash) <> 64 THEN
    RETURN QUERY SELECT false, NULL::TEXT, '查询密码无效', 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  IF (_contact_email IS NULL OR btrim(_contact_email) = '')
     AND (_contact_phone IS NULL OR btrim(_contact_phone) = '') THEN
    RETURN QUERY SELECT false, NULL::TEXT, '请至少填写邮箱或手机号', 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  -- 黑名单拦截（服务端强制，前端无法绕过）
  IF EXISTS (
    SELECT 1 FROM public.blocked_customers b
     WHERE b.is_active
       AND (
         (b.contact_type = 'email' AND b.contact_value = lower(btrim(coalesce(_contact_email, ''))))
         OR (b.contact_type = 'phone' AND b.contact_value = btrim(regexp_replace(coalesce(_contact_phone, ''), '[^0-9+]', '', 'g')))
       )
       AND (nullif(lower(btrim(coalesce(_contact_email, ''))), '') IS NOT NULL
            OR nullif(btrim(regexp_replace(coalesce(_contact_phone, ''), '[^0-9+]', '', 'g')), '') IS NOT NULL)
  ) THEN
    RETURN QUERY SELECT false, NULL::TEXT, '您暂时无法下单，请联系客服处理', 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  SELECT * INTO p FROM public.products WHERE id = _product_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, '商品不存在或已下架', 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  IF _quantity IS NULL OR _quantity < 1 OR _quantity > 10 THEN
    RETURN QUERY SELECT false, NULL::TEXT, '购买数量需在 1-10 之间', 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  total := round(p.price * _quantity, 2);

  uid := auth.uid();

  -- 余额充值商品：必须登录，且不允许用余额支付充值单（防止空转）
  IF _product_id LIKE 'recharge-%' THEN
    IF uid IS NULL THEN
      RETURN QUERY SELECT false, NULL::TEXT, '请先登录后再充值余额', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    IF coalesce(_payment_method, '') = 'balance' THEN
      RETURN QUERY SELECT false, NULL::TEXT, '余额充值不能使用余额支付', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
  END IF;

  -- 人机校验：一次性凭证核验（沿用 challenge 表 + digest_hex 比对 + used_at 作废）
  SELECT s.value INTO c FROM public.site_settings s WHERE s.key = 'captcha';
  IF coalesce((c->>'enabled')::BOOLEAN, false) THEN
    IF _challenge_id IS NULL OR btrim(_challenge_id) = ''
       OR _challenge_answer IS NULL OR btrim(_challenge_answer) = '' THEN
      RETURN QUERY SELECT false, NULL::TEXT, '请先完成安全验证码校验', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    SELECT * INTO o FROM public.order_captcha_challenges
     WHERE id = _challenge_id AND used_at IS NULL AND expires_at > NOW()
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::TEXT, '验证码已失效，请刷新后重新输入', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    IF o.answer_hash <> public.digest_hex(upper(btrim(_challenge_answer))) THEN
      UPDATE public.order_captcha_challenges SET used_at = NOW() WHERE id = _challenge_id;
      RETURN QUERY SELECT false, NULL::TEXT, '验证码不正确，请重新输入', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    UPDATE public.order_captcha_challenges SET used_at = NOW() WHERE id = _challenge_id;

    -- 联系方式时间窗频控（防机器批量下单后退款）
    cap_max := coalesce((c->>'cap_max')::INT, 5);
    cap_window := coalesce((c->>'cap_window_minutes')::INT, 60);
    SELECT count(*) INTO recent FROM public.orders
     WHERE created_at > NOW() - make_interval(mins => cap_window)
       AND ((nullif(btrim(coalesce(_contact_email, '')), '') IS NOT NULL
             AND lower(contact_email) = lower(btrim(_contact_email)))
         OR (nullif(btrim(coalesce(_contact_phone, '')), '') IS NOT NULL
             AND contact_phone = btrim(_contact_phone)));
    IF recent >= cap_max THEN
      RETURN QUERY SELECT false, NULL::TEXT, '短时间内下单次数过多，请稍后再试', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
  END IF;

  -- 奖励券核销
  IF _coupon_code IS NOT NULL AND btrim(_coupon_code) <> '' THEN
    IF uid IS NULL THEN
      RETURN QUERY SELECT false, NULL::TEXT, '请先登录后再使用奖励券', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    UPDATE public.referral_rewards
       SET status = 'used', used_at = NOW()
     WHERE code = upper(btrim(_coupon_code)) AND inviter_id = uid AND status = 'available'
     RETURNING * INTO o;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::TEXT, '奖励券无效或已被使用', 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    IF total < o.min_amount THEN
      UPDATE public.referral_rewards SET status = 'available', used_at = NULL WHERE id = o.id;
      RETURN QUERY SELECT false, NULL::TEXT, format('未满 ¥%s 无法使用该券', to_char(o.min_amount, 'FM999999990')), 0::NUMERIC, 0::NUMERIC;
      RETURN;
    END IF;
    disc := LEAST(o.amount, total - 1);
    IF disc < 0 THEN disc := 0; END IF;
  END IF;

  -- 渠道手续费：仅支付宝类通道收取，费率取 site_settings.billing（非法值回退 4.6%）
  method := lower(btrim(coalesce(_payment_method, '')));
  SELECT s.value INTO c FROM public.site_settings s WHERE s.key = 'billing';
  fee_on := coalesce((c->>'fee_enabled')::BOOLEAN, true);
  rate := coalesce((c->>'alipay_fee_rate')::NUMERIC, 4.6);
  IF rate < 0 OR rate > 20 THEN rate := 4.6; END IF;
  IF fee_on AND method IN ('alipay', 'alipay_qr', 'alipay_manual') THEN
    fee := round(round(total - disc, 2) * rate / 100, 2);
  ELSE
    fee := 0;
  END IF;

  payable := round(total - disc + fee, 2);
  IF _amount IS NULL OR abs(_amount - payable) > 0.01 THEN
    IF disc > 0 THEN
      UPDATE public.referral_rewards SET status = 'available', used_at = NULL WHERE code = upper(btrim(_coupon_code));
    END IF;
    RETURN QUERY SELECT false, NULL::TEXT, '金额校验不通过，请刷新后重试', 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  INSERT INTO public.orders (
    id, user_id, product_id, product_snapshot, quantity, contact_email, contact_phone,
    lookup_password_hash, note, amount, discount_amount, coupon_code, status, expires_at,
    payment_method, goods_amount, channel_fee, is_recharge
  ) VALUES (
    _id, uid, _product_id, _product_snapshot, _quantity,
    nullif(btrim(coalesce(_contact_email, '')), ''),
    nullif(btrim(coalesce(_contact_phone, '')), ''),
    _lookup_password_hash,
    nullif(btrim(coalesce(_note, '')), ''),
    payable, disc,
    CASE WHEN disc > 0 THEN upper(btrim(_coupon_code)) ELSE NULL END,
    'pending_payment',
    NOW() + INTERVAL '30 minutes',
    NULLIF(method, ''),
    total, fee,
    (_product_id LIKE 'recharge-%')
  );
  RETURN QUERY SELECT true, _id, NULL::TEXT, disc, fee;
EXCEPTION WHEN unique_violation THEN
  IF disc > 0 THEN
    UPDATE public.referral_rewards SET status = 'available', used_at = NULL WHERE code = upper(btrim(_coupon_code));
  END IF;
  RETURN QUERY SELECT false, NULL::TEXT, '订单号重复，请重试', 0::NUMERIC, 0::NUMERIC;
END;
$func$;

REVOKE ALL ON FUNCTION public.order_create(TEXT, TEXT, JSONB, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_create(TEXT, TEXT, JSONB, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

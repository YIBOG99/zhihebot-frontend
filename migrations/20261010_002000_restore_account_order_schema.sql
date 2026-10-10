-- Repair the public schema and RPCs required by account center and checkout.
-- Idempotent: safe to apply when the base shop tables already exist.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_code_uidx ON public.profiles(invite_code) WHERE invite_code IS NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS commission JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS close_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS goods_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS channel_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_recharge BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_audit_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_audit_source TEXT;

CREATE TABLE IF NOT EXISTS public.blocked_customers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_type TEXT NOT NULL CHECK (contact_type IN ('email','phone')),
 contact_value TEXT NOT NULL,
 reason TEXT,
 is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_customers_contact_uidx ON public.blocked_customers(contact_type,contact_value);
CREATE TABLE IF NOT EXISTS public.order_captcha_challenges (
 id TEXT PRIMARY KEY, answer_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.commission_records (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id TEXT UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
 inviter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 invitee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
 base_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
 reward_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'granted',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select_own_commission_records ON public.commission_records;
CREATE POLICY users_select_own_commission_records ON public.commission_records
 FOR SELECT TO authenticated USING (inviter_id = auth.uid());

INSERT INTO public.site_settings(key,value) VALUES
 ('captcha','{"enabled":false,"cap_max":5,"cap_window_minutes":60}'::jsonb),
 ('billing','{"fee_enabled":true,"alipay_fee_rate":4.6}'::jsonb),
 ('referral','{"reward_amount":10,"min_amount":100,"max_reward_count":20}'::jsonb)
ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uname TEXT;
BEGIN
 uname := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
                   NULLIF(btrim(split_part(COALESCE(NEW.email,''),'@',1)), ''),
                   'user_' || substr(NEW.id::text,1,8));
 INSERT INTO public.profiles(id,username,email) VALUES(NEW.id,uname,NEW.email)
 ON CONFLICT(id) DO UPDATE SET email=COALESCE(public.profiles.email,EXCLUDED.email);
 INSERT INTO public.user_wallets(user_id) VALUES(NEW.id) ON CONFLICT(user_id) DO NOTHING;
 RETURN NEW;
END $$;
INSERT INTO public.profiles(id,username,email)
SELECT u.id,COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'username'), ''),
                    NULLIF(btrim(split_part(COALESCE(u.email,''),'@',1)), ''),
                    'user_'||substr(u.id::text,1,8)),u.email
FROM auth.users u
ON CONFLICT(id) DO UPDATE SET email=COALESCE(public.profiles.email,EXCLUDED.email);
INSERT INTO public.user_wallets(user_id) SELECT id FROM auth.users ON CONFLICT(user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_profile_invite_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE candidate TEXT; attempts INT := 0;
BEGIN
 IF NEW.invite_code IS NOT NULL AND btrim(NEW.invite_code) <> '' THEN RETURN NEW; END IF;
 LOOP
   attempts := attempts + 1;
   candidate := translate(upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text),1,8)),'01OI','XYZW');
   EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.invite_code=candidate);
   IF attempts > 20 THEN RAISE EXCEPTION 'Could not generate invite code'; END IF;
 END LOOP;
 NEW.invite_code := candidate; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_assign_invite_code_insert ON public.profiles;
CREATE TRIGGER profiles_assign_invite_code_insert BEFORE INSERT ON public.profiles
 FOR EACH ROW WHEN (NEW.invite_code IS NULL OR btrim(NEW.invite_code)='')
 EXECUTE FUNCTION public.generate_profile_invite_code();
DROP TRIGGER IF EXISTS profiles_assign_invite_code_update ON public.profiles;
CREATE TRIGGER profiles_assign_invite_code_update BEFORE UPDATE OF invite_code ON public.profiles
 FOR EACH ROW WHEN (NEW.invite_code IS NULL OR btrim(NEW.invite_code)='')
 EXECUTE FUNCTION public.generate_profile_invite_code();
UPDATE public.profiles SET invite_code=NULL WHERE invite_code IS NULL OR btrim(invite_code)='';

CREATE OR REPLACE FUNCTION public.my_invite_code()
RETURNS TABLE(ok BOOLEAN, code TEXT, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid UUID:=auth.uid(); c TEXT;
BEGIN
 IF uid IS NULL THEN RETURN QUERY SELECT false,NULL::TEXT,'请先登录'::TEXT; RETURN; END IF;
 SELECT p.invite_code INTO c FROM public.profiles p WHERE p.id=uid;
 IF c IS NULL OR btrim(c)='' THEN
   UPDATE public.profiles SET invite_code=NULL WHERE id=uid;
   SELECT p.invite_code INTO c FROM public.profiles p WHERE p.id=uid;
 END IF;
 RETURN QUERY SELECT c IS NOT NULL,c,CASE WHEN c IS NULL THEN '邀请码生成失败，请重试' ELSE NULL END;
END $$;
REVOKE ALL ON FUNCTION public.my_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_invite_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_referral_stats()
RETURNS TABLE(ok BOOLEAN,invite_count BIGINT,available_count BIGINT,available_amount NUMERIC,used_count BIGINT,total_commission NUMERIC,commission_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid UUID:=auth.uid();
BEGIN
 IF uid IS NULL THEN RETURN QUERY SELECT false,0::BIGINT,0::BIGINT,0::NUMERIC,0::BIGINT,0::NUMERIC,0::BIGINT; RETURN; END IF;
 RETURN QUERY SELECT true,
  (SELECT count(*) FROM public.profiles p WHERE p.invited_by=uid),
  (SELECT count(*) FROM public.referral_rewards r WHERE r.inviter_id=uid AND r.status='available'),
  COALESCE((SELECT sum(r.amount) FROM public.referral_rewards r WHERE r.inviter_id=uid AND r.status='available'),0),
  (SELECT count(*) FROM public.referral_rewards r WHERE r.inviter_id=uid AND r.status='used'),
  COALESCE((SELECT sum(c.reward_amount) FROM public.commission_records c WHERE c.inviter_id=uid AND c.status='granted'),0),
  (SELECT count(*) FROM public.commission_records c WHERE c.inviter_id=uid);
END $$;
REVOKE ALL ON FUNCTION public.my_referral_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_referral_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_commission_records()
RETURNS TABLE(id UUID,order_id TEXT,friend_name TEXT,product_title TEXT,base_amount NUMERIC,reward_amount NUMERIC,status TEXT,created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id,c.order_id,'好友'::TEXT,COALESCE(o.product_snapshot->>'title','商品')::TEXT,
        c.base_amount,c.reward_amount,c.status,c.created_at
 FROM public.commission_records c LEFT JOIN public.orders o ON o.id=c.order_id
 WHERE c.inviter_id=auth.uid() ORDER BY c.created_at DESC LIMIT 20
$$;
REVOKE ALL ON FUNCTION public.my_commission_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_commission_records() TO authenticated;

CREATE OR REPLACE FUNCTION public.referral_bind(_invite_code TEXT)
RETURNS TABLE(ok BOOLEAN,message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid UUID:=auth.uid(); inviter UUID; created TIMESTAMPTZ; reward NUMERIC; minamt NUMERIC; rc TEXT;
BEGIN
 IF uid IS NULL THEN RETURN QUERY SELECT false,'请先登录'::TEXT; RETURN; END IF;
 SELECT u.created_at INTO created FROM auth.users u WHERE u.id=uid;
 IF created IS NULL OR created < now()-interval '24 hours' THEN RETURN QUERY SELECT false,'仅注册 24 小时内的新账号可绑定邀请码'::TEXT; RETURN; END IF;
 SELECT p.id INTO inviter FROM public.profiles p WHERE upper(p.invite_code)=upper(btrim(_invite_code)) AND p.id<>uid;
 IF inviter IS NULL THEN RETURN QUERY SELECT false,'邀请码无效或不能填写自己的邀请码'::TEXT; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=uid AND p.invited_by IS NOT NULL) THEN RETURN QUERY SELECT false,'该账号已绑定过邀请码'::TEXT; RETURN; END IF;
 UPDATE public.profiles SET invited_by=inviter WHERE id=uid;
 SELECT COALESCE((value->>'reward_amount')::NUMERIC,10),COALESCE((value->>'min_amount')::NUMERIC,100)
 INTO reward,minamt FROM public.site_settings WHERE key='referral';
 reward:=COALESCE(reward,10); minamt:=COALESCE(minamt,100);
 rc:='R'||upper(substr(md5(gen_random_uuid()::text),1,10));
 INSERT INTO public.referral_rewards(inviter_id,invitee_id,code,amount,min_amount,status) VALUES(inviter,uid,rc,reward,minamt,'available');
 rc:='R'||upper(substr(md5(gen_random_uuid()::text),1,10));
 INSERT INTO public.referral_rewards(inviter_id,invitee_id,code,amount,min_amount,status) VALUES(uid,uid,rc,reward,minamt,'available');
 RETURN QUERY SELECT true,'绑定成功，邀请奖励券已发放'::TEXT;
END $$;
REVOKE ALL ON FUNCTION public.referral_bind(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_bind(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.order_assign_card(_order_id TEXT)
RETURNS TABLE(ok BOOLEAN,message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o RECORD; c RECORD;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=btrim(_order_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'订单不存在'::TEXT; RETURN; END IF;
 IF o.is_recharge THEN RETURN QUERY SELECT false,'充值订单不发放卡密'::TEXT; RETURN; END IF;
 SELECT * INTO c FROM public.card_secrets WHERE product_id=o.product_id AND status='unused' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'商品暂无可用卡密'::TEXT; RETURN; END IF;
 UPDATE public.card_secrets SET status='used',order_id=o.id,used_at=now() WHERE id=c.id;
 UPDATE public.orders SET status='completed',card_secret=c.code,updated_at=now(),
  timeline=COALESCE(timeline,'[]'::jsonb)||jsonb_build_object('at',now(),'label','自动发货完成') WHERE id=o.id;
 RETURN QUERY SELECT true,'已完成自动发货'::TEXT;
END $$;
REVOKE ALL ON FUNCTION public.order_assign_card(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_assign_card(TEXT) TO service_role;

DROP FUNCTION IF EXISTS public.order_create(TEXT,TEXT,JSONB,INT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT);
CREATE OR REPLACE FUNCTION public.order_create(
 _id TEXT,_product_id TEXT,_product_snapshot JSONB,_quantity INT,
 _contact_email TEXT,_contact_phone TEXT,_lookup_password_hash TEXT,_note TEXT,
 _amount NUMERIC,_coupon_code TEXT DEFAULT NULL,_challenge_id TEXT DEFAULT NULL,
 _challenge_answer TEXT DEFAULT NULL,_payment_method TEXT DEFAULT NULL,_is_recharge BOOLEAN DEFAULT false
)
RETURNS TABLE(ok BOOLEAN,order_id TEXT,message TEXT,discount NUMERIC,fee NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid UUID:=auth.uid(); p RECORD; total NUMERIC(10,2); disc NUMERIC(10,2):=0;
 payable NUMERIC(10,2); coupon RECORD; recharge BOOLEAN:=COALESCE(_is_recharge,false);
BEGIN
 IF _id IS NULL OR _id !~ '^ZH[0-9]{8}[A-Z0-9]{6}$' THEN RETURN QUERY SELECT false,NULL::TEXT,'订单号格式不正确',0::NUMERIC,0::NUMERIC; RETURN; END IF;
 IF _lookup_password_hash IS NULL OR length(_lookup_password_hash)<>64 THEN RETURN QUERY SELECT false,NULL::TEXT,'查询密码无效',0::NUMERIC,0::NUMERIC; RETURN; END IF;
 IF COALESCE(NULLIF(btrim(_contact_email),''),NULLIF(btrim(_contact_phone),'')) IS NULL THEN RETURN QUERY SELECT false,NULL::TEXT,'请至少填写邮箱或手机号',0::NUMERIC,0::NUMERIC; RETURN; END IF;
 IF recharge THEN
  IF uid IS NULL THEN RETURN QUERY SELECT false,NULL::TEXT,'请先登录后再充值余额',0::NUMERIC,0::NUMERIC; RETURN; END IF;
  IF _amount IS NULL OR _amount<1 OR _amount>9999 THEN RETURN QUERY SELECT false,NULL::TEXT,'充值金额需在 ¥1 - ¥9999 之间',0::NUMERIC,0::NUMERIC; RETURN; END IF;
  IF COALESCE(_payment_method,'')='balance' THEN RETURN QUERY SELECT false,NULL::TEXT,'余额充值不能使用余额支付',0::NUMERIC,0::NUMERIC; RETURN; END IF;
  total:=round(_amount,2);
 ELSE
  SELECT * INTO p FROM public.products WHERE id=_product_id AND is_active=true;
  IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::TEXT,'商品不存在或已下架，请检查商品数据是否已导入',0::NUMERIC,0::NUMERIC; RETURN; END IF;
  IF _quantity IS NULL OR _quantity<1 OR _quantity>10 THEN RETURN QUERY SELECT false,NULL::TEXT,'购买数量需在 1-10 之间',0::NUMERIC,0::NUMERIC; RETURN; END IF;
  total:=round(p.price*_quantity,2);
  IF _coupon_code IS NOT NULL AND btrim(_coupon_code)<>'' THEN
   IF uid IS NULL THEN RETURN QUERY SELECT false,NULL::TEXT,'请先登录后再使用奖励券',0::NUMERIC,0::NUMERIC; RETURN; END IF;
   UPDATE public.referral_rewards SET status='used',used_at=now() WHERE code=upper(btrim(_coupon_code)) AND inviter_id=uid AND status='available' RETURNING * INTO coupon;
   IF NOT FOUND THEN RETURN QUERY SELECT false,NULL::TEXT,'奖励券无效或已被使用',0::NUMERIC,0::NUMERIC; RETURN; END IF;
   IF total<coupon.min_amount THEN UPDATE public.referral_rewards SET status='available',used_at=NULL WHERE id=coupon.id; RETURN QUERY SELECT false,NULL::TEXT,'订单金额未达到奖励券使用门槛',0::NUMERIC,0::NUMERIC; RETURN; END IF;
   disc:=LEAST(coupon.amount,GREATEST(total-1,0));
  END IF;
 END IF;
 payable:=round(total-disc,2);
 IF _amount IS NULL OR abs(_amount-payable)>0.01 THEN
  IF disc>0 THEN UPDATE public.referral_rewards SET status='available',used_at=NULL WHERE code=upper(btrim(_coupon_code)); END IF;
  RETURN QUERY SELECT false,NULL::TEXT,'金额校验不通过，请刷新后重试',0::NUMERIC,0::NUMERIC; RETURN;
 END IF;
 IF NOT recharge AND EXISTS(SELECT 1 FROM public.blocked_customers b WHERE b.is_active AND
  ((b.contact_type='email' AND b.contact_value=lower(btrim(COALESCE(_contact_email,'')))) OR
   (b.contact_type='phone' AND b.contact_value=btrim(regexp_replace(COALESCE(_contact_phone,''),'[^0-9+]','','g'))))) THEN
  RETURN QUERY SELECT false,NULL::TEXT,'您暂时无法下单，请联系客服处理',0::NUMERIC,0::NUMERIC; RETURN;
 END IF;
 INSERT INTO public.orders(id,user_id,product_id,product_snapshot,quantity,contact_email,contact_phone,lookup_password_hash,note,
  amount,discount_amount,coupon_code,status,expires_at,payment_method,goods_amount,channel_fee,is_recharge)
 VALUES(_id,uid,_product_id,COALESCE(_product_snapshot,'{}'::jsonb),CASE WHEN recharge THEN 1 ELSE _quantity END,
  NULLIF(btrim(COALESCE(_contact_email,'')),''),NULLIF(btrim(COALESCE(_contact_phone,'')),''),
  _lookup_password_hash,NULLIF(btrim(COALESCE(_note,'')),''),payable,disc,
  CASE WHEN disc>0 THEN upper(btrim(_coupon_code)) ELSE NULL END,'pending_payment',now()+interval '30 minutes',NULL,total,0,recharge);
 RETURN QUERY SELECT true,_id,NULL::TEXT,disc,0::NUMERIC;
EXCEPTION WHEN unique_violation THEN
 IF disc>0 THEN UPDATE public.referral_rewards SET status='available',used_at=NULL WHERE code=upper(btrim(_coupon_code)); END IF;
 RETURN QUERY SELECT false,NULL::TEXT,'订单号重复，请重试',0::NUMERIC,0::NUMERIC;
END $$;
REVOKE ALL ON FUNCTION public.order_create(TEXT,TEXT,JSONB,INT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_create(TEXT,TEXT,JSONB,INT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,BOOLEAN) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.order_set_payment_method(_order_id TEXT,_method TEXT,_lookup_password_hash TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o RECORD; fee NUMERIC(10,2):=0; rate NUMERIC:=4.6; enabled BOOLEAN:=true; method TEXT:=lower(btrim(COALESCE(_method,'')));
BEGIN
 IF method NOT IN ('alipay','alipay_qr','alipay_manual','wechat','usdt','balance') THEN RETURN '不支持的支付方式'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=btrim(_order_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN '订单不存在'; END IF;
 IF o.user_id IS NOT NULL THEN
  IF auth.uid() IS DISTINCT FROM o.user_id THEN RETURN '只能操作自己的订单'; END IF;
 ELSE
  IF _lookup_password_hash IS NULL OR o.lookup_password_hash IS DISTINCT FROM _lookup_password_hash THEN RETURN '查询密码校验失败'; END IF;
 END IF;
 IF o.status<>'pending_payment' THEN RETURN '订单当前状态不能更换支付方式'; END IF;
 IF method='balance' AND o.is_recharge THEN RETURN '余额充值不能使用余额支付'; END IF;
 SELECT COALESCE((value->>'alipay_fee_rate')::NUMERIC,4.6),COALESCE((value->>'fee_enabled')::BOOLEAN,true) INTO rate,enabled
 FROM public.site_settings WHERE key='billing';
 IF rate<0 OR rate>20 THEN rate:=4.6; END IF;
 IF enabled AND method IN ('alipay','alipay_qr','alipay_manual') THEN fee:=round(round(o.goods_amount-o.discount_amount,2)*rate/100,2); END IF;
 UPDATE public.orders SET payment_method=method,channel_fee=fee,amount=round(o.goods_amount-o.discount_amount+fee,2),updated_at=now() WHERE id=o.id;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.order_set_payment_method(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_set_payment_method(TEXT,TEXT,TEXT) TO anon,authenticated;

NOTIFY pgrst, 'reload schema';

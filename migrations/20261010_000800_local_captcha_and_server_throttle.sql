-- The browser now verifies a simple local code. Disable the legacy server-side
-- challenge requirement, but retain a database-level contact throttle.
-- UPSERT is important: UPDATE-only would silently do nothing if the setting row
-- is missing, leaving the older order_create RPC to reject every local-code order.
INSERT INTO public.site_settings (key, value)
VALUES ('captcha', '{"enabled": false, "cap_max": 5, "cap_window_minutes": 60}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(
  jsonb_set(COALESCE(public.site_settings.value, '{}'::jsonb), '{enabled}', 'false'::jsonb, true),
  '{cap_max}', COALESCE(public.site_settings.value->'cap_max', '5'::jsonb), true
);

CREATE OR REPLACE FUNCTION public.enforce_order_contact_throttle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cfg JSONB;
  max_orders INTEGER;
  window_minutes INTEGER;
  recent_count INTEGER;
  e TEXT;
  p TEXT;
BEGIN
  IF NEW.status NOT IN ('pending_payment', 'pay_processing') THEN RETURN NEW; END IF;
  e := NULLIF(lower(btrim(COALESCE(NEW.contact_email, ''))), '');
  p := NULLIF(btrim(regexp_replace(COALESCE(NEW.contact_phone, ''), '[^0-9+]', '', 'g')), '');
  IF e IS NULL AND p IS NULL THEN RETURN NEW; END IF;
  SELECT value INTO cfg FROM public.site_settings WHERE key = 'captcha';
  max_orders := GREATEST(1, COALESCE((cfg->>'cap_max')::INTEGER, 5));
  window_minutes := GREATEST(1, COALESCE((cfg->>'cap_window_minutes')::INTEGER, 60));
  SELECT count(*) INTO recent_count FROM public.orders o
   WHERE o.created_at > NOW() - make_interval(mins => window_minutes)
     AND o.status IN ('pending_payment', 'pay_processing')
     AND ((e IS NOT NULL AND lower(COALESCE(o.contact_email, '')) = e)
       OR (p IS NOT NULL AND btrim(regexp_replace(COALESCE(o.contact_phone, ''), '[^0-9+]', '', 'g')) = p));
  IF recent_count >= max_orders THEN
    RAISE EXCEPTION '短时间内下单次数过多，请稍后再试' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_contact_throttle ON public.orders;
CREATE TRIGGER orders_contact_throttle BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_contact_throttle();

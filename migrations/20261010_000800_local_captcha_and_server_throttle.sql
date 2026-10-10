-- Local checkout captcha replaces the remote challenge endpoint.
-- Retain server-side throttling for pending orders by contact.
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

UPDATE public.site_settings SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{enabled}', 'false'::jsonb, true)
WHERE key = 'captcha';

-- Repair live administrator metrics and restore real visitor tracking.
-- All revenue is derived from authoritative paid order states, not nullable paid_at alone.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Backfill historical paid orders. Existing production data has completed orders with NULL paid_at.
UPDATE public.orders
SET paid_at = COALESCE(paid_at, payment_audit_at, updated_at, created_at),
    confirmed_at = COALESCE(confirmed_at, paid_at, payment_audit_at, updated_at, created_at),
    payment_status = 'confirmed'
WHERE status IN ('paid_pending_delivery', 'completed')
  AND (paid_at IS NULL OR payment_status IS DISTINCT FROM 'confirmed' OR confirmed_at IS NULL);

UPDATE public.orders
SET payment_status = 'cancelled'
WHERE status = 'closed' AND payment_status = 'pending';

CREATE OR REPLACE FUNCTION public.sync_order_payment_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('paid_pending_delivery', 'completed') THEN
    NEW.paid_at := COALESCE(NEW.paid_at, NEW.payment_audit_at, NEW.confirmed_at, NOW());
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, NEW.paid_at);
    NEW.payment_status := 'confirmed';
  ELSIF NEW.status = 'closed'
        AND COALESCE(OLD.status, '') NOT IN ('paid_pending_delivery', 'completed') THEN
    NEW.payment_status := COALESCE(NULLIF(NEW.payment_status, 'pending'), 'cancelled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_payment_audit ON public.orders;
CREATE TRIGGER orders_sync_payment_audit
  BEFORE INSERT OR UPDATE OF status, paid_at ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_payment_audit();

-- Per-day visitor IDs are pseudonymous browser-generated IDs; no IP or fingerprint is stored.
CREATE TABLE IF NOT EXISTS public.daily_visitors (
  day DATE NOT NULL,
  visitor_id TEXT NOT NULL,
  PRIMARY KEY (day, visitor_id)
);
CREATE TABLE IF NOT EXISTS public.daily_login_users (
  day DATE NOT NULL,
  user_id UUID NOT NULL,
  PRIMARY KEY (day, user_id)
);
ALTER TABLE public.daily_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_login_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_visitors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.daily_login_users FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stat_track_visit(_visitor_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  _today DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::date;
  _uid UUID := auth.uid();
BEGIN
  IF _visitor_id IS NULL
     OR char_length(_visitor_id) < 8
     OR char_length(_visitor_id) > 64
     OR _visitor_id !~ '^[A-Za-z0-9-]+$' THEN
    RETURN;
  END IF;

  INSERT INTO public.daily_visitors(day, visitor_id)
  VALUES (_today, _visitor_id)
  ON CONFLICT (day, visitor_id) DO NOTHING;

  IF _uid IS NOT NULL THEN
    INSERT INTO public.daily_login_users(day, user_id)
    VALUES (_today, _uid)
    ON CONFLICT (day, user_id) DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.stat_track_visit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stat_track_visit(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard(_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  result JSONB;
  from_day DATE;
  today_day DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::date;
  until_day DATE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  from_day := today_day - (GREATEST(1, LEAST(COALESCE(_days, 30), 90)) - 1);
  until_day := today_day + 1;

  SELECT jsonb_build_object(
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day', d.day::date::text,
        'revenue', COALESCE(rev.revenue, 0),
        'visits', COALESCE(vis.visits, 0),
        'order_count', COALESCE(rev.order_count, 0)
      ) ORDER BY d.day)
      FROM generate_series(from_day, today_day, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT (COALESCE(paid_at, payment_audit_at, confirmed_at, updated_at, created_at)
                  AT TIME ZONE 'Asia/Shanghai')::date AS day,
               SUM(amount)::numeric AS revenue,
               COUNT(*)::integer AS order_count
        FROM public.orders
        WHERE status IN ('paid_pending_delivery', 'completed')
          AND COALESCE(paid_at, payment_audit_at, confirmed_at, updated_at, created_at) >=
              (from_day::timestamp AT TIME ZONE 'Asia/Shanghai')
          AND COALESCE(paid_at, payment_audit_at, confirmed_at, updated_at, created_at) <
              (until_day::timestamp AT TIME ZONE 'Asia/Shanghai')
        GROUP BY 1
      ) rev ON rev.day = d.day::date
      LEFT JOIN (
        SELECT day, COUNT(DISTINCT visitor_id)::integer AS visits
        FROM public.daily_visitors
        WHERE day >= from_day AND day < until_day
        GROUP BY day
      ) vis ON vis.day = d.day::date
    ), '[]'::jsonb),
    'today', jsonb_build_object(
      'visits', (SELECT COUNT(DISTINCT visitor_id) FROM public.daily_visitors WHERE day = today_day),
      'login_users', (SELECT COUNT(DISTINCT user_id) FROM public.daily_login_users WHERE day = today_day),
      'order_count', (SELECT COUNT(*) FROM public.orders
        WHERE created_at >= (today_day::timestamp AT TIME ZONE 'Asia/Shanghai')
          AND created_at < (until_day::timestamp AT TIME ZONE 'Asia/Shanghai')),
      'revenue', (SELECT COALESCE(SUM(amount), 0) FROM public.orders
        WHERE status IN ('paid_pending_delivery', 'completed')
          AND COALESCE(paid_at, payment_audit_at, confirmed_at, updated_at, created_at) >=
              (today_day::timestamp AT TIME ZONE 'Asia/Shanghai')
          AND COALESCE(paid_at, payment_audit_at, confirmed_at, updated_at, created_at) <
              (until_day::timestamp AT TIME ZONE 'Asia/Shanghai'))
    ),
    'week_visits', (SELECT COUNT(DISTINCT visitor_id) FROM public.daily_visitors
      WHERE day >= today_day - 6 AND day <= today_day),
    'total_revenue', (SELECT COALESCE(SUM(amount), 0) FROM public.orders
      WHERE status IN ('paid_pending_delivery', 'completed')),
    'total_orders', (SELECT COUNT(*) FROM public.orders),
    'pending_audit', (SELECT COUNT(*) FROM public.orders
      WHERE status IN ('pay_processing', 'pending_audit')
        AND COALESCE(payment_status, 'pending') <> 'confirmed'
        AND paid_at IS NULL)
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard(INTEGER) TO authenticated;

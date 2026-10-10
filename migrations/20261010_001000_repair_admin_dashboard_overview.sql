-- Restore the administrator overview RPC. Visitor metrics remain zero until a visit-tracking table is implemented.
CREATE OR REPLACE FUNCTION public.admin_dashboard(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE result jsonb; from_day date; until_day date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;
  from_day := current_date - (GREATEST(1, LEAST(COALESCE(_days, 30), 90)) - 1);
  until_day := current_date + 1;
  SELECT jsonb_build_object(
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d.day::text, 'revenue', COALESCE(x.revenue, 0), 'visits', 0) ORDER BY d.day)
      FROM generate_series(from_day, current_date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT paid_at::date AS day, SUM(amount)::numeric AS revenue
        FROM public.orders WHERE paid_at >= from_day::timestamptz AND paid_at < until_day::timestamptz
        GROUP BY paid_at::date
      ) x ON x.day = d.day
    ), '[]'::jsonb),
    'today', jsonb_build_object(
      'visits', 0,
      'login_users', (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= current_date::timestamptz AND last_sign_in_at < until_day::timestamptz),
      'order_count', (SELECT count(*) FROM public.orders WHERE created_at >= current_date::timestamptz AND created_at < until_day::timestamptz),
      'revenue', (SELECT COALESCE(SUM(amount), 0) FROM public.orders WHERE paid_at >= current_date::timestamptz AND paid_at < until_day::timestamptz)
    ),
    'week_visits', 0,
    'total_revenue', (SELECT COALESCE(SUM(amount), 0) FROM public.orders WHERE paid_at IS NOT NULL),
    'total_orders', (SELECT count(*) FROM public.orders),
    'pending_audit', (SELECT count(*) FROM public.orders WHERE status IN ('pay_processing', 'pending_audit') AND paid_at IS NULL)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dashboard(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard(integer) TO authenticated;

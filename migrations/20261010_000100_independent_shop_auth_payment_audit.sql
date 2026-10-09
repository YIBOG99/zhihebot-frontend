-- Independent-shop schema additions.
-- Keep this migration in the repository's root migrations/ directory, which is the
-- migration path documented by this project. Do not edit the generated historical migrations.

-- Registration writes the real email to profiles; the original exported schema omitted this column.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
UPDATE public.profiles AS p
   SET email = u.email
  FROM auth.users AS u
 WHERE u.id = p.id
   AND (p.email IS NULL OR p.email = '');

-- Explicit payment audit fields. Existing payment_method and status columns remain authoritative.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Backfill existing terminal/payment-confirmed orders before enabling the transition trigger.
UPDATE public.orders
   SET payment_status = CASE
     WHEN status IN ('paid_pending_delivery', 'completed') THEN 'confirmed'
     WHEN status = 'closed' THEN 'cancelled'
     ELSE 'pending'
   END,
   confirmed_at = CASE
     WHEN status IN ('paid_pending_delivery', 'completed') THEN COALESCE(confirmed_at, updated_at, created_at)
     ELSE confirmed_at
   END
 WHERE payment_status = 'pending'
   AND status IN ('paid_pending_delivery', 'completed', 'closed');

-- Refund audit trail; the wallet_refund_order RPC continues to perform the actual balance refund.
CREATE TABLE IF NOT EXISTS public.order_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  refund_method TEXT NOT NULL DEFAULT 'balance',
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_refunds_order_id_created_at_idx
  ON public.order_refunds(order_id, created_at DESC);
ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_refunds_admin_all ON public.order_refunds;
CREATE POLICY order_refunds_admin_all ON public.order_refunds
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_refunds TO authenticated;
REVOKE ALL ON public.order_refunds FROM anon;

-- Keep profiles complete when Supabase Auth creates a user. The signup page still performs
-- an idempotent upsert after OTP verification; this trigger covers admin-created users too.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate_username TEXT;
BEGIN
  candidate_username := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'username'), '');
  IF candidate_username IS NULL THEN
    candidate_username := 'user_' || LEFT(REPLACE(NEW.id::TEXT, '-', ''), 12);
  END IF;

  INSERT INTO public.profiles (id, username, email)
  VALUES (NEW.id, candidate_username, NEW.email)
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email);
  RETURN NEW;
END;
$$;

-- A status change performed by the trusted payment/admin RPCs leaves an auditable timestamp.
CREATE OR REPLACE FUNCTION public.sync_order_payment_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('paid_pending_delivery', 'completed')
     AND COALESCE(OLD.status, '') NOT IN ('paid_pending_delivery', 'completed') THEN
    NEW.payment_status := 'confirmed';
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, NOW());
  ELSIF NEW.status = 'closed'
     AND COALESCE(OLD.status, '') NOT IN ('paid_pending_delivery', 'completed') THEN
    NEW.payment_status := COALESCE(NULLIF(NEW.payment_status, 'pending'), 'cancelled');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_sync_payment_audit ON public.orders;
CREATE TRIGGER orders_sync_payment_audit
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_payment_audit();

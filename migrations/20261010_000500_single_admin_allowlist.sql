-- Restrict the shop to exactly one administrator identity.
-- The mailbox is intentionally fixed by the owner-approved request; do not move this
-- allowlist into frontend code or a public registration flow.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_single_shop_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  assigned_email TEXT;
BEGIN
  IF NEW.role::TEXT = 'admin' THEN
    SELECT lower(email) INTO assigned_email
      FROM auth.users
     WHERE id = NEW.user_id;

    IF assigned_email IS DISTINCT FROM '1119746379@qq.com' THEN
      RAISE EXCEPTION 'Only the configured shop administrator may hold the admin role'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_single_shop_admin_guard ON public.user_roles;
CREATE TRIGGER user_roles_single_shop_admin_guard
  BEFORE INSERT OR UPDATE OF user_id, role ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_shop_admin();

-- Remove any previously assigned admin role from other accounts.
DELETE FROM public.user_roles AS r
 USING auth.users AS u
 WHERE u.id = r.user_id
   AND r.role::TEXT = 'admin'
   AND lower(COALESCE(u.email, '')) <> '1119746379@qq.com';

-- If the approved mailbox has already registered, grant it admin now.
-- Otherwise the account must first be created through Supabase Auth, then this migration
-- can be re-run or the matching user_roles row can be inserted by the project owner.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
  FROM auth.users AS u
 WHERE lower(u.email) = '1119746379@qq.com'
ON CONFLICT (user_id, role) DO NOTHING;

COMMIT;

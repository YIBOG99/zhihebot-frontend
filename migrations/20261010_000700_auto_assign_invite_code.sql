-- Ensure every profile receives a durable personal invite code at account creation.
-- Existing accounts without a code are backfilled without changing any existing code.
CREATE OR REPLACE FUNCTION public.generate_profile_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
  attempts INTEGER := 0;
BEGIN
  IF NEW.invite_code IS NOT NULL AND btrim(NEW.invite_code) <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    attempts := attempts + 1;
    candidate := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8));
    candidate := translate(candidate, '01OI', 'XYZW');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.invite_code = candidate
    );
    IF attempts >= 20 THEN
      RAISE EXCEPTION 'Could not allocate a unique invite code';
    END IF;
  END LOOP;

  NEW.invite_code := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_invite_code ON public.profiles;
CREATE TRIGGER profiles_assign_invite_code
  BEFORE INSERT OR UPDATE OF invite_code ON public.profiles
  FOR EACH ROW
  WHEN (NEW.invite_code IS NULL OR btrim(NEW.invite_code) = '')
  EXECUTE FUNCTION public.generate_profile_invite_code();

-- Backfill accounts registered before the automatic-code trigger existed.
UPDATE public.profiles
   SET invite_code = NULL
 WHERE invite_code IS NULL OR btrim(invite_code) = '';

-- Avoid failed Supabase Auth signups when two people choose the same display username.
-- Keep Auth user IDs authoritative; use a deterministic suffix only when the requested
-- username conflicts with the profiles.username unique constraint.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  base_username TEXT;
  candidate_username TEXT;
BEGIN
  base_username := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'username'), '');
  IF base_username IS NULL THEN
    base_username := 'user_' || LEFT(REPLACE(NEW.id::TEXT, '-', ''), 12);
  END IF;

  candidate_username := base_username;
  BEGIN
    INSERT INTO public.profiles (id, username, email)
    VALUES (NEW.id, candidate_username, NEW.email)
    ON CONFLICT (id) DO UPDATE
      SET email = COALESCE(public.profiles.email, EXCLUDED.email);
  EXCEPTION WHEN unique_violation THEN
    candidate_username := LEFT(base_username, 48) || '_' || LEFT(REPLACE(NEW.id::TEXT, '-', ''), 8);
    INSERT INTO public.profiles (id, username, email)
    VALUES (NEW.id, candidate_username, NEW.email)
    ON CONFLICT (id) DO UPDATE
      SET email = COALESCE(public.profiles.email, EXCLUDED.email);
  END;

  RETURN NEW;
END;
$func$;

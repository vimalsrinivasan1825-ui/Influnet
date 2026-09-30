-- Profiles must only be created by register_profile() (SECURITY DEFINER), which
-- clamps role and approval state. The profiles_insert_own policy only checked
-- auth.uid() = id, so any signed-up user could POST /rest/v1/profiles with
-- role = 'admin' (migration 070 guarded UPDATE only). Close the direct path.
REVOKE INSERT ON public.profiles FROM anon, authenticated;
REVOKE INSERT ON public.business_profiles FROM anon, authenticated;
REVOKE INSERT ON public.influencer_profiles FROM anon, authenticated;

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

-- Belt and braces: even if a grant is re-added later, a non-service caller can
-- never create a privileged profile row.
CREATE OR REPLACE FUNCTION public.profiles_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER on purpose: current_user is the caller, so register_profile()
  -- (definer, runs as the owner) and the service role pass straight through.
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.role IS DISTINCT FROM 'influencer' AND NEW.role IS DISTINCT FROM 'business_owner' THEN
      RAISE EXCEPTION 'role % cannot be self-assigned', NEW.role USING ERRCODE = '42501';
    END IF;
    NEW.is_super_admin := false;
    NEW.verification_status := 'unverified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_insert ON public.profiles;
CREATE TRIGGER profiles_guard_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_insert();

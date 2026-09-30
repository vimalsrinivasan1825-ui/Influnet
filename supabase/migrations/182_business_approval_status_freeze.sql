-- business_profiles has a row-level UPDATE policy and no column allow-list, and
-- migration 164 relies on approval_status being unwritable by the owner. Make
-- that true regardless of column grants: only definer RPCs and the service role
-- (admin console) may change it.
CREATE OR REPLACE FUNCTION public.business_profiles_guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RAISE EXCEPTION 'approval_status can only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_profiles_guard_approval ON public.business_profiles;
CREATE TRIGGER business_profiles_guard_approval
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.business_profiles_guard_approval();

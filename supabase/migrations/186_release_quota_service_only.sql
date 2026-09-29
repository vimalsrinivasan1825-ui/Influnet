-- release_quota / release_weekly_quota were callable by any signed-in user and
-- unconditionally decrement their own meter, so a free-tier user could call it
-- after every action and never reach the ceiling. Refunds are a server decision
-- (the guarded write failed), so the functions now take the user id and are
-- service-role only.
DROP FUNCTION IF EXISTS public.release_quota(text);
DROP FUNCTION IF EXISTS public.release_weekly_quota(text);

CREATE OR REPLACE FUNCTION public.release_quota(p_user_id UUID, p_meter TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.plan_usage
     SET used = GREATEST(used - 1, 0)
   WHERE user_id = p_user_id
     AND meter = p_meter
     AND period_start = date_trunc('month', now())::DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_weekly_quota(p_user_id UUID, p_meter TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.plan_usage
     SET used = GREATEST(used - 1, 0)
   WHERE user_id = p_user_id
     AND meter = p_meter
     AND period_start = date_trunc('week', now())::DATE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_quota(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_weekly_quota(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_quota(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_weekly_quota(uuid, text) TO service_role;

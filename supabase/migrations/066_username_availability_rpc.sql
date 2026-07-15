-- 066: Real-time username availability check for signup.
--
-- Problem: username uniqueness was only enforced inside register_profile (the
-- very last signup step), and that runs AFTER supabase.auth.signUp has already
-- created the auth user. So a taken username surfaced only on "Create account",
-- and left an orphaned auth user behind. The signup form had no way to check
-- availability while the user types because:
--   * influencer_profiles / business_profiles SELECT is authenticated-only (RLS),
--     so an anonymous (pre-auth) visitor can't read them to test a name, and
--   * is_username_globally_taken() is a plain STABLE function, so it runs with
--     the caller's RLS and returns wrong (always-"available") results for anon.
--
-- Fix: a SECURITY DEFINER wrapper that anon may call. It bypasses RLS to give a
-- correct taken/available answer without exposing any row data — it only ever
-- returns a boolean. Format/reserved-word validation stays in the app layer
-- (UsernameSchema) and in is_valid_influnet_username(); this function answers the
-- single question "is this name already in use?".

CREATE OR REPLACE FUNCTION public.check_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  uname TEXT := lower(trim(coalesce(p_username, '')));
BEGIN
  -- Empty or structurally invalid names are never "available" — the caller
  -- should surface a validation message, not an availability tick.
  IF uname = '' OR NOT public.is_valid_influnet_username(uname) THEN
    RETURN FALSE;
  END IF;

  -- Available when NOT already taken anywhere in the shared username namespace.
  RETURN NOT public.is_username_globally_taken(uname, NULL);
END;
$$;

-- Callable before authentication (signup) and after (settings rename).
GRANT EXECUTE ON FUNCTION public.check_username_available(TEXT) TO anon, authenticated;

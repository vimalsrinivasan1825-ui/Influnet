-- 096: Real-time email and phone availability checks for signup.
--
-- Exposes SECURITY DEFINER functions so anonymous callers can check if an
-- email or phone is already taken before submitting the signup form.
-- Returns only a boolean to prevent enumeration of user details.

CREATE OR REPLACE FUNCTION public.check_email_available(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  em TEXT := lower(trim(coalesce(p_email, '')));
BEGIN
  IF em = '' THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = em
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_available(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_phone_available(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  ph TEXT := trim(coalesce(p_phone, ''));
BEGIN
  IF ph = '' THEN
    RETURN FALSE;
  END IF;

  -- Phone might be stored in auth.users or profiles depending on signup flow
  RETURN NOT EXISTS (
    SELECT 1 FROM auth.users WHERE phone = ph
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = ph
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_phone_available(TEXT) TO anon, authenticated;

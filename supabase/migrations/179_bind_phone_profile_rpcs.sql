-- mark_profile_phone_verified / reset_profile_phone_verification took any
-- p_user_id and were executable by every authenticated user, so one user could
-- overwrite or clear another user's verified phone. A caller may now only act on
-- their own row; the service role (edge function) keeps full access.
CREATE OR REPLACE FUNCTION public.mark_profile_phone_verified(
  p_user_id UUID,
  p_phone TEXT,
  p_provider TEXT DEFAULT '2factor'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
  display_phone TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  normalized := public.normalize_indian_phone(p_phone);
  IF normalized IS NULL THEN
    RETURN;
  END IF;
  IF length(normalized) = 12 AND left(normalized, 2) = '91' THEN
    display_phone := '+91 ' || substr(normalized, 3);
  ELSE
    display_phone := '+' || normalized;
  END IF;

  UPDATE public.profiles
  SET
    phone = display_phone,
    phone_verified = true,
    phone_verified_at = now(),
    otp_verified_by = coalesce(nullif(trim(p_provider), ''), '2factor'),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_profile_phone_verification(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
  SET
    phone_verified = false,
    phone_verified_at = NULL,
    otp_verified_by = NULL,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_profile_phone_verified(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_profile_phone_verification(UUID) FROM PUBLIC, anon;

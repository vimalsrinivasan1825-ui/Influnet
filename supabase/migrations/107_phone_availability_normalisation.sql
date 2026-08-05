-- 107: make the signup phone check compare NUMBERS, not strings.
--
-- check_phone_available (migration 096) tested `phone = p_phone` verbatim. The
-- two clients do not write the same string for the same number:
--
--   mobile signup  → '+91 8270942966'   (country code, space)
--   web signup     → '8270942966'       (what the field contains)
--   older rows     → '+918270942966'
--
-- so an account created on mobile reported its own number as AVAILABLE on the
-- web form, and vice versa. Verified on the staging DB before this change:
--   check_phone_available('+91 8270942966') → false
--   check_phone_available('8270942966')     → true   ← same person
--
-- The fix is to compare a canonical form on both sides. India-only product, so
-- the canonical form is the last 10 digits: '+91 82709 42966', '918270942966'
-- and '8270942966' are one number. That folds together two numbers from
-- different countries sharing a 10-digit tail, which is the right trade here —
-- a false "already registered" on a number nobody in the product can have is
-- cheaper than handing out duplicate accounts.
--
-- NOTE (not fixed here, needs a human decision): this function is advisory UI
-- only. Nothing enforces phone uniqueness on write, and the data already
-- contains duplicates — three staging accounts share +91 8870520006 — so a
-- UNIQUE index cannot be added until those are merged or cleared.

-- Last 10 digits of whatever shape the number arrived in. NULL/empty in,
-- empty string out, so a NULL column never accidentally equals a NULL input.
CREATE OR REPLACE FUNCTION public.phone_key(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

GRANT EXECUTE ON FUNCTION public.phone_key(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_phone_available(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  key TEXT := public.phone_key(p_phone);
BEGIN
  -- Fewer than 10 digits is not a number we can judge; the caller's own
  -- validation reports that, and answering "available" here would be a lie.
  IF length(key) < 10 THEN
    RETURN FALSE;
  END IF;

  -- Both stores, because which one holds the number depends on the signup
  -- path: auth.users.phone is set by the OTP flow, profiles.phone by
  -- register_profile.
  RETURN NOT EXISTS (
    SELECT 1 FROM auth.users WHERE public.phone_key(phone) = key
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE public.phone_key(phone) = key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_phone_available(TEXT) TO anon, authenticated;

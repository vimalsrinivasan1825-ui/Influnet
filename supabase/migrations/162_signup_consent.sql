-- Migration 162: record that a person accepted the Terms + Privacy Policy and
-- confirmed they are 18 or older when they signed up.
--
-- WHY (launch audit 2026-09-18, units acc-csignup / acc-bsignup)
--
-- Neither signup asked. The Terms say "18 or older", the App Store (5.1.1, 1.2)
-- and Google Play (UGC policy) both require acceptance of terms before a person
-- can post content, and DPDP needs a stated basis. There was nothing to point at.
--
-- DESIGN
--
-- A separate table, not columns on profiles. The profile row does not exist yet
-- when consent is given (register_profile creates it afterwards), profiles has
-- column-level grants that make every new column a trap (AGENTS.md), and consent
-- must be recordable BEFORE register_profile so a failed profile write leaves
-- true evidence and a retry is idempotent.
--
-- * One row per account, WRITE-ONCE: the FIRST acceptance is the evidence, so a
--   later call never overwrites it (ON CONFLICT DO NOTHING).
-- * Timestamps are the SERVER's now(). The client sends only a version string
--   and can never supply a time.
-- * No table privileges for anon/authenticated and no policies: the only way in
--   is record_signup_consent(), which acts for auth.uid() and nobody else. Admin
--   reads use the service role.
-- * ON DELETE CASCADE with the auth user, like every other per-user row here.

CREATE TABLE IF NOT EXISTS public.signup_consents (
  user_id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  terms_version     text        NOT NULL,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  age_confirmed_at  timestamptz NOT NULL DEFAULT now(),
  -- 'web' | 'ios' | 'android' | 'unknown', from the X-Influnet-Client header.
  source            text        NOT NULL DEFAULT 'unknown'
);

COMMENT ON TABLE public.signup_consents IS
  'Write-once record of Terms/Privacy acceptance and the 18+ confirmation at signup (migration 162). Timestamps are server time.';

ALTER TABLE public.signup_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_consents FROM anon, authenticated;

-- Both arguments default to NULL so the admin health probe can call this with
-- no arguments (it treats "the function exists" as "applied"). A NULL version
-- is refused BEFORE anything is written, so the probe can never insert a row.
CREATE OR REPLACE FUNCTION public.record_signup_consent(
  p_terms_version text DEFAULT NULL,
  p_source        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_terms_version IS NULL OR btrim(p_terms_version) = '' THEN
    RAISE EXCEPTION 'terms_version_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.signup_consents (user_id, terms_version, source)
  VALUES (
    auth.uid(),
    left(btrim(p_terms_version), 40),
    CASE WHEN p_source IN ('web', 'ios', 'android') THEN p_source ELSE 'unknown' END
  )
  ON CONFLICT (user_id) DO NOTHING;   -- first acceptance stays the evidence
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_signup_consent(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_signup_consent(text, text) TO authenticated;

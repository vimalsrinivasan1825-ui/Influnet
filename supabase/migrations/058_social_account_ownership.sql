-- Migration 058: Social account OWNERSHIP handshake (bio-code challenge)
--
-- Proves a user CONTROLS a social handle without OAuth: the server issues a
-- single-use, expiring, high-entropy code bound to (user, platform, handle); the
-- user places it in a surface only the owner can edit (Instagram bio); a
-- SERVER-SIDE scrape confirms it. Ownership is the anti-impersonation gate — the
-- scorer never auto-verifies an account without a matching verified claim.
--
-- See docs/product/PROJECTS_AND_VERIFICATION.md §2.12 for the threat model.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_account_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'website')),
  handle          text NOT NULL,                        -- normalized (lowercased for instagram)
  code            text NOT NULL,                        -- server-issued challenge secret
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'verified', 'expired', 'revoked')),
  attempts        integer NOT NULL DEFAULT 0,           -- confirm attempts (rate-limit + audit)
  expires_at      timestamptz NOT NULL,
  verified_at     timestamptz,
  last_attempt_at timestamptz,
  proof           jsonb,                                -- {scraped_at, snippet}
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One active claim row per (user, platform, handle).
CREATE UNIQUE INDEX IF NOT EXISTS social_claims_user_platform_handle_uidx
  ON public.social_account_claims (user_id, platform, handle);

-- GLOBAL anti-impersonation backbone: at most one VERIFIED owner per
-- (platform, handle). A handle can never be verified-owned by two accounts.
CREATE UNIQUE INDEX IF NOT EXISTS social_claims_verified_unique_uidx
  ON public.social_account_claims (platform, handle) WHERE status = 'verified';

ALTER TABLE public.social_account_claims ENABLE ROW LEVEL SECURITY;

-- Users read their own claims; admins read all (is_admin from migration 038).
DROP POLICY IF EXISTS social_claims_select_own ON public.social_account_claims;
CREATE POLICY social_claims_select_own ON public.social_account_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

GRANT SELECT ON public.social_account_claims TO authenticated;
-- Writes go through the SECURITY DEFINER RPCs below only (no direct INSERT/UPDATE
-- policy on purpose).

-- ---------------------------------------------------------------------------
-- 2. initiate_social_claim(): create or reset a pending challenge
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initiate_social_claim(
  p_platform    text,
  p_handle      text,
  p_code        text,
  p_ttl_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_platform NOT IN ('instagram', 'linkedin', 'website') THEN
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;
  IF p_handle IS NULL OR length(btrim(p_handle)) = 0 THEN
    RAISE EXCEPTION 'Handle is required';
  END IF;

  -- Refuse if this handle is already verified by a DIFFERENT user.
  IF EXISTS (
    SELECT 1 FROM public.social_account_claims
    WHERE platform = p_platform AND handle = p_handle
      AND status = 'verified' AND user_id <> uid
  ) THEN
    RAISE EXCEPTION 'This % account is already verified by another Influnet account', p_platform
      USING ERRCODE = 'raise_exception';
  END IF;

  INSERT INTO public.social_account_claims (user_id, platform, handle, code, status, attempts, expires_at, verified_at, updated_at)
  VALUES (uid, p_platform, p_handle, p_code, 'pending', 0, now() + make_interval(secs => p_ttl_seconds), NULL, now())
  ON CONFLICT (user_id, platform, handle) DO UPDATE
    SET code = EXCLUDED.code,
        status = 'pending',
        attempts = 0,
        expires_at = EXCLUDED.expires_at,
        verified_at = NULL,
        last_attempt_at = NULL,
        proof = NULL,
        updated_at = now()
  RETURNING id INTO cid;

  RETURN jsonb_build_object('claim_id', cid, 'status', 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_social_claim(text, text, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. confirm_social_claim(): record a confirm attempt; verify iff matched
-- The Node route scrapes the live bio and matches the code, then passes the
-- boolean result here. This always bumps attempts (rate-limit/audit) and only
-- flips to 'verified' when p_matched is true and the claim is still pending +
-- unexpired. The verified partial-unique index blocks a second owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_social_claim(
  p_platform text,
  p_handle   text,
  p_matched  boolean,
  p_proof    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  new_status text;
  new_attempts integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.social_account_claims
    SET attempts = attempts + 1,
        last_attempt_at = now(),
        status = CASE WHEN p_matched THEN 'verified' ELSE status END,
        verified_at = CASE WHEN p_matched THEN now() ELSE verified_at END,
        proof = CASE WHEN p_matched THEN p_proof ELSE proof END,
        updated_at = now()
  WHERE user_id = uid AND platform = p_platform AND handle = p_handle
    AND status = 'pending' AND expires_at > now()
  RETURNING status, attempts INTO new_status, new_attempts;

  IF new_status IS NULL THEN
    RAISE EXCEPTION 'No pending, unexpired verification to confirm — start again'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object('status', new_status, 'attempts', new_attempts, 'matched', p_matched);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This % account was just verified by another Influnet account', p_platform
      USING ERRCODE = 'raise_exception';
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_social_claim(text, text, boolean, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. admin_revoke_social_claim(): let an admin unbind a stale/abused claim
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_social_claim(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.social_account_claims
    SET status = 'revoked', updated_at = now()
  WHERE id = p_claim_id;
  RETURN jsonb_build_object('claim_id', p_claim_id, 'status', 'revoked');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_social_claim(uuid) TO authenticated;

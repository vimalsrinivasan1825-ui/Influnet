-- Migration 193: Business email-domain verification
--
-- New signal in the shared verification pipeline (055): does a business's
-- email sit on their own company domain, and did they prove they control
-- that inbox? A business with no dedicated domain can still verify with a
-- personal address — it just does not earn this signal (see
-- lib/verification-scraper.ts emailDomainMatch() for the matching algorithm
-- and lib/verification.ts for the score weight). This is a v1: the domain
-- comparison is string-based (website-on-file, or a slug of the company
-- name), not a live WHOIS/DNS lookup — that is future ideation, not built
-- here.
--
-- Mirrors the OTP-claim shape of migration 058 (social_account_claims) and
-- the service-role-only confirm pattern locked down in 185.

-- ---------------------------------------------------------------------------
-- 1. business_profiles columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS verification_email text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified_domain text;

-- email_verified already exists (migration 024) but was never written by any
-- code path — this migration gives it its first real writer and meaning.
COMMENT ON COLUMN public.business_profiles.email_verified IS
  'True once the business proved control of verification_email via a one-time code (see email_domain_claims). Reset to false whenever verification_email changes.';
COMMENT ON COLUMN public.business_profiles.verification_email IS
  'The email address being verified for the domain-match score signal. May differ from the account login email — a business can verify a company-domain address instead.';
COMMENT ON COLUMN public.business_profiles.email_verified_domain IS
  'Domain of verification_email at the moment it was last confirmed. Audit trail only — current scoring recomputes the match live from verification_email.';

-- ---------------------------------------------------------------------------
-- 2. email_domain_claims: one-time-code sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_domain_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  email           text NOT NULL,
  code            text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'verified', 'expired')),
  attempts        integer NOT NULL DEFAULT 0,
  expires_at      timestamptz NOT NULL,
  verified_at     timestamptz,
  last_attempt_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One active claim row per (user, email) — re-initiating the same address
-- resets it rather than piling up rows.
CREATE UNIQUE INDEX IF NOT EXISTS email_domain_claims_user_email_uidx
  ON public.email_domain_claims (user_id, email);

ALTER TABLE public.email_domain_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_domain_claims_select_own ON public.email_domain_claims;
CREATE POLICY email_domain_claims_select_own ON public.email_domain_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

GRANT SELECT ON public.email_domain_claims TO authenticated;
-- Writes go through the SECURITY DEFINER RPCs below only.

-- ---------------------------------------------------------------------------
-- 3. initiate_email_domain_claim(): create or reset a pending code challenge
-- Harmless self-service — callable by any authenticated user for their own
-- account, same as initiate_social_claim (058).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initiate_email_domain_claim(
  p_email       text,
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
  norm_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF norm_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) = 0 THEN
    RAISE EXCEPTION 'A code is required';
  END IF;

  INSERT INTO public.email_domain_claims (user_id, email, code, status, attempts, expires_at, verified_at, updated_at)
  VALUES (uid, norm_email, p_code, 'pending', 0, now() + make_interval(secs => p_ttl_seconds), NULL, now())
  ON CONFLICT (user_id, email) DO UPDATE
    SET code = EXCLUDED.code,
        status = 'pending',
        attempts = 0,
        expires_at = EXCLUDED.expires_at,
        verified_at = NULL,
        last_attempt_at = NULL,
        updated_at = now()
  RETURNING id INTO cid;

  RETURN jsonb_build_object('claim_id', cid, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_email_domain_claim(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_email_domain_claim(text, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. confirm_email_domain_claim(): compare the code and flip the claim
--
-- Service-role only, like confirm_social_claim after 185: this is the RPC
-- that authoritatively decides success, so a direct-PostgREST grant to
-- `authenticated` would let a caller brute-force a 6-digit code against their
-- own claim row with no rate limit but ours. Going through the privileged
-- server client means only the Node route (which rate-limits first) can ever
-- call it. The code comparison happens in SQL itself, not in Node — there is
-- no external scrape to arbitrate here, so there is nothing to gain by
-- deciding the match anywhere but next to the stored secret.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_email_domain_claim(
  p_user_id uuid,
  p_email   text,
  p_code    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.email_domain_claims%ROWTYPE;
  matched boolean;
  norm_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO rec FROM public.email_domain_claims
    WHERE user_id = p_user_id AND email = norm_email
    FOR UPDATE;

  IF rec.id IS NULL OR rec.status <> 'pending' OR rec.expires_at < now() THEN
    RAISE EXCEPTION 'No pending, unexpired verification to confirm — start again'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF rec.attempts >= 6 THEN
    RAISE EXCEPTION 'Too many attempts — start verification again'
      USING ERRCODE = 'too_many_rows';
  END IF;

  matched := rec.code = p_code;

  UPDATE public.email_domain_claims
    SET attempts = attempts + 1,
        last_attempt_at = now(),
        status = CASE WHEN matched THEN 'verified' ELSE status END,
        verified_at = CASE WHEN matched THEN now() ELSE verified_at END,
        updated_at = now()
    WHERE id = rec.id;

  IF matched THEN
    UPDATE public.business_profiles
      SET email_verified = true,
          email_verified_at = now(),
          email_verified_domain = lower(split_part(norm_email, '@', 2))
      WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('matched', matched, 'attempts', rec.attempts + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_email_domain_claim(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_email_domain_claim(uuid, text, text) TO service_role;

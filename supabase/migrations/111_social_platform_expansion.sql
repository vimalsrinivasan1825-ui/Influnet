-- Migration 111: Facebook, X and Snapchat as first-class social platforms
--
-- Instagram and YouTube were the only platforms anything ever READ. Facebook and
-- Twitter handles were collected at signup and then sat in text columns nobody
-- fetched; Snapchat didn't exist at all. This migration opens the storage side
-- so the new handlers (apps/web/src/lib/social/*) have somewhere to write.
--
-- Twitter note: the product now calls it X, but the existing column is
-- `twitter_handle` and the snapshot platform key stays 'twitter' to match it.
-- Renaming would break every RPC that projects 'twitterHandle' (027, 046, …)
-- for a cosmetic gain; the display name lives in the UI layer instead.

-- ---------------------------------------------------------------------------
-- 1. social_snapshots: allow the new platform keys
-- ---------------------------------------------------------------------------
-- The original CHECK was an inline constraint with a generated name; drop by
-- discovery rather than by a guessed name so this is safe to re-run.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.social_snapshots'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%platform%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.social_snapshots DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.social_snapshots
  ADD CONSTRAINT social_snapshots_platform_check
  CHECK (platform IN ('instagram', 'youtube', 'tiktok', 'facebook', 'twitter', 'snapchat'));

-- ---------------------------------------------------------------------------
-- 2. Snapchat handle storage
-- ---------------------------------------------------------------------------
-- Snapchat is link-only for now (no public metrics surface worth reading —
-- see lib/social/snapchat.ts), so it gets a handle column and deliberately NO
-- follower column: a followers number we cannot measure would be a number
-- somebody eventually displays.
ALTER TABLE public.influencer_profiles
  ADD COLUMN IF NOT EXISTS snapchat_handle TEXT;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS snapchat_handle TEXT;

-- ---------------------------------------------------------------------------
-- 3. Audience counters for the platforms we can now measure
-- ---------------------------------------------------------------------------
-- facebook_followers already exists (migration 015). Twitter never had one, so
-- a scraped X follower count had nowhere to land.
ALTER TABLE public.influencer_profiles
  ADD COLUMN IF NOT EXISTS twitter_followers INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. Ownership claims: let the bio-code check cover the new platforms
-- ---------------------------------------------------------------------------
-- Migration 058 hard-codes the platform list in BOTH the table constraint and
-- the RPC body. Facebook and X have public bio/description fields, so the same
-- one-time-code-in-bio proof works there unchanged. Snapchat is excluded on
-- purpose: no readable public bio means no way to check a code, and a claim
-- type that can never be verified is a dead end in the UI.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.social_account_claims'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%platform%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.social_account_claims DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.social_account_claims
  ADD CONSTRAINT social_account_claims_platform_check
  CHECK (platform IN ('instagram', 'linkedin', 'website', 'facebook', 'twitter'));

-- initiate_social_claim re-validates the platform inside its own body (058),
-- so the table constraint alone would still leave the RPC rejecting the new
-- values. Replaced verbatim from 058 with only the platform list widened —
-- every other line, including the last_attempt_at/proof reset on conflict and
-- the raise_exception errcode, is unchanged.
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
  IF p_platform NOT IN ('instagram', 'linkedin', 'website', 'facebook', 'twitter') THEN
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

COMMENT ON CONSTRAINT social_snapshots_platform_check ON public.social_snapshots
  IS 'Platforms with a snapshot writer. Add here first, then a handler in lib/social/.';

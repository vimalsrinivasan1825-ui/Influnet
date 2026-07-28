\set ON_ERROR_STOP on
\pset pager off

-- Self-awarded "Verified creator" badge regression tests (migration 083).
--
-- Before 083, `influencer_profiles` kept Supabase's stock table-wide UPDATE
-- grant and its UPDATE policy had no WITH CHECK and no column restriction, so any
-- authenticated creator could PATCH PostgREST directly:
--     supabase.from('influencer_profiles').update({ is_verified: true })
-- and their public /c/<username> page — which read the badge from that legacy
-- column — would show "VERIFIED CREATOR". These assertions must never go
-- green-to-red again.
--
-- Two halves have to hold, and the second matters more:
--   * the forgery is refused, AND
--   * a legitimately verified creator still gets the badge, and honest self-edits
--     still go through — a rule that blocks honest users is worse than the hole.
--
-- Run AFTER the harness + all migrations. This file replicates Supabase's stock
-- grants itself (so the harness isn't vacuously more restrictive than prod) and
-- re-applies 083's lockdown on top, exactly the way the live event-trigger +
-- migration ordering produces.

-- ── Replicate prod grants, then re-apply the 083 lockdown ──────────────────
-- Supabase grants schema USAGE to the client roles; a bare harness may not.
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE UPDATE ON public.influencer_profiles FROM authenticated;
REVOKE UPDATE ON public.influencer_profiles FROM anon;
GRANT UPDATE (
  bio, niche,
  instagram_handle, youtube_handle, twitter_handle, facebook_handle,
  linkedin_handle, tiktok_handle, extra_social_links,
  gender, city, state, languages, collab_types, price_range,
  profile_slug, avatar_url, cover_image_url,
  instagram_followers, youtube_subscribers, tiktok_followers, facebook_followers,
  engagement_rate, media_kit_url, portfolio, pricing_min, pricing_max,
  username, username_changed_at,
  headline, availability_status, audience_demographics, past_collaborations,
  onboarding_step, is_profile_complete, onboarding_completed,
  secondary_categories,
  updated_at
) ON public.influencer_profiles TO authenticated;

CREATE OR REPLACE FUNCTION t_check(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION t_denied(label text, stmt text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'PASS  % (blocked: %)', label, left(SQLERRM, 60); RETURN;
  END;
  RAISE EXCEPTION 'FAIL  % — the statement was ALLOWED', label;
END $$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('cccc3333-0000-0000-0000-00000000000c','sec.creator@test.com'),
  ('dddd4444-0000-0000-0000-00000000000d','sec.other@test.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, email, name) VALUES
  ('cccc3333-0000-0000-0000-00000000000c','influencer','sec.creator@test.com','Vera Creator'),
  ('dddd4444-0000-0000-0000-00000000000d','influencer','sec.other@test.com','Otto Other')
ON CONFLICT DO NOTHING;
INSERT INTO public.influencer_profiles (user_id, username, bio) VALUES
  ('cccc3333-0000-0000-0000-00000000000c','vera','before'),
  ('dddd4444-0000-0000-0000-00000000000d','otto','before')
ON CONFLICT (user_id) DO UPDATE
  SET username = EXCLUDED.username, bio = EXCLUDED.bio, is_verified = false;
-- Reset the real pipeline state too, so the suite is re-runnable in place.
UPDATE public.profiles SET verification_status = 'unverified'
  WHERE id IN ('cccc3333-0000-0000-0000-00000000000c','dddd4444-0000-0000-0000-00000000000d');

-- ── The badge-forgery vector is closed ─────────────────────────────────────
SET ROLE authenticated;
SET request.test.uid = 'cccc3333-0000-0000-0000-00000000000c';

SELECT t_denied('a creator cannot self-award the verified badge (is_verified)',
  $$UPDATE public.influencer_profiles SET is_verified = true WHERE user_id = 'cccc3333-0000-0000-0000-00000000000c'$$);
SELECT t_denied('...not even bundled with a legitimate column edit',
  $$UPDATE public.influencer_profiles SET bio = 'hi', is_verified = true WHERE user_id = 'cccc3333-0000-0000-0000-00000000000c'$$);
SELECT t_denied('a creator cannot flip is_verified on someone else''s row',
  $$UPDATE public.influencer_profiles SET is_verified = true WHERE user_id = 'dddd4444-0000-0000-0000-00000000000d'$$);
-- Re-owning a row is refused: user_id is outside the column grant, and the
-- UPDATE policy's WITH CHECK (added in 083) would reject it at the row layer too.
SELECT t_denied('a creator cannot re-own their row to another user_id',
  $$UPDATE public.influencer_profiles SET user_id = 'dddd4444-0000-0000-0000-00000000000d' WHERE user_id = 'cccc3333-0000-0000-0000-00000000000c'$$);

-- ── Legitimate self-service still works ────────────────────────────────────
UPDATE public.influencer_profiles SET bio = 'after', headline = 'Food creator'
WHERE user_id = 'cccc3333-0000-0000-0000-00000000000c';
SELECT t_check('a creator CAN still edit their own bio/headline',
  (SELECT bio = 'after' AND headline = 'Food creator'
     FROM public.influencer_profiles WHERE user_id = 'cccc3333-0000-0000-0000-00000000000c'));

RESET ROLE;
SELECT t_check('after every attack the legacy flag is still false',
  (SELECT is_verified = false FROM public.influencer_profiles WHERE user_id = 'cccc3333-0000-0000-0000-00000000000c'));

-- ── The public RPC ignores the legacy flag entirely ────────────────────────
-- Force the legacy column true from a privileged connection (the way the old
-- exploit would have left it) while the real pipeline says nothing.
UPDATE public.influencer_profiles SET is_verified = true
  WHERE user_id = 'cccc3333-0000-0000-0000-00000000000c';
SELECT t_check('a stale/forged is_verified does NOT produce a public badge',
  (public.get_public_influencer('vera')->>'isVerified')::boolean = false);

-- ── A legitimately verified creator DOES get the badge ─────────────────────
-- The real pipeline moves profiles.verification_status; the 055 trigger keeps
-- verified_badge in sync, and the RPC now reads that.
UPDATE public.profiles SET verification_status = 'verified'
  WHERE id = 'cccc3333-0000-0000-0000-00000000000c';
SELECT t_check('verified_badge is set by the pipeline, not the legacy flag',
  (SELECT verified_badge FROM public.profiles WHERE id = 'cccc3333-0000-0000-0000-00000000000c') = true);
SELECT t_check('a pipeline-verified creator shows the public badge',
  (public.get_public_influencer('vera')->>'isVerified')::boolean = true);

-- ── And revoking verification pulls the badge back ─────────────────────────
UPDATE public.profiles SET verification_status = 'rejected'
  WHERE id = 'cccc3333-0000-0000-0000-00000000000c';
SELECT t_check('revoking verification removes the public badge',
  (public.get_public_influencer('vera')->>'isVerified')::boolean = false);

SELECT '── ALL INFLUENCER-VERIFICATION ASSERTIONS PASSED ──' AS result;

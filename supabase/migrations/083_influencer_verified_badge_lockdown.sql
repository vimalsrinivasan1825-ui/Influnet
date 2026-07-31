-- Migration 083: Close the self-awarded "Verified creator" badge hole.
--
-- WHY THIS EXISTS
--
-- Migration 048/070 locked down `profiles` (column-scoped UPDATE grant, no
-- `role`/`verification_status`/`verified_badge`) — but `influencer_profiles`
-- never got the same treatment. Three things lined up into an exploit:
--
--   1. Supabase's stock grants include table-wide UPDATE on public tables, and
--      `influencer_profiles` was never re-scoped, so `authenticated` (and `anon`)
--      could write EVERY column, including `is_verified`.
--   2. `influencer_profiles_update_own` (migration 001) is USING (auth.uid() =
--      user_id) with NO WITH CHECK and no column restriction — it authorises the
--      ROW, never the columns or the values.
--   3. `get_public_influencer` rendered the public badge from the legacy
--      `influencer_profiles.is_verified` column, which the real verification
--      pipeline (055/058: submit_verification / admin_decide_verification writing
--      `profiles.verification_status` / `profiles.verified_badge`) never touches.
--
-- So any signed-in creator could
--   supabase.from('influencer_profiles').update({ is_verified: true })
-- via PostgREST and their /c/<username> page would show "VERIFIED CREATOR".
--
-- Fix: (1) revoke the table-wide UPDATE and re-grant only the user-editable
-- columns (is_verified excluded), mirroring how 048/070 hardened `profiles`;
-- (2) add a WITH CHECK to the UPDATE policy; (3) point the public RPC at the
-- real pipeline so a legitimately verified creator gets the badge and a forged
-- legacy flag can no longer produce one.

-- ---------------------------------------------------------------------------
-- 1. Column-scoped UPDATE grant (is_verified is no longer writable by clients)
--    Follower counts + verification state are written server-side via the
--    service-role key (lib/social-snapshot.ts) or SECURITY DEFINER RPCs, both of
--    which bypass these grants; the authenticated client only edits the
--    self-service fields below (see ProfileUpdateSchema).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. WITH CHECK on the UPDATE policy: a creator may only leave a row that is
--    still their own. (USING gates which rows are visible to update; WITH CHECK
--    gates what the row may become — without it, re-owning a row via user_id was
--    not blocked at the policy layer.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "influencer_profiles_update_own" ON public.influencer_profiles;
CREATE POLICY "influencer_profiles_update_own"
  ON public.influencer_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Public profile badge reads the REAL pipeline, not the legacy flag.
--    profiles.verified_badge is kept in sync with verification_status by the
--    sync_verified_badge trigger (055) and is only ever set 'verified' by
--    submit_verification (auto, high-confidence) or admin_decide_verification.
--    Only the `isVerified` source changes below; the rest is migration 046 verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_influencer(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_name TEXT;
  v_location TEXT;
  v_verified BOOLEAN;
  v_ip public.influencer_profiles%ROWTYPE;
  needle TEXT;
  slug_custom TEXT;
  rec RECORD;
BEGIN
  needle := lower(trim(coalesce(p_slug, '')));
  IF needle = '' THEN
    RETURN NULL;
  END IF;

  -- Primary: dedicated username
  SELECT p.id, p.name, p.location, p.verified_badge
  INTO v_user_id, v_name, v_location, v_verified
  FROM public.profiles p
  INNER JOIN public.influencer_profiles ip ON ip.user_id = p.id
  WHERE p.role = 'influencer'
    AND ip.username IS NOT NULL
    AND ip.username <> ''
    AND lower(ip.username) = needle
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_ip FROM public.influencer_profiles WHERE user_id = v_user_id;
    RETURN jsonb_build_object(
      'userId', v_user_id,
      'name', v_name,
      'location', v_location,
      'city', v_ip.city,
      'state', v_ip.state,
      'username', v_ip.username,
      'profileSlug', v_ip.username,
      'headline', v_ip.headline,
      'bio', v_ip.bio,
      'niche', coalesce(v_ip.niche, '[]'::jsonb),
      'avatarUrl', v_ip.avatar_url,
      'coverImageUrl', v_ip.cover_image_url,
      'availabilityStatus', v_ip.availability_status,
      'audienceDemographics', coalesce(v_ip.audience_demographics, '{}'::jsonb),
      'pastCollaborations', coalesce(v_ip.past_collaborations, '[]'::jsonb),
      'isVerified', coalesce(v_verified, false),
      'instagramHandle', v_ip.instagram_handle,
      'youtubeHandle', v_ip.youtube_handle,
      'twitterHandle', v_ip.twitter_handle,
      'facebookHandle', v_ip.facebook_handle,
      'linkedinHandle', v_ip.linkedin_handle,
      'tiktokHandle', v_ip.tiktok_handle,
      'instagramFollowers', coalesce(v_ip.instagram_followers, 0),
      'youtubeSubscribers', coalesce(v_ip.youtube_subscribers, 0),
      'tiktokFollowers', coalesce(v_ip.tiktok_followers, 0),
      'facebookFollowers', coalesce(v_ip.facebook_followers, 0),
      'engagementRate', v_ip.engagement_rate,
      'mediaKitUrl', v_ip.media_kit_url,
      'portfolio', coalesce(v_ip.portfolio, '[]'::jsonb),
      'pricingMin', v_ip.pricing_min,
      'pricingMax', v_ip.pricing_max,
      'collabTypes', coalesce(v_ip.collab_types, '[]'::jsonb),
      'priceRange', v_ip.price_range,
      'languages', coalesce(v_ip.languages, '[]'::jsonb)
    );
  END IF;

  -- Legacy: custom profile_slug (hyphen slugs)
  FOR rec IN
    SELECT p.id, p.name, p.location, p.verified_badge
    FROM public.profiles p
    WHERE p.role = 'influencer'
  LOOP
    SELECT * INTO v_ip FROM public.influencer_profiles WHERE user_id = rec.id;
    slug_custom := lower(
      trim(
        both '-'
        from regexp_replace(lower(trim(coalesce(v_ip.profile_slug, ''))), '[^a-z0-9]+', '-', 'g')
      )
    );
    IF slug_custom <> '' AND slug_custom = lower(regexp_replace(needle, '[^a-z0-9]+', '-', 'g')) THEN
      RETURN jsonb_build_object(
        'userId', rec.id,
        'name', rec.name,
        'location', rec.location,
        'city', v_ip.city,
        'state', v_ip.state,
        'username', v_ip.username,
        'profileSlug', coalesce(v_ip.username, slug_custom),
        'headline', v_ip.headline,
        'bio', v_ip.bio,
        'niche', coalesce(v_ip.niche, '[]'::jsonb),
        'avatarUrl', v_ip.avatar_url,
        'coverImageUrl', v_ip.cover_image_url,
        'availabilityStatus', v_ip.availability_status,
        'audienceDemographics', coalesce(v_ip.audience_demographics, '{}'::jsonb),
        'pastCollaborations', coalesce(v_ip.past_collaborations, '[]'::jsonb),
        'isVerified', coalesce(rec.verified_badge, false),
        'instagramHandle', v_ip.instagram_handle,
        'youtubeHandle', v_ip.youtube_handle,
        'twitterHandle', v_ip.twitter_handle,
        'facebookHandle', v_ip.facebook_handle,
        'linkedinHandle', v_ip.linkedin_handle,
        'tiktokHandle', v_ip.tiktok_handle,
        'instagramFollowers', coalesce(v_ip.instagram_followers, 0),
        'youtubeSubscribers', coalesce(v_ip.youtube_subscribers, 0),
        'tiktokFollowers', coalesce(v_ip.tiktok_followers, 0),
        'facebookFollowers', coalesce(v_ip.facebook_followers, 0),
        'engagementRate', v_ip.engagement_rate,
        'mediaKitUrl', v_ip.media_kit_url,
        'portfolio', coalesce(v_ip.portfolio, '[]'::jsonb),
        'pricingMin', v_ip.pricing_min,
        'pricingMax', v_ip.pricing_max,
        'collabTypes', coalesce(v_ip.collab_types, '[]'::jsonb),
        'priceRange', v_ip.price_range,
        'languages', coalesce(v_ip.languages, '[]'::jsonb)
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

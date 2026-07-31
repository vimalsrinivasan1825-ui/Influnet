-- Migration 095: expose ownership-claim status from get_public_influencer().
--
-- WHY THIS EXISTS
--
-- The public profile page's "Ownership not verified" banner reads
-- `isVerified` — which is profiles.verified_badge, the FULL trust-pipeline
-- badge (083). That badge needs TWO things: proven ownership of the handle
-- (social_account_claims, 058) AND a high-confidence score from the metrics
-- pipeline (verification.ts). A creator who has genuinely completed the
-- bio-link handshake but has too small an audience to auto-approve sees the
-- banner tell them, verbatim, that they "hasn't added their Influnet
-- verification link to their Instagram bio yet" — which is false, and the
-- one thing they actually did.
--
-- Fix: expose ownership status as its OWN field, `ownershipVerified`,
-- alongside the existing `isVerified`. The frontend (creator-profile-view.tsx)
-- uses it to stop misattributing a pending trust-score to a missing bio link.
-- No grant/policy changes — this only widens the SECURITY DEFINER function's
-- return shape. Function bodies are migration 083 verbatim plus the new field.

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
  v_ownership_verified BOOLEAN;
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
    SELECT EXISTS (
      SELECT 1 FROM public.social_account_claims c
      WHERE c.user_id = v_user_id
        AND c.platform = 'instagram'
        AND c.status = 'verified'
        AND c.handle = lower(trim(coalesce(v_ip.instagram_handle, '')))
    ) INTO v_ownership_verified;

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
      'ownershipVerified', coalesce(v_ownership_verified, false),
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
      SELECT EXISTS (
        SELECT 1 FROM public.social_account_claims c
        WHERE c.user_id = rec.id
          AND c.platform = 'instagram'
          AND c.status = 'verified'
          AND c.handle = lower(trim(coalesce(v_ip.instagram_handle, '')))
      ) INTO v_ownership_verified;

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
        'ownershipVerified', coalesce(v_ownership_verified, false),
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

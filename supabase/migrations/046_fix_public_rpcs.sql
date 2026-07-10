-- Fix get_public_influencer: rename variable ip to v_ip to avoid ambiguity with table alias
-- Fix get_public_business: remove p.avatar_url since avatar_url doesn't exist on profiles

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
  SELECT p.id, p.name, p.location
  INTO v_user_id, v_name, v_location
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
      'isVerified', coalesce(v_ip.is_verified, false),
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
    SELECT p.id, p.name, p.location
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
        'isVerified', coalesce(v_ip.is_verified, false),
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

CREATE OR REPLACE FUNCTION public.get_public_business(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_name TEXT;
  v_location TEXT;
  
  v_company_name TEXT;
  v_industry TEXT;
  v_team_size TEXT;
  v_mission TEXT;
  v_brand_story TEXT;
  v_products TEXT;
  v_services TEXT;
  v_trusted_partner BOOLEAN;
  v_username TEXT;
BEGIN
  SELECT p.id, p.name, p.location,
         bp.company_name, bp.industry, bp.team_size, bp.mission, bp.brand_story,
         bp.products, bp.services, bp.trusted_partner, bp.username
  INTO v_user_id, v_name, v_location,
       v_company_name, v_industry, v_team_size, v_mission, v_brand_story,
       v_products, v_services, v_trusted_partner, v_username
  FROM public.profiles p
  INNER JOIN public.business_profiles bp ON bp.user_id = p.id
  WHERE p.role = 'business_owner'
    AND bp.username IS NOT NULL
    AND bp.username <> ''
    AND lower(bp.username) = lower(p_slug)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'userId', v_user_id,
    'name', v_name,
    'location', v_location,
    'companyName', v_company_name,
    'industry', v_industry,
    'teamSize', v_team_size,
    'mission', v_mission,
    'brandStory', v_brand_story,
    'products', v_products,
    'services', v_services,
    'trustedPartner', v_trusted_partner,
    'username', v_username
  );
END;
$$;

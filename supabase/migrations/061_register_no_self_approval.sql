-- 061: Prevent business self-approval via register_profile.
--
-- register_profile previously took the new business's approval_status from the
-- client payload: COALESCE(payload->>'approvalStatus', 'pending_review'). Since
-- the /api/auth/register body is client-controlled (and the Zod schema uses
-- .passthrough()), a caller could POST `approvalStatus: 'approved'` and approve
-- their own business, bypassing admin review. Combined with the dashboard's soft
-- verification banner (pending businesses may browse but not reach out), that
-- would have granted full outreach access without review.
--
-- Fix: approval status is server-authoritative. New business rows are always
-- inserted as 'pending_review', and re-running register_profile can never raise
-- an existing row's approval_status. Only the admin verification flow (055) may
-- move a business to 'approved'/'rejected'.
--
-- Full CREATE OR REPLACE copied verbatim from 049 with exactly two changes,
-- both marked with `-- 061:` below.

CREATE OR REPLACE FUNCTION public.register_profile(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  r public.user_role;
  loc TEXT;
  uname TEXT;
  biz_uname TEXT;
  pmin NUMERIC;
  pmax NUMERIC;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  r := (payload->>'role')::public.user_role;

  -- >>> SECURITY: never allow self-service admin creation <<<
  IF r NOT IN ('business_owner', 'influencer') THEN
    RAISE EXCEPTION 'Invalid role for self-registration: %', r;
  END IF;

  loc := COALESCE(
    NULLIF(trim(payload->>'location'), ''),
    CASE
      WHEN payload->>'city' IS NOT NULL AND payload->>'state' IS NOT NULL
        THEN trim(payload->>'city') || ', ' || trim(payload->>'state')
      ELSE payload->>'city'
    END
  );
  uname := lower(trim(coalesce(payload->>'username', '')));
  biz_uname := lower(trim(coalesce(payload->>'businessUsername', payload->>'username', '')));

  INSERT INTO public.profiles (id, role, email, name, phone, location)
  VALUES (
    uid,
    r,
    COALESCE(payload->>'email', (SELECT email FROM auth.users WHERE id = uid)),
    payload->>'name',
    payload->>'phone',
    loc
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    location = EXCLUDED.location,
    updated_at = now();

  IF r = 'business_owner' THEN
    IF biz_uname <> '' THEN
      IF NOT public.is_valid_influnet_username(biz_uname) THEN
        RAISE EXCEPTION 'Invalid business username';
      END IF;
      IF public.is_username_globally_taken(biz_uname, uid) THEN
        RAISE EXCEPTION 'Username already taken';
      END IF;
    END IF;

    INSERT INTO public.business_profiles (
      user_id, company_name, industry, business_type, gst_number, website,
      collab_preferences, approval_status, marketing_budget, registered_address,
      city, state, instagram_handle, facebook_handle, linkedin_handle, username
    ) VALUES (
      uid,
      payload->>'companyName',
      payload->>'industry',
      payload->>'businessType',
      payload->>'gstNumber',
      payload->>'website',
      COALESCE(payload->'collabPreferences', '[]'::jsonb),
      'pending_review',  -- 061: server-authoritative; ignore any client approvalStatus
      payload->>'marketingBudget',
      payload->>'registeredAddress',
      payload->>'city',
      payload->>'state',
      payload->>'instagramHandle',
      payload->>'facebookHandle',
      payload->>'linkedinHandle',
      NULLIF(biz_uname, '')
    )
    ON CONFLICT (user_id) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      industry = EXCLUDED.industry,
      business_type = COALESCE(EXCLUDED.business_type, business_profiles.business_type),
      gst_number = EXCLUDED.gst_number,
      website = EXCLUDED.website,
      collab_preferences = EXCLUDED.collab_preferences,
      -- 061: approval_status intentionally NOT updated here — re-registration
      -- must never raise an existing row's approval. Admin flow (055) owns it.
      marketing_budget = COALESCE(EXCLUDED.marketing_budget, business_profiles.marketing_budget),
      registered_address = COALESCE(EXCLUDED.registered_address, business_profiles.registered_address),
      city = COALESCE(EXCLUDED.city, business_profiles.city),
      state = COALESCE(EXCLUDED.state, business_profiles.state),
      instagram_handle = COALESCE(EXCLUDED.instagram_handle, business_profiles.instagram_handle),
      facebook_handle = COALESCE(EXCLUDED.facebook_handle, business_profiles.facebook_handle),
      linkedin_handle = COALESCE(EXCLUDED.linkedin_handle, business_profiles.linkedin_handle),
      username = COALESCE(EXCLUDED.username, business_profiles.username),
      updated_at = now();
  ELSIF r = 'influencer' THEN
    IF uname = '' OR NOT public.is_valid_influnet_username(uname) THEN
      RAISE EXCEPTION 'Invalid Influnet username';
    END IF;
    IF public.is_username_globally_taken(uname, uid) THEN
      RAISE EXCEPTION 'Username already taken';
    END IF;

    SELECT ip.pricing_min, ip.pricing_max INTO pmin, pmax
    FROM public.influencer_pricing_from_tier(payload->>'priceRange') ip;

    INSERT INTO public.influencer_profiles (
      user_id, username, bio, niche, instagram_handle, youtube_handle, twitter_handle,
      gender, facebook_handle, linkedin_handle, extra_social_links,
      city, state, languages, collab_types, price_range,
      tiktok_handle, instagram_followers, facebook_followers, youtube_subscribers, tiktok_followers,
      pricing_min, pricing_max, onboarding_step, is_profile_complete
    ) VALUES (
      uid,
      uname,
      payload->>'bio',
      COALESCE(payload->'niche', '[]'::jsonb),
      payload->>'instagramHandle',
      payload->>'youtubeHandle',
      payload->>'twitterHandle',
      payload->>'gender',
      payload->>'facebookHandle',
      payload->>'linkedinHandle',
      COALESCE(payload->'extraSocialLinks', '[]'::jsonb),
      payload->>'city',
      payload->>'state',
      COALESCE(payload->'languages', '[]'::jsonb),
      COALESCE(payload->'collabTypes', '[]'::jsonb),
      payload->>'priceRange',
      payload->>'tiktokHandle',
      COALESCE((payload->>'instagramFollowers')::int, 0),
      COALESCE((payload->>'facebookFollowers')::int, 0),
      COALESCE((payload->>'youtubeSubscribers')::int, 0),
      COALESCE((payload->>'tiktokFollowers')::int, 0),
      pmin,
      pmax,
      2,
      false
    )
    ON CONFLICT (user_id) DO UPDATE SET
      username = COALESCE(EXCLUDED.username, influencer_profiles.username),
      bio = COALESCE(EXCLUDED.bio, influencer_profiles.bio),
      niche = COALESCE(EXCLUDED.niche, influencer_profiles.niche),
      instagram_handle = COALESCE(EXCLUDED.instagram_handle, influencer_profiles.instagram_handle),
      youtube_handle = COALESCE(EXCLUDED.youtube_handle, influencer_profiles.youtube_handle),
      twitter_handle = COALESCE(EXCLUDED.twitter_handle, influencer_profiles.twitter_handle),
      gender = COALESCE(EXCLUDED.gender, influencer_profiles.gender),
      facebook_handle = COALESCE(EXCLUDED.facebook_handle, influencer_profiles.facebook_handle),
      linkedin_handle = COALESCE(EXCLUDED.linkedin_handle, influencer_profiles.linkedin_handle),
      extra_social_links = COALESCE(EXCLUDED.extra_social_links, influencer_profiles.extra_social_links),
      city = COALESCE(EXCLUDED.city, influencer_profiles.city),
      state = COALESCE(EXCLUDED.state, influencer_profiles.state),
      languages = COALESCE(EXCLUDED.languages, influencer_profiles.languages),
      collab_types = COALESCE(EXCLUDED.collab_types, influencer_profiles.collab_types),
      price_range = COALESCE(EXCLUDED.price_range, influencer_profiles.price_range),
      tiktok_handle = COALESCE(EXCLUDED.tiktok_handle, influencer_profiles.tiktok_handle),
      instagram_followers = COALESCE(EXCLUDED.instagram_followers, influencer_profiles.instagram_followers),
      facebook_followers = COALESCE(EXCLUDED.facebook_followers, influencer_profiles.facebook_followers),
      youtube_subscribers = COALESCE(EXCLUDED.youtube_subscribers, influencer_profiles.youtube_subscribers),
      tiktok_followers = COALESCE(EXCLUDED.tiktok_followers, influencer_profiles.tiktok_followers),
      pricing_min = COALESCE(EXCLUDED.pricing_min, influencer_profiles.pricing_min),
      pricing_max = COALESCE(EXCLUDED.pricing_max, influencer_profiles.pricing_max),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_profile(JSONB) TO authenticated;

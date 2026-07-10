-- Add username to business_profiles

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

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
  v_avatar_url TEXT;
  
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
  SELECT p.id, p.name, p.location, p.avatar_url,
         bp.company_name, bp.industry, bp.team_size, bp.mission, bp.brand_story,
         bp.products, bp.services, bp.trusted_partner, bp.username
  INTO v_user_id, v_name, v_location, v_avatar_url,
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
    'avatarUrl', v_avatar_url,
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

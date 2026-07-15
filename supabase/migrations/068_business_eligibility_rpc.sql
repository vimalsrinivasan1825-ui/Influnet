-- get_business_eligibility: creator-facing, access-controlled view of a business.
--
-- A business owner's profile is NOT public. Only two viewers may see it:
--   1. the business owner themselves, and
--   2. a creator who has an established relationship with that business — a
--      collab request (either direction, pending/accepted) or a campaign project.
-- Any other viewer (including an anonymous visitor with a shared link) gets NULL,
-- and the page 404s. Access is enforced here in the DB (SECURITY DEFINER) so it
-- cannot be bypassed from the client.
--
-- The payload is a minimal "eligibility" summary — enough for a creator to judge
-- the brand's legitimacy (verification, on-platform collaboration track record,
-- industry, brand story) — and deliberately omits contact PII (email/phone).

CREATE OR REPLACE FUNCTION public.get_business_eligibility(
  p_slug TEXT,
  p_viewer_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_user_id UUID;
  v_has_access BOOLEAN := FALSE;
  v_completed INT;
  v_partners INT;
  v_result JSONB;
BEGIN
  IF p_viewer_user_id IS NULL OR coalesce(trim(p_slug), '') = '' THEN
    RETURN NULL;
  END IF;

  -- Resolve the username slug → business user id (kept internal so no anonymous
  -- lookup ever exposes the business identity).
  SELECT bp.user_id INTO v_business_user_id
  FROM public.business_profiles bp
  INNER JOIN public.profiles p ON p.id = bp.user_id AND p.role = 'business_owner'
  WHERE bp.username IS NOT NULL
    AND bp.username <> ''
    AND lower(bp.username) = lower(trim(p_slug))
  LIMIT 1;

  IF v_business_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_viewer_user_id = v_business_user_id THEN
    v_has_access := TRUE;
  ELSE
    SELECT
      EXISTS (
        SELECT 1 FROM public.collab_requests cr
        WHERE cr.status IN ('pending', 'accepted')
          AND (
            (cr.from_user_id = v_business_user_id AND cr.to_user_id = p_viewer_user_id) OR
            (cr.from_user_id = p_viewer_user_id AND cr.to_user_id = v_business_user_id)
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.campaign_projects cp
        WHERE
          (cp.owner_user_id = v_business_user_id AND cp.counterparty_user_id = p_viewer_user_id) OR
          (cp.owner_user_id = p_viewer_user_id AND cp.counterparty_user_id = v_business_user_id)
      )
    INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RETURN NULL;
  END IF;

  -- On-platform collaboration track record for this business.
  SELECT
    count(*) FILTER (WHERE cp.status = 'completed'),
    count(DISTINCT cp.counterparty_user_id)
  INTO v_completed, v_partners
  FROM public.campaign_projects cp
  WHERE cp.owner_user_id = v_business_user_id;

  SELECT jsonb_build_object(
    'userId', p.id,
    'name', p.name,
    'location', p.location,
    'memberSince', p.created_at,
    'verificationStatus', p.verification_status,
    'companyName', bp.company_name,
    'industry', bp.industry,
    'businessType', bp.business_type,
    'teamSize', bp.team_size,
    'website', bp.website,
    'city', bp.city,
    'state', bp.state,
    'mission', bp.mission,
    'brandStory', bp.brand_story,
    'products', bp.products,
    'services', bp.services,
    'trustedPartner', coalesce(bp.trusted_partner, false),
    'approvalStatus', bp.approval_status,
    'avatarUrl', bp.logo_url,
    'completedCollaborations', coalesce(v_completed, 0),
    'totalPartners', coalesce(v_partners, 0)
  )
  INTO v_result
  FROM public.profiles p
  JOIN public.business_profiles bp ON bp.user_id = p.id
  WHERE p.id = v_business_user_id AND p.role = 'business_owner';

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_business_eligibility(UUID, UUID) TO authenticated;

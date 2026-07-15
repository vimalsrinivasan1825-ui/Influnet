-- get_creator_collaborations: brand names from a creator's COMPLETED campaign
-- projects, for the public profile "past collaborations" wall.
--
-- Returns the business counterparty's company name (falling back to their
-- profile name) for every completed project the creator took part in. This is
-- trustworthy data (a real, finished collaboration on the platform) that the
-- creator cannot fabricate, and is merged with their self-reported list on the
-- public profile. SECURITY DEFINER so the anonymous public-profile read can call
-- it without exposing the underlying rows through RLS.

CREATE OR REPLACE FUNCTION public.get_creator_collaborations(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(brand ORDER BY brand), '[]'::jsonb)
  FROM (
    SELECT DISTINCT coalesce(nullif(trim(bp.company_name), ''), pr.name) AS brand
    FROM public.campaign_projects cp
    JOIN public.profiles pr
      ON pr.id = CASE
                   WHEN cp.owner_user_id = p_user_id THEN cp.counterparty_user_id
                   ELSE cp.owner_user_id
                 END
    LEFT JOIN public.business_profiles bp ON bp.user_id = pr.id
    WHERE cp.status = 'completed'
      AND (cp.owner_user_id = p_user_id OR cp.counterparty_user_id = p_user_id)
      AND pr.role = 'business_owner'
  ) t
  WHERE brand IS NOT NULL AND trim(brand) <> '';
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_collaborations(UUID) TO anon, authenticated;

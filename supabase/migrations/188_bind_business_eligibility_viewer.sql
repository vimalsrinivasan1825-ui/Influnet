-- get_business_eligibility trusted the caller-supplied p_viewer_user_id, so a
-- caller could pass the uuid of a business's collaborator and read the private
-- business profile. Bind the viewer to the authenticated caller; the service
-- role (no JWT identity) may still pass any viewer.
ALTER FUNCTION public.get_business_eligibility(TEXT, UUID)
  RENAME TO get_business_eligibility_impl;

REVOKE ALL ON FUNCTION public.get_business_eligibility_impl(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_eligibility_impl(TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_business_eligibility(
  p_slug TEXT,
  p_viewer_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_viewer_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;
  RETURN public.get_business_eligibility_impl(p_slug, p_viewer_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_eligibility(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_eligibility(TEXT, UUID) TO authenticated, service_role;

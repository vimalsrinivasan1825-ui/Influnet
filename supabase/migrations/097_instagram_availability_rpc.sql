-- Check if an instagram handle is already in use by either an influencer or business.
CREATE OR REPLACE FUNCTION public.check_instagram_available(p_handle TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.influencer_profiles WHERE lower(instagram_handle) = lower(trim(p_handle))
    UNION
    SELECT 1 FROM public.business_profiles WHERE lower(instagram_handle) = lower(trim(p_handle))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_instagram_available(TEXT) TO anon, authenticated;

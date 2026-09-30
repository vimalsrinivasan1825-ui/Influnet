-- Migration 190: stop clients forging analytics rows.
-- profile_link_clicks is not written by any client code, and business_profile_views
-- is written only by the SECURITY DEFINER record_business_profile_view(), so the
-- permissive INSERT policies just let anyone inflate another user's numbers.

REVOKE INSERT ON public.profile_link_clicks FROM anon, authenticated;
REVOKE INSERT ON public.business_profile_views FROM anon, authenticated;
DROP POLICY IF EXISTS profile_link_clicks_insert ON public.profile_link_clicks;
DROP POLICY IF EXISTS business_profile_views_insert ON public.business_profile_views;

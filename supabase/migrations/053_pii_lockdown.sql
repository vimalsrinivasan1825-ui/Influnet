-- Migration 053: Business PII lockdown (column-level grants)
--
-- Background: migration 048 locked down email/phone on `profiles` via
-- column grants. But `business_profiles` still had a broad
-- `business_profiles_select_authenticated USING (true)` policy AND a full
-- table SELECT grant, so ANY logged-in user could read sensitive business
-- columns: gst_number (tax id), registered_address, marketing_budget.
--
-- Fix (mirrors the 048 pattern):
--   * Revoke direct SELECT on business_profiles from anon + authenticated.
--   * Grant back ONLY the non-sensitive columns other authenticated code
--     reads directly (company_name, industry — already public via discovery).
--   * The owner reads their own full row through get_own_business_profile().
--   * Public profile pages keep working via get_public_business() (SECURITY DEFINER).
--   * Admin routes use the service-role key, which bypasses these grants.

-- 1. Column-level lockdown
REVOKE SELECT ON public.business_profiles FROM anon;
REVOKE SELECT ON public.business_profiles FROM authenticated;
GRANT SELECT (user_id, company_name, industry)
  ON public.business_profiles TO authenticated;

-- 2. Owner-only full-row accessor (used by GET /api/profile for a business).
CREATE OR REPLACE FUNCTION public.get_own_business_profile()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(bp) FROM public.business_profiles bp WHERE bp.user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_own_business_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_business_profile() TO authenticated;

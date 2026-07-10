-- Add 'admin' role support: function + RLS policies
-- Note: ALTER TYPE ... ADD VALUE must be run OUTSIDE the migration transaction.
-- Run manually first: ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';

-- ---------------------------------------------------------------------------
-- Step 1: SECURITY DEFINER helper — bypasses RLS so policies don't recurse
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Step 2: Admin read-everything policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "business_profiles_select_admin" ON public.business_profiles;
CREATE POLICY "business_profiles_select_admin"
  ON public.business_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "influencer_profiles_select_admin" ON public.influencer_profiles;
CREATE POLICY "influencer_profiles_select_admin"
  ON public.influencer_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "campaign_projects_select_admin" ON public.campaign_projects;
CREATE POLICY "campaign_projects_select_admin"
  ON public.campaign_projects FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "collab_requests_select_admin" ON public.collab_requests;
CREATE POLICY "collab_requests_select_admin"
  ON public.collab_requests FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Step 3: Admin update policies (approve/reject, override status)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "business_profiles_update_admin" ON public.business_profiles;
CREATE POLICY "business_profiles_update_admin"
  ON public.business_profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "collab_requests_update_admin" ON public.collab_requests;
CREATE POLICY "collab_requests_update_admin"
  ON public.collab_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Step 4: Admin delete policies (force-delete problematic projects/requests)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "campaign_projects_delete_admin" ON public.campaign_projects;
CREATE POLICY "campaign_projects_delete_admin"
  ON public.campaign_projects FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "collab_requests_delete_admin" ON public.collab_requests;
CREATE POLICY "collab_requests_delete_admin"
  ON public.collab_requests FOR DELETE
  TO authenticated
  USING (public.is_admin());

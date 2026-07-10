-- Fix campaign_projects RLS policy for insert to allow either participant (owner or counterparty) to insert a project.
-- This ensures that when the influencer (counterparty) accepts the collaboration request, the automatic project creation succeeds.

DROP POLICY IF EXISTS "campaign_projects_insert_owner" ON public.campaign_projects;

CREATE POLICY "campaign_projects_insert_owner"
  ON public.campaign_projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id OR auth.uid() = counterparty_user_id);

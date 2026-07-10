-- Add cancel_requested_by column to campaign_projects and enable DELETE policy for participants.

ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS cancel_requested_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "campaign_projects_delete_participant" ON public.campaign_projects;

CREATE POLICY "campaign_projects_delete_participant"
  ON public.campaign_projects FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id OR auth.uid() = counterparty_user_id);

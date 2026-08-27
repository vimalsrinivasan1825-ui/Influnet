-- Migration 126: Campaign applications
--
-- Creators apply to live campaigns. Brands shortlist, accept, or decline.
-- An applicant must not be able to enumerate other applicants.

CREATE TABLE IF NOT EXISTS public.campaign_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creator_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pitch           text NOT NULL,
  proposed_rate   numeric,
  status          text NOT NULL DEFAULT 'applied'
                    CHECK (status IN ('applied', 'shortlisted', 'accepted', 'declined', 'withdrawn')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  UNIQUE (campaign_id, creator_user_id)
);

ALTER TABLE public.campaign_applications ENABLE ROW LEVEL SECURITY;

-- Applicant reads and writes their own row
DROP POLICY IF EXISTS campaign_applications_applicant ON public.campaign_applications;
CREATE POLICY campaign_applications_applicant ON public.campaign_applications
  FOR ALL TO authenticated
  USING (creator_user_id = auth.uid())
  WITH CHECK (creator_user_id = auth.uid());

-- Campaign owner reads all rows for their campaign
DROP POLICY IF EXISTS campaign_applications_owner ON public.campaign_applications;
CREATE POLICY campaign_applications_owner ON public.campaign_applications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND c.business_user_id = auth.uid()
    )
  );

-- Campaign owner may update status (shortlist, accept, decline)
DROP POLICY IF EXISTS campaign_applications_owner_update ON public.campaign_applications;
CREATE POLICY campaign_applications_owner_update ON public.campaign_applications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND c.business_user_id = auth.uid()
    )
  );

-- Migration 163: a report can say WHERE it was made (a campaign, a collaboration
-- request, a profile…), not just who it is about.
--
-- WHY (launch audit 2026-09-18, unit set-block)
--
-- Apple 1.2 / Google UGC want reporting wherever people meet content. Reports
-- could only point at a person plus an optional project. A brand's campaign
-- brief, a collaboration request and a public profile are the other places
-- strangers meet, and the admin Reports queue had no way to show which one a
-- report came from, so a moderator had to guess what to look at.
--
-- The report is still ABOUT a person (reported_id); these columns are context.
-- ON DELETE SET NULL: deleting a campaign or a request must never delete the
-- evidence that someone reported it.

ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collab_request_id uuid REFERENCES public.collab_requests (id) ON DELETE SET NULL;

ALTER TABLE public.user_reports
  DROP CONSTRAINT IF EXISTS user_reports_context_check;
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_context_check
  CHECK (context IS NULL OR context IN ('profile', 'campaign', 'request', 'project', 'chat'));

CREATE INDEX IF NOT EXISTS user_reports_campaign_idx ON public.user_reports (campaign_id) WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN public.user_reports.context IS
  'Where the report was made: profile | campaign | request | project | chat. NULL for reports made before migration 163.';

-- Migration 063: Project change requests (bi-directional term edits)
--
-- Neither party can unilaterally change the agreed terms (title, budget,
-- description, deliverables). Instead one side PROPOSES a change; the other
-- ACCEPTS it (the change is then applied to campaign_projects) or REJECTS it with
-- a note. The proposer may WITHDRAW a pending request. Every resolution is
-- recorded to the activity timeline.
--
-- Launch-safe without this table: the change-requests API degrades to empty and
-- the UI simply won't show the panel.

CREATE TABLE IF NOT EXISTS public.project_change_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   bigint NOT NULL REFERENCES public.campaign_projects (id) ON DELETE CASCADE,
  proposed_by  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  changes      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- proposed field → new value
  before       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- snapshot of those fields at proposal time
  review_note  text,                                 -- reviewer's note (on reject)
  reviewed_by  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

CREATE INDEX IF NOT EXISTS project_change_requests_project_idx
  ON public.project_change_requests (project_id, created_at DESC);

ALTER TABLE public.project_change_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: either participant can read their project's change requests.
DROP POLICY IF EXISTS project_change_requests_select ON public.project_change_requests;
CREATE POLICY project_change_requests_select ON public.project_change_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- INSERT: a participant proposes a change (they are the proposer).
DROP POLICY IF EXISTS project_change_requests_insert ON public.project_change_requests;
CREATE POLICY project_change_requests_insert ON public.project_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    proposed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- UPDATE: either participant may resolve a request (accept / reject / withdraw).
-- The API enforces WHO may do WHAT (only the non-proposer accepts/rejects; only
-- the proposer withdraws) and applies accepted changes server-side.
DROP POLICY IF EXISTS project_change_requests_update ON public.project_change_requests;
CREATE POLICY project_change_requests_update ON public.project_change_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

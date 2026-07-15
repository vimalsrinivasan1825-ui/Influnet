-- Migration 062: Project activity timeline (append-only audit log)
--
-- A single, user-visible history for a project: request accepted → project
-- created, every stage advance and sign-off, each payment, revisions, approvals,
-- completion, and cancellations. Both participants can read it; rows are only
-- ever written server-side by our API (and the payment webhook via service role).
--
-- The app is launch-safe WITHOUT this table applied: logActivity() swallows the
-- missing-table error and the timeline API degrades to a single synthesized
-- "project created" event.

CREATE TABLE IF NOT EXISTS public.project_activity (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     bigint NOT NULL REFERENCES public.campaign_projects (id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  type           text NOT NULL,   -- e.g. stage_advanced | stage_signoff | payment_paid
  summary        text NOT NULL,   -- concise human sentence, name-free (UI prefixes the actor)
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_activity_project_idx
  ON public.project_activity (project_id, created_at);

ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

-- SELECT: either participant can read their project's activity.
DROP POLICY IF EXISTS project_activity_select ON public.project_activity;
CREATE POLICY project_activity_select ON public.project_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- INSERT: a participant may append an event they are the actor of, for their
-- project. Writes only happen inside our API routes; the webhook uses the
-- service-role key and bypasses RLS. There is deliberately no UPDATE/DELETE
-- policy — the log is append-only.
DROP POLICY IF EXISTS project_activity_insert ON public.project_activity;
CREATE POLICY project_activity_insert ON public.project_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

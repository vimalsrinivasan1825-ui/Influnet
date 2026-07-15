-- Migration 064: Per-stage updates ("mail"-style thread)
--
-- Each stage of the guided flow gets a lightweight thread: either party can
-- "send an update" carrying a message, an optional link, and/or an optional file
-- (uploaded to Cloudinary via a signed direct upload; we store the resulting
-- secure URL). This is where the actual work and remarks are exchanged before
-- both sides sign the stage off.
--
-- Launch-safe without this table: the stage-entries API degrades to empty.

CREATE TABLE IF NOT EXISTS public.project_stage_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      bigint NOT NULL REFERENCES public.campaign_projects (id) ON DELETE CASCADE,
  stage_key       text NOT NULL,
  author_user_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body            text,                 -- the message / remark
  link_url        text,                 -- optional link
  file_url        text,                 -- optional asset URL (Cloudinary secure_url)
  file_name       text,                 -- original filename for display
  file_public_id  text,                 -- Cloudinary public_id (for later deletion)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_stage_entries_project_stage_idx
  ON public.project_stage_entries (project_id, stage_key, created_at);

ALTER TABLE public.project_stage_entries ENABLE ROW LEVEL SECURITY;

-- SELECT: either participant can read their project's updates.
DROP POLICY IF EXISTS project_stage_entries_select ON public.project_stage_entries;
CREATE POLICY project_stage_entries_select ON public.project_stage_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- INSERT: a participant posts an update authored by themselves.
DROP POLICY IF EXISTS project_stage_entries_insert ON public.project_stage_entries;
CREATE POLICY project_stage_entries_insert ON public.project_stage_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- DELETE: the author may remove their own update.
DROP POLICY IF EXISTS project_stage_entries_delete ON public.project_stage_entries;
CREATE POLICY project_stage_entries_delete ON public.project_stage_entries
  FOR DELETE TO authenticated
  USING (author_user_id = auth.uid());

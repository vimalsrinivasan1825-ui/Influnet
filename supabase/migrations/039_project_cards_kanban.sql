-- Project cards for Kanban board: multiple draggable cards per stage
-- Each card belongs to a project and a stage column

CREATE TABLE IF NOT EXISTS public.project_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES public.campaign_projects (id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Card',
  description TEXT NOT NULL DEFAULT '',
  due_date TIMESTAMPTZ,
  meeting_link TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_cards_project_idx
  ON public.project_cards (project_id, stage_key, position);

ALTER TABLE public.project_cards ENABLE ROW LEVEL SECURITY;

-- SELECT: participants of the project can see its cards
DROP POLICY IF EXISTS project_cards_select ON public.project_cards;
CREATE POLICY project_cards_select ON public.project_cards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- INSERT: participants can create cards
DROP POLICY IF EXISTS project_cards_insert ON public.project_cards;
CREATE POLICY project_cards_insert ON public.project_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- UPDATE: participants can update cards
DROP POLICY IF EXISTS project_cards_update ON public.project_cards;
CREATE POLICY project_cards_update ON public.project_cards
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- DELETE: participants can delete cards
DROP POLICY IF EXISTS project_cards_delete ON public.project_cards;
CREATE POLICY project_cards_delete ON public.project_cards
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

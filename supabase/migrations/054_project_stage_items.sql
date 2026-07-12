-- Migration 054: Project stage checklist items (gated pipeline)
-- Turns the 12-stage board into a gated workflow: each stage owns a set of
-- checklist items; required items must be done before the project can advance.
-- Default items are seeded by the app (single source of truth in
-- apps/web/src/lib/project-stage-items.ts) on first load, so this migration
-- only defines the table + RLS. It mirrors the project_cards participant model.

CREATE TABLE IF NOT EXISTS public.project_stage_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   bigint NOT NULL REFERENCES public.campaign_projects (id) ON DELETE CASCADE,
  stage_key    text NOT NULL,                       -- matches STAGES in project-lifecycle.ts
  label        text NOT NULL,
  owner_role   text NOT NULL DEFAULT 'both',        -- 'business' | 'creator' | 'both'
  is_required  boolean NOT NULL DEFAULT true,       -- required items gate stage advancement
  is_gate      boolean NOT NULL DEFAULT false,      -- payment/approval gate (surfaced in UI)
  position     integer NOT NULL DEFAULT 0,
  done_at      timestamptz,
  done_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage_key, label)             -- idempotent seeding
);

CREATE INDEX IF NOT EXISTS project_stage_items_project_idx
  ON public.project_stage_items (project_id, stage_key, position);

ALTER TABLE public.project_stage_items ENABLE ROW LEVEL SECURITY;

-- SELECT: participants of the project can see its checklist
DROP POLICY IF EXISTS project_stage_items_select ON public.project_stage_items;
CREATE POLICY project_stage_items_select ON public.project_stage_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- INSERT: participants can seed / add checklist items
DROP POLICY IF EXISTS project_stage_items_insert ON public.project_stage_items;
CREATE POLICY project_stage_items_insert ON public.project_stage_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- UPDATE: participants can toggle items done/undone
DROP POLICY IF EXISTS project_stage_items_update ON public.project_stage_items;
CREATE POLICY project_stage_items_update ON public.project_stage_items
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

-- DELETE: participants can remove custom items
DROP POLICY IF EXISTS project_stage_items_delete ON public.project_stage_items;
CREATE POLICY project_stage_items_delete ON public.project_stage_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

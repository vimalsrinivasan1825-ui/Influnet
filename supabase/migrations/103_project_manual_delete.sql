-- 103: manual project delete, separate from cancellation.
--
-- cancel_project() (089/092) is a bilateral STATE CHANGE: both sides have to
-- agree, and the row auto-hides 15 days later. That is a different action
-- from what was asked for here — either participant, unilaterally, moving a
-- project (cancelled, completed, or anything else) out of their main list
-- into a distinct "Deleted Projects" view. Nothing is ever actually removed:
-- the row, its payment ledger and its activity timeline all survive
-- untouched, and — unlike the 15-day cancellation auto-hide — there is no
-- expiry here. It stays in the Deleted Projects view indefinitely for BOTH
-- participants, not just whoever deleted it.
--
-- Deliberately its own columns rather than reusing `deleted_at`: that column
-- already means "when this becomes invisible to everyone" for cancellation
-- retention, and overloading it here would silently change that behaviour.

ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS manually_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manually_deleted_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.campaign_projects.manually_deleted_at IS
  'Set when a participant removes this project from their main list. Never auto-expires — the row moves to the Deleted Projects view for both participants, permanently, until restored.';

CREATE INDEX IF NOT EXISTS campaign_projects_manually_deleted_idx
  ON public.campaign_projects (manually_deleted_at)
  WHERE manually_deleted_at IS NOT NULL;

-- ── Delete: unilateral, any status, no counterparty confirmation ─────────
CREATE OR REPLACE FUNCTION public.delete_project(p_project_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_project public.campaign_projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_project FROM public.campaign_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_project.manually_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_deleted';
  END IF;

  UPDATE public.campaign_projects
  SET manually_deleted_at = now(),
      manually_deleted_by = v_actor,
      updated_at          = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  RETURN jsonb_build_object('project', to_jsonb(v_project));
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_project(BIGINT) TO authenticated;

-- ── Restore: undo a manual delete, same unilateral rule ───────────────────
CREATE OR REPLACE FUNCTION public.restore_project(p_project_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_project public.campaign_projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_project FROM public.campaign_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_project.manually_deleted_at IS NULL THEN
    RAISE EXCEPTION 'not_deleted';
  END IF;

  UPDATE public.campaign_projects
  SET manually_deleted_at = NULL,
      manually_deleted_by = NULL,
      updated_at          = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  RETURN jsonb_build_object('project', to_jsonb(v_project));
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_project(BIGINT) TO authenticated;

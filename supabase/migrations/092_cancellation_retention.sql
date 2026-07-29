-- Migration 092: add 15-day retention for cancelled projects.
--
-- A cancelled project stays accessible to both participants as a read-only
-- record for 15 days, after which it is automatically hidden (soft-deleted).
-- This gives users time to review what happened, sort out refunds, or take
-- screenshots before the workspace disappears.
--
-- ── What changes ────────────────────────────────────────────────────────
-- 1. `deleted_at` column on campaign_projects.
-- 2. `cancel_project()` now sets deleted_at = now() + 15 days.
-- 3. The API route filters out expired rows.

ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.campaign_projects.deleted_at IS
  'Set 15 days after cancellation. The row is hidden from the UI past this point.';

-- ── Update the cancel_project RPC to schedule deletion ──────────────────
-- The accepter's RPC sets deleted_at to 15 days from now. The reason why
-- (cancel_reason_category / cancellation_reason) is preserved on the row.
CREATE OR REPLACE FUNCTION public.cancel_project(p_project_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_project    public.campaign_projects%ROWTYPE;
  v_requester  UUID;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_project FROM public.campaign_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_project.status = 'cancelled' THEN RAISE EXCEPTION 'already_cancelled'; END IF;
  IF v_project.status = 'completed' THEN RAISE EXCEPTION 'cannot_cancel_completed'; END IF;
  IF v_project.cancel_requested_by IS NULL THEN RAISE EXCEPTION 'no_cancellation_requested'; END IF;
  IF v_project.cancel_requested_by = v_actor THEN RAISE EXCEPTION 'requester_cannot_accept'; END IF;

  v_requester := v_project.cancel_requested_by;

  UPDATE public.campaign_projects
  SET status               = 'cancelled',
      cancelled_at         = now(),
      cancelled_by         = v_actor,
      cancel_requested_by  = NULL,
      deleted_at           = now() + interval '15 days',
      updated_at           = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  RETURN jsonb_build_object(
    'project', to_jsonb(v_project),
    'notify_user_id', v_requester
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_project(BIGINT) TO authenticated;

-- ── RLS: participants can still SELECT until deleted_at expires ─────────
-- The existing SELECT policies already scope to participants. We do NOT
-- filter by deleted_at here because the API route handles the exclusion:
-- it is the only caller and the filter is trivial. Leaving the RLS
-- unfiltered means a direct PostgREST query (e.g. for testing or an admin
-- tool) won't silently hide rows. The admin SELECT policy from 038 is
-- untouched — admins see everything regardless.
COMMENT ON TABLE public.campaign_projects IS
  E'@graphql({"name": "campaign_projects"})\n\n'
  'Participants see their rows. deleted_at rows are hidden in the API, not by RLS.';

-- ── Index for cleanup queries ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS campaign_projects_deleted_at_idx
  ON public.campaign_projects (deleted_at)
  WHERE deleted_at IS NOT NULL;

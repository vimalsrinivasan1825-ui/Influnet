-- Migration 072: cancelling a project must not destroy it.
--
-- accept_cancellation used to DELETE the campaign_projects row. That took the
-- payment ledger, the activity timeline, the stage entries and the uploaded
-- assets with it (all ON DELETE CASCADE) — so a project that had money moved
-- against it could be erased with no record that it ever existed. Two people
-- agreeing to stop work is not the same as agreeing to erase the evidence.
--
-- Cancelling is now a state change. The row stays, the ledger stays, and both
-- parties keep a read-only view of what happened.

ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by     UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS campaign_projects_cancelled_idx
  ON public.campaign_projects (status)
  WHERE status = 'cancelled';

-- Both sides must agree: one requests, the other accepts. Enforced here as well
-- as in the API so a direct PostgREST call cannot cancel unilaterally.
CREATE OR REPLACE FUNCTION public.cancel_project(
  p_project_id BIGINT,
  p_reason     TEXT DEFAULT NULL
)
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

  SELECT * INTO v_project FROM public.campaign_projects
  WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_project.status = 'cancelled' THEN RAISE EXCEPTION 'already_cancelled'; END IF;
  IF v_project.status = 'completed' THEN RAISE EXCEPTION 'cannot_cancel_completed'; END IF;

  -- The other party must have asked for it; you cannot accept your own request.
  IF v_project.cancel_requested_by IS NULL THEN
    RAISE EXCEPTION 'no_cancellation_requested';
  END IF;
  IF v_project.cancel_requested_by = v_actor THEN
    RAISE EXCEPTION 'requester_cannot_accept';
  END IF;

  UPDATE public.campaign_projects
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      cancel_requested_by = NULL,
      updated_at = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'status', 'cancelled',
    'notify_user_id', v_project.cancel_requested_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_project(BIGINT, TEXT) TO authenticated;

-- A cancelled project is a record, not a workspace: no further edits.
DROP POLICY IF EXISTS "campaign_projects_update_participant" ON public.campaign_projects;
CREATE POLICY "campaign_projects_update_participant"
  ON public.campaign_projects FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = owner_user_id OR auth.uid() = counterparty_user_id)
    AND status <> 'cancelled'
  )
  WITH CHECK (auth.uid() = owner_user_id OR auth.uid() = counterparty_user_id);

-- 114: Make stage sign-off atomic, so two people confirming at the same instant
--      don't overwrite each other.
--
-- ── The bug ───────────────────────────────────────────────────────────────
-- PATCH /api/projects/[id] {action:'signoff'} read stage_progress, mutated it
-- in JavaScript, and wrote the WHOLE jsonb column back. No optimistic lock, no
-- atomic update. When both sides confirmed at the same moment they both read a
-- state with neither signature present, and the second write was built from a
-- stale snapshot.
--
-- enforce_project_consent (the trigger) caught the anomaly — the second write
-- would have blanked the other party's freshly-written sign-off, which is
-- exactly what it exists to prevent — and raised
-- `consent_violation: cannot change the other party's sign-off`. That is the
-- trigger doing its job. But the route had no retry, so it surfaced as a 500
-- and the losing side's confirmation was simply gone. The audit reproduced it
-- twice with the losing side alternating:
--
--   run 1:  [500, 200]   owner=MISSING     creator=05:03:10.651
--   run 2:  [200, 500]   owner=05:08:13.619  creator=MISSING
--   stage after: collaboration_started (both had clicked confirm)
--
-- Both people clicked "confirm". One got a server error. The stage did not
-- move, nothing explained why, and the only recovery was to click again. This
-- is the moment users are MOST likely to act simultaneously, because both sides
-- have just been notified that it is their turn.
--
-- ── The fix ───────────────────────────────────────────────────────────────
-- Do the read and the write in one statement, under a row lock, computing from
-- the CURRENT row instead of a snapshot the caller fetched earlier. The other
-- party's keys are never written — they are carried through from the live row —
-- so the trigger has nothing to object to and both sign-offs land.
--
-- The next stage is passed IN rather than derived here on purpose:
-- ALLOWED_TRANSITIONS lives in packages/core and is the single source of truth
-- for the transition map (including the revisions → sent_for_review back-edge,
-- which an index-based guess gets wrong). Re-encoding it in SQL would create a
-- second definition free to drift. This function's job is atomicity, not
-- routing — and it still refuses to advance unless BOTH signatures are present,
-- so a bad p_next_stage cannot move a stage that hasn't been agreed.

CREATE OR REPLACE FUNCTION public.record_stage_signoff(
  p_project_id  BIGINT,
  p_stage       TEXT,
  p_next_stage  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER          -- RLS and enforce_project_consent must both still apply
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_row        public.campaign_projects%ROWTYPE;
  v_is_owner   BOOLEAN;
  v_my_at      TEXT;
  v_my_by      TEXT;
  v_other_at   TEXT;
  v_progress   JSONB;
  v_entry      JSONB;
  v_now        TIMESTAMPTZ := now();
  v_now_txt    TEXT;
  v_both       BOOLEAN;
  v_advanced   BOOLEAN := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  -- FOR UPDATE serialises concurrent sign-offs on this project: the second
  -- caller blocks here until the first commits, then reads the row INCLUDING
  -- the first signature. That is the whole fix — everything below operates on
  -- current data rather than on what the caller read a moment ago.
  SELECT * INTO v_row
  FROM public.campaign_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  IF v_actor <> v_row.owner_user_id AND v_actor <> v_row.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  -- The stage may have moved on while this request was in flight (the classic
  -- double-click, or the other side advancing first). Report that plainly
  -- instead of writing a sign-off onto a stage nobody is on any more.
  IF v_row.current_stage IS DISTINCT FROM p_stage THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'stage_moved',
      'current_stage', v_row.current_stage
    );
  END IF;

  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cancelled');
  END IF;

  v_is_owner := (v_actor = v_row.owner_user_id);
  IF v_is_owner THEN
    v_my_at := 'owner_signoff_at';   v_my_by := 'owner_signoff_by';
    v_other_at := 'creator_signoff_at';
  ELSE
    v_my_at := 'creator_signoff_at'; v_my_by := 'creator_signoff_by';
    v_other_at := 'owner_signoff_at';
  END IF;

  v_progress := coalesce(v_row.stage_progress, '{}'::jsonb);
  v_entry    := coalesce(v_progress -> p_stage, '{}'::jsonb);
  v_now_txt  := to_jsonb(v_now) #>> '{}';

  IF jsonb_typeof(v_entry) <> 'object' THEN
    v_entry := '{}'::jsonb;
  END IF;

  IF (v_entry ->> 'status') IS NULL THEN
    v_entry := v_entry || jsonb_build_object('status', 'current');
  END IF;
  IF (v_entry ->> 'started_at') IS NULL THEN
    v_entry := v_entry || jsonb_build_object('started_at', v_now_txt);
  END IF;

  -- Idempotent: signing off twice keeps the first timestamp, so a double-click
  -- can't quietly re-date someone's confirmation.
  IF (v_entry ->> v_my_at) IS NULL THEN
    v_entry := v_entry || jsonb_build_object(v_my_at, v_now_txt);
  END IF;
  v_entry := v_entry || jsonb_build_object(v_my_by, v_actor::text);

  v_both := (v_entry ->> v_my_at) IS NOT NULL
        AND (v_entry ->> v_other_at) IS NOT NULL;

  IF v_both AND p_next_stage IS NOT NULL AND p_next_stage <> p_stage THEN
    v_entry := v_entry
      || jsonb_build_object('status', 'completed', 'completed_at', v_now_txt);
    v_progress := jsonb_set(v_progress, ARRAY[p_stage], v_entry, true);
    v_progress := jsonb_set(
      v_progress,
      ARRAY[p_next_stage],
      coalesce(v_progress -> p_next_stage, '{}'::jsonb)
        || jsonb_build_object('status', 'current', 'started_at', v_now_txt),
      true
    );
    v_advanced := true;

    UPDATE public.campaign_projects
    SET stage_progress = v_progress,
        current_stage  = p_next_stage,
        status         = CASE WHEN p_next_stage = 'project_completed'
                              THEN status          -- completion is the dual-confirm flow's job, not sign-off's
                              ELSE 'active' END,
        updated_at     = v_now
    WHERE id = p_project_id;
  ELSE
    v_progress := jsonb_set(v_progress, ARRAY[p_stage], v_entry, true);

    UPDATE public.campaign_projects
    SET stage_progress = v_progress,
        updated_at     = v_now
    WHERE id = p_project_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'both_signed', v_both,
    'advanced', v_advanced,
    'current_stage', CASE WHEN v_advanced THEN p_next_stage ELSE p_stage END,
    'stage_progress', v_progress
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_stage_signoff(BIGINT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.record_stage_signoff(BIGINT, TEXT, TEXT) IS
  'Atomically record one side''s stage sign-off under a row lock, advancing the '
  'stage only when both signatures are present. Replaces a read-modify-write in '
  'the API route that lost one side''s confirmation under concurrency (audit 2026-08-08).';

-- Revoking a sign-off has the same shape of problem: it rewrites the whole
-- jsonb from a snapshot, so a revoke racing the other side's sign-off would
-- blank it. Same treatment.
CREATE OR REPLACE FUNCTION public.revoke_stage_signoff(
  p_project_id BIGINT,
  p_stage      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_row      public.campaign_projects%ROWTYPE;
  v_is_owner BOOLEAN;
  v_my_at    TEXT;
  v_my_by    TEXT;
  v_progress JSONB;
  v_entry    JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT * INTO v_row FROM public.campaign_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;
  IF v_actor <> v_row.owner_user_id AND v_actor <> v_row.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  v_is_owner := (v_actor = v_row.owner_user_id);
  IF v_is_owner THEN
    v_my_at := 'owner_signoff_at';   v_my_by := 'owner_signoff_by';
  ELSE
    v_my_at := 'creator_signoff_at'; v_my_by := 'creator_signoff_by';
  END IF;

  v_progress := coalesce(v_row.stage_progress, '{}'::jsonb);
  v_entry    := coalesce(v_progress -> p_stage, '{}'::jsonb);
  IF jsonb_typeof(v_entry) <> 'object' THEN
    v_entry := '{}'::jsonb;
  END IF;

  v_entry    := v_entry || jsonb_build_object(v_my_at, NULL, v_my_by, NULL);
  v_progress := jsonb_set(v_progress, ARRAY[p_stage], v_entry, true);

  UPDATE public.campaign_projects
  SET stage_progress = v_progress, updated_at = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object('ok', true, 'stage_progress', v_progress);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_stage_signoff(BIGINT, TEXT) TO authenticated;

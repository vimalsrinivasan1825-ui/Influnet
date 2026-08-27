-- Migration 132: a short-term project completed via sign-off never gets
-- marked completed
--
-- record_stage_signoff() (migration 114) deliberately left `status` untouched
-- when a sign-off's next stage is 'project_completed':
--
--   status = CASE WHEN p_next_stage = 'project_completed'
--                 THEN status          -- completion is the dual-confirm flow's job, not sign-off's
--                 ELSE 'active' END,
--
-- That was correct when written: in the full 12-stage flow, project_completed
-- is reachable ONLY through confirm_completion — final_payment is a
-- NON-signoff stage specifically so this RPC is never called with
-- p_next_stage = 'project_completed' there. Sign-off genuinely never owned
-- completion for that flow.
--
-- The short flows (migration 119) break that assumption. quick_payment (or
-- quick_delivery, for short_pay_before) transitions straight to
-- project_completed via ORDINARY mutual sign-off — those stages were never
-- added to a flow's nonSignoffStages set, so record_stage_signoff is exactly
-- what advances them. The result, confirmed by tests/e2e/phase8-r1-features.mjs
-- driving a real short project end to end: current_stage reaches
-- 'project_completed' while status stays 'active' forever, because nothing
-- else ever calls confirm_completion for a short flow. Reviews
-- ("Can only review completed projects"), and anything else that reads
-- campaign_projects.status, could never see the project as done.
--
-- The fix is to stop special-casing project_completed at all. It is safe to
-- do unconditionally: the full flow can still never reach this branch with
-- p_next_stage = 'project_completed' (final_payment remains a non-signoff
-- stage, unaffected by this migration), so the only case this changes is the
-- one that was broken.
--
-- Flipping `status` alone is not enough, though — tests/e2e/phase8-r1-features.mjs
-- caught the follow-on: enforce_project_consent() (migration 081) independently
-- requires BOTH owner_confirmed_complete AND counterparty_confirmed_complete to
-- be true before it will let status become 'completed', regardless of which
-- code path is trying to set it. That is a real invariant, not a full-flow-only
-- assumption — "completed" should always mean both sides actually agreed it is,
-- however that agreement was recorded — so this sets both columns in the same
-- statement rather than working around the trigger. A short flow's mutual
-- sign-off on its terminal stage IS that agreement.



CREATE OR REPLACE FUNCTION public.record_stage_signoff(
  p_project_id BIGINT,
  p_stage TEXT,
  p_next_stage TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
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
        -- CHANGED: a sign-off that lands directly on project_completed (the
        -- short flows) now marks the project completed, same as the
        -- dual-confirm flow does for the full 12-stage pipeline. Both
        -- confirmation columns are set together with status, in the same
        -- statement, because enforce_project_consent() (migration 081)
        -- requires both to already be true in NEW before it allows
        -- status = 'completed' at all — this mutual sign-off IS that
        -- confirmation, recorded through a different mechanism than
        -- confirm_completion's, so the columns need to say so explicitly.
        owner_confirmed_complete = CASE WHEN p_next_stage = 'project_completed'
                                        THEN true ELSE owner_confirmed_complete END,
        counterparty_confirmed_complete = CASE WHEN p_next_stage = 'project_completed'
                                               THEN true ELSE counterparty_confirmed_complete END,
        status         = CASE WHEN p_next_stage = 'project_completed'
                              THEN 'completed'
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

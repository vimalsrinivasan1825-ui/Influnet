-- Migration 133: let a verified mutual sign-off set BOTH completion columns
--
-- Migration 132 made record_stage_signoff() set owner_confirmed_complete AND
-- counterparty_confirmed_complete together when a mutual sign-off lands
-- directly on project_completed (the short flows' only route there — see 132's
-- own comment). enforce_project_consent()'s rule 1 (migration 081) then
-- rejected it: "only the brand can confirm its own completion" / "only the
-- creator can confirm their own completion", because whichever party's
-- sign-off happens to be the SECOND one — the one whose statement actually
-- performs the write — is, from rule 1's point of view, a non-owner (or
-- non-creator) trying to flip the OTHER side's confirmation flag. Found by
-- tests/e2e/phase8-r1-features.mjs actually driving a short project to
-- completion, not by reading the trigger in isolation.
--
-- The fix is NOT to relax rule 1 generally — that would let one participant
-- claim the other's completion confirmation by direct PATCH, which is the
-- exact forgery rule 1 exists to stop. Instead this recognises the ONE shape
-- only record_stage_signoff() can produce: both confirmation columns flipping
-- true together, in the same statement where stage_progress (for the stage
-- being left) ALREADY shows both owner_signoff_at and creator_signoff_at
-- filled in. Those two signoff timestamps are not trustable on the caller's
-- say-so either — rule 4, a few lines below in this same trigger, independently
-- guarantees each one is self-attributed to its real signer and that neither
-- side can write the other's. So by the time this exception's condition is
-- true, the trigger has already verified mutual consent through a completely
-- separate check on this same write; rule 1 is not being bypassed so much as
-- told about evidence it would otherwise ignore.

CREATE OR REPLACE FUNCTION public.enforce_project_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       UUID := auth.uid();
  v_is_owner    BOOLEAN;
  v_stage       TEXT;
  v_old_entry   JSONB;
  v_new_entry   JSONB;
  v_my_at_key   TEXT;
  v_my_by_key   TEXT;
  v_other_at    TEXT;
  v_other_by    TEXT;
  v_terms_changed BOOLEAN;
  -- NEW: both confirmation columns flipping true together, backed by both
  -- signoff timestamps already present (pre-this-statement's-own-loop) on the
  -- stage being left. See the migration header for why this is safe.
  v_mutual_signoff_completion BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  IF v_actor <> OLD.owner_user_id AND v_actor <> OLD.counterparty_user_id THEN
    RETURN NEW;
  END IF;

  v_is_owner := (v_actor = OLD.owner_user_id);

  v_mutual_signoff_completion := (
    NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
    AND coalesce(NEW.owner_confirmed_complete, false)
    AND coalesce(NEW.counterparty_confirmed_complete, false)
    AND NOT coalesce(OLD.owner_confirmed_complete, false)
    AND NOT coalesce(OLD.counterparty_confirmed_complete, false)
    AND OLD.current_stage IS NOT NULL
    AND (NEW.stage_progress -> OLD.current_stage ->> 'owner_signoff_at') IS NOT NULL
    AND (NEW.stage_progress -> OLD.current_stage ->> 'creator_signoff_at') IS NOT NULL
  );

  -- ── 1. Only your own completion confirmation ──────────────────────────
  IF NEW.owner_confirmed_complete IS DISTINCT FROM OLD.owner_confirmed_complete
     AND NOT v_is_owner
     AND NOT v_mutual_signoff_completion THEN
    RAISE EXCEPTION 'consent_violation: only the brand can confirm its own completion';
  END IF;

  IF NEW.counterparty_confirmed_complete IS DISTINCT FROM OLD.counterparty_confirmed_complete
     AND v_is_owner
     AND NOT v_mutual_signoff_completion THEN
    RAISE EXCEPTION 'consent_violation: only the creator can confirm their own completion';
  END IF;

  -- ── 2. 'completed' requires both confirmations ────────────────────────
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NOT (coalesce(NEW.owner_confirmed_complete, false)
            AND coalesce(NEW.counterparty_confirmed_complete, false)) THEN
      RAISE EXCEPTION 'consent_violation: both sides must confirm before a project is completed';
    END IF;
  END IF;

  -- ── 3. Agreed terms move only through the change-request flow ─────────
  v_terms_changed :=
       NEW.title          IS DISTINCT FROM OLD.title
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.deliverables   IS DISTINCT FROM OLD.deliverables
    OR NEW.budget         IS DISTINCT FROM OLD.budget
    OR NEW.advance_amount IS DISTINCT FROM OLD.advance_amount
    OR NEW.due_date       IS DISTINCT FROM OLD.due_date;

  IF v_terms_changed
     AND coalesce(current_setting('influnet.terms_apply', true), 'off') <> 'on' THEN
    IF OLD.status <> 'pending_acceptance' THEN
      RAISE EXCEPTION
        'consent_violation: agreed terms change through a change request, so the other side can review it';
    END IF;
    IF OLD.created_by_user_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION
        'consent_violation: only the person who proposed these terms can edit them before they are accepted';
    END IF;
  END IF;

  -- ── 4. Stage sign-offs are per-side and self-attributed ───────────────
  IF NEW.stage_progress IS DISTINCT FROM OLD.stage_progress THEN
    IF v_is_owner THEN
      v_my_at_key := 'owner_signoff_at';   v_my_by_key := 'owner_signoff_by';
      v_other_at  := 'creator_signoff_at'; v_other_by  := 'creator_signoff_by';
    ELSE
      v_my_at_key := 'creator_signoff_at'; v_my_by_key := 'creator_signoff_by';
      v_other_at  := 'owner_signoff_at';   v_other_by  := 'owner_signoff_by';
    END IF;

    FOR v_stage IN SELECT jsonb_object_keys(coalesce(NEW.stage_progress, '{}'::jsonb))
    LOOP
      v_new_entry := NEW.stage_progress -> v_stage;
      v_old_entry := coalesce(OLD.stage_progress, '{}'::jsonb) -> v_stage;

      IF jsonb_typeof(v_new_entry) <> 'object' THEN
        CONTINUE;
      END IF;

      IF (v_new_entry -> v_other_at) IS DISTINCT FROM (v_old_entry -> v_other_at)
         OR (v_new_entry -> v_other_by) IS DISTINCT FROM (v_old_entry -> v_other_by) THEN
        RAISE EXCEPTION
          'consent_violation: cannot change the other party''s sign-off on stage %', v_stage;
      END IF;

      IF (v_new_entry -> v_my_at_key) IS DISTINCT FROM (v_old_entry -> v_my_at_key)
         AND (v_new_entry ->> v_my_at_key) IS NOT NULL
         AND coalesce(v_new_entry ->> v_my_by_key, '') <> v_actor::text THEN
        RAISE EXCEPTION
          'consent_violation: a sign-off must be recorded against the signer on stage %', v_stage;
      END IF;

      IF (v_new_entry ->> 'status') = 'skipped'
         AND coalesce(v_old_entry ->> 'status', '') <> 'skipped' THEN
        IF coalesce(v_old_entry ->> 'skip_proposed_by', '') = ''
           OR (v_old_entry ->> 'skip_proposed_by') = v_actor::text THEN
          RAISE EXCEPTION
            'consent_violation: the other party must propose a skip before it can be confirmed on stage %', v_stage;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ── 6. A cancellation request can only be made as yourself, one at a time ──
  IF NEW.cancel_requested_by IS DISTINCT FROM OLD.cancel_requested_by
     AND NEW.cancel_requested_by IS NOT NULL THEN
    IF OLD.cancel_requested_by IS NOT NULL THEN
      RAISE EXCEPTION 'consent_violation: a cancellation request is already pending';
    END IF;
    IF NEW.cancel_requested_by <> v_actor THEN
      RAISE EXCEPTION 'consent_violation: you can only submit a cancellation request as yourself';
    END IF;
  END IF;

  -- ── 7. Cancelling requires the OTHER side to have asked ────────────────
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.cancel_requested_by IS NULL THEN
      RAISE EXCEPTION 'consent_violation: cancellation requires the other party to have requested it first';
    END IF;
    IF OLD.cancel_requested_by = v_actor THEN
      RAISE EXCEPTION 'consent_violation: the requester cannot accept their own cancellation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Migration 082: agreed terms can only change through the consent flow.
--
-- THE HOLE THIS CLOSES
--
-- Migration 081 locked down sign-off and completion, but deliberately left the
-- money and scope columns — title, description, deliverables, budget,
-- advance_amount, due_date — writable, because closing them would have broken
-- the very flow they need protecting: accepting a change request applies those
-- same columns through the same user-authenticated client.
--
-- So today either participant can still do this against an ACTIVE project:
--
--   PATCH /rest/v1/campaign_projects?id=eq.42   { "budget": 5000 }
--
-- and the agreed price changes with no proposal, no acceptance, and no entry in
-- the timeline. The API refuses it (`update_project` returns 409 once a project
-- leaves pending_acceptance) — PostgREST does not.
--
-- THE FIX
--
-- Give the legitimate path its own door, then close the wall:
--
--   1. `apply_change_request()` — a SECURITY DEFINER function that re-checks
--      consent (pending request, caller is the reviewer and NOT the proposer),
--      applies only whitelisted fields, and closes the request. It marks the
--      transaction with a local flag while it writes.
--   2. The trigger from 081 gains a terms rule: those columns may only change
--      while the terms are still un-agreed (`pending_acceptance`, and only by
--      the person who proposed them), or inside that flagged transaction.
--
-- Why a transaction-local flag rather than column grants: the API updates a
-- dozen other columns on this table through the user's client (stage_progress,
-- current_stage, status, cancellation fields, confirmation flags…). Revoking
-- UPDATE and re-granting per column would mean enumerating every one of them
-- correctly forever — miss one and a flow breaks silently. The flag names the
-- ONE path that may write terms and leaves everything else untouched.
--
-- The flag cannot be forged from a client: PostgREST only exposes functions in
-- the `public` schema, runs one statement per transaction, and `set_config` is
-- not exposed. `SET LOCAL` dies with the transaction either way.

-- ---------------------------------------------------------------------------
-- 1. The one legitimate way to change agreed terms
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_change_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_cr      RECORD;
  v_project RECORD;
  v_changes JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_cr
  FROM public.project_change_requests
  WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'change_request_not_found'; END IF;

  IF v_cr.status <> 'pending' THEN
    RAISE EXCEPTION 'change_request_already_resolved';
  END IF;

  SELECT * INTO v_project
  FROM public.campaign_projects
  WHERE id = v_cr.project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  -- The whole point: the OTHER side accepts. You cannot accept your own.
  IF v_cr.proposed_by = v_actor THEN
    RAISE EXCEPTION 'proposer_cannot_accept';
  END IF;

  v_changes := coalesce(v_cr.changes, '{}'::jsonb);

  -- Marks this transaction as the sanctioned writer for the trigger below.
  PERFORM set_config('influnet.terms_apply', 'on', true);

  UPDATE public.campaign_projects
  SET title           = coalesce(v_changes ->> 'title', title),
      description     = coalesce(v_changes ->> 'description', description),
      deliverables    = coalesce(v_changes ->> 'deliverables', deliverables),
      budget          = coalesce((v_changes ->> 'budget')::numeric, budget),
      advance_amount  = coalesce((v_changes ->> 'advance_amount')::numeric, advance_amount),
      due_date        = coalesce((v_changes ->> 'due_date')::date, due_date),
      updated_at      = now()
  WHERE id = v_cr.project_id;

  UPDATE public.project_change_requests
  SET status = 'accepted', reviewed_by = v_actor, resolved_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'project_id', v_cr.project_id,
    'changes',    v_changes,
    'proposed_by', v_cr.proposed_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_change_request(UUID) TO authenticated;

COMMENT ON FUNCTION public.apply_change_request(UUID) IS
  'Accept a change request and apply its terms. The only path allowed to write agreed terms on an active project.';

-- ---------------------------------------------------------------------------
-- 2. Extend the 081 consent trigger with the terms rule
-- ---------------------------------------------------------------------------
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
BEGIN
  -- Service-role / trigger-internal writes: no user context, nothing to check.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins keep the override they already have elsewhere.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  -- Non-participants are already blocked by RLS; this is belt and braces.
  IF v_actor <> OLD.owner_user_id AND v_actor <> OLD.counterparty_user_id THEN
    RETURN NEW;
  END IF;

  v_is_owner := (v_actor = OLD.owner_user_id);

  -- ── 1. Only your own completion confirmation ──────────────────────────
  IF NEW.owner_confirmed_complete IS DISTINCT FROM OLD.owner_confirmed_complete
     AND NOT v_is_owner THEN
    RAISE EXCEPTION 'consent_violation: only the brand can confirm its own completion';
  END IF;

  IF NEW.counterparty_confirmed_complete IS DISTINCT FROM OLD.counterparty_confirmed_complete
     AND v_is_owner THEN
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
    -- Before anyone has agreed, the proposer may still tidy up their own terms.
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

      -- The other side's sign-off must be left exactly as it was found.
      IF (v_new_entry -> v_other_at) IS DISTINCT FROM (v_old_entry -> v_other_at)
         OR (v_new_entry -> v_other_by) IS DISTINCT FROM (v_old_entry -> v_other_by) THEN
        RAISE EXCEPTION
          'consent_violation: cannot change the other party''s sign-off on stage %', v_stage;
      END IF;

      -- Your own sign-off, when set, must be attributed to you.
      IF (v_new_entry -> v_my_at_key) IS DISTINCT FROM (v_old_entry -> v_my_at_key)
         AND (v_new_entry ->> v_my_at_key) IS NOT NULL
         AND coalesce(v_new_entry ->> v_my_by_key, '') <> v_actor::text THEN
        RAISE EXCEPTION
          'consent_violation: a sign-off must be recorded against the signer on stage %', v_stage;
      END IF;

      -- ── 5. Skipping a stage takes two people ───────────────────────────
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_project_consent() IS
  'Makes the bilateral sign-off, completion and terms rules true at the database level, not just in the API route.';

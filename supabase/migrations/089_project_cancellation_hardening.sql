-- Migration 089: close the unilateral-delete hole, add reasons, and make
-- cancellation bilateral at the database level — not just in the API route.
--
-- ── WHAT THIS FOUND ────────────────────────────────────────────────────
--
-- Migration 037 gave every participant a raw DELETE policy on
-- campaign_projects. Migration 072 built the whole "cancelling is a state
-- change, not a delete" system specifically because a hard delete cascades to
-- project_payments (059), project_activity (062), reviews (051), stage items
-- and stage entries — but it never dropped 037's policy. Nine migrations
-- later, that hole is still open: any participant can still
--
--   DELETE /rest/v1/campaign_projects?id=eq.<id>
--
-- with their own session token and permanently erase a project — payment
-- ledger included — with zero trace. No app code calls this (confirmed by
-- search); it is reachable only by going around the app entirely, which is
-- exactly the path a bad-faith actor takes. This is the concrete version of
-- "the creator got paid, didn't deliver, and made the record disappear."
-- Closed below.
--
-- Separately: migration 072's UPDATE policy allows any participant to write
-- ANY column, including status/cancelled_by/cancel_requested_by, as long as
-- they're a participant — it never checks that a cancellation was actually
-- agreed. A single PostgREST PATCH could set status='cancelled' with forged
-- cancelled_by/cancel_requested_by values and no real consent from the other
-- side ever having happened. enforce_project_consent() (081/082) already
-- closes this exact class of hole for 'completed' and stage sign-offs; it was
-- never extended to cover cancellation. Closed below too.
--
-- ── WHAT'S NEW ─────────────────────────────────────────────────────────
--
-- A cancellation now carries a REASON, chosen by the requester at request
-- time (not invented afterwards): a category from a fixed list
-- (packages/core/src/project-cancellation.ts) plus optional free text
-- (required when the category is 'other'). It survives on the row after
-- acceptance — cancel_project() no longer overwrites it, which the OLD
-- version did (it took its own p_reason and stomped whatever the requester
-- had written).

-- ── 1. Close the DELETE hole ─────────────────────────────────────────────
-- The admin-only policy from migration 038 (campaign_projects_delete_admin)
-- is untouched — that is the one sanctioned hard-delete path, for support
-- cleanup, and it already requires public.is_admin().
DROP POLICY IF EXISTS "campaign_projects_delete_participant" ON public.campaign_projects;

-- ── 2. The reason, captured at request time ─────────────────────────────
ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS cancel_reason_category TEXT
    CHECK (cancel_reason_category IS NULL OR cancel_reason_category IN (
      'scope_not_needed', 'unresponsive_partner', 'budget_changed',
      'quality_dispute', 'personal_conflict', 'other'
    )),
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

-- ── 3. Request a cancellation ────────────────────────────────────────────
-- Replaces the raw `.update({cancel_requested_by: user.id})` the route used
-- to issue directly. That had no guard against a second request overwriting
-- an in-flight one, and no validation of the reason at all — there was
-- nowhere for a reason to go before this migration.
CREATE OR REPLACE FUNCTION public.request_project_cancellation(
  p_project_id BIGINT,
  p_reason_category TEXT,
  p_reason_text TEXT DEFAULT NULL
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

  SELECT * INTO v_project FROM public.campaign_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_project.status <> 'active' THEN
    RAISE EXCEPTION 'cannot_cancel_now';
  END IF;
  IF v_project.cancel_requested_by IS NOT NULL THEN
    RAISE EXCEPTION 'cancellation_already_pending';
  END IF;
  IF p_reason_category NOT IN (
    'scope_not_needed', 'unresponsive_partner', 'budget_changed',
    'quality_dispute', 'personal_conflict', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid_reason_category';
  END IF;
  IF p_reason_category = 'other' AND coalesce(trim(p_reason_text), '') = '' THEN
    RAISE EXCEPTION 'reason_text_required';
  END IF;

  UPDATE public.campaign_projects
  SET cancel_requested_by     = v_actor,
      cancel_reason_category  = p_reason_category,
      cancellation_reason     = nullif(trim(p_reason_text), ''),
      cancel_requested_at     = now(),
      updated_at               = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  RETURN to_jsonb(v_project);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_project_cancellation(BIGINT, TEXT, TEXT) TO authenticated;

-- ── 4. Accept — bilateral, and the reason is left exactly as given ──────
-- CREATE OR REPLACE with a NARROWER signature (drops the old p_reason
-- parameter): the accepter is agreeing to the requester's stated reason, not
-- writing a new one over it. The one call site is updated in the same change.
DROP FUNCTION IF EXISTS public.cancel_project(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_project(p_project_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_project    public.campaign_projects%ROWTYPE;
  -- Captured BEFORE the UPDATE below clears cancel_requested_by to NULL — the
  -- return value needs to say who to notify, which is exactly the column the
  -- write is about to erase.
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
      -- cancel_reason_category / cancellation_reason: untouched — that is the
      -- requester's record of why, not the accepter's.
      cancel_requested_by  = NULL,
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

-- ── 5. Decline (or withdraw your own) ────────────────────────────────────
-- No bilateral guard needed here in either direction: the OTHER side
-- declining, or the requester withdrawing their own request, both just stop
-- something from happening — neither can force an unwanted state on anyone.
CREATE OR REPLACE FUNCTION public.decline_project_cancellation(p_project_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_project    public.campaign_projects%ROWTYPE;
  -- Same reason as in cancel_project() above: captured before the UPDATE
  -- clears the very column this function needs to report.
  v_requester  UUID;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_project FROM public.campaign_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_project.cancel_requested_by IS NULL THEN
    RAISE EXCEPTION 'no_cancellation_requested';
  END IF;

  v_requester := v_project.cancel_requested_by;

  UPDATE public.campaign_projects
  SET cancel_requested_by     = NULL,
      cancel_reason_category  = NULL,
      cancellation_reason     = NULL,
      cancel_requested_at     = NULL,
      updated_at              = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  RETURN jsonb_build_object(
    'project', to_jsonb(v_project),
    'was_requested_by', v_requester
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_project_cancellation(BIGINT) TO authenticated;

-- ── 6. The database-level guard: direct writes can't forge any of this ──
-- CREATE OR REPLACE of the SAME function 081/082 already own, extended
-- rather than duplicated — this is the file that makes bilateral consent true
-- no matter which client (or none at all) is doing the writing.
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

  -- ── 6. A cancellation request can only be made as yourself, one at a time ──
  -- Blocks forging cancel_requested_by = <someone else>, which would make it
  -- look like the OTHER side asked to cancel — the setup for the self-approval
  -- attack rule 7 exists to catch.
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
  -- Without this, a direct PostgREST PATCH could set status='cancelled' with
  -- no cancellation ever having been requested, or the requester could
  -- "accept" their own request — an unwitnessed, unilateral cancellation
  -- indistinguishable from a real bilateral one once the row is read back.
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

COMMENT ON FUNCTION public.enforce_project_consent() IS
  'Makes the bilateral sign-off, completion, terms and cancellation rules true at the database level, not just in the API route.';

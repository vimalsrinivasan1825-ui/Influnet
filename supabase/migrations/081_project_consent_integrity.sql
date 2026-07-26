-- Migration 081: enforce the two-sided consent rules in the DATABASE.
--
-- THE HOLE THIS CLOSES
--
-- Every bilateral rule in the product — "both sides must sign off a stage",
-- "both sides must confirm completion" — lives in
-- apps/web/src/app/api/projects/[id]/route.ts, and is enforced only for callers
-- who choose to use that route. The RLS policy on campaign_projects
-- (migration 072) checks *who* you are, never *what* you are writing:
--
--   USING (auth.uid() = owner_user_id OR auth.uid() = counterparty_user_id)
--
-- Both apps ship the Supabase anon key, so any participant can take their own
-- session token and PATCH the row directly through PostgREST:
--
--   PATCH /rest/v1/campaign_projects?id=eq.42
--   { "status": "completed",
--     "owner_confirmed_complete": true,
--     "counterparty_confirmed_complete": true,
--     "stage_progress": { …both sign-offs forged… } }
--
-- and the API's careful logic is simply skipped. The consequences are not
-- theoretical: a brand can mark work complete that the creator never signed off,
-- which closes the project, ends the change-request window, and — since
-- migration 080 — publishes a rating opportunity and a "past collaboration"
-- entry on that creator's public profile.
--
-- The fix is to make the invariant true no matter who writes. A BEFORE UPDATE
-- trigger costs one function call per project update and cannot be bypassed by
-- choosing a different client.
--
-- WHAT IS ENFORCED
--   1. You may only flip YOUR OWN completion confirmation.
--   2. status may only become 'completed' when BOTH confirmations are true.
--   3. In stage_progress, you may only write your OWN side's sign-off, and the
--      recorded `*_signoff_by` must be you.
--
-- WHAT IS DELIBERATELY NOT ENFORCED HERE
--   Terms (budget/title/description) are still writable by either participant.
--   That is a real issue — the change-request consent flow can be routed around
--   (see the 2026-07-25 audit, F4) — but it needs a product decision about which
--   edits are allowed mid-project, and guessing here would break the existing
--   edit path. Documented, not silently changed.
--
-- ESCAPE HATCHES
--   * Server-side work with the service-role key has no auth.uid(); those
--     updates pass through untouched (that is how support tooling and webhooks
--     write).
--   * Admins are exempt, matching the admin policies in migration 038.

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

  -- ── 3. Stage sign-offs are per-side and self-attributed ───────────────
  -- Only the keys this actor owns may move. Iterating NEW's stages covers both
  -- edited and newly-added stage entries; a stage present in OLD but dropped
  -- from NEW cannot forge a sign-off, so it needs no check.
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

      -- ── 4. Skipping a stage takes two people ─────────────────────────
      -- One side proposes, the OTHER confirms. The confirm step clears
      -- skip_proposed_by, so the proposal has to be read from OLD.
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

DROP TRIGGER IF EXISTS enforce_project_consent_trg ON public.campaign_projects;
CREATE TRIGGER enforce_project_consent_trg
  BEFORE UPDATE ON public.campaign_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_project_consent();

COMMENT ON FUNCTION public.enforce_project_consent() IS
  'Makes the bilateral sign-off and completion rules true at the database level, not just in the API route.';

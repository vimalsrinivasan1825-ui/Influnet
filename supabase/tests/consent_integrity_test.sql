-- Consent-integrity tests — migrations 081 and 082.
--
-- WHY THIS EXISTS
--
-- Every bilateral rule in the product (both sides sign off a stage, both sides
-- confirm completion, terms only move through a change request) lived in
-- apps/web/src/app/api/projects/[id]/route.ts, and was therefore enforced only
-- for callers who chose to use that route. RLS on campaign_projects authorises
-- the ROW, never the columns or the values, and both apps ship the anon key —
-- so a participant could PATCH PostgREST directly and forge the other side's
-- consent. 081/082 moved those invariants into a BEFORE UPDATE trigger.
--
-- Two things have to hold, and the second matters more:
--   * forgery is refused
--   * every legitimate flow still passes — a false positive here silently
--     breaks the product for honest users
--
-- Run: see README.md (harness + all migrations, then this file).

\set QUIET on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION test_expect(p_label text, p_sql text, p_should_fail boolean)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_err text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF p_should_fail THEN
    IF v_err IS NULL THEN
      RETURN format('FAIL  %s  — expected refusal, but it was ALLOWED', p_label);
    ELSIF position('consent_violation' in v_err) = 0
      AND position('proposer_cannot_accept' in v_err) = 0
      AND position('change_request_already_resolved' in v_err) = 0 THEN
      RETURN format('FAIL  %s  — refused for the wrong reason: %s', p_label, v_err);
    ELSE
      RETURN format('pass  %s', p_label);
    END IF;
  ELSE
    IF v_err IS NULL THEN
      RETURN format('pass  %s', p_label);
    ELSE
      RETURN format('FAIL  %s  — legitimate action was BLOCKED: %s', p_label, v_err);
    END IF;
  END IF;
END;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────
DELETE FROM public.reviews;
DELETE FROM public.project_change_requests;
DELETE FROM public.campaign_projects;
DELETE FROM public.business_profiles;
DELETE FROM public.profiles WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333');

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'brand@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'creator@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local')
ON CONFLICT (id) DO NOTHING;

-- `email` is NOT NULL on the real profiles table; omitting it makes every
-- fixture insert fail, every UPDATE match zero rows, and the whole suite pass
-- vacuously. Run this file with ON_ERROR_STOP so that can never happen quietly.
INSERT INTO public.profiles (id, email, name, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'brand@test.local',   'Brand Co',    'business_owner'),
  ('22222222-2222-2222-2222-222222222222', 'creator@test.local', 'Creator Ann', 'influencer'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local',   'Admin',       'admin');

INSERT INTO public.business_profiles (user_id, company_name)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Brand Co Pvt Ltd');

CREATE OR REPLACE FUNCTION reset_project(p_status text DEFAULT 'active')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.reviews;
  DELETE FROM public.project_change_requests;
  DELETE FROM public.campaign_projects;
  INSERT INTO public.campaign_projects
    (id, title, description, deliverables, budget, advance_amount, status,
     current_stage, stage_progress, owner_user_id, counterparty_user_id,
     created_by_user_id)
  VALUES
    (1, 'Summer Campaign', 'A summer push', '3 reels', 50000, 20000, p_status,
     'content_planning', '{"content_planning": {"status": "current"}}'::jsonb,
     '11111111-1111-1111-1111-111111111111',
     '22222222-2222-2222-2222-222222222222',
     '11111111-1111-1111-1111-111111111111');
END;
$$;

\echo ''
\echo '=== LEGITIMATE FLOWS (must all be allowed) ==============================='

SELECT reset_project();
SELECT set_config('request.test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT test_expect('creator signs off their own stage',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"current","creator_signoff_at":"2026-07-26T10:00:00Z","creator_signoff_by":"22222222-2222-2222-2222-222222222222"}'::jsonb)
  WHERE id = 1 $sql$, false);

SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('brand signs off its own side, stage advances',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"completed","creator_signoff_at":"2026-07-26T10:00:00Z","creator_signoff_by":"22222222-2222-2222-2222-222222222222","owner_signoff_at":"2026-07-26T11:00:00Z","owner_signoff_by":"11111111-1111-1111-1111-111111111111"}'::jsonb),
  current_stage = 'shooting_in_progress' WHERE id = 1 $sql$, false);

SELECT set_config('request.test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT test_expect('creator revokes their own sign-off',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"current","creator_signoff_at":null,"creator_signoff_by":null,"owner_signoff_at":"2026-07-26T11:00:00Z","owner_signoff_by":"11111111-1111-1111-1111-111111111111"}'::jsonb)
  WHERE id = 1 $sql$, false);

SELECT reset_project();
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('brand confirms its own completion',
$sql$ UPDATE campaign_projects SET owner_confirmed_complete = true WHERE id = 1 $sql$, false);
SELECT set_config('request.test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT test_expect('creator confirms, project completes',
$sql$ UPDATE campaign_projects SET counterparty_confirmed_complete = true,
      status = 'completed', current_stage = 'project_completed' WHERE id = 1 $sql$, false);

SELECT reset_project();
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('brand proposes a skip',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"current","skip_proposed_by":"11111111-1111-1111-1111-111111111111"}'::jsonb) WHERE id = 1 $sql$, false);
SELECT set_config('request.test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT test_expect('creator confirms the skip',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"skipped","skip_confirmed_by":"22222222-2222-2222-2222-222222222222"}'::jsonb),
  current_stage = 'shooting_in_progress' WHERE id = 1 $sql$, false);

SELECT reset_project('pending_acceptance');
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('proposer edits their own un-accepted terms',
$sql$ UPDATE campaign_projects SET budget = 60000, title = 'Summer Campaign v2' WHERE id = 1 $sql$, false);

SELECT reset_project();
INSERT INTO project_change_requests (id, project_id, proposed_by, changes)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 1,
        '11111111-1111-1111-1111-111111111111', '{"budget": 75000}'::jsonb);
SELECT set_config('request.test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT test_expect('the other party accepts a change request',
$sql$ SELECT apply_change_request('aaaaaaaa-0000-0000-0000-000000000001') $sql$, false);
SELECT CASE WHEN (SELECT budget FROM campaign_projects WHERE id = 1) = 75000
            THEN 'pass  the accepted change actually moved the budget'
            ELSE 'FAIL  the accepted change did not apply' END;
SELECT CASE WHEN (SELECT status FROM project_change_requests
                  WHERE id='aaaaaaaa-0000-0000-0000-000000000001') = 'accepted'
            THEN 'pass  the change request was closed as accepted'
            ELSE 'FAIL  the change request was left open' END;

SELECT reset_project();
SELECT set_config('request.test.uid', '', false);
SELECT test_expect('service-role write (no auth.uid()) is untouched',
$sql$ UPDATE campaign_projects SET status='completed', budget=1 WHERE id = 1 $sql$, false);

SELECT reset_project();
SELECT set_config('request.test.uid', '33333333-3333-3333-3333-333333333333', false);
SELECT test_expect('admin override still works',
$sql$ UPDATE campaign_projects SET status='completed', budget=1 WHERE id = 1 $sql$, false);

\echo ''
\echo '=== FORGERY (must all be refused) ======================================='

SELECT reset_project();
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('brand forges the CREATOR''s sign-off',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"current","creator_signoff_at":"2026-07-26T10:00:00Z","creator_signoff_by":"22222222-2222-2222-2222-222222222222"}'::jsonb)
  WHERE id = 1 $sql$, true);

SELECT test_expect('brand signs off attributing it to someone else',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"current","owner_signoff_at":"2026-07-26T10:00:00Z","owner_signoff_by":"22222222-2222-2222-2222-222222222222"}'::jsonb)
  WHERE id = 1 $sql$, true);

SELECT test_expect('brand ticks the CREATOR''s completion flag',
$sql$ UPDATE campaign_projects SET counterparty_confirmed_complete = true WHERE id = 1 $sql$, true);

SELECT test_expect('brand ticks BOTH completion flags',
$sql$ UPDATE campaign_projects SET owner_confirmed_complete = true,
      counterparty_confirmed_complete = true WHERE id = 1 $sql$, true);

SELECT test_expect('brand closes the project with no confirmations at all',
$sql$ UPDATE campaign_projects SET status = 'completed', current_stage = 'project_completed'
      WHERE id = 1 $sql$, true);

SELECT reset_project();
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('brand confirms its own completion then closes alone',
$sql$ UPDATE campaign_projects SET owner_confirmed_complete = true, status = 'completed'
      WHERE id = 1 $sql$, true);

SELECT reset_project();
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"current","skip_proposed_by":"11111111-1111-1111-1111-111111111111"}'::jsonb) WHERE id = 1;
SELECT test_expect('brand confirms the skip it proposed itself',
$sql$ UPDATE campaign_projects SET stage_progress = jsonb_set(stage_progress, '{content_planning}',
  '{"status":"skipped","skip_confirmed_by":"11111111-1111-1111-1111-111111111111"}'::jsonb) WHERE id = 1 $sql$, true);

SELECT reset_project();
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('brand rewrites the budget on a live project',
$sql$ UPDATE campaign_projects SET budget = 5000 WHERE id = 1 $sql$, true);

SELECT set_config('request.test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT test_expect('creator rewrites the deliverables on a live project',
$sql$ UPDATE campaign_projects SET deliverables = 'one story, not three' WHERE id = 1 $sql$, true);

SELECT reset_project('pending_acceptance');
SELECT set_config('request.test.uid', '22222222-2222-2222-2222-222222222222', false);
SELECT test_expect('non-proposer edits terms that are still un-accepted',
$sql$ UPDATE campaign_projects SET budget = 99000 WHERE id = 1 $sql$, true);

SELECT reset_project();
INSERT INTO project_change_requests (id, project_id, proposed_by, changes)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 1,
        '11111111-1111-1111-1111-111111111111', '{"budget": 1}'::jsonb);
SELECT set_config('request.test.uid', '11111111-1111-1111-1111-111111111111', false);
SELECT test_expect('proposer accepts their OWN change request',
$sql$ SELECT apply_change_request('aaaaaaaa-0000-0000-0000-000000000002') $sql$, true);

\echo ''
\echo '=== PUBLIC RATINGS (migration 080) ======================================'

SELECT reset_project();
-- Set up as the server would (no auth.uid()): one participant may not set both
-- completion flags, which the suite above already proves.
SELECT set_config('request.test.uid', '', false);
UPDATE campaign_projects SET status = 'completed',
  owner_confirmed_complete = true, counterparty_confirmed_complete = true WHERE id = 1;
INSERT INTO reviews (project_id, from_user_id, to_user_id, rating, comment) VALUES
  (1, '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222', 5, 'Delivered early, great work.');

SELECT CASE
  WHEN (get_public_reviews('22222222-2222-2222-2222-222222222222')->>'count')::int = 1
   AND (get_public_reviews('22222222-2222-2222-2222-222222222222')->>'average')::numeric = 5.0
   AND get_public_reviews('22222222-2222-2222-2222-222222222222')->'items'->0->>'reviewer_name' = 'Brand Co Pvt Ltd'
  THEN 'pass  rating reads back under the brand''s company name'
  ELSE 'FAIL  rating did not read back: ' || get_public_reviews('22222222-2222-2222-2222-222222222222')::text END;

-- Campaign names are not ours to publish.
SELECT CASE
  WHEN get_public_reviews('22222222-2222-2222-2222-222222222222')::text LIKE '%Summer Campaign%'
  THEN 'FAIL  project title leaked into the public payload'
  ELSE 'pass  project title stays out of the public payload' END;

-- A rating for work that was undone must stop advertising.
UPDATE campaign_projects SET status = 'cancelled' WHERE id = 1;
SELECT CASE
  WHEN (get_public_reviews('22222222-2222-2222-2222-222222222222')->>'count')::int = 0
  THEN 'pass  rating disappears when the project is cancelled'
  ELSE 'FAIL  cancelled project still advertises its rating' END;

\echo ''

\set ON_ERROR_STOP on
\pset pager off

-- Migration 071: a proposal must NOT be a project.
-- The whole point is that campaign_projects stays empty until both sides agree.

INSERT INTO auth.users (id, email) VALUES
  ('c1111111-1111-1111-1111-111111111111','p.brand@test.com'),
  ('c2222222-2222-2222-2222-222222222222','p.creator@test.com');
INSERT INTO public.profiles (id, role, email, name) VALUES
  ('c1111111-1111-1111-1111-111111111111','business_owner','p.brand@test.com','Brand'),
  ('c2222222-2222-2222-2222-222222222222','influencer','p.creator@test.com','Creator');

\set BRAND   '''c1111111-1111-1111-1111-111111111111'''
\set CREATOR '''c2222222-2222-2222-2222-222222222222'''

CREATE OR REPLACE FUNCTION t_check(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION t_raises(label text, stmt text, want text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%'||want||'%' THEN RAISE NOTICE 'PASS  % (raised %)', label, want; RETURN;
    ELSE RAISE EXCEPTION 'FAIL  % — wanted "%", got "%"', label, want, SQLERRM; END IF;
  END;
  RAISE EXCEPTION 'FAIL  % — expected "%" but nothing raised', label, want;
END $$;

INSERT INTO public.collab_requests (id, from_user_id, to_user_id, message, budget)
VALUES ('cccc0000-0000-0000-0000-000000000001', :BRAND, :CREATOR, E'Product-Launch\n\nHii lest colab', 30000);

SET request.test.uid = 'c2222222-2222-2222-2222-222222222222';
SELECT public.accept_collab_request('cccc0000-0000-0000-0000-000000000001');
SELECT t_check('accepting the request creates no project',
  (SELECT count(*) FROM public.campaign_projects) = 0);

-- ══ The brand proposes terms ══════════════════════════════════════════════
SET request.test.uid = 'c1111111-1111-1111-1111-111111111111';
SELECT t_check('brand can propose terms',
  (public.propose_project('cccc0000-0000-0000-0000-000000000001',
     'New-Product-Promotion','Three reels',50000,20000,'2026-09-15','As discussed')->>'status') = 'pending');

SELECT t_check('THE KEY CHANGE: proposing still creates NO project',
  (SELECT count(*) FROM public.campaign_projects) = 0);
SELECT t_check('the terms live as a pending proposal',
  (SELECT count(*) FROM public.project_proposals WHERE status='pending') = 1);
SELECT t_check('the proposal is attached to the conversation',
  (SELECT conversation_id IS NOT NULL FROM public.project_proposals LIMIT 1));

-- ══ Guards ════════════════════════════════════════════════════════════════
SELECT t_raises('the proposer cannot accept their own terms',
  $$SELECT public.respond_to_proposal((SELECT id FROM public.project_proposals WHERE status='pending'), true)$$,
  'proposer_cannot_respond');
SELECT t_raises('a second set of terms cannot be stacked on the first',
  $$SELECT public.propose_project('cccc0000-0000-0000-0000-000000000001','Competing terms')$$,
  'proposal_already_pending');

-- ══ Decline keeps everything in the conversation ══════════════════════════
SET request.test.uid = 'c2222222-2222-2222-2222-222222222222';
SELECT t_check('creator declines the terms',
  (public.respond_to_proposal((SELECT id FROM public.project_proposals WHERE status='pending'),
    false, 'Can we do 60k?')->>'status') = 'declined');
SELECT t_check('declining STILL creates no project',
  (SELECT count(*) FROM public.campaign_projects) = 0);
SELECT t_check('the request stays accepted so they keep talking',
  (SELECT status::text FROM public.collab_requests WHERE id='cccc0000-0000-0000-0000-000000000001') = 'accepted');

-- A decline must leave a RECORD, not a hole: the other side has to be able to
-- see what was refused and why, then come back with revised terms.
SELECT t_check('the declined terms are kept, not deleted',
  (SELECT count(*) FROM public.project_proposals WHERE status='declined') = 1);
SELECT t_check('the decline reason is stored',
  (SELECT review_note FROM public.project_proposals WHERE status='declined') = 'Can we do 60k?');
SELECT t_check('who declined it and when are recorded',
  (SELECT resolved_by = :CREATOR::uuid AND resolved_at IS NOT NULL
     FROM public.project_proposals WHERE status='declined'));
SELECT t_check('the original numbers survive for pre-filling a revised offer',
  (SELECT budget = 50000 AND advance_amount = 20000 AND due_date = '2026-09-15'
     FROM public.project_proposals WHERE status='declined'));

-- ══ Re-propose at the renegotiated number ═════════════════════════════════
SELECT t_check('creator re-proposes after the decline',
  (public.propose_project('cccc0000-0000-0000-0000-000000000001',
     'New-Product-Promotion','Three reels',60000,20000,'2026-09-15')->>'status') = 'pending');
SELECT t_check('still no project while the new terms are pending',
  (SELECT count(*) FROM public.campaign_projects) = 0);

-- ══ Acceptance is what creates the project ════════════════════════════════
SET request.test.uid = 'c1111111-1111-1111-1111-111111111111';
SELECT t_check('brand accepts — a project is created',
  (public.respond_to_proposal((SELECT id FROM public.project_proposals WHERE status='pending'), true)->>'project_id') IS NOT NULL);

SELECT t_check('exactly one project now exists',
  (SELECT count(*) FROM public.campaign_projects) = 1);
SELECT t_check('it is ACTIVE, never pending_acceptance',
  (SELECT status FROM public.campaign_projects LIMIT 1) = 'active');
SELECT t_check('the brand owns it and the creator is the counterparty',
  (SELECT owner_user_id = :BRAND::uuid AND counterparty_user_id = :CREATOR::uuid
     FROM public.campaign_projects LIMIT 1));
SELECT t_check('the renegotiated terms carried over (60k, 20k advance, due date)',
  (SELECT budget = 60000 AND advance_amount = 20000 AND due_date = '2026-09-15'
     FROM public.campaign_projects LIMIT 1));
SELECT t_check('the proposal is linked to the project it produced',
  (SELECT project_id IS NOT NULL FROM public.project_proposals WHERE status='accepted'));
SELECT t_check('the project starts at stage 1',
  (SELECT current_stage FROM public.campaign_projects LIMIT 1) = 'collaboration_started');

-- ══ Nothing further can be proposed once a project exists ═════════════════
SELECT t_raises('no new terms once the project is live',
  $$SELECT public.propose_project('cccc0000-0000-0000-0000-000000000001','Another one')$$,
  'project_already_exists');

-- ══ Outsiders ═════════════════════════════════════════════════════════════
INSERT INTO auth.users (id,email) VALUES ('c3333333-3333-3333-3333-333333333333','p.stranger@test.com');
INSERT INTO public.profiles (id,role,email,name)
VALUES ('c3333333-3333-3333-3333-333333333333','influencer','p.stranger@test.com','Stranger');
SET request.test.uid = 'c3333333-3333-3333-3333-333333333333';
SELECT t_raises('a stranger cannot propose on someone else''s deal',
  $$SELECT public.propose_project('cccc0000-0000-0000-0000-000000000001','Hijack')$$,
  'not_a_participant');

SELECT '── ALL PROPOSAL-FLOW ASSERTIONS PASSED ──' AS result;

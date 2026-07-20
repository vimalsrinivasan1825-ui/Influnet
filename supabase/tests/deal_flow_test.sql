\set ON_ERROR_STOP on
\pset pager off

-- ── Fixtures: one brand, one creator ──────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111','brand@test.com'),
  ('22222222-2222-2222-2222-222222222222','creator@test.com');
INSERT INTO public.profiles (id, role, email, name) VALUES
  ('11111111-1111-1111-1111-111111111111','business_owner','brand@test.com','Acme Brand'),
  ('22222222-2222-2222-2222-222222222222','influencer','creator@test.com','Nova Creator');

\set BRAND   '''11111111-1111-1111-1111-111111111111'''
\set CREATOR '''22222222-2222-2222-2222-222222222222'''

CREATE OR REPLACE FUNCTION t_check(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- Assert an expression raises the expected error.
CREATE OR REPLACE FUNCTION t_raises(label text, stmt text, want text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%'||want||'%' THEN RAISE NOTICE 'PASS  % (raised %)', label, want; RETURN;
    ELSE RAISE EXCEPTION 'FAIL  % — wanted "%", got "%"', label, want, SQLERRM; END IF;
  END;
  RAISE EXCEPTION 'FAIL  % — expected "%" but nothing raised', label, want;
END $$;

-- ══ 1. Brand sends a request ══════════════════════════════════════════════
INSERT INTO public.collab_requests (id, from_user_id, to_user_id, message, budget)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', :BRAND, :CREATOR, E'Summer campaign\n\nThree reels', 50000);

-- ══ 2. A project cannot exist before the request is accepted ══════════════
SET request.test.uid = '22222222-2222-2222-2222-222222222222';
SELECT t_raises(
  'creator cannot create a project on a PENDING request',
  $$SELECT public.create_project_from_collab('aaaaaaaa-0000-0000-0000-000000000001','Jumping the gun')$$,
  'request_not_accepted');

-- ══ 3. Only the receiver may accept ═══════════════════════════════════════
SET request.test.uid = '11111111-1111-1111-1111-111111111111';
SELECT t_raises(
  'sender cannot accept their own request',
  $$SELECT public.accept_collab_request('aaaaaaaa-0000-0000-0000-000000000001')$$,
  'only_receiver_can_accept');

-- ══ 4. Creator accepts → conversation opens, NO project is created ════════
SET request.test.uid = '22222222-2222-2222-2222-222222222222';
SELECT t_check('accept returns a conversation',
  (public.accept_collab_request('aaaaaaaa-0000-0000-0000-000000000001')->>'conversation_id') IS NOT NULL);
SELECT t_check('THE KEY CHANGE: accepting creates NO project',
  (SELECT count(*) FROM public.campaign_projects) = 0);
SELECT t_check('request is now accepted',
  (SELECT status::text FROM public.collab_requests WHERE id='aaaaaaaa-0000-0000-0000-000000000001') = 'accepted');
SELECT t_check('both parties are in the conversation',
  (SELECT count(*) FROM public.conversation_participants) = 2);

-- Re-accepting is idempotent and still makes no project.
SELECT t_check('re-accept is idempotent',
  (public.accept_collab_request('aaaaaaaa-0000-0000-0000-000000000001')->>'already_accepted')::boolean);
SELECT t_check('re-accept still creates no project',
  (SELECT count(*) FROM public.campaign_projects) = 0);

-- ══ 5. Either side may propose the project — here the CREATOR does ════════
SELECT t_check('creator can create the project',
  (public.create_project_from_collab(
     'aaaaaaaa-0000-0000-0000-000000000001',
     'Summer campaign — 3 reels',
     'Negotiated down from 5 reels',
     40000, 15000, '2026-09-01', 'As we discussed')->>'project_id') IS NOT NULL);

SELECT t_check('project starts as pending_acceptance',
  (SELECT status FROM public.campaign_projects LIMIT 1) = 'pending_acceptance');
SELECT t_check('the BRAND owns it even though the creator proposed it',
  (SELECT owner_user_id FROM public.campaign_projects LIMIT 1) = :BRAND::uuid);
SELECT t_check('creator is the counterparty',
  (SELECT counterparty_user_id FROM public.campaign_projects LIMIT 1) = :CREATOR::uuid);
SELECT t_check('proposer is recorded',
  (SELECT created_by_user_id FROM public.campaign_projects LIMIT 1) = :CREATOR::uuid);
SELECT t_check('negotiated terms are stored (budget/advance/due date)',
  (SELECT budget = 40000 AND advance_amount = 15000 AND due_date = '2026-09-01'
     FROM public.campaign_projects LIMIT 1));
SELECT t_check('project is linked to the conversation',
  (SELECT conversation_id IS NOT NULL FROM public.campaign_projects LIMIT 1));

-- ══ 6. Only ONE project per request ═══════════════════════════════════════
SELECT t_raises('a second project cannot be created for the same request',
  $$SELECT public.create_project_from_collab('aaaaaaaa-0000-0000-0000-000000000001','Duplicate')$$,
  'project_already_exists');

-- ══ 7. The proposer cannot accept their own proposal ══════════════════════
SELECT t_raises('creator cannot accept the project they proposed',
  $$SELECT public.respond_to_project_proposal((SELECT id FROM public.campaign_projects LIMIT 1), true)$$,
  'proposer_cannot_respond');

-- ══ 8. The other side accepts → project goes live ═════════════════════════
SET request.test.uid = '11111111-1111-1111-1111-111111111111';
SELECT t_check('brand accepts the proposal',
  (public.respond_to_project_proposal((SELECT id FROM public.campaign_projects LIMIT 1), true)->>'status') = 'active');
SELECT t_check('project is now active with accepted_at set',
  (SELECT status = 'active' AND accepted_at IS NOT NULL FROM public.campaign_projects LIMIT 1));
SELECT t_check('project enters the pipeline at collaboration_started',
  (SELECT current_stage FROM public.campaign_projects LIMIT 1) = 'collaboration_started');

SELECT t_raises('an already-active project cannot be re-accepted',
  $$SELECT public.respond_to_project_proposal((SELECT id FROM public.campaign_projects LIMIT 1), true)$$,
  'project_not_pending');

-- ══ 9. DECLINE path — a second deal between the same pair ═════════════════
INSERT INTO public.collab_requests (id, from_user_id, to_user_id, message, budget)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002', :BRAND, :CREATOR, 'Winter campaign', 90000);
SET request.test.uid = '22222222-2222-2222-2222-222222222222';
SELECT public.accept_collab_request('aaaaaaaa-0000-0000-0000-000000000002');

SET request.test.uid = '11111111-1111-1111-1111-111111111111';
SELECT public.create_project_from_collab('aaaaaaaa-0000-0000-0000-000000000002','Winter campaign','',90000);
SELECT t_check('brand proposed the second project',
  (SELECT created_by_user_id FROM public.campaign_projects
    WHERE collab_request_id='aaaaaaaa-0000-0000-0000-000000000002') = :BRAND::uuid);

SET request.test.uid = '22222222-2222-2222-2222-222222222222';
SELECT t_check('creator declines the terms',
  (public.respond_to_project_proposal(
     (SELECT id FROM public.campaign_projects WHERE collab_request_id='aaaaaaaa-0000-0000-0000-000000000002'),
     false, 'Budget is too low for this scope')->>'deleted')::boolean);
SELECT t_check('declined proposal is gone, live project untouched',
  (SELECT count(*) FROM public.campaign_projects) = 1);
SELECT t_check('the collab request STAYS accepted so they can keep negotiating',
  (SELECT status::text FROM public.collab_requests WHERE id='aaaaaaaa-0000-0000-0000-000000000002') = 'accepted');

-- ══ 10. After a decline, either side can propose fresh terms ══════════════
SELECT t_check('creator re-proposes at a renegotiated budget',
  (public.create_project_from_collab('aaaaaaaa-0000-0000-0000-000000000002','Winter campaign v2','',120000)->>'status') = 'pending_acceptance');
SELECT t_check('two projects now exist (one live, one proposed)',
  (SELECT count(*) FROM public.campaign_projects) = 2);

-- ══ 11. Outsiders are locked out ══════════════════════════════════════════
INSERT INTO auth.users (id, email) VALUES ('33333333-3333-3333-3333-333333333333','stranger@test.com');
INSERT INTO public.profiles (id, role, email, name)
VALUES ('33333333-3333-3333-3333-333333333333','influencer','stranger@test.com','Stranger');
SET request.test.uid = '33333333-3333-3333-3333-333333333333';
SELECT t_raises('a stranger cannot propose a project on someone else''s deal',
  $$SELECT public.create_project_from_collab('aaaaaaaa-0000-0000-0000-000000000001','Hijack')$$,
  'not_a_participant');
SELECT t_raises('a stranger cannot respond to someone else''s proposal',
  $$SELECT public.respond_to_project_proposal((SELECT id FROM public.campaign_projects WHERE status='pending_acceptance'), true)$$,
  'not_a_participant');

-- ══ 12. Business profile stays private to unrelated viewers ═══════════════
INSERT INTO public.business_profiles (user_id, company_name, username)
VALUES (:BRAND::uuid, 'Acme Inc', 'acme')
ON CONFLICT (user_id) DO UPDATE SET username = 'acme';
SELECT t_check('a stranger cannot see the brand profile',
  public.get_business_eligibility('acme', '33333333-3333-3333-3333-333333333333') IS NULL);
SELECT t_check('the creator in the deal CAN see the brand profile',
  public.get_business_eligibility('acme', '22222222-2222-2222-2222-222222222222') IS NOT NULL);

SELECT '── ALL DEAL-FLOW ASSERTIONS PASSED ──' AS result;

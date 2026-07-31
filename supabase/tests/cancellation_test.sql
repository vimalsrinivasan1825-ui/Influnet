\set ON_ERROR_STOP on
\pset pager off

-- Migration 072: cancelling preserves the record.

CREATE OR REPLACE FUNCTION t_check(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF; END $$;

CREATE OR REPLACE FUNCTION t_raises(label text, stmt text, want text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%'||want||'%' THEN RAISE NOTICE 'PASS  % (raised %)', label, want; RETURN;
    ELSE RAISE EXCEPTION 'FAIL  % — wanted "%", got "%"', label, want, SQLERRM; END IF;
  END;
  RAISE EXCEPTION 'FAIL  % — expected "%" but nothing raised', label, want;
END $$;

INSERT INTO auth.users (id,email) VALUES
 ('e1111111-1111-1111-1111-111111111111','x.brand@t.com'),
 ('e2222222-2222-2222-2222-222222222222','x.creator@t.com');
INSERT INTO public.profiles (id,role,email,name) VALUES
 ('e1111111-1111-1111-1111-111111111111','business_owner','x.brand@t.com','B'),
 ('e2222222-2222-2222-2222-222222222222','influencer','x.creator@t.com','C');
INSERT INTO public.campaign_projects (id, owner_user_id, counterparty_user_id, title, budget, status, current_stage)
VALUES (9001,'e1111111-1111-1111-1111-111111111111','e2222222-2222-2222-2222-222222222222','Doomed', 40000, 'active','advance_payment');
INSERT INTO public.project_payments (project_id, stage_key, amount, status)
VALUES (9001, 'advance_payment', 15000, 'paid');

-- ── One side cannot cancel alone ──────────────────────────────────────────
SET request.test.uid = 'e1111111-1111-1111-1111-111111111111';
SELECT t_raises('cannot cancel without the other side requesting it',
  $$SELECT public.cancel_project(9001)$$, 'no_cancellation_requested');

UPDATE public.campaign_projects SET cancel_requested_by='e1111111-1111-1111-1111-111111111111' WHERE id=9001;
SELECT t_raises('the requester cannot accept their own cancellation',
  $$SELECT public.cancel_project(9001)$$, 'requester_cannot_accept');

-- ── The other side accepts ────────────────────────────────────────────────
SET request.test.uid = 'e2222222-2222-2222-2222-222222222222';
SELECT t_check('the other side can accept the cancellation',
  (public.cancel_project(9001, 'Scope changed')->>'status') = 'cancelled');

SELECT t_check('THE KEY CHANGE: the project row still exists',
  (SELECT count(*) FROM public.campaign_projects WHERE id=9001) = 1);
SELECT t_check('the payment ledger survived',
  (SELECT count(*) FROM public.project_payments WHERE project_id=9001) = 1);
SELECT t_check('who cancelled it, when, and why are all recorded',
  (SELECT cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancellation_reason='Scope changed'
     FROM public.campaign_projects WHERE id=9001));

SELECT t_raises('a cancelled project cannot be cancelled twice',
  $$SELECT public.cancel_project(9001)$$, 'already_cancelled');

-- ── A cancelled project is frozen ─────────────────────────────────────────
SET ROLE authenticated;
SET request.test.uid = 'e2222222-2222-2222-2222-222222222222';
UPDATE public.campaign_projects SET current_stage='project_completed' WHERE id=9001;
RESET ROLE;
SELECT t_check('a cancelled project can no longer be edited',
  (SELECT current_stage FROM public.campaign_projects WHERE id=9001) = 'advance_payment');

-- ── Completed work can never be cancelled away ────────────────────────────
INSERT INTO public.campaign_projects (id, owner_user_id, counterparty_user_id, title, status, current_stage, cancel_requested_by)
VALUES (9002,'e1111111-1111-1111-1111-111111111111','e2222222-2222-2222-2222-222222222222','Done','completed','project_completed','e1111111-1111-1111-1111-111111111111');
SET request.test.uid = 'e2222222-2222-2222-2222-222222222222';
SELECT t_raises('a completed project cannot be cancelled',
  $$SELECT public.cancel_project(9002)$$, 'cannot_cancel_completed');

SELECT '── ALL CANCELLATION ASSERTIONS PASSED ──' AS result;

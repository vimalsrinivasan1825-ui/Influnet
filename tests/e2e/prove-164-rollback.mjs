// Prove migration 164 WITHOUT applying it (a transaction that always aborts).
// Runs the real triggers as the caller (SET LOCAL ROLE authenticated + a JWT) and
// as the table owner, on one real business and one real creator:
//
//   requests:  rejected BLOCKED · pending ALLOWED · approved ALLOWED · a creator
//              sender unaffected · the block also holds for the owner role.
//   campaigns: pending BLOCKED on insert and on publish · approved may create a draft
//              and publish it · once rejected, publish and reopen are BLOCKED, but a
//              plain edit and closing still work.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/prove-164-rollback.mjs

import { readFileSync } from 'node:fs';
import { sql, PROJECT_REF } from './lib/sql.mjs';

let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); if (!ok) failed++; };
const migration = readFileSync(new URL('../../supabase/migrations/164_business_approval_guards.sql', import.meta.url), 'utf8');

const proof = `
DO $proof$
DECLARE
  r jsonb := '{}'::jsonb;
  biz uuid; cr uuid; cr2 uuid; camp uuid; msg text;
  ok_rejected boolean; ok_pending boolean; ok_approved boolean; ok_creator boolean; ok_owner_rejected boolean;
  ins_pending boolean; pub_pending boolean; ins_approved boolean; pub_approved boolean;
  pub_rejected boolean; reopen_rejected boolean; edit_rejected boolean; close_rejected boolean;
  guards boolean;
  PROCEDURE_DUMMY int;
BEGIN
  SELECT user_id INTO biz FROM public.business_profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO cr  FROM public.profiles WHERE role = 'influencer' ORDER BY created_at LIMIT 1;
  SELECT id INTO cr2 FROM public.profiles WHERE role = 'influencer' AND id <> cr ORDER BY created_at LIMIT 1;
  guards := public.business_approval_guards_installed();

  -- helper pattern: run as the business (authenticated), record whether an insert was refused with business_not_approved
  -- ---------- collab requests ----------
  UPDATE public.business_profiles SET approval_status = 'rejected' WHERE user_id = biz;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', biz, 'role', 'authenticated')::text, true);
  BEGIN INSERT INTO public.collab_requests (from_user_id, to_user_id, message) VALUES (biz, cr, 'p'); ok_rejected := false;
  EXCEPTION WHEN OTHERS THEN ok_rejected := (SQLERRM = 'business_not_approved'); END;
  RESET ROLE;
  -- the same block holds for the table owner (service-role / RPC paths)
  BEGIN INSERT INTO public.collab_requests (from_user_id, to_user_id, message) VALUES (biz, cr, 'p'); ok_owner_rejected := false;
  EXCEPTION WHEN OTHERS THEN ok_owner_rejected := (SQLERRM = 'business_not_approved'); END;

  UPDATE public.business_profiles SET approval_status = 'pending_review' WHERE user_id = biz;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', biz, 'role', 'authenticated')::text, true);
  BEGIN INSERT INTO public.collab_requests (from_user_id, to_user_id, message) VALUES (biz, cr, 'pending ok'); ok_pending := true;
  EXCEPTION WHEN OTHERS THEN ok_pending := false; END;
  RESET ROLE;

  UPDATE public.business_profiles SET approval_status = 'approved' WHERE user_id = biz;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', biz, 'role', 'authenticated')::text, true);
  BEGIN INSERT INTO public.collab_requests (from_user_id, to_user_id, message) VALUES (biz, cr2, 'approved ok'); ok_approved := true;
  EXCEPTION WHEN OTHERS THEN ok_approved := false; END;
  RESET ROLE;

  -- a creator sending a peer request is not a business: unaffected
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cr, 'role', 'authenticated')::text, true);
  BEGIN INSERT INTO public.collab_requests (from_user_id, to_user_id, message) VALUES (cr, cr2, 'peer ok'); ok_creator := true;
  EXCEPTION WHEN OTHERS THEN ok_creator := false; END;
  RESET ROLE;

  -- ---------- campaigns ----------
  UPDATE public.business_profiles SET approval_status = 'pending_review' WHERE user_id = biz;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', biz, 'role', 'authenticated')::text, true);
  BEGIN INSERT INTO public.campaigns (business_user_id, title, status) VALUES (biz, 'pend draft', 'draft'); ins_pending := false;
  EXCEPTION WHEN OTHERS THEN ins_pending := (SQLERRM = 'business_not_approved'); END;
  BEGIN INSERT INTO public.campaigns (business_user_id, title, status) VALUES (biz, 'pend live', 'live'); pub_pending := false;
  EXCEPTION WHEN OTHERS THEN pub_pending := (SQLERRM = 'business_not_approved'); END;
  RESET ROLE;

  UPDATE public.business_profiles SET approval_status = 'approved' WHERE user_id = biz;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', biz, 'role', 'authenticated')::text, true);
  BEGIN INSERT INTO public.campaigns (business_user_id, title, status) VALUES (biz, 'appr draft', 'draft') RETURNING id INTO camp; ins_approved := true;
  EXCEPTION WHEN OTHERS THEN ins_approved := false; END;
  BEGIN UPDATE public.campaigns SET status = 'live' WHERE id = camp; pub_approved := true;
  EXCEPTION WHEN OTHERS THEN pub_approved := false; END;
  RESET ROLE;

  -- approval withdrawn later
  UPDATE public.business_profiles SET approval_status = 'rejected' WHERE user_id = biz;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', biz, 'role', 'authenticated')::text, true);
  BEGIN UPDATE public.campaigns SET title = 'edited while rejected' WHERE id = camp; edit_rejected := true;
  EXCEPTION WHEN OTHERS THEN edit_rejected := false; END;
  BEGIN UPDATE public.campaigns SET status = 'closed' WHERE id = camp; close_rejected := true;
  EXCEPTION WHEN OTHERS THEN close_rejected := false; END;
  BEGIN UPDATE public.campaigns SET status = 'live' WHERE id = camp; reopen_rejected := false;
  EXCEPTION WHEN OTHERS THEN reopen_rejected := (SQLERRM = 'business_not_approved'); END;
  -- a fresh draft cannot be published either
  BEGIN pub_rejected := false; INSERT INTO public.campaigns (business_user_id, title, status) VALUES (biz, 'rej draft', 'draft'); EXCEPTION WHEN OTHERS THEN pub_rejected := (SQLERRM = 'business_not_approved'); END;
  RESET ROLE;

  r := jsonb_build_object('guards_installed', guards,
    'req_rejected_blocked', ok_rejected, 'req_rejected_blocked_for_owner_role', ok_owner_rejected,
    'req_pending_allowed', ok_pending, 'req_approved_allowed', ok_approved, 'req_creator_unaffected', ok_creator,
    'camp_insert_pending_blocked', ins_pending, 'camp_publish_pending_blocked', pub_pending,
    'camp_insert_approved_ok', ins_approved, 'camp_publish_approved_ok', pub_approved,
    'camp_edit_when_rejected_ok', edit_rejected, 'camp_close_when_rejected_ok', close_rejected,
    'camp_reopen_when_rejected_blocked', reopen_rejected, 'camp_insert_rejected_blocked', pub_rejected);
  RAISE EXCEPTION 'PROOF:%', r::text;
END
$proof$;`.replace('PROCEDURE_DUMMY int;', '');

let result;
try { await sql(`BEGIN;\n${migration}\n${proof}\nROLLBACK;`); console.log('unexpected: did not abort'); process.exit(2); }
catch (e) {
  const m = String(e.message).match(/PROOF:(\{.*?\})(?:\\n|\n|\s)*CONTEXT/s);
  if (!m) { console.log('proof failed to run:\n' + String(e.message).slice(0, 1400)); process.exit(2); }
  result = JSON.parse(m[1].replace(/\\"/g, '"'));
}
console.log(`project ${PROJECT_REF}\n${JSON.stringify(result)}\n`);
const R = result;
check('both guard triggers exist (health probe true)', R.guards_installed);
check('a REJECTED business cannot send a request (as the caller)', R.req_rejected_blocked);
check('…nor as the table owner (service-role / RPC paths)', R.req_rejected_blocked_for_owner_role);
check('a business awaiting review CAN still send (the July 2026 product rule)', R.req_pending_allowed);
check('an approved business can send', R.req_approved_allowed);
check('a creator sending a peer request is unaffected', R.req_creator_unaffected);
check('a pending business cannot create a campaign', R.camp_insert_pending_blocked);
check('a pending business cannot create a LIVE campaign directly', R.camp_publish_pending_blocked);
check('an approved business can create a draft', R.camp_insert_approved_ok);
check('…and publish it', R.camp_publish_approved_ok);
check('once rejected: a plain edit still works', R.camp_edit_when_rejected_ok);
check('…and closing a campaign still works', R.camp_close_when_rejected_ok);
check('…but reopening it (status → live) is blocked', R.camp_reopen_when_rejected_blocked);
check('…and creating a new one is blocked', R.camp_insert_rejected_blocked);
console.log(failed ? `\n${failed} FAILED` : '\nAll proofs passed — nothing was persisted.');
process.exit(failed ? 1 : 0);

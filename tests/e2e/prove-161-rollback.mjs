// Prove migration 161 WITHOUT applying it: the whole migration, plus a real
// participant deletion, runs inside one transaction that always aborts.
//
// The Management API returns only the last statement's rows, so the proof ends
// with RAISE EXCEPTION carrying a JSON result. An exception aborts the
// transaction, so nothing can persist — even if a step above it succeeded.
//
// It deletes a REAL participant (from profiles, which is what
// auth.admin.deleteUser cascades through) of two real projects and reports
// what survived, then reads the survivor's and a stranger's view through RLS.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/prove-161-rollback.mjs
// Safe to run before AND after the migration is applied (the migration is
// idempotent: DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT).

import { readFileSync } from 'node:fs';
import { sql, PROJECT_REF } from './lib/sql.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const migration = readFileSync(new URL('../../supabase/migrations/161_project_survives_user_deletion.sql', import.meta.url), 'utf8');

const proof = `
DO $proof$
DECLARE
  r jsonb := '{}'::jsonb;
  pa record; pb record;
  n_pay_before int; n_doc_before int; n_items_before int;
  n_pay_after int;  n_doc_after int;  n_items_after int;
  stranger uuid; seen_survivor int; seen_stranger int;
BEGIN
  -- Scenario A: delete the COUNTERPARTY of the project with the biggest ledger.
  SELECT p.id, p.owner_user_id AS owner, p.counterparty_user_id AS cp INTO pa
    FROM public.campaign_projects p
    WHERE p.owner_user_id IS NOT NULL AND p.counterparty_user_id IS NOT NULL
    ORDER BY (SELECT count(*) FROM public.project_payments x WHERE x.project_id = p.id) DESC, p.id
    LIMIT 1;
  IF pa.id IS NULL THEN RAISE EXCEPTION 'PROOF:%', '{"skipped":"no project with two participants"}'; END IF;

  SELECT count(*) INTO n_pay_before FROM public.project_payments WHERE project_id = pa.id;
  SELECT count(*) INTO n_doc_before FROM public.project_documents WHERE project_id = pa.id;
  SELECT count(*) INTO n_items_before FROM public.project_stage_items WHERE project_id = pa.id;

  DELETE FROM public.profiles WHERE id = pa.cp;

  SELECT count(*) INTO n_pay_after FROM public.project_payments WHERE project_id = pa.id;
  SELECT count(*) INTO n_doc_after FROM public.project_documents WHERE project_id = pa.id;
  SELECT count(*) INTO n_items_after FROM public.project_stage_items WHERE project_id = pa.id;

  r := r || jsonb_build_object('A', jsonb_build_object(
    'project', pa.id,
    'survives', EXISTS (SELECT 1 FROM public.campaign_projects WHERE id = pa.id),
    'owner_kept', EXISTS (SELECT 1 FROM public.campaign_projects WHERE id = pa.id AND owner_user_id = pa.owner),
    'counterparty_null', EXISTS (SELECT 1 FROM public.campaign_projects WHERE id = pa.id AND counterparty_user_id IS NULL),
    'payments', jsonb_build_array(n_pay_before, n_pay_after),
    'documents', jsonb_build_array(n_doc_before, n_doc_after),
    'stage_items', jsonb_build_array(n_items_before, n_items_after)));

  -- RLS: survivor still sees it, a stranger does not.
  SELECT id INTO stranger FROM public.profiles WHERE id NOT IN (pa.owner, pa.cp) LIMIT 1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pa.owner, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO seen_survivor FROM public.campaign_projects WHERE id = pa.id;
  SELECT count(*) INTO n_pay_after FROM public.project_payments WHERE project_id = pa.id;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO seen_stranger FROM public.campaign_projects WHERE id = pa.id;
  EXECUTE 'RESET ROLE';
  r := r || jsonb_build_object('rls', jsonb_build_object('survivor_sees_project', seen_survivor, 'survivor_sees_payments', n_pay_after, 'stranger_sees_project', seen_stranger));

  -- Scenario B: delete the OWNER of a different project.
  SELECT p.id, p.owner_user_id AS owner, p.counterparty_user_id AS cp INTO pb
    FROM public.campaign_projects p
    WHERE p.owner_user_id IS NOT NULL AND p.counterparty_user_id IS NOT NULL AND p.id <> pa.id
    ORDER BY (SELECT count(*) FROM public.project_payments x WHERE x.project_id = p.id) DESC, p.id LIMIT 1;
  IF pb.id IS NOT NULL THEN
    SELECT count(*) INTO n_pay_before FROM public.project_payments WHERE project_id = pb.id;
    DELETE FROM public.profiles WHERE id = pb.owner;
    SELECT count(*) INTO n_pay_after FROM public.project_payments WHERE project_id = pb.id;
    r := r || jsonb_build_object('B', jsonb_build_object(
      'project', pb.id,
      'survives', EXISTS (SELECT 1 FROM public.campaign_projects WHERE id = pb.id),
      'owner_null', EXISTS (SELECT 1 FROM public.campaign_projects WHERE id = pb.id AND owner_user_id IS NULL),
      'counterparty_kept', EXISTS (SELECT 1 FROM public.campaign_projects WHERE id = pb.id AND counterparty_user_id = pb.cp),
      'payments', jsonb_build_array(n_pay_before, n_pay_after)));
  END IF;

  RAISE EXCEPTION 'PROOF:%', r::text;
END
$proof$;`;

let result;
try {
  await sql(`BEGIN;\n${migration}\n${proof}\nROLLBACK;`);
  console.log('unexpected: the proof did not abort'); process.exit(2);
} catch (e) {
  // The API wraps the message in JSON, so quotes arrive as \" and newlines as \n.
  const m = String(e.message).match(/PROOF:(\{.*?\})(?:\\n|\n|\s)*CONTEXT/s);
  if (!m) { console.log('proof failed to run:\n' + String(e.message).slice(0, 900)); process.exit(2); }
  result = JSON.parse(m[1].replace(/\\"/g, '"'));
}

console.log(`project ${PROJECT_REF}\n${JSON.stringify(result)}\n`);
if (result.skipped) { console.log('SKIPPED:', result.skipped); process.exit(0); }
const A = result.A, B = result.B, rls = result.rls;
check('A: deleting the counterparty leaves the project', A.survives);
check('A: the surviving owner is untouched', A.owner_kept);
check('A: the deleted party’s column is NULL, not cascaded', A.counterparty_null);
check('A: payment ledger rows all survive', A.payments[0] === A.payments[1], `${A.payments[0]} → ${A.payments[1]}`);
check('A: documents all survive', A.documents[0] === A.documents[1], `${A.documents[0]} → ${A.documents[1]}`);
check('A: signed-off checklist survives', A.stage_items[0] === A.stage_items[1], `${A.stage_items[0]} → ${A.stage_items[1]}`);
check('RLS: the survivor still sees the project', rls.survivor_sees_project === 1);
check('RLS: the survivor still reads the payment ledger', rls.survivor_sees_payments === A.payments[1]);
check('RLS: a stranger still sees nothing', rls.stranger_sees_project === 0);
if (B) {
  check('B: deleting the OWNER leaves the project', B.survives);
  check('B: owner column is NULL, counterparty kept', B.owner_null && B.counterparty_kept);
  check('B: payment ledger survives', B.payments[0] === B.payments[1], `${B.payments[0]} → ${B.payments[1]}`);
} else {
  console.log('(no second project to test the owner-deletes direction)');
}
console.log(failed ? `\n${failed} FAILED` : '\nAll proofs passed — nothing was persisted (transaction aborted).');
process.exit(failed ? 1 : 0);

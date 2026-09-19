// Prove migration 163 WITHOUT applying it (transaction that always aborts).
//   1. The three columns exist and the context CHECK rejects an unknown value.
//   2. A report keeps existing when its campaign or its request is deleted
//      (ON DELETE SET NULL): deleting evidence must never delete the report.
// Usage: node --env-file=apps/web/.env.local tests/e2e/prove-163-rollback.mjs

import { readFileSync } from 'node:fs';
import { sql, PROJECT_REF } from './lib/sql.mjs';

let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); if (!ok) failed++; };
const migration = readFileSync(new URL('../../supabase/migrations/163_report_context.sql', import.meta.url), 'utf8');

const proof = `
DO $proof$
DECLARE r jsonb; a uuid; b uuid; c uuid; rq uuid; rid1 uuid; rid2 uuid; bad_refused boolean := false;
        cols int; after_c record; after_r record;
BEGIN
  SELECT count(*) INTO cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='user_reports' AND column_name IN ('context','campaign_id','collab_request_id');
  SELECT id INTO a FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO b FROM public.profiles WHERE id <> a ORDER BY created_at LIMIT 1;
  SELECT id INTO c FROM public.campaigns LIMIT 1;
  SELECT id INTO rq FROM public.collab_requests LIMIT 1;

  BEGIN
    INSERT INTO public.user_reports (reporter_id, reported_id, reason, context) VALUES (a, b, 'spam', 'nonsense');
  EXCEPTION WHEN check_violation THEN bad_refused := true; END;

  INSERT INTO public.user_reports (reporter_id, reported_id, reason, context, campaign_id) VALUES (a, b, 'spam', 'campaign', c) RETURNING id INTO rid1;
  INSERT INTO public.user_reports (reporter_id, reported_id, reason, context, collab_request_id) VALUES (a, b, 'scam', 'request', rq) RETURNING id INTO rid2;
  DELETE FROM public.campaigns WHERE id = c;
  DELETE FROM public.collab_requests WHERE id = rq;
  SELECT count(*) AS n, max(campaign_id::text) AS cid INTO after_c FROM public.user_reports WHERE id = rid1;
  SELECT count(*) AS n, max(collab_request_id::text) AS rid INTO after_r FROM public.user_reports WHERE id = rid2;

  r := jsonb_build_object('columns', cols, 'bad_context_refused', bad_refused,
       'had_campaign', c IS NOT NULL, 'had_request', rq IS NOT NULL,
       'report_survives_campaign_delete', after_c.n = 1 AND after_c.cid IS NULL,
       'report_survives_request_delete', after_r.n = 1 AND after_r.rid IS NULL);
  RAISE EXCEPTION 'PROOF:%', r::text;
END
$proof$;`;

let result;
try { await sql(`BEGIN;\n${migration}\n${proof}\nROLLBACK;`); console.log('unexpected: did not abort'); process.exit(2); }
catch (e) {
  const m = String(e.message).match(/PROOF:(\{.*?\})(?:\\n|\n|\s)*CONTEXT/s);
  if (!m) { console.log('proof failed to run:\n' + String(e.message).slice(0, 1000)); process.exit(2); }
  result = JSON.parse(m[1].replace(/\\"/g, '"'));
}
console.log(`project ${PROJECT_REF}\n${JSON.stringify(result)}\n`);
check('three new columns exist', result.columns === 3);
check('an unknown context value is refused by the CHECK', result.bad_context_refused);
check('there was a campaign and a request to test with', result.had_campaign && result.had_request);
check('deleting the campaign keeps the report (campaign_id becomes NULL)', result.report_survives_campaign_delete);
check('deleting the request keeps the report (collab_request_id becomes NULL)', result.report_survives_request_delete);
console.log(failed ? `\n${failed} FAILED` : '\nAll proofs passed — nothing was persisted.');
process.exit(failed ? 1 : 0);

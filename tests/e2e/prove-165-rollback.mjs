// Prove migration 165 WITHOUT applying it (transaction that always aborts).
//   Before: a request insert and a status change each write a notification from the
//           database (the duplicates). After: they write none, from any path.
//   The probe function reports true after, false before.
// Usage: node --env-file=apps/web/.env.local tests/e2e/prove-165-rollback.mjs

import { readFileSync } from 'node:fs';
import { sql, PROJECT_REF } from './lib/sql.mjs';

let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); if (!ok) failed++; };
const migration = readFileSync(new URL('../../supabase/migrations/165_single_source_collab_notifications.sql', import.meta.url), 'utf8');

// Two-phase proof: measure the duplicate BEFORE, apply the migration, measure AFTER.
const phase = (label, withMigration) => `
DO $p$
DECLARE a uuid; b uuid; c uuid; rid uuid; ins_gain int; upd_gain int; probe boolean; r jsonb;
        n_recip int; n_sender int;
BEGIN
  SELECT id INTO a FROM public.profiles WHERE role = 'business_owner' ORDER BY created_at LIMIT 1;
  SELECT id INTO b FROM public.profiles WHERE role = 'influencer' ORDER BY created_at LIMIT 1;

  SELECT count(*) INTO n_recip FROM public.notifications WHERE user_id = b;
  INSERT INTO public.collab_requests (from_user_id, to_user_id, message) VALUES (a, b, 'proof ${label}') RETURNING id INTO rid;
  SELECT count(*) - n_recip INTO ins_gain FROM public.notifications WHERE user_id = b;

  SELECT count(*) INTO n_sender FROM public.notifications WHERE user_id = a;
  UPDATE public.collab_requests SET status = 'accepted' WHERE id = rid;
  SELECT count(*) - n_sender INTO upd_gain FROM public.notifications WHERE user_id = a;

  ${withMigration ? 'probe := public.collab_notifications_single_source();' : 'probe := NULL;'}
  r := jsonb_build_object('insert_gain', ins_gain, 'update_gain', upd_gain, 'probe', probe);
  RAISE EXCEPTION 'PROOF:%', r::text;
END
$p$;`;

async function run(body) {
  try { await sql(`BEGIN;\n${body}\nROLLBACK;`); return { error: 'did not abort' }; }
  catch (e) {
    const m = String(e.message).match(/PROOF:(\{.*?\})(?:\\n|\n|\s)*CONTEXT/s);
    if (!m) return { error: String(e.message).slice(0, 900) };
    return JSON.parse(m[1].replace(/\\"/g, '"'));
  }
}

const before = await run(phase('before', false));
const after = await run(`${migration}\n${phase('after', true)}`);
console.log(`project ${PROJECT_REF}\nbefore: ${JSON.stringify(before)}\nafter:  ${JSON.stringify(after)}\n`);
if (before.error || after.error) { console.log('proof failed to run'); process.exit(2); }
check('BEFORE: the database writes its own notification on a request insert (the duplicate)', before.insert_gain >= 1, `+${before.insert_gain}`);
check('BEFORE: and on an accept, to the sender', before.update_gain >= 1, `+${before.update_gain}`);
check('AFTER: a request insert writes no notification from the database', after.insert_gain === 0, `+${after.insert_gain}`);
check('AFTER: an accept writes none either', after.update_gain === 0, `+${after.update_gain}`);
check('AFTER: the health probe reports true', after.probe === true);
console.log(failed ? `\n${failed} FAILED` : '\nAll proofs passed — nothing was persisted.');
process.exit(failed ? 1 : 0);

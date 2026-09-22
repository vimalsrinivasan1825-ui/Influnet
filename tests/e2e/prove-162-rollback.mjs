// Prove migration 162 WITHOUT applying it (same technique as prove-161-rollback):
// the migration and every check run in one transaction that always aborts, and
// the result comes back inside a RAISE EXCEPTION.
//
//   1. record_signup_consent() writes one row for the caller, with SERVER time.
//   2. It is write-once: a second call (even with another version) changes nothing.
//   3. A NULL/blank version is refused and writes nothing (this is also what the
//      zero-argument admin health probe hits).
//   4. Without a session it refuses.
//   5. A signed-in user cannot read, insert, update or delete signup_consents
//      directly; only the function can write.
//   6. Deleting the auth user removes the row (ON DELETE CASCADE).
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/prove-162-rollback.mjs

import { readFileSync } from 'node:fs';
import { sql, PROJECT_REF } from './lib/sql.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };

const migration = readFileSync(new URL('../../supabase/migrations/162_signup_consent.sql', import.meta.url), 'utf8');

const proof = `
DO $proof$
DECLARE
  r jsonb := '{}'::jsonb;
  u uuid; t0 timestamptz := clock_timestamp();
  n_after_first int; v_after_first text; ts1 timestamptz; ts2 timestamptz; v2 text; n2 int;
  null_refused boolean := false; blank_refused boolean := false; anon_refused boolean := false;
  direct_select boolean := false; direct_insert boolean := false; direct_update boolean := false;
  n_left int;
BEGIN
  SELECT id INTO u FROM auth.users ORDER BY created_at LIMIT 1;
  DELETE FROM public.signup_consents WHERE user_id = u;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  PERFORM public.record_signup_consent('v1', 'ios');
  RESET ROLE;
  SELECT count(*), max(terms_version), max(terms_accepted_at) INTO n_after_first, v_after_first, ts1
    FROM public.signup_consents WHERE user_id = u;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  PERFORM public.record_signup_consent('v2-should-not-win', 'web');
  BEGIN PERFORM public.record_signup_consent(NULL, 'web'); EXCEPTION WHEN OTHERS THEN null_refused := (SQLERRM = 'terms_version_required'); END;
  BEGIN PERFORM public.record_signup_consent('   ', 'web'); EXCEPTION WHEN OTHERS THEN blank_refused := (SQLERRM = 'terms_version_required'); END;
  BEGIN PERFORM count(*) FROM public.signup_consents; EXCEPTION WHEN insufficient_privilege THEN direct_select := true; END;
  BEGIN INSERT INTO public.signup_consents (user_id, terms_version) VALUES (u, 'x'); EXCEPTION WHEN insufficient_privilege THEN direct_insert := true; END;
  BEGIN UPDATE public.signup_consents SET terms_version = 'forged'; EXCEPTION WHEN insufficient_privilege THEN direct_update := true; END;
  RESET ROLE;

  SELECT terms_version, terms_accepted_at INTO v2, ts2 FROM public.signup_consents WHERE user_id = u;
  SELECT count(*) INTO n2 FROM public.signup_consents WHERE user_id = u;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN PERFORM public.record_signup_consent('v1', 'web'); EXCEPTION WHEN OTHERS THEN anon_refused := (SQLERRM = 'not_authenticated'); END;
  RESET ROLE;

  DELETE FROM auth.users WHERE id = u;
  SELECT count(*) INTO n_left FROM public.signup_consents WHERE user_id = u;

  r := jsonb_build_object(
    'written', n_after_first = 1 AND v_after_first = 'v1',
    'server_time', ts1 >= t0 - interval '1 minute' AND ts1 <= now() + interval '1 minute',
    'write_once', v2 = 'v1' AND ts2 = ts1 AND n2 = 1,
    'null_refused', null_refused, 'blank_refused', blank_refused, 'no_session_refused', anon_refused,
    'direct_select_denied', direct_select, 'direct_insert_denied', direct_insert, 'direct_update_denied', direct_update,
    'cascade', n_left = 0);
  RAISE EXCEPTION 'PROOF:%', r::text;
END
$proof$;`;

let result;
try {
  await sql(`BEGIN;\n${migration}\n${proof}\nROLLBACK;`);
  console.log('unexpected: the proof did not abort'); process.exit(2);
} catch (e) {
  const m = String(e.message).match(/PROOF:(\{.*?\})(?:\\n|\n|\s)*CONTEXT/s);
  if (!m) { console.log('proof failed to run:\n' + String(e.message).slice(0, 1200)); process.exit(2); }
  result = JSON.parse(m[1].replace(/\\"/g, '"'));
}
console.log(`project ${PROJECT_REF}\n${JSON.stringify(result)}\n`);
check('record_signup_consent writes one row for the caller', result.written);
check('the timestamp is server time', result.server_time);
check('write-once: a second call changes nothing', result.write_once);
check('a NULL version is refused', result.null_refused);
check('a blank version is refused', result.blank_refused);
check('no session → refused', result.no_session_refused);
check('a signed-in user cannot read the table directly', result.direct_select_denied);
check('a signed-in user cannot insert directly', result.direct_insert_denied);
check('a signed-in user cannot update directly', result.direct_update_denied);
check('deleting the auth user removes the row', result.cascade);
console.log(failed ? `\n${failed} FAILED` : '\nAll proofs passed — nothing was persisted (transaction aborted).');
process.exit(failed ? 1 : 0);

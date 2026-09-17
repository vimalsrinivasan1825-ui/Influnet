// Verify migration 151 on whichever project .env points at — without changing it.
//
// Every check runs inside BEGIN … ROLLBACK through the Management API, so the
// temporary UPDATE grant it needs to isolate the trigger never persists.
// (Confirmed the API honours ROLLBACK before this was written.)
//
//   1. guard_profile_privileges() runs as SECURITY INVOKER.
//   2. A user session cannot change its own role or is_super_admin, even when
//      a column grant would allow it — the trigger alone refuses.
//   3. An ordinary own-profile update still passes the trigger.
//   4. A 3-argument provision_admin() call resolves (no 42725 "not unique").
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-151.mjs
//        (point NEXT_PUBLIC_SUPABASE_URL at staging to check staging)

import { sql, PROJECT_REF } from './lib/sql.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

async function inRollback(body) {
  try {
    return { rows: await sql(`BEGIN; ${body} ROLLBACK;`), error: null };
  } catch (e) {
    return { rows: null, error: String(e.message) };
  }
}

console.log(`project ${PROJECT_REF}\n`);

const [fn] = await sql(
  "select prosecdef from pg_proc where proname = 'guard_profile_privileges'",
);
check('guard_profile_privileges is SECURITY INVOKER', fn && fn.prosecdef === false);

const [victim] = await sql(
  "select id from public.profiles where role = 'influencer' order by created_at limit 1",
);
if (!victim) {
  console.log('No influencer profile to test against; skipping trigger checks.');
} else {
  const asUser = (update) => `
    GRANT UPDATE (role, is_super_admin, name) ON public.profiles TO authenticated;
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims', '{"sub":"${victim.id}","role":"authenticated"}', true);
    UPDATE public.profiles SET ${update} WHERE id = '${victim.id}';
    RESET ROLE;
    SELECT role FROM public.profiles WHERE id = '${victim.id}';`;

  const role = await inRollback(asUser("role = 'admin'"));
  check('user session cannot self-promote to admin', /role cannot be changed/.test(role.error ?? ''), role.error ? '' : `got ${JSON.stringify(role.rows)}`);

  const superFlag = await inRollback(asUser('is_super_admin = true'));
  check('user session cannot set is_super_admin', /role cannot be changed/.test(superFlag.error ?? ''));

  const benign = await inRollback(asUser('name = name'));
  check('ordinary own-profile update still passes', !benign.error, benign.error ?? '');
}

const call = await inRollback(
  "SELECT public.provision_admin('00000000-0000-0000-0000-000000000000'::uuid, 'x@x.test', 'x');",
);
check('3-arg provision_admin call resolves', /does not exist/.test(call.error ?? '') && !/not unique/.test(call.error ?? ''), call.error?.slice(0, 90));

const grants = await sql(
  "select count(*)::int n from information_schema.column_privileges where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE' and column_name in ('role','is_super_admin')",
);
check('no lasting UPDATE grant on role / is_super_admin', grants[0].n === 0);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

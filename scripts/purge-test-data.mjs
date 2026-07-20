#!/usr/bin/env node
/**
 * Remove seeded test accounts and everything that hangs off them.
 *
 * Targets ONLY accounts matching the generator's patterns:
 *   testbrand_<digits>@influnet.com
 *   testcreator_<digits>@influnet.com     (created by apps/web/tests/matchmaking.js)
 *   *@influnet-e2e.com                    (the HikerAPI verification run)
 *
 * Everything else is left alone. Real accounts are never matched by these
 * patterns, and the script refuses to run if any test row turns out to share a
 * collaboration or project with a real user.
 *
 * ── Safety ───────────────────────────────────────────────────────────────
 *   • Dry run by default. Nothing is deleted without --confirm.
 *   • Writes a JSON backup of every row it is about to remove BEFORE removing
 *     it, so a mistake is recoverable.
 *   • Deletes the auth user; profiles/requests/projects/messages follow via
 *     ON DELETE CASCADE. Orphaned conversations are swept afterwards.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   node --env-file=apps/web/.env.local scripts/purge-test-data.mjs
 *   node --env-file=apps/web/.env.local scripts/purge-test-data.mjs --confirm
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const CONFIRM = process.argv.includes('--confirm');
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  console.error('  Try: node --env-file=apps/web/.env.local scripts/purge-test-data.mjs');
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const isSeeded = (e = '') => /^test(brand|creator)_\d+@influnet\.com$/i.test(e);
const isE2E = (e = '') => /@influnet-e2e\.com$/i.test(e);
const isTest = (e = '') => isSeeded(e) || isE2E(e);

const { data: profiles, error: profErr } = await sb
  .from('profiles')
  .select('id,email,name,role,created_at')
  .order('created_at');
if (profErr) {
  console.error('✗ could not read profiles:', profErr.message);
  process.exit(1);
}

const doomed = profiles.filter((p) => isTest(p.email));
const keep = profiles.filter((p) => !isTest(p.email));
const doomedIds = new Set(doomed.map((p) => p.id));
const keepIds = new Set(keep.map((p) => p.id));

if (doomed.length === 0) {
  console.log('Nothing to do — no test accounts found.');
  process.exit(0);
}

const [{ data: reqs }, { data: projs }, { data: parts }] = await Promise.all([
  sb.from('collab_requests').select('id,from_user_id,to_user_id,message,status,budget'),
  sb.from('campaign_projects').select('id,title,status,owner_user_id,counterparty_user_id,budget'),
  sb.from('conversation_participants').select('conversation_id,user_id'),
]);

const touches = (ids, ...userIds) => userIds.some((u) => ids.has(u));
const doomedReqs = (reqs || []).filter((r) => touches(doomedIds, r.from_user_id, r.to_user_id));
const doomedProjs = (projs || []).filter((p) => touches(doomedIds, p.owner_user_id, p.counterparty_user_id));
const doomedConvIds = [...new Set((parts || []).filter((p) => doomedIds.has(p.user_id)).map((p) => p.conversation_id))];

// Refuse to proceed if a test row is entangled with a real account — deleting
// it would take real history with it.
const mixedReqs = doomedReqs.filter((r) => touches(keepIds, r.from_user_id, r.to_user_id));
const mixedProjs = doomedProjs.filter((p) => touches(keepIds, p.owner_user_id, p.counterparty_user_id));

console.log('\n════ WILL REMOVE ════');
console.log(`  accounts        ${doomed.length}`);
console.log(`  collab requests ${doomedReqs.length}`);
console.log(`  projects        ${doomedProjs.length}`);
console.log(`  conversations   ${doomedConvIds.length}`);
console.log('\n════ WILL KEEP ════');
for (const p of keep) console.log(`  ${p.role.padEnd(15)} ${p.email}`);

if (mixedReqs.length || mixedProjs.length) {
  console.error('\n✗ ABORTING — test data is entangled with real accounts:');
  for (const r of mixedReqs) console.error(`    request ${r.id} "${(r.message || '').split('\n')[0]}"`);
  for (const p of mixedProjs) console.error(`    project #${p.id} "${p.title}"`);
  console.error('  Resolve these by hand; the script will not guess.');
  process.exit(1);
}
console.log('\n  ✓ clean split — no test row shares a request or project with a real account.');

if (!CONFIRM) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --confirm to apply.\n');
  process.exit(0);
}

// Backup first. Deleting is irreversible; this is the only way back.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `test-data-backup-${stamp}.json`;
writeFileSync(
  backup,
  JSON.stringify({ removed_at: stamp, profiles: doomed, collab_requests: doomedReqs, projects: doomedProjs, conversation_ids: doomedConvIds }, null, 2),
);
console.log(`\n• backup written to ${backup}`);

let ok = 0;
let failed = 0;
for (const p of doomed) {
  // Deleting the auth user cascades: profiles → requests / projects / messages.
  const { error } = await sb.auth.admin.deleteUser(p.id);
  if (error) {
    console.error(`  ✗ ${p.email}: ${error.message}`);
    failed++;
  } else {
    ok++;
  }
}
console.log(`• deleted ${ok} accounts${failed ? `, ${failed} failed` : ''}`);

// Conversations have no FK to profiles, so they outlive their participants.
if (doomedConvIds.length) {
  const { error } = await sb.from('conversations').delete().in('id', doomedConvIds);
  console.log(error ? `  ✗ conversations: ${error.message}` : `• deleted ${doomedConvIds.length} conversations`);
}

const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
console.log(`\n✓ done — ${count} accounts remain.\n`);

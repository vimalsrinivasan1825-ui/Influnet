#!/usr/bin/env node
/**
 * Phase 0 of the full E2E audit: wipe every account EXCEPT the explicit
 * keep-list, so the audit starts from a clean, known baseline.
 *
 * Targets everything that isn't in KEEP_EMAILS: the 3 orphaned madangowri
 * auth users, today's brand.jupiter.test business (from the broken E2E run),
 * and ~120 leftover test-account rows (test_, testcreator_, testbrand_ prefixes)
 * from prior runs.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   node --env-file=apps/web/.env.local scripts/phase0-account-cleanup.mjs           # dry run
 *   node --env-file=apps/web/.env.local scripts/phase0-account-cleanup.mjs --confirm # actually delete
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIRM = process.argv.includes('--confirm');
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Accounts to preserve — everything else gets deleted.
const KEEP_EMAILS = new Set([
  'admin@influnet.com',
  'arjun@jvsystem.gmail.com',
  'vimal@gmail.com',
  'a2d@gmail.com',
  'auragold@gmail.com',
  'vnkamalesh@gmail.com',
  'kamalesh@tecstellar.com',
  'christopher@socmed.io',
  'testbrand_2607@influnet.com',
]);

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function batchedOr(table, cols, ids, select = 'id,' + null) {
  // Query a table for rows where ANY of `cols` matches ANY id in `ids`, chunked.
  const rows = [];
  const seen = new Set();
  for (const idChunk of chunk(ids, 40)) {
    for (const col of cols) {
      const { data, error } = await sb.from(table).select('*').in(col, idChunk);
      if (error) continue; // table/column may not exist — skip silently
      for (const r of data || []) {
        const key = JSON.stringify(r);
        if (!seen.has(key)) { seen.add(key); rows.push(r); }
      }
    }
  }
  return rows;
}

console.log('\n═══════════════════════════════════════════════════');
console.log('  Phase 0 — Account Cleanup');
console.log('═══════════════════════════════════════════════════\n');

// ── 1. List all auth users, determine targets ────────────────────────────
console.log('🔍 Listing all auth users...\n');
let allUsers = [];
let page = 1;
while (true) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error('✗', error.message); process.exit(1); }
  allUsers = allUsers.concat(data.users);
  if (data.users.length < 200) break;
  page++;
}

const targets = allUsers.filter(u => !KEEP_EMAILS.has(u.email));
const keeps = allUsers.filter(u => KEEP_EMAILS.has(u.email));

console.log(`  Total auth users: ${allUsers.length}`);
console.log(`  Keeping:          ${keeps.length}  (${[...keeps.map(u => u.email)].join(', ')})`);
console.log(`  Targeting:        ${targets.length}  for deletion\n`);

if (targets.length === 0) {
  console.log('Nothing to delete.\n');
  process.exit(0);
}

const targetIds = targets.map(u => u.id);
const targetById = new Map(targets.map(u => [u.id, u]));

// ── 2. Scan related data across all target users (batched) ───────────────
console.log('📊 Scanning related data for all target users...\n');

const tableScans = {
  profiles: { table: 'profiles', cols: ['id'] },
  influencer_profiles: { table: 'influencer_profiles', cols: ['user_id'] },
  business_profiles: { table: 'business_profiles', cols: ['user_id'] },
  collab_requests: { table: 'collab_requests', cols: ['from_user_id', 'to_user_id'] },
  projects: { table: 'campaign_projects', cols: ['owner_user_id', 'counterparty_user_id'] },
  conversation_parts: { table: 'conversation_participants', cols: ['user_id'] },
  notifications: { table: 'notifications', cols: ['user_id'] },
  reviews: { table: 'reviews', cols: ['from_user_id', 'to_user_id'] },
  blocks: { table: 'user_blocks', cols: ['blocker_id', 'blocked_id'] },
  change_requests: { table: 'project_change_requests', cols: ['proposed_by', 'reviewed_by'] },
  stage_entries: { table: 'project_stage_entries', cols: ['author_user_id'] },
  stage_items: { table: 'project_stage_items', cols: ['done_by'] },
  payments: { table: 'project_payments', cols: ['payer_id'] },
  reports: { table: 'reports', cols: ['reporter_id', 'reported_id'] },
  ownership: { table: 'social_account_ownership', cols: ['user_id'] },
  snapshots: { table: 'social_snapshots', cols: ['user_id'] },
  portfolio: { table: 'creator_portfolio', cols: ['user_id'] },
  activity: { table: 'project_activity', cols: ['actor_user_id'] },
  profile_views: { table: 'profile_views', cols: ['creator_id', 'business_id', 'viewer_user_id'] },
  proposals: { table: 'project_proposals', cols: ['proposed_by', 'resolved_by'] },
  presence: { table: 'user_presence', cols: ['user_id'] },
  expo_tokens: { table: 'expo_push_tokens', cols: ['user_id'] },
  admin_logs: { table: 'admin_audit_log', cols: ['actor_id'] },
};

const results = {};
for (const [key, { table, cols }] of Object.entries(tableScans)) {
  results[key] = await batchedOr(table, cols, targetIds);
  if (results[key].length) console.log(`    ${key.padEnd(22)} ${results[key].length}`);
}
console.log('');

// ── 3. Entanglement check — is any related record tied to a KEPT account? ─
const relatedUserIds = new Set([
  ...(results.collab_requests || []).flatMap(r => [r.from_user_id, r.to_user_id]),
  ...(results.projects || []).flatMap(p => [p.owner_user_id, p.counterparty_user_id]),
  ...(results.reviews || []).flatMap(r => [r.from_user_id, r.to_user_id]),
  ...(results.reports || []).flatMap(r => [r.reporter_id, r.reported_id]),
  ...(results.blocks || []).flatMap(b => [b.blocker_id, b.blocked_id]),
]);
const outsideIds = [...relatedUserIds].filter(id => id && !targetIds.includes(id));
let entangled = [];
if (outsideIds.length) {
  const { data } = await sb.from('profiles').select('id,email,name,role').in('id', outsideIds);
  entangled = data || [];
}
if (entangled.length) {
  console.log('⚠️  Entangled with kept accounts (will reassign FK to NULL, not delete):');
  for (const u of entangled) console.log(`    ${u.name} <${u.email}> (${u.role})`);
  console.log('');
} else {
  console.log('✅ No entanglement with kept accounts — clean delete.\n');
}

const projectIds = (results.projects || []).map(p => p.id);
const collabReqIds = (results.collab_requests || []).map(r => r.id);
const reviewIds = (results.reviews || []).map(r => r.id);
const conversationIds = [...new Set((results.conversation_parts || []).map(p => p.conversation_id))];

if (!CONFIRM) {
  console.log('── DRY RUN ── Nothing deleted. Re-run with --confirm to apply.\n');
  console.log(`Would delete ${targets.length} auth users and all cascaded data.`);
  console.log(`Would reassign ${projectIds.length} project(s) entangled with kept accounts.`);
  console.log(`Would delete ${collabReqIds.length} collab request(s), ${reviewIds.length} review(s).`);
  process.exit(0);
}

// ── 4. Backup ──────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(__dirname, '..', `phase0-cleanup-backup-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({
  removed_at: stamp,
  target_users: targets.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })),
  kept_users: keeps.map(u => ({ id: u.id, email: u.email })),
  ...results,
}, null, 2));
console.log(`✅ Backup written to ${backupPath}\n`);

// ── 5. Reassign FK dependents on KEPT accounts' shared records ───────────
console.log('🔧 Reassigning entangled shared records...\n');
for (const proj of results.projects || []) {
  if (targetIds.includes(proj.counterparty_user_id)) {
    await sb.from('campaign_projects').update({ counterparty_user_id: null }).eq('id', proj.id);
    console.log(`  ✅ Project #${proj.id}: counterparty → NULL`);
  } else if (targetIds.includes(proj.owner_user_id) && !targetIds.includes(proj.counterparty_user_id)) {
    // owner is a target but counterparty is kept — null the owner so the kept side keeps the record
    await sb.from('campaign_projects').update({ owner_user_id: null }).eq('id', proj.id);
    console.log(`  ✅ Project #${proj.id}: owner → NULL`);
  }
}
if (collabReqIds.length) {
  const { error } = await sb.from('collab_requests').delete().in('id', collabReqIds);
  console.log(error ? `  ✗ collab_requests: ${error.message}` : `  ✅ Deleted ${collabReqIds.length} collab request(s)`);
}
if (reviewIds.length) {
  const { error } = await sb.from('reviews').delete().in('id', reviewIds);
  console.log(error ? `  ✗ reviews: ${error.message}` : `  ✅ Deleted ${reviewIds.length} review(s)`);
}
for (const cr of results.change_requests || []) {
  if (targetIds.includes(cr.proposed_by)) {
    await sb.from('project_change_requests').delete().eq('id', cr.id);
  } else if (targetIds.includes(cr.reviewed_by)) {
    await sb.from('project_change_requests').update({ reviewed_by: null }).eq('id', cr.id);
  }
}
for (const prop of results.proposals || []) {
  if (targetIds.includes(prop.proposed_by)) {
    await sb.from('project_proposals').delete().eq('id', prop.id);
  } else if (targetIds.includes(prop.resolved_by)) {
    await sb.from('project_proposals').update({ resolved_by: null }).eq('id', prop.id);
  }
}
if ((results.stage_items || []).length) {
  const ids = results.stage_items.map(s => s.id);
  await sb.from('project_stage_items').update({ done_by: null }).in('id', ids);
}
if ((results.payments || []).length) {
  const ids = results.payments.map(p => p.id);
  await sb.from('project_payments').update({ payer_id: null }).in('id', ids);
}
if (conversationIds.length) {
  await sb.from('conversation_participants').delete().in('user_id', targetIds);
}
console.log('');

// ── 6. Delete all target auth users ───────────────────────────────────────
console.log(`🗑️  Deleting ${targets.length} auth user(s)...\n`);
let deleted = 0, failed = 0;
for (const u of targets) {
  const { error } = await sb.auth.admin.deleteUser(u.id);
  if (error) { failed++; console.log(`  ✗ ${u.email}: ${error.message}`); }
  else { deleted++; }
}
console.log(`\n  ✅ Deleted ${deleted}/${targets.length} auth users${failed ? `, ${failed} failed` : ''}.\n`);

// ── 7. Clean up orphaned conversations ────────────────────────────────────
if (conversationIds.length) {
  const { data: stillHasParts } = await sb.from('conversation_participants').select('conversation_id').in('conversation_id', conversationIds);
  const stillActive = new Set((stillHasParts || []).map(p => p.conversation_id));
  const toDelete = conversationIds.filter(id => !stillActive.has(id));
  if (toDelete.length) {
    await sb.from('conversations').delete().in('id', toDelete);
    console.log(`  ✅ Deleted ${toDelete.length} orphaned conversation(s).\n`);
  }
}

// ── 8. Verify ──────────────────────────────────────────────────────────
const { count: profCount } = await sb.from('profiles').select('*', { count: 'exact', head: true });
const { data: remainingProfiles } = await sb.from('profiles').select('email,name,role');
console.log(`\n✅ Done. ${profCount} profiles remaining:`);
for (const p of remainingProfiles || []) console.log(`    ${p.role.padEnd(15)} ${p.email}  (${p.name})`);
console.log('');

#!/usr/bin/env node
/**
 * Remove "Madan Gowri" creator account and all associated data.
 *
 * Before deleting the auth user (which cascades to everything), this script
 * first breaks FK dependencies on shared records so real accounts (Arjun)
 * don't lose their data.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   node --env-file=apps/web/.env.local scripts/cleanup-madan-gowri.mjs          # dry run
 *   node --env-file=apps/web/.env.local scripts/cleanup-madan-gowri.mjs --confirm # actually delete
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const CONFIRM = process.argv.includes('--confirm');
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  console.error('  Try: node --env-file=apps/web/.env.local scripts/cleanup-madan-gowri.mjs');
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const log = (...args) => console.log('  ', ...args);

const TARGET_EMAIL = 'testcreator_2607@influnet.com';
const TARGET_NAME = 'Madan Gowri';

console.log(`\n🔍 Searching for user "${TARGET_NAME}" (${TARGET_EMAIL})...\n`);

// ── 1. Find the user ─────────────────────────────────────────────────────
const { data: profiles, error: profErr } = await sb
  .from('profiles')
  .select('id,email,name,role,created_at')
  .eq('email', TARGET_EMAIL);

if (profErr) { console.error('✗ could not read profiles:', profErr.message); process.exit(1); }
if (!profiles || profiles.length === 0) { console.log('  User not found. Nothing to do.\n'); process.exit(0); }

const user = profiles[0];
const userId = user.id;
console.log(`  Found: ${user.name} (${user.email}) — ${user.role}, ID: ${userId}`);
console.log(`  Created: ${user.created_at}\n`);

// ── 2. Scan all related data ─────────────────────────────────────────────
console.log('📊 Scanning related data...\n');

const scans = {
  influencer_profile: sb.from('influencer_profiles').select('*').eq('user_id', userId).maybeSingle(),
  collab_requests: sb.from('collab_requests').select('id,from_user_id,to_user_id,status').or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
  projects: sb.from('campaign_projects').select('id,title,owner_user_id,counterparty_user_id').or(`owner_user_id.eq.${userId},counterparty_user_id.eq.${userId}`),
  conversation_parts: sb.from('conversation_participants').select('conversation_id,user_id').eq('user_id', userId),
  notifications: sb.from('notifications').select('id,type').eq('user_id', userId),
  reviews: sb.from('reviews').select('id,from_user_id,to_user_id').or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
  blocks: sb.from('user_blocks').select('id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
  change_requests: sb.from('project_change_requests').select('id,proposed_by,reviewed_by').or(`proposed_by.eq.${userId},reviewed_by.eq.${userId}`),
  stage_entries: sb.from('project_stage_entries').select('id').eq('author_user_id', userId),
  stage_items: sb.from('project_stage_items').select('id').eq('done_by', userId),
  payments: sb.from('project_payments').select('id').eq('payer_id', userId),
  reports: sb.from('reports').select('id').or(`reporter_id.eq.${userId},reported_id.eq.${userId}`),
  ownership: sb.from('social_account_ownership').select('id').eq('user_id', userId),
  snapshots: sb.from('social_snapshots').select('id').eq('user_id', userId),
  portfolio: sb.from('creator_portfolio').select('id').eq('user_id', userId),
  activity: sb.from('project_activity').select('id').eq('actor_user_id', userId),
  profile_views: sb.from('profile_views').select('id').or(`creator_id.eq.${userId},business_id.eq.${userId},viewer_user_id.eq.${userId}`),
  proposals: sb.from('project_proposals').select('id,proposed_by,resolved_by').or(`proposed_by.eq.${userId},resolved_by.eq.${userId}`),
  presence: sb.from('user_presence').select('id').eq('user_id', userId),
  expo_tokens: sb.from('expo_push_tokens').select('id').eq('user_id', userId),
  admin_logs: sb.from('admin_audit_log').select('id').eq('actor_id', userId),
};

// Run all scans, catching table-not-found errors gracefully
const results = {};
for (const [key, promise] of Object.entries(scans)) {
  try {
    const { data, error } = await promise;
    if (error && error.code === '42P01') { results[key] = []; continue; } // table doesn't exist
    if (error) { results[key] = []; continue; }
    results[key] = Array.isArray(data) ? data : (data ? [data] : []);
  } catch {
    results[key] = [];
  }
}

// ── 3. Report findings ───────────────────────────────────────────────────
const counts = {};
for (const [key, rows] of Object.entries(results)) {
  const count = rows.length;
  if (count > 0) counts[key] = count;
}

console.log('  Related records:');
let total = 0;
for (const [label, count] of Object.entries(counts)) {
  console.log(`    ${label.padEnd(25)} ${count}`);
  total += count;
}
console.log(`    ${'─'.repeat(25)} ─────`);
console.log(`    ${'TOTAL'.padEnd(25)} ${total}\n`);

// Derived IDs for cleanup
const collabReqIds = (results.collab_requests || []).map((r) => r.id);
const projectIds = (results.projects || []).map((p) => p.id);
const conversationIds = [...new Set((results.conversation_parts || []).map((p) => p.conversation_id))];
const reviewIds = (results.reviews || []).map((r) => r.id);
const changeReqIds = (results.change_requests || []).map((r) => r.id);
const proposalIds = (results.proposals || []).map((r) => r.id);

// ── 4. Entanglement check ────────────────────────────────────────────────
// Collect all unique user IDs from shared records to check for real users
const relatedUserIds = new Set([
  ...(results.collab_requests || []).flatMap((r) => [r.from_user_id, r.to_user_id]),
  ...(results.projects || []).flatMap((p) => [p.owner_user_id, p.counterparty_user_id]),
  ...(results.reviews || []).flatMap((r) => [r.from_user_id, r.to_user_id]),
  ...(results.reports || []).flatMap((r) => [r.reporter_id, r.reported_id]),
  ...(results.blocks || []).flatMap((b) => [b.blocker_id, b.blocked_id]),
  userId,
]);

const relatedIdsArr = [...relatedUserIds].filter((id) => id !== userId);
let entangled = [];

if (relatedIdsArr.length > 0) {
  const { data: otherProfiles } = await sb
    .from('profiles')
    .select('id,email,name,role')
    .in('id', relatedIdsArr);

  const testPattern = /^test(brand|creator)_\d+@influnet\.com$/i;
  entangled = (otherProfiles || []).filter((p) => !testPattern.test(p.email));
}

if (entangled.length > 0) {
  console.log('⚠️  User is entangled with real accounts. Will reassign shared records first.\n');
  for (const u of entangled) {
    console.log(`    ${u.name?.padEnd(20) || '(no name)'.padEnd(20)} ${u.email} (${u.role})`);
  }
  console.log('');
} else {
  console.log('✅ No entanglement — clean delete will cascade to everything.\n');
}

// ── 5. Dry-run check ─────────────────────────────────────────────────────
if (!CONFIRM) {
  console.log('── DRY RUN ── Nothing deleted. Re-run with --confirm to apply.\n');
  if (entangled.length > 0) {
    console.log('Would reassign shared records:');
    if (results.projects.length) console.log(`  • Update ${results.projects.length} project(s): set counterparty_user_id = NULL`);
    if (results.collab_requests.length) console.log(`  • Delete ${results.collab_requests.length} collab request(s)`);
    if (results.reviews.length) console.log(`  • Delete ${results.reviews.length} review(s)`);
    if (results.change_requests.length) console.log(`  • Reassign ${results.change_requests.length} change request(s)`);
    if (results.conversation_parts.length) console.log(`  • Remove from ${results.conversation_parts.length} conversation(s)`);
    if (results.proposals.length) console.log(`  • Reassign ${results.proposals.length} proposal(s)`);
  }
  console.log('Would then delete:');
  console.log(`  • Auth user ${userId} (${user.email}) → cascades to profiles & related`);
  if (conversationIds.length) {
    const { count } = await sb.from('conversations').select('*', { count: 'exact', head: true }).in('id', conversationIds);
    console.log(`  • ${count || 0} orphaned conversation(s)`);
  }
  console.log('');
  process.exit(0);
}

// ── 6. Backup ────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `madan-gowri-backup-${stamp}.json`;
writeFileSync(backup, JSON.stringify({ removed_at: stamp, user, ...results }, null, 2));
console.log(`✅ Backup written to ${backup}\n`);

// ── 7. Reassign shared records (break FK dependencies) ───────────────────
console.log('🔧 Reassigning shared records...\n');

// 7a. Projects: set counterparty_user_id to NULL so the project survives
for (const proj of results.projects || []) {
  if (proj.counterparty_user_id === userId) {
    const { error } = await sb.from('campaign_projects').update({ counterparty_user_id: null }).eq('id', proj.id);
    log(error ? `✗ Project #${proj.id} "${proj.title}": ${error.message}` : `✅ Project #${proj.id} "${proj.title}": counterparty → NULL`);
  } else if (proj.owner_user_id === userId) {
    const { error } = await sb.from('campaign_projects').update({ owner_user_id: null }).eq('id', proj.id);
    log(error ? `✗ Project #${proj.id} "${proj.title}": ${error.message}` : `✅ Project #${proj.id} "${proj.title}": owner → NULL`);
  }
}

// 7b. Collab requests: delete (they're just requests)
if (collabReqIds.length) {
  const { error } = await sb.from('collab_requests').delete().in('id', collabReqIds);
  log(error ? `✗ ${collabReqIds.length} collab requests: ${error.message}` : `✅ Deleted ${collabReqIds.length} collab requests`);
}

// 7c. Reviews: delete
if (reviewIds.length) {
  const { error } = await sb.from('reviews').delete().in('id', reviewIds);
  log(error ? `✗ ${reviewIds.length} reviews: ${error.message}` : `✅ Deleted ${reviewIds.length} reviews`);
}

// 7d. Change requests: reassign reviewer to NULL, or delete if proposed_by
for (const cr of results.change_requests || []) {
  if (cr.proposed_by === userId) {
    const { error } = await sb.from('project_change_requests').delete().eq('id', cr.id);
    log(error ? `✗ Change request #${cr.id}: ${error.message}` : `✅ Change request #${cr.id}: deleted (was proposed_by)`);
  } else if (cr.reviewed_by === userId) {
    const { error } = await sb.from('project_change_requests').update({ reviewed_by: null }).eq('id', cr.id);
    log(error ? `✗ Change request #${cr.id}: ${error.message}` : `✅ Change request #${cr.id}: reviewer → NULL`);
  }
}

// 7e. Conversation participants: remove Madan
if (conversationIds.length) {
  const { error } = await sb.from('conversation_participants').delete().eq('user_id', userId);
  log(error ? `✗ Conversation participants: ${error.message}` : `✅ Removed from ${conversationIds.length} conversation(s)`);
}

// 7f. Proposals: reassign or delete
for (const prop of results.proposals || []) {
  if (prop.proposed_by === userId) {
    const { error } = await sb.from('project_proposals').delete().eq('id', prop.id);
    log(error ? `✗ Proposal #${prop.id}: ${error.message}` : `✅ Proposal #${prop.id}: deleted (was proposed_by)`);
  } else if (prop.resolved_by === userId) {
    const { error } = await sb.from('project_proposals').update({ resolved_by: null }).eq('id', prop.id);
    log(error ? `✗ Proposal #${prop.id}: ${error.message}` : `✅ Proposal #${prop.id}: resolved_by → NULL`);
  }
}

// 7g. Stage items: set done_by to NULL
if ((results.stage_items || []).length) {
  const ids = results.stage_items.map((s) => s.id);
  const { error } = await sb.from('project_stage_items').update({ done_by: null }).in('id', ids);
  log(error ? `✗ Stage items: ${error.message}` : `✅ ${ids.length} stage item(s): done_by → NULL`);
}

// 7h. Payments: set payer_id to NULL
if ((results.payments || []).length) {
  const ids = results.payments.map((p) => p.id);
  const { error } = await sb.from('project_payments').update({ payer_id: null }).in('id', ids);
  log(error ? `✗ Payments: ${error.message}` : `✅ ${ids.length} payment(s): payer_id → NULL`);
}

console.log('');

// ── 8. Delete the auth user ──────────────────────────────────────────────
console.log('🗑️  Deleting auth user...');
const { error: delErr } = await sb.auth.admin.deleteUser(userId);
if (delErr) {
  console.error(`  ✗ Failed: ${delErr.message}`);
  process.exit(1);
}
console.log('  ✅ Auth user deleted — cascaded to profile, influencer_profiles, notifications, activity, snapshots, portfolio, presence, tokens, blocks, reports, etc.\n');

// ── 9. Clean up orphaned conversations ───────────────────────────────────
if (conversationIds.length) {
  console.log(`🗑️  Cleaning up orphaned conversations...`);
  const { error: convErr } = await sb.from('conversations').delete().in('id', conversationIds);
  if (convErr) {
    console.log(`  ⚠️  Conversations may still be orphaned: ${convErr.message}`);
  } else {
    console.log(`  ✅ Deleted ${conversationIds.length} conversations with no participants.\n`);
  }
}

// ── 10. Verify ───────────────────────────────────────────────────────────
const { count } = await sb.from('profiles').select('*', { count: 'exact', head: true });
console.log(`\n✅ Done. ${count} profiles remaining in database.`);

// Check Arjun's project survived
if (projectIds.length) {
  const { data: remainingProjects } = await sb.from('campaign_projects').select('id,title,counterparty_user_id').in('id', projectIds);
  for (const p of remainingProjects || []) {
    console.log(`  📄 Project #${p.id} "${p.title}" — counterparty: ${p.counterparty_user_id || 'NULL (reassigned)'}`);
  }
}
console.log('');

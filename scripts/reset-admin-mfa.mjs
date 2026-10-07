#!/usr/bin/env node
/**
 * Remove an admin's second factor, so they can enrol a new authenticator.
 *
 * For a lost or replaced phone. The admin's next visit to the console then
 * shows the setup screen (if ADMIN_REQUIRE_MFA is on) or the "set up
 * two-factor" banner (if not).
 *
 * This is deliberately NOT a console button. Anyone who can reset a second
 * factor from inside the console can defeat it with a stolen password; this
 * needs the service-role key, i.e. someone who already holds the database.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   # see what would be removed
 *   node --env-file=apps/web/.env.local scripts/reset-admin-mfa.mjs --email admin@influnet.com
 *
 *   # remove it
 *   node --env-file=apps/web/.env.local scripts/reset-admin-mfa.mjs --email admin@influnet.com --confirm
 *
 * Before resetting, confirm the request really came from that person through a
 * channel other than the one they asked on — a reset request is the classic
 * social-engineering route around 2FA.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL. Writes an
 * `admin_mfa_reset` row to admin_audit_log.
 */

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const email = arg('--email')?.trim().toLowerCase();
const confirm = args.includes('--confirm');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file).');
  process.exit(1);
}
if (!email) {
  console.error('Usage: reset-admin-mfa.mjs --email <admin email> [--confirm]');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(`Project: ${new URL(url).hostname}`);

const { data: profile, error: profErr } = await sb
  .from('profiles')
  .select('id, role, email')
  .ilike('email', email)
  .maybeSingle();
if (profErr || !profile) {
  console.error(`No account found for ${email}.`);
  process.exit(1);
}
if (profile.role !== 'admin') {
  // Only the console requires a second factor; a non-admin with one enrolled
  // set it up themselves and should remove it themselves.
  console.error(`${email} is not an admin (role: ${profile.role}). Nothing to do.`);
  process.exit(1);
}

const { data: list, error: listErr } = await sb.auth.admin.mfa.listFactors({ userId: profile.id });
if (listErr) {
  console.error('Could not list factors:', listErr.message);
  process.exit(1);
}
const factors = list?.factors ?? [];
if (factors.length === 0) {
  console.log(`${email} has no second factor enrolled. Nothing to reset.`);
  process.exit(0);
}

for (const f of factors) {
  console.log(`  ${f.factor_type}  ${f.status.padEnd(10)}  ${f.friendly_name ?? '(unnamed)'}  created ${f.created_at}`);
}

if (!confirm) {
  console.log('\nDry run. Re-run with --confirm to remove these.');
  process.exit(0);
}

for (const f of factors) {
  const { error } = await sb.auth.admin.mfa.deleteFactor({ userId: profile.id, id: f.id });
  if (error) {
    console.error(`Failed to remove ${f.id}: ${error.message}`);
    process.exit(1);
  }
}

await sb.from('admin_audit_log').insert({
  actor_id: null,
  actor_email: 'scripts/reset-admin-mfa.mjs',
  action: 'admin_mfa_reset',
  target_id: profile.id,
  target_type: 'profile',
  metadata: { removed: factors.length },
});

console.log(`\nRemoved ${factors.length} factor(s) for ${email}. They will be asked to set up a new authenticator on their next visit.`);

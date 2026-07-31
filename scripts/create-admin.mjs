#!/usr/bin/env node
/**
 * Provision a platform admin account.
 *
 * This is the ONLY supported way to create an admin. Do not create a normal
 * account and flip its role — migration 070 blocks that from any user session,
 * and doing it by hand in the SQL editor skips the audit-log entry.
 *
 * ── Two modes ────────────────────────────────────────────────────────────
 *   --invite    (default, recommended)
 *       Creates the account with NO password and prints a one-time invite link.
 *       The client clicks it and chooses their own password. The password never
 *       exists anywhere but in their head — not in this terminal, not in your
 *       shell history, not in a screenshot, not in a chat log.
 *
 *   --with-password
 *       Generates a 24-character random password locally and prints it ONCE.
 *       Only use this if the client cannot receive email. You must then deliver
 *       it out-of-band (a password manager share, not chat/email) and have them
 *       change it on first login.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   node --env-file=apps/web/.env.local scripts/create-admin.mjs \
 *     --email admin@influnet.com --name "Platform Admin" --confirm
 *
 *   node --env-file=apps/web/.env.local scripts/create-admin.mjs \
 *     --email admin@influnet.com --with-password --confirm
 *
 *   node --env-file=apps/web/.env.local scripts/create-admin.mjs --list
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in the env.
 * The service-role key is a full-database credential: run this from a trusted
 * machine, never from CI logs or a shared terminal.
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!URL_ || !KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  console.error('  Try: node --env-file=apps/web/.env.local scripts/create-admin.mjs …');
  process.exit(1);
}
if (!KEY.startsWith('eyJ')) {
  console.error('✗ SUPABASE_SERVICE_ROLE_KEY does not look like a JWT.');
  console.error('  You may have used the `sbp_…` personal access token by mistake.');
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// A 24-char alphabet-diverse password. ~142 bits from a CSPRNG — rejection
// sampling keeps the distribution uniform rather than modulo-biased.
function strongPassword(len = 24) {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+';
  const max = 256 - (256 % abc.length);
  let out = '';
  while (out.length < len) {
    for (const b of randomBytes(len * 2)) {
      if (b >= max) continue;
      out += abc[b % abc.length];
      if (out.length === len) break;
    }
  }
  return out;
}

async function listAdmins() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, name, created_at')
    .eq('role', 'admin')
    .order('created_at');
  if (error) throw new Error(error.message);
  if (!data.length) return console.log('No admin accounts exist.');
  console.log(`\n${data.length} admin account(s):\n`);
  for (const a of data) {
    console.log(`  ${a.email.padEnd(34)} ${(a.name || '').padEnd(24)} created ${a.created_at.slice(0, 10)}`);
    console.log(`  ${''.padEnd(34)} id: ${a.id}`);
  }
  console.log();
}

async function main() {
  if (flag('list')) return listAdmins();

  const email = (val('email') || '').trim().toLowerCase();
  const name = val('name') || 'Platform Admin';
  const withPassword = flag('with-password');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('✗ Pass a valid --email.');
    process.exit(1);
  }

  if (!flag('confirm')) {
    console.log('\nAbout to provision a PLATFORM ADMIN — full access to every account and project.\n');
    console.log(`  email : ${email}`);
    console.log(`  name  : ${name}`);
    console.log(`  mode  : ${withPassword ? 'generated password (printed once)' : 'invite link (client sets their own password)'}`);
    console.log(`  target: ${URL_}\n`);
    console.log('Re-run with --confirm to proceed.\n');
    process.exit(0);
  }

  // Reuse the auth user if the email already exists, so re-running is safe.
  let userId = null;
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);

  const password = withPassword ? strongPassword() : undefined;

  if (existing) {
    userId = existing.id;
    console.log(`• auth user already exists (${userId}) — reusing it.`);
    if (withPassword) {
      const { error } = await sb.auth.admin.updateUserById(userId, { password });
      if (error) throw new Error(`password reset failed: ${error.message}`);
      console.log('• password reset to a freshly generated one.');
    }
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(withPassword ? { password } : {}),
      user_metadata: { name, provisioned_as: 'admin' },
    });
    if (error) throw new Error(`could not create auth user: ${error.message}`);
    userId = data.user.id;
    console.log(`• auth user created (${userId}).`);
  }

  // Promote through the guarded RPC so the audit trail is written.
  const { data: result, error: rpcErr } = await sb.rpc('provision_admin', {
    p_user_id: userId,
    p_email: email,
    p_name: name,
  });
  if (rpcErr) {
    throw new Error(
      `provision_admin failed: ${rpcErr.message}\n` +
        '  If this says the function does not exist, apply migration 070_admin_hardening.sql first.',
    );
  }
  console.log(`• profile promoted to admin (previous role: ${result?.previous_role ?? 'none'}).`);

  // Verify rather than trust the write.
  const { data: check } = await sb.from('profiles').select('role').eq('id', userId).single();
  if (check?.role !== 'admin') throw new Error('verification failed — role is not admin after provisioning');
  console.log('• verified: role is admin.');

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('  ADMIN ACCOUNT READY');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Sign-in URL : ${SITE}/login`);
  console.log(`  Email       : ${email}`);
  console.log(`  User ID     : ${userId}`);

  if (withPassword) {
    console.log(`  Password    : ${password}`);
    console.log('\n  ⚠  Shown once and never stored. Put it straight into a password');
    console.log('     manager. Do not paste it into chat, email, or a ticket.');
  } else {
    const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${SITE}/reset-password` },
    });
    if (linkErr) {
      console.log(`\n  ⚠  Could not generate the invite link: ${linkErr.message}`);
      console.log(`     Have the client use "Forgot password" at ${SITE}/login instead.`);
    } else {
      console.log('\n  One-time set-password link (expires — send it promptly):');
      console.log(`  ${link.properties.action_link}`);
      console.log('\n  The client sets their own password. No password exists anywhere');
      console.log('  until they choose one.');
    }
  }

  console.log('\n  Next: enrol MFA at ' + SITE + '/dashboard/settings, then set');
  console.log('  ADMIN_REQUIRE_MFA=true to require it on every admin request.');
  console.log('─────────────────────────────────────────────────────────────\n');
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Provision ready-to-use test accounts on a NON-PRODUCTION database.
 *
 * Why this exists: signup on staging goes through the phone-OTP gate, which
 * calls the `phone-otp` Edge Function. A freshly created Supabase project has
 * no Edge Functions deployed, so that call 503s and nobody can finish signing
 * up — including the QA team that needs accounts before anything else can be
 * tested. This creates the accounts the way the signup flow would have, minus
 * the parts that need a phone.
 *
 * It uses the Admin API (`auth.admin.createUser` with `email_confirm: true`),
 * so the accounts skip email verification AND phone verification and can sign
 * in immediately.
 *
 * ── Safety ───────────────────────────────────────────────────────────────
 * Refuses to run against a database that already has a meaningful number of
 * users, on the assumption that is production and you meant a different
 * target. Override deliberately with --force if you know better.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   node --env-file=apps/web/.env.staging scripts/seed-test-accounts.mjs
 *   node --env-file=apps/web/.env.staging scripts/seed-test-accounts.mjs --password 'Custom@123'
 *   node --env-file=apps/web/.env.staging scripts/seed-test-accounts.mjs --list
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  console.error('  Try: node --env-file=apps/web/.env.staging scripts/seed-test-accounts.mjs');
  process.exit(1);
}
if (!KEY.startsWith('eyJ')) {
  console.error('✗ SUPABASE_SERVICE_ROLE_KEY does not look like a JWT.');
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = val('password') || 'Test@12345';

/**
 * The two accounts. Deliberately filled in past the bare minimum — a creator
 * with no niche, no handle and no pricing cannot be searched for, invited to a
 * collab, or rendered on a public profile, so a "created" account like that
 * still blocks most of what QA needs to test.
 */
const ACCOUNTS = [
  {
    email: 'qa.creator@influnet.io',
    name: 'QA Creator',
    role: 'influencer',
    phone: '+919000000001',
    location: 'Chennai, Tamil Nadu',
    profile: {
      username: 'qacreator',
      bio: 'Test creator account for QA. Lifestyle and tech content.',
      headline: 'Lifestyle & tech creator',
      niche: ['Lifestyle', 'Technology'],
      instagram_handle: 'qacreator',
      youtube_handle: 'qacreator',
      instagram_followers: 25000,
      youtube_subscribers: 8000,
      engagement_rate: 3.4,
      city: 'Chennai',
      state: 'Tamil Nadu',
      languages: ['English', 'Tamil'],
      collab_types: ['Paid promotion', 'Barter'],
      pricing_min: 5000,
      pricing_max: 25000,
      availability_status: 'available',
      // Without these the app keeps routing the account back into onboarding
      // instead of letting it reach the dashboard.
      onboarding_step: 5,
      onboarding_completed: true,
      is_profile_complete: true,
    },
  },
  {
    email: 'qa.business@influnet.io',
    name: 'QA Business Owner',
    role: 'business_owner',
    phone: '+919000000002',
    location: 'Bengaluru, Karnataka',
    profile: {
      username: 'qabusiness',
      company_name: 'QA Test Brand',
      industry: 'Consumer Electronics',
      business_type: 'Private Limited',
      tagline: 'Test brand account for QA',
      company_description: 'Seeded business account used for end-to-end testing.',
      website: 'https://example.com',
      city: 'Bengaluru',
      state: 'Karnataka',
      marketing_budget: '50000-200000',
      preferred_creator_niches: ['Lifestyle', 'Technology'],
      // Businesses are gated behind admin approval before they can send collab
      // requests (enforced server-side in POST /api/collabs). Seeding as
      // pending_review would leave QA unable to test the very flow they need.
      approval_status: 'approved',
    },
  },
];

async function listSeeded() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, name, role, created_at')
    .in('email', ACCOUNTS.map((a) => a.email));
  if (error) throw new Error(error.message);
  if (!data.length) return console.log('No seeded accounts found.');
  console.log(`\n${data.length} seeded account(s):\n`);
  for (const a of data) {
    console.log(`  ${a.email.padEnd(26)} ${a.role.padEnd(15)} ${a.name}`);
    console.log(`  ${''.padEnd(26)} id: ${a.id}`);
  }
  console.log();
}

async function guardTarget() {
  const { count, error } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`could not count profiles: ${error.message}`);
  if (count > 25 && !flag('force')) {
    console.error(`✗ Refusing to seed: this database already has ${count} profiles.`);
    console.error('  That looks like a real environment, not a fresh test one.');
    console.error(`  Target: ${URL_}`);
    console.error('  Re-run with --force if this is genuinely what you want.');
    process.exit(1);
  }
  return count;
}

async function seedOne(acc) {
  // Re-running must not fail on an account that already exists, so reuse the
  // auth user and reset its password rather than erroring out.
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === acc.email);

  let userId;
  if (existing) {
    userId = existing.id;
    const { error } = await sb.auth.admin.updateUserById(userId, { password: PASSWORD });
    if (error) throw new Error(`${acc.email}: password reset failed — ${error.message}`);
    console.log(`• ${acc.email} — auth user existed (${userId}), password reset.`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: acc.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: acc.name, role: acc.role, seeded: true },
    });
    if (error) throw new Error(`${acc.email}: could not create auth user — ${error.message}`);
    userId = data.user.id;
    console.log(`• ${acc.email} — auth user created (${userId}).`);
  }

  // A row may already exist via the auth trigger, so upsert rather than insert.
  // phone_verified is set true because the OTP gate that would normally set it
  // is exactly what this script exists to work around.
  const { error: profErr } = await sb.from('profiles').upsert(
    {
      id: userId,
      email: acc.email,
      name: acc.name,
      role: acc.role,
      phone: acc.phone,
      location: acc.location,
      phone_verified: true,
      phone_verified_at: new Date().toISOString(),
      otp_verified_by: 'seed-script',
    },
    { onConflict: 'id' },
  );
  if (profErr) throw new Error(`${acc.email}: profile upsert failed — ${profErr.message}`);

  const table = acc.role === 'influencer' ? 'influencer_profiles' : 'business_profiles';
  const { error: subErr } = await sb
    .from(table)
    .upsert({ user_id: userId, ...acc.profile }, { onConflict: 'user_id' });
  if (subErr) throw new Error(`${acc.email}: ${table} upsert failed — ${subErr.message}`);

  // Verify rather than trust the writes.
  const { data: check } = await sb
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (check?.role !== acc.role) {
    throw new Error(`${acc.email}: verification failed — role is ${check?.role}, expected ${acc.role}`);
  }
  console.log(`  ↳ ${table} written, role verified as ${acc.role}.`);

  return userId;
}

async function main() {
  if (flag('list')) return listSeeded();

  console.log(`\nTarget: ${URL_}`);
  const count = await guardTarget();
  console.log(`Existing profiles: ${count}\n`);

  for (const acc of ACCOUNTS) await seedOne(acc);

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('  TEST ACCOUNTS READY');
  console.log('─────────────────────────────────────────────────────────────');
  for (const a of ACCOUNTS) {
    console.log(`  ${a.role === 'influencer' ? 'Creator ' : 'Business'} : ${a.email}`);
  }
  console.log(`  Password : ${PASSWORD}`);
  console.log('\n  Email and phone are both pre-confirmed — sign in directly,');
  console.log('  no OTP and no verification email.');
  console.log('  The business is pre-approved so it can send collab requests.');
  console.log('─────────────────────────────────────────────────────────────\n');
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Push notification diagnostics.
 *
 * Answers the two questions you actually have when a push doesn't arrive:
 * "did the device ever register?" and "does Expo accept a send to it?".
 * Without this the only symptom is silence, and silence looks identical
 * whether the token is missing, stale, or the FCM credentials are absent.
 *
 * Usage:
 *   node scripts/check-push-tokens.mjs           # list who has a token
 *   node scripts/check-push-tokens.mjs --send    # also send each one a test push
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../apps/web/.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: profiles, error } = await sb
  .from('profiles')
  .select('id, name, role, expo_push_token')
  .order('name');

if (error) {
  // The most likely cause is migration 079 never having been applied.
  console.error('❌ Could not read profiles.expo_push_token:', error.message);
  process.exit(1);
}

const registered = profiles.filter((p) => p.expo_push_token);

console.log(`\n${registered.length} of ${profiles.length} accounts have a push token registered.\n`);
for (const p of profiles) {
  const mark = p.expo_push_token ? '✅' : '  ';
  const detail = p.expo_push_token ? String(p.expo_push_token) : 'no token — this account cannot receive pushes';
  console.log(`${mark} ${(p.name ?? '(no name)').padEnd(28)} ${(p.role ?? '').padEnd(14)} ${detail}`);
}

if (!registered.length) {
  console.log(
    '\nNo device has registered. Check, in order:\n' +
      '  1. The app is a real build (dev/preview/store) on a PHYSICAL device — Expo Go cannot receive remote pushes on SDK 53+.\n' +
      '  2. apps/mobile/app.json has android.googleServicesFile pointing at a google-services.json.\n' +
      '  3. An FCM V1 service account key is uploaded to EAS (eas credentials).\n' +
      '  4. The app was signed into AFTER installing that build, and notification permission was allowed.\n' +
      "  5. The build's EXPO_PUBLIC_API_BASE_URL points at the same backend this script is reading.\n",
  );
  process.exit(0);
}

if (!process.argv.includes('--send')) {
  console.log('\nRe-run with --send to push a test notification to each registered device.\n');
  process.exit(0);
}

console.log('\nSending a test push to each registered device...\n');
for (const p of registered) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: p.expo_push_token,
      title: 'Influnet test',
      body: 'If you can see this, push notifications are working.',
      sound: 'default',
      channelId: 'default',
      priority: 'high',
    }),
  });

  const json = await res.json().catch(() => null);
  const ticket = json?.data;
  if (ticket?.status === 'ok') {
    console.log(`✅ ${p.name}: accepted by Expo (ticket ${ticket.id})`);
  } else {
    console.log(`❌ ${p.name}: ${ticket?.message ?? res.status} ${JSON.stringify(ticket?.details ?? {})}`);
  }
}
console.log(
  '\nNote: "accepted by Expo" only means Expo queued it. If nothing appears on the\n' +
    'phone, the failure is between Expo and FCM — check the FCM V1 key in EAS.\n',
);

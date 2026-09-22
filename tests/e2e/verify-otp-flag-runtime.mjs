// The phone-OTP gate follows the `feature_flags` row AT RUNTIME (unit acc-otp).
//
// AGENTS.md: NEXT_PUBLIC_* is frozen at build time, so a value that must change
// without a rebuild has to come from an endpoint. The web signup and the mobile
// signup both read GET /api/auth/config, and /api/auth/register reads the same
// row. This flips the row WHILE THE SERVER KEEPS RUNNING and proves all three
// follow, in both directions. It restores the row (or its absence) in `finally`.
//
// Each flip is picked up within the 45 s flag snapshot, so this takes ~1–2 minutes.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-otp-flag-runtime.mjs
// Needs the dev server (web-e2e profile). Test users use @influnet-audit.test.

import { createClient } from '@supabase/supabase-js';
import { Scenario } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const s = new Scenario('verify-otp-flag-runtime', 'Phone-OTP gate follows the feature_flags row at runtime');
const stamp = Date.now().toString(36);

const config = async () => (await (await fetch(`${BASE}/api/auth/config`)).json()).phoneOtpEnabled;
async function until(want, label) {
  for (let i = 0; i < 40; i++) { // up to ~2 min, in 3 s steps
    if ((await config()) === want) return i * 3;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}
async function newUser(k) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({ email: `otp.flag.${k}.${stamp}@influnet-audit.test`, password: 'Passw0rd!otpflag' });
  if (error || !data.session) throw new Error(`signUp ${k}: ${error?.message ?? 'no session'}`);
  return { id: data.user.id, token: data.session.access_token };
}
const register = async (token) => {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'business_owner', name: 'Otp Flag', companyName: `Otp Flag Co ${stamp}`, businessType: 'private_limited',
      industry: 'Beauty & Personal Care', registeredAddress: '12 MG Road, Bengaluru', marketingBudget: '1L-5L',
      phone: '+919800000777', termsAccepted: true, ageConfirmed: true,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

async function main() {
  const before = await sql(`select enabled from feature_flags where key='phone_otp'`);
  const hadRow = before.length === 1;
  const original = hadRow ? before[0].enabled : null;
  const set = (v) => sql(`insert into feature_flags (key, enabled) values ('phone_otp', ${v}) on conflict (key) do update set enabled = excluded.enabled`);
  await sql(`delete from auth.users where email like 'otp.flag.%@influnet-audit.test'`);

  try {
    s.section('Flip ON while the server runs');
    await set(true);
    const onAfter = await until(true);
    s.check('GET /api/auth/config reports the gate ON after the row changes (no rebuild, no restart)', onAfter !== null,
      { severity: 'HIGH', observed: onAfter === null ? 'still off after 2 min' : `followed in ~${onAfter}s` });
    const u1 = await newUser('on');
    const r1 = await register(u1.token);
    s.check('with the gate ON, /api/auth/register refuses an unverified number (403 phone_unverified)',
      r1.status === 403 && r1.body.reason === 'phone_unverified',
      { severity: 'CRITICAL', observed: `${r1.status} ${JSON.stringify(r1.body).slice(0, 160)}`, expected: '403 phone_unverified' });
    s.check('…and no profile was created', (await sql(`select 1 from profiles where id=${lit(u1.id)}`)).length === 0, { severity: 'CRITICAL' });

    s.section('Flip OFF while the server runs');
    await set(false);
    const offAfter = await until(false);
    s.check('GET /api/auth/config reports the gate OFF after the row changes back', offAfter !== null,
      { severity: 'HIGH', observed: offAfter === null ? 'still on after 2 min' : `followed in ~${offAfter}s` });
    const u2 = await newUser('off');
    const r2 = await register(u2.token);
    s.check('with the gate OFF, the same signup goes through (200)', r2.status === 200 && (await sql(`select 1 from profiles where id=${lit(u2.id)}`)).length === 1,
      { severity: 'CRITICAL', observed: `${r2.status} ${JSON.stringify(r2.body).slice(0, 160)}` });
  } finally {
    if (hadRow) await sql(`update feature_flags set enabled = ${original} where key='phone_otp'`);
    else await sql(`delete from feature_flags where key='phone_otp'`);
    await sql(`delete from auth.users where email like 'otp.flag.%@influnet-audit.test'`);
  }
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });

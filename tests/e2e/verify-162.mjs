// Signup consent, through the REAL endpoint (migration 162 + POST /api/auth/register).
//
//   1. No consent, or only half of it, or a non-boolean → refused, nothing written.
//   2. Both accepted → the account is created and a signup_consents row exists
//      with the version, the platform label, and SERVER time (a client-supplied
//      timestamp is ignored).
//   3. Recovery from auth metadata (email confirmation on: signUp returns no
//      session, the first login posts an empty body): consent in metadata is
//      honoured; metadata WITHOUT it is refused.
//   4. A signed-in user cannot read the consent table directly.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-162.mjs
// Needs the dev server (web-e2e profile). Test users use @influnet-audit.test
// and are deleted at the end; NOTIFY_EMAILS_ENABLED must be false.

import { createClient } from '@supabase/supabase-js';
import { Scenario } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const s = new Scenario('verify-162', 'Signup consent — Terms/Privacy + 18+ are enforced server-side');
const stamp = Date.now().toString(36);
const MAIL = (k) => `consent.check.${k}.${stamp}@influnet-audit.test`;

const client = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const biz = (k, extra = {}) => ({
  role: 'business_owner', name: `Consent ${k}`, companyName: `Consent Co ${k} ${stamp}`,
  businessType: 'private_limited', industry: 'Beauty & Personal Care',
  registeredAddress: '12 MG Road, Bengaluru, Karnataka 560001', marketingBudget: '1L-5L',
  businessUsername: `cc${k}${stamp}`.slice(0, 20), ...extra,
});

async function newUser(k, metadata) {
  const c = client();
  const { data, error } = await c.auth.signUp({ email: MAIL(k), password: 'Passw0rd!consent', options: { data: metadata } });
  if (error || !data.session) throw new Error(`signUp ${k}: ${error?.message ?? 'no session (is email confirmation ON?)'}`);
  return { id: data.user.id, token: data.session.access_token };
}
async function register(token, body, headers = {}) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const consentRow = async (id) => (await sql(`select terms_version, source, terms_accepted_at, age_confirmed_at from signup_consents where user_id = ${lit(id)}`))[0] ?? null;
const hasProfile = async (id) => (await sql(`select 1 from profiles where id = ${lit(id)}`)).length === 1;

async function main() {
  await sql(`delete from auth.users where email like 'consent.check.%@influnet-audit.test'`);

  s.section('A — refused without consent (nothing is written)');
  const a = await newUser('a', biz('a'));
  const none = await register(a.token, biz('a'));
  s.check('no consent flags → 422 consent_required naming both',
    none.status === 422 && none.body.reason === 'consent_required' && /Terms and Privacy Policy/.test(none.body.error) && /18 or older/.test(none.body.error),
    { severity: 'CRITICAL', observed: `${none.status} ${JSON.stringify(none.body)}`, expected: '422 consent_required' });
  const termsOnly = await register(a.token, biz('a', { termsAccepted: true }));
  s.check('terms accepted but 18+ not confirmed → 422 that only asks for 18+',
    termsOnly.status === 422 && /18 or older/.test(termsOnly.body.error) && !/Terms/.test(termsOnly.body.error),
    { severity: 'CRITICAL', observed: `${termsOnly.status} ${JSON.stringify(termsOnly.body)}` });
  const ageOnly = await register(a.token, biz('a', { ageConfirmed: true }));
  s.check('18+ confirmed but terms not accepted → 422 that only asks for the Terms',
    ageOnly.status === 422 && /Terms and Privacy Policy/.test(ageOnly.body.error) && !/18/.test(ageOnly.body.error),
    { severity: 'CRITICAL', observed: `${ageOnly.status} ${JSON.stringify(ageOnly.body)}` });
  const str = await register(a.token, biz('a', { termsAccepted: 'true', ageConfirmed: 'true' }));
  s.check('the strings "true" do not count as consent (refused)', str.status === 400 || str.status === 422,
    { severity: 'CRITICAL', observed: `${str.status} ${JSON.stringify(str.body).slice(0, 160)}` });
  s.check('after every refusal: no consent row and no profile', (await consentRow(a.id)) === null && !(await hasProfile(a.id)),
    { severity: 'CRITICAL', observed: { row: await consentRow(a.id), profile: await hasProfile(a.id) } });

  s.section('B — both accepted: the account opens and consent is recorded');
  const before = Date.now();
  const ok = await register(a.token, biz('a', {
    termsAccepted: true, ageConfirmed: true, termsVersion: 'e2e-162',
    termsAcceptedAt: '1999-01-01T00:00:00Z', // a client-supplied time must be ignored
  }), { 'X-Influnet-Client': 'android/9.9.9' });
  s.check('both accepted → 200 and the profile exists', ok.status === 200 && (await hasProfile(a.id)),
    { severity: 'CRITICAL', observed: `${ok.status} ${JSON.stringify(ok.body).slice(0, 200)}` });
  const row = await consentRow(a.id);
  s.check('a signup_consents row exists with the version and platform label',
    row?.terms_version === 'e2e-162' && row?.source === 'android',
    { severity: 'CRITICAL', observed: row, expected: 'version e2e-162, source android' });
  const t = row ? new Date(row.terms_accepted_at).getTime() : 0;
  s.check('the timestamps are SERVER time, not the client-supplied 1999 value',
    Math.abs(t - before) < 120_000 && Math.abs(new Date(row?.age_confirmed_at).getTime() - before) < 120_000,
    { severity: 'CRITICAL', observed: row, expected: 'within 2 minutes of now' });
  const profile = (await sql(`select * from profiles where id = ${lit(a.id)}`))[0] ?? {};
  s.check('consent fields never leak into the profile row',
    !('termsAccepted' in profile) && !JSON.stringify(profile).includes('e2e-162'),
    { severity: 'MEDIUM', observed: Object.keys(profile).filter((k) => /terms|age/i.test(k)) });

  s.section('C — a signed-in user cannot read the consent table directly');
  const direct = await fetch(`${URL_}/rest/v1/signup_consents?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${a.token}` } });
  const directBody = await direct.text();
  s.check('direct PostgREST read is denied (no rows, no data)', !direct.ok || directBody === '[]',
    { severity: 'HIGH', observed: `${direct.status} ${directBody.slice(0, 120)}` });

  s.section('D — recovery from auth metadata (email confirmation on)');
  const b = await newUser('b', biz('b', { termsAccepted: true, ageConfirmed: true, termsVersion: 'e2e-162-meta' }));
  const rb = await register(b.token, {}, { 'X-Influnet-Client': 'ios/1.0.0' });
  s.check('an EMPTY body rebuilds the signup from metadata that carries consent → 200',
    rb.status === 200 && (await hasProfile(b.id)),
    { severity: 'CRITICAL', observed: `${rb.status} ${JSON.stringify(rb.body).slice(0, 200)}` });
  const rowB = await consentRow(b.id);
  s.check('…and the consent row records the metadata version and platform',
    rowB?.terms_version === 'e2e-162-meta' && rowB?.source === 'ios', { severity: 'CRITICAL', observed: rowB });
  const c = await newUser('c', biz('c'));
  const rc = await register(c.token, {});
  s.check('metadata WITHOUT consent is refused on the recovery path too (422, no profile)',
    rc.status === 422 && rc.body.reason === 'consent_required' && !(await hasProfile(c.id)),
    { severity: 'CRITICAL', observed: `${rc.status} ${JSON.stringify(rc.body).slice(0, 200)}` });

  await sql(`delete from auth.users where email like 'consent.check.%@influnet-audit.test'`);
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch(async (e) => { console.error(e); await sql(`delete from auth.users where email like 'consent.check.%@influnet-audit.test'`).catch(() => {}); process.exit(1); });

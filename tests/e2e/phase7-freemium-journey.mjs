/**
 * Phase 7 — the Free → Pro journey, driven through the real UI.
 *
 * Creates a brand-new business account, walks the surfaces a brand actually
 * uses, upgrades it, and walks the same surfaces again — capturing a screenshot
 * at every step so the two states can be compared side by side.
 *
 * ── Why the upgrade is a locally-signed webhook ──────────────────────────
 * Razorpay cannot reach localhost, and the browser's success callback grants
 * nothing by design — the tier only changes when a SIGNED webhook confirms the
 * capture. So this script creates a REAL Razorpay test order through the app's
 * own checkout route, then signs the capture event itself with
 * RAZORPAY_WEBHOOK_SECRET and posts it to the same endpoint Razorpay would.
 * Everything downstream of the signature is the production path, untouched.
 *
 * Run:
 *   node --env-file=apps/web/.env.local tests/e2e/phase7-freemium-journey.mjs
 *
 * Requires a dev server on :3000 with SUBSCRIPTIONS_ENABLED=true.
 * Turn NOTIFY_EMAILS_ENABLED off first — the persona uses @influnet-audit.test,
 * which hard-bounces and damages the Resend domain reputation.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { sql } from './lib/sql.mjs';

const BASE = process.env.JOURNEY_BASE_URL || 'http://localhost:3000';
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const WHSEC = process.env.RAZORPAY_WEBHOOK_SECRET;

const OUT = path.join(process.cwd(), 'tests/e2e/screenshots/freemium');
fs.mkdirSync(OUT, { recursive: true });

/** A creator with audience data, a published rate AND contact in the bio, so
 *  all three locked sections have something behind them. A sparse profile makes
 *  Pro look like it buys nothing. */
const SHOWCASE_CREATOR = process.env.JOURNEY_CREATOR || 'a2d';

const stamp = Date.now().toString(36);
const PERSONA = {
  email: `freemium.report.${stamp}@influnet-audit.test`,
  password: 'Audit@Influnet2026!',
  name: 'Priya Raghavan',
  company: `Lumina Skincare ${stamp.slice(-4)}`,
};

const findings = [];
const pageHeights = {};
const shots = [];
let step = 0;

function note(area, free, pro, verdict) {
  findings.push({ area, free, pro, verdict });
}

async function shot(page, phase, name, caption) {
  step += 1;
  const file = `${String(step).padStart(2, '0')}-${phase}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  shots.push({ file, phase, name, caption });
  console.log(`   📸 ${file}`);
  return file;
}

// ── 1. Account creation ──────────────────────────────────────────────────────
async function createBusinessAccount() {
  console.log('\n① Creating a fresh business account');
  const sb = createClient(SB, ANON);

  const { data: signUp, error: signUpErr } = await sb.auth.signUp({
    email: PERSONA.email,
    password: PERSONA.password,
    options: { data: { role: 'business_owner', name: PERSONA.name } },
  });
  if (signUpErr) throw new Error(`signUp failed: ${signUpErr.message}`);
  if (!signUp.session) {
    throw new Error(
      'signUp returned no session — email confirmation is ON. Turn it off in Supabase Auth settings, or this journey cannot run unattended.',
    );
  }

  // Same endpoint the signup wizard posts to on its final step.
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signUp.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'business_owner',
      name: PERSONA.name,
      companyName: PERSONA.company,
      businessType: 'private_limited',
      industry: 'Beauty & Personal Care',
      website: 'luminaskincare.example.com',
      registeredAddress: '12 MG Road, Bengaluru, Karnataka 560001',
      marketingBudget: '1L-5L',
      businessUsername: `lumina${stamp.slice(-4)}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`register failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);

  console.log(`   ✅ ${PERSONA.email}`);
  console.log(`   ✅ ${PERSONA.company} · user ${signUp.user.id}`);
  return { userId: signUp.user.id, token: signUp.session.access_token };
}

// ── 2. Put the account somewhere interesting ─────────────────────────────────
async function seedForComparison(userId) {
  console.log('\n② Seeding usage so the limits are visible');
  // Verified, so the badge exists for Pro to gild. Gold NEVER creates a
  // verification mark — it only changes the colour of one that is already
  // being shown.
  // Requests parked at the cap so the nudge and the red meter both appear.
  await sql(`
    UPDATE public.profiles
       SET verified_badge = true, verification_status = 'verified'
     WHERE id = '${userId}';
    UPDATE public.billing_settings
       SET free_active_projects = 2, free_requests_per_month = 3;
    INSERT INTO public.plan_usage (user_id, meter, period_start, used)
    VALUES ('${userId}', 'requests_month', date_trunc('month', now())::date, 3)
    ON CONFLICT (user_id, meter, period_start) DO UPDATE SET used = 3;
  `);
  console.log('   ✅ verified, 3/3 requests used, limits 2 projects / 3 requests');
}

// ── 3. UI walk ───────────────────────────────────────────────────────────────
async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', PERSONA.email);
  await page.fill('input[type="password"]', PERSONA.password);
  await page.click('button[type="submit"]');

  // Wait on a DOM signal, not a navigation event. Sign-in hands off to the
  // dashboard through Next's client-side router, which changes the URL without
  // ever firing a `load` — so waitForURL({waitUntil:'load'}) sits there until it
  // times out even though the app arrived perfectly well.
  await page.waitForSelector('text=BUSINESS WORKSPACE', { timeout: 30_000 });
  await page.waitForTimeout(2500);
}

async function walk(page, phase) {
  console.log(`\n${phase === 'free' ? '③' : '⑤'} Walking the product as ${phase.toUpperCase()}`);

  // Billing
  await page.goto(`${BASE}/dashboard/billing`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, phase, 'billing', 'Plan & billing');

  // Home — the account's own verified badge
  await page.goto(`${BASE}/dashboard/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, phase, 'home-badge', 'Dashboard home — the account’s verified badge');

  // NOTE: there is deliberately no "browse by niche" screenshot.
  //
  // The search.browse gate is enforced and provably works (see the API probe —
  // 402 on Free, 200 on Pro), but NOTHING IN THE UI CAN REACH IT. The only two
  // callers of /api/discover are the command palette (`?q=` handle lookup) and
  // the new-request page (`?id=` direct lookup), both of which are free. There
  // is no filter control anywhere in the product.
  //
  // So the gate currently protects a capability the UI does not offer, while
  // the billing page advertises "browse and filter creators" as a Pro benefit.
  // That gap is reported rather than papered over with a staged screenshot.

  // Requests — the nudge lives here, and the account is at its cap
  await page.goto(`${BASE}/dashboard/requests`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, phase, 'requests-nudge', 'Requests — the plan nudge at the cap');

  // A creator's public profile — the depth gate.
  await page.goto(`${BASE}/${SHOWCASE_CREATOR}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await shot(page, phase, 'creator-top', `Creator profile — @${SHOWCASE_CREATOR}, above the fold`);

  // The gated sections sit well below the fold, and on Free they are not
  // rendered at all — so the same scroll offset lands on different content.
  // That IS the comparison: one page simply has less in it.
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(1200);
  await shot(page, phase, 'creator-depth', 'Creator profile — where audience data would be');

  // How much shorter the Free page actually is, measured rather than asserted.
  const height = await page.evaluate(() => document.body.scrollHeight);
  console.log(`   ↕ profile page height: ${height}px`);
  pageHeights[phase] = height;
}

/** What the SERVER actually sends — the assertion that matters most. */
async function probeApi(token, phase) {
  const get = async (p) => {
    const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const ent = await get('/api/billing/entitlements');
  const browse = await get('/api/discover?niche=fashion');
  const profile = await get(`/api/creators/${SHOWCASE_CREATOR}`);
  const d = profile.body?.data ?? {};

  return {
    phase,
    tier: ent.body?.tier,
    limits: ent.body?.limits,
    usage: ent.body?.usage,
    browseStatus: browse.status,
    profileHasAudience: 'audience' in d,
    profileHasContact: 'contact' in d,
    profileHasRate: 'priceLabel' in d,
    lockedSections: d.lockedSections ?? null,
    payloadBytes: JSON.stringify(profile.body).length,
  };
}

// ── 4. Upgrade, the real way ─────────────────────────────────────────────────
async function upgrade(token, userId) {
  console.log('\n④ Upgrading — real Razorpay order + signed webhook');

  const co = await fetch(`${BASE}/api/billing/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const order = await co.json();
  if (!co.ok) throw new Error(`checkout failed (${co.status}): ${JSON.stringify(order)}`);
  console.log(`   ✅ order ${order.orderId} for ₹${order.amount / 100}`);

  const evt = JSON.stringify({
    id: `evt_journey_${stamp}`,
    event: 'payment.captured',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: `pay_journey_${stamp}`,
          order_id: order.orderId,
          amount: order.amount,
          notes: { purpose: 'pro_subscription', user_id: userId },
        },
      },
    },
  });
  const sig = crypto.createHmac('sha256', WHSEC).update(evt).digest('hex');

  // Prove the endpoint is actually verifying before trusting the real one.
  const forged = await fetch(`${BASE}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'deadbeef' },
    body: evt,
  });
  console.log(`   ✅ forged signature rejected: ${forged.status}`);
  if (forged.status !== 401) throw new Error('SECURITY: a forged webhook signature was NOT rejected');

  const real = await fetch(`${BASE}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: evt,
  });
  const rb = await real.json();
  console.log(`   ✅ signed webhook: ${real.status} ${JSON.stringify(rb)}`);
  if (rb.subscription !== 'applied') throw new Error(`upgrade did not apply: ${JSON.stringify(rb)}`);

  return { orderId: order.orderId, amount: order.amount };
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!WHSEC) throw new Error('RAZORPAY_WEBHOOK_SECRET missing — run with --env-file=apps/web/.env.local');

  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`No dev server at ${BASE}. Start it first.`);

  const { userId, token } = await createBusinessAccount();
  await seedForComparison(userId);

  const browser = await chromium.launch({ headless: true, args: ['--window-size=1440,1000'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  try {
    await signIn(page);
    await walk(page, 'free');
    const freeApi = await probeApi(token, 'free');

    const order = await upgrade(token, userId);

    // The plan is cached 60s per instance and only the webhook clears it — which
    // it just did, on this instance. Reload so the client re-reads it.
    await page.reload();
    await page.waitForTimeout(2000);
    await walk(page, 'pro');
    const proApi = await probeApi(token, 'pro');

    // A brand-new context — no cookies, no session. This is the cheapest bypass
    // anyone would try: just log out.
    const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(`${BASE}/${SHOWCASE_CREATOR}`, { waitUntil: 'domcontentloaded' });
    await anonPage.waitForTimeout(3000);
    const anonHtml = await anonPage.content();
    const anonLeak = {
      leaked: /collab@|@[a-z0-9.-]+\.(com|in|io)[^a-z]/i.test(
        (anonHtml.match(/<meta name="description" content="([^"]*)"/) || ['', ''])[1],
      ),
      metaDescription: (anonHtml.match(/<meta name="description" content="([^"]*)"/) || ['', ''])[1].slice(0, 200),
    };
    console.log(`\n⑥ Anonymous page source — contact in meta description: ${anonLeak.leaked ? '❌ LEAKED' : '✅ absent'}`);
    await anonCtx.close();

    // ── findings ────────────────────────────────────────────────────────────
    note('Tier', freeApi.tier, proApi.tier, freeApi.tier === 'free' && proApi.tier === 'pro' ? 'pass' : 'fail');
    note('Browse by niche (no query)', `HTTP ${freeApi.browseStatus}`, `HTTP ${proApi.browseStatus}`,
      freeApi.browseStatus === 402 && proApi.browseStatus === 200 ? 'pass' : 'fail');
    note('Audience data in API response', freeApi.profileHasAudience ? 'present' : 'ABSENT',
      proApi.profileHasAudience ? 'present' : 'ABSENT',
      !freeApi.profileHasAudience && proApi.profileHasAudience ? 'pass' : 'fail');
    note('Contact details in API response', freeApi.profileHasContact ? 'present' : 'ABSENT',
      proApi.profileHasContact ? 'present' : 'ABSENT',
      !freeApi.profileHasContact && proApi.profileHasContact ? 'pass' : 'fail');
    note('Rate card in API response', freeApi.profileHasRate ? 'present' : 'ABSENT',
      proApi.profileHasRate ? 'present' : 'ABSENT',
      !freeApi.profileHasRate && proApi.profileHasRate ? 'pass' : 'fail');
    note('Active project limit', String(freeApi.limits?.activeProjects), String(proApi.limits?.activeProjects ?? 'null (unlimited)'),
      freeApi.limits?.activeProjects !== null && proApi.limits?.activeProjects === null ? 'pass' : 'fail');
    note('Monthly request limit', String(freeApi.limits?.requestsPerMonth), String(proApi.limits?.requestsPerMonth ?? 'null (unlimited)'),
      freeApi.limits?.requestsPerMonth !== null && proApi.limits?.requestsPerMonth === null ? 'pass' : 'fail');
    note('Profile payload size', `${freeApi.payloadBytes} bytes`, `${proApi.payloadBytes} bytes`,
      proApi.payloadBytes > freeApi.payloadBytes ? 'pass' : 'fail');
    // Regression guard for the meta-description leak: the creator's booking
    // email and phone were printed into <meta name="description"> and
    // og:description straight from the raw bio, so the gated `contact` field was
    // readable in view-source by anyone — and indexed by search engines.
    note('Contact details in anonymous page source', anonLeak.leaked ? 'LEAKED' : 'absent',
      'n/a (same page for everyone)', anonLeak.leaked ? 'fail' : 'pass');

    const report = {
      generatedAt: new Date().toISOString(),
      base: BASE,
      persona: { email: PERSONA.email, company: PERSONA.company, userId },
      showcaseCreator: SHOWCASE_CREATOR,
      order,
      pageHeights,
      anonLeak,
      free: freeApi,
      pro: proApi,
      findings,
      screenshots: shots,
    };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

    console.log('\n' + '═'.repeat(62));
    for (const f of findings) {
      console.log(`  ${f.verdict === 'pass' ? '✅' : '❌'} ${f.area.padEnd(34)} ${String(f.free).padEnd(16)} → ${f.pro}`);
    }
    const failed = findings.filter((f) => f.verdict !== 'pass').length;
    console.log('═'.repeat(62));
    console.log(`  ${findings.length - failed}/${findings.length} differences behaved as designed`);
    console.log(`  ${shots.length} screenshots → ${OUT}`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
  }
})();

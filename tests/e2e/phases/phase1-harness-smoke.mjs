#!/usr/bin/env node
// Phase 1 — Harness smoke test.
// Proves the new runner's PASS/FAIL/DB-check machinery works against the real
// app before Phase 2 (creator journey) builds on top of it. Every check here
// is a real assertion, not a placeholder.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phases/phase1-harness-smoke.mjs

import { Runner, assert } from '../lib/harness.mjs';
import { launchBrowser, newPage } from '../lib/browser.mjs';
import { getRow, assertFields } from '../lib/db.mjs';
import { generateReport } from '../lib/report.mjs';
import { BASE_URL, LANDING_URL } from '../lib/config.mjs';

const runner = new Runner('phase1-harness-smoke', 'Phase 1 — Harness Smoke Test');

async function main() {
  const browser = await launchBrowser();
  const page = await newPage(browser);
  runner.watch(page);

  await runner.step('Marketing landing page (apps/landing) loads with hero', page, async () => {
    const res = await page.goto(LANDING_URL, { waitUntil: 'networkidle', timeout: 20000 });
    assert(res.status() < 400, `landing app returned HTTP ${res.status()}`);
    const title = await page.title();
    assert(title.toLowerCase().includes('influnet'), `expected page title to mention "influnet", got "${title}"`);
  });

  await runner.step('apps/web root intentionally redirects anon visitors to /login', page, async () => {
    // Deliberate since the 2026-07-18 refactor: apps/web/src/app/page.tsx
    // unconditionally redirect()s to /login; the actual marketing page moved
    // to apps/landing (checked above). This is NOT a bug — asserting the
    // intended behavior so a future accidental revert gets caught.
    const res = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    assert(page.url().endsWith('/login'), `expected apps/web "/" to redirect to /login, ended up at ${page.url()}`);
    assert(res.status() < 400, `redirected /login landing returned HTTP ${res.status()}`);
  });

  await runner.step('Login page renders sign-in form', page, async () => {
    const res = await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    assert(res.status() < 400, `login page returned HTTP ${res.status()}`);
    const emailInput = page.locator('input[type="email"], input[placeholder*="@"]').first();
    assert(await emailInput.count() > 0, 'no email input found on /login');
    const passwordInput = page.locator('input[type="password"]').first();
    assert(await passwordInput.count() > 0, 'no password input found on /login');
  });

  await runner.step('Signup role-selection page has creator + business links', page, async () => {
    await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle', timeout: 15000 });
    const creatorLink = page.locator('a[href*="/signup/influencer"]');
    const businessLink = page.locator('a[href*="/signup/business"]');
    assert(await creatorLink.count() > 0, 'no link to /signup/influencer on /signup');
    assert(await businessLink.count() > 0, 'no link to /signup/business on /signup');
  });

  await runner.step('Anon access to protected /dashboard/discover redirects to login (auth gate)', page, async () => {
    // The actual "discover calls notFound()" behavior only fires for an
    // authenticated user reaching the page — proxy.ts's auth gate intercepts
    // anonymous requests to any non-public path first. Real 404-when-logged-in
    // check is deferred to Phase 2/3 once a session exists.
    const res = await page.goto(`${BASE_URL}/dashboard/discover`, { waitUntil: 'networkidle', timeout: 15000 });
    // proxy.ts now appends ?next=<path> so login can return the visitor to
    // what they wanted — assert the /login path, not an exact-URL match.
    assert(new URL(page.url()).pathname === '/login', `expected redirect to /login, ended up at ${page.url()}`);
    assert(res.status() < 400, `HTTP ${res.status()}`);
  });

  // REGRESSION GUARD: proxy.ts used to gate on a public-path allowlist and
  // send EVERYTHING else to /login, so a typo'd or nonexistent URL was
  // indistinguishable from a real protected page — masking genuine 404s.
  // Fixed by gating only on the one prefix that's actually protected
  // (/dashboard); see AUDIT_REMEDIATION_2026-07-30.md.
  await runner.step('Anon access to an unknown route gets a real 404, not a login redirect', page, async ({ note }) => {
    const res = await page.goto(`${BASE_URL}/this-route-does-not-exist-e2e-audit`, { waitUntil: 'networkidle', timeout: 15000 });
    const bodyText = await page.locator('body').innerText();
    note(`HTTP ${res.status()}, landed at ${page.url()}, body mentions "not found": ${/not found/i.test(bodyText)}`);
    assert(res.status() === 404, `expected a real 404, got HTTP ${res.status()}`);
    assert(!page.url().endsWith('/login'), `unknown route should NOT redirect to /login, ended up at ${page.url()}`);
    assert(/not found/i.test(bodyText), `expected the redesigned not-found page, got body "${bodyText.slice(0, 150).replace(/\n/g, ' ')}"`);
  });

  await runner.step('Anon access to /dashboard (protected) still redirects to login', page, async () => {
    const res = await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
    assert(page.url().includes('/login'), `expected redirect to /login, ended up at ${page.url()}`);
    assert(res.status() < 400, `HTTP ${res.status()}`);
  });

  await runner.step('DB check: admin profile row exists and has role=admin', null, async () => {
    const row = await getRow('profiles', { email: 'admin@influnet.com' });
    assertFields(row, { role: 'admin', name: (v) => typeof v === 'string' && v.length > 0 }, 'profiles(admin@influnet.com)');
  });

  // Phase 0 left 9 real accounts. Asserting a bare total of 9 made this step
  // order-dependent: phases 2/3 create their own audit accounts, so any re-run
  // of the suite failed here even though nothing was wrong. Count only the
  // non-audit accounts, and require every extra to be a recognisable test one.
  await runner.step('DB check: the 9 real accounts survive Phase 0, and every extra is an audit account', null, async ({ note }) => {
    const { sb } = await import('../lib/db.mjs');
    const { data, error } = await sb.from('profiles').select('email');
    if (error) throw new Error(error.message);
    const emails = (data || []).map((r) => r.email || '');
    const isAudit = (e) => /@influnet-audit(-realistic)?\.(test|com)$/.test(e) || /@test\.influnet\.com$/.test(e);
    const real = emails.filter((e) => !isAudit(e));
    const audit = emails.filter(isAudit);
    note(`${real.length} real accounts, ${audit.length} audit accounts (${audit.join(', ') || 'none'}).`);
    assert(real.length === 9, `expected the 9 real accounts to be intact, found ${real.length}: ${real.join(', ')}`);
  });

  await browser.close();
  runner.finish();
  generateReport();
}

main().catch((err) => {
  console.error('\n❌ Fatal error in phase1-harness-smoke:', err);
  runner.finish();
  generateReport();
  process.exit(1);
});

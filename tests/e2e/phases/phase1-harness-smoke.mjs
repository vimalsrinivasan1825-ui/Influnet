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
    assert(page.url().endsWith('/login'), `expected redirect to /login, ended up at ${page.url()}`);
    assert(res.status() < 400, `HTTP ${res.status()}`);
  });

  await runner.step('Anon access to an unknown route also redirects to login (broad auth-gate matcher)', page, async () => {
    // proxy.ts's matcher covers everything except _next/*, favicon, api/, and
    // image extensions, so even typo'd URLs hit the login gate before Next's
    // own 404 page — worth flagging as a UX note (masks real 404s for anon
    // users) even though it's consistent with the gate's own design.
    const res = await page.goto(`${BASE_URL}/this-route-does-not-exist-e2e-audit`, { waitUntil: 'networkidle', timeout: 15000 });
    assert(page.url().endsWith('/login'), `expected redirect to /login, ended up at ${page.url()}`);
    assert(res.status() < 400, `HTTP ${res.status()}`);
  });

  await runner.step('DB check: admin profile row exists and has role=admin', null, async () => {
    const row = await getRow('profiles', { email: 'admin@influnet.com' });
    assertFields(row, { role: 'admin', name: (v) => typeof v === 'string' && v.length > 0 }, 'profiles(admin@influnet.com)');
  });

  await runner.step('DB check: kept accounts count is exactly 9 (Phase 0 verification)', null, async () => {
    const { sb } = await import('../lib/db.mjs');
    const { count, error } = await sb.from('profiles').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    assert(count === 9, `expected exactly 9 profiles after Phase 0 cleanup, found ${count}`);
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

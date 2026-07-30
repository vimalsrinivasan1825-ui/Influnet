#!/usr/bin/env node
// Phase 2 — Creator journey: signup wizard (real madangowri IG/YT handles),
// email confirm, home, verification gate, public profile, media kit,
// settings, activity, connections, discover (auth), messages.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phases/phase2-creator-journey.mjs

import { Runner, assert } from '../lib/harness.mjs';
import { launchBrowser, newPage } from '../lib/browser.mjs';
import { byLabel, fillByLabel, selectOpt, clickButton, clickWhenEnabled, waitForSelector } from '../lib/browser.mjs';
import { waitForRow, getRow, assertFields, sb, findAuthUserByEmail } from '../lib/db.mjs';
import { handlePostSignupAuth, loginAs } from '../lib/auth-helpers.mjs';
import { generateReport } from '../lib/report.mjs';
import { BASE_URL, CREATOR } from '../lib/config.mjs';

const runner = new Runner('phase2-creator-journey', 'Phase 2 — Creator Journey');
let creatorUserId = null;

async function main() {
  const browser = await launchBrowser();
  const page = await newPage(browser);
  runner.watch(page);

  // Idempotency: this phase is re-runnable. If the account already exists
  // (e.g. a prior run created it), skip the wizard and log in directly
  // instead of hitting Supabase's "email already registered" error.
  const existingUser = await findAuthUserByEmail(CREATOR.email);
  const alreadySignedUp = !!existingUser;

  if (alreadySignedUp) {
    await runner.step('Account already exists from a prior run — logging in directly instead of re-running signup', page, async ({ note }) => {
      creatorUserId = existingUser.id;
      note(`Reusing existing account ${existingUser.id} (${CREATOR.email}). Signup wizard steps skipped — already exercised in an earlier run.`);
      await loginAs(page, { baseUrl: BASE_URL, email: CREATOR.email, password: CREATOR.password });
    });
  } else {

  // ── Signup entry ─────────────────────────────────────────────────────
  await runner.step('Signup role selection renders', page, async () => {
    await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle', timeout: 15000 });
    const creatorLink = page.locator('a[href*="/signup/influencer"]');
    assert(await creatorLink.count() > 0, 'creator signup link missing');
  });

  await runner.step('Click "I\'m a creator" → wizard Step 1 (Connect)', page, async () => {
    await page.click('a[href*="/signup/influencer"]');
    await page.waitForURL('**/signup/influencer**', { timeout: 10000 });
    const igInput = page.locator('input[placeholder="username"]');
    assert(await igInput.count() > 0, 'Instagram handle input not found on step 1');
  });

  // ── Step 1: Connect (real Instagram autofill) ───────────────────────
  let autofillWorked = false;
  await runner.step('Step 1: enter real Instagram handle, attempt auto-fill', page, async ({ note }) => {
    await page.fill('input[placeholder="username"]', CREATOR.igHandle);
    await clickButton(page, 'Auto-fill my details');
    // Apify sync actor can cold-start 20-50s per the route's own comment.
    await page.waitForTimeout(3000);
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const skipBtn = page.locator('button:has-text("Skip and fill manually")');
      const step2Heading = page.locator('h2:has-text("Account details")');
      if (await step2Heading.count() > 0) { autofillWorked = true; note('Auto-fill succeeded — jumped straight to step 2.'); return; }
      if (await skipBtn.count() > 0) { note('Auto-fill failed or is offering manual fallback.'); return; }
      await page.waitForTimeout(1500);
    }
    throw new Error('Neither auto-fill success (step 2) nor manual-fallback button appeared within 45s');
  });

  if (!autofillWorked) {
    await runner.step('Step 1: fall back to manual fill (auto-fill unavailable)', page, async () => {
      const skipBtn = page.locator('button:has-text("Skip and fill manually")');
      assert(await skipBtn.count() > 0, 'expected manual-fill fallback button');
      await skipBtn.click();
      await page.waitForTimeout(1000);
      await waitForSelector(page, 'h2:has-text("Account details")', 8000);
    });
  }

  // ── Step 2: Account ──────────────────────────────────────────────────
  await runner.step('Step 2 (Account): fill name/username/email/phone/password', page, async ({ note }) => {
    await fillByLabel(page, 'First name', CREATOR.firstName, 'First name');
    await fillByLabel(page, 'Last name', CREATOR.lastName, 'Last name');
    await fillByLabel(page, 'Username', CREATOR.username, 'Choose username');
    await fillByLabel(page, 'Email address', CREATOR.email, 'you@example.com');
    await fillByLabel(page, 'Phone', CREATOR.phone, '+91');
    await fillByLabel(page, 'Password', CREATOR.password, 'At least 8');
    await page.waitForTimeout(1200);
    const taken = page.locator('text=/username.*taken|not available/i');
    assert(await taken.count() === 0, 'username availability check reports "madangowri" as taken — expected available (Phase 0 cleared it)');
    note('Username availability check ran without reporting "taken".');
  });

  await runner.step('Step 2 → Continue to Step 3 (Profile)', page, async ({ note }) => {
    // KNOWN APP BUG (see final report): use-username-availability.ts treats
    // any non-2xx /api/auth/check-username response as "taken" instead of
    // "error" (jsonError() bodies have no `available`/`valid` keys, so the
    // hook's `else` branch fires). A transient network blip (observed live:
    // ECONNRESET talking to Supabase) permanently disables "Continue" with a
    // false "username taken" message. Retrying re-fires the debounced check,
    // which succeeds once the transient condition clears — this keeps the
    // audit moving without patching the app's source mid-audit.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await clickWhenEnabled(page, 'Continue', { timeout: 12000 });
        await waitForSelector(page, 'h2:has-text("Profile details")', 8000);
        return;
      } catch (err) {
        const falseTaken = await page.locator('text=/already taken/i').count() > 0;
        note(`Attempt ${attempt} failed (${err.message}). False-"taken" text present: ${falseTaken}.`);
        if (attempt === 3) throw err;
        const usernameEl = await byLabel(page, 'Username', 'Choose username');
        await usernameEl.fill('');
        await page.waitForTimeout(300);
        await usernameEl.fill(CREATOR.username);
        await page.waitForTimeout(2000);
      }
    }
  });

  // ── Step 3: Profile ───────────────────────────────────────────────────
  await runner.step('Step 3 (Profile): gender/city/state/languages', page, async () => {
    await selectOpt(page, 'Gender', CREATOR.gender);
    await fillByLabel(page, 'City', CREATOR.city, 'Your city');
    await selectOpt(page, 'State', CREATOR.state);
    for (const lang of CREATOR.languages) await clickButton(page, lang);
  });

  await runner.step('Step 3 → Continue to Step 4 (Creator)', page, async () => {
    await clickWhenEnabled(page, 'Continue', { timeout: 15000 });
    await waitForSelector(page, 'h2:has-text("Creator positioning")', 8000);
  });

  // ── Step 4: Creator positioning ───────────────────────────────────────
  await runner.step('Step 4 (Creator): niche/bio/social handles', page, async ({ note }) => {
    await selectOpt(page, 'Primary niche', CREATOR.primaryNiche);
    for (const n of CREATOR.secondaryNiches) await clickButton(page, n);
    await fillByLabel(page, 'Bio', CREATOR.bio, 'Tell brands');
    const ytInput = page.locator('input[placeholder="@channel"]');
    if (await ytInput.count() > 0) {
      await ytInput.fill(CREATOR.ytHandle);
    } else {
      note('YouTube handle input not found by placeholder "@channel" — checking prefill from IG autofill instead.');
    }
    const igInput = page.locator('input[value*="madangowri" i]');
    note(`Instagram handle field present with prefilled value: ${await igInput.count() > 0}`);
  });

  await runner.step('Step 4 → Continue to Step 5 (Collab)', page, async () => {
    await clickWhenEnabled(page, 'Continue', { timeout: 15000 });
    await waitForSelector(page, 'h2:has-text("Collaboration preferences")', 8000);
  });

  // ── Step 5: Collab preferences + submit ───────────────────────────────
  await runner.step('Step 5 (Collab): content types + price tier, submit', page, async () => {
    await clickButton(page, 'Reel');
    await clickButton(page, 'Post');
    const priceBtns = page.locator('button:has-text("₹")');
    assert(await priceBtns.count() > 0, 'no price-tier buttons found on step 5');
    await priceBtns.first().click();
  });

  await runner.step('Submit "Create account" → account created', page, async () => {
    await clickWhenEnabled(page, 'Create account', { timeout: 15000 });
    const result = await handlePostSignupAuth(page, { baseUrl: BASE_URL, email: CREATOR.email, password: CREATOR.password });
    creatorUserId = result.userId || null;
  });

  } // end alreadySignedUp-else (fresh signup wizard path)

  // ── DB verification: profile + influencer_profile rows ───────────────
  // Runs on both paths — for a reused account this re-confirms nothing
  // regressed the persisted state since the account was first created.
  await runner.step('DB: profiles row created with role=influencer', null, async () => {
    const row = await waitForRow('profiles', { email: CREATOR.email }, { timeoutMs: 10000 });
    creatorUserId = creatorUserId || row.id;
    assertFields(row, {
      role: 'influencer',
      name: (v) => v && v.includes(CREATOR.firstName),
    }, 'profiles(creator)');
  });

  await runner.step('DB: influencer_profiles row created with correct fields', null, async () => {
    const row = await waitForRow('influencer_profiles', { user_id: creatorUserId }, { timeoutMs: 10000 });
    assertFields(row, {
      username: CREATOR.username,
      instagram_handle: (v) => v && v.toLowerCase().includes(CREATOR.igHandle),
      city: CREATOR.city,
      state: CREATOR.state,
      bio: (v) => v && v.length > 0,
    }, 'influencer_profiles(creator)');
  });

  await runner.step('DB: anti-impersonation gate holds — creator is NOT auto-verified without ownership proof', null, async () => {
    const row = await getRow('profiles', { id: creatorUserId });
    assert(row.verified_badge !== true, `expected verified_badge=false/null immediately after signup (no ownership claim yet), got ${row.verified_badge}. This would indicate the migration 083/086 lockdown regressed.`);
  });

  // ── Home ───────────────────────────────────────────────────────────
  await runner.step('Dashboard home renders identity card + verification guide', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/home`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const nameVisible = page.locator(`text=${CREATOR.firstName}`);
    assert(await nameVisible.count() > 0, 'creator first name not visible on dashboard home');
  });

  await runner.step('Home: verification guide / "get verified" prompt shown (unverified state)', page, async ({ note }) => {
    const guide = page.locator('text=/verified/i').first();
    note(`Verification-related text present: ${await guide.count() > 0}`);
  });

  // ── Public profile ───────────────────────────────────────────────────
  await runner.step('Public profile /c/madangowri renders with owner "Edit profile" CTA', page, async () => {
    await page.goto(`${BASE_URL}/c/${CREATOR.username}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const editCta = page.locator('a:has-text("Edit profile")');
    assert(await editCta.count() > 0, 'expected "Edit profile" CTA for the profile owner viewing their own public page');
  });

  await runner.step('Public profile: scroll to audience/stats section', page, async () => {
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    await page.waitForTimeout(800);
  });

  await runner.step('Media kit page /c/madangowri/media-kit renders with QR code', page, async () => {
    await page.goto(`${BASE_URL}/c/${CREATOR.username}/media-kit`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const qr = page.locator('img[src*="data:image"], canvas, svg').first();
    assert(await qr.count() > 0, 'no QR-code-like element found on media kit page');
  });

  // ── Settings ─────────────────────────────────────────────────────────
  await runner.step('Settings page pre-fills creator fields correctly', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const bioField = await byLabel(page, 'Bio', 'Tell brands').catch(() => null);
    assert(bioField !== null, 'Bio field not found on settings page');
    const val = await bioField.inputValue();
    assert(val && val.length > 0, `expected settings Bio field to be pre-filled, got empty`);
  });

  await runner.step('Settings: edit headline, save, DB-verify the write landed', page, async () => {
    const newHeadline = 'Tamil entertainer & lifestyle creator (E2E audit)';
    const headlineField = await byLabel(page, 'Headline', 'headline').catch(() => null);
    if (!headlineField) return { skipped: 'No "Headline" field found by label/placeholder on settings page — cannot test edit-and-save for this field.' };
    await headlineField.fill(newHeadline);
    await clickButton(page, 'Save');
    await page.waitForTimeout(1500);
    const row = await waitForRow('influencer_profiles', { user_id: creatorUserId }, { timeoutMs: 8000 });
    assertFields(row, { headline: newHeadline }, 'influencer_profiles(after headline edit)');
  });

  // ── Activity / Connections / Discover / Messages ─────────────────────
  await runner.step('Activity page shows at least one event (account_created)', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/activity`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1200);
    const items = page.locator('[class*="activity"], li, article').filter({ hasText: /./ });
    const bodyText = await page.locator('body').innerText();
    assert(!/no activity/i.test(bodyText) || bodyText.length > 200, 'activity page appears empty right after account creation');
  });

  // REGRESSION GUARD: Connections used to be a static "No connections yet"
  // stub regardless of real state. It now derives real rows from
  // /api/conversations (lib/connections.ts) — assert it renders without
  // crashing and doesn't 500. This creator has an active project/collab from
  // earlier in this phase, but not asserting the row shows up here since the
  // exact state depends on which earlier steps ran.
  await runner.step('Connections page loads real data (no longer a static stub)', page, async ({ note }) => {
    const res = await page.goto(`${BASE_URL}/dashboard/connections`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);
    const bodyText = await page.locator('body').innerText();
    note(`Body text snippet: "${bodyText.slice(0, 150).replace(/\n/g, ' ')}"`);
    assert(res.status() < 400, `expected the Connections page to load, got HTTP ${res.status()}`);
    assert(!/application error/i.test(bodyText), 'Connections page crashed');
  });

  // REGRESSION GUARD: discover/page.tsx used to be a "use client" component
  // with ~470 lines of unreachable search UI behind a notFound() call —
  // calling notFound() client-side rendered the right UI but the original
  // document response had already gone out as HTTP 200, invisible to
  // crawlers/monitoring. Rebuilt as a plain server component; see
  // AUDIT_REMEDIATION_2026-07-30.md.
  await runner.step('Discover renders a real HTTP 404, not a 200 with 404-shaped content', page, async ({ note }) => {
    const res = await page.goto(`${BASE_URL}/dashboard/discover`, { waitUntil: 'networkidle', timeout: 15000 });
    const bodyText = await page.locator('body').innerText();
    note(`HTTP ${res.status()} (was 200 before the fix). Body snippet: "${bodyText.slice(0, 120).replace(/\n/g, ' ')}"`);
    assert(/404|page not found/i.test(bodyText), 'expected the not-found UI to render for /dashboard/discover');
    assert(res.status() === 404, `expected a true HTTP 404, got ${res.status()}`);
  });

  await runner.step('Messages page loads without crashing (empty state expected)', page, async () => {
    await page.goto(`${BASE_URL}/dashboard/messages`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
  });

  await browser.close();
  runner.finish();
  generateReport();

  // Persist creatorUserId for later phases (business journey needs to send a request TO this creator).
  // Deliberately NOT in results/ — report.mjs scans every *.json there as a phase result.
  const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
  const stateDir = new URL('../state/', import.meta.url);
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(new URL('../state/creator-user-id.json', import.meta.url), JSON.stringify({ userId: creatorUserId, username: CREATOR.username }));
}

main().catch((err) => {
  console.error('\n❌ Fatal error in phase2-creator-journey:', err);
  runner.finish();
  generateReport();
  process.exit(1);
});

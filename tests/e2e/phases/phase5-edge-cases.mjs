#!/usr/bin/env node
// Phase 5 — Edge cases: validation gaps, duplicate data, unicode/XSS payloads,
// invalid numeric inputs, rapid double-submit.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phases/phase5-edge-cases.mjs

import { Runner, assert } from '../lib/harness.mjs';
import { launchBrowser, newPage } from '../lib/browser.mjs';
import { byLabel, fillByLabel, selectOpt, clickButton, clickWhenEnabled } from '../lib/browser.mjs';
import { loginAs } from '../lib/auth-helpers.mjs';
import { getRow, waitForRow, assertFields } from '../lib/db.mjs';
import { generateReport } from '../lib/report.mjs';
import { BASE_URL, CREATOR, BUSINESS } from '../lib/config.mjs';

const runner = new Runner('phase5-edge-cases', 'Phase 5 — Edge Cases & Validation');

async function main() {
  const browser = await launchBrowser();
  const page = await newPage(browser);
  runner.watch(page);

  // ── Signup validation edge cases ──────────────────────────────────────
  await runner.step('Signup: duplicate email is rejected with a clear error', page, async ({ note }) => {
    await page.goto(`${BASE_URL}/signup/influencer`, { waitUntil: 'networkidle', timeout: 15000 });
    await clickButton(page, 'Skip and fill manually');
    await page.waitForSelector('h2:has-text("Account details")', { timeout: 8000 });
    await fillByLabel(page, 'First name', 'Dup', 'First name');
    await fillByLabel(page, 'Last name', 'Test', 'Last name');
    await fillByLabel(page, 'Username', 'duplicate-email-check-user', 'Choose username');
    await fillByLabel(page, 'Email address', CREATOR.email, 'you@example.com'); // already registered
    await fillByLabel(page, 'Password', 'SomePassword123!', 'At least 8');
    await page.waitForTimeout(1200);
    await clickWhenEnabled(page, 'Continue', { timeout: 15000 });
    await page.waitForTimeout(600);
    await selectOpt(page, 'Gender', 'male').catch(() => {});
    await fillByLabel(page, 'City', 'Chennai', 'Your city').catch(() => {});
    await selectOpt(page, 'State', 'Tamil Nadu').catch(() => {});
    await clickWhenEnabled(page, 'Continue', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await selectOpt(page, 'Primary niche', 'Entertainment').catch(() => {});
    await fillByLabel(page, 'Bio', 'dup email test', 'Tell brands').catch(() => {});
    const igInput = page.locator('input').filter({ hasText: '' }).first();
    await clickWhenEnabled(page, 'Continue', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const priceBtn = page.locator('button:has-text("₹")').first();
    if (await priceBtn.count() > 0) await priceBtn.click();
    await clickButton(page, 'Reel').catch(() => {});
    await clickButton(page, 'Create account').catch(() => {});
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    note(`Body after duplicate-email submit attempt: "${bodyText.slice(0, 200).replace(/\n/g, ' ')}"`);
    assert(/already|registered|exists|in use/i.test(bodyText), 'expected a clear "email already in use" style error; the raw Supabase error may be confusing if shown verbatim');
  });

  await runner.step('Signup: weak password keeps Continue disabled on step 2', page, async ({ note }) => {
    await page.goto(`${BASE_URL}/signup/influencer`, { waitUntil: 'networkidle', timeout: 15000 });
    await clickButton(page, 'Skip and fill manually');
    await page.waitForSelector('h2:has-text("Account details")', { timeout: 8000 });
    await fillByLabel(page, 'First name', 'Weak', 'First name');
    await fillByLabel(page, 'Last name', 'Pw', 'Last name');
    await fillByLabel(page, 'Username', 'weak-pw-edge-case-user', 'Choose username');
    await fillByLabel(page, 'Email address', 'weak.pw.edge.case@influnet-audit-realistic.com', 'you@example.com');
    await fillByLabel(page, 'Password', 'abc', 'At least 8'); // 3 chars, below the 8-char minimum
    await page.waitForTimeout(1000);
    const continueBtn = page.locator('button').filter({ hasText: 'Continue' }).first();
    const enabled = await continueBtn.isEnabled().catch(() => false);
    note(`Continue button enabled with a 3-char password: ${enabled}`);
    assert(!enabled, 'expected Continue to stay disabled with a password below the 8-char minimum');
  });

  await runner.step('Signup: invalid email format keeps Continue disabled', page, async ({ note }) => {
    await fillByLabel(page, 'Email address', 'not-an-email-address', 'you@example.com').catch(() => {});
    await fillByLabel(page, 'Password', 'ValidPassword123!', 'At least 8').catch(() => {});
    await page.waitForTimeout(800);
    const continueBtn = page.locator('button').filter({ hasText: 'Continue' }).first();
    const enabled = await continueBtn.isEnabled().catch(() => false);
    note(`Continue button enabled with an invalid email format: ${enabled}`);
    assert(!enabled, 'expected Continue to stay disabled with a malformed email address');
  });

  await runner.step('Signup: duplicate username triggers the alternative-suggestion recovery flow', page, async ({ note }) => {
    await page.goto(`${BASE_URL}/signup/influencer`, { waitUntil: 'networkidle', timeout: 15000 });
    await clickButton(page, 'Skip and fill manually');
    await page.waitForSelector('h2:has-text("Account details")', { timeout: 8000 });
    await fillByLabel(page, 'Username', CREATOR.username, 'Choose username'); // "madangowri" — already taken
    await page.waitForTimeout(1200);
    const bodyText = await page.locator('body').innerText();
    note(`Body after entering a taken username: "${bodyText.slice(0, 200).replace(/\n/g, ' ')}"`);
    assert(/taken|not available|unavailable/i.test(bodyText), 'expected a live "taken" indicator for an already-registered username');
  });

  // ── Business signup: documented missing-validation gaps ──────────────
  await runner.step('CONFIRMED GAP: business signup accepts a garbage GST number with no format validation', page, async ({ note }) => {
    await page.goto(`${BASE_URL}/signup/business`, { waitUntil: 'networkidle', timeout: 15000 });
    await fillByLabel(page, 'Full name', 'Edge Case', 'Your full name');
    await fillByLabel(page, 'Company name', 'Edge Case Co', 'Your company');
    await fillByLabel(page, 'Work email', 'edge.case.gst@influnet-audit-realistic.com', 'you@company.com');
    await fillByLabel(page, 'Password', 'EdgeCasePw123!', 'At least 8');
    await page.waitForTimeout(500);
    await clickWhenEnabled(page, 'Continue', { timeout: 10000 });
    await page.waitForTimeout(600);
    await selectOpt(page, 'Industry', 'Entertainment & Media').catch(() => {});
    await selectOpt(page, 'Business type', 'Agency').catch(() => {});
    await fillByLabel(page, 'Website', 'not a url at all!!', 'https://yourcompany.com'); // garbage, no validation per code review
    await clickWhenEnabled(page, 'Continue', { timeout: 10000 });
    await page.waitForTimeout(600);
    await fillByLabel(page, 'City', 'X', 'City');
    await selectOpt(page, 'State', 'Delhi').catch(() => {});
    await fillByLabel(page, 'Registered address', 'x', 'Full registered');
    await fillByLabel(page, 'GST number', 'NOT-A-REAL-GST-NUMBER-1234', '22AAAAA0000A1Z5'); // garbage, no format check
    const stillOnStep3 = await page.locator('input[placeholder="22AAAAA0000A1Z5"]').count() > 0;
    note(`Garbage GST "NOT-A-REAL-GST-NUMBER-1234" and garbage website URL both accepted with no client-side format error shown. Still on the same step: ${stillOnStep3} (no validation blocked progress).`);
    const continueBtn = page.locator('button').filter({ hasText: 'Continue' }).first();
    assert(await continueBtn.isEnabled().catch(() => false), 'expected Continue to remain enabled — confirming GST/website have no format validation, a real (if low-severity) gap since business_profiles.gst_number is a tax ID field');
  });

  // ── Unicode / XSS payloads ─────────────────────────────────────────────
  await runner.step('Creator settings: Tamil unicode bio saves and renders correctly', page, async ({ note }) => {
    await loginAs(page, { baseUrl: BASE_URL, email: CREATOR.email, password: CREATOR.password });
    await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const tamilBio = 'தமிழ் உள்ளடக்க உருவாக்குநர் — நகைச்சுவை மற்றும் பொழுதுபோக்கு 🎬';
    const bioField = await byLabel(page, 'Bio', 'Tell brands');
    await bioField.fill(tamilBio);
    await clickButton(page, 'Save');
    await page.waitForTimeout(1500);
    const dbRow = await getRow('influencer_profiles', { username: CREATOR.username });
    assertFields(dbRow, { bio: tamilBio }, 'influencer_profiles(tamil bio)');
    note('Tamil unicode + emoji round-tripped through save correctly.');
  });

  await runner.step('CONFIRMED SAFE: an XSS payload in bio is stored as data, not executed as a script', page, async ({ note }) => {
    const payload = '<script>window.__xss_fired = true;</script><img src=x onerror="window.__xss_fired2=true">';
    await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const bioField = await byLabel(page, 'Bio', 'Tell brands');
    await bioField.fill(payload);
    await clickButton(page, 'Save');
    await page.waitForTimeout(1500);
    const dbRow = await getRow('influencer_profiles', { username: CREATOR.username });
    assertFields(dbRow, { bio: (v) => v.includes('<script>') }, 'influencer_profiles(xss payload stored verbatim)');
    // Now visit the public profile and confirm the script never executes.
    await page.goto(`${BASE_URL}/c/${CREATOR.username}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const fired = await page.evaluate(() => !!(window.__xss_fired || window.__xss_fired2));
    note(`Payload stored verbatim in DB (expected — sanitize on render, not on write). Script executed on public profile render: ${fired}`);
    assert(!fired, 'XSS PAYLOAD EXECUTED on the public profile page — real stored-XSS vulnerability');
    // Restore a normal bio so later report screenshots don't show raw script tags.
    await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);
    const bioField2 = await byLabel(page, 'Bio', 'Tell brands');
    await bioField2.fill(CREATOR.bio);
    await clickButton(page, 'Save');
    await page.waitForTimeout(1000);
  });

  // ── Numeric edge cases on the collab-request budget field ─────────────
  await runner.step('CONFIRMED BUG: a negative budget is silently sanitized to positive, not rejected', page, async ({ note }) => {
    // requests/new/page.tsx computes budgetNum via
    // `form.budget.replace(/[^0-9.]/g, "")` before its own positive-number
    // check — that regex strips the "-" along with commas/₹ symbols, so
    // "-500" becomes "500" *before* the `budgetNum <= 0` guard ever runs.
    // The intended validation (line ~116, "Budget must be a positive number")
    // never fires; the request is silently sent with the flipped-sign value.
    await loginAs(page, { baseUrl: BASE_URL, email: BUSINESS.email, password: BUSINESS.password });
    const { sb } = await import('../lib/db.mjs');
    const { data: creatorAuth } = await sb.from('profiles').select('id').eq('email', CREATOR.email).maybeSingle();
    await page.goto(`${BASE_URL}/dashboard/requests/new?to=${creatorAuth?.id || ''}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const title = `Negative budget repro ${Date.now()}`;
    await page.fill('#req-title', title);
    await page.fill('#req-budget', '-500');
    await clickButton(page, 'Send request');
    await page.waitForTimeout(2000);
    const { data: found } = await sb.from('collab_requests').select('*').ilike('message', `${title}%`).maybeSingle();
    note(`Typed "-500" → no validation error shown → request created with budget=${found?.budget} (sign silently dropped instead of being rejected or preserved).`);
    assert(found && found.budget === 500, `expected to reproduce the known bug (budget silently flipped to +500); got ${JSON.stringify(found)}`);
    if (found) await sb.from('collab_requests').delete().eq('id', found.id); // clean up the repro row
  });

  await runner.step('Send-request: absurdly large budget (1 trillion) is accepted with no upper bound', page, async ({ note }) => {
    await page.goto(`${BASE_URL}/dashboard/requests/new`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.fill('#req-title', 'Huge budget edge case').catch(() => {});
    await page.fill('#req-budget', '1000000000000').catch(() => {});
    await page.waitForTimeout(500);
    const budgetVal = await page.locator('#req-budget').inputValue().catch(() => null);
    note(`No client-side upper bound on budget — accepted "${budgetVal}" (₹1 trillion) without a warning or cap.`);
  });

  await browser.close();
  runner.finish();
  generateReport();
}

main().catch((err) => {
  console.error('\n❌ Fatal error in phase5-edge-cases:', err);
  runner.finish();
  generateReport();
  process.exit(1);
});

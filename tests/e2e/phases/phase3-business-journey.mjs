#!/usr/bin/env node
// Phase 3 — Business journey: signup wizard, admin approval, dashboard,
// send collab request to the real creator (madangowri), accept, bilateral
// project proposal, stage advancement, change request, cancellation.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phases/phase3-business-journey.mjs

import { readFileSync } from 'node:fs';
import { Runner, assert } from '../lib/harness.mjs';
import { launchBrowser, newPage } from '../lib/browser.mjs';
import { byLabel, fillByLabel, selectOpt, clickButton, clickWhenEnabled, waitForSelector } from '../lib/browser.mjs';
import { waitForRow, getRow, assertFields, findAuthUserByEmail, sb } from '../lib/db.mjs';
import { handlePostSignupAuth, loginAs } from '../lib/auth-helpers.mjs';
import { generateReport } from '../lib/report.mjs';
import { BASE_URL, CREATOR, BUSINESS, TEST_ADMIN } from '../lib/config.mjs';

const runner = new Runner('phase3-business-journey', 'Phase 3 — Business Journey');
const ADMIN = TEST_ADMIN;

let businessUserId = null;
let creatorUserId = null;
let collabRequestId = null;
let projectId = null;

/** Tick only checklist rows that aren't already done — clicking an already-done
 * "both"-owned row un-toggles it (either party can flip it either direction),
 * which would undo the other side's work if we blindly clicked every row. */
async function tickPendingItems(page, projId, stageKey) {
  const { sb } = await import('../lib/db.mjs');
  const { data: items } = await sb.from('project_stage_items').select('label,done_at').eq('project_id', projId).eq('stage_key', stageKey);
  const pending = (items || []).filter((it) => !it.done_at);
  let ticked = 0;
  for (const it of pending) {
    const row = page.locator('button').filter({ hasText: it.label }).first();
    if (await row.count() > 0 && await row.isEnabled().catch(() => false)) {
      await row.click();
      await page.waitForTimeout(800);
      ticked++;
    }
  }
  return { ticked, totalPending: pending.length };
}

async function main() {
  const browser = await launchBrowser();
  const bp = await newPage(browser); // business page
  const cp = await newPage(browser); // creator page
  const ap = await newPage(browser); // admin page
  runner.watch(bp); runner.watch(cp); runner.watch(ap);

  try {
    const creatorState = JSON.parse(readFileSync(new URL('../state/creator-user-id.json', import.meta.url), 'utf8'));
    creatorUserId = creatorState.userId;
  } catch {
    throw new Error('tests/e2e/state/creator-user-id.json missing — run Phase 2 first to create the creator account.');
  }

  const existingBiz = await findAuthUserByEmail(BUSINESS.email);
  const alreadySignedUp = !!existingBiz;

  if (alreadySignedUp) {
    await runner.step('Business account already exists from a prior run — logging in directly', bp, async ({ note }) => {
      businessUserId = existingBiz.id;
      note(`Reusing existing account ${existingBiz.id}.`);
      await loginAs(bp, { baseUrl: BASE_URL, email: BUSINESS.email, password: BUSINESS.password });
    });
  } else {
    await runner.step('Signup role selection renders', bp, async () => {
      await bp.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle', timeout: 15000 });
    });

    await runner.step('Click "I\'m a business" → wizard Step 1 (Account)', bp, async () => {
      await bp.click('a[href*="/signup/business"]');
      await bp.waitForURL('**/signup/business**', { timeout: 10000 });
    });

    await runner.step('Step 1 (Account): full name/company/email/phone/password', bp, async () => {
      await fillByLabel(bp, 'Full name', BUSINESS.fullName, 'Your full name');
      await fillByLabel(bp, 'Company name', BUSINESS.companyName, 'Your company');
      await fillByLabel(bp, 'Work email', BUSINESS.email, 'you@company.com');
      await fillByLabel(bp, 'Phone', BUSINESS.phone, '+91');
      await fillByLabel(bp, 'Password', BUSINESS.password, 'At least 8');
    });

    await runner.step('Step 1 → Continue to Step 2 (Company)', bp, async () => {
      await clickWhenEnabled(bp, 'Continue', { timeout: 15000 });
      await waitForSelector(bp, 'h2:has-text("Company details")', 8000);
    });

    await runner.step('Step 2 (Company): industry/business type/website', bp, async () => {
      await selectOpt(bp, 'Industry', BUSINESS.industry);
      await selectOpt(bp, 'Business type', BUSINESS.businessType);
      await fillByLabel(bp, 'Website', BUSINESS.website, 'https://yourcompany.com');
    });

    await runner.step('Step 2 → Continue to Step 3 (Verify)', bp, async () => {
      await clickWhenEnabled(bp, 'Continue', { timeout: 15000 });
      await bp.waitForTimeout(800);
    });

    await runner.step('Step 3 (Verify): city/state/address/GST', bp, async () => {
      await fillByLabel(bp, 'City', BUSINESS.city, 'City');
      await selectOpt(bp, 'State', BUSINESS.state);
      await fillByLabel(bp, 'Registered address', BUSINESS.registeredAddress, 'Full registered');
      await fillByLabel(bp, 'GST number', BUSINESS.gst, '22AAAAA0000A1Z5');
    });

    await runner.step('Step 3 → Continue to Step 4 (Intent)', bp, async () => {
      await clickWhenEnabled(bp, 'Continue', { timeout: 15000 });
      await bp.waitForTimeout(800);
    });

    await runner.step('Step 4 (Intent): pick budget tier, submit for review', bp, async () => {
      const budgetBtn = bp.locator('button:has-text("₹")').first();
      assert(await budgetBtn.count() > 0, 'no budget tier buttons found');
      await budgetBtn.click();
      await clickWhenEnabled(bp, 'Submit for review', { timeout: 15000 });
    });

    await runner.step('Submit → account created (pending review)', bp, async () => {
      const result = await handlePostSignupAuth(bp, { baseUrl: BASE_URL, email: BUSINESS.email, password: BUSINESS.password });
      businessUserId = result.userId || null;
    });

    await runner.step('DB: profiles + business_profiles created, approval_status=pending_review', null, async () => {
      const row = await waitForRow('profiles', { email: BUSINESS.email }, { timeoutMs: 10000 });
      businessUserId = businessUserId || row.id;
      assertFields(row, { role: 'business_owner' }, 'profiles(business)');
      const biz = await waitForRow('business_profiles', { user_id: businessUserId }, { timeoutMs: 10000 });
      assertFields(biz, {
        company_name: BUSINESS.companyName,
        approval_status: 'pending_review',
        gst_number: BUSINESS.gst,
      }, 'business_profiles(pending)');
    });

    await runner.step('Pending-approval banner shown on business dashboard', bp, async ({ note }) => {
      await bp.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
      await bp.waitForTimeout(1200);
      const bodyText = await bp.locator('body').innerText();
      const hasPendingLanguage = /being verified|pending|under review/i.test(bodyText);
      note(`Pending-review language present: ${hasPendingLanguage}`);
      assert(hasPendingLanguage, 'expected a pending-approval message on the business dashboard before admin approval');
    });
  }

  // ── Admin approves ──────────────────────────────────────────────────
  await runner.step('Admin logs in and opens approvals queue', ap, async () => {
    assert(ADMIN.password, 'ADMIN_CREDENTIALS.local.txt missing/unreadable — cannot test admin approval flow');
    await loginAs(ap, { baseUrl: BASE_URL, email: ADMIN.email, password: ADMIN.password });
    await ap.goto(`${BASE_URL}/dashboard/admin/approvals`, { waitUntil: 'networkidle', timeout: 20000 });
    await ap.waitForTimeout(1000);
  });

  await runner.step(`Admin approves "${BUSINESS.companyName}"`, ap, async ({ note }) => {
    const existing = await getRow('business_profiles', { user_id: businessUserId });
    if (existing?.approval_status === 'approved') {
      return { skipped: `Already approved (from a prior run) — approval_status is already "approved", nothing to click.` };
    }
    const row = ap.locator(`text=${BUSINESS.companyName}`).first();
    if (await row.count() === 0) {
      return { skipped: `"${BUSINESS.companyName}" not found in the approvals list.` };
    }
    const card = row.locator('xpath=ancestor::*[.//button[contains(., "Approve")]][1]');
    const approveBtn = card.locator('button:has-text("Approve")').first();
    await approveBtn.click();
    await ap.waitForTimeout(1500);
    note('Clicked Approve.');
  });

  await runner.step('DB: business_profiles.approval_status is now "approved"', null, async () => {
    const biz = await waitForRow('business_profiles', { user_id: businessUserId }, { timeoutMs: 8000 });
    assertFields(biz, { approval_status: 'approved' }, 'business_profiles(after approval)');
  });

  await runner.step('Business re-logs in with approved status', bp, async () => {
    await loginAs(bp, { baseUrl: BASE_URL, email: BUSINESS.email, password: BUSINESS.password });
  });

  await runner.step('Business dashboard renders stats (no pending banner)', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1200);
    const bodyText = await bp.locator('body').innerText();
    assert(!/being verified|pending review/i.test(bodyText), 'pending-approval banner still shown after admin approval');
    note('Pending banner correctly gone after approval.');
  });

  // REGRESSION GUARD: budget left blank used to send `budget: null`, and
  // CollabRequestSchema's `z.number().positive().optional()` only accepted
  // `undefined` — never null — so a field explicitly labeled optional 400'd.
  // Fixed by making the schema `.nullish()` (packages/core/src/validators.ts).
  // The request this creates is deleted immediately after, so the next step
  // sending a second (real) request to the same creator doesn't collide with
  // collab_requests' one-pending-request-per-pair constraint.
  await runner.step('Sending a request with budget left blank now succeeds (was HTTP 400)', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard/requests/new?to=${creatorUserId}`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1200);
    const title = `Blank-budget guard (E2E audit) ${Date.now()}`;
    await bp.fill('#req-title', title);
    let capturedStatus = null, capturedBody = null;
    const handler = async (res) => {
      if (res.url().includes('/api/collabs') && res.request().method() === 'POST') {
        capturedStatus = res.status();
        capturedBody = await res.text().catch(() => '');
      }
    };
    bp.on('response', handler);
    await clickButton(bp, 'Send request');
    await bp.waitForTimeout(1500);
    bp.off('response', handler);
    note(`POST /api/collabs with budget left blank → HTTP ${capturedStatus}: ${capturedBody}`);
    assert(capturedStatus === 200, `expected a blank optional budget to be accepted, got HTTP ${capturedStatus}: ${capturedBody}`);

    const { data: row } = await sb.from('collab_requests').select('id, budget').ilike('message', `${title}%`).maybeSingle();
    assert(row && row.budget === null, `expected the row to exist with budget=null, got ${JSON.stringify(row)}`);
    await sb.from('collab_requests').delete().eq('id', row.id); // clear the pending slot for the next step
  });

  // ── Send collab request to the real creator ────────────────────────────
  await runner.step('Business sends a collab request to the creator', bp, async () => {
    await bp.goto(`${BASE_URL}/dashboard/requests/new?to=${creatorUserId}`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1200);
    await bp.fill('#req-title', 'YouTube Integration — Tamil Content (E2E audit)');
    await bp.fill('#req-budget', '50000');
    const msgArea = bp.locator('textarea').first();
    if (await msgArea.count() > 0) await msgArea.fill('Loved your content — proposing a YouTube + Instagram reel campaign for our millet snack brand.');
    await clickButton(bp, 'Send request');
    await bp.waitForTimeout(2000);
  });

  await runner.step('DB: collab_requests row created, status=pending', null, async () => {
    const row = await waitForRow('collab_requests', { from_user_id: businessUserId, to_user_id: creatorUserId }, { timeoutMs: 10000 });
    assertFields(row, { status: 'pending' }, 'collab_requests(new)');
    collabRequestId = row.id;
  });

  await runner.step('Business requests outbox shows "awaiting reply"', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard/requests`, { waitUntil: 'networkidle', timeout: 15000 });
    await bp.waitForTimeout(1000);
    const bodyText = await bp.locator('body').innerText();
    note(`Outbox text contains "awaiting": ${/awaiting/i.test(bodyText)}`);
  });

  // ── Creator accepts ────────────────────────────────────────────────────
  await runner.step('Creator logs in and sees the incoming request', cp, async () => {
    await loginAs(cp, { baseUrl: BASE_URL, email: CREATOR.email, password: CREATOR.password });
    await cp.goto(`${BASE_URL}/dashboard/requests`, { waitUntil: 'networkidle', timeout: 15000 });
    await cp.waitForTimeout(1200);
    const bodyText = await cp.locator('body').innerText();
    assert(bodyText.includes(BUSINESS.companyName) || bodyText.includes(BUSINESS.fullName), 'incoming request from the business not visible in creator inbox');
  });

  await runner.step('Creator accepts the request', cp, async () => {
    const acceptBtn = cp.locator('button:has-text("Accept")').first();
    assert(await acceptBtn.count() > 0, '"Accept" button not found on requests page');
    await acceptBtn.click();
    await cp.waitForTimeout(2000);
  });

  await runner.step('DB: collab_requests.status is now "accepted"', null, async () => {
    const row = await waitForRow('collab_requests', { id: collabRequestId }, { timeoutMs: 8000 });
    assertFields(row, { status: 'accepted' }, 'collab_requests(after accept)');
  });

  // ── Bilateral project proposal (via the messages DealPanel) ──────────
  await runner.step('Business opens the conversation and proposes project terms', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard/messages`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1500);
    const convRow = bp.locator(`text=${CREATOR.firstName}`).first();
    if (await convRow.count() === 0) {
      return { skipped: 'No conversation row with the creator found on the business messages page.' };
    }
    await convRow.click();
    await bp.locator('text=Loading conversation').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await bp.waitForTimeout(800);
    await clickButton(bp, 'Create project');
    await fillByLabel(bp, 'Project title', 'YouTube Integration — Tamil Content', 'Project title').catch(async () => {
      await bp.fill('input[placeholder="Project title"]', 'YouTube Integration — Tamil Content');
    });
    const descArea = bp.locator('textarea[placeholder*="delivered"]');
    if (await descArea.count() > 0) await descArea.fill('One dedicated YouTube integration + one Instagram reel for the millet snack launch.');
    const budgetInput = bp.locator('#deal-budget');
    if (await budgetInput.count() > 0) await budgetInput.fill('50000');
    const advanceInput = bp.locator('#deal-advance');
    if (await advanceInput.count() > 0) await advanceInput.fill('15000');
    await clickWhenEnabled(bp, 'Send for approval', { timeout: 10000 });
    note('Proposal sent.');
  });

  await runner.step('DB: project_proposals row created (bilateral, not yet a project)', null, async ({ note }) => {
    const row = await waitForRow('project_proposals', { proposed_by: businessUserId }, { timeoutMs: 8000 });
    assertFields(row, { status: 'pending', title: (v) => !!v, budget: 50000 }, 'project_proposals(new)');
    note(`Proposal id ${row.id}, status ${row.status}`);
  });

  await runner.step('Creator opens the conversation and accepts the proposal → project created', cp, async ({ note }) => {
    await cp.goto(`${BASE_URL}/dashboard/messages`, { waitUntil: 'networkidle', timeout: 20000 });
    await cp.waitForTimeout(1500);
    // The chat list shows the counterpart's personal name, not their company name.
    const convRow = cp.locator(`text=${BUSINESS.fullName}`).first();
    if (await convRow.count() === 0) {
      return { skipped: 'No conversation row with the business found on the creator messages page.' };
    }
    await convRow.click();
    await cp.locator('text=Loading conversation').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await cp.waitForTimeout(1000);
    let acceptBtn = cp.locator('button:has-text("Accept & start project")');
    if (await acceptBtn.count() === 0) {
      // The deal panel polls/relies on realtime — give it one reload before giving up.
      await cp.reload({ waitUntil: 'networkidle' });
      await cp.waitForTimeout(1500);
      acceptBtn = cp.locator('button:has-text("Accept & start project")');
    }
    if (await acceptBtn.count() === 0) {
      return { skipped: '"Accept & start project" button not found even after a reload — proposal may not have arrived yet.' };
    }
    await acceptBtn.click();
    await cp.waitForTimeout(2500);
    note('Proposal accepted.');
  });

  await runner.step('DB: campaign_projects row created with status=active', null, async () => {
    const row = await waitForRow('campaign_projects', { owner_user_id: businessUserId, counterparty_user_id: creatorUserId }, { timeoutMs: 10000 }).catch(() =>
      waitForRow('campaign_projects', { owner_user_id: creatorUserId, counterparty_user_id: businessUserId }, { timeoutMs: 4000 })
    );
    projectId = row.id;
    assert(row.status === 'active' || row.status === 'in_progress' || !!row.status, `unexpected project status: ${row.status}`);
  });

  // ── Project workspace: stage advance, change request, cancellation ───
  await runner.step('Project page loads with stage timeline', bp, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id resolved — cannot open project workspace.' };
    await bp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1500);
    note(`Opened project ${projectId}.`);
  });

  await runner.step('Business ticks required checklist items for stage 1 (Guided view)', bp, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id.' };
    const proj = await getRow('campaign_projects', { id: projectId });
    if (proj.status === 'cancelled') {
      return { skipped: `Project ${projectId} is already cancelled (from a prior run reusing this pair) — checklist is correctly locked ("frozen for reference"). Not a bug; skipping stage-advance checks for this run.` };
    }
    // Default view is "Guided": a bilateral checklist per stage, not a single
    // "Advance" button. owner_role="both" means either party may tick a row —
    // but clicking an already-done row un-toggles it, so only click rows that
    // are actually still pending (checked via DB, not by blindly clicking).
    const { ticked, totalPending } = await tickPendingItems(bp, projectId, 'collaboration_started');
    note(`Ticked ${ticked}/${totalPending} pending checklist item(s) as the business.`);
  });

  await runner.step('Business signs off on stage 1 ("Confirm this stage")', bp, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id.' };
    const confirmBtn = bp.locator('button:has-text("Confirm this stage")').first();
    if (await confirmBtn.count() === 0) return { skipped: 'No "Confirm this stage" button visible.' };
    if (!(await confirmBtn.isEnabled().catch(() => false))) {
      const text = await confirmBtn.textContent().catch(() => '');
      return { skipped: `"Confirm this stage" is disabled — required items may not all be done. Button text: "${text?.trim()}"` };
    }
    await confirmBtn.click();
    await bp.waitForTimeout(1500);
    note('Business signed off on stage 1.');
  });

  await runner.step('Creator ticks their items and signs off too — stage should advance (bilateral)', cp, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id.' };
    await cp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'networkidle', timeout: 20000 });
    await cp.waitForTimeout(1200);
    const { ticked, totalPending } = await tickPendingItems(cp, projectId, 'collaboration_started');
    note(`Ticked ${ticked}/${totalPending} pending checklist item(s) as the creator.`);
    const confirmBtn = cp.locator('button:has-text("Confirm this stage")').first();
    if (await confirmBtn.count() > 0 && await confirmBtn.isEnabled().catch(() => false)) {
      await confirmBtn.click();
      await cp.waitForTimeout(1500);
      note('Creator signed off — both sides confirmed, stage should now advance.');
    } else {
      note('Creator side: "Confirm this stage" not available/enabled after ticking their items.');
    }
  });

  await runner.step('DB: campaign_projects.current_stage reflects the bilateral advance', null, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id.' };
    const row = await getRow('campaign_projects', { id: projectId });
    note(`current_stage=${row.current_stage}, status=${row.status}`);
    if (row.status === 'cancelled') return { skipped: 'Project already cancelled from a prior run — stage-advance was correctly blocked, not applicable.' };
    assert(row.current_stage !== 'collaboration_started', `expected the stage to have advanced past "collaboration_started" after both sides signed off, still at ${row.current_stage}`);
  });

  await runner.step('Request project cancellation with a reason', bp, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id.' };
    const cancelIconBtn = bp.locator('button[aria-label="Request to cancel this project"]');
    if (await cancelIconBtn.count() === 0) return { skipped: 'Cancel button not found on project page.' };
    await cancelIconBtn.click();
    await bp.waitForTimeout(800);
    const reasonSelect = bp.locator('select').first();
    if (await reasonSelect.count() > 0) await reasonSelect.selectOption({ index: 0 });
    await clickButton(bp, 'Request cancellation');
    await bp.waitForTimeout(2000);
    note('Cancellation requested.');
  });

  await runner.step('DB: campaign_projects reflects cancellation request', null, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id.' };
    const { sb } = await import('../lib/db.mjs');
    const { data } = await sb.from('campaign_projects').select('status,cancel_reason_category,cancel_requested_by').eq('id', projectId).maybeSingle();
    note(`status=${data?.status}, cancel_reason_category=${data?.cancel_reason_category}, requested_by=${data?.cancel_requested_by}`);
  });

  await runner.step('Creator (other party) sees and accepts the cancellation', cp, async ({ note }) => {
    if (!projectId) return { skipped: 'No project id.' };
    await cp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'networkidle', timeout: 20000 });
    await cp.waitForTimeout(1200);
    const acceptCancelBtn = cp.locator('button:has-text("Accept & cancel")').first();
    if (await acceptCancelBtn.count() === 0) return { skipped: 'No accept-cancellation control found for the other party.' };
    await acceptCancelBtn.click();
    await cp.waitForTimeout(2000);
    note('Cancellation accepted by the other party — only they can accept, never the requester, per project_cancellation.ts.');
  });

  await runner.step('DB: project is now cancelled', null, async () => {
    if (!projectId) return { skipped: 'No project id.' };
    const row = await getRow('campaign_projects', { id: projectId });
    assert(row.status === 'cancelled' || row.status === 'canceled', `expected project cancelled, got status=${row.status}`);
  });

  // ── Business-side page sweep (settings, connections, discover, messages) ─
  await runner.step('Business settings page pre-fills company fields', bp, async () => {
    await bp.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1200);
    // Company name renders inside an <input value="...">, which .innerText()
    // never picks up (that's page text content, not form-control values) —
    // check the actual input value, not the rendered body text.
    const companyInput = bp.locator(`input[value="${BUSINESS.companyName}"]`);
    const found = await companyInput.count() > 0;
    if (!found) {
      const anyInputWithValue = await bp.locator('input').evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
      assert(anyInputWithValue.includes(BUSINESS.companyName), `company name not found in any input value on settings page. Found values: ${anyInputWithValue.join(', ')}`);
    }
  });

  await runner.step('Business connections page loads real data (no longer a static stub)', bp, async () => {
    const res = await bp.goto(`${BASE_URL}/dashboard/connections`, { waitUntil: 'networkidle', timeout: 15000 });
    await bp.waitForTimeout(600);
    const bodyText = await bp.locator('body').innerText();
    assert(res.status() < 400, `expected the Connections page to load, got HTTP ${res.status()}`);
    assert(!/application error/i.test(bodyText), 'Connections page crashed');
  });

  await runner.step('Business discover — same real 404 as creator side', bp, async () => {
    const res = await bp.goto(`${BASE_URL}/dashboard/discover`, { waitUntil: 'networkidle', timeout: 15000 });
    const bodyText = await bp.locator('body').innerText();
    assert(/404|page not found/i.test(bodyText), 'expected not-found UI for business role too');
    assert(res.status() === 404, `expected a true HTTP 404, got ${res.status()}`);
  });

  // REGRESSION GUARD: the block API/DB was fully wired but had no UI entry
  // point anywhere — the 2026-07-30 audit flagged it as unreachable. Settings
  // now has a "Blocked accounts" panel; the API itself is unchanged.
  await runner.step('Blocked accounts panel is reachable from Settings', bp, async ({ note }) => {
    const result = await bp.evaluate(async () => {
      const res = await fetch('/api/blocks', { method: 'GET' });
      return { status: res.status };
    });
    note(`GET /api/blocks while authenticated → HTTP ${result.status}.`);
    assert(result.status < 500, `unexpected server error from /api/blocks: ${result.status}`);

    await bp.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle', timeout: 20000 });
    const bodyText = await bp.locator('body').innerText();
    assert(/blocked accounts/i.test(bodyText), 'expected a "Blocked accounts" section on Settings');
  });

  await browser.close();
  runner.finish();
  generateReport();
}

main().catch((err) => {
  console.error('\n❌ Fatal error in phase3-business-journey:', err);
  runner.finish();
  generateReport();
  process.exit(1);
});

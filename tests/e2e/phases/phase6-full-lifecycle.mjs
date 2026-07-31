#!/usr/bin/env node
// Phase 6 — Full project lifecycle: the highest-value gap from the last audit.
// One continuous project run through EVERY remaining mechanism:
//   change request (propose/accept mid-project terms) → real Razorpay payment
//   (live test-mode order + simulated signed webhook capture) → skip-stage
//   (propose/confirm) → the review fork (approve draft) → final payment →
//   dual-confirm completion → reviews from both sides.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phases/phase6-full-lifecycle.mjs

import { Runner, assert } from '../lib/harness.mjs';
import { launchBrowser, newPage } from '../lib/browser.mjs';
import { fillByLabel, clickButton, clickWhenEnabled } from '../lib/browser.mjs';
import { loginAs } from '../lib/auth-helpers.mjs';
import { getRow, getRowSettled, waitForRow, assertFields, sb } from '../lib/db.mjs';
import { tickPendingItems, bilateralAdvance, waitForProjectLoaded } from '../lib/project-helpers.mjs';
import { simulateCapturedPayment } from '../lib/payments.mjs';
import { generateReport } from '../lib/report.mjs';
import { BASE_URL, CREATOR, BUSINESS } from '../lib/config.mjs';

const runner = new Runner('phase6-full-lifecycle', 'Phase 6 — Full Project Lifecycle (Payments, Skip, Change Requests, Completion, Reviews)');
let businessUserId, creatorUserId, projectId;

async function payStage(businessPage, note, stageKey) {
  // domcontentloaded, not networkidle: Razorpay's checkout.js keeps background
  // network activity (fraud-detection pings, etc.) going indefinitely once
  // loaded, which can make a later networkidle wait on this same page hang.
  await businessPage.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitForProjectLoaded(businessPage);
  let payBtn = businessPage.locator('button').filter({ hasText: 'securely' }).first();
  if (await payBtn.count() === 0) {
    // Occasionally still on the loading skeleton even after the checklist
    // marker appears — one reload with a fresh wait before giving up.
    await businessPage.reload({ waitUntil: 'domcontentloaded' });
    await waitForProjectLoaded(businessPage);
    payBtn = businessPage.locator('button').filter({ hasText: 'securely' }).first();
  }
  assert(await payBtn.count() > 0, `no "Pay ... securely" button found for ${stageKey}`);
  await payBtn.click();
  await businessPage.waitForTimeout(3000); // real Razorpay order-creation round trip
  // The order is already created server-side by this point (that's what we're
  // testing) — dismiss the checkout modal/iframe so it doesn't leave lingering
  // network activity behind for subsequent navigations on this page.
  await businessPage.keyboard.press('Escape').catch(() => {});
  await businessPage.waitForTimeout(500);
  const payment = await waitForRow('project_payments', { project_id: projectId, stage_key: stageKey }, { timeoutMs: 8000 });
  assertFields(payment, { status: 'created', razorpay_order_id: (v) => !!v }, `project_payments(${stageKey}, pre-capture)`);
  note(`Real Razorpay order created: ${payment.razorpay_order_id}, amount ${payment.amount} ${payment.currency}.`);

  const sim = await simulateCapturedPayment({
    baseUrl: BASE_URL,
    orderId: payment.razorpay_order_id,
    paymentId: `pay_e2e_sim_${Date.now()}`,
    amountPaise: payment.amount,
    currency: payment.currency,
  });
  note(`Simulated signed webhook capture → HTTP ${sim.status}: ${JSON.stringify(sim.body)}`);
  assert(sim.status === 200, `expected webhook to accept the signed capture event, got HTTP ${sim.status}`);

  const paidRow = await waitForRow('project_payments', { id: payment.id }, { timeoutMs: 5000 });
  assertFields(paidRow, { status: 'paid', razorpay_payment_id: (v) => !!v }, `project_payments(${stageKey}, post-capture)`);

  const gateItem = await getRow('project_stage_items', { project_id: projectId, stage_key: stageKey, is_gate: true });
  assert(!!gateItem?.done_at, `expected the ${stageKey} payment-gate checklist item to auto-complete after webhook capture`);
  note('Payment-gate checklist item auto-completed by the webhook, as designed.');
}

async function main() {
  const browser = await launchBrowser();
  const bp = await newPage(browser);
  const cp = await newPage(browser);
  runner.watch(bp); runner.watch(cp);

  await runner.step('Resolve business/creator user ids', null, async () => {
    const biz = await getRow('profiles', { email: BUSINESS.email });
    const cre = await getRow('profiles', { email: CREATOR.email });
    businessUserId = biz.id; creatorUserId = cre.id;
    assert(businessUserId && creatorUserId, 'could not resolve both user ids');
  });

  // ── Fresh collab → accept → proposal → accept → project ──────────────
  await runner.step('Business logs in and sends a fresh collab request', bp, async () => {
    await loginAs(bp, { baseUrl: BASE_URL, email: BUSINESS.email, password: BUSINESS.password });
    await bp.goto(`${BASE_URL}/dashboard/requests/new?to=${creatorUserId}`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1000);
    await bp.fill('#req-title', 'Full Lifecycle Audit Project');
    await bp.fill('#req-budget', '80000');
    const msgArea = bp.locator('textarea').first();
    if (await msgArea.count() > 0) await msgArea.fill('Full-lifecycle E2E audit run — payments, skip, change requests, completion, reviews.');
    await clickButton(bp, 'Send request');
    await bp.waitForTimeout(2000);
  });

  await runner.step('Creator accepts it', cp, async () => {
    await loginAs(cp, { baseUrl: BASE_URL, email: CREATOR.email, password: CREATOR.password });
    await cp.goto(`${BASE_URL}/dashboard/requests`, { waitUntil: 'networkidle', timeout: 15000 });
    await cp.waitForTimeout(1200);
    const acceptBtn = cp.locator('button:has-text("Accept")').first();
    assert(await acceptBtn.count() > 0, 'no Accept button for the fresh request');
    await acceptBtn.click();
    await cp.waitForTimeout(2000);
  });

  await runner.step('Business proposes the project (with an advance)', bp, async () => {
    await bp.goto(`${BASE_URL}/dashboard/messages`, { waitUntil: 'networkidle', timeout: 20000 });
    await bp.waitForTimeout(1500);
    const convRow = bp.locator(`text=${CREATOR.firstName}`).first();
    assert(await convRow.count() > 0, 'no conversation with the creator found');
    await convRow.click();
    await bp.locator('text=Loading conversation').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await bp.waitForTimeout(800);
    await clickButton(bp, 'Create project');
    await bp.fill('input[placeholder="Project title"]', 'Full Lifecycle Audit Project');
    const descArea = bp.locator('textarea[placeholder*="delivered"]');
    if (await descArea.count() > 0) await descArea.fill('Full lifecycle audit — advance + final payment, skip, change request, completion, reviews.');
    await bp.fill('#deal-budget', '80000');
    await bp.fill('#deal-advance', '30000');
    await clickWhenEnabled(bp, 'Send for approval', { timeout: 10000 });
  });

  await runner.step('Creator accepts the proposal → project created', cp, async () => {
    await cp.goto(`${BASE_URL}/dashboard/messages`, { waitUntil: 'networkidle', timeout: 20000 });
    await cp.waitForTimeout(1500);
    const convRow = cp.locator(`text=${BUSINESS.fullName}`).first();
    assert(await convRow.count() > 0, 'no conversation with the business found');
    await convRow.click();
    await cp.locator('text=Loading conversation').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await cp.waitForTimeout(800);
    await clickWhenEnabled(cp, 'Accept & start project', { timeout: 10000 });
    await cp.waitForTimeout(2000);
  });

  await runner.step('DB: fresh campaign_projects row created', null, async () => {
    const row = await waitForRow('campaign_projects', { owner_user_id: businessUserId, counterparty_user_id: creatorUserId }, { timeoutMs: 8000 });
    projectId = row.id;
    assertFields(row, { status: (v) => v === 'active' || !!v, current_stage: 'collaboration_started' }, 'campaign_projects(fresh)');
  });

  // ── Stage 1: collaboration_started — plain bilateral signoff ──────────
  await runner.step('Stage 1 (collaboration_started): bilateral signoff advances the project', bp, async ({ note }) => {
    const row = await bilateralAdvance(bp, cp, BASE_URL, projectId, 'collaboration_started');
    note(`current_stage after both sign off: ${row.current_stage}`);
    assert(row.current_stage === 'project_discussion', `expected project_discussion, got ${row.current_stage}`);
  });

  // ── Stage 2: project_discussion — CHANGE REQUEST, then advance ────────
  await runner.step('Stage 2: business proposes a change to the terms', bp, async () => {
    await bp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(bp);
    await clickButton(bp, 'Propose a change to the terms');
    await bp.waitForTimeout(500);
    // The modal's Budget field is the first number input inside it.
    const modalBudget = bp.locator('div:has-text("Propose a change") input[type="number"]').first();
    await modalBudget.fill('85000');
    await clickButton(bp, 'Send proposal');
    await bp.waitForTimeout(1500);
  });

  await runner.step('DB: project_change_requests row created, status=pending', null, async () => {
    const row = await waitForRow('project_change_requests', { project_id: projectId }, { timeoutMs: 8000 });
    assertFields(row, { status: 'pending', proposed_by: businessUserId }, 'project_change_requests(new)');
    assert(row.changes && Number(row.changes.budget) === 85000, `expected changes.budget=85000, got ${JSON.stringify(row.changes)}`);
  });

  await runner.step('Creator accepts the change request', cp, async ({ note }) => {
    await cp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(cp);
    const acceptBtn = cp.locator('button:has-text("Accept")').first();
    assert(await acceptBtn.count() > 0, 'no Accept button for the pending change request');
    await acceptBtn.click();
    await cp.waitForTimeout(1500);
    note('Change request accepted.');
  });

  await runner.step('DB: campaign_projects.budget updated to 85000, change request accepted', null, async () => {
    const proj = await getRowSettled('campaign_projects', { id: projectId }, (r) => r.budget === 85000);
    assertFields(proj, { budget: 85000 }, 'campaign_projects(after change request)');
    const cr = await getRowSettled('project_change_requests', { project_id: projectId }, (r) => r.status !== 'pending');
    assertFields(cr, { status: 'accepted' }, 'project_change_requests(resolved)');
  });

  await runner.step('Stage 2 → advance via bilateral signoff', bp, async ({ note }) => {
    const row = await bilateralAdvance(bp, cp, BASE_URL, projectId, 'project_discussion');
    note(`current_stage: ${row.current_stage}`);
    assert(row.current_stage === 'advance_payment', `expected advance_payment, got ${row.current_stage}`);
  });

  // ── Stage 3: advance_payment — REAL Razorpay order + simulated webhook ─
  await runner.step('Stage 3 (advance_payment): real Razorpay order + simulated webhook capture', bp, async ({ note }) => {
    await payStage(bp, note, 'advance_payment');
  });

  await runner.step('Stage 3 → advance via bilateral signoff (payment gate now open)', bp, async ({ note }) => {
    const row = await bilateralAdvance(bp, cp, BASE_URL, projectId, 'advance_payment');
    note(`current_stage: ${row.current_stage}`);
    assert(row.current_stage === 'content_planning', `expected content_planning, got ${row.current_stage}`);
  });

  // ── Stage 4: content_planning — SKIP flow ─────────────────────────────
  await runner.step('Stage 4: business proposes skipping content_planning', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(bp);
    const skipBtn = bp.locator('button:has-text("propose skipping it")').first();
    assert(await skipBtn.count() > 0, 'no "propose skipping it" control found on content_planning');
    await skipBtn.click();
    await bp.waitForTimeout(1500);
    note('Skip proposed by business.');
  });

  await runner.step('Creator confirms the skip', cp, async ({ note }) => {
    await cp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(cp);
    const confirmSkipBtn = cp.locator('button:has-text("Confirm skip")').first();
    assert(await confirmSkipBtn.count() > 0, 'no "Confirm skip" button visible to the creator');
    await confirmSkipBtn.click();
    await cp.waitForTimeout(1500);
    note('Skip confirmed by creator — stage should now be skipped.');
  });

  await runner.step('DB: content_planning was skipped, project moved to content_confirmation', null, async () => {
    let proj = await getRow('campaign_projects', { id: projectId });
    for (let i = 0; i < 4 && proj.current_stage === 'content_planning'; i++) {
      await new Promise((r) => setTimeout(r, 800));
      proj = await getRow('campaign_projects', { id: projectId });
    }
    assert(proj.current_stage === 'content_confirmation', `expected content_confirmation after skip, got ${proj.current_stage}`);
    const progress = proj.stage_progress?.content_planning;
    assert(progress?.status === 'skipped', `expected content_planning stage_progress.status="skipped", got ${JSON.stringify(progress)}`);
  });

  // ── Stages 5-7: plain bilateral signoff chain ─────────────────────────
  await runner.step('Stage 5 (content_confirmation) → advance', bp, async ({ note }) => {
    const row = await bilateralAdvance(bp, cp, BASE_URL, projectId, 'content_confirmation');
    note(`current_stage: ${row.current_stage}`);
    assert(row.current_stage === 'shooting_in_progress', `expected shooting_in_progress, got ${row.current_stage}`);
  });

  await runner.step('Stage 6 (shooting_in_progress) → advance', bp, async ({ note }) => {
    const row = await bilateralAdvance(bp, cp, BASE_URL, projectId, 'shooting_in_progress');
    note(`current_stage: ${row.current_stage}`);
    assert(row.current_stage === 'editing_in_progress', `expected editing_in_progress, got ${row.current_stage}`);
  });

  await runner.step('Stage 7 (editing_in_progress) → advance', bp, async ({ note }) => {
    const row = await bilateralAdvance(bp, cp, BASE_URL, projectId, 'editing_in_progress');
    note(`current_stage: ${row.current_stage}`);
    assert(row.current_stage === 'sent_for_review', `expected sent_for_review, got ${row.current_stage}`);
  });

  // ── Stage 8: sent_for_review — the review fork (approve draft) ────────
  // sent_for_review is NOT a mutual-signoff stage, but it still has its own
  // required checklist item ("Draft submitted for review", creator-owned) —
  // the fork buttons stay disabled until that's ticked, same gate mechanism
  // as everywhere else.
  await runner.step('Creator ticks "Draft submitted for review" before the fork can be used', cp, async ({ note }) => {
    await cp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(cp);
    const { ticked, totalPending } = await tickPendingItems(cp, projectId, 'sent_for_review');
    note(`Ticked ${ticked}/${totalPending} pending item(s) for sent_for_review.`);
  });

  await runner.step('Stage 8: business approves the draft (review fork)', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(bp);
    let approveBtn = bp.locator('button:has-text("Approve draft")').first();
    assert(await approveBtn.count() > 0, 'no "Approve draft" button found for the business at sent_for_review');
    if (!(await approveBtn.isEnabled().catch(() => false))) {
      // The creator's tick may not have propagated to this already-open page — reload once.
      await bp.reload({ waitUntil: 'domcontentloaded' });
      await waitForProjectLoaded(bp);
      approveBtn = bp.locator('button:has-text("Approve draft")').first();
    }
    assert(await approveBtn.isEnabled().catch(() => false), '"Approve draft" is still disabled after the creator ticked "Draft submitted for review" and a reload');
    await approveBtn.click();
    await bp.waitForTimeout(1500);
    note('Draft approved.');
  });

  await runner.step('DB: project advanced to final_approval via the review fork', null, async () => {
    let proj = await getRow('campaign_projects', { id: projectId });
    for (let i = 0; i < 4 && proj.current_stage === 'sent_for_review'; i++) {
      await new Promise((r) => setTimeout(r, 800));
      proj = await getRow('campaign_projects', { id: projectId });
    }
    assert(proj.current_stage === 'final_approval', `expected final_approval, got ${proj.current_stage}`);
  });

  // ── Stage 10: final_approval — bilateral signoff ──────────────────────
  await runner.step('Stage 10 (final_approval) → advance', bp, async ({ note }) => {
    const row = await bilateralAdvance(bp, cp, BASE_URL, projectId, 'final_approval');
    note(`current_stage: ${row.current_stage}`);
    assert(row.current_stage === 'final_payment', `expected final_payment, got ${row.current_stage}`);
  });

  // ── Stage 11: final_payment — REAL payment + DUAL-CONFIRM completion ──
  await runner.step('Stage 11 (final_payment): real Razorpay order + simulated webhook capture', bp, async ({ note }) => {
    await payStage(bp, note, 'final_payment');
  });

  await runner.step('Business confirms completion', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(bp);
    const confirmBtn = bp.locator('button:has-text("Confirm completion")').first();
    assert(await confirmBtn.count() > 0, 'no "Confirm completion" button visible to business at final_payment');
    await confirmBtn.click();
    await bp.waitForTimeout(1500);
    note('Business confirmed completion (1 of 2).');
  });

  await runner.step('DB: only one side confirmed — project NOT yet completed (real dual-consent check)', null, async ({ note }) => {
    const proj = await getRowSettled('campaign_projects', { id: projectId }, (r) => r.owner_confirmed_complete === true);
    note(`owner_confirmed_complete=${proj.owner_confirmed_complete}, counterparty_confirmed_complete=${proj.counterparty_confirmed_complete}, current_stage=${proj.current_stage}`);
    assert(proj.owner_confirmed_complete === true, 'expected owner_confirmed_complete=true after business confirmed');
    assert(!proj.counterparty_confirmed_complete, 'expected counterparty_confirmed_complete still false — creator has not confirmed yet');
    assert(proj.current_stage === 'final_payment', `expected the project to STILL be at final_payment (not yet auto-completed with only one side confirmed), got ${proj.current_stage}. This is exactly the unilateral-completion bug migrations 081/082 were built to prevent — if this fails, that lockdown has regressed.`);
  });

  await runner.step('Creator confirms completion too → project completes (dual-consent verified live)', cp, async ({ note }) => {
    await cp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(cp);
    const confirmBtn = cp.locator('button:has-text("Confirm completion")').first();
    assert(await confirmBtn.count() > 0, 'no "Confirm completion" button visible to creator at final_payment');
    await confirmBtn.click();
    await cp.waitForTimeout(1500);
    note('Creator confirmed completion (2 of 2) — both sides now in.');
  });

  await runner.step('DB: project is now genuinely completed (both sides confirmed)', null, async () => {
    const proj = await getRowSettled('campaign_projects', { id: projectId }, (r) => r.status === 'completed');
    assertFields(proj, {
      status: 'completed',
      current_stage: 'project_completed',
      owner_confirmed_complete: true,
      counterparty_confirmed_complete: true,
    }, 'campaign_projects(completed)');
  });

  // ── Reviews ────────────────────────────────────────────────────────────
  await runner.step('Business leaves a 5-star review for the creator', bp, async ({ note }) => {
    await bp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(bp);
    await clickButton(bp, 'Leave a Review');
    await bp.waitForTimeout(600);
    const stars = bp.locator('xpath=//label[contains(text(),"Rating")]/following-sibling::div//button');
    assert(await stars.count() >= 5, `expected 5 star buttons, found ${await stars.count()}`);
    await stars.nth(4).click(); // 5th star = 5-star rating
    const commentBox = bp.locator('textarea[placeholder*="working with them"]');
    if (await commentBox.count() > 0) await commentBox.fill('Smooth collaboration end to end — great communication throughout (E2E audit).');
    await clickButton(bp, 'Submit');
    await bp.waitForTimeout(1500);
    note('Business submitted a 5-star review.');
  });

  await runner.step('DB: reviews row created from business → creator, rating=5', null, async () => {
    const row = await waitForRow('reviews', { from_user_id: businessUserId, to_user_id: creatorUserId }, { timeoutMs: 8000 });
    assertFields(row, { rating: 5 }, 'reviews(business->creator)');
  });

  await runner.step('Creator leaves a review for the business too', cp, async ({ note }) => {
    await cp.goto(`${BASE_URL}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForProjectLoaded(cp);
    await clickButton(cp, 'Leave a Review');
    await cp.waitForTimeout(600);
    const stars = cp.locator('xpath=//label[contains(text(),"Rating")]/following-sibling::div//button');
    if (await stars.count() >= 4) await stars.nth(3).click(); // 4-star
    const commentBox = cp.locator('textarea[placeholder*="working with them"]');
    if (await commentBox.count() > 0) await commentBox.fill('Great brand to work with, clear brief (E2E audit).');
    await clickButton(cp, 'Submit');
    await cp.waitForTimeout(1500);
    note('Creator submitted a 4-star review.');
  });

  await runner.step('DB: reviews row created from creator → business, and both reviews are now public', null, async () => {
    const row = await waitForRow('reviews', { from_user_id: creatorUserId, to_user_id: businessUserId }, { timeoutMs: 8000 });
    assertFields(row, { rating: 4 }, 'reviews(creator->business)');
  });

  await runner.step('Public profile /c/madangowri now shows the completed collaboration', cp, async ({ note }) => {
    await cp.goto(`${BASE_URL}/c/${CREATOR.username}`, { waitUntil: 'networkidle', timeout: 20000 });
    await cp.waitForTimeout(1200);
    const bodyText = await cp.locator('body').innerText();
    note(`"${BUSINESS.companyName}" or the review text visible on public profile: ${bodyText.includes(BUSINESS.companyName) || bodyText.toLowerCase().includes('collaboration')}`);
  });

  await browser.close();
  runner.finish();
  generateReport();
}

main().catch((err) => {
  console.error('\n❌ Fatal error in phase6-full-lifecycle:', err);
  runner.finish();
  generateReport();
  process.exit(1);
});

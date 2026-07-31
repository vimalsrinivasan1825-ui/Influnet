// Shared helpers for driving the Guided project-stage-flow UI.
import { sb, getRow } from './db.mjs';

/** domcontentloaded fires before the client-side data fetch that actually
 * populates the checklist/confirm button — wait for a stable marker instead
 * of guessing a fixed delay (networkidle is unreliable here because
 * Razorpay/Stream keep background network activity alive indefinitely). */
export async function waitForProjectLoaded(page) {
  await page.locator('text=Steps in this stage').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
}

/** Tick only checklist rows that aren't already done — clicking an already-done
 * "both"-owned row un-toggles it (either party can flip it either direction),
 * which would undo the other side's work if we blindly clicked every row. */
export async function tickPendingItems(page, projectId, stageKey) {
  const { data: items } = await sb.from('project_stage_items').select('label,done_at').eq('project_id', projectId).eq('stage_key', stageKey);
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

/** Have both sides tick their pending items and confirm-sign-off a mutual-signoff
 * stage, then verify the project actually moved off that stage in the DB.
 *
 * Ticking and confirming are done as two SEPARATE passes (tick both sides
 * first, then confirm both sides) rather than tick-then-confirm per side —
 * later stages have checklist items owned by only one role (e.g.
 * "Shooting completed" is creator-only), so if business confirms before the
 * creator's turn even arrives, business's confirm 409s on the still-pending
 * required item and is never retried, leaving the stage stuck with only one
 * side signed off. */
export async function bilateralAdvance(businessPage, creatorPage, baseUrl, projectId, stageKey) {
  await businessPage.goto(`${baseUrl}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitForProjectLoaded(businessPage);
  await tickPendingItems(businessPage, projectId, stageKey);

  await creatorPage.goto(`${baseUrl}/dashboard/projects/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitForProjectLoaded(creatorPage);
  await tickPendingItems(creatorPage, projectId, stageKey);

  // Re-load business's view so it reflects any items the creator just ticked
  // (owner_role='both' items ticked by the creator, or vice versa) before it
  // decides whether "Confirm this stage" is actually enabled.
  await businessPage.reload({ waitUntil: 'domcontentloaded' });
  await waitForProjectLoaded(businessPage);
  const bConfirm = businessPage.locator('button:has-text("Confirm this stage")').first();
  if (await bConfirm.count() > 0 && await bConfirm.isEnabled().catch(() => false)) {
    await bConfirm.click();
    await businessPage.waitForTimeout(1200);
  }

  await creatorPage.reload({ waitUntil: 'domcontentloaded' });
  await waitForProjectLoaded(creatorPage);
  const cConfirm = creatorPage.locator('button:has-text("Confirm this stage")').first();
  if (await cConfirm.count() > 0 && await cConfirm.isEnabled().catch(() => false)) {
    await cConfirm.click();
    await creatorPage.waitForTimeout(1200);
  }

  // The advance can commit a beat after the click resolves client-side —
  // poll briefly rather than reading a possibly-stale row immediately.
  let row = await getRow('campaign_projects', { id: projectId });
  for (let i = 0; i < 4 && row.current_stage === stageKey; i++) {
    await new Promise((r) => setTimeout(r, 800));
    row = await getRow('campaign_projects', { id: projectId });
  }
  return row;
}

/**
 * The stage checklist gate — materialisation and fail-closed evaluation.
 *
 * ── The bug this exists to close ──────────────────────────────────────────
 * project_stage_items rows were seeded LAZILY, by GET /api/projects/[id]/stage-items.
 * The advance/sign-off gate evaluated blockingItems() over whatever rows
 * happened to exist, so on a project whose checklist had never been fetched
 * there were ZERO rows, nothing to block on, and every gate was open —
 * including advance_payment and final_payment.
 *
 * The audit on 2026-08-08 drove a fresh project straight through the advance
 * payment gate with an empty payment ledger: two sign-offs, both 200, stage
 * moved to content_planning, `paid rows = 0`. The web dashboard never hit it
 * because it always fetches the checklist when it opens a project — the gate
 * was protected by a rendering side-effect rather than by a rule, and any
 * caller that skipped that fetch (mobile, a deep link, a retry after a failed
 * load, direct API use) walked through.
 *
 * ── The fix ───────────────────────────────────────────────────────────────
 * Two independent defences, because either alone can be defeated:
 *
 *   1. ensureStageItems() — the gate materialises the checklist itself before
 *      evaluating it. One code path, shared with the GET route, so the
 *      TypeScript DEFAULT_STAGE_ITEMS stays the single source of truth and no
 *      SQL copy can drift from it.
 *
 *   2. evaluateGate() — fails CLOSED. If a stage is DEFINED to have required
 *      items but the database returned none for it, that is a seeding failure,
 *      not an open gate, and the stage does not move.
 *
 * Note the existing fail-open comments elsewhere in this codebase ("Fail OPEN
 * if the checklist table isn't there yet"). That reasoning is correct for a
 * MISSING TABLE on an un-migrated database and wrong for ZERO ROWS on a live
 * one, and the old code could not tell those two cases apart. This module
 * distinguishes them explicitly: a missing table still degrades gracefully, an
 * empty checklist does not.
 */

import {
  DEFAULT_STAGE_ITEMS,
  buildDefaultStageItems,
  blockingItems,
  type StageItem,
} from './project-stage-items';
import type { Stage } from '@influnet/core';

/** Does this stage have required items by definition? */
export function stageHasRequiredItems(stageKey: string): boolean {
  const defaults = DEFAULT_STAGE_ITEMS[stageKey as Stage];
  return Array.isArray(defaults) && defaults.some((it) => it.is_required);
}

export interface GateResult {
  /** True when the project may leave this stage. */
  open: boolean;
  /** Human-readable labels of what is still pending (empty when open). */
  blocking: string[];
  /**
   * Set when the gate closed because the checklist could not be read or
   * materialised, rather than because a real item is outstanding. Callers use
   * it to return a different message — "we couldn't verify" is not the same as
   * "you haven't done it".
   */
  reason?: 'unavailable' | 'not_seeded';
}

/**
 * Make sure the project's checklist rows exist, then return them.
 *
 * Idempotent: the upsert relies on UNIQUE(project_id, stage_key, label), so
 * concurrent callers cannot produce duplicates and a re-seed is a no-op. RLS
 * restricts the insert to project participants, so this cannot be used by a
 * stranger to create rows.
 *
 * Returns `null` when the checklist genuinely cannot be read (table missing on
 * an un-migrated database) — distinct from `[]`, which would mean "read fine,
 * no rows", a state this function exists to prevent.
 */
export async function ensureStageItems(
  supabase: any,
  projectId: number | string,
): Promise<StageItem[] | null> {
  const { data: existing, error } = await supabase
    .from('project_stage_items')
    .select('*')
    .eq('project_id', projectId);

  if (error) {
    // PGRST205 = table not in the schema cache (migration 054 not applied).
    if (error.code === 'PGRST205') return null;
    return null;
  }
  if (existing && existing.length > 0) return existing as StageItem[];

  const { error: seedErr } = await supabase
    .from('project_stage_items')
    .upsert(buildDefaultStageItems(Number(projectId)), {
      onConflict: 'project_id,stage_key,label',
      ignoreDuplicates: true,
    });
  if (seedErr) return null;

  const { data: seeded, error: reErr } = await supabase
    .from('project_stage_items')
    .select('*')
    .eq('project_id', projectId);
  if (reErr) return null;
  return (seeded ?? []) as StageItem[];
}

/**
 * Evaluate the gate for `stageKey`, materialising the checklist first.
 *
 * `items === null` (checklist unreadable) keeps the historical fail-open
 * behaviour for an un-migrated database. `items === []` on a stage that should
 * have required items fails CLOSED — that is the case the audit exploited.
 */
export async function evaluateStageGate(
  supabase: any,
  projectId: number | string,
  stageKey: string,
): Promise<GateResult> {
  const items = await ensureStageItems(supabase, projectId);

  if (items === null) {
    // Table genuinely unavailable. Degrade rather than block every project on
    // a database that hasn't applied migration 054.
    return { open: true, blocking: [], reason: 'unavailable' };
  }

  const forStage = items.filter((it) => it.stage_key === stageKey);
  if (forStage.length === 0 && stageHasRequiredItems(stageKey)) {
    // Read succeeded, seeding ran, and this stage still has no rows. Something
    // is wrong with the checklist — refuse to treat that as "nothing pending".
    return {
      open: false,
      blocking: DEFAULT_STAGE_ITEMS[stageKey as Stage]
        .filter((it) => it.is_required)
        .map((it) => it.label),
      reason: 'not_seeded',
    };
  }

  const pending = blockingItems(stageKey, items);
  return { open: pending.length === 0, blocking: pending.map((it) => it.label) };
}

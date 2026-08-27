// Default checklist items per stage — the single source of truth for seeding
// public.project_stage_items (migration 054). Keep in sync with STAGES in
// project-lifecycle.ts. The gate rule (canAdvanceStage) is enforced server-side
// in the project PATCH `advance` action and mirrored in the UI.

import { STAGES, STAGE_FLOWS, type Stage, type StageFlow, type FlowKey } from './project-lifecycle';

export type OwnerRole = 'business' | 'creator' | 'both';

export interface StageItemSeed {
  label: string;
  owner_role: OwnerRole;
  is_required: boolean;
  is_gate: boolean;
}

// A persisted checklist row (subset of the DB shape the API returns).
export interface StageItem {
  id: string;
  project_id: number;
  stage_key: string;
  label: string;
  owner_role: OwnerRole;
  is_required: boolean;
  is_gate: boolean;
  position: number;
  done_at: string | null;
  done_by: string | null;
}

// ── Short-flow default checklist items ────────────────────────────────
const SHORT_STAGE_ITEMS: Record<string, StageItemSeed[]> = {
  quick_agreement: [
    { label: 'Scope confirmed by both parties', owner_role: 'both', is_required: true, is_gate: false },
    { label: 'Deliverables and timeline agreed', owner_role: 'both', is_required: true, is_gate: false },
  ],
  quick_delivery: [
    { label: 'Work delivered', owner_role: 'creator', is_required: true, is_gate: false },
    { label: 'Delivery confirmed by brand', owner_role: 'business', is_required: true, is_gate: false },
  ],
  quick_payment: [
    { label: 'Payment received', owner_role: 'business', is_required: true, is_gate: true },
  ],
  project_completed: [],
};

// Ordered default checklist for every stage. Required items gate advancement;
// gate items (payment/approval) are visually emphasized in the UI.
export const DEFAULT_STAGE_ITEMS: Record<string, StageItemSeed[]> = {
  collaboration_started: [
    { label: 'Both parties introduced', owner_role: 'both', is_required: false, is_gate: false },
    { label: 'Scope & goals aligned', owner_role: 'both', is_required: true, is_gate: false },
  ],
  project_discussion: [
    { label: 'Deliverables agreed in writing', owner_role: 'both', is_required: true, is_gate: false },
    { label: 'Budget & timeline confirmed', owner_role: 'both', is_required: true, is_gate: false },
  ],
  advance_payment: [
    { label: 'Advance / deposit received', owner_role: 'business', is_required: true, is_gate: true },
  ],
  content_planning: [
    { label: 'Content brief / plan shared', owner_role: 'creator', is_required: true, is_gate: false },
  ],
  content_confirmation: [
    { label: 'Brand approved the concept', owner_role: 'business', is_required: true, is_gate: true },
  ],
  shooting_in_progress: [
    { label: 'Shooting completed', owner_role: 'creator', is_required: true, is_gate: false },
  ],
  editing_in_progress: [
    { label: 'Editing completed', owner_role: 'creator', is_required: true, is_gate: false },
  ],
  sent_for_review: [
    { label: 'Draft submitted for review', owner_role: 'creator', is_required: true, is_gate: false },
  ],
  revisions: [
    { label: 'Requested revisions addressed', owner_role: 'creator', is_required: true, is_gate: false },
  ],
  final_approval: [
    { label: 'Brand approved final content', owner_role: 'business', is_required: true, is_gate: true },
  ],
  final_payment: [
    { label: 'Final payment received', owner_role: 'business', is_required: true, is_gate: true },
  ],
  project_completed: [],
};

// Build the flat seed payload for a project (positions assigned per stage).
// Flow-aware: short projects get only their 3 stages seeded, not all 12.
export function buildDefaultStageItems(projectId: number, flow?: StageFlow): Array<
  StageItemSeed & { project_id: number; stage_key: string; position: number }
> {
  const stages = flow?.stages ?? STAGES;
  const items = flow ? getFlowStageItems(flow) : DEFAULT_STAGE_ITEMS;
  const rows: Array<StageItemSeed & { project_id: number; stage_key: string; position: number }> = [];
  for (const stage of stages) {
    (items[stage] ?? []).forEach((item, i) => {
      rows.push({ ...item, project_id: projectId, stage_key: stage, position: i });
    });
  }
  return rows;
}

/** Get the stage items record for a given flow. */
export function getFlowStageItems(flow: StageFlow): Record<string, StageItemSeed[]> {
  if (flow.stages === STAGE_FLOWS.full.stages) return DEFAULT_STAGE_ITEMS;
  return SHORT_STAGE_ITEMS;
}

/**
 * Which stage in this flow is the money gate — the one a payment webhook
 * actually ticks (see /api/payments/webhook), as opposed to an approval gate
 * like `content_confirmation` or `final_approval` which also carry
 * `is_gate: true` but for a brand's sign-off, not a payment.
 *
 * Finding this BY NAME rather than by position
 * (`stages[stages.length - 2]`) matters because `short_pay_before` puts
 * payment SECOND and delivery last — "the stage before project_completed"
 * there is `quick_delivery`, not the payment stage at all. A position-based
 * lookup silently evaluates the wrong stage's checklist on that flow, so the
 * completion money check would pass by checking whether delivery happened,
 * not whether payment did.
 *
 * The full flow has three `is_gate` stages (content_confirmation,
 * final_approval, final_payment) — only the LAST one is ever a payment stage
 * in any flow this module defines, so this takes the last match, not the
 * first.
 */
export function paymentGateStage(flow: StageFlow): string | null {
  const items = getFlowStageItems(flow);
  let found: string | null = null;
  for (const stage of flow.stages) {
    if ((items[stage] ?? []).some((it) => it.is_gate && it.owner_role === 'business')) {
      found = stage;
    }
  }
  return found;
}

// Required items of a stage that are NOT yet done. Empty array => gate is open.
export function blockingItems(stageKey: string, items: StageItem[]): StageItem[] {
  return items.filter(
    (it) => it.stage_key === stageKey && it.is_required && !it.done_at,
  );
}

// Can the project move OUT of `stageKey`? True when no required item is pending.
export function canAdvanceStage(stageKey: string, items: StageItem[]): boolean {
  return blockingItems(stageKey, items).length === 0;
}

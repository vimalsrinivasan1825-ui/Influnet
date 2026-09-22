import { describe, it, expect } from 'vitest';
import { STAGE_FLOWS, type FlowKey } from '@influnet/core';
import { isSkippableStage } from '@/lib/project-stage-guide';
import { paymentGateStage } from '@/lib/project-stage-items';

/**
 * Two people can agree to skip a stage (propose → confirm). They must never be
 * able to skip a stage that moves money or that only one side may decide, in ANY
 * of the three flows. The E2E (phase 9) proves it through the API for the full
 * flow's advance payment; this pins every flow, every stage.
 */
const FLOWS = Object.keys(STAGE_FLOWS) as FlowKey[];
const PAYMENT_STAGES = new Set(['advance_payment', 'final_payment', 'quick_payment']);

describe.each(FLOWS)('flow %s', (key) => {
  const flow = STAGE_FLOWS[key];

  it('never allows a payment stage to be skipped', () => {
    const paymentStages = flow.stages.filter((st) => PAYMENT_STAGES.has(st));
    expect(paymentStages.length).toBeGreaterThan(0); // every flow has at least one payment stage
    for (const st of paymentStages) expect(isSkippableStage(st, flow), `${key}: ${st}`).toBe(false);
  });

  it('never allows the payment GATE stage (the one completion waits on) to be skipped', () => {
    const gate = paymentGateStage(flow);
    expect(gate).not.toBeNull(); // every flow has one
    expect(isSkippableStage(gate as string, flow)).toBe(false);
  });

  it('never allows the terminal stage to be skipped', () => {
    expect(isSkippableStage('project_completed', flow)).toBe(false);
  });

  it('only skips a stage that has exactly one next step (a skip cannot choose a branch)', () => {
    for (const st of flow.stages.filter((x) => isSkippableStage(x, flow))) {
      expect(flow.transitions[st]?.length, `${key}: ${st}`).toBe(1);
    }
  });
});

describe('the full flow: stages only one side decides can never be skipped', () => {
  it.each(['sent_for_review', 'revisions', 'final_approval'])('%s', (st) => {
    expect(isSkippableStage(st, STAGE_FLOWS.full)).toBe(false);
  });
});

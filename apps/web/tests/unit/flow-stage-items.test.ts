import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STAGE_ITEMS,
  buildDefaultStageItems,
  getFlowStageItems,
  blockingItems,
  canAdvanceStage,
  type StageItem,
} from '@/lib/project-stage-items';
import { STAGE_FLOWS, flowOf } from '@influnet/core';

function mk(partial: Partial<StageItem> & { stage_key: string }): StageItem {
  return {
    id: Math.random().toString(36).slice(2),
    project_id: 1,
    label: 'x',
    owner_role: 'both',
    is_required: true,
    is_gate: false,
    position: 0,
    done_at: null,
    done_by: null,
    ...partial,
  };
}

describe('short-flow stage items', () => {
  it('has items for every short-flow stage', () => {
    const shortItems = getFlowStageItems(STAGE_FLOWS.short_pay_after);
    for (const stage of STAGE_FLOWS.short_pay_after.stages) {
      expect(shortItems[stage]).toBeDefined();
    }
  });

  it('terminal stage has no required items', () => {
    const shortItems = getFlowStageItems(STAGE_FLOWS.short_pay_after);
    expect(shortItems.project_completed).toHaveLength(0);
  });

  it('quick_payment has a gate item', () => {
    const shortItems = getFlowStageItems(STAGE_FLOWS.short_pay_after);
    expect(shortItems.quick_payment.some((i) => i.is_gate)).toBe(true);
  });

  it('quick_agreement has required items for both parties', () => {
    const shortItems = getFlowStageItems(STAGE_FLOWS.short_pay_after);
    const agreement = shortItems.quick_agreement;
    expect(agreement.some((i) => i.is_required)).toBe(true);
    expect(agreement.some((i) => i.owner_role === 'both')).toBe(true);
  });
});

describe('buildDefaultStageItems with flow', () => {
  it('short_pay_after produces rows for 3 non-terminal stages', () => {
    const flow = STAGE_FLOWS.short_pay_after;
    const rows = buildDefaultStageItems(42, flow);
    const stageKeys = new Set(rows.map((r) => r.stage_key));
    // project_completed has no items, so 3 stages with rows
    expect(stageKeys.size).toBe(3);
    expect(stageKeys.has('quick_agreement')).toBe(true);
    expect(stageKeys.has('quick_delivery')).toBe(true);
    expect(stageKeys.has('quick_payment')).toBe(true);
    // Must NOT contain any full-flow stages
    expect(stageKeys.has('collaboration_started')).toBe(false);
    expect(stageKeys.has('advance_payment')).toBe(false);
  });

  it('short_pay_before produces rows for 3 non-terminal stages', () => {
    const flow = STAGE_FLOWS.short_pay_before;
    const rows = buildDefaultStageItems(42, flow);
    const stageKeys = new Set(rows.map((r) => r.stage_key));
    expect(stageKeys.size).toBe(3);
  });

  it('full flow without explicit flow produces rows for all non-terminal stages', () => {
    const rows = buildDefaultStageItems(42);
    const stageKeys = new Set(rows.map((r) => r.stage_key));
    // project_completed has no items, so 11 stages with rows
    expect(stageKeys.size).toBe(11);
    expect(stageKeys.has('collaboration_started')).toBe(true);
    expect(stageKeys.has('final_payment')).toBe(true);
  });
});

describe('short-flow gate logic', () => {
  it('blocks quick_agreement while required items are pending', () => {
    const items = [
      mk({ stage_key: 'quick_agreement', is_required: true, done_at: null }),
      mk({ stage_key: 'quick_agreement', is_required: true, done_at: new Date().toISOString() }),
    ];
    expect(blockingItems('quick_agreement', items)).toHaveLength(1);
    expect(canAdvanceStage('quick_agreement', items)).toBe(false);
  });

  it('opens quick_agreement gate once all required items are done', () => {
    const items = [
      mk({ stage_key: 'quick_agreement', is_required: true, done_at: new Date().toISOString() }),
      mk({ stage_key: 'quick_agreement', is_required: true, done_at: new Date().toISOString() }),
    ];
    expect(canAdvanceStage('quick_agreement', items)).toBe(true);
  });

  it('blocks quick_payment while gate item is not done', () => {
    const items = [
      mk({ stage_key: 'quick_payment', is_required: true, is_gate: true, done_at: null }),
    ];
    expect(blockingItems('quick_payment', items)).toHaveLength(1);
    expect(canAdvanceStage('quick_payment', items)).toBe(false);
  });

  it('opens quick_payment gate once the gate item is done', () => {
    const items = [
      mk({ stage_key: 'quick_payment', is_required: true, is_gate: true, done_at: new Date().toISOString() }),
    ];
    expect(canAdvanceStage('quick_payment', items)).toBe(true);
  });
});

describe('flowOf helper', () => {
  it('returns full flow for projects without flow_key', () => {
    const flow = flowOf({});
    expect(flow.stages.length).toBe(12);
  });

  it('returns full flow for null flow_key', () => {
    const flow = flowOf({ flow_key: null });
    expect(flow.stages.length).toBe(12);
  });

  it('returns short_pay_after flow', () => {
    const flow = flowOf({ flow_key: 'short_pay_after' });
    expect(flow.stages.length).toBe(4);
    expect(flow.stages[0]).toBe('quick_agreement');
  });

  it('returns short_pay_before flow', () => {
    const flow = flowOf({ flow_key: 'short_pay_before' });
    expect(flow.stages.length).toBe(4);
    expect(flow.stages[1]).toBe('quick_payment');
  });
});

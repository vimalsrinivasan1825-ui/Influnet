import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STAGE_ITEMS,
  buildDefaultStageItems,
  blockingItems,
  canAdvanceStage,
  type StageItem,
} from '@/lib/project-stage-items';
import { STAGES } from '@/lib/project-lifecycle';

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

describe('DEFAULT_STAGE_ITEMS', () => {
  it('has an entry for every stage', () => {
    for (const stage of STAGES) {
      expect(DEFAULT_STAGE_ITEMS[stage]).toBeDefined();
    }
  });

  it('terminal stage has no required items', () => {
    expect(DEFAULT_STAGE_ITEMS.project_completed).toHaveLength(0);
  });

  it('payment/approval gates are marked is_gate', () => {
    expect(DEFAULT_STAGE_ITEMS.advance_payment.some((i) => i.is_gate)).toBe(true);
    expect(DEFAULT_STAGE_ITEMS.final_payment.some((i) => i.is_gate)).toBe(true);
    expect(DEFAULT_STAGE_ITEMS.final_approval.some((i) => i.is_gate)).toBe(true);
  });
});

describe('buildDefaultStageItems', () => {
  it('produces rows for the project with correct stage keys and positions', () => {
    const rows = buildDefaultStageItems(42);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.project_id === 42)).toBe(true);
    // positions restart per stage
    const advance = rows.filter((r) => r.stage_key === 'advance_payment');
    expect(advance[0].position).toBe(0);
  });
});

describe('gate logic', () => {
  it('blocks advancement while a required item is pending', () => {
    const items = [
      mk({ stage_key: 'project_discussion', is_required: true, done_at: null }),
      mk({ stage_key: 'project_discussion', is_required: true, done_at: new Date().toISOString() }),
    ];
    expect(blockingItems('project_discussion', items)).toHaveLength(1);
    expect(canAdvanceStage('project_discussion', items)).toBe(false);
  });

  it('opens the gate once all required items are done', () => {
    const items = [
      mk({ stage_key: 'advance_payment', is_required: true, done_at: new Date().toISOString() }),
    ];
    expect(canAdvanceStage('advance_payment', items)).toBe(true);
  });

  it('ignores optional items and items from other stages', () => {
    const items = [
      mk({ stage_key: 'collaboration_started', is_required: false, done_at: null }),
      mk({ stage_key: 'project_discussion', is_required: true, done_at: null }),
    ];
    expect(canAdvanceStage('collaboration_started', items)).toBe(true);
  });
});

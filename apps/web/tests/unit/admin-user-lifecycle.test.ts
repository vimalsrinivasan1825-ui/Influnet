import { describe, expect, it } from 'vitest';
import { computeLifecycle, type LifecycleInput } from '@/lib/admin-user-lifecycle';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const ME = 'u-me';

function creator(over: Partial<LifecycleInput> = {}): LifecycleInput {
  return {
    role: 'influencer',
    userId: ME,
    createdAt: daysAgo(10),
    phoneVerifiedAt: daysAgo(10),
    profileComplete: true,
    verifiedAt: null,
    verifiedBadge: false,
    approvalStatus: null,
    lastSeenAt: daysAgo(1),
    projects: [],
    requests: [],
    firstPaidAt: null,
    campaignsPublished: 0,
    applicationsSent: 0,
    ...over,
  };
}

const brand = (over: Partial<LifecycleInput> = {}) =>
  creator({ role: 'business_owner', profileComplete: null, approvalStatus: 'approved', ...over });

describe('computeLifecycle', () => {
  it('a rejected business is rejected, whatever else is true', () => {
    const l = computeLifecycle(brand({ approvalStatus: 'rejected' }), NOW);
    expect(l.state).toBe('rejected');
    expect(l.tone).toBe('danger');
  });

  it('a brand awaiting review is told what it can and cannot do', () => {
    const l = computeLifecycle(brand({ approvalStatus: 'pending_review' }), NOW);
    expect(l.state).toBe('awaiting_approval');
    expect(l.detail).toMatch(/can send requests/i);
  });

  it('live work wins over pending approval', () => {
    const l = computeLifecycle(
      brand({
        approvalStatus: 'pending_review',
        projects: [{ status: 'active', current_stage: 'shooting_in_progress', created_at: daysAgo(3) }],
      }),
      NOW,
    );
    expect(l.state).toBe('in_project');
    expect(l.detail).toContain('shooting in progress');
  });

  it('a live project with an absent participant is flagged as stuck', () => {
    const l = computeLifecycle(
      creator({
        lastSeenAt: daysAgo(45),
        projects: [{ status: 'active', current_stage: 'sent_for_review', created_at: daysAgo(60) }],
      }),
      NOW,
    );
    expect(l.state).toBe('in_project');
    expect(l.tone).toBe('warn');
    expect(l.detail).toMatch(/Stuck at/);
  });

  it('never seen since a long-ago signup is dormant', () => {
    const l = computeLifecycle(creator({ createdAt: daysAgo(90), lastSeenAt: null }), NOW);
    expect(l.state).toBe('dormant');
    expect(l.daysSinceSeen).toBeNull();
  });

  it('a creator who has not finished onboarding is onboarding', () => {
    expect(computeLifecycle(creator({ profileComplete: false }), NOW).state).toBe('onboarding');
  });

  it('completed work with nothing live is a repeat candidate', () => {
    const l = computeLifecycle(
      creator({
        projects: [{ status: 'completed', current_stage: 'project_completed', created_at: daysAgo(8), completed_at: daysAgo(2) }],
        firstPaidAt: daysAgo(6),
      }),
      NOW,
    );
    expect(l.state).toBe('repeat_ready');
    expect(l.completedProjects).toBe(1);
    expect(l.milestones.find((m) => m.key === 'first_completed')?.at).toBe(daysAgo(2));
  });

  it('names the next missing milestone for someone set up with no deal', () => {
    const l = computeLifecycle(creator(), NOW);
    expect(l.state).toBe('exploring');
    expect(l.detail).toBe('Next step: verified.');
  });

  it('a brand counts outreach only from requests it sent', () => {
    const received = brand({ requests: [{ created_at: daysAgo(2), from_user: { id: 'someone-else' } }] });
    expect(computeLifecycle(received, NOW).milestones.find((m) => m.key === 'first_outreach')?.done).toBe(false);
    const sent = brand({ requests: [{ created_at: daysAgo(2), from_user: { id: ME } }] });
    expect(computeLifecycle(sent, NOW).milestones.find((m) => m.key === 'first_outreach')?.done).toBe(true);
  });

  it('a published campaign also counts as brand outreach', () => {
    const l = computeLifecycle(brand({ campaignsPublished: 1 }), NOW);
    expect(l.milestones.find((m) => m.key === 'first_outreach')?.done).toBe(true);
  });

  it('cancelled projects are neither live nor completed', () => {
    const l = computeLifecycle(
      creator({ projects: [{ status: 'cancelled', current_stage: 'advance_payment', created_at: daysAgo(4) }] }),
      NOW,
    );
    expect(l.activeProjects).toBe(0);
    expect(l.completedProjects).toBe(0);
    expect(l.milestones.find((m) => m.key === 'first_project')?.done).toBe(true);
  });
});

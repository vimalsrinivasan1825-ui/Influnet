import { describe, it, expect } from 'vitest';

/**
 * The labelling rules that went wrong on real data:
 *
 *   request 2548f639 "Product-Launch" (Jul 7)
 *     #1  "Product-Launch"        completed          collab_request_id = NULL
 *     #33 "New-Product-Promotion" pending_acceptance collab_request_id = 2548f639
 *
 * A pair reuses one collab request across successive deals, so a brand-new
 * proposal attached to that row must NOT restate the outcome of the deal that
 * already finished. Terms nobody accepted are not a project and never describe
 * a request's state.
 */

type Project = {
  id: number; status: string; collab_request_id: string | null;
  owner_user_id: string; counterparty_user_id: string; created_at: string;
};
type Request = { id: string; status: string; from_user_id: string; to_user_id: string };

// Mirrors the derivation in GET /api/collabs.
export function dealState(request: Request, allProjects: Project[]): string {
  const real = allProjects.filter((p) => p.status !== 'pending_acceptance');
  const key = (a: string, b: string) => [a, b].sort().join('|');
  const mine = real.filter(
    (p) => key(p.owner_user_id, p.counterparty_user_id) === key(request.from_user_id, request.to_user_id),
  );
  const exact = mine.find((p) => p.collab_request_id === request.id);
  const latest = [...mine].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const project = exact ?? latest ?? null;
  const open = mine.find((p) => p.status !== 'completed' && p.status !== 'cancelled');

  if (request.status !== 'accepted') return request.status;
  if (open) return 'in_progress';
  if (project?.status === 'completed') return 'completed';
  if (project?.status === 'cancelled') return 'project_cancelled';
  return 'in_discussion';
}

const BRAND = 'brand-id';
const CREATOR = 'creator-id';
const req: Request = { id: 'req-1', status: 'accepted', from_user_id: BRAND, to_user_id: CREATOR };

const completedProject: Project = {
  id: 1, status: 'completed', collab_request_id: null,
  owner_user_id: BRAND, counterparty_user_id: CREATOR, created_at: '2026-07-07',
};
const pendingTerms: Project = {
  id: 33, status: 'pending_acceptance', collab_request_id: 'req-1',
  owner_user_id: BRAND, counterparty_user_id: CREATOR, created_at: '2026-07-20',
};

describe('collab request deal state', () => {
  it('reports COMPLETED even when un-accepted terms hang off the same request', () => {
    // The exact regression: this returned "terms_pending" and the UI showed a
    // finished collaboration as "Terms awaiting approval".
    expect(dealState(req, [completedProject, pendingTerms])).toBe('completed');
  });

  it('finds a project created before collab_request_id existed (NULL link)', () => {
    expect(dealState(req, [completedProject])).toBe('completed');
  });

  it('reports an ongoing project as in_progress', () => {
    const active = { ...completedProject, id: 2, status: 'active' };
    expect(dealState(req, [active])).toBe('in_progress');
  });

  it('an ongoing project outranks a completed one for the same pair', () => {
    const active = { ...completedProject, id: 2, status: 'active', created_at: '2026-07-19' };
    expect(dealState(req, [completedProject, active])).toBe('in_progress');
  });

  it('is in_discussion when only un-accepted terms exist', () => {
    expect(dealState(req, [pendingTerms])).toBe('in_discussion');
  });

  it('never lets un-accepted terms count as an ongoing project', () => {
    expect(dealState(req, [pendingTerms])).not.toBe('in_progress');
  });

  it('passes through a request that was never accepted', () => {
    expect(dealState({ ...req, status: 'pending' }, [])).toBe('pending');
    expect(dealState({ ...req, status: 'declined' }, [])).toBe('declined');
  });

  it('ignores another pair’s projects', () => {
    const other = { ...completedProject, owner_user_id: 'someone', counterparty_user_id: 'else' };
    expect(dealState(req, [other])).toBe('in_discussion');
  });
});

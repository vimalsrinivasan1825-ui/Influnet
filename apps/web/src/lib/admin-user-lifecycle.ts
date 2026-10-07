/**
 * "Where is this person right now?" — the summary at the top of an admin user
 * page.
 *
 * The Journey tab answers "what happened, in order". This answers the question
 * an admin actually opens the page with: how far along is this account, is it
 * stuck, and on what. It is computed from rows the user API already loads, so
 * it is never out of step with the tabs below it.
 *
 * Pure on purpose: no database, no clock except `now`, so the rules are
 * unit-tested (tests/unit/admin-user-lifecycle.test.ts) rather than eyeballed.
 */

export type LifecycleRole = 'influencer' | 'business_owner' | string;

export interface LifecycleInput {
  role: LifecycleRole;
  createdAt: string;
  phoneVerifiedAt: string | null;
  /** Creators: onboarding finished / profile marked complete. */
  profileComplete: boolean | null;
  /** Creators: verified badge, or the date it was granted. */
  verifiedAt: string | null;
  verifiedBadge: boolean;
  /** Brands only. */
  approvalStatus: string | null;
  lastSeenAt: string | null;
  projects: { status: string; current_stage: string | null; created_at: string; completed_at?: string | null }[];
  requests: { created_at: string; from_user_id?: string | null; from_user?: { id: string } | null }[];
  userId: string;
  firstPaidAt: string | null;
  campaignsPublished: number;
  applicationsSent: number;
}

export interface Milestone {
  key: string;
  label: string;
  at: string | null;
  done: boolean;
}

export type LifecycleTone = 'ok' | 'warn' | 'danger' | 'neutral';

export interface Lifecycle {
  /** Stable key for the current state, e.g. 'awaiting_approval', 'in_project'. */
  state: string;
  headline: string;
  detail: string;
  tone: LifecycleTone;
  milestones: Milestone[];
  /** Days since signup, and since they were last seen (null = never). */
  daysSinceSignup: number;
  daysSinceSeen: number | null;
  activeProjects: number;
  completedProjects: number;
}

const DAY = 86_400_000;
/** No sign of life for this long reads as gone quiet. */
export const DORMANT_DAYS = 30;

const ACTIVE_PROJECT = new Set(['active', 'in_progress', 'pending_acceptance']);

function daysBetween(fromIso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / DAY));
}

function earliest(values: (string | null | undefined)[]): string | null {
  const ts = values.filter((v): v is string => !!v).sort();
  return ts[0] ?? null;
}

function prettyStage(stage: string | null): string {
  return stage ? stage.replace(/_/g, ' ') : 'unknown stage';
}

export function computeLifecycle(input: LifecycleInput, now: number = Date.now()): Lifecycle {
  const isBrand = input.role === 'business_owner';

  const sent = input.requests.filter(
    (r) => (r.from_user?.id ?? r.from_user_id) === input.userId,
  );
  const firstOutreach = earliest(sent.map((r) => r.created_at));
  const firstRequestAny = earliest(input.requests.map((r) => r.created_at));
  const live = input.projects.filter((p) => ACTIVE_PROJECT.has(p.status));
  const done = input.projects.filter((p) => p.status === 'completed');
  const firstProject = earliest(input.projects.map((p) => p.created_at));
  const firstCompleted = earliest(done.map((p) => p.completed_at ?? p.created_at));

  const milestones: Milestone[] = [
    { key: 'signed_up', label: 'Signed up', at: input.createdAt, done: true },
    { key: 'phone', label: 'Phone verified', at: input.phoneVerifiedAt, done: !!input.phoneVerifiedAt },
  ];
  if (isBrand) {
    milestones.push({
      key: 'approved',
      label: 'Business approved',
      at: null,
      done: input.approvalStatus === 'approved',
    });
    milestones.push({
      key: 'first_outreach',
      label: 'Reached out to a creator',
      at: firstOutreach,
      done: !!firstOutreach || input.campaignsPublished > 0,
    });
  } else {
    milestones.push({
      key: 'profile',
      label: 'Profile complete',
      at: null,
      done: !!input.profileComplete,
    });
    milestones.push({
      key: 'verified',
      label: 'Verified',
      at: input.verifiedAt,
      done: input.verifiedBadge || !!input.verifiedAt,
    });
    milestones.push({
      key: 'first_request',
      label: 'First request or application',
      at: firstRequestAny,
      done: !!firstRequestAny || input.applicationsSent > 0,
    });
  }
  milestones.push(
    { key: 'first_project', label: 'First project', at: firstProject, done: !!firstProject },
    { key: 'first_payment', label: 'First payment', at: input.firstPaidAt, done: !!input.firstPaidAt },
    { key: 'first_completed', label: 'First project completed', at: firstCompleted, done: !!firstCompleted },
  );

  const daysSinceSignup = daysBetween(input.createdAt, now);
  const daysSinceSeen = input.lastSeenAt ? daysBetween(input.lastSeenAt, now) : null;
  const dormant = daysSinceSeen === null ? daysSinceSignup >= DORMANT_DAYS : daysSinceSeen >= DORMANT_DAYS;

  const base = {
    milestones,
    daysSinceSignup,
    daysSinceSeen,
    activeProjects: live.length,
    completedProjects: done.length,
  };

  // Order matters: the first rule that matches is the state. Blocking
  // conditions first, then live work, then how far they got.
  if (isBrand && input.approvalStatus === 'rejected') {
    return { ...base, state: 'rejected', tone: 'danger', headline: 'Business rejected',
      detail: 'Can browse but cannot send requests or run campaigns until they resubmit and are approved.' };
  }
  if (live.length > 0) {
    const stages = [...new Set(live.map((p) => prettyStage(p.current_stage)))].slice(0, 3).join(', ');
    return { ...base, state: 'in_project', tone: dormant ? 'warn' : 'ok',
      headline: `In ${live.length} live project${live.length === 1 ? '' : 's'}`,
      detail: dormant
        ? `Stuck at: ${stages}. Not seen for ${daysSinceSeen ?? daysSinceSignup} days — a project may be waiting on them.`
        : `Currently at: ${stages}.` };
  }
  if (isBrand && input.approvalStatus === 'pending_review') {
    return { ...base, state: 'awaiting_approval', tone: 'warn', headline: 'Waiting for business approval',
      detail: `Signed up ${daysSinceSignup} day${daysSinceSignup === 1 ? '' : 's'} ago. Can send requests (shown as unverified) but cannot publish campaigns until approved.` };
  }
  if (dormant) {
    return { ...base, state: 'dormant', tone: 'neutral', headline: 'Gone quiet',
      detail: daysSinceSeen === null
        ? `Signed up ${daysSinceSignup} days ago and has no recorded sign-in since.`
        : `Last seen ${daysSinceSeen} days ago.` };
  }
  if (done.length > 0) {
    return { ...base, state: 'repeat_ready', tone: 'ok', headline: 'Has completed work, nothing live',
      detail: `${done.length} completed project${done.length === 1 ? '' : 's'}. A good candidate for a repeat deal.` };
  }
  if (!isBrand && !input.profileComplete) {
    return { ...base, state: 'onboarding', tone: 'warn', headline: 'Still setting up their profile',
      detail: 'Has not finished onboarding, so brands cannot properly evaluate them yet.' };
  }
  const nextStep = milestones.find((m) => !m.done);
  return { ...base, state: 'exploring', tone: 'neutral', headline: 'Set up, no deal yet',
    detail: nextStep ? `Next step: ${nextStep.label.toLowerCase()}.` : 'Every milestone reached.' };
}

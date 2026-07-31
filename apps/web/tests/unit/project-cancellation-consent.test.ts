/**
 * The two new rules migration 089 adds to enforce_project_consent() —
 * mirrored in JS so the attack scenarios are provable without a live
 * Postgres instance (Docker wasn't available while building this).
 *
 * This does NOT replace running the real migration; it validates that the
 * LOGIC transcribed into the trigger is sound before it ever touches SQL.
 * Any change to the trigger's rules 6/7 in the migration should be mirrored
 * here too, or this test silently stops meaning anything.
 */
import { describe, it, expect } from 'vitest';

interface ProjectRow {
  owner_user_id: string;
  counterparty_user_id: string;
  status: string;
  cancel_requested_by: string | null;
}

/**
 * Faithful port of rules 6 and 7 from enforce_project_consent()
 * (supabase/migrations/089_project_cancellation_hardening.sql). Returns null
 * on an allowed write, or the exception message Postgres would raise.
 */
function checkCancellationWrite(
  actor: string,
  old: ProjectRow,
  next: Partial<ProjectRow>,
): string | null {
  // Rule 6: requesting is only valid as yourself, one at a time.
  if (next.cancel_requested_by !== undefined && next.cancel_requested_by !== old.cancel_requested_by) {
    if (next.cancel_requested_by !== null) {
      if (old.cancel_requested_by !== null) {
        return 'consent_violation: a cancellation request is already pending';
      }
      if (next.cancel_requested_by !== actor) {
        return 'consent_violation: you can only submit a cancellation request as yourself';
      }
    }
  }

  // Rule 7: cancelling requires the OTHER side to have asked.
  if (next.status === 'cancelled' && old.status !== 'cancelled') {
    if (old.cancel_requested_by === null) {
      return 'consent_violation: cancellation requires the other party to have requested it first';
    }
    if (old.cancel_requested_by === actor) {
      return 'consent_violation: the requester cannot accept their own cancellation';
    }
  }

  return null;
}

const BASE: ProjectRow = {
  owner_user_id: 'brand-1',
  counterparty_user_id: 'creator-1',
  status: 'active',
  cancel_requested_by: null,
};

describe('the legitimate flow', () => {
  it('lets a participant request their own cancellation', () => {
    const result = checkCancellationWrite('creator-1', BASE, { cancel_requested_by: 'creator-1' });
    expect(result).toBeNull();
  });

  it('lets the OTHER side accept a pending request', () => {
    const requested = { ...BASE, cancel_requested_by: 'creator-1' };
    const result = checkCancellationWrite('brand-1', requested, { status: 'cancelled' });
    expect(result).toBeNull();
  });

  it('lets either side decline/withdraw by clearing the field', () => {
    const requested = { ...BASE, cancel_requested_by: 'creator-1' };
    expect(checkCancellationWrite('creator-1', requested, { cancel_requested_by: null })).toBeNull();
    expect(checkCancellationWrite('brand-1', requested, { cancel_requested_by: null })).toBeNull();
  });
});

describe('the attack this exists to stop: self-approved cancellation', () => {
  it('blocks accepting your own request outright', () => {
    const requested = { ...BASE, cancel_requested_by: 'creator-1' };
    const result = checkCancellationWrite('creator-1', requested, { status: 'cancelled' });
    expect(result).toMatch(/requester cannot accept their own/);
  });

  it('blocks forging status=cancelled with no request at all', () => {
    // The raw PostgREST bypass this migration's header describes: no request
    // ever existed, just a direct PATCH.
    const result = checkCancellationWrite('creator-1', BASE, { status: 'cancelled' });
    expect(result).toMatch(/requires the other party to have requested/);
  });

  it('blocks the two-step forgery: claim the OTHER side requested it, then accept as yourself', () => {
    // The attack: forge cancel_requested_by = <victim>, making it LOOK like
    // the victim asked to cancel, then accept as yourself. Rule 7 alone does
    // NOT stop this — it only checks that the accepter isn't the requester,
    // and here they genuinely aren't (attacker ≠ forged victim id). Proven
    // below: with the forged state already in place, rule 7 in isolation
    // waves the accept through.
    const forgedState = { ...BASE, cancel_requested_by: 'brand-1' }; // as if brand-1 had asked
    const acceptAfterForgery = checkCancellationWrite('creator-1', forgedState, { status: 'cancelled' });
    expect(acceptAfterForgery).toBeNull(); // rule 7 alone: not blocked — this is why rule 6 has to exist

    // Rule 6 is the actual stop: it fires on the forging step itself, before
    // the state above could ever legitimately be reached — you may only
    // write cancel_requested_by as the id you are.
    const forgeAttempt = checkCancellationWrite('creator-1', BASE, { cancel_requested_by: 'brand-1' });
    expect(forgeAttempt).toMatch(/only submit a cancellation request as yourself/);
  });

  it('blocks a second request overwriting an in-flight one', () => {
    const requested = { ...BASE, cancel_requested_by: 'creator-1' };
    const result = checkCancellationWrite('brand-1', requested, { cancel_requested_by: 'brand-1' });
    expect(result).toMatch(/already pending/);
  });
});

describe('project-cancellation reason helpers', () => {
  it('requires free text only for "other"', async () => {
    const { cancellationReasonRequiresText } = await import('@influnet/core');
    expect(cancellationReasonRequiresText('other')).toBe(true);
    expect(cancellationReasonRequiresText('budget_changed')).toBe(false);
  });

  it('labels every category and falls back for an unknown one', async () => {
    const { cancellationReasonLabel, CANCELLATION_REASONS } = await import('@influnet/core');
    for (const r of CANCELLATION_REASONS) {
      expect(cancellationReasonLabel(r.value)).toBe(r.label);
    }
    expect(cancellationReasonLabel('not_a_real_category')).toBe('No reason given');
    expect(cancellationReasonLabel(null)).toBe('No reason given');
  });
});

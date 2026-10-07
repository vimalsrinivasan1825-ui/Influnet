import { describe, it, expect } from 'vitest';
import { adminMfaProblem, hasVerifiedFactor } from '@/lib/api';

/**
 * The admin console's second-factor rule (withAdmin → adminMfaProblem).
 *
 * The case this exists for: before it, a factor an admin had enrolled was only
 * asked for when ADMIN_REQUIRE_MFA was on — so with the switch off (the
 * default), enrolling protected nothing and a stolen password still opened
 * every /api/admin route.
 */
describe('adminMfaProblem', () => {
  it('lets a two-factor session through, whatever the switch says', () => {
    expect(adminMfaProblem({ aal: 'aal2', hasVerifiedFactor: true, required: true })).toBeNull();
    expect(adminMfaProblem({ aal: 'aal2', hasVerifiedFactor: false, required: false })).toBeNull();
  });

  it('holds an enrolled admin to their factor even with the switch off', () => {
    expect(adminMfaProblem({ aal: 'aal1', hasVerifiedFactor: true, required: false })).toBe('mfa_required');
    expect(adminMfaProblem({ aal: null, hasVerifiedFactor: true, required: false })).toBe('mfa_required');
  });

  it('asks an unenrolled admin to enrol only once the switch is on', () => {
    expect(adminMfaProblem({ aal: 'aal1', hasVerifiedFactor: false, required: false })).toBeNull();
    expect(adminMfaProblem({ aal: 'aal1', hasVerifiedFactor: false, required: true })).toBe('mfa_enroll_required');
  });
});

describe('hasVerifiedFactor', () => {
  it('ignores a factor whose setup was abandoned', () => {
    expect(hasVerifiedFactor({ factors: [{ status: 'unverified' }] } as never)).toBe(false);
    expect(hasVerifiedFactor({ factors: undefined } as never)).toBe(false);
    expect(
      hasVerifiedFactor({ factors: [{ status: 'unverified' }, { status: 'verified' }] } as never),
    ).toBe(true);
  });
});

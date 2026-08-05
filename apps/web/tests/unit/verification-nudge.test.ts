import { describe, it, expect } from 'vitest';
import {
  decideVerificationNudge,
  verificationStateKey,
  type VerificationNudgeInput,
} from '@influnet/core';

/**
 * The reported bug, as a test.
 *
 * A creator completes the Instagram bio-link proof during signup, opens the
 * app, and Home tells them "Verify your Instagram — takes about a minute". The
 * proof was not lost; the app was deciding what to say from the Verified badge
 * alone, and the badge is granted by a scoring pipeline that also weighs
 * follower count and posting recency. Ownership-proven-but-not-yet-badged is
 * the NORMAL state for a new creator, and it was being rendered as "you have
 * not started".
 */
const base: VerificationNudgeInput = {
  status: 'in_review',
  badge: false,
  ownership_verified: true,
  score: 0.55,
};

describe('decideVerificationNudge', () => {
  it('does not send a bio-verified creator back to the bio-link task', () => {
    expect(decideVerificationNudge(base)).toBe('progress');
  });

  it('still asks for the proof when there is none on file', () => {
    expect(decideVerificationNudge({ ...base, ownership_verified: false })).toBe('action');
  });

  it('does not distinguish on status alone', () => {
    // `in_review` covers both "we never got your proof" and "your proof is in,
    // your numbers are thin". Same status, opposite advice — which is exactly
    // why the old badge-only reading got it wrong.
    const sameStatus = { ...base, status: 'in_review' as const };
    expect(decideVerificationNudge({ ...sameStatus, ownership_verified: true })).toBe('progress');
    expect(decideVerificationNudge({ ...sameStatus, ownership_verified: false })).toBe('action');
  });

  it('celebrates a granted badge exactly once', () => {
    const verified = { ...base, badge: true, status: 'verified' as const, score: 0.9 };
    expect(decideVerificationNudge(verified, { celebrated: false })).toBe('celebrate');
    expect(decideVerificationNudge(verified, { celebrated: true })).toBe('none');
  });

  it('lets the badge outrank a stale status, and vice versa', () => {
    // The two are written together but read from different rows, so a client
    // can hold one fresh and one cached. Either being positive means verified —
    // congratulating and nagging at the same time is the one unacceptable
    // outcome.
    expect(decideVerificationNudge({ ...base, badge: true })).toBe('celebrate');
    expect(decideVerificationNudge({ ...base, status: 'verified' })).toBe('celebrate');
  });

  it('says nothing when there is nothing to say', () => {
    expect(decideVerificationNudge(null)).toBe('none');
    expect(decideVerificationNudge(undefined)).toBe('none');
  });

  it('asks for proof from a creator who has never run a check', () => {
    expect(
      decideVerificationNudge({
        status: 'unverified',
        badge: false,
        ownership_verified: false,
        score: null,
      }),
    ).toBe('action');
  });
});

describe('verificationStateKey', () => {
  it('survives a re-run that changes nothing meaningful', () => {
    // Otherwise a dismissed card comes back on the next poll for a score that
    // moved by a thousandth.
    expect(verificationStateKey({ ...base, score: 0.5501 })).toBe(
      verificationStateKey({ ...base, score: 0.5499 }),
    );
  });

  it('changes when the proof lands, so the card returns saying something new', () => {
    expect(verificationStateKey({ ...base, ownership_verified: false })).not.toBe(
      verificationStateKey({ ...base, ownership_verified: true }),
    );
  });

  it('changes when the score moves enough to matter', () => {
    expect(verificationStateKey({ ...base, score: 0.55 })).not.toBe(
      verificationStateKey({ ...base, score: 0.72 }),
    );
  });
});

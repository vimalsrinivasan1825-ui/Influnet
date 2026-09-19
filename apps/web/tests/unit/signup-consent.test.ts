import { describe, it, expect } from 'vitest';
import { RegisterProfileSchema } from '@/lib/validators';
import { TERMS_VERSION } from '@influnet/core';
import { consentProblem, consentVersion, stripConsentFields } from '@/lib/signup-consent';

/**
 * A signup must carry BOTH the Terms/Privacy acceptance and the 18+
 * confirmation. The server enforces it (POST /api/auth/register), so a client
 * that skips the checkboxes still cannot open an account.
 */
describe('consentProblem', () => {
  it('passes only when both flags are the boolean true', () => {
    expect(consentProblem({ termsAccepted: true, ageConfirmed: true })).toBeNull();
  });

  it('refuses a signup with neither flag, as a 422 consent_required', () => {
    const p = consentProblem({ role: 'influencer' });
    expect(p).not.toBeNull();
    expect(p!.status).toBe(422);
    expect(p!.reason).toBe('consent_required');
    expect(p!.error).toMatch(/Terms and Privacy Policy/);
    expect(p!.error).toMatch(/18 or older/);
  });

  it('names exactly what is missing', () => {
    expect(consentProblem({ termsAccepted: true, ageConfirmed: false })!.error).toMatch(/18 or older/);
    expect(consentProblem({ termsAccepted: true, ageConfirmed: false })!.error).not.toMatch(/Terms/);
    expect(consentProblem({ termsAccepted: false, ageConfirmed: true })!.error).toMatch(/Terms and Privacy Policy/);
    expect(consentProblem({ termsAccepted: false, ageConfirmed: true })!.error).not.toMatch(/18/);
  });

  it.each([
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['the string "on"', 'on'],
    ['an object', {}],
    ['null', null],
  ])('does not count %s as consent', (_label, value) => {
    expect(consentProblem({ termsAccepted: value, ageConfirmed: true })).not.toBeNull();
    expect(consentProblem({ termsAccepted: true, ageConfirmed: value })).not.toBeNull();
  });
});

describe('consentVersion / stripConsentFields', () => {
  it('records the version the client showed, else the current one', () => {
    expect(consentVersion({ termsVersion: ' 2026-10-01 ' })).toBe('2026-10-01');
    expect(consentVersion({})).toBe(TERMS_VERSION);
    expect(consentVersion({ termsVersion: '   ' })).toBe(TERMS_VERSION);
    expect(consentVersion({ termsVersion: 42 })).toBe(TERMS_VERSION);
  });

  it('removes all three fields so they never reach register_profile', () => {
    const payload: Record<string, unknown> = { name: 'A', termsAccepted: true, ageConfirmed: true, termsVersion: 'v' };
    stripConsentFields(payload);
    expect(payload).toEqual({ name: 'A' });
  });
});

describe('RegisterProfileSchema still accepts a consent-bearing payload', () => {
  it('parses an influencer payload with the consent fields and keeps them for the route to read', () => {
    const r = RegisterProfileSchema.safeParse({
      role: 'influencer', name: 'Priya', username: 'priya', instagramHandle: 'priya',
      termsAccepted: true, ageConfirmed: true, termsVersion: TERMS_VERSION,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).termsAccepted).toBe(true);
      expect((r.data as Record<string, unknown>).ageConfirmed).toBe(true);
    }
  });

  it('rejects a non-boolean flag at the schema level too', () => {
    const r = RegisterProfileSchema.safeParse({ role: 'business_owner', name: 'Acme', termsAccepted: 'yes' });
    expect(r.success).toBe(false);
  });
});

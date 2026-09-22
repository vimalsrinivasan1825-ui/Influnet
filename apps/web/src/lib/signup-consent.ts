import { TERMS_VERSION } from '@influnet/core';

/**
 * Signup consent: the person accepted the Terms + Privacy Policy and confirmed
 * they are 18 or older (Apple 5.1.1 / 1.2, Google UGC policy, DPDP, and our own
 * Terms). Enforced HERE, on the server, because a wizard is only a suggestion:
 * anyone can POST /api/auth/register directly.
 *
 * Both flags must be the boolean `true` — the string "true", 1 or "on" are not
 * consent. The wizards send them as part of the same payload that becomes auth
 * metadata, so the "recover a signup from metadata" path (email confirmation on)
 * carries them too.
 */
export type ConsentProblem = {
  status: 422;
  reason: 'consent_required';
  error: string;
};

export function consentProblem(payload: Record<string, unknown>): ConsentProblem | null {
  const terms = payload.termsAccepted === true;
  const age = payload.ageConfirmed === true;
  if (terms && age) return null;
  const missing =
    !terms && !age
      ? 'accept the Terms and Privacy Policy and confirm you are 18 or older'
      : !terms
        ? 'accept the Terms and Privacy Policy'
        : 'confirm you are 18 or older';
  return {
    status: 422,
    reason: 'consent_required',
    error: `To create an account you need to ${missing}.`,
  };
}

/** The version recorded: what the client says it showed, falling back to the current one. */
export function consentVersion(payload: Record<string, unknown>): string {
  const v = typeof payload.termsVersion === 'string' ? payload.termsVersion.trim() : '';
  return v || TERMS_VERSION;
}

/** The consent fields must never reach register_profile or the profile tables. */
export function stripConsentFields(payload: Record<string, unknown>): void {
  delete payload.termsAccepted;
  delete payload.ageConfirmed;
  delete payload.termsVersion;
}

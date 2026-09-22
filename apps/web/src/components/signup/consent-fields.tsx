"use client";

/**
 * The two boxes every signup must tick: accept the Terms + Privacy Policy, and
 * confirm being 18 or older. Both signup wizards render this on their LAST step
 * and gate "Create account" on `consentComplete()`.
 *
 * This is only the visible half. The server (POST /api/auth/register) refuses a
 * signup without both, so a client that skips this UI still cannot open an
 * account. The mobile wizards have the same fields
 * (apps/mobile/components/consent-fields.tsx) — same rules, same words.
 */

import Link from "next/link";
import { TERMS_VERSION } from "@influnet/core";

export interface ConsentState {
  terms: boolean;
  age: boolean;
}

export const NO_CONSENT: ConsentState = { terms: false, age: false };

export function consentComplete(c: ConsentState): boolean {
  return c.terms && c.age;
}

/** The fields the register payload carries; the server records the time. */
export function consentPayload(c: ConsentState): { termsAccepted: boolean; ageConfirmed: boolean; termsVersion: string } {
  return { termsAccepted: c.terms, ageConfirmed: c.age, termsVersion: TERMS_VERSION };
}

export function ConsentFields({
  value,
  onChange,
  disabled,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  disabled?: boolean;
}) {
  const link = "font-semibold text-content underline decoration-brand underline-offset-2 hover:text-brand";
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-muted p-4" disabled={disabled}>
      <legend className="sr-only">Terms and age confirmation</legend>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-content-soft">
        <input
          id="consent-terms"
          type="checkbox"
          checked={value.terms}
          onChange={(e) => onChange({ ...value, terms: e.target.checked })}
          className="mt-0.5 size-4 shrink-0 rounded border-hairline-strong accent-[var(--brand)]"
        />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className={link}>
            Terms of Service
          </Link>{" "}
          and the{" "}
          <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className={link}>
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-content-soft">
        <input
          id="consent-age"
          type="checkbox"
          checked={value.age}
          onChange={(e) => onChange({ ...value, age: e.target.checked })}
          className="mt-0.5 size-4 shrink-0 rounded border-hairline-strong accent-[var(--brand)]"
        />
        <span>I am 18 years of age or older.</span>
      </label>
    </fieldset>
  );
}

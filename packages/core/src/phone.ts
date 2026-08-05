/**
 * One rule for what an Indian mobile number IS, shared by web and mobile.
 *
 * Before this, "is this a real phone number" was answered three different ways
 * in three different places, and none of them actually answered it:
 *
 *   - the web signup field only checked `digits.length >= 10` — no upper
 *     bound, so a 26-digit paste passed
 *   - RegisterProfileSchema (and every other profile schema) had
 *     `phone: z.string().optional()` — no format check AT ALL, so the one
 *     place actually enforced server-side accepted anything, including a
 *     string of letters
 *   - /api/auth/check-phone had the same lower-bound-only check, so it
 *     reported the 26-digit garbage as "Mobile is available"
 *
 * India-only, matching the product (2Factor OTP is an Indian provider, the
 * signup field is fixed to +91). A real Indian mobile number is exactly 10
 * digits starting 6-9; this accepts the shapes people and forms actually
 * produce and reduces them all to that.
 *
 * Separate from `public.normalize_indian_phone()` (migration 022, used only by
 * the OTP send/verify path) — that function is deliberately looser, accepting
 * any 10-15 digit string as a fallback so a non-Indian number typed into the
 * OTP field doesn't hard-fail before reaching the provider. This module is the
 * stricter, product-wide rule: everything that ISN'T the OTP provider call
 * should refuse what a real Indian mobile number cannot be.
 */

const INDIA_CC = '91';
const INDIA_MOBILE_RE = /^[6-9]\d{9}$/;

/** The 10-digit local number this input reduces to, or null if it can't. */
function localDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith(INDIA_CC)) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

/** Last 10 digits, the comparison key for availability checks (migration 107). */
export function phoneKey(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '').slice(-10);
}

/** Is this a real Indian mobile number, in any shape a person would type it? */
export function isValidIndianPhone(raw: string | null | undefined): boolean {
  const local = localDigits(raw);
  return local !== null && INDIA_MOBILE_RE.test(local);
}

/**
 * '+91XXXXXXXXXX' from any of the shapes a person or a form actually produces.
 *
 * Anything that isn't a recognisable Indian mobile number is returned trimmed
 * and otherwise untouched: this normalises, it does not validate, and silently
 * mangling an unexpected number into a wrong one is worse than storing it as
 * given. Callers that need to REJECT bad input should check
 * `isValidIndianPhone` first — `PhoneSchema` in validators.ts does both.
 */
export function toE164India(phone: string): string {
  const local = localDigits(phone);
  return local ? `+${INDIA_CC}${local}` : phone.trim();
}

/**
 * What a phone FIELD should let someone type, character by character —
 * digits, a leading +, and the punctuation people use to space a number out
 * (space, dash, parens). Everything else — letters included — is dropped as
 * it is typed rather than caught later at submit.
 *
 * This is deliberately permissive about digit COUNT: it is a keystroke filter,
 * not the validator. `isValidIndianPhone` is what decides whether the result
 * is a real number; this only decides whether a keystroke is the kind of
 * character a phone number is ever made of.
 */
export function sanitizePhoneInput(raw: string): string {
  return raw.replace(/[^\d+\-\s()]/g, '');
}

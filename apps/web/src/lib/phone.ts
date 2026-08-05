/**
 * One spelling of a phone number.
 *
 * Two clients wrote the same number three ways — '+91 8270942966' (mobile
 * signup), '8270942966' (web form), '+918270942966' (older rows) — and the
 * signup availability check compared the raw strings, so a number already
 * registered on one client read as free on the other.
 *
 * The database side of that is migration 107, which normalises on READ so the
 * rows already written stay findable. This is the write side: everything new
 * goes in as E.164.
 *
 * India-only, matching the product (2Factor is an Indian provider, the signup
 * field is fixed to +91). `phoneKey` is the TypeScript twin of the SQL
 * `phone_key()` — if one changes, change both.
 */

const INDIA_CC = '91';

/** Last 10 digits, the comparison key. Mirrors public.phone_key() in SQL. */
export function phoneKey(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '').slice(-10);
}

/**
 * '+91XXXXXXXXXX' from any of the shapes a person or a form actually produces.
 *
 * Anything that isn't a recognisable Indian mobile number is returned trimmed
 * and otherwise untouched: this normalises, it does not validate, and silently
 * mangling an unexpected number into a wrong one is worse than storing it as
 * given. Validation lives in the signup schema.
 */
export function toE164India(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+${INDIA_CC}${digits}`;
  if (digits.length === 12 && digits.startsWith(INDIA_CC)) return `+${digits}`;
  // 0-prefixed STD dialling, e.g. 08270942966.
  if (digits.length === 11 && digits.startsWith('0')) return `+${INDIA_CC}${digits.slice(1)}`;
  return phone.trim();
}

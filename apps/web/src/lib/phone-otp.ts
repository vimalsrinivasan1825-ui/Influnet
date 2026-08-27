/**
 * Phone OTP (2Factor) — server-side glue.
 *
 * The provider API key lives ONLY as a Supabase Edge Function secret
 * (`TWOFACTOR_API_KEY`). Nothing here — and nothing in the browser — ever sees
 * it: we proxy to the `phone-otp` Edge Function, which owns the provider call,
 * the rate-limit RPCs and the audit log.
 *
 * See docs/operations/PHONE_OTP.md.
 */
import { createClient } from '@supabase/supabase-js';
import { flag } from './feature-flags';

/**
 * Whether phone verification is live. Defaults to OFF: until the Edge Function
 * is deployed and `TWOFACTOR_API_KEY` is set, enabling the signup gate would
 * lock every new user out, so this must be turned on deliberately.
 *
 * Resolved from the `feature_flags` table (migration 137), falling back to the
 * `PHONE_OTP_ENABLED` / `NEXT_PUBLIC_PHONE_OTP_ENABLED` env var. The browser no
 * longer reads the build-time constant — the signup wizard fetches
 * /api/auth/config, which calls flagFresh('phone_otp'), so this flips at
 * runtime for web and mobile alike.
 */
export function phoneOtpEnabled(): boolean {
  return flag('phone_otp');
}

/** Calls the `phone-otp` Edge Function and passes its response straight back. */
export async function callPhoneOtpFunction(
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anonKey) {
    return { status: 500, data: { error: 'Supabase is not configured.' } };
  }

  try {
    const res = await fetch(`${base}/functions/v1/phone-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
      // The provider round-trip is the slow part; fail fast rather than hanging
      // the signup form.
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    // Anything that isn't the function's own `{ error }` shape is infrastructure
    // talking, not the product: an undeployed function answers
    // `{"code":"NOT_FOUND","message":"Requested function was not found"}`, and a
    // missing TWOFACTOR_API_KEY surfaces as a raw 500. Showing either to someone
    // mid-signup is meaningless and leaks deployment detail, so normalise it —
    // while logging the real thing for whoever has to fix it.
    if (!res.ok && typeof data.error !== 'string') {
      console.error('phone-otp function error:', res.status, JSON.stringify(data));
      return {
        status: 503,
        data: {
          error: 'Mobile verification is temporarily unavailable. Please try again later.',
        },
      };
    }

    return { status: res.status, data };
  } catch {
    return {
      status: 502,
      data: { error: 'Verification service unavailable. Try again shortly.' },
    };
  }
}

export type PhoneVerificationCheck =
  | { ok: true; phoneE164: string }
  | { ok: false; error: string };

/**
 * Server-side proof that this phone number was OTP-verified in the last 30
 * minutes. The token is minted by the Edge Function on a successful verify and
 * checked here against `phone_otp_sessions` — a client claiming
 * `phoneVerified: true` proves nothing, so callers must use this.
 */
export async function validatePhoneVerification(
  token: string | undefined | null,
  phone: string | undefined | null,
): Promise<PhoneVerificationCheck> {
  if (!token || !phone) {
    return { ok: false, error: 'Mobile number is not verified.' };
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await sb.rpc('validate_phone_verification_token', {
    p_token: token,
    p_phone: phone,
  });

  if (error) {
    console.error('validate_phone_verification_token failed:', error.message);
    return { ok: false, error: 'Could not confirm mobile verification.' };
  }

  const result = (data ?? {}) as { ok?: boolean; phoneE164?: string; error?: string };
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === 'token_invalid_or_expired'
          ? 'Mobile verification expired. Verify your number again.'
          : 'Mobile number is not verified.',
    };
  }

  return { ok: true, phoneE164: String(result.phoneE164) };
}

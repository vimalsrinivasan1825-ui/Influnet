import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { phoneOtpEnabled } from '@/lib/phone-otp';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/auth/pending-registration
 *
 * Called by the web signup wizards when email confirmation is required and
 * signUp therefore returns no session (so register_profile can't run yet).
 * The only secret the recovery path needs — the 30-minute phone-OTP token —
 * is stored server-side here, never in the browser. This is what removes the
 * "Clear text storage of sensitive information" CodeQL finding on the signup
 * pages, and it lets the confirmation be completed from any device (the
 * token is tied to the phone number, not the browser tab).
 *
 * The rest of the signup payload already lives on the auth user as
 * user_metadata (the wizards pass it as signUp `options.data`), so it is NOT
 * stored here. On first login, /api/auth/register rebuilds the profile from
 * that metadata and spends this row's token; the row is then deleted.
 *
 * The write goes through the SECURITY DEFINER RPC store_pending_registration,
 * which rejects any token that was never verified for the stated phone.
 */
export async function POST(req: Request) {
  try {
    // Account registration is a high-impact, abuse-prone action — keep this
    // endpoint on the same budget as /api/auth/register.
    const limited = await enforceRateLimit(req, {
      bucket: 'auth:pending-registration', limit: 10, windowMs: 60_000,
    });
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : null;
    const phone = typeof body.phone === 'string' ? body.phone : null;
    const token = typeof body.phone_verification_token === 'string' ? body.phone_verification_token : null;

    if (!userId || !UUID_RE.test(userId)) {
      return jsonError(400, 'Missing or invalid user id');
    }
    // The token exists only when the OTP gate is on; otherwise the replay is
    // metadata-only and no token is needed.
    if (phoneOtpEnabled() && (!phone || !token)) {
      return jsonError(400, 'Missing phone verification details');
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await supabase.rpc('store_pending_registration', {
      p_user_id: userId,
      p_phone: phone,
      p_token: token,
    });
    if (error) {
      return jsonError(500, 'Could not save your signup details', error);
    }

    const result = (data ?? {}) as { ok?: boolean; reason?: string };
    if (!result.ok) {
      if (result.reason === 'token_invalid_or_expired') {
        return jsonError(403, 'Mobile verification expired. Verify your number again.', undefined);
      }
      return jsonError(400, 'Could not save your signup details');
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Could not save your signup details', error);
  }
}

import { NextResponse } from 'next/server';
import { flagFresh } from '@/lib/feature-flags';

/**
 * Public, unauthenticated signup configuration.
 *
 * This is how BOTH clients learn the phone-OTP state at runtime. A shipped
 * mobile binary can't read an env var, and the web bundle used to bake in
 * NEXT_PUBLIC_PHONE_OTP_ENABLED — so flipping the gate meant a rebuild. Now the
 * web signup wizard fetches this too (see components/signup/phone-otp-field),
 * and the value comes from the `feature_flags` table (migration 137), so one
 * dashboard toggle reaches every client.
 *
 * `flagFresh` rather than `flag`: this endpoint is the source of truth for the
 * clients, so it forces a load when its 45s snapshot is stale instead of
 * possibly serving a value that's a few seconds behind a just-made change.
 *
 * Exposes only booleans — no keys, no provider details.
 */
export async function GET() {
  return NextResponse.json(
    { phoneOtpEnabled: await flagFresh('phone_otp') },
    // Short cache: long enough to keep wizard launches cheap, short enough that
    // flipping the flag takes effect in about a minute.
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

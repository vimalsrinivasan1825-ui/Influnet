import { NextResponse } from 'next/server';
import { phoneOtpEnabled } from '@/lib/phone-otp';

/**
 * Public, unauthenticated signup configuration.
 *
 * This exists for the mobile app. Web reads NEXT_PUBLIC_* directly at build
 * time, but a shipped binary can't: if mobile baked the OTP flag in, every
 * already-installed build would start failing signup the moment the gate was
 * switched on server-side (register would 403 on a number the app never asked
 * to verify). Reading it at runtime keeps one binary correct either way.
 *
 * Exposes only booleans — no keys, no provider details.
 */
export function GET() {
  return NextResponse.json(
    { phoneOtpEnabled: phoneOtpEnabled() },
    // Short cache: long enough to keep wizard launches cheap, short enough that
    // flipping the flag takes effect in about a minute.
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

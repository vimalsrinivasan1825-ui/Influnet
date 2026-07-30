import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { callPhoneOtpFunction, phoneOtpEnabled } from '@/lib/phone-otp';

/**
 * Sends a 6-digit OTP to a mobile number via the `phone-otp` Edge Function
 * (2Factor AUTOGEN). Unauthenticated by design — this runs during signup,
 * before an account exists.
 *
 * Two layers of throttling: this IP bucket, plus the per-number limits the
 * `phone_otp_send_allowed` RPC enforces (5/hour + a 30s cooldown). The IP
 * bucket stops one host cycling through many numbers; the RPC stops one number
 * being hammered from many hosts.
 */
export async function POST(req: Request) {
  if (!phoneOtpEnabled()) {
    return NextResponse.json(
      { error: 'Mobile verification is not enabled.' },
      { status: 503 },
    );
  }

  const limited = await enforceRateLimit(req, {
    bucket: 'phone-otp:send',
    limit: 8,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  let body: { phone?: unknown; purpose?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const phone = String(body.phone ?? '').trim();
  if (phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'Enter a valid mobile number.' }, { status: 400 });
  }

  // 'signup' is the only purpose a public caller may claim; anything else
  // (profile change, login) must come from an authenticated flow.
  const { status, data } = await callPhoneOtpFunction({
    action: 'send',
    phone,
    purpose: 'signup',
  });

  return NextResponse.json(data, { status });
}

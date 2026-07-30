import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { callPhoneOtpFunction, phoneOtpEnabled } from '@/lib/phone-otp';

/**
 * Verifies a 6-digit OTP. On success the Edge Function returns a
 * `verificationToken` that /api/auth/register re-checks server-side — the
 * browser never gets to assert "verified" on its own.
 *
 * Per-session attempt limiting (5 tries, then the session is burned) lives in
 * the `phone_otp_register_verify_attempt` RPC; the bucket here is a coarse
 * per-IP backstop.
 */
export async function POST(req: Request) {
  if (!phoneOtpEnabled()) {
    return NextResponse.json(
      { error: 'Mobile verification is not enabled.' },
      { status: 503 },
    );
  }

  const limited = await enforceRateLimit(req, {
    bucket: 'phone-otp:verify',
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  let body: { phone?: unknown; otp?: unknown; providerSessionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const otp = String(body.otp ?? '').replace(/\D/g, '');
  if (otp.length !== 6) {
    return NextResponse.json(
      { error: 'Enter the 6-digit verification code.' },
      { status: 400 },
    );
  }

  const { status, data } = await callPhoneOtpFunction({
    action: 'verify',
    phone: String(body.phone ?? '').trim(),
    otp,
    providerSessionId: String(body.providerSessionId ?? ''),
  });

  return NextResponse.json(data, { status });
}

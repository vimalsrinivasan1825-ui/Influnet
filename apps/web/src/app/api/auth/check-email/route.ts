import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { serviceRoleClient } from '@/lib/supabase/service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, {
    bucket: 'auth:check-email',
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const raw = new URL(req.url).searchParams.get('email') ?? '';
  const email = raw.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({
      available: false,
      valid: false,
      reason: 'Invalid email format',
    });
  }

  try {
    // Service role, not anon: check_email_available is revoked from anon
    // (migration 201) so the rate limit above is the only way to reach it.
    const supabase = serviceRoleClient();
    if (!supabase) return jsonError(503, 'Could not check email availability');

    const { data, error } = await supabase.rpc('check_email_available', {
      p_email: email,
    });

    if (error) {
      return jsonError(500, 'Could not check email availability', error);
    }

    return NextResponse.json({ available: data === true, valid: true });
  } catch (error) {
    return jsonError(500, 'Could not check email availability', error);
  }
}

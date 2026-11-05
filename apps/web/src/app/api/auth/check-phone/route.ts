import { NextResponse } from 'next/server';
import { isValidIndianPhone } from '@influnet/core';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { serviceRoleClient } from '@/lib/supabase/service';

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, {
    bucket: 'auth:check-phone',
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const raw = new URL(req.url).searchParams.get('phone') ?? '';
  const phone = raw.replace(/\s+/g, '');

  // Used to be `digitsOnly.length < 10` — a LOWER bound only, so a 26-digit
  // paste (or one with letters mixed in, since \D stripping quietly dropped
  // them) had enough digits left to pass and came back "Mobile is available".
  // isValidIndianPhone is the same real-number check PhoneSchema enforces at
  // registration — this route reporting something as valid that registration
  // would then reject is its own bug, so both read the one rule now.
  if (!isValidIndianPhone(phone)) {
    return NextResponse.json({
      available: false,
      valid: false,
      reason: 'Enter a valid 10-digit mobile number',
    });
  }

  try {
    // Service role, not anon: check_phone_available is revoked from anon
    // (migration 201) so the rate limit above is the only way to reach it.
    const supabase = serviceRoleClient();
    if (!supabase) return jsonError(503, 'Could not check phone availability');

    const { data, error } = await supabase.rpc('check_phone_available', {
      p_phone: phone,
    });

    if (error) {
      return jsonError(500, 'Could not check phone availability', error);
    }

    return NextResponse.json({ available: data === true, valid: true });
  } catch (error) {
    return jsonError(500, 'Could not check phone availability', error);
  }
}

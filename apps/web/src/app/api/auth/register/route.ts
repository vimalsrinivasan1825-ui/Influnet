import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RegisterProfileSchema } from '@/lib/validators';
import { enforceRateLimit } from '@/lib/rate-limit';
import { phoneOtpEnabled, validatePhoneVerification } from '@/lib/phone-otp';

export async function POST(req: Request) {
  try {
    // Rate limit: account registration is a high-impact action.
    const limited = await enforceRateLimit(req, {
      bucket: 'auth:register', limit: 10, windowMs: 60_000,
    });
    if (limited) return limited;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const rawPayload = await req.json();

    // Validate the body — role is guaranteed to be business_owner | influencer after this.
    // 'admin' is not an accepted value and will cause a 400.
    const parsed = RegisterProfileSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid registration payload', details: parsed.error.format() },
        { status: 400 }
      );
    }
    const payload = parsed.data; // role is now guaranteed: business_owner | influencer

    // SECURITY: never let the client set its own approval status. The schema
    // accepts (and .passthrough() would forward) `approvalStatus`, and the
    // register_profile RPC reads it — so without this strip a caller could POST
    // `approvalStatus: 'approved'` and self-approve their business, bypassing
    // admin review. Approval is server-authoritative only (admin flow / RPC).
    if ('approvalStatus' in payload) {
      delete (payload as Record<string, unknown>).approvalStatus;
    }

    // SECURITY: mobile verification is enforced HERE, not in the wizard UI.
    // The client sends a token minted by the phone-otp Edge Function after a
    // real 2Factor match; we re-check it against phone_otp_sessions so a caller
    // who skips the UI (or POSTs this endpoint directly) still can't register
    // with an unverified number.
    const phoneToken = (payload as Record<string, unknown>).phoneVerificationToken;
    delete (payload as Record<string, unknown>).phoneVerificationToken;

    if (phoneOtpEnabled()) {
      const check = await validatePhoneVerification(
        typeof phoneToken === 'string' ? phoneToken : null,
        payload.phone,
      );
      if (!check.ok) {
        return NextResponse.json(
          { error: check.error, reason: 'phone_unverified' },
          { status: 403 },
        );
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data, error } = await supabase.rpc('register_profile', { payload });

    if (error) {
      console.error('Error calling register_profile:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Stamp phone_verified / phone_verified_at on the fresh profile. Done after
    // register_profile because the row must exist first. Non-fatal: the account
    // is already created, and Settings can re-verify.
    if (phoneOtpEnabled() && payload.phone) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        const { error: markErr } = await supabase.rpc('mark_profile_phone_verified', {
          p_user_id: userData.user.id,
          p_phone: payload.phone,
          p_provider: '2factor',
        });
        if (markErr) {
          console.error('mark_profile_phone_verified failed:', markErr.message);
        }
      }
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error('Unexpected error in register route:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

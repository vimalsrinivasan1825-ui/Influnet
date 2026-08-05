import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { RegisterProfileSchema } from '@/lib/validators';
import { enforceRateLimit } from '@/lib/rate-limit';
import { phoneOtpEnabled, validatePhoneVerification } from '@/lib/phone-otp';
import { deliverEmail } from '@/lib/email/policy';

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

    const rawBody = await req.json().catch(() => ({}));

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

    // Recovery path: rebuild the payload from auth metadata when the caller
    // hasn't got one.
    //
    // With email confirmation on, signUp returns no session, so register_profile
    // can't run at signup time. The wizards pass the answers to signUp as
    // `options.data`, so they live on the auth user as user_metadata — server
    // side, device independent, and already there. Reading them here means
    // recovery needs no client storage at all (no more localStorage payloads,
    // which is what the CodeQL clear-text-storage findings flagged).
    //
    // The one thing metadata deliberately does NOT hold is the phone-OTP token
    // (it is single-use and short-lived, and auth metadata is permanent). When
    // email confirmation is required, the signup page stores it server-side in
    // pending_registrations (migration 105) keyed by the user id; we spend that
    // row here so first login — from any device — keeps the verified phone. A
    // fresh token supplied in the body wins. The row is single-use and deleted
    // whether or not its token is still valid: an expired one must force a
    // fresh verification, not a silent retry.
    //
    // Deliberately NOT merged with the body: a caller who sends a payload gets
    // exactly that payload validated, and metadata is consulted only when there
    // is nothing to validate. Half-and-half would let a partial body silently
    // inherit fields nobody re-confirmed.
    let rawPayload = rawBody;
    const reconstructed = !rawBody || typeof rawBody !== 'object' || !('role' in rawBody);
    if (reconstructed) {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Consume the server-side pending registration (best-effort: a database
      // where migration 105 hasn't been applied must not break registration).
      let pendingToken: unknown = rawBody?.phoneVerificationToken;
      try {
        const { data: pendingRow, error: pendingErr } = await supabase
          .from('pending_registrations')
          .select('phone_verification_token')
          .eq('user_id', userData.user.id)
          .maybeSingle();
        if (pendingErr) {
          console.error('[register] pending_registrations lookup failed (is migration 105 applied?):', pendingErr.message);
        } else {
          await supabase.from('pending_registrations').delete().eq('user_id', userData.user.id);
          if (!pendingToken && pendingRow?.phone_verification_token) {
            pendingToken = pendingRow.phone_verification_token;
          }
        }
      } catch (err) {
        console.error('[register] pending_registrations consumption failed:', err);
      }

      // Idempotent: if the profile is already there this is a no-op, not an
      // error. Both clients call this on any "signed in but no profile" state,
      // which races with a profile that just appeared.
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ ok: true, already_registered: true });
      }

      const metadata = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
      if (!metadata.role) {
        return NextResponse.json(
          {
            error:
              'We could not find your signup details. Please sign up again — nothing was charged and no account is left behind.',
            reason: 'no_signup_metadata',
          },
          { status: 422 },
        );
      }
      // Reconstruction must never be a way to skip mobile verification: if no
      // valid token is available (body or pending row) and the OTP gate is on,
      // the phone gate below rejects with 403 phone_unverified.
      rawPayload = { ...metadata, phoneVerificationToken: pendingToken };
    }

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

    // payload.phone is already E.164 here — PhoneSchema (packages/core) both
    // validates and normalises it, so registration can no longer write one of
    // the three shapes ('+91 8270942966' / '8270942966' / '+918270942966')
    // that let the same person register the same number twice under different
    // strings. Migration 107 normalises the rows written before this existed.
    const { data, error } = await supabase.rpc('register_profile', { payload });

    if (error) {
      console.error('Error calling register_profile:', error);
      // Passed through on purpose: register_profile raises messages written
      // for the person signing up ('Username already taken', 'Invalid Influnet
      // username' — see migration 031). Replacing them with a generic string
      // would turn a fixable form error into a dead end.
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Columns register_profile doesn't know about. That RPC writes a fixed
    // column list (migrations 031/032/049); snapchat_handle and
    // twitter_followers postdate it, and re-issuing a function three migrations
    // have already rewritten — to carry one link and one integer — is a much
    // larger blast radius than this follow-up write. Non-fatal by design: the
    // account exists either way, and both fields are editable in Settings.
    const extraColumns: Record<string, unknown> = {};
    if (payload.snapchatHandle) {
      extraColumns.snapchat_handle = String(payload.snapchatHandle).replace(/^@/, '').toLowerCase();
    }
    if (payload.role === 'influencer' && typeof payload.twitterFollowers === 'number') {
      extraColumns.twitter_followers = payload.twitterFollowers;
    }
    if (Object.keys(extraColumns).length > 0) {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (uid) {
        const table = payload.role === 'influencer' ? 'influencer_profiles' : 'business_profiles';
        // business_profiles has no twitter_followers column — only the handle
        // field is shared between the two tables.
        if (table === 'business_profiles') delete extraColumns.twitter_followers;
        const { error: extraErr } = await supabase.from(table).update(extraColumns).eq('user_id', uid);
        if (extraErr) console.error('[register] extra profile columns write failed:', extraErr.message);
      }
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

    // Welcome mail. Fired here rather than at signUp because this is the point
    // a profile actually exists — signUp with email confirmation on produces an
    // auth user and nothing else, and welcoming someone to a dashboard they
    // have no profile for is worse than saying nothing.
    //
    // Awaited but never fatal: the account is created either way, and email is
    // best-effort by design (see lib/email/policy.ts).
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        await deliverEmail({
          userId,
          templateId: 'welcome',
          data: { name: payload.name, role: payload.role, dashboardUrl: '/dashboard' },
          // One welcome per account, ever — a re-registration attempt or a
          // client retry must not produce a second one.
          dedupeKey: `welcome:${userId}`,
        });
      }
    } catch (emailErr) {
      console.error('[register] welcome email failed:', emailErr);
    }

    return NextResponse.json({ ok: true, data, reconstructed });
  } catch (error) {
    // Unlike the register_profile branch above, an exception here is an
    // unexpected fault (network, JSON parse, a thrown library error) whose
    // message is written for a developer, not a user.
    return jsonError(500, 'Could not complete signup. Please try again.', error);
  }
}

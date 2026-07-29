import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * Register (or clear) this device's Expo push token on the caller's profile.
 *
 * notifyUser() (lib/notify.ts) reads this column to fan a notification out as
 * a push, not just a row the user finds next time they happen to open the
 * app. One token per account — a second device signing in replaces it, which
 * is the same tradeoff most single-token push setups make; multi-device
 * fan-out would need a separate token table and isn't needed for v1.
 */
const BodySchema = z.object({
  // Expo tokens look like "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]". Null
  // clears the token (sign-out, permission revoked).
  token: z.string().min(1).max(200).nullable(),
});

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Rate limit: push token registration changes are per-device, capped to
    // prevent accidental loops on sign-in/sign-out cycles.
    const limited = await enforceRateLimit(req, {
      bucket: 'push:register', limit: 10, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ expo_push_token: parsed.data.token })
      .eq('id', user.id)
      .select('id');

    /**
     * Never fail the request — a push token is a bonus, not a precondition for
     * using the app — but do report honestly whether it was STORED.
     *
     * This used to return only `{ ok: false, migration_pending: true }`, which
     * left every cause looking like a pending migration and, because the HTTP
     * status stayed 200, let callers that only check `res.ok` report a
     * successful registration when nothing had been written.
     */
    if (error) {
      console.error('[push-token] failed to store token for', user.id, error.message);
      return NextResponse.json({ ok: false, reason: 'write_failed' });
    }

    // Zero rows means RLS silently filtered the update — the row exists but the
    // session isn't allowed to touch it, which returns no error at all.
    if (!data || data.length === 0) {
      console.error('[push-token] update matched no rows for', user.id, '— RLS or missing profile');
      return NextResponse.json({ ok: false, reason: 'no_rows_updated' });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

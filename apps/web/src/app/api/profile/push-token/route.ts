import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';

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

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: parsed.data.token })
      .eq('id', user.id);

    // Migration 079 not applied yet — push registration silently no-ops
    // rather than breaking sign-in/app-open for everyone.
    if (error) return NextResponse.json({ ok: false, migration_pending: true });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

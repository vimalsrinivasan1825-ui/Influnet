import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError, platformFromUserAgent } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * Register (or clear) this device's Expo push token.
 *
 * POST { token: string, platform?, appVersion?, osVersion?, permission? }
 *   → register this device (migration 156, one row per device)
 * POST { token: null, deviceToken?: string }
 *   → sign-out: disable just `deviceToken`, or — for older app builds that send
 *     only `null` — every device of the caller
 *   ← { ok: boolean, reason?: string, device_id?: string }
 *
 * notifyUser() (lib/notify.ts) fans a notification out to every active device.
 * profiles.expo_push_token is still mirrored by the RPCs so any old reader keeps
 * working; if the database predates 156, this falls back to writing that column.
 */
const BodySchema = z.object({
  // Expo tokens look like "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]".
  token: z.string().min(1).max(200).nullable(),
  deviceToken: z.string().min(1).max(200).optional(),
  platform: z.enum(['ios', 'android']).optional(),
  appVersion: z.string().max(32).optional(),
  osVersion: z.string().max(32).optional(),
  permission: z.enum(['granted', 'denied', 'undetermined']).optional(),
});

/** ios | android | unknown — never 'web', which push_devices refuses. */
function devicePlatform(req: Request): 'ios' | 'android' | 'unknown' {
  const p = platformFromUserAgent(req.headers.get('user-agent'));
  return p === 'ios' || p === 'android' ? p : 'unknown';
}

function missingFunction(err: { message?: string; code?: string } | null): boolean {
  return !!err && (err.code === 'PGRST202' || /does not exist|Could not find the function/i.test(err.message ?? ''));
}

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
    const body = parsed.data;

    const { data, error } =
      body.token === null
        ? await supabase.rpc('unregister_push_device', { p_token: body.deviceToken ?? null })
        : await supabase.rpc('register_push_device', {
            p_token: body.token,
            // App builds older than migration 156 send no platform, which left
            // every device of theirs labelled 'unknown' in the admin's
            // Android-vs-iOS split. The request itself still says which it is.
            // 'web' is not a device platform (156's CHECK allows ios/android/
            // unknown only), so a browser-shaped UA stays 'unknown'.
            p_platform: body.platform ?? devicePlatform(req),
            p_app_version: body.appVersion ?? null,
            p_os_version: body.osVersion ?? null,
            p_permission: body.permission ?? 'granted',
          });

    if (!error) {
      return NextResponse.json({ ok: true, device_id: (data as any)?.device_id ?? null });
    }

    if (!missingFunction(error)) {
      // Never fail the request — a push token is a bonus, not a precondition
      // for using the app — but report honestly that nothing was stored.
      console.error('[push-token] device registration failed for', user.id, error.message);
      return NextResponse.json({ ok: false, reason: 'write_failed' });
    }

    // Database behind migration 156: the single-column path (079).
    const legacy = await supabase
      .from('profiles')
      .update({ expo_push_token: body.token })
      .eq('id', user.id)
      .select('id');
    if (legacy.error) {
      console.error('[push-token] failed to store token for', user.id, legacy.error.message);
      return NextResponse.json({ ok: false, reason: 'write_failed' });
    }
    // Zero rows means RLS silently filtered the update.
    if (!legacy.data || legacy.data.length === 0) {
      return NextResponse.json({ ok: false, reason: 'no_rows_updated' });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

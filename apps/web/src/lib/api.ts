import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database, UserRole } from '@/types';
import { logger } from './logger';
import { captureException } from './observability';

/**
 * Is this "error" actually an HTML page from something in front of the database?
 *
 * Supabase sits behind Cloudflare. When its WAF blocks a request — which the
 * 2026-08-08 audit triggered simply by putting `../../etc/passwd` in a project
 * title — the client receives an HTML block page where it expects JSON, and the
 * whole document ended up in `error.message`. That produced a 500 plus a log
 * entry containing a full web page.
 *
 * The input case is a curiosity; the reason this matters is that ANY upstream
 * incident (a Cloudflare error page, a Supabase status page, a proxy timeout
 * page) fails the same way. An upstream being unavailable is not a bug in this
 * application, and reporting it as one buries real faults in Sentry.
 */
function looksLikeUpstreamHtml(error: any): boolean {
  const msg = typeof error?.message === 'string' ? error.message : '';
  return /^\s*<(!doctype|html)\b/i.test(msg);
}

export function jsonError(status: number, publicMessage: string, error?: any) {
  // An HTML body from upstream is an availability problem, not a server fault
  // in this code. Re-label it so the caller gets an honest status and the log
  // gets one line instead of an entire page.
  if (status >= 500 && looksLikeUpstreamHtml(error)) {
    const title = String(error.message).match(/<title>([^<]{0,120})<\/title>/i)?.[1]?.trim();
    logger.error('upstream returned an HTML error page (WAF block or provider incident)', {
      status: 503,
      upstreamTitle: title ?? 'unknown',
    });
    return NextResponse.json(
      { error: 'That request was blocked or the service is temporarily unavailable. Please try again.' },
      { status: 503 },
    );
  }

  // 5xx are server faults (error); 4xx are expected client errors (warn).
  const level = status >= 500 ? 'error' : 'warn';
  logger[level](publicMessage, { status, ...(error != null ? { err: error } : {}) });
  // Report server faults to Sentry (no-op unless a DSN is configured).
  if (status >= 500) {
    captureException(error ?? new Error(publicMessage), { tags: { status } });
  }
  return NextResponse.json({ error: publicMessage }, { status });
}

/**
 * Assurance level of an already-verified access token.
 *
 * Supabase puts `aal` ("aal1" = password only, "aal2" = a second factor was
 * used) in the JWT. Only ever call this on a token withAuth() has already
 * validated — this reads the payload without verifying the signature, so on its
 * own it proves nothing.
 */
function tokenAal(req: Request): string | null {
  try {
    const raw = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const payload = raw?.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.aal === 'string' ? json.aal : null;
  } catch {
    return null;
  }
}

// Admin routes: verify the caller's JWT + admin role, then hand back a
// service-role client so admin queries can read columns (email/phone) that
// column-level grants hide from the authenticated role.
//
// NOTE: the service-role client has no auth.uid(), so any RPC that guards
// itself with is_admin() must be called with the CALLER's client instead —
// see the PATCH in /api/admin/verifications.
export async function withAdmin(
  req: Request
): Promise<
  | { ok: true; supabase: any; user: User }
  | { ok: false; res: NextResponse }
> {
  const auth = await withAuth(req, { role: 'admin' as UserRole });
  if (!auth.ok) return auth;

  // Opt-in second-factor requirement for the admin surface. Left off by default
  // so provisioning an admin can't lock them out before they've enrolled; turn
  // it on once the client has MFA set up.
  if (process.env.ADMIN_REQUIRE_MFA === 'true' && tokenAal(req) !== 'aal2') {
    return {
      ok: false,
      res: jsonError(403, 'Admin access requires two-factor authentication. Sign in again and complete your second factor.'),
    };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { ok: false, res: jsonError(500, 'Server misconfigured: missing service role key') };
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { 
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  );

  return { ok: true, supabase, user: auth.user };
}

/**
 * Whether an admin is a Developer / Super Admin (migration 150).
 *
 * Read ONLY through the service-role client `withAdmin` hands back.
 * `authenticated` has column-level SELECT grants on profiles and
 * `is_super_admin` is deliberately not one of them — naming it in a query made
 * with the caller's JWT fails the WHOLE statement with 42501, which is how this
 * flag once took down `withAuth` for every user.
 *
 * The flag is the only source of truth. An email pattern is not: signup does
 * not prove ownership of an address, so "dev.admin@..." proves nothing.
 */
export async function isSuperAdmin(serviceClient: any, userId: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from('profiles')
    .select('is_super_admin')
    .eq('id', userId)
    .maybeSingle();
  // Fail closed: an unreadable flag is not a granted one.
  if (error || !data) return false;
  return data.is_super_admin === true;
}

/**
 * Developer / Super Admin guard.
 *
 * Refuses Business / Client admins with 403 Forbidden.
 * Grants access only if caller has role='admin' AND profiles.is_super_admin.
 */
export async function withSuperAdmin(
  req: Request
): Promise<
  | { ok: true; supabase: any; user: User }
  | { ok: false; res: NextResponse }
> {
  const auth = await withAdmin(req);
  if (!auth.ok) return auth;

  if (await isSuperAdmin(auth.supabase, auth.user.id)) {
    return auth;
  }

  return {
    ok: false,
    res: jsonError(403, 'Developer access required. This technical section is restricted to super administrators.'),
  };
}

/**
 * A Supabase client bound to the CALLER's JWT.
 *
 * Needed because `withAdmin` hands back a SERVICE-ROLE client, which has no
 * `auth.uid()`. Any RPC that guards itself with `is_admin()` will therefore
 * fail when called with it — the function cannot see who is asking. Admin
 * routes that call such an RPC need this instead.
 */
export function callerClient(req: Request) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization') ?? '' },
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  );
}

export async function withAuth(
  req: Request,
  opts?: { role?: UserRole }
): Promise<
  | { ok: true; supabase: any; user: User; role: UserRole }
  | { ok: false; res: NextResponse }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, res: jsonError(401, 'Missing Authorization header') };
  }

  try {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
          fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { ok: false, res: jsonError(401, 'Unauthorized', userError) };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      // Only columns `authenticated` holds a SELECT grant on — one ungranted
      // column fails the whole query and locks every user out.
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { ok: false, res: jsonError(403, 'Profile not found', profileError) };
    }

    const userRole = profile.role as UserRole;

    if (opts?.role && userRole !== opts.role) {
      return { ok: false, res: jsonError(403, `Forbidden: Requires ${opts.role} role`) };
    }

    // Keep `profiles.last_active_at` roughly current for the re-engagement
    // nudge job (migration 142). Fire-and-forget and throttled in-process to
    // once/hour/user, so an active session doesn't write on every request; the
    // RPC itself also no-ops if the column was touched in the last 30 min.
    touchLastActive(supabase, user.id, parseClientHeader(req));

    return { ok: true, supabase, user, role: userRole };
  } catch (error) {
    return { ok: false, res: jsonError(500, 'Internal server error', error) };
  }
}

// ── Activity bump (nudges 142, daily activity history 152) ───────────────────
/**
 * `X-Influnet-Client: ios/1.4.2` (mobile, packages/api) or `web` (apiFetch).
 * Client-controlled, so it is only ever a LABEL for analytics — never used for
 * a decision. Anything unrecognised becomes `unknown`.
 */
export function parseClientHeader(req: Request): { platform: string; version: string | null } {
  const raw = (req.headers.get('x-influnet-client') ?? '').trim().toLowerCase();
  const [platform, version] = raw.split('/', 2);
  const known = platform === 'web' || platform === 'ios' || platform === 'android';
  const cleanVersion = version && /^[0-9a-z.\-+]{1,32}$/.test(version) ? version : null;
  return { platform: known ? platform : 'unknown', version: known ? cleanVersion : null };
}

const lastActiveTouchedAt = new Map<string, number>();
// 30 min: frequent enough that the hour-of-day heatmap sees most active hours,
// rare enough that an active session writes ~2 rows an hour, not one per call.
const TOUCH_THROTTLE_MS = 30 * 60 * 1000;

function touchLastActive(
  supabase: SupabaseClient,
  userId: string,
  client: { platform: string; version: string | null },
): void {
  const now = Date.now();
  const key = `${userId}:${client.platform}`;
  const prev = lastActiveTouchedAt.get(key) ?? 0;
  if (now - prev < TOUCH_THROTTLE_MS) return;
  lastActiveTouchedAt.set(key, now);
  if (lastActiveTouchedAt.size > 5000) lastActiveTouchedAt.clear();
  // Fire-and-forget: never blocks or fails a request. touch_activity (152) also
  // bumps last_active_at; if it is missing (database behind), fall back to the
  // older touch_last_active (142) so nudges keep working.
  void (supabase.rpc as any)('touch_activity', {
    p_platform: client.platform,
    p_app_version: client.version,
  }).then(
    (res: { error?: { message?: string } | null }) => {
      if (res?.error?.message?.includes('does not exist')) {
        void (supabase.rpc as any)('touch_last_active').then(() => {}, () => {});
      }
    },
    () => {},
  );
}

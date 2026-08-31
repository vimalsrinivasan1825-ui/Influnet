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
    touchLastActive(supabase, user.id);

    return { ok: true, supabase, user, role: userRole };
  } catch (error) {
    return { ok: false, res: jsonError(500, 'Internal server error', error) };
  }
}

// ── last_active_at bump (re-engagement nudges, migration 142) ────────────────
const lastActiveTouchedAt = new Map<string, number>();
const TOUCH_THROTTLE_MS = 60 * 60 * 1000;

function touchLastActive(supabase: SupabaseClient, userId: string): void {
  const now = Date.now();
  const prev = lastActiveTouchedAt.get(userId) ?? 0;
  if (now - prev < TOUCH_THROTTLE_MS) return;
  lastActiveTouchedAt.set(userId, now);
  if (lastActiveTouchedAt.size > 5000) lastActiveTouchedAt.clear();
  // Fire-and-forget: never blocks or fails a request. A missing RPC (migration
  // not applied here yet) is swallowed like any other error.
  void (supabase.rpc as any)('touch_last_active').then(
    () => {},
    () => {},
  );
}

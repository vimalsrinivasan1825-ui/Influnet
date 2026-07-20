import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database, UserRole } from '@/types';
import { logger } from './logger';
import { captureException } from './observability';

export function jsonError(status: number, publicMessage: string, error?: any) {
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

    return { ok: true, supabase, user, role: userRole };
  } catch (error) {
    return { ok: false, res: jsonError(500, 'Internal server error', error) };
  }
}

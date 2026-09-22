import { NextResponse } from 'next/server';
import { isSuperAdmin, jsonError, withAdmin } from '@/lib/api';

/**
 * GET /api/admin/tier → { isSuperAdmin: boolean }
 *
 * Which admin workspace to render. The browser cannot read
 * `profiles.is_super_admin` itself — `authenticated` has no SELECT grant on
 * that column, on purpose, so the list of super admins is not readable by
 * anyone with a login — so it asks here.
 *
 * RENDERING ONLY. Every technical route re-checks with `withSuperAdmin`; a
 * client that lies about this answer gets an empty page and a 403.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    return NextResponse.json(
      { isSuperAdmin: await isSuperAdmin(auth.supabase, auth.user.id) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return jsonError(500, 'Could not resolve admin tier', err);
  }
}

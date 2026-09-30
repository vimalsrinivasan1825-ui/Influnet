import { adminJson, jsonError, withAdmin } from '@/lib/api';
import { creatableTiers } from '@/lib/admin-access';

/**
 * GET /api/admin/tier → { isSuperAdmin, access: { tier, permissions, hiddenFields, creatableTiers } }
 *
 * Which admin workspace to render. The browser cannot read
 * `profiles.is_super_admin` itself — `authenticated` has no SELECT grant on
 * that column, on purpose, so the list of super admins is not readable by
 * anyone with a login — so it asks here.
 *
 * `access` is the caller's team access (migration 176): which sections the
 * sidebar draws and which the page gate opens.
 *
 * RENDERING ONLY. Every route re-checks through `withAdmin`; a client that
 * lies about this answer gets an empty page and a 403.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const { access } = auth;
    return adminJson(req,
      {
        isSuperAdmin: access.tier === 'super',
        access: {
          tier: access.tier,
          permissions: access.permissions,
          hiddenFields: access.hiddenFields,
          creatableTiers: creatableTiers(access),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return jsonError(500, 'Could not resolve admin tier', err);
  }
}

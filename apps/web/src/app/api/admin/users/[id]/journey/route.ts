import { adminJson, callerClient, jsonError, withAdmin } from '@/lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 300;

/**
 * GET /api/admin/users/[id]/journey?before=<iso>
 *
 * One person's whole history, newest first (migration 198). Its own route so
 * the Journey tab can page backwards with `before` without re-fetching the
 * user page's dozen other sections.
 *
 * Returns `{ events, nextBefore, available }`:
 *   - `nextBefore` is the timestamp to pass for the next (older) page, or null
 *     when this page was the last;
 *   - `available: false` means the function itself is missing (198 not yet
 *     applied) — the page falls back to the older activity list instead of
 *     telling an admin this person has done nothing.
 *
 * Called through the caller's own JWT: the function checks the caller's
 * sections itself, and a service-role call has no auth.uid() to check.
 * adminJson masks `amount_inr`, `ip_address` and `admin_email` for staff
 * with those field groups hidden.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid user id');

    const beforeRaw = new URL(req.url).searchParams.get('before');
    const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? beforeRaw : null;

    const { data, error } = await callerClient(req).rpc('admin_get_user_journey', {
      p_user_id: id,
      p_limit: PAGE,
      p_before: before,
    });

    if (error) {
      // PGRST202 = PostgREST cannot find the function: 198 is not applied.
      if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
        return adminJson(req, { events: [], nextBefore: null, available: false });
      }
      return jsonError(500, 'Could not load this person\'s journey', error);
    }

    const events = (data ?? []) as { at: string }[];
    return adminJson(req, {
      events,
      nextBefore: events.length === PAGE ? events[events.length - 1].at : null,
      available: true,
    });
  } catch (error) {
    return jsonError(500, 'Could not load this person\'s journey', error);
  }
}

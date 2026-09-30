import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolveLookupUsername } from '@/lib/search-query';
import { z } from 'zod';

const PAGE_SIZE = 24;

const QuerySchema = z.object({
  q: z.string().max(100).optional(),
  niche: z.string().max(50).optional(),
  industry: z.string().max(50).optional(),
  location: z.string().max(100).optional(),
  cursor: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
});

/**
 * Creator LOOKUP. Not a search, as of 2026-09-30.
 *
 * ── What changed and why ─────────────────────────────────────────────────
 * This route spent most of its life as a real search: the RPC matched name,
 * headline, bio and niche tags, so typing "food" returned a roster of food
 * creators. That roster is now switched off deliberately — a brand reaches a
 * creator it already knows, by username or by a pasted profile link, and the
 * platform does not offer a directory of people to browse through.
 *
 * Two things follow from that, and both are load-bearing:
 *
 *   • A query that does not resolve to a username returns `{ results: [] }`,
 *     not an error and not a near-miss. No suggestions, no "did you mean" —
 *     those are the browse behaviour wearing a different hat.
 *   • The niche / industry / location filters are accepted and IGNORED rather
 *     than rejected. Older mobile builds still send them; 400-ing those
 *     installs would break a screen that otherwise degrades to a lookup
 *     cleanly. They are parsed only so an old client cannot 400 itself.
 *
 * The `search.browse` plan gate that used to guard filter-only queries is gone
 * with the feature it guarded. The `search.browse` key stays in @influnet/core
 * because nothing else about the plan vocabulary changed and removing a key
 * from a shipped mobile bundle's expectations buys nothing.
 *
 * The RPC (migration 048, extended by 102 and 145) is unchanged and still
 * matches broadly — this route discards everything that is not an exact
 * username hit, which is how it behaved before 2026-09-02. Narrowing here
 * rather than in SQL keeps the one RPC serving the admin match tooling too.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, role, user } = auth;

    // Still rate limited: a lookup is cheap per call, but an unthrottled exact
    // lookup is a username enumerator.
    const limited = await enforceRateLimit(req, {
      bucket: 'discover:search', limit: 30, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      q: url.searchParams.get('q') || undefined,
      niche: url.searchParams.get('niche') || undefined,
      industry: url.searchParams.get('industry') || undefined,
      location: url.searchParams.get('location') || undefined,
      cursor: url.searchParams.get('cursor') || undefined,
      id: url.searchParams.get('id') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }
    const { q, cursor, id } = parsed.data;

    // `id` is a different question — "give me this one creator, by uuid" — and
    // is how /dashboard/requests/new renders the person a request is being
    // addressed to. It never took a query and is untouched by the above.
    const username = id ? null : q ? resolveLookupUsername(q) : null;

    if (!id && !username) {
      // Nothing to look up: free text, a half-typed word, or filters alone.
      return NextResponse.json({ userRole: role, results: [], nextCursor: null });
    }

    const { data, error } = await supabase.rpc('search_influencers', {
      p_q: username,
      p_niche: null,
      p_location: null,
      p_cursor: cursor ?? null,
      p_limit: PAGE_SIZE,
      p_id: id ?? null,
    });
    if (error) return jsonError(500, 'Failed to fetch creators', error);

    const rows = (data as any[]) || [];

    // The exact-match narrowing. The RPC matched loosely to find the row; only
    // the one whose username IS what was asked for is an answer. Without this
    // a lookup for "vimal" would also return every creator with "vimal" in
    // their bio, which is the roster this route no longer serves.
    const results = username
      ? rows.filter((r) => String(r.username ?? '').toLowerCase() === username)
      : rows;

    /**
     * Match analytics (migration 160). The typed query is NEVER stored — it is
     * now always a username, which makes it more identifying than before, not
     * less. Fire-and-forget: a logging failure must not fail a lookup.
     */
    void (supabase.rpc as any)('log_search_event', {
      p_surface: 'discover',
      p_has_query: Boolean(username),
      p_query_length: (q ?? '').length,
      p_niche: null,
      p_industry: null,
      p_location: null,
      p_result_count: results.length,
    }).then(() => {}, () => {});

    return NextResponse.json({
      userRole: role,
      results,
      // An exact lookup returns at most one row, so there is never a next page.
      nextCursor: null,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

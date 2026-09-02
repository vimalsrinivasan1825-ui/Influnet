import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { extractSearchHandle } from '@/lib/search-query';
import { requireFeature } from '@/lib/entitlements';
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

// Creator search, open to any signed-in role (used by the topbar command
// palette and the mobile search screen).
//
// It was a strict LOOKUP until 2026-09-02: the RPC matched broadly but this
// route then discarded everything that had not matched a username or Instagram
// handle, so you could only find a creator you could already name. A brand
// searching "food" found nobody, however carefully those creators had tagged
// themselves. It is a real search now — name, username, handle, headline, bio
// and niche tag, per the RPC (migration 048, extended by 102 and 145).
//
// The paid line moved rather than disappeared. See the plan gate below: typing
// a query is free, browsing the roster with filters and NO query is Pro.

// Pasted-URL handling (Instagram links and our own profile links) lives in
// lib/search-query.ts so it can be unit tested — route files can only export
// route handlers.

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, role, user } = auth;

    // Rate limit: creator search is a paid-resource route (RPC behind the
    // scenes) and can be used for data-scraping at scale. Authenticated.
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
    const { q, niche, industry, location, cursor, id } = parsed.data;
    const searchHandle = q ? extractSearchHandle(q) : undefined;

    // ── Plan gate ────────────────────────────────────────────────────────
    // Handle/username lookup is free and always has been — that is the
    // behaviour the block comment above describes, and it stays exactly as it
    // was. What Pro adds is BROWSE: filtering by niche, industry or location
    // WITHOUT already knowing who you are looking for.
    //
    // The distinction is the whole product: a lookup answers "show me this
    // creator", a browse answers "find me creators like this", and only the
    // second one is worth paying for. Note this also means a Free user loses
    // nothing they could do before the gate existed except query-less browse.
    const wantsBrowse = !q && !id && Boolean(niche || industry || location);
    if (wantsBrowse) {
      const blocked = await requireFeature(
        { supabase, user },
        'search.browse',
        'Browsing creators by niche, industry or location is a Pro feature. You can still look up any creator by their username or Instagram handle.',
      );
      if (blocked) return blocked;
    }

    const { data, error } = await supabase.rpc('search_influencers', {
      p_q: searchHandle ?? q ?? null,
      p_niche: niche ?? null,
      p_location: location ?? null,
      p_cursor: cursor ?? null,
      p_limit: PAGE_SIZE,
      p_id: id ?? null,
    });
    if (error) return jsonError(500, 'Failed to fetch creators', error);

    /**
     * The RPC's own matching now stands as the answer.
     *
     * This used to re-filter the results down to username-or-handle hits,
     * throwing away every row that had matched on name, headline, bio or (as of
     * migration 145) a niche tag. That made the search a strict lookup: you
     * could find a creator only if you already knew their handle, which is not
     * a search, and it meant a brand hunting for "food" creators found nobody
     * however well those creators had tagged themselves.
     *
     * The plan gate above is untouched and is where the paid line still sits:
     * typing a query is free, browsing the roster with only filter dropdowns
     * and no query is Pro.
     */
    const results = (data as any[]) || [];
    return NextResponse.json({
      userRole: role,
      results,
      nextCursor: results.length === PAGE_SIZE ? results[results.length - 1].user_id : null,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

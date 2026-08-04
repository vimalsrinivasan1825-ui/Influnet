import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
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

// Creator lookup, open to any signed-in role (used by the topbar command palette
// and the mobile search screen). Deliberately a lookup, not a discovery/browse
// tool — the client wants this reachable only by someone who already knows the
// creator's username or Instagram handle, not a way to stumble onto creators
// via name/niche/bio. The RPC (migration 048, extended by 102) matches broader
// fields for its other callers, so results are filtered down to a
// username-or-instagram-handle substring match here before they reach the client.

/**
 * A pasted `instagram.com/<handle>` / `www.instagram.com/<handle>/` URL, or a
 * bare `@handle`, both reduce to the same handle the RPC can match on.
 */
function extractSearchHandle(q: string): string {
  const trimmed = q.trim();
  const urlMatch = trimmed.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, '');
}

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

    const { data, error } = await supabase.rpc('search_influencers', {
      p_q: searchHandle ?? q ?? null,
      p_niche: niche ?? null,
      p_location: location ?? null,
      p_cursor: cursor ?? null,
      p_limit: PAGE_SIZE,
      p_id: id ?? null,
    });
    if (error) return jsonError(500, 'Failed to fetch creators', error);

    let results = (data as any[]) || [];
    // Username-or-handle lookup: drop any row that only matched on name/headline/bio.
    if (q && !id) {
      const needle = (searchHandle ?? q).trim().toLowerCase();
      results = results.filter(
        (r) =>
          (r.username ?? '').toLowerCase().includes(needle) ||
          (r.instagram_handle ?? '').toLowerCase().replace(/^@/, '').includes(needle),
      );
    }
    return NextResponse.json({
      userRole: role,
      results,
      nextCursor: results.length === PAGE_SIZE ? results[results.length - 1].user_id : null,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

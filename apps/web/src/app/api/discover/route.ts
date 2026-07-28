import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
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

// Creator lookup, open to any signed-in role (used by the topbar command palette).
// Deliberately a lookup, not a discovery/browse tool — the client wants this
// reachable only by someone who already knows the creator's username, not a way
// to stumble onto creators via name/niche/bio. The RPC (migration 048) matches
// broader fields for its other callers, so results are filtered down to
// username-prefix/substring matches here before they ever reach the client.

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;

    const { supabase, role } = auth;

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

    const { data, error } = await supabase.rpc('search_influencers', {
      p_q: q ?? null,
      p_niche: niche ?? null,
      p_location: location ?? null,
      p_cursor: cursor ?? null,
      p_limit: PAGE_SIZE,
      p_id: id ?? null,
    });
    if (error) return jsonError(500, 'Failed to fetch creators', error);

    let results = (data as any[]) || [];
    // Username-only lookup: drop any row that only matched on name/headline/bio.
    if (q && !id) {
      const needle = q.trim().toLowerCase();
      results = results.filter((r) => (r.username ?? '').toLowerCase().includes(needle));
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

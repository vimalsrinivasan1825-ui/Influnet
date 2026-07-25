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

// Discover creators (for businesses) or brands (for influencers).
// Search/filtering/pagination run server-side in SECURITY DEFINER RPCs
// (see migration 048) so only curated public fields ever leave the DB.
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

    // Discover browsing feature temporarily disabled for V1 launch per client request.
    // Allow single-profile lookups (id present) for collaboration request previews.
    if (!id) {
      return jsonError(404, 'Not found: Discover feature is temporarily disabled');
    }

    if (role !== 'business_owner' && role !== 'admin') {
      return jsonError(403, 'Forbidden: Discover is only available for businesses');
    }

    const { data, error } = await supabase.rpc('search_influencers', {
      p_q: q ?? null,
      p_niche: niche ?? null,
      p_location: location ?? null,
      p_cursor: cursor ?? null,
      p_limit: PAGE_SIZE,
      p_id: id ?? null,
    });
    if (error) return jsonError(500, 'Failed to fetch creators', error);

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

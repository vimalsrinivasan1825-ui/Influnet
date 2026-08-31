import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolveEntitlements } from '@/lib/entitlements';

/**
 * "Who viewed your profile" — the identified list, gated by plan.
 *
 * The data has existed since migration 018: creator_profile_views holds one
 * row per (creator, business) with a view count and last-seen time, readable
 * only by the creator (RLS). Nothing has ever rendered the list of WHO.
 *
 * This is a READ gate, not a paywall: Free still gets a useful screen. It sees
 * the most-recent `limits.profileViewers` viewers identified, plus a count of
 * the rest ("and 23 more"). Pro sees everyone. A 402 here would turn the card
 * into an error; returning less data is what a paywall should look like.
 *
 * Envelope: `{ viewers, total, shown, locked }`.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    if (role !== 'influencer') {
      return jsonError(403, 'Only creators have profile viewers.');
    }

    const limited = await enforceRateLimit(req, {
      bucket: 'profile:viewers', limit: 30, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const { data: rows, error } = await supabase
      .from('creator_profile_views')
      .select('business_id, view_count, last_viewed_at')
      .eq('creator_id', user.id)
      .order('last_viewed_at', { ascending: false });

    if (error) {
      // Table missing on an environment behind on migrations — an empty list
      // beats a broken screen.
      return NextResponse.json({ viewers: [], total: 0, shown: 0, locked: 0, degraded: true });
    }

    const all = (rows ?? []) as { business_id: string; view_count: number; last_viewed_at: string }[];
    const total = all.length;

    const ent = await resolveEntitlements(supabase, user.id);
    const cap = ent.subscriptionsEnabled ? ent.limits.profileViewers : null;
    const visible = typeof cap === 'number' ? all.slice(0, cap) : all;
    const locked = total - visible.length;

    const businessIds = visible.map((r) => r.business_id);
    const profiles: Record<string, { name: string | null; avatarUrl: string | null; username: string | null }> = {};

    if (businessIds.length > 0) {
      const [{ data: baseRows }, { data: bizRows }] = await Promise.all([
        supabase.from('profiles').select('id, name, avatar_url').in('id', businessIds),
        supabase
          .from('business_profiles')
          .select('user_id, company_name, username, logo_url')
          .in('user_id', businessIds),
      ]);
      const bizById = new Map(
        ((bizRows ?? []) as any[]).map((b) => [b.user_id as string, b]),
      );
      for (const p of (baseRows ?? []) as any[]) {
        const b = bizById.get(p.id);
        profiles[p.id] = {
          name: b?.company_name || p.name || null,
          avatarUrl: b?.logo_url || p.avatar_url || null,
          username: b?.username || null,
        };
      }
    }

    const viewers = visible.map((r) => ({
      businessId: r.business_id,
      name: profiles[r.business_id]?.name ?? null,
      username: profiles[r.business_id]?.username ?? null,
      avatarUrl: profiles[r.business_id]?.avatarUrl ?? null,
      viewCount: r.view_count,
      lastViewedAt: r.last_viewed_at,
    }));

    return NextResponse.json({ viewers, total, shown: viewers.length, locked });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

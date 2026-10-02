import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolveEntitlements } from '@/lib/entitlements';
import { createServerClient } from '@/lib/supabase/server';
import { describeViewer } from '@/lib/profile-viewers';

/**
 * "Who viewed your profile" — LinkedIn-style, gated by plan.
 *
 * Source: profile_views (migration 012/075), one row per (creator, viewer,
 * day) for every SIGNED-IN visitor — brands AND other creators. It used to read
 * creator_profile_views, which only ever held brands. Signed-out visitors are
 * not recorded anywhere (record_profile_view needs a session), so they can't
 * appear here.
 *
 * The read gate: the most recent `limits.profileViewers` viewers come back
 * identified (name, photo, profile link). Everyone after that comes back in
 * `hidden`, described but never named — "A brand in Food & Beverage from
 * Bengaluru", "A Fashion creator from Chennai" — with no id that could be
 * looked up. Pro (or subscriptions switched off) identifies everyone.
 *
 * Envelope: `{ viewers, hidden, total, shown, locked, thisWeek }`.
 * `viewers`, `total`, `shown` and `locked` keep their old meaning so installed
 * apps that predate `hidden` render exactly as before. `businessId` is kept on
 * each viewer for those apps; it now holds the viewer's id whatever the role.
 */

/** Rows read per request — ~1000 is PostgREST's own cap anyway. */
const MAX_ROWS = 1000;

interface ViewRow {
  viewer_user_id: string | null;
  viewed_at: string;
}

interface ViewerCard {
  role: 'business_owner' | 'influencer' | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  category: string | null;
  city: string | null;
}

/**
 * Display cards for viewers. Service-role on purpose: `username`, `logo_url`,
 * `avatar_url` and `city` are outside `authenticated`'s column grants (053),
 * and naming any of them on the caller's client fails the whole query (42501).
 * Only ids read from the caller's OWN profile_views rows (RLS:
 * influencer_user_id = auth.uid()) are ever passed in.
 */
async function viewerCards(ids: string[]): Promise<Map<string, ViewerCard>> {
  const out = new Map<string, ViewerCard>();
  if (ids.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return out;
  const serviceClient = createServerClient();
  const [{ data: base }, { data: biz }, { data: inf }] = await Promise.all([
    serviceClient.from('profiles').select('id, name, role').in('id', ids),
    serviceClient.from('business_profiles').select('user_id, company_name, username, logo_url, industry, city').in('user_id', ids),
    serviceClient.from('influencer_profiles').select('user_id, username, avatar_url, niche, city').in('user_id', ids),
  ]);
  for (const p of (base ?? []) as { id: string; name: string | null; role: string | null }[]) {
    out.set(p.id, {
      role: p.role === 'business_owner' || p.role === 'influencer' ? p.role : null,
      name: p.name,
      username: null,
      avatarUrl: null,
      category: null,
      city: null,
    });
  }
  for (const b of (biz ?? []) as {
    user_id: string; company_name: string | null; username: string | null;
    logo_url: string | null; industry: string | null; city: string | null;
  }[]) {
    const c = out.get(b.user_id);
    if (!c || c.role !== 'business_owner') continue;
    c.name = b.company_name || c.name;
    c.username = b.username;
    c.avatarUrl = b.logo_url;
    c.category = b.industry;
    c.city = b.city;
  }
  for (const i of (inf ?? []) as {
    user_id: string; username: string | null; avatar_url: string | null;
    niche: string[] | null; city: string | null;
  }[]) {
    const c = out.get(i.user_id);
    if (!c || c.role !== 'influencer') continue;
    c.username = i.username;
    c.avatarUrl = i.avatar_url;
    c.category = i.niche?.[0] ?? null;
    c.city = i.city;
  }
  return out;
}

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
      .from('profile_views')
      .select('viewer_user_id, viewed_at')
      .eq('influencer_user_id', user.id)
      .not('viewer_user_id', 'is', null)
      .order('viewed_at', { ascending: false })
      .limit(MAX_ROWS);

    if (error) {
      // Table missing on an environment behind on migrations — an empty list
      // beats a broken screen.
      return NextResponse.json({ viewers: [], hidden: [], total: 0, shown: 0, locked: 0, thisWeek: 0, degraded: true });
    }

    // One entry per viewer, most recent first; viewCount = days they came back.
    const byViewer = new Map<string, { last: string; days: number }>();
    for (const r of (rows ?? []) as ViewRow[]) {
      if (!r.viewer_user_id) continue;
      const seen = byViewer.get(r.viewer_user_id);
      if (seen) seen.days += 1;
      else byViewer.set(r.viewer_user_id, { last: r.viewed_at, days: 1 });
    }
    const ordered = [...byViewer.entries()];
    const total = ordered.length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = ordered.filter(([, v]) => new Date(v.last).getTime() >= weekAgo).length;

    const ent = await resolveEntitlements(supabase, user.id);
    const cap = ent.subscriptionsEnabled ? ent.limits.profileViewers : null;
    const identifiedCount = typeof cap === 'number' ? Math.min(cap, total) : total;

    const cards = await viewerCards(ordered.map(([id]) => id));

    const viewers = ordered.slice(0, identifiedCount).map(([id, v]) => {
      const card = cards.get(id);
      return {
        viewerId: id,
        businessId: id,
        role: card?.role ?? null,
        name: card?.name ?? null,
        username: card?.username ?? null,
        avatarUrl: card?.avatarUrl ?? null,
        descriptor: describeViewer(card),
        viewCount: v.days,
        lastViewedAt: v.last,
      };
    });

    // Described, never identified: no id, name, photo or username leaves here.
    const hidden = ordered.slice(identifiedCount).map(([, v], i) => {
      const card = cards.get(ordered[identifiedCount + i][0]);
      return {
        key: `hidden-${i}`,
        role: card?.role ?? null,
        descriptor: describeViewer(card),
        viewCount: v.days,
        lastViewedAt: v.last,
      };
    });

    return NextResponse.json({
      viewers,
      hidden,
      total,
      shown: viewers.length,
      locked: hidden.length,
      thisWeek,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

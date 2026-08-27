/**
 * GET  /api/campaigns → { campaigns }
 * POST /api/campaigns → { campaign }
 *
 * Envelope: `campaigns` on list, `campaign` on single.
 *
 * GET filters: category, platform, min_followers, max_followers, sort (newest|closing_soon)
 * Only returns live, non-expired campaigns. Blocked users are excluded server-side.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

const ListQuerySchema = z.object({
  category: z.string().optional(),
  platform: z.string().optional(),
  min_followers: z.coerce.number().int().nonnegative().optional(),
  max_followers: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(['newest', 'closing_soon']).default('newest'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).default(''),
  deliverables: z.string().max(4000).default(''),
  platforms: z.array(z.string()).default([]),
  budget_min: z.number().nonnegative().optional(),
  budget_max: z.number().nonnegative().optional(),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  delivery_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  applications_close_at: z.string().datetime().optional(),
  follower_min: z.number().int().nonnegative().optional(),
  follower_max: z.number().int().nonnegative().optional(),
  categories: z.array(z.string()).default([]),
  location: z.string().max(200).optional(),
  expires_at: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const url = new URL(req.url);
    const parsed = ListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { category, platform, min_followers, max_followers, sort, limit, offset } = parsed.data;

    let query = supabase
      .from('campaigns')
      .select(`
        id, title, description, deliverables, platforms, budget_min, budget_max,
        currency, starts_on, delivery_by, applications_close_at,
        follower_min, follower_max, categories, location, status,
        published_at, expires_at, created_at,
        business_user:profiles!campaigns_business_user_id_fkey(id, name)
      `, { count: 'exact' })
      .eq('status', 'live')
      .gt('expires_at', new Date().toISOString())
      .range(offset, offset + limit - 1);

    if (category) query = query.contains('categories', [category]);
    if (platform) query = query.contains('platforms', [platform]);
    if (min_followers) query = query.lte('follower_min', min_followers);
    if (max_followers) query = query.gte('follower_max', max_followers);

    query = query.order(sort === 'closing_soon' ? 'expires_at' : 'published_at', { ascending: sort === 'closing_soon' });

    const { data: campaigns, error, count } = await query;
    if (error) return jsonError(500, 'Failed to fetch campaigns', error);

    return NextResponse.json({ campaigns: campaigns ?? [], total: count ?? 0 });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    const limited = await enforceRateLimit(req, {
      bucket: 'campaigns:create', limit: 10, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    // Only approved businesses can publish
    if (role !== 'business_owner') {
      return jsonError(403, 'Only business accounts can create campaigns');
    }

    const { data: bizProfile } = await supabase
      .from('business_profiles')
      .select('approval_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (bizProfile?.approval_status !== 'approved') {
      return jsonError(403, 'Your business account must be approved before publishing campaigns');
    }

    const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const data = parsed.data;
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        business_user_id: user.id,
        title: data.title,
        description: data.description,
        deliverables: data.deliverables,
        platforms: data.platforms,
        budget_min: data.budget_min ?? null,
        budget_max: data.budget_max ?? null,
        starts_on: data.starts_on ?? null,
        delivery_by: data.delivery_by ?? null,
        applications_close_at: data.applications_close_at ?? null,
        follower_min: data.follower_min ?? null,
        follower_max: data.follower_max ?? null,
        categories: data.categories,
        location: data.location ?? null,
        expires_at: data.expires_at ?? null,
        // Start as draft — C5 spam controls gate the transition to live
        status: 'draft',
      })
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to create campaign', error);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

/**
 * GET  /api/campaigns → { campaigns }
 * POST /api/campaigns → { campaign }
 *
 * Envelope: `campaigns` on list, `campaign` on single.
 *
 * GET filters: q, category, platform, min_followers, max_followers, sort (newest|closing_soon)
 * Only returns live, non-expired campaigns by default.
 *
 * `q` is full-text (migration 144), and is the one a creator actually reaches
 * for: `category` only matches a tag the brand happened to pick, so someone
 * typing "restaurant" finds nothing when the campaign is tagged "Food". This
 * search is scoped to campaigns and has nothing to do with /api/discover,
 * which searches creators.
 *
 * ?mine=true switches to "every campaign I own, any status" — a business
 * owner otherwise had no way to find a draft again once they navigated away
 * from the page they created it on: drafts don't appear on the public board
 * (by design — nobody else should see them), and there was no other route
 * that would list them. RLS's own campaigns_select_own policy already allows
 * this read; this just exposes it as a real query rather than a raw table
 * scan a brand would have to run in SQL.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

const ListQuerySchema = z.object({
  /**
   * Free-text search over title / categories / platforms / location /
   * description / deliverables — see the `search_vector` column and its
   * trigger in migration 144.
   *
   * Deliberately NOT the same thing as `category`: that is an exact tag match
   * a brand had to have picked, and it is useless to a creator who types
   * "restaurant" when the brand tagged the campaign "Food & Beverage".
   */
  q: z.string().trim().max(120).optional(),
  category: z.string().optional(),
  platform: z.string().optional(),
  min_followers: z.coerce.number().int().nonnegative().optional(),
  max_followers: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(['newest', 'closing_soon']).default('newest'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  mine: z.coerce.boolean().default(false),
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
    const { q, category, platform, min_followers, max_followers, sort, limit, offset, mine } =
      parsed.data;

    /**
     * Built as a function because it may need to run twice — see the
     * `search_vector` fallback below.
     *
     * `mode` is how `q` is matched. 'fts' is the real thing: `websearch` is the
     * parser that treats a bare multi-word query as "all of these words",
     * understands quoted phrases and a leading `-`, and — unlike `plain` —
     * never throws on punctuation a user typed. English stemming is what makes
     * "restaurants" find "restaurant", which is the whole reason this is
     * full-text and not an ILIKE.
     */
    const build = (mode: 'fts' | 'ilike') => {
      let query = supabase
        .from('campaigns')
        .select(`
          id, title, description, deliverables, platforms, budget_min, budget_max,
          currency, starts_on, delivery_by, applications_close_at,
          follower_min, follower_max, categories, location, status,
          published_at, expires_at, created_at,
          business_user:profiles!campaigns_business_user_id_fkey(id, name)
        `, { count: 'exact' })
        .range(offset, offset + limit - 1);

      if (mine) {
        // Every campaign this caller owns, any status — RLS still restricts
        // this to rows they actually own even if business_user_id were omitted.
        query = query.eq('business_user_id', user.id);
      } else {
        query = query.eq('status', 'live').gt('expires_at', new Date().toISOString());
      }

      if (q) {
        if (mode === 'fts') {
          query = query.textSearch('search_vector', q, { type: 'websearch', config: 'english' });
        } else {
          // PostgREST `or` is comma-separated and treats commas inside a value
          // as separators, so a comma in the query would rewrite the filter.
          const safe = q.replace(/[,()]/g, ' ').trim();
          query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
        }
      }

      if (category) query = query.contains('categories', [category]);
      if (platform) query = query.contains('platforms', [platform]);
      if (min_followers) query = query.lte('follower_min', min_followers);
      if (max_followers) query = query.gte('follower_max', max_followers);

      // A draft has no published_at, so ordering by it would scatter drafts
      // unpredictably — created_at is always present.
      return mine
        ? query.order('created_at', { ascending: false })
        : query.order(sort === 'closing_soon' ? 'expires_at' : 'published_at', { ascending: sort === 'closing_soon' });
    };

    let { data: campaigns, error, count } = await build('fts');

    /**
     * `search_vector` arrives in migration 144, and the app code that queries
     * it ships on the same push through a DIFFERENT workflow (mobile-update.yml
     * publishes the OTA; the migrate job runs on the deploy). Either can land
     * first, and staging has its own database that may be further behind still.
     *
     * So: a missing column is "the migration has not caught up", not "the board
     * is broken". Degrade to a title/description ILIKE — dumber, but it still
     * answers the question the user asked. Deliberately NOT degrading to "no
     * filter": returning the entire board to someone who searched "food" is
     * worse than a rough answer, because it looks like a correct one.
     */
    if (error && /search_vector/.test(`${error.message} ${error.details ?? ''}`)) {
      ({ data: campaigns, error, count } = await build('ilike'));
    }
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

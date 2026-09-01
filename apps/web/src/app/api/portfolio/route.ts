import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePortfolioLink } from '@/lib/portfolio-link';
import { resolveInstagramThumbnail } from '@/lib/portfolio-thumbnail';

/**
 * The creator's portfolio: past work they add themselves, merged with the
 * completed Influnet projects the platform can vouch for.
 *
 * GET is the OWNER's view (get_my_portfolio, migration 088) — it includes
 * items hidden from the public, with `is_visible` on each, so there is
 * something to toggle back on. This is deliberately a different function from
 * the one the public profile reads (get_creator_portfolio): that one is
 * SECURITY DEFINER and granted to anon, so it can never be the thing that
 * decides whether to reveal hidden rows — see the migration for why.
 *
 * Writes only ever touch the manual half — platform entries are derived from
 * campaign_projects and are not rows anybody can edit or hide here yet (see
 * migration 088's header for why that is a separate piece of work).
 */

const CreateSchema = z.object({
  // The one required field. Everything else is derived from it or optional.
  url: z.string().min(4).max(2048),
  title: z.string().trim().min(1).max(120).optional(),
  brand_name: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  published_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  views: z.number().int().min(0).max(100_000_000_000).optional(),
  likes: z.number().int().min(0).max(100_000_000_000).optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Cast: the RPC (migration 088) is newer than the generated types.
    const { data, error } = await (supabase.rpc as any)('get_my_portfolio', { p_limit: 24 });

    if (error) {
      /**
       * 087/088 unapplied is the expected state on a database that is behind,
       * and a creator opening their profile should see an empty portfolio
       * rather than a broken screen. Logged, not surfaced.
       */
      return NextResponse.json({ items: [], degraded: true });
    }

    return NextResponse.json({ items: Array.isArray(data) ? data : [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    if (role !== 'influencer') {
      return jsonError(403, 'Only creators have a portfolio.');
    }

    // Each POST may make an outbound oEmbed call, so this is rate-limited per
    // user rather than per IP — a shared office NAT should not throttle
    // everyone because one person is filling in their portfolio.
    const limited = await enforceRateLimit(req, {
      bucket: 'portfolio:create',
      limit: 20,
      windowMs: 60_000,
      key: user.id,
    });
    if (limited) return limited;

    const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, parsed.error.issues[0]?.message ?? 'Validation failed');
    }
    const input = parsed.data;

    // Validates the host and derives platform/thumbnail/title. Throws a
    // creator-facing message for anything it will not accept.
    let resolved;
    try {
      resolved = await resolvePortfolioLink(input.url);
    } catch (err: any) {
      return jsonError(400, err?.message || 'That link cannot be added.');
    }

    /**
     * Instagram gives the pure resolver nothing to derive a thumbnail from, so
     * it is looked up here where there is a database and a user id: first the
     * image our own snapshot pipeline already cached for this creator's recent
     * posts, then the public embed page. Best-effort — a null just means the
     * card renders the branded Instagram tile, exactly as before.
     */
    let thumbnailUrl = resolved.thumbnailUrl;
    if (!thumbnailUrl && resolved.platform === 'instagram' && resolved.postId) {
      thumbnailUrl = await resolveInstagramThumbnail(supabase, user.id, resolved.postId);
    }

    const title = input.title ?? resolved.title;
    if (!title) {
      // YouTube fills this in for us; Instagram and plain links cannot, so the
      // creator has to say what the work was.
      return jsonError(400, 'Give this work a title.');
    }

    const { data, error } = await supabase
      .from('creator_portfolio_items')
      .insert({
        user_id: user.id,
        title,
        brand_name: input.brand_name || null,
        description: input.description || null,
        platform: resolved.platform,
        content_url: resolved.url,
        thumbnail_url: thumbnailUrl,
        published_at: input.published_at || null,
        views: input.views ?? null,
        likes: input.likes ?? null,
      })
      .select()
      .single();

    if (error) {
      // 23505 = the (user_id, content_url) unique index; 23514 = a cap trigger.
      // All the creator's doing and deserving a real sentence, not a 500.
      if (error.code === '23505') {
        return jsonError(409, 'That post is already in your portfolio.');
      }
      // The billing ceiling (migration 139) — a 402 with an upgrade path, told
      // apart from the absolute wall by its machine-readable message.
      if (/portfolio_quota_exceeded/i.test(error.message || '')) {
        return NextResponse.json(
          {
            error:
              'Free portfolios hold 5 items. Upgrade to Pro to add more, or remove one first.',
            feature: 'portfolio.add',
            upgradeUrl: '/dashboard/billing',
          },
          { status: 402 },
        );
      }
      if (error.code === '23514' || /Portfolio is full/i.test(error.message || '')) {
        return jsonError(409, 'Your portfolio is full. Remove one to add another.');
      }
      return jsonError(500, 'Failed to add to your portfolio', error);
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

const VisibilitySchema = z.object({
  id: z.string().uuid(),
  is_visible: z.boolean(),
});

/** Show or hide one manual item on the public profile, without deleting it. */
export async function PATCH(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const parsed = VisibilitySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, 'Validation failed');

    // .eq('user_id', ...) is redundant against RLS and kept for the same
    // reason as DELETE below: this route must never become the path by which
    // one creator edits another's row, even if the policy is ever loosened.
    const { data, error } = await supabase
      .from('creator_portfolio_items')
      .update({ is_visible: parsed.data.is_visible })
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (error) return jsonError(500, 'Failed to update that item', error);
    if (!data) return jsonError(404, 'Not found');

    return NextResponse.json({ item: data });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return jsonError(400, 'Missing id');

    /**
     * The user_id filter is redundant against the RLS delete policy and kept
     * deliberately: if the policy is ever loosened, this route should still not
     * become the way one creator deletes another's work.
     */
    const { error } = await supabase
      .from('creator_portfolio_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return jsonError(500, 'Failed to remove the item', error);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

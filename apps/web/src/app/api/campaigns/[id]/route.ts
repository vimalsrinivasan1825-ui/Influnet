/**
 * GET  /api/campaigns/[id] → { campaign }
 * PATCH /api/campaigns/[id] → { campaign }
 *
 * Envelope: `campaign`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { requireLiveCampaignQuota } from '@/lib/entitlements';

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  deliverables: z.string().max(4000).optional(),
  platforms: z.array(z.string()).optional(),
  budget_min: z.number().nonnegative().nullable().optional(),
  budget_max: z.number().nonnegative().nullable().optional(),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  delivery_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  applications_close_at: z.string().datetime().nullable().optional(),
  follower_min: z.number().int().nonnegative().nullable().optional(),
  follower_max: z.number().int().nonnegative().nullable().optional(),
  categories: z.array(z.string()).optional(),
  location: z.string().max(200).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  status: z.enum(['draft', 'pending_review', 'live', 'closed']).optional(),
});

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        business_user:profiles!campaigns_business_user_id_fkey(id, name, role)
      `)
      .eq('id', id)
      .single();

    if (error || !campaign) return jsonError(404, 'Campaign not found');

    // Live campaigns are public; own campaigns are visible in any state
    const isOwner = campaign.business_user_id === user.id;
    if (campaign.status !== 'live' && !isOwner) {
      return jsonError(404, 'Campaign not found');
    }

    return NextResponse.json({ campaign });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    const { data: existing } = await supabase
      .from('campaigns')
      .select('business_user_id, status, description, deliverables, platforms, expires_at')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return jsonError(404, 'Campaign not found');
    if (existing.business_user_id !== user.id) return jsonError(403, 'Only the campaign owner can edit');

    const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updates[k] = v;
    }

    // If transitioning to 'live', enforce the minimum brief standard (C5) and
    // the free-tier live-campaign cap (C6) — this is where "publish" actually
    // happens; a draft can be as empty as its owner likes.
    if (parsed.data.status === 'live' && existing.status !== 'live') {
      // Title is required (already enforced by schema min(1)).
      const desc = (updates.description as string) ?? existing.description ?? '';
      // BUG FIXED: this previously compared updates.deliverables to itself,
      // so a campaign whose deliverables were set at creation and never
      // resent on this PATCH always evaluated as "" here, regardless of what
      // was actually stored.
      const deliv = (updates.deliverables as string) ?? existing.deliverables ?? '';
      if (desc.length < 50 && deliv.length < 50) {
        return jsonError(400, 'A campaign needs at least 50 characters of description or deliverables before going live.');
      }

      // At least one platform — a brief with none tells a creator nothing
      // about where the work will run.
      const platforms = (updates.platforms as string[] | undefined) ?? existing.platforms ?? [];
      if (!Array.isArray(platforms) || platforms.length === 0) {
        return jsonError(400, 'Pick at least one platform before publishing.');
      }

      // Expiry required at publish, defaulted from billing_settings rather
      // than left to run forever — a campaign nobody set an end date on is
      // exactly the "dead campaign never falls off the board" case C5 exists
      // to prevent.
      if (!updates.expires_at && !existing.expires_at) {
        const { data: settings } = await supabase
          .from('billing_settings')
          .select('campaign_default_days')
          .maybeSingle();
        const days = settings?.campaign_default_days ?? 30;
        updates.expires_at = new Date(Date.now() + days * 864e5).toISOString();
      }

      const quotaBlocked = await requireLiveCampaignQuota(
        auth,
        'You are at your limit for live campaigns. Close one to publish another, or upgrade to Pro for unlimited campaigns.',
      );
      if (quotaBlocked) return quotaBlocked;

      updates.published_at = new Date().toISOString();
    }

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // The route-level requireLiveCampaignQuota() check above is a
      // 60-second-cached read — see resolveEntitlements — so several rapid
      // publishes for one brand can all read the same pre-publish usage
      // count and all pass it. enforce_campaign_quota_trg (migration 131) is
      // the real, uncached backstop for exactly that case, and it CAN fire
      // even when the route-level check just said yes. Map its exception the
      // same way the deal route maps project_quota_exceeded, or this reaches
      // the client as an unexplained 500 instead of "you're at your limit".
      if (error.message?.includes('campaign_quota_exceeded')) {
        return jsonError(402, 'You are at your limit for live campaigns. Close one to publish another, or upgrade to Pro for unlimited campaigns.');
      }
      return jsonError(500, 'Failed to update campaign', error);
    }
    return NextResponse.json({ campaign });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

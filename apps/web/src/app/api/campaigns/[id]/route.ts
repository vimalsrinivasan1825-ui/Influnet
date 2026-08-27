/**
 * GET  /api/campaigns/[id] → { campaign }
 * PATCH /api/campaigns/[id] → { campaign }
 *
 * Envelope: `campaign`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';

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
      .select('business_user_id')
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

    // If transitioning to 'live', set published_at
    if (parsed.data.status === 'live' && !updates.published_at) {
      updates.published_at = new Date().toISOString();
    }

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to update campaign', error);
    return NextResponse.json({ campaign });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

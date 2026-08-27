/**
 * POST /api/campaigns/[id]/applications → { application }
 * GET  /api/campaigns/[id]/applications → { applications }
 * PATCH /api/campaigns/[id]/applications/[appId] → { application }
 *
 * Envelope: `application` on single, `applications` on list.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

const ApplySchema = z.object({
  pitch: z.string().trim().min(10).max(2000),
  proposed_rate: z.number().nonnegative().optional(),
});

const PatchSchema = z.object({
  action: z.enum(['shortlist', 'decline', 'withdraw']),
});

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id: campaignId } = await context.params;

    // Only the campaign owner can see all applications
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('business_user_id')
      .eq('id', campaignId)
      .maybeSingle();

    if (!campaign) return jsonError(404, 'Campaign not found');

    const isOwner = campaign.business_user_id === user.id;

    let query = supabase
      .from('campaign_applications')
      .select(`
        *,
        creator:profiles!campaign_applications_creator_user_id_fkey(id, name, role)
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (!isOwner) {
      // Non-owners can only see their own application
      query = query.eq('creator_user_id', user.id);
    }

    const { data: applications, error } = await query;
    if (error) return jsonError(500, 'Failed to fetch applications', error);

    return NextResponse.json({ applications: applications ?? [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;
    const { id: campaignId } = await context.params;

    // Only creators can apply
    if (role !== 'influencer') {
      return jsonError(403, 'Only creator accounts can apply to campaigns');
    }

    // Rate limit: per creator per week
    const limited = await enforceRateLimit(req, {
      bucket: 'campaigns:apply',
      limit: 10,
      windowMs: 7 * 24 * 60 * 60 * 1000,
      key: user.id,
    });
    if (limited) return limited;

    // Campaign must be live and not expired
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status, expires_at, business_user_id')
      .eq('id', campaignId)
      .maybeSingle();

    if (!campaign) return jsonError(404, 'Campaign not found');
    if (campaign.status !== 'live') {
      return jsonError(400, 'This campaign is not accepting applications');
    }
    if (campaign.expires_at && new Date(campaign.expires_at) < new Date()) {
      return jsonError(400, 'This campaign has expired');
    }

    // Cannot apply to own campaign
    if (campaign.business_user_id === user.id) {
      return jsonError(400, 'You cannot apply to your own campaign');
    }

    const parsed = ApplySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { data: application, error } = await supabase
      .from('campaign_applications')
      .insert({
        campaign_id: campaignId,
        creator_user_id: user.id,
        pitch: parsed.data.pitch,
        proposed_rate: parsed.data.proposed_rate ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return jsonError(409, 'You have already applied to this campaign');
      }
      return jsonError(500, 'Failed to submit application', error);
    }

    return NextResponse.json({ application }, { status: 201 });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

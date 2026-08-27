/**
 * PATCH /api/campaigns/[id]/applications/[appId] → { application }
 *
 * Envelope: `application`.
 *
 * Actions: shortlist, decline, withdraw
 * - Owner can shortlist/decline
 * - Applicant can withdraw
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';

const PatchSchema = z.object({
  action: z.enum(['shortlist', 'decline', 'withdraw']),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; appId: string }> },
) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id: campaignId, appId } = await context.params;

    const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 },
      );
    }
    const { action } = parsed.data;

    // Fetch the application and campaign
    const { data: application } = await supabase
      .from('campaign_applications')
      .select('*, campaign:campaigns!campaign_applications_campaign_id_fkey(business_user_id)')
      .eq('id', appId)
      .eq('campaign_id', campaignId)
      .maybeSingle();

    if (!application) return jsonError(404, 'Application not found');

    const isOwner = (application.campaign as any)?.business_user_id === user.id;
    const isApplicant = application.creator_user_id === user.id;

    if (action === 'withdraw') {
      if (!isApplicant) return jsonError(403, 'Only the applicant can withdraw');
      if (application.status !== 'applied') {
        return jsonError(400, 'Can only withdraw while application is pending');
      }
    } else {
      if (!isOwner) return jsonError(403, 'Only the campaign owner can manage applications');
    }

    const statusMap: Record<string, string> = {
      shortlist: 'shortlisted',
      decline: 'declined',
      withdraw: 'withdrawn',
    };

    const { data: updated, error } = await supabase
      .from('campaign_applications')
      .update({
        status: statusMap[action],
        resolved_at: new Date().toISOString(),
      })
      .eq('id', appId)
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to update application', error);

    return NextResponse.json({ application: updated });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

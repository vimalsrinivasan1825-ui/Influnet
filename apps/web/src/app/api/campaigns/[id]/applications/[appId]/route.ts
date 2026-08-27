/**
 * PATCH /api/campaigns/[id]/applications/[appId] → { application }
 *   → { application, conversation_id } for action: 'accept'
 *
 * Envelope: `application`, plus `conversation_id` on accept.
 *
 * Actions: shortlist, decline, withdraw, accept
 * - Owner can shortlist/decline/accept
 * - Applicant can withdraw
 *
 * C4 — the hand-off. 'accept' is the one action that leaves this table
 * entirely: it calls accept_campaign_application() (migration 129), which
 * materialises a collab_requests row and opens the normal conversation.
 * Everything downstream — terms, project, payments — is the flow that
 * already works; this route does not touch any of it.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';

const PatchSchema = z.object({
  action: z.enum(['shortlist', 'decline', 'withdraw', 'accept']),
});

const ACCEPT_ERRORS: Record<string, [number, string]> = {
  application_not_found: [404, 'That application no longer exists.'],
  campaign_not_found: [404, 'That campaign no longer exists.'],
  not_campaign_owner: [403, 'Only the campaign owner can accept an application.'],
  campaign_not_live: [400, 'This campaign is no longer live.'],
  application_not_acceptable: [409, 'This application has already been resolved.'],
};

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

    if (action === 'accept') {
      const { data: result, error: rpcError } = await supabase.rpc('accept_campaign_application', {
        p_application_id: appId,
      });
      if (rpcError) {
        const hit = Object.entries(ACCEPT_ERRORS).find(([key]) => rpcError.message?.includes(key));
        return hit ? jsonError(hit[1][0], hit[1][1]) : jsonError(500, 'Could not accept the application', rpcError);
      }
      const { data: application } = await supabase
        .from('campaign_applications')
        .select()
        .eq('id', appId)
        .single();
      return NextResponse.json({
        application,
        conversation_id: (result as any)?.conversation_id ?? null,
      });
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

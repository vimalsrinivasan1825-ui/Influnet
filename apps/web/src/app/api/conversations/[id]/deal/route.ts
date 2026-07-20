import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The "deal state" of a 1:1 conversation — everything the in-chat deal card
 * needs to render:
 *
 *   • the collab request that started this conversation (the request card),
 *   • whether the viewer can still accept/decline it,
 *   • the project proposed off the back of it, if any, and whose turn it is,
 *   • whether "Create project" should be enabled for the viewer.
 *
 * A conversation is a lasting 1:1 channel and a pair may run several deals
 * through it over time, so the card tracks the MOST RECENT collab request
 * between the two participants rather than a fixed link.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid conversation ID format');

    // Participation check + identify the other party in one query.
    const { data: participants, error: partErr } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', id);

    if (partErr) return jsonError(500, 'Failed to load conversation participants', partErr);
    if (!participants?.some((p: { user_id: string }) => p.user_id === user.id)) {
      return jsonError(403, 'Forbidden — you are not a participant');
    }

    const otherUserId = participants.find((p: { user_id: string }) => p.user_id !== user.id)?.user_id ?? null;
    if (!otherUserId) {
      return NextResponse.json({ deal: null, other_user_id: null });
    }

    const { data: partner } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', otherUserId)
      .maybeSingle();

    // The brand's profile slug, so the creator can open the (private,
    // relationship-gated) business profile straight from the chat.
    let partnerSlug: string | null = null;
    if (partner?.role === 'business_owner') {
      const { data: biz } = await supabase
        .from('business_profiles')
        .select('username')
        .eq('user_id', otherUserId)
        .maybeSingle();
      partnerSlug = biz?.username ?? null;
    }

    const { data: request, error: reqErr } = await supabase
      .from('collab_requests')
      .select('id, from_user_id, to_user_id, status, message, budget, created_at')
      .or(
        `and(from_user_id.eq.${user.id},to_user_id.eq.${otherUserId}),` +
          `and(from_user_id.eq.${otherUserId},to_user_id.eq.${user.id})`,
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reqErr) return jsonError(500, 'Failed to load the collaboration request', reqErr);

    // The project (proposed or live) that came out of this request.
    let project = null;
    if (request) {
      const { data: proj } = await supabase
        .from('campaign_projects')
        .select('id, title, description, budget, advance_amount, due_date, status, current_stage, created_by_user_id, proposal_note, owner_user_id, counterparty_user_id')
        .eq('collab_request_id', request.id)
        .maybeSingle();
      project = proj ?? null;
    }

    const accepted = request?.status === 'accepted';
    const isReceiver = request?.to_user_id === user.id;

    return NextResponse.json({
      other_user_id: otherUserId,
      partner: partner ? { ...partner, slug: partnerSlug } : null,
      request: request ?? null,
      project,
      viewer: {
        // Only the receiver of a still-pending request can accept or decline it.
        can_respond_to_request: !!request && request.status === 'pending' && isReceiver,
        can_cancel_request: !!request && request.status === 'pending' && !isReceiver,
        // Either side may propose the project once both agreed to talk — but
        // only one project per request.
        can_create_project: accepted && !project,
        // The proposer waits; the other side decides.
        can_respond_to_project:
          !!project && project.status === 'pending_acceptance' && project.created_by_user_id !== user.id,
        awaiting_me:
          !!project && project.status === 'pending_acceptance' && project.created_by_user_id !== user.id,
      },
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

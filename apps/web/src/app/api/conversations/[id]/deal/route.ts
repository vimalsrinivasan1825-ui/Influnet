import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { notifyUser } from '@/lib/notify';
import { profileNames, nameOf } from '@/lib/email/context';
import { requireVerifiedOwnership } from '@/lib/ownership-gate';
import { ensureStageItems } from '@/lib/stage-items-gate';

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
      .select('id, name, role, verified_badge')
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

    // Every collaboration request between this pair, newest first. A brand and
    // a creator work together repeatedly, so the card shows the whole history —
    // not just the most recent request.
    const pairFilter =
      `and(from_user_id.eq.${user.id},to_user_id.eq.${otherUserId}),` +
      `and(from_user_id.eq.${otherUserId},to_user_id.eq.${user.id})`;

    const { data: requests, error: reqErr } = await supabase
      .from('collab_requests')
      .select('id, from_user_id, to_user_id, status, message, budget, created_at')
      .or(pairFilter)
      .order('created_at', { ascending: false });

    if (reqErr) return jsonError(500, 'Failed to load the collaboration requests', reqErr);

    // Projects are matched on the PARTICIPANT PAIR rather than on
    // collab_request_id: projects created before that column existed have it
    // NULL, and looking them up by request made completed work invisible here.
    const { data: projects, error: projErr } = await supabase
      .from('campaign_projects')
      .select('id, title, description, budget, advance_amount, due_date, status, current_stage, created_by_user_id, collab_request_id, owner_user_id, counterparty_user_id, created_at')
      .or(
        `and(owner_user_id.eq.${user.id},counterparty_user_id.eq.${otherUserId}),` +
        `and(owner_user_id.eq.${otherUserId},counterparty_user_id.eq.${user.id})`,
      )
      .order('created_at', { ascending: false });

    if (projErr) return jsonError(500, 'Failed to load the projects', projErr);

    const latest = requests?.[0] ?? null;

    // Terms on the table, plus the last set that was turned down.
    //
    // A decline used to make the terms disappear entirely: the other side got a
    // notification and then found nothing — no record of what was refused, no
    // reason, and no obvious way to try again. Both are returned so the
    // conversation keeps its negotiating history.
    //
    // Degrades to null if migration 071 has not been applied yet, rather than
    // failing the whole card.
    let proposal = null;
    let lastDeclined = null;
    if (latest) {
      const { data: props } = await supabase
        .from('project_proposals')
        .select('id, title, description, budget, advance_amount, due_date, note, review_note, status, proposed_by, resolved_by, resolved_at, created_at')
        .eq('collab_request_id', latest.id)
        .order('created_at', { ascending: false });

      proposal = (props || []).find((p: any) => p.status === 'pending') ?? null;
      lastDeclined = !proposal
        ? (props || []).find((p: any) => p.status === 'declined' || p.status === 'withdrawn') ?? null
        : null;
    }

    // A 069-era project still awaiting acceptance is NOT a live project. It is
    // surfaced as pending terms so it can never be mistaken for started work.
    const legacyPending = (projects || []).find((p: any) => p.status === 'pending_acceptance') ?? null;
    const liveProjects = (projects || []).filter((p: any) => p.status !== 'pending_acceptance');

    // Only block a new proposal on work that is actually still running.
    const openProject = liveProjects.find(
      (p: any) => p.status !== 'completed' && p.status !== 'cancelled',
    ) ?? null;

    const accepted = latest?.status === 'accepted';
    const isReceiver = latest?.to_user_id === user.id;
    const theirProposal = !!proposal && proposal.proposed_by !== user.id;
    const theirLegacyPending = !!legacyPending && legacyPending.created_by_user_id !== user.id;

    return NextResponse.json({
      other_user_id: otherUserId,
      partner: partner ? { ...partner, slug: partnerSlug } : null,
      request: latest,
      requests: requests ?? [],
      projects: liveProjects,
      proposal,
      last_declined: lastDeclined,
      legacy_pending: legacyPending,
      viewer: {
        can_respond_to_request: !!latest && latest.status === 'pending' && isReceiver,
        can_cancel_request: !!latest && latest.status === 'pending' && !isReceiver,
        // New terms can go out once the pair have agreed to talk, provided
        // nothing is already pending and no project is still running.
        can_propose: accepted && !openProject && !proposal && !legacyPending,
        can_respond_to_proposal: theirProposal,
        can_withdraw_proposal: !!proposal && proposal.proposed_by === user.id,
        can_respond_to_legacy_pending: theirLegacyPending,
        awaiting_me: theirProposal || theirLegacyPending,
      },
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

const ProposeSchema = z.object({
  collab_request_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  budget: z.coerce.number().nonnegative().max(100_000_000).optional(),
  advance_amount: z.coerce.number().nonnegative().max(100_000_000).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(2000).optional(),
});

const RespondSchema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum(['accept', 'decline', 'withdraw']),
  note: z.string().max(2000).optional(),
});

const PROPOSE_ERRORS: Record<string, [number, string]> = {
  request_not_found: [404, 'That collaboration request no longer exists.'],
  not_a_participant: [403, 'You are not part of this collaboration.'],
  request_not_accepted: [409, 'Both sides have to accept the request before terms can be proposed.'],
  project_already_exists: [409, 'This collaboration already has a project.'],
  proposal_already_pending: [409, 'There are already terms awaiting a response.'],
  title_required: [400, 'Give the project a title.'],
};

const RESPOND_ERRORS: Record<string, [number, string]> = {
  proposal_not_found: [404, 'Those terms no longer exist.'],
  proposal_not_pending: [409, 'These terms have already been resolved.'],
  not_a_participant: [403, 'You are not part of this collaboration.'],
  proposer_cannot_respond: [403, 'The other side has to accept the terms you proposed.'],
  only_proposer_can_withdraw: [403, 'Only the person who proposed these terms can withdraw them.'],
  no_business_participant: [400, 'A project needs a brand on one side of the collaboration.'],
};

function mapRpcError(message: string | undefined, table: Record<string, [number, string]>) {
  const hit = Object.entries(table).find(([key]) => message?.includes(key));
  return hit ? jsonError(hit[1][0], hit[1][1]) : null;
}

// POST — put proposed terms on the table.
//
// This writes a `project_proposals` row and NOTHING else. No campaign_project
// exists until the other side accepts, so an un-agreed deal never shows up in
// the projects list or the stage pipeline.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid conversation ID format');

    const limited = await enforceRateLimit(req, {
      bucket: 'deal:propose', limit: 20, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const parsed = ProposeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { collab_request_id, title, description, budget, advance_amount, due_date, note } = parsed.data;

    if (advance_amount != null && budget != null && advance_amount > budget) {
      return jsonError(400, 'The advance can’t be more than the total budget.');
    }

    const { data: result, error } = await supabase.rpc('propose_project', {
      p_collab_request_id: collab_request_id,
      p_title: title,
      p_description: description ?? '',
      p_budget: budget ?? null,
      p_advance_amount: advance_amount ?? null,
      p_due_date: due_date ?? null,
      p_note: note ?? null,
    });
    if (error) {
      return mapRpcError(error.message, PROPOSE_ERRORS) ?? jsonError(500, 'Could not send the terms', error);
    }

    if (result?.awaiting_user_id) {
      const awaitingId = result.awaiting_user_id as string;
      const names = await profileNames([awaitingId]);
      const chatLink = `/dashboard/messages?conv=${id}`;

      await notifyUser({
        userId: awaitingId,
        type: 'collab_request',
        title: `Terms proposed: “${title}”`,
        body: budget != null
          ? `₹${Number(budget).toLocaleString('en-IN')} on the table. Open the chat to accept them and start the project — or keep negotiating.`
          : 'Open the chat to review the terms and start the project — or keep negotiating.',
        // Deep-links to THIS conversation so the notification says exactly
        // which chat to open.
        link: chatLink,
        email: {
          // Proposed terms are precisely "nothing moves until you answer",
          // which is what this template says.
          templateId: 'project_action_needed',
          dedupeKey: `proposal:${result.proposal_id}`,
          data: {
            recipientName: nameOf(names, awaitingId),
            projectName: title,
            stage: 'Terms proposed',
            action:
              budget != null
                ? `Review the terms — ₹${Number(budget).toLocaleString('en-IN')} — and accept them to start the project, or keep negotiating in the chat.`
                : 'Review the terms and accept them to start the project, or keep negotiating in the chat.',
            waitingSince: null,
            dashboardUrl: chatLink,
          },
        },
      });
    }

    return NextResponse.json({ proposal_id: result?.proposal_id, status: result?.status });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// PATCH — accept / decline / withdraw the proposed terms.
// Accepting is the ONLY thing that creates a campaign_project.
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid conversation ID format');

    const parsed = RespondSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { proposal_id, action, note } = parsed.data;

    // Accepting is what creates the project — a creator who hasn't proven
    // ownership of their Instagram yet can't do that. See lib/ownership-gate.ts.
    if (action === 'accept') {
      const gateRes = await requireVerifiedOwnership(supabase, user, role);
      if (gateRes) return gateRes;
    }

    // NOTE: 069-era 'pending_acceptance' projects were answered here via
    // respond_to_project_proposal(). Migration 071 DROPPED that function and
    // converted every such row into a project_proposals row, so the path could
    // only ever 500. Detection of those rows is kept in GET (and they stay
    // excluded from project listings) purely as a safety net.
    if (!proposal_id) return jsonError(400, 'proposal_id is required');

    if (action === 'withdraw') {
      const { error } = await supabase.rpc('withdraw_proposal', { p_proposal_id: proposal_id });
      if (error) {
        return mapRpcError(error.message, RESPOND_ERRORS) ?? jsonError(500, 'Could not withdraw the terms', error);
      }
      return NextResponse.json({ ok: true, withdrawn: true });
    }

    const accepting = action === 'accept';

    // Read the title BEFORE responding: respond_to_proposal returns ids only,
    // and on the declined path there is no project row to read it back from.
    const { data: proposalRow } = await supabase
      .from('project_proposals')
      .select('title')
      .eq('id', proposal_id)
      .maybeSingle();

    const { data: result, error } = await supabase.rpc('respond_to_proposal', {
      p_proposal_id: proposal_id,
      p_accept: accepting,
      p_note: note ?? null,
    });
    if (error) {
      // The plan cap on active projects is enforced by a BEFORE INSERT trigger
      // on campaign_projects (migration 115), because that is the one place a
      // project row is ever written and a trigger is atomic with the insert.
      //
      // It has to be translated separately from RESPOND_ERRORS because the
      // quota belongs to the BRAND while either party may be the one accepting.
      // Telling a creator "you have reached your project limit" would be both
      // wrong and unactionable — they have no limit and no way to clear it.
      if (error.message?.includes('project_quota_exceeded')) {
        return role === 'business_owner'
          ? jsonError(
              402,
              'You are at your limit for active projects. Finish or archive one to start another, or upgrade to Pro for unlimited projects.',
            )
          : jsonError(
              409,
              'This brand has reached their limit for active projects right now. They will need to free up a slot before this project can start.',
            );
      }
      // Separate from the active-projects cap above: this one never clears on
      // its own (migration 117) because it counts every project a Free brand
      // has EVER converted, not how many are running right now.
      if (error.message?.includes('project_conversion_limit_exceeded')) {
        return role === 'business_owner'
          ? jsonError(
              402,
              'You have used all your free project conversions. Upgrade to Pro for unlimited projects.',
            )
          : jsonError(
              409,
              'This brand has used all their free project conversions and will need to upgrade before this project can start.',
            );
      }
      return mapRpcError(error.message, RESPOND_ERRORS) ?? jsonError(500, 'Could not respond to the terms', error);
    }

    // Materialise the new project's stage checklist right away, so a project is
    // never observable without one. The advance/sign-off gate materialises it
    // too (lib/stage-items-gate.ts) and THAT is the security boundary — this is
    // about consistency: anything reading the checklist for display, for a
    // notification, or in the admin views should not see an empty list on a
    // project that definitely has requirements.
    //
    // Non-fatal by design: the project exists either way, and the gate will
    // seed it on first use if this fails.
    if (accepting && result?.project_id) {
      try {
        await ensureStageItems(supabase, result.project_id as number);
      } catch (seedErr) {
        console.error('[deal] stage checklist seeding failed (gate will retry):', seedErr);
      }
    }

    const proposerId = result?.notify_user_id as string | undefined;
    if (proposerId) {
      const names = await profileNames([proposerId, user.id]);
      const actorName = nameOf(names, user.id);
      const projectName = (proposalRow as { title?: string } | null)?.title || 'your project';
      const destination =
        accepting && result?.project_id
          ? `/dashboard/projects/${result.project_id}`
          : `/dashboard/messages?conv=${id}`;

      await notifyUser({
        userId: proposerId,
        type: 'project_stage',
        title: accepting ? 'Project started' : 'Terms declined',
        body: accepting
          ? 'Your terms were accepted — the project is now live.'
          : note
            ? `Your terms were declined: “${note}” — pick it back up in the chat.`
            : 'Your terms were declined. Keep talking and propose new ones when you’re ready.',
        link: destination,
        email: accepting
          ? {
              templateId: 'project_stage',
              dedupeKey: `proposal_accepted:${proposal_id}`,
              data: {
                recipientName: nameOf(names, proposerId),
                projectName,
                stage: 'brief',
                actorName,
                note: null,
                dashboardUrl: destination,
              },
            }
          : {
              // project_stage would wrongly imply the project moved forward.
              templateId: 'decision_outcome',
              dedupeKey: `proposal_declined:${proposal_id}`,
              data: {
                recipientName: nameOf(names, proposerId),
                actorName,
                subjectName: projectName,
                decision: 'Terms declined',
                note: note || null,
                consequence:
                  'Nothing is lost — keep talking and propose new terms when you are ready.',
                ctaLabel: 'Open the chat',
                dashboardUrl: destination,
              },
            },
      });
    }

    return NextResponse.json({
      ok: true,
      accepted: accepting,
      project_id: result?.project_id ?? null,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

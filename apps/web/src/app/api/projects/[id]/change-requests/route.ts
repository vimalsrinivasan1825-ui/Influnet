import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';
import { notifyUser } from '@/lib/notify';
import { logActivity } from '@/lib/activity';

// The deal terms that can be changed via the propose → confirm loop.
const EDITABLE_FIELDS = ['title', 'description', 'deliverables', 'budget', 'advance_amount', 'due_date'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

const ChangesSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  deliverables: z.string().max(4000).optional(),
  budget: z.coerce.number().nonnegative().max(100_000_000).optional(),
  // advance_amount and due_date are renegotiated as often as the headline
  // budget is — leaving them out of the schema silently dropped them.
  advance_amount: z.coerce.number().nonnegative().max(100_000_000).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((c) => Object.keys(c).length > 0, { message: 'Propose at least one change.' });

const PostSchema = z.object({ changes: ChangesSchema });
const PatchSchema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(['accept', 'reject', 'withdraw']),
  note: z.string().max(2000).optional(),
});

// Human, name-free summary of a change set (the timeline prefixes the actor).
function describeChanges(changes: Record<string, unknown>): string {
  const parts: string[] = [];
  if ('budget' in changes) parts.push(`the budget to ₹${Number(changes.budget).toLocaleString('en-IN')}`);
  if ('advance_amount' in changes) parts.push(`the advance to ₹${Number(changes.advance_amount).toLocaleString('en-IN')}`);
  if ('due_date' in changes) parts.push(`the due date to ${changes.due_date}`);
  if ('title' in changes) parts.push(`the title to “${changes.title}”`);
  if ('deliverables' in changes) parts.push('the deliverables');
  if ('description' in changes) parts.push('the description');
  return parts.join(', ');
}

async function loadParticipantProject(supabase: any, projectId: number, userId: string) {
  const { data: project, error } = await supabase
    .from('campaign_projects')
    .select('id, title, owner_user_id, counterparty_user_id, description, deliverables, budget, advance_amount, due_date, conversation_id')
    .eq('id', projectId)
    .single();
  if (error || !project) return { error: jsonError(404, 'Project not found') };
  if (project.owner_user_id !== userId && project.counterparty_user_id !== userId) {
    return { error: jsonError(403, 'Forbidden') };
  }
  return { project };
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const { project, error } = await loadParticipantProject(supabase, projectId, user.id);
    if (error) return error;

    const { data: rows, error: rowsErr } = await supabase
      .from('project_change_requests')
      .select('id, proposed_by, status, changes, before, review_note, reviewed_by, created_at, resolved_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    // Degrade gracefully if the table isn't migrated yet.
    if (rowsErr) return NextResponse.json({ change_requests: [] });
    return NextResponse.json({ change_requests: rows || [], project_id: project.id });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { project, error } = await loadParticipantProject(supabase, projectId, user.id);
    if (error) return error;

    const changes = parsed.data.changes as Record<EditableField, unknown>;
    // Snapshot the current values of exactly the fields being changed.
    const before: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in changes) before[key] = (project as any)[key] ?? null;
    }

    const { data: created, error: insErr } = await supabase
      .from('project_change_requests')
      .insert({ project_id: projectId, proposed_by: user.id, status: 'pending', changes, before })
      .select()
      .single();
    if (insErr) return jsonError(500, 'Could not create the change request', insErr);

    const counterpartyId = project.owner_user_id === user.id ? project.counterparty_user_id : project.owner_user_id;
    const proposerRole = project.owner_user_id === user.id ? 'brand' : 'creator';
    const projectLabel = project.title ? `“${project.title}”` : 'your project';
    if (counterpartyId) {
      await notifyUser({
        userId: counterpartyId,
        type: 'project_stage',
        title: `${projectLabel}: change proposed`,
        body: `The ${proposerRole} proposed changing ${describeChanges(changes)}. Review to accept or reject.`,
        link: `/dashboard/projects/${projectId}`,
      });
    }
    await logActivity(supabase, {
      projectId, actorUserId: user.id, type: 'terms_change_proposed',
      summary: `Proposed changing ${describeChanges(changes)}`,
      metadata: { changes },
    });

    return NextResponse.json({ change_request: created });
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
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { request_id, action, note } = parsed.data;

    const { project, error } = await loadParticipantProject(supabase, projectId, user.id);
    if (error) return error;

    const { data: cr, error: crErr } = await supabase
      .from('project_change_requests')
      .select('*')
      .eq('id', request_id)
      .eq('project_id', projectId)
      .single();
    if (crErr || !cr) return jsonError(404, 'Change request not found');
    if (cr.status !== 'pending') return jsonError(409, 'This change request has already been resolved.');

    const isProposer = cr.proposed_by === user.id;
    const now = new Date().toISOString();
    const counterpartyId = project.owner_user_id === user.id ? project.counterparty_user_id : project.owner_user_id;
    const projectLabel = project.title ? `“${project.title}”` : 'your project';
    const actorRole = project.owner_user_id === user.id ? 'brand' : 'creator';

    // WITHDRAW — only the proposer.
    if (action === 'withdraw') {
      if (!isProposer) return jsonError(403, 'Only the person who proposed the change can withdraw it.');
      const { data: updated, error: upErr } = await supabase
        .from('project_change_requests')
        .update({ status: 'withdrawn', resolved_at: now })
        .eq('id', request_id).eq('project_id', projectId).select().single();
      if (upErr) return jsonError(500, 'Could not withdraw the change request', upErr);
      return NextResponse.json({ change_request: updated });
    }

    // ACCEPT / REJECT — only the OTHER party.
    if (isProposer) return jsonError(403, 'The other party has to review the change you proposed.');

    if (action === 'reject') {
      const { data: updated, error: upErr } = await supabase
        .from('project_change_requests')
        .update({ status: 'rejected', review_note: note || null, reviewed_by: user.id, resolved_at: now })
        .eq('id', request_id).eq('project_id', projectId).select().single();
      if (upErr) return jsonError(500, 'Could not reject the change request', upErr);
      if (cr.proposed_by) {
        await notifyUser({
          userId: cr.proposed_by, type: 'project_stage',
          title: `${projectLabel}: change rejected`,
          body: note
            ? `The ${actorRole} rejected your change: “${note}” — talk it through in chat.`
            : `The ${actorRole} rejected your proposed change. Talk it through in chat and propose new terms.`,
          // Rejection means "let's discuss", so this drops them straight into
          // the conversation rather than back onto the card they just lost.
          link: project.conversation_id
            ? `/dashboard/messages?conv=${project.conversation_id}`
            : `/dashboard/projects/${projectId}`,
        });
      }
      await logActivity(supabase, {
        projectId, actorUserId: user.id, type: 'terms_change_rejected',
        summary: `Rejected a proposed change to ${describeChanges(cr.changes || {})}`,
        metadata: { request_id, note: note || null },
      });
      return NextResponse.json({ change_request: updated });
    }

    // ACCEPT — apply the changes and close the request, in one call.
    //
    // This goes through apply_change_request (migration 082) rather than
    // updating campaign_projects here. Agreed terms are locked at the database
    // level: without that lock, either participant could PATCH PostgREST
    // directly and move the budget on a live project with no proposal and no
    // trace. The RPC is the one sanctioned writer, and it re-checks consent
    // itself — the checks above are for the error messages, not the security.
    const changes = (cr.changes || {}) as Record<string, unknown>;

    // Cast: this RPC is newer than the generated Supabase types.
    const { error: applyErr } = await (supabase.rpc as any)('apply_change_request', {
      p_request_id: request_id,
    });
    if (applyErr) {
      // The function's own guards, mapped back to something a user can act on.
      const msg = applyErr.message || '';
      if (msg.includes('proposer_cannot_accept')) {
        return jsonError(403, 'The other party has to review the change you proposed.');
      }
      if (msg.includes('change_request_already_resolved')) {
        return jsonError(409, 'This change request has already been resolved.');
      }
      if (msg.includes('not_a_participant')) return jsonError(403, 'Forbidden');
      return jsonError(500, 'Could not apply the change to the project', applyErr);
    }

    const { data: updated, error: upErr } = await supabase
      .from('project_change_requests')
      .select()
      .eq('id', request_id).eq('project_id', projectId).single();
    if (upErr) return jsonError(500, 'Could not read back the change request', upErr);

    if (cr.proposed_by) {
      await notifyUser({
        userId: cr.proposed_by, type: 'project_stage',
        title: `${projectLabel}: change accepted`,
        body: `The ${actorRole} accepted your change to ${describeChanges(changes)}.`,
        link: `/dashboard/projects/${projectId}`,
      });
    }
    await logActivity(supabase, {
      projectId, actorUserId: user.id, type: 'terms_change_accepted',
      summary: `Accepted a change — updated ${describeChanges(changes)}`,
      metadata: { request_id, changes },
    });

    return NextResponse.json({ change_request: updated });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

/**
 * The admin support inbox.
 *
 * Uses the service-role client from `withAdmin` because the queue joins
 * `profiles` for the requester's name and email — columns that migration 048
 * hides from the `authenticated` role via column grants.
 */

const STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const ticketId = url.searchParams.get('id');

    // Single-thread view, including internal notes (admins only ever read this
    // route, and the service-role client bypasses the RLS filter that hides
    // them from users).
    if (ticketId) {
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .select(`
          id, subject, category, status, priority, context, created_at,
          resolved_at, awaiting_admin, last_message_at,
          user:profiles!support_tickets_user_id_fkey(id, name, email, role)
        `)
        .eq('id', ticketId)
        .maybeSingle();

      if (error) return jsonError(500, 'Could not load the ticket', error);
      if (!ticket) return jsonError(404, 'Ticket not found');

      const { data: messages, error: messagesError } = await supabase
        .from('ticket_messages')
        .select('id, body, from_admin, internal, created_at, author_id')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (messagesError) return jsonError(500, 'Could not load the ticket', messagesError);
      return NextResponse.json({ ticket, messages: messages ?? [] });
    }

    let query = supabase
      .from('support_tickets')
      .select(`
        id, subject, category, status, priority, created_at,
        last_message_at, awaiting_admin,
        user:profiles!support_tickets_user_id_fkey(id, name, email, role)
      `)
      // Oldest waiting first: the queue's job is to surface who has been
      // ignored longest, not who wrote most recently.
      .order('awaiting_admin', { ascending: false })
      .order('last_message_at', { ascending: true })
      .limit(200);

    if (status && (STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['open', 'pending']);
    }

    const { data, error } = await query;
    if (error) return jsonError(500, 'Could not load the support queue', error);

    // Counters come from the RPC so the numbers on the badge and the numbers
    // in the list can never disagree because of a different WHERE clause.
    const { data: stats } = await supabase.rpc('get_admin_support_stats');

    return NextResponse.json({ tickets: data ?? [], stats: stats ?? null });
  } catch (error) {
    return jsonError(500, 'Could not load the support queue', error);
  }
}

/** Admin reply, including internal notes. */
export async function POST(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      ticket_id?: unknown;
      message?: unknown;
      internal?: unknown;
    };

    const ticketId = typeof body.ticket_id === 'string' ? body.ticket_id : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const internal = body.internal === true;

    if (!ticketId) return jsonError(400, 'ticket_id is required');
    if (message.length < 1 || message.length > 5000) {
      return jsonError(400, 'Write a reply between 1 and 5000 characters');
    }

    const { data, error } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: ticketId,
        author_id: user.id,
        from_admin: true,
        internal,
        body: message,
      })
      .select('id, body, from_admin, internal, created_at')
      .single();

    if (error) return jsonError(500, 'Could not send the reply', error);

    await supabase.from('admin_audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action: internal ? 'support.note_added' : 'support.replied',
      target_id: ticketId,
      target_type: 'support_ticket',
    });

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not send the reply', error);
  }
}

/** Move a ticket through the workflow: status, priority, assignment. */
export async function PATCH(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      status?: unknown;
      priority?: unknown;
      assign_to_me?: unknown;
    };

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return jsonError(400, 'id is required');

    const update: Record<string, unknown> = {};

    if (typeof body.status === 'string') {
      if (!(STATUSES as readonly string[]).includes(body.status)) {
        return jsonError(400, `status must be one of ${STATUSES.join(', ')}`);
      }
      update.status = body.status;
      // resolved_at drives the "average resolution time" stat. Set it when we
      // resolve and clear it if the ticket is reopened, so a ticket that
      // bounces twice does not report a negative or stale duration.
      update.resolved_at =
        body.status === 'resolved' || body.status === 'closed' ? new Date().toISOString() : null;
      if (body.status !== 'open') update.awaiting_admin = false;
    }

    if (typeof body.priority === 'string') {
      if (!(PRIORITIES as readonly string[]).includes(body.priority)) {
        return jsonError(400, `priority must be one of ${PRIORITIES.join(', ')}`);
      }
      update.priority = body.priority;
    }

    if (body.assign_to_me === true) update.assigned_to = user.id;
    if (body.assign_to_me === false) update.assigned_to = null;

    if (Object.keys(update).length === 0) {
      return jsonError(400, 'Nothing to update');
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .update(update)
      .eq('id', id)
      .select('id, status, priority, assigned_to, resolved_at')
      .maybeSingle();

    if (error) return jsonError(500, 'Could not update the ticket', error);
    if (!data) return jsonError(404, 'Ticket not found');

    await supabase.from('admin_audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action: 'support.updated',
      target_id: id,
      target_type: 'support_ticket',
      metadata: update,
    });

    return NextResponse.json({ ticket: data });
  } catch (error) {
    return jsonError(500, 'Could not update the ticket', error);
  }
}

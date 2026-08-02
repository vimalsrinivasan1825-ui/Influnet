import { NextResponse } from 'next/server';
import { jsonError, withAuth } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * One ticket thread: read it, reply to it, close it.
 *
 * Every query runs on the caller's client so RLS decides visibility. Note
 * migration 098's SELECT policy on `ticket_messages` excludes `internal`
 * rows — admin-only notes are filtered by the database, not by this route
 * remembering to add `.eq('internal', false)`.
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select('id, subject, category, status, priority, context, created_at, resolved_at')
      .eq('id', id)
      .maybeSingle();

    if (error) return jsonError(500, 'Could not load this request', error);
    // maybeSingle + RLS: someone else's ticket reads as "not found", which is
    // also the correct answer to give — confirming it exists leaks that it does.
    if (!ticket) return jsonError(404, 'Request not found');

    const { data: messages, error: messagesError } = await supabase
      .from('ticket_messages')
      .select('id, body, from_admin, created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (messagesError) return jsonError(500, 'Could not load this request', messagesError);

    return NextResponse.json({ ticket, messages: messages ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load this request', error);
  }
}

/** Reply on the thread. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = await enforceRateLimit(req, {
      bucket: 'support:reply',
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    const { id } = await params;
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    const body = (await req.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < 1 || message.length > 5000) {
      return jsonError(400, 'Write a reply between 1 and 5000 characters');
    }

    // `from_admin` is claimed here but ALSO enforced by the RLS insert policy,
    // which only lets a non-admin write rows with from_admin = false. A forged
    // client cannot make a message look like it came from support.
    const { data, error } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: id,
        author_id: user.id,
        from_admin: role === 'admin',
        body: message,
      })
      .select('id, body, from_admin, created_at')
      .single();

    if (error) return jsonError(500, 'Could not send your reply', error);
    return NextResponse.json({ message: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not send your reply', error);
  }
}

/** A user closing their own request. Admin status changes go through the admin route. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as { status?: unknown };
    if (body.status !== 'closed') {
      return jsonError(400, 'The only change you can make here is closing the request');
    }

    // Scoped by user_id as well as id: the RLS UPDATE policy also allows an
    // admin through, and this route is the USER's path — an admin editing a
    // ticket must go through /api/admin/support so it lands in the audit log.
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status: 'closed' })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, status')
      .maybeSingle();

    if (error) return jsonError(500, 'Could not close this request', error);
    if (!data) return jsonError(404, 'Request not found');
    return NextResponse.json({ ticket: data });
  } catch (error) {
    return jsonError(500, 'Could not close this request', error);
  }
}

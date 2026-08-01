import { NextResponse } from 'next/server';
import { jsonError, withAuth } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * A user's own support tickets.
 *
 * Deliberately uses the CALLER's client rather than a service-role one: the
 * RLS policies in migration 098 already restrict a user to their own rows, so
 * the database is the boundary and this route cannot leak someone else's
 * ticket even if the query is wrong.
 */

const CATEGORIES = ['account', 'payment', 'verification', 'project', 'bug', 'other'] as const;

/**
 * Keys we accept on `context`.
 *
 * An allowlist, not a blocklist: the client sends diagnostic context so the
 * user does not have to describe their setup, and an open-ended object is how
 * an access token or a message draft ends up persisted in a support ticket.
 */
const CONTEXT_KEYS = ['route', 'platform', 'app_version', 'user_agent', 'project_id'] as const;

export function sanitizeContext(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of CONTEXT_KEYS) {
    const value = src[key];
    if (typeof value === 'string' && value.length > 0) {
      out[key] = value.slice(0, 300);
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, subject, category, status, priority, last_message_at, awaiting_admin, created_at')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (error) return jsonError(500, 'Could not load your support tickets', error);
    return NextResponse.json({ tickets: data ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load your support tickets', error);
  }
}

export async function POST(req: Request) {
  try {
    // Tickets create work for a human and send email; an unthrottled endpoint
    // is both a spam vector and a way to make the inbox useless.
    const limited = await enforceRateLimit(req, {
      bucket: 'support:create',
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      subject?: unknown;
      message?: unknown;
      category?: unknown;
      context?: unknown;
    };

    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const category =
      typeof body.category === 'string' && (CATEGORIES as readonly string[]).includes(body.category)
        ? body.category
        : 'other';

    if (subject.length < 3 || subject.length > 200) {
      return jsonError(400, 'Give your request a subject between 3 and 200 characters');
    }
    if (message.length < 10 || message.length > 5000) {
      return jsonError(400, 'Describe the problem in between 10 and 5000 characters');
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject,
        category,
        context: sanitizeContext(body.context),
      })
      .select('id, subject, category, status, priority, created_at')
      .single();

    if (ticketError || !ticket) {
      return jsonError(500, 'Could not open your support request', ticketError);
    }

    // The opening message is a normal ticket message, so the thread has one
    // shape from the start and the admin view needs no special case for it.
    const { error: messageError } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      author_id: user.id,
      from_admin: false,
      body: message,
    });

    if (messageError) {
      // The ticket exists but has no body — an admin would see an empty thread.
      // Surface it rather than reporting success on a half-created request.
      return jsonError(500, 'Your request was created but the message did not save', messageError);
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not open your support request', error);
  }
}

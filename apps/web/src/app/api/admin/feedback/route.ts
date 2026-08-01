import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

/** The product feedback board. */

const STATUSES = ['new', 'triaged', 'planned', 'shipped', 'declined'] as const;

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    let query = supabase
      .from('product_feedback')
      .select(`
        id, kind, message, rating, surface, status, admin_note, created_at,
        user:profiles!product_feedback_user_id_fkey(id, name, role)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (status && (STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) return jsonError(500, 'Could not load feedback', error);

    return NextResponse.json({ feedback: data ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load feedback', error);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      status?: unknown;
      admin_note?: unknown;
    };

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return jsonError(400, 'id is required');

    const update: Record<string, unknown> = {};
    if (typeof body.status === 'string') {
      if (!(STATUSES as readonly string[]).includes(body.status)) {
        return jsonError(400, `status must be one of ${STATUSES.join(', ')}`);
      }
      update.status = body.status;
    }
    if (typeof body.admin_note === 'string') {
      update.admin_note = body.admin_note.trim().slice(0, 2000);
    }

    if (Object.keys(update).length === 0) return jsonError(400, 'Nothing to update');

    const { data, error } = await supabase
      .from('product_feedback')
      .update(update)
      .eq('id', id)
      .select('id, status, admin_note')
      .maybeSingle();

    if (error) return jsonError(500, 'Could not update this feedback', error);
    if (!data) return jsonError(404, 'Feedback not found');

    return NextResponse.json({ feedback: data });
  } catch (error) {
    return jsonError(500, 'Could not update this feedback', error);
  }
}

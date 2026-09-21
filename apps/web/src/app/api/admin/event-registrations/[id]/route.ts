import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

// Door check-in for an event registration (migration 170).
// PATCH { checkedIn: boolean } → { ok, id, checked_in_at }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid registration ID');

    const body = await req.json().catch(() => null);
    if (typeof body?.checkedIn !== 'boolean') return jsonError(400, 'checkedIn must be true or false');

    const { data, error } = await auth.supabase
      .from('event_registrations')
      .update({ checked_in_at: body.checkedIn ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id, checked_in_at')
      .maybeSingle();

    if (error) return jsonError(500, 'Could not update check-in', error);
    if (!data) return jsonError(404, 'Registration not found');

    return NextResponse.json({ ok: true, id: data.id, checked_in_at: data.checked_in_at });
  } catch (error) {
    return jsonError(500, 'Could not update check-in', error);
  }
}

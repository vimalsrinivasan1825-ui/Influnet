import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

// Admin actions on one event registration (migrations 170, 172).
//   PATCH  { checkedIn: boolean }  → door check-in / undo
//   PATCH  { deleted: boolean }    → move to / restore from the Deleted section
//   DELETE                         → permanent; only for rows already in Deleted
// Responds { ok, id, checked_in_at, deleted_at } (DELETE: { ok, deleted: id }).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid registration ID');

    const body = await req.json().catch(() => null);
    const now = new Date().toISOString();
    let patch: Record<string, string | null>;
    if (typeof body?.checkedIn === 'boolean') {
      patch = { checked_in_at: body.checkedIn ? now : null };
    } else if (typeof body?.deleted === 'boolean') {
      patch = { deleted_at: body.deleted ? now : null };
    } else {
      return jsonError(400, 'Send checkedIn or deleted as true or false');
    }

    let q = auth.supabase.from('event_registrations').update(patch).eq('id', id);
    // Checking in someone from the Deleted section would be a mistake.
    if ('checked_in_at' in patch) q = q.is('deleted_at', null);
    const { data, error } = await q.select('id, checked_in_at, deleted_at').maybeSingle();

    if (error) {
      // Restoring when the same phone has registered again since (live rows
      // are unique per phone, migration 172).
      if (error.code === '23505') {
        return jsonError(409, 'This phone number has registered again since — delete that registration first');
      }
      return jsonError(500, 'Could not update registration', error);
    }
    if (!data) return jsonError(404, 'Registration not found');

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return jsonError(500, 'Could not update registration', error);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid registration ID');

    const { data, error } = await auth.supabase
      .from('event_registrations')
      .delete()
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle();

    if (error) return jsonError(500, 'Could not delete registration', error);
    if (!data) return jsonError(409, 'Only registrations in the Deleted section can be deleted permanently');

    return NextResponse.json({ ok: true, deleted: data.id });
  } catch (error) {
    return jsonError(500, 'Could not delete registration', error);
  }
}

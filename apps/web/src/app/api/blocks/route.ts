import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';

const BlockSchema = z.object({ blocked_id: z.string().uuid() });

// GET: list the ids the caller has blocked.
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Embed the blocked profile's name/role — a bare list of ids is useless to
    // show anyone; every client that renders this needs a name to display.
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_id, created_at, blocked:profiles!user_blocks_blocked_id_fkey(id, name, role)')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return jsonError(500, 'Failed to load blocks', error);
    return NextResponse.json({ blocks: data || [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// POST: block a user. DELETE: unblock.
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const parsed = BlockSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, 'Validation failed');
    if (parsed.data.blocked_id === user.id) return jsonError(400, 'You cannot block yourself');

    const { error } = await supabase
      .from('user_blocks')
      .upsert({ blocker_id: user.id, blocked_id: parsed.data.blocked_id }, { onConflict: 'blocker_id,blocked_id' });

    if (error) return jsonError(500, 'Failed to block user', error);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const parsed = BlockSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, 'Validation failed');

    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', parsed.data.blocked_id);

    if (error) return jsonError(500, 'Failed to unblock user', error);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

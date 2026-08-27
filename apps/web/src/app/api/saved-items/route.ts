/**
 * GET    /api/saved-items → { items }
 * POST   /api/saved-items → { item }
 * DELETE /api/saved-items?id=<uuid> → { ok }
 *
 * Envelope: `items` on list, `item` on single.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';

const SaveSchema = z.object({
  kind: z.enum(['creator', 'campaign']),
  target_id: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { data: items, error } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return jsonError(500, 'Failed to fetch saved items', error);
    return NextResponse.json({ items: items ?? [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const parsed = SaveSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { data: item, error } = await supabase
      .from('saved_items')
      .insert({
        user_id: user.id,
        kind: parsed.data.kind,
        target_id: parsed.data.target_id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return jsonError(409, 'Already saved');
      }
      return jsonError(500, 'Failed to save', error);
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonError(400, 'Missing id parameter');

    const { error } = await supabase
      .from('saved_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return jsonError(500, 'Failed to remove saved item', error);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

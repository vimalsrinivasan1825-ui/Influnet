import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, withAuth } from '@/lib/api';

/**
 * POST /api/notifications/opened { deliveryId } → { ok }
 *
 * Called when someone taps a broadcast push. The RPC only ever marks a delivery
 * that belongs to the caller, so a guessed id does nothing.
 */
const Schema = z.object({ deliveryId: z.number().int().positive() });

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await auth.supabase.rpc('mark_delivery_opened', { p_delivery_id: parsed.data.deliveryId });
    if (error) return NextResponse.json({ ok: false });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not record that', error);
  }
}

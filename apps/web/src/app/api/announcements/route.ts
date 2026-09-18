import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, withAuth } from '@/lib/api';

/**
 * GET  /api/announcements → { announcements }
 *   Unseen in-app banners/modals for the caller (migration 157). The toast
 *   style is not returned: those already arrive over Realtime as notifications.
 * POST /api/announcements { broadcastId, action: seen|dismissed|clicked }
 */
const MarkSchema = z.object({
  broadcastId: z.string().uuid(),
  action: z.enum(['seen', 'dismissed', 'clicked']),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { data, error } = await auth.supabase.rpc('get_my_announcements');
    // A database that predates 157 simply has nothing to show.
    if (error) return NextResponse.json({ announcements: [] });
    return NextResponse.json({ announcements: data ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load announcements', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const parsed = MarkSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { error } = await auth.supabase.rpc('mark_announcement', {
      p_broadcast_id: parsed.data.broadcastId,
      p_action: parsed.data.action,
    });
    if (error) return jsonError(500, 'Could not record that', error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not record that', error);
  }
}

import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';

const PatchNotificationsSchema = z.object({
  action: z.enum(['mark_read']),
  notificationIds: z.array(z.string().uuid()).optional(),
});

export async function GET(req: Request) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;
  if (error) return jsonError(500, 'Failed to fetch notifications', error);
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;
  const { supabase, user } = auth;

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return jsonError(400, 'Invalid JSON body');
  }

  const result = PatchNotificationsSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
  }
  const { action, notificationIds } = result.data;

  if (action === 'mark_read') {
    const nowStr = new Date().toISOString();
    if (notificationIds && notificationIds.length > 0) {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: nowStr })
        .eq('user_id', user.id)
        .in('id', notificationIds);
      if (error) return jsonError(500, 'Failed to mark as read', error);
    } else {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: nowStr })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (error) return jsonError(500, 'Failed to mark all as read', error);
    }
  }

  return NextResponse.json({ success: true });
}

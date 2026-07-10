import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

export async function GET(req: Request) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

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

  const { action, notificationIds } = await req.json() as { action: string, notificationIds?: string[] };
  
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

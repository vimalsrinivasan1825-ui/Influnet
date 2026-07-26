import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

export async function GET(req: Request) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;
  const { supabase, user } = auth;

  try {
    // 1. Unread in-app notifications
    const { count: unreadCount, error: notifError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (notifError) throw notifError;

    // 2. Unread Stream Chat messages and message notifications
    let unreadMessages = 0;
    try {
      if (process.env.NEXT_PUBLIC_STREAM_API_KEY && process.env.STREAM_API_SECRET) {
        const { getStreamClient } = await import('@/lib/stream');
        const streamClient = getStreamClient();
        const res = await streamClient.queryUsers({ id: user.id });
        const streamUser = res.users?.[0] as { total_unread_count?: number; unread_count?: number } | undefined;
        unreadMessages = streamUser?.total_unread_count ?? streamUser?.unread_count ?? 0;
      }
    } catch {
      // Ignore stream error and fallback to db notifications
    }
    if (!unreadMessages) {
      const { count: msgNotifCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', 'message')
        .is('read_at', null);
      unreadMessages = msgNotifCount ?? 0;
    }

    // 3. Pending collab_requests count.
    //    Real table: `collab_requests` with `from_user_id` / `to_user_id`.
    //    (There is NO table called `collaboration_requests` — that was a bug.)
    //    Business owner: count of requests THEY SENT that are still pending.
    //    Influencer: count of requests THEY RECEIVED that are still pending.
    let pendingRequests = 0;
    if (auth.role === 'business_owner') {
      const { count, error } = await supabase
        .from('collab_requests')
        .select('id', { count: 'exact', head: true })
        .eq('from_user_id', user.id)
        .eq('status', 'pending');
      if (error) throw error;  // surface errors — don't silently return 0
      pendingRequests = count ?? 0;
    } else if (auth.role === 'influencer') {
      const { count, error } = await supabase
        .from('collab_requests')
        .select('id', { count: 'exact', head: true })
        .eq('to_user_id', user.id)
        .eq('status', 'pending');
      if (error) throw error;
      pendingRequests = count ?? 0;
    }

    return NextResponse.json({
      unread_notifications_count: unreadCount || 0,
      unread_messages_count: unreadMessages,
      pending_requests_count: pendingRequests
    });
  } catch (error) {
    return jsonError(500, 'Failed to fetch summary', error);
  }
}

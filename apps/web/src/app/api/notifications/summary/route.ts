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

    // 2. Unread Stream Chat messages (we'll query Stream separately later, for now placeholder 0)
    // To do this properly, we should use Stream Chat server client to get unread count.
    // Assuming the client-side handles Stream Chat unread counts via Stream SDK instead.
    const unreadMessages = 0;

    // 3. Pending requests (if business, requests they sent that are pending. If influencer, requests received that are pending)
    let pendingRequests = 0;
    if (auth.role === 'business_owner') {
      const { count, error } = await supabase
        .from('collaboration_requests')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', user.id)
        .eq('status', 'pending');
      if (!error && count) pendingRequests = count;
    } else if (auth.role === 'influencer') {
      const { count, error } = await supabase
        .from('collaboration_requests')
        .select('id', { count: 'exact', head: true })
        .eq('influencer_id', user.id)
        .eq('status', 'pending');
      if (!error && count) pendingRequests = count;
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

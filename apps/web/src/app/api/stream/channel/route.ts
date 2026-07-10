import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ensureStreamChannel, ensureStreamUser } from '@/lib/stream';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, otherUserId, channelName } = await req.json();

    if (!conversationId || !otherUserId) {
      return NextResponse.json({ error: 'Missing conversationId or otherUserId' }, { status: 400 });
    }

    // Ensure both users exist in Stream
    await ensureStreamUser(user.id);
    
    // Get other user's profile for Stream
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', otherUserId)
      .single();

    const otherName = (otherProfile as { name?: string } | null)?.name || otherUserId;
    await ensureStreamUser(otherUserId, otherName);

    // Create/ensure the Stream channel
    await ensureStreamChannel(
      conversationId,
      [user.id, otherUserId],
      channelName || 'Chat',
    );

    return NextResponse.json({ success: true, channelId: `conv_${conversationId}` });
  } catch (err) {
    console.error('[Stream Channel] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

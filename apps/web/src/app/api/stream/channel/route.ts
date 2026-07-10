import { NextRequest, NextResponse } from 'next/server';
import { ensureStreamChannel, ensureStreamUser } from '@/lib/stream';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, otherUserId, channelName } = await req.json();

    if (!conversationId || !otherUserId) {
      return NextResponse.json({ error: 'Missing conversationId or otherUserId' }, { status: 400 });
    }

    // Query conversation_participants for conversationId
    const { data: participants, error: partError } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    if (partError || !participants) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const participantIds = participants.map(p => p.user_id);

    // Require the caller's user.id to be a participant -> else 403.
    if (!participantIds.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Require otherUserId to be a participant -> else 400.
    if (!participantIds.includes(otherUserId)) {
      return NextResponse.json({ error: 'otherUserId is not a participant' }, { status: 400 });
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

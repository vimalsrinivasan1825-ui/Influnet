import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';

const PostMessageSchema = z.object({
  content: z.string().min(1),
});

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    // Verify participation
    const { data: part, error: partError } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .single();

    if (partError || !part) {
      return jsonError(403, 'Forbidden');
    }

    // Latest 200, returned oldest-first for rendering
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return jsonError(500, 'Database query error', error);

    return NextResponse.json({ messages: (messages || []).reverse() });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = PostMessageSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { content } = result.data;

    // Verify participation
    const { data: part, error: partError } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .single();

    if (partError || !part) {
      return jsonError(403, 'Forbidden');
    }

    const { data: msg, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
        sender_user_id: user.id,
        body: content
      })
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to insert message', error);

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    // Notify recipient(s)
    try {
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', id)
        .neq('user_id', user.id);

      if (participants && participants.length > 0) {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();

        const { notifyNewMessage } = await import('@/lib/notify');
        await notifyNewMessage({
          conversationId: id,
          recipientIds: (participants as { user_id: string }[]).map((p) => p.user_id),
          senderName: senderProfile?.name || 'A user',
          text: content,
        });
      }
    } catch (notifErr) {
      console.error('[Messages API] Failed to notify user:', notifErr);
    }

    return NextResponse.json({ message: msg });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;
    // Validate UUID format to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return jsonError(400, 'Invalid conversation ID format');
    }

    // Verify the user is a participant of this conversation
    const { data: part, error: fetchErr } = await supabase
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr) {
      return jsonError(500, 'Failed to fetch participant', fetchErr);
    }
    if (!part) {
      return jsonError(403, 'Forbidden — you are not a participant');
    }

    // Delete the conversation row. The schema defines:
    //   messages.conversation_id REFERENCES conversations(id) ON DELETE CASCADE
    //   conversation_participants.conversation_id REFERENCES conversations(id) ON DELETE CASCADE
    // So cascading handles messages + participants automatically.
    // The RLS DELETE policy (migration 050) allows this under withAuth.
    const { error: delErr } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id);

    if (delErr) return jsonError(500, 'Failed to delete conversation', delErr);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

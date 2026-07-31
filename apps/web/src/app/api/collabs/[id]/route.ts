import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    const { data: collab, error } = await supabase
      .from('collab_requests')
      .select(`
        *,
        sender:profiles!collab_requests_from_user_id_fkey(name, role),
        receiver:profiles!collab_requests_to_user_id_fkey(name, role)
      `)
      .eq('id', id)
      .single();

    if (error) return jsonError(500, 'Database query error', error);
    if (!collab) return jsonError(404, 'Collab request not found');

    // Check authorization: user must be sender or receiver
    if (collab.from_user_id !== user.id && collab.to_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    // Sending isn't gated on admin approval any more — surface the sender's
    // status instead, same as GET /api/collabs (list).
    let sender_business_approval_status: string | null = null;
    if (collab.sender?.role === 'business_owner') {
      const { data: biz, error: bizErr } = await supabase
        .from('business_profiles')
        .select('approval_status')
        .eq('user_id', collab.from_user_id)
        .maybeSingle();
      if (bizErr) {
        console.error(
          '[collabs/:id] could not read sender approval status (is migration 094 applied?):',
          bizErr.message,
        );
      }
      // 'unknown' rather than null when unreadable — see the list route. Null
      // hides the precaution, which would present an unreviewed business as
      // reviewed on the one screen where the creator decides whether to reply.
      sender_business_approval_status = biz?.approval_status ?? 'unknown';
    }

    return NextResponse.json({ collab: { ...collab, sender_business_approval_status } });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

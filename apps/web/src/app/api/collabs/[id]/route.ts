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

    return NextResponse.json({ collab });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

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

    // Use management API to delete conversation and related data
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const mgmtKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

    const runSql = async (sql: string) => {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mgmtKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SQL error: ${res.status} ${errText}`);
      }
      return res.json();
    };

    // Delete messages, participants, then conversation
    const sql = `
      DELETE FROM public.messages WHERE conversation_id = '${id}'::uuid;
      DELETE FROM public.conversation_participants WHERE conversation_id = '${id}'::uuid;
      DELETE FROM public.conversations WHERE id = '${id}'::uuid;
    `;

    await runSql(sql);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

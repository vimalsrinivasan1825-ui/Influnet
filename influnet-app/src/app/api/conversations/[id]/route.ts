import { NextResponse } from 'next/server';

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    // Validate UUID format to prevent SQL injection
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid conversation ID format' }, { status: 400 });
    }
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the user is a participant of this conversation
    const { data: part } = await authClient
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!part) {
      return NextResponse.json({ error: 'Forbidden — you are not a participant' }, { status: 403 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

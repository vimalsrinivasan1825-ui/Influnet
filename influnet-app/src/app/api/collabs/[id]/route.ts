import { NextResponse } from 'next/server';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: collab, error } = await supabase
      .from('collab_requests')
      .select(`
        *,
        sender:profiles!collab_requests_from_user_id_fkey(name, email, role),
        receiver:profiles!collab_requests_to_user_id_fkey(name, email, role)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Check authorization: user must be sender or receiver
    if (collab.from_user_id !== user.id && collab.to_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ collab });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

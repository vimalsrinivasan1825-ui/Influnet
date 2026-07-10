import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
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

    // Query pending collab requests directed to the user
    const { data: recent, count, error } = await supabase
      .from('collab_requests')
      .select('id, message, status, sender:profiles!collab_requests_from_user_id_fkey(name, role)', { count: 'exact' })
      .eq('to_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error("[GET /api/notifications/summary] Database query error:", error);
      throw error;
    }

    return NextResponse.json({
      unreadCount: count || 0,
      recent: recent || []
    });
  } catch (error: any) {
    console.error("[GET /api/notifications/summary] Exception caught:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

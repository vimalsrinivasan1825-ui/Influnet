import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api';

// GET: moderation queue — open/reviewing reports with reporter + reported names.
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const { data, error } = await supabase
      .from('user_reports')
      .select(`
        id, reason, details, status, project_id, created_at,
        reporter:profiles!user_reports_reporter_id_fkey(id, name),
        reported:profiles!user_reports_reported_id_fkey(id, name, verification_status)
      `)
      .in('status', ['open', 'reviewing'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ reports: data || [] });
  } catch (error: any) {
    console.error('[Admin GET /api/admin/reports] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const VALID = ['open', 'reviewing', 'actioned', 'dismissed'];

// PATCH: move a report through the moderation workflow.
export async function PATCH(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const { id, status } = (await req.json()) as { id?: string; status?: string };
    if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    if (!VALID.includes(status)) return NextResponse.json({ error: `status must be one of ${VALID.join(', ')}` }, { status: 400 });

    const { data, error } = await supabase
      .from('user_reports')
      .update({ status })
      .eq('id', id)
      .select('id, status')
      .single();

    if (error) throw error;
    return NextResponse.json({ report: data });
  } catch (error: any) {
    console.error('[Admin PATCH /api/admin/reports] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

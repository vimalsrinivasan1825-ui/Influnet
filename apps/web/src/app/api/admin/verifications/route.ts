import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api';
import { VERIFICATION_NOTIFICATION } from '@/lib/verification';

// GET: escalation queue — checks awaiting a human decision, both roles, newest
// first, with the AI score/reason and the person's name.
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const { data: checks, error } = await supabase
      .from('verification_checks')
      .select(`
        id, user_id, role, status, ai_score, ai_reason, ai_signals, created_at,
        profile:profiles!inner(id, name, email, phone, location, verification_status, created_at)
      `)
      .in('status', ['pending', 'in_review'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Attach the role-specific signup details (Instagram handle, niche, company,
    // GST, etc.) so an admin can verify against everything the user provided —
    // not just their name/email. Fetched in two lookups and merged by user_id.
    const rows = (checks || []) as any[];
    const userIds = [...new Set(rows.map((c) => c.user_id))];
    let inflMap = new Map<string, unknown>();
    let bizMap = new Map<string, unknown>();
    if (userIds.length > 0) {
      const [{ data: infl }, { data: biz }] = await Promise.all([
        supabase
          .from('influencer_profiles')
          .select(
            'user_id, username, instagram_handle, youtube_handle, tiktok_handle, niche, city, state, instagram_followers, youtube_subscribers, is_verified'
          )
          .in('user_id', userIds),
        supabase
          .from('business_profiles')
          .select(
            'user_id, company_name, industry, business_type, website, city, state, gst_number, team_size, approval_status'
          )
          .in('user_id', userIds),
      ]);
      inflMap = new Map((infl || []).map((r: any) => [r.user_id, r]));
      bizMap = new Map((biz || []).map((r: any) => [r.user_id, r]));
    }

    const queue = rows.map((c) => ({
      ...c,
      influencer: inflMap.get(c.user_id) ?? null,
      business: bizMap.get(c.user_id) ?? null,
    }));

    return NextResponse.json({ queue });
  } catch (error: any) {
    console.error('[Admin GET /api/admin/verifications] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const VALID = ['verified', 'rejected', 'needs_more_info'] as const;

// PATCH: resolve an escalation. Admin can verify, reject, or ask for more info.
export async function PATCH(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const body = await req.json();
    const { user_id, status, notes } = body as { user_id?: string; status?: string; notes?: string };

    if (!user_id || !status) {
      return NextResponse.json({ error: 'user_id and status are required' }, { status: 400 });
    }
    if (!VALID.includes(status as (typeof VALID)[number])) {
      return NextResponse.json({ error: `status must be one of ${VALID.join(', ')}` }, { status: 400 });
    }

    const notif = VERIFICATION_NOTIFICATION[status as keyof typeof VERIFICATION_NOTIFICATION];
    const { data, error } = await supabase.rpc('admin_decide_verification', {
      p_user_id: user_id,
      p_status: status,
      p_notes: notes ?? null,
      p_notif_type: notif.type,
      p_notif_title: notif.title,
      p_notif_body: notif.body,
    });
    if (error) throw error;

    return NextResponse.json({ result: data });
  } catch (error: any) {
    console.error('[Admin PATCH /api/admin/verifications] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

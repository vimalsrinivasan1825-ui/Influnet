import { NextResponse } from 'next/server';
import { withAdmin, withAuth } from '@/lib/api';
import { VERIFICATION_NOTIFICATION } from '@/lib/verification';
import { auditAdmin } from '@/lib/admin-audit';

// GET: escalation queue — checks awaiting a human decision, both roles, newest
// first, with the AI score/reason and the person's name.
//
// `needs_more_info` belongs in this queue alongside `pending`/`in_review`: it
// used to be excluded, so a creator who genuinely proved ownership (058) but
// scored below the auto-approve bar (verification.ts) never showed up here for
// an admin to look at — the RPC that grants the badge (admin_decide_verification,
// 086) was reachable and correctly gated on ownership, but nothing surfaced the
// person it was gated FOR. `rejected` stays out; that is a resolved terminal
// state, not an open one.
//
// `verification_checks` is an append-only audit log by design — submit_verification
// (055) inserts a fresh row on every "Run verification" click and never closes the
// old one, on purpose, so the AI's reasoning history survives. That is correct for
// the audit trail; it is wrong for a QUEUE, which showed one card per row and so
// showed the same person three times over for clicking the button three times.
// One card per person: dedupe to each user's newest row, and surface how many
// open attempts are behind it instead of repeating the whole card per attempt.
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
      .in('status', ['pending', 'in_review', 'needs_more_info'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Rows arrive newest-first, so the first time a user_id is seen IS their
    // latest check — collapse to that one and count the rest as prior attempts.
    //
    // Inclusion is decided by profile.verification_status, the CURRENT truth —
    // not by this row's own status. admin_decide_verification() (086) only ever
    // closes the single newest open check when it resolves someone; it has no
    // reason to touch older stacked duplicates left behind by repeat "Run
    // verification" clicks. Filtering on the check row's own status would let
    // one of those untouched duplicates resurrect an already-resolved person
    // right back into the queue. The profile is already joined in below, so
    // this costs nothing extra.
    const OPEN = new Set(['pending', 'in_review', 'needs_more_info']);
    const allRows = ((checks || []) as any[]).filter((c) => OPEN.has(c.profile?.verification_status));
    const latestByUser = new Map<string, any>();
    const openAttempts = new Map<string, number>();
    for (const c of allRows) {
      openAttempts.set(c.user_id, (openAttempts.get(c.user_id) ?? 0) + 1);
      if (!latestByUser.has(c.user_id)) latestByUser.set(c.user_id, c);
    }
    const rows = [...latestByUser.values()];

    // Attach the role-specific signup details (Instagram handle, niche, company,
    // GST, etc.) so an admin can verify against everything the user provided —
    // not just their name/email. Fetched in two lookups and merged by user_id.
    const userIds = [...new Set(rows.map((c) => c.user_id))];
    let inflMap = new Map<string, any>();
    let bizMap = new Map<string, unknown>();
    const ownershipSet = new Set<string>();
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

      // Same gate admin_decide_verification() enforces server-side (086) — read
      // here too so the queue can show it up front instead of the admin finding
      // out by clicking Verify and reading the exception.
      const { data: claims } = await supabase
        .from('social_account_claims')
        .select('user_id, handle')
        .eq('platform', 'instagram')
        .eq('status', 'verified')
        .in('user_id', userIds);
      for (const c of claims ?? []) {
        const ip = inflMap.get((c as any).user_id);
        if (ip && (ip.instagram_handle ?? '').trim().toLowerCase() === (c as any).handle) {
          ownershipSet.add((c as any).user_id);
        }
      }
    }

    const queue = rows.map((c) => ({
      ...c,
      influencer: inflMap.get(c.user_id) ?? null,
      business: bizMap.get(c.user_id) ?? null,
      ownershipVerified: c.role === 'influencer' ? ownershipSet.has(c.user_id) : null,
      openAttempts: openAttempts.get(c.user_id) ?? 1,
    }));

    return NextResponse.json({ queue });
  } catch (error: any) {
    console.error('[Admin GET /api/admin/verifications] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const VALID = ['verified', 'rejected', 'needs_more_info'] as const;

// PATCH: resolve an escalation. Admin can verify, reject, or ask for more info.
//
// This uses the CALLER'S client, not the service-role one the GET needs. The
// work is done by admin_decide_verification(), a SECURITY DEFINER routine that
// guards itself with is_admin() — and is_admin() resolves auth.uid() from the
// JWT. A service-role client has no auth.uid(), so that guard saw NULL and
// failed every decision with "Admin only". Business approvals were unaffected
// only because they go through a plain table update on a different route.
export async function PATCH(req: Request) {
  try {
    const auth = await withAuth(req, { role: 'admin' });
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

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

    await auditAdmin({
      actorId: user.id, actorEmail: user.email, action: 'verification_decided',
      targetId: user_id, targetType: 'profile',
      metadata: { status, notes: notes ?? null }, req,
    });

    return NextResponse.json({ result: data });
  } catch (error: any) {
    console.error('[Admin PATCH /api/admin/verifications] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

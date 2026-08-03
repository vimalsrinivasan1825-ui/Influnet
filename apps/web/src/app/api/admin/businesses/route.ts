import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';
import { deliverEmail } from '@/lib/email/policy';

// GET all business profiles (for admin review)
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    // Fetch all business profiles with their user profiles
    const { data: businesses, error } = await supabase
      .from('business_profiles')
      .select(`
        user_id, company_name, industry, business_type, approval_status,
        created_at, gst_number, website, city, state, marketing_budget,
        profile:profiles!inner(id, name, email, phone, location, created_at)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ businesses: businesses || [] });
  } catch (error) {
    return jsonError(500, 'Could not load businesses', error);
  }
}

// PATCH to approve/reject a business account
export async function PATCH(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = await req.json();
    // `reason` is optional and only meaningful on a rejection — it becomes the
    // "what needs fixing" panel in the mail, which is the difference between a
    // business that can resubmit and one that just gets told no.
    const { user_id, approval_status, reason } = body;

    if (!user_id || !approval_status) {
      return NextResponse.json({ error: 'user_id and approval_status are required' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(approval_status)) {
      return NextResponse.json({ error: 'approval_status must be "approved" or "rejected"' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('business_profiles')
      .update({ approval_status, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) throw error;

    await auditAdmin({
      actorId: user.id, actorEmail: user.email, action: 'business_approval_changed',
      targetId: user_id, targetType: 'business_profile',
      metadata: { approval_status }, req,
    });

    // Tell them. Until now an approval decision was completely silent — the
    // business found out by logging in and noticing the block had lifted, or
    // never found out at all that they had been rejected.
    //
    // deliverEmail() rather than notifyUser(): `notifications.type` has no
    // value for an approval decision, and adding one is a migration. This is
    // account-tier mail, so it ignores opt-outs by design.
    try {
      const approved = approval_status === 'approved';
      await deliverEmail({
        userId: user_id,
        templateId: approved ? 'business_approved' : 'business_rejected',
        // Keyed on the decision, so flipping a business approved → rejected →
        // approved mails on each real change but not on a double-submit.
        dedupeKey: `business_${approval_status}:${user_id}`,
        data: {
          businessName:
            (updated as { company_name?: string } | null)?.company_name || 'Your business',
          reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
          dashboardUrl: approved ? '/dashboard' : '/dashboard/settings',
        },
      });
    } catch (emailErr) {
      console.error('[admin/businesses] approval email failed:', emailErr);
    }

    return NextResponse.json({ business: updated });
  } catch (error) {
    return jsonError(500, 'Could not update this business', error);
  }
}

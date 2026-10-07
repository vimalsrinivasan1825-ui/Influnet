import { z } from 'zod';
import { adminJson, callerClient, jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';
import { allows } from '@/lib/admin-access';
import { logger } from '@/lib/logger';
import { hardDeleteAccount, recordAccountDeletion } from '@/lib/account-deletion';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin user detail — profile, connections, and activity for a single user.
 *
 * Deliberately excludes message/chat content: connections show who the user
 * is linked to and through what (a pending request or a project, with its
 * stage/budget), never what was said. Same boundary get_user_activity (073)
 * already respects for the self-service version.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, email, name, phone, location, created_at, updated_at, verification_status, verified_at, verified_badge')
      .eq('id', id)
      .single();

    if (profileErr || !profile) {
      return jsonError(404, 'User not found');
    }

    const enriched: any = { ...profile };
    let lastSignInAt: string | null = null;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(id);
      lastSignInAt = authUser?.user?.last_sign_in_at ?? null;
    } catch {
      // Non-fatal — same graceful degradation as the users list route.
    }
    enriched.last_sign_in_at = lastSignInAt;

    if (profile.role === 'business_owner') {
      const { data: biz } = await supabase
        .from('business_profiles')
        .select('company_name, industry, approval_status, website')
        .eq('user_id', id)
        .single();
      if (biz) Object.assign(enriched, { company_name: biz.company_name, business_industry: biz.industry, approval_status: biz.approval_status, website: biz.website });
    } else if (profile.role === 'influencer') {
      const { data: inf } = await supabase
        .from('influencer_profiles')
        .select('username, niche')
        .eq('user_id', id)
        .single();
      if (inf) Object.assign(enriched, { username: inf.username, niche: inf.niche });
    }

    const [{ data: projects }, { data: requests }, activityRes] = await Promise.all([
      supabase
        .from('campaign_projects')
        .select(`
          id, title, status, current_stage, budget, created_at,
          owner:profiles!campaign_projects_owner_user_id_fkey(id, name, role),
          counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, role)
        `)
        .or(`owner_user_id.eq.${id},counterparty_user_id.eq.${id}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('collab_requests')
        .select(`
          id, status, budget, created_at, updated_at,
          from_user:profiles!collab_requests_from_user_id_fkey(id, name, role),
          to_user:profiles!collab_requests_to_user_id_fkey(id, name, role)
        `)
        .or(`from_user_id.eq.${id},to_user_id.eq.${id}`)
        .order('created_at', { ascending: false }),
      callerClient(req).rpc('admin_get_user_activity', { p_user_id: id, p_limit: 100, p_offset: 0 }),
    ]);

    if (activityRes.error) {
      // Read-only enrichment — a broken RPC call shouldn't blank the whole page.
      console.error('[admin/users/[id]] activity RPC failed:', activityRes.error.message);
    }

    // Each extra section is gated by the section it already belongs to
    // elsewhere in the console, and simply omitted (not errored) when the
    // caller doesn't hold it — adminJson/adminRows still masks whatever comes
    // back, same as every other admin route.
    const projectIds = (projects || []).map((p: any) => p.id);
    const [payments, subscription] = await Promise.all([
      allows(auth.access, 'payments', 'view') && projectIds.length
        ? supabase
            .from('project_payments')
            .select('id, project_id, stage_key, amount, currency, status, payer_id, created_at, paid_at')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null }),
      allows(auth.access, 'subscribers', 'view')
        ? supabase
            .from('subscriptions')
            .select('tier, status, current_period_end, grace_until, cancel_at_period_end, created_at, updated_at')
            .eq('user_id', id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Opening someone's full detail (email, phone, activity) is itself worth a
    // trace — until now it left none at all.
    await auditAdmin({
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: 'user_viewed',
      targetId: id,
      targetType: 'user',
      req,
    });

    return adminJson(req, {
      user: enriched,
      projects: projects || [],
      requests: requests || [],
      activity: activityRes.data || [],
      payments: payments.data,
      subscription: subscription.data,
    });
  } catch (error) {
    return jsonError(500, 'Could not load this user', error);
  }
}

/**
 * PATCH — edit a user's base fields from the admin panel.
 *
 * Deliberately narrow: name / phone / location on `profiles`, and the auth-side
 * email. Anything role-specific (username, company, approval status) has its
 * own admin surface. Never touches `role` — an admin is provisioned through
 * scripts/create-admin.mjs and migration 070, not by editing a row here.
 */
const PatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  email: z.string().trim().email().max(200).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user: admin } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid user id');

    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Validation failed');
    const body = parsed.data;

    // Fetched once, up front: both the admin-role guard below and the
    // before/after audit trail need the row as it stood before this edit.
    const { data: before } = await supabase
      .from('profiles')
      .select('role, name, phone, location, email')
      .eq('id', id)
      .maybeSingle();

    if (auth.access.tier !== 'super') {
      // Changing an admin's email is an account takeover: set it to an address
      // you control, then reset the password. Only a super admin edits another
      // console account here; team members are managed on the Team page.
      if (before?.role === 'admin') {
        return jsonError(403, 'Console accounts can only be edited by a super admin.');
      }
      // A field you cannot see is not one you may overwrite.
      const hidden = auth.access.hiddenFields;
      const blocked = (['email', 'phone', 'location'] as const).filter(
        (f) => body[f] !== undefined && hidden.includes(f),
      );
      if (blocked.length) {
        return jsonError(403, `You cannot change fields hidden from you (${blocked.join(', ')}).`);
      }
    }

    const profileUpdate: Record<string, unknown> = {};
    if (body.name !== undefined) profileUpdate.name = body.name;
    if (body.phone !== undefined) profileUpdate.phone = body.phone || null;
    if (body.location !== undefined) profileUpdate.location = body.location || null;

    if (Object.keys(profileUpdate).length > 0) {
      profileUpdate.updated_at = new Date().toISOString();
      const { error } = await supabase.from('profiles').update(profileUpdate).eq('id', id);
      if (error) return jsonError(500, 'Could not update the profile', error);
    }

    if (body.email) {
      const { error } = await supabase.auth.admin.updateUserById(id, {
        email: body.email,
        email_confirm: true,
      });
      if (error) return jsonError(400, error.message);
      // Keep profiles.email in step — it's a denormalised copy.
      await supabase.from('profiles').update({ email: body.email }).eq('id', id);
    }

    const changedFields = (['name', 'phone', 'location', 'email'] as const).filter(
      (f) => body[f] !== undefined,
    );
    await auditAdmin({
      actorId: admin.id,
      actorEmail: admin.email ?? null,
      action: 'user_updated',
      targetId: id,
      targetType: 'user',
      metadata: {
        fields: changedFields,
        before: Object.fromEntries(changedFields.map((f) => [f, before?.[f] ?? null])),
        after: Object.fromEntries(changedFields.map((f) => [f, body[f] || null])),
      },
      req,
    });

    return adminJson(req, { ok: true });
  } catch (error) {
    return jsonError(500, 'Could not update this user', error);
  }
}

/**
 * DELETE — hard-remove a user and everything that belongs to them.
 *
 * `auth.admin.deleteUser` cascades through `profiles` and everything that FKs
 * to it with ON DELETE CASCADE (requests, projects, messages, notifications,
 * portfolio, pins, …). Projects, payments and invoices are shared records and
 * survive (migration 161 makes the participant columns and
 * `project_documents.issued_by` ON DELETE SET NULL). `conversations` has no FK
 * to a user, so orphaned ones are swept afterwards, and the person is removed
 * from Stream Chat (best-effort, reported in the audit entry).
 *
 * Guards: an admin can't delete themselves, and can't delete another admin
 * (revoke that first through the provisioning script). Every delete is audited.
 */
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user: admin } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid user id');

    if (id === admin.id) {
      return jsonError(400, "You can't delete your own admin account here.");
    }

    // Profile may not exist (an orphaned auth user) — that's fine, and a common
    // reason to be deleting. When it does, block deleting another admin.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, email, name, phone')
      .eq('id', id)
      .maybeSingle();

    if (profile?.role === 'admin') {
      return jsonError(403, 'Revoke this admin through the provisioning script before deleting.');
    }

    // Tombstone first (migration 153) — after the cascade there is nothing
    // left to summarise, so a failed write stops the delete.
    let reasonText: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.reason === 'string') reasonText = body.reason.slice(0, 500);
    } catch {
      /* DELETE without a body is fine */
    }
    const tomb = await recordAccountDeletion(supabase, {
      userId: id,
      via: 'admin',
      deletedBy: admin.id,
      reasonCode: 'admin_action',
      reasonText,
      email: profile?.email ?? null,
      phone: (profile as any)?.phone ?? null,
    });
    if (!tomb.ok) {
      return jsonError(500, 'Could not record this deletion, so nothing was deleted. Try again.', tomb.error);
    }

    const result = await hardDeleteAccount(supabase, id);
    if (!result.ok) {
      return jsonError(500, `Could not delete this user: ${result.error}`);
    }
    await auditAdmin({
      actorId: admin.id,
      actorEmail: admin.email ?? null,
      action: 'user_deleted',
      targetId: id,
      targetType: 'user',
      metadata: {
        email: profile?.email ?? null,
        name: profile?.name ?? null,
        role: profile?.role ?? 'orphan',
        conversationsSwept: result.conversationsSwept,
        // false = the account is gone but Stream still holds the chat user; clean up by hand.
        streamUserRemoved: result.stream.userRemoved,
        ...(result.stream.error ? { streamError: result.stream.error } : {}),
      },
      req,
    });

    return adminJson(req, { ok: true });
  } catch (error) {
    return jsonError(500, 'Could not delete this user', error);
  }
}

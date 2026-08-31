import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, withAdmin, callerClient } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';
import { logger } from '@/lib/logger';

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

    return NextResponse.json({
      user: enriched,
      projects: projects || [],
      requests: requests || [],
      activity: activityRes.data || [],
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

    await auditAdmin({
      actorId: admin.id,
      actorEmail: admin.email ?? null,
      action: 'user_updated',
      targetId: id,
      targetType: 'user',
      metadata: { fields: Object.keys(body) },
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not update this user', error);
  }
}

/**
 * DELETE — hard-remove a user and everything that belongs to them.
 *
 * `auth.admin.deleteUser` cascades through `profiles` and everything that FKs
 * to it with ON DELETE CASCADE (requests, projects, messages, notifications,
 * portfolio, pins, …). The ONE foreign key that would block it is
 * `project_documents.issued_by` (NO ACTION) — those rows are immutable legal
 * snapshots with the party names already frozen inside, so `issued_by` is
 * nulled rather than the documents destroyed. `conversations` has no FK to a
 * user, so orphaned ones are swept afterwards.
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
      .select('id, role, email, name')
      .eq('id', id)
      .maybeSingle();

    if (profile?.role === 'admin') {
      return jsonError(403, 'Revoke this admin through the provisioning script before deleting.');
    }

    // Which conversations this user is in — nothing points a FK at conversations,
    // so they outlive their participants unless we sweep them.
    const { data: parts } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', id);
    const convIds = [...new Set((parts ?? []).map((p: any) => p.conversation_id))];

    // Clear the one blocking FK. The document rows survive with their frozen
    // snapshot; only the "issued by" pointer goes.
    const { error: docErr } = await supabase
      .from('project_documents')
      .update({ issued_by: null })
      .eq('issued_by', id);
    if (docErr) {
      logger.warn('[admin/users DELETE] could not null project_documents.issued_by', {
        id,
        err: docErr.message,
      });
    }

    const { error: delErr } = await supabase.auth.admin.deleteUser(id);
    if (delErr) {
      return jsonError(500, `Could not delete this user: ${delErr.message}`);
    }

    // Sweep conversations that now have no participants.
    if (convIds.length > 0) {
      const { data: still } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .in('conversation_id', convIds);
      const stillActive = new Set((still ?? []).map((p: any) => p.conversation_id));
      const dead = convIds.filter((c) => !stillActive.has(c));
      if (dead.length > 0) {
        await supabase.from('conversations').delete().in('id', dead);
      }
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
        conversationsSwept: convIds.length,
      },
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not delete this user', error);
  }
}

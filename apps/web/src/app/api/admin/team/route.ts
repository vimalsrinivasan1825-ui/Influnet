import { z } from 'zod';
import { adminJson, jsonError, withAdmin } from '@/lib/api';
import { creatableTiers, grantProblem } from '@/lib/admin-access';
import {
  DeliverySchema,
  HiddenFieldsSchema,
  PermissionsSchema,
  issueAccess,
  teamRpcError,
} from '@/lib/admin-team';
import { originFromHeaders } from '@/lib/site';

/**
 * GET  /api/admin/team → { me, members, supers }
 * POST /api/admin/team → { member, credentials }
 *
 * The console team (migration 176). A super admin sees and manages every
 * member; an admin with Team access sees and manages only the staff it
 * created. Staff hold no Team access at all (withAdmin refuses them).
 *
 * `credentials` is the ONLY time a generated password or set-password link is
 * returned. It is not stored, and not written to the audit log.
 */

const MEMBER_COLUMNS =
  'user_id, tier, permissions, hidden_fields, disabled_at, created_at, updated_at, created_by, ' +
  'profile:profiles!admin_members_user_id_fkey(email, name), ' +
  'creator:profiles!admin_members_created_by_fkey(name)';

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, access } = auth;

    let query = supabase.from('admin_members').select(MEMBER_COLUMNS).order('created_at', { ascending: true });
    if (access.tier !== 'super') query = query.eq('created_by', user.id).eq('tier', 'staff');
    const { data, error } = await query;
    if (error) return teamRpcError(error);

    // Super admins are listed for a super admin only, read-only: they are
    // provisioned by scripts/create-admin.mjs --super, never from the console.
    let supers: Array<{ user_id: string; email: string | null; name: string | null }> = [];
    if (access.tier === 'super') {
      const { data: s } = await supabase
        .from('profiles')
        .select('id, email, name')
        .eq('role', 'admin')
        .eq('is_super_admin', true)
        .order('created_at', { ascending: true });
      supers = (s ?? []).map((r: any) => ({ user_id: r.id, email: r.email, name: r.name }));
    }

    const members = (data ?? []).map((m: any) => ({
      user_id: m.user_id,
      email: m.profile?.email ?? null,
      name: m.profile?.name ?? null,
      tier: m.tier,
      permissions: m.permissions ?? {},
      hidden_fields: m.hidden_fields ?? [],
      disabled: !!m.disabled_at,
      disabled_at: m.disabled_at,
      created_at: m.created_at,
      created_by_name: m.creator?.name ?? null,
      // Mirrors admin_can_manage(): a super admin manages everyone listed; an
      // admin is only ever shown the staff it created.
      manageable: m.user_id !== user.id,
    }));

    return adminJson(
      req,
      {
        me: {
          user_id: user.id,
          tier: access.tier,
          permissions: access.permissions,
          hidden_fields: access.hiddenFields,
          creatable_tiers: creatableTiers(access),
        },
        members,
        supers,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return jsonError(500, 'Could not load the team', error);
  }
}

const CreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(120),
  tier: z.enum(['admin', 'staff']),
  permissions: PermissionsSchema,
  hidden_fields: HiddenFieldsSchema.default([]),
  delivery: DeliverySchema.default('invite'),
});

export async function POST(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, access } = auth;

    const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Validation failed');
    const body = parsed.data;

    // Readable refusal first (lib/admin-access.ts), then the authoritative one
    // in SQL — both BEFORE an auth user exists, so a refusal leaves nothing.
    const early = grantProblem(access, body.tier, body.permissions, body.hidden_fields);
    if (early) return jsonError(403, early);
    const { data: problem, error: checkErr } = await supabase.rpc('admin_grant_problem', {
      p_actor: user.id,
      p_tier: body.tier,
      p_permissions: body.permissions,
      p_hidden: body.hidden_fields,
    });
    if (checkErr) return teamRpcError(checkErr);
    if (problem) return jsonError(403, problem);

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: body.email,
      email_confirm: true,
      user_metadata: { name: body.name, provisioned_as: body.tier },
    });
    if (createErr || !created?.user) {
      if (/already|registered|exists/i.test(createErr?.message ?? '')) {
        return jsonError(409, 'This email already belongs to an Influnet account. Team accounts must use a new address.');
      }
      return jsonError(500, 'Could not create the account.', createErr);
    }
    const newId = created.user.id as string;

    const { data: member, error: saveErr } = await supabase.rpc('admin_team_save', {
      p_actor: user.id,
      p_user: newId,
      p_email: body.email,
      p_name: body.name,
      p_tier: body.tier,
      p_permissions: body.permissions,
      p_hidden: body.hidden_fields,
    });
    if (saveErr) {
      // Don't leave a login behind with no console access and no profile.
      await supabase.auth.admin.deleteUser(newId).catch(() => {});
      return teamRpcError(saveErr);
    }

    const credentials = await issueAccess(supabase, newId, body.email, body.delivery, originFromHeaders(req.headers));

    return adminJson(req, { member, credentials }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(500, 'Could not create the team member', error);
  }
}

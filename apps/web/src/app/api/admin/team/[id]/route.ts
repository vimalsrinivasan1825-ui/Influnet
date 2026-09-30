import { z } from 'zod';
import { adminJson, jsonError, withAdmin } from '@/lib/api';
import { grantProblem } from '@/lib/admin-access';
import {
  DeliverySchema,
  HiddenFieldsSchema,
  PermissionsSchema,
  issueAccess,
  teamRpcError,
} from '@/lib/admin-team';
import { logger } from '@/lib/logger';
import { originFromHeaders } from '@/lib/site';

/**
 * PATCH /api/admin/team/<user id>
 *   { action: 'update', tier, permissions, hidden_fields, name? } → { member }
 *   { action: 'disable' | 'enable' }                                → { member }
 *   { action: 'reset_access', delivery }                            → { credentials }
 *
 * Who may touch whom is decided by admin_can_manage() in SQL: a super admin
 * manages every member, an admin only the staff it created, nobody themselves.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    tier: z.enum(['admin', 'staff']),
    permissions: PermissionsSchema,
    hidden_fields: HiddenFieldsSchema.default([]),
    name: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({ action: z.literal('disable') }),
  z.object({ action: z.literal('enable') }),
  z.object({ action: z.literal('reset_access'), delivery: DeliverySchema }),
]);

// Supabase's ban is a duration; a century is "until someone lifts it".
const BAN_FOREVER = '876000h';

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, access } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid team member id');
    if (id === user.id) return jsonError(403, 'You cannot change your own team access.');

    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Validation failed');
    const body = parsed.data;

    const { data: canManage, error: manageErr } = await supabase.rpc('admin_can_manage', {
      p_actor: user.id,
      p_target: id,
    });
    if (manageErr) return teamRpcError(manageErr);
    if (!canManage) return jsonError(403, 'You cannot change this team member.');

    if (body.action === 'update') {
      const early = grantProblem(access, body.tier, body.permissions, body.hidden_fields);
      if (early) return jsonError(403, early);
      const { data: member, error } = await supabase.rpc('admin_team_save', {
        p_actor: user.id,
        p_user: id,
        p_email: null,
        p_name: body.name ?? null,
        p_tier: body.tier,
        p_permissions: body.permissions,
        p_hidden: body.hidden_fields,
      });
      if (error) return teamRpcError(error);
      return adminJson(req, { member });
    }

    if (body.action === 'disable' || body.action === 'enable') {
      const disabled = body.action === 'disable';
      const { data: member, error } = await supabase.rpc('admin_team_set_disabled', {
        p_actor: user.id,
        p_user: id,
        p_disabled: disabled,
      });
      if (error) return teamRpcError(error);

      // The row already locks the console and is_admin(); the ban also stops a
      // session that is still open from refreshing its token.
      const { error: banErr } = await supabase.auth.admin.updateUserById(id, {
        ban_duration: disabled ? BAN_FOREVER : 'none',
      });
      if (banErr) {
        logger.error('team member sign-in ban could not be updated', { id, disabled, err: banErr });
        return adminJson(req, {
          member,
          warning: disabled
            ? 'Console access is off, but their sign-in could not be blocked. They cannot use the console.'
            : 'Console access is back, but their sign-in is still blocked. Try again.',
        });
      }
      return adminJson(req, { member });
    }

    // reset_access: a new set-password link, or a new generated password.
    const { data: target } = await supabase.from('profiles').select('email').eq('id', id).maybeSingle();
    if (!target?.email) return jsonError(404, 'This team member has no email on record.');
    const credentials = await issueAccess(supabase, id, target.email, body.delivery, originFromHeaders(req.headers));
    return adminJson(req, { credentials }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(500, 'Could not update this team member', error);
  }
}

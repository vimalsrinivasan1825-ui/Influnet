import { adminJson, jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) {
      return jsonError(400, 'Invalid early access signup ID');
    }

    const { error } = await auth.supabase
      .from('early_access_signups')
      .delete()
      .eq('id', id);

    if (error) {
      return jsonError(500, 'Could not delete early access signup', error);
    }

    await auditAdmin({
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      action: 'early_access_deleted',
      targetId: id,
      targetType: 'early_access_signup',
      req,
    });

    return adminJson(req, { ok: true, deleted: id });
  } catch (error) {
    return jsonError(500, 'Could not delete early access signup', error);
  }
}

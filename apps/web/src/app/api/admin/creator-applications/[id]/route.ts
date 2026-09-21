import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

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
      return jsonError(400, 'Invalid creator application ID');
    }

    const { error } = await (auth.supabase
      .from('creator_join_applications' as any) as any)
      .delete()
      .eq('id', id);

    if (error) {
      return jsonError(500, 'Could not delete creator application', error);
    }

    return NextResponse.json({ ok: true, deleted: id });
  } catch (error) {
    return jsonError(500, 'Could not delete creator application', error);
  }
}

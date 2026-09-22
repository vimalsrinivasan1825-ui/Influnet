import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, withAdmin } from '@/lib/api';

/**
 * GET    /api/admin/reports/saved        → { reports }
 * POST   /api/admin/reports/saved        → { report }   (name + dataset + filters)
 * DELETE /api/admin/reports/saved?id=…   → { ok }
 */
const SaveSchema = z.object({
  name: z.string().min(1).max(120),
  dataset: z.string().min(1).max(40),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.array(z.string().max(40)).max(40).optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { data, error } = await auth.supabase
      .from('saved_reports')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) return jsonError(500, 'Could not load saved reports', error);
    return NextResponse.json({ reports: data ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load saved reports', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const parsed = SaveSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { data, error } = await auth.supabase
      .from('saved_reports')
      .insert({ ...parsed.data, filters: parsed.data.filters ?? {}, created_by: auth.user.id })
      .select('*')
      .single();
    if (error) return jsonError(400, `Could not save this report: ${error.message}`, error);
    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not save this report', error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return jsonError(400, 'Missing report id');
    const { error } = await auth.supabase.from('saved_reports').delete().eq('id', id);
    if (error) return jsonError(500, 'Could not delete this report', error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not delete this report', error);
  }
}

import { NextResponse } from 'next/server';
import { callerClient, jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';
import { BroadcastCreateSchema } from '@/lib/broadcast-schema';
import { intParam, strParam } from '@/lib/admin-insights';

/**
 * GET  /api/admin/broadcasts?status=&limit=&offset=  → { data }
 * POST /api/admin/broadcasts                         → { broadcast }
 *
 * Creating always makes a DRAFT. Scheduling is a separate, audited PATCH, so a
 * half-composed message cannot go out by accident.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const q = new URL(req.url).searchParams;
    const { data, error } = await callerClient(req).rpc('admin_broadcasts', {
      p_status: strParam(q, 'status', 20),
      p_limit: intParam(q, 'limit', 50, 1, 200),
      p_offset: intParam(q, 'offset', 0, 0, 10_000),
    });
    if (error) return jsonError(500, 'Could not load broadcasts', error);
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(500, 'Could not load broadcasts', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const parsed = BroadcastCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const b = parsed.data;

    const { data, error } = await supabase
      .from('broadcasts')
      .insert({
        name: b.name,
        kind: b.kind,
        title: b.title,
        body: b.body,
        image_url: b.image_url ?? null,
        deep_link: b.deep_link ?? null,
        cta_label: b.cta_label ?? null,
        guide_id: b.guide_id ?? null,
        channels: b.channels,
        in_app_style: b.in_app_style ?? 'toast',
        audience: b.audience ?? {},
        frequency: b.frequency ?? 'once',
        send_at: b.send_at ?? null,
        by_weekday: b.by_weekday ?? null,
        by_monthday: b.by_monthday ?? null,
        time_ist: b.time_ist ?? null,
        starts_on: b.starts_on ?? null,
        ends_on: b.ends_on ?? null,
        respect_quiet_hours: b.respect_quiet_hours ?? true,
        status: 'draft',
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) return jsonError(400, `Could not save this broadcast: ${error.message}`, error);

    await auditAdmin({
      actorId: user.id, actorEmail: user.email ?? null,
      action: 'broadcast_created', targetId: (data as any).id, targetType: 'broadcast',
      metadata: { name: b.name, kind: b.kind, channels: b.channels }, req,
    });
    return NextResponse.json({ broadcast: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not save this broadcast', error);
  }
}

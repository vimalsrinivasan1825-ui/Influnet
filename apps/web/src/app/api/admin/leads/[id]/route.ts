import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';

/**
 * GET   /api/admin/leads/[id] → { lead, notes }
 * PATCH /api/admin/leads/[id] → update fields / move stage
 * POST  /api/admin/leads/[id] → add a note ({ note, kind })
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UpdateSchema = z.object({
  stage: z.enum(['new', 'contacted', 'interested', 'invited', 'signed_up', 'active', 'lost']).optional(),
  owner_id: z.string().uuid().nullable().optional(),
  next_follow_up: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  company: z.string().max(120).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  handle: z.string().max(60).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
});

const NoteSchema = z.object({
  note: z.string().min(1).max(2000),
  kind: z.enum(['note', 'call', 'email', 'meeting']).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid lead id');

    const [lead, notes] = await Promise.all([
      auth.supabase.from('crm_leads').select('*').eq('id', id).maybeSingle(),
      auth.supabase
        .from('crm_lead_notes')
        .select('id, note, kind, created_at, author_id')
        .eq('lead_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (!lead.data) return jsonError(404, 'Lead not found');
    return NextResponse.json({ lead: lead.data, notes: notes.data ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load this lead', error);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid lead id');

    const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { data: before } = await supabase.from('crm_leads').select('stage').eq('id', id).maybeSingle();
    const { data, error } = await supabase.from('crm_leads').update(parsed.data).eq('id', id).select('*').maybeSingle();
    if (error) return jsonError(400, `Could not update this lead: ${error.message}`, error);
    if (!data) return jsonError(404, 'Lead not found');

    // A stage change is worth its own timeline entry.
    if (parsed.data.stage && (before as any)?.stage !== parsed.data.stage) {
      await supabase.from('crm_lead_notes').insert({
        lead_id: id,
        author_id: user.id,
        kind: 'stage_change',
        note: `Stage: ${(before as any)?.stage ?? 'new'} → ${parsed.data.stage}`,
      });
    }

    await auditAdmin({
      actorId: user.id, actorEmail: user.email ?? null, action: 'lead_updated',
      targetId: id, targetType: 'lead', metadata: { fields: Object.keys(parsed.data) }, req,
    });
    return NextResponse.json({ lead: data });
  } catch (error) {
    return jsonError(500, 'Could not update this lead', error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid lead id');

    const parsed = NoteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('crm_lead_notes')
      .insert({ lead_id: id, author_id: user.id, note: parsed.data.note, kind: parsed.data.kind ?? 'note' })
      .select('*')
      .single();
    if (error) return jsonError(400, `Could not add this note: ${error.message}`, error);

    await auditAdmin({
      actorId: user.id, actorEmail: user.email ?? null, action: 'lead_note_added',
      targetId: id, targetType: 'lead', metadata: { kind: parsed.data.kind ?? 'note' }, req,
    });
    return NextResponse.json({ note: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not add this note', error);
  }
}

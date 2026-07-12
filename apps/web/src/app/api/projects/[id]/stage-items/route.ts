import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';
import { buildDefaultStageItems } from '@/lib/project-stage-items';

// GET: list a project's stage checklist. Seeds the default items on first load
// (idempotent via the UNIQUE(project_id, stage_key, label) constraint).
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const { data: existing, error } = await supabase
      .from('project_stage_items')
      .select('*')
      .eq('project_id', projectId)
      .order('stage_key', { ascending: true })
      .order('position', { ascending: true });

    // Degrade gracefully if the table isn't there yet (migration 054 not
    // applied): return an empty checklist so the board still loads.
    if (error) {
      if (error.code === 'PGRST205') return NextResponse.json({ items: [] });
      return jsonError(500, 'Failed to fetch stage items', error);
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ items: existing });
    }

    // First load for this project — seed defaults. RLS ensures only a
    // participant can reach this (SELECT above would have been empty either
    // way; the INSERT policy re-checks membership).
    const seed = buildDefaultStageItems(projectId);
    const { data: seeded, error: seedErr } = await supabase
      .from('project_stage_items')
      .upsert(seed, { onConflict: 'project_id,stage_key,label', ignoreDuplicates: true })
      .select('*');

    if (seedErr) return jsonError(500, 'Failed to seed stage items', seedErr);

    // upsert with ignoreDuplicates may return only inserted rows; re-read to be safe.
    const { data: all, error: reErr } = await supabase
      .from('project_stage_items')
      .select('*')
      .eq('project_id', projectId)
      .order('stage_key', { ascending: true })
      .order('position', { ascending: true });

    if (reErr) return jsonError(500, 'Failed to load stage items', reErr);
    return NextResponse.json({ items: all || seeded || [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

const PatchStageItemSchema = z.object({
  item_id: z.string().uuid(),
  done: z.boolean(),
});

// PATCH: toggle a single checklist item done/undone. Stamps done_by with the
// acting user. RLS restricts writes to project participants.
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON body');
    }

    const parsed = PatchStageItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { item_id, done } = parsed.data;

    const { data: updated, error } = await supabase
      .from('project_stage_items')
      .update({
        done_at: done ? new Date().toISOString() : null,
        done_by: done ? user.id : null,
      })
      .eq('id', item_id)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to update stage item', error);
    return NextResponse.json({ item: updated });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

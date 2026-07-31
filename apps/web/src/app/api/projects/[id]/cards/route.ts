import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { requireProjectParticipant } from '@/lib/project-access';
import { z } from 'zod';

const PostProjectCardSchema = z.object({
  stage_key: z.string().min(1),
  title: z.string().optional(),
});

const PatchProjectCardsSchema = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    stage_key: z.string().min(1),
    position: z.number(),
  })),
});

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    const access = await requireProjectParticipant(supabase, id, user.id);
    if (!access.ok) return access.res;

    const { data: cards, error } = await supabase
      .from('project_cards')
      .select('*')
      .eq('project_id', id)
      .order('position', { ascending: true });

    if (error) return jsonError(500, 'Failed to fetch project cards', error);

    return NextResponse.json({ cards: cards || [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    const access = await requireProjectParticipant(supabase, id, user.id);
    if (!access.ok) return access.res;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = PostProjectCardSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { stage_key, title } = result.data;

    // Get current max position for this stage
    const { data: existing, error: existingErr } = await supabase
      .from('project_cards')
      .select('position')
      .eq('project_id', id)
      .eq('stage_key', stage_key)
      .order('position', { ascending: false })
      .limit(1);

    if (existingErr) return jsonError(500, 'Failed to fetch existing cards', existingErr);

    const nextPosition = existing && existing.length > 0 ? (existing[0].position + 1) : 0;

    const { data: card, error } = await supabase
      .from('project_cards')
      .insert({
        project_id: parseInt(id),
        stage_key,
        title: title || 'Untitled Card',
        position: nextPosition,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to insert project card', error);

    return NextResponse.json({ card });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// PATCH for batch update (drag-and-drop reorder)
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;

    const access = await requireProjectParticipant(supabase, id, user.id);
    if (!access.ok) return access.res;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = PatchProjectCardsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { updates } = result.data;

    // Update each card's stage and position
    // We run these sequentially here, but could be batched via RPC or Promise.all if needed
    for (const update of updates) {
      const { error: updateErr } = await supabase
        .from('project_cards')
        .update({
          stage_key: update.stage_key,
          position: update.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id)
        .eq('project_id', parseInt(id));

      if (updateErr) return jsonError(500, `Failed to update card ${update.id}`, updateErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

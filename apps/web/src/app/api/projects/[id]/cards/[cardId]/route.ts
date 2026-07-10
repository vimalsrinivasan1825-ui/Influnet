import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';

const PatchProjectCardSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  meeting_link: z.string().optional(),
  status: z.string().optional(),
  card_color: z.string().optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string; cardId: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const { cardId } = await context.params;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    const result = PatchProjectCardSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
    }

    const { title, description, start_date, due_date, meeting_link, status, card_color } = result.data;

    const updateData: any = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (meeting_link !== undefined) updateData.meeting_link = meeting_link;
    if (status !== undefined) updateData.status = status;
    if (card_color !== undefined) updateData.card_color = card_color;

    const { data: card, error } = await supabase
      .from('project_cards')
      .update(updateData)
      .eq('id', cardId)
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to update project card', error);

    return NextResponse.json({ card });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string; cardId: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const { cardId } = await context.params;

    const { error } = await supabase
      .from('project_cards')
      .delete()
      .eq('id', cardId);

    if (error) return jsonError(500, 'Failed to delete project card', error);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

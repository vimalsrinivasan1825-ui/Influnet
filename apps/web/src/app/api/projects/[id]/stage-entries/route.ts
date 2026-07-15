import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';
import { notifyUser } from '@/lib/notify';

const PostSchema = z.object({
  stage_key: z.string().min(1),
  body: z.string().max(4000).optional(),
  link_url: z.string().url().max(2000).optional(),
  file_url: z.string().url().max(2000).optional(),
  file_name: z.string().max(300).optional(),
}).refine((e) => (e.body && e.body.trim()) || e.link_url || e.file_url, {
  message: 'An update needs a message, a link, or a file.',
});

async function loadParticipantProject(supabase: any, projectId: number, userId: string) {
  const { data: project, error } = await supabase
    .from('campaign_projects')
    .select('id, title, owner_user_id, counterparty_user_id')
    .eq('id', projectId)
    .single();
  if (error || !project) return { error: jsonError(404, 'Project not found') };
  if (project.owner_user_id !== userId && project.counterparty_user_id !== userId) {
    return { error: jsonError(403, 'Forbidden') };
  }
  return { project };
}

// GET: all updates for the project (grouped by stage on the client), with a
// short-lived signed URL resolved for any file attachment.
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const { error } = await loadParticipantProject(supabase, projectId, user.id);
    if (error) return error;

    const { data: rows, error: rowsErr } = await supabase
      .from('project_stage_entries')
      .select('id, stage_key, author_user_id, body, link_url, file_path, file_name, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (rowsErr) return NextResponse.json({ entries: [] });

    // Resolve author names.
    const authorIds = Array.from(new Set((rows || []).map((r: any) => r.author_user_id).filter(Boolean)));
    let nameById: Record<string, string> = {};
    if (authorIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', authorIds as string[]);
      nameById = Object.fromEntries((profs || []).map((p: any) => [p.id, p.name]));
    }

    const entries = (rows || []).map((r: any) => ({
      id: r.id,
      stage_key: r.stage_key,
      author: r.author_user_id ? { id: r.author_user_id, name: nameById[r.author_user_id] || null } : null,
      body: r.body,
      link_url: r.link_url,
      file_name: r.file_name,
      file_url: r.file_path,
      created_at: r.created_at,
    }));

    return NextResponse.json({ entries });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// POST: add an update to a stage. The file (if any) is uploaded to storage by the
// client first; here we only record its path/name.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { project, error } = await loadParticipantProject(supabase, projectId, user.id);
    if (error) return error;

    const { stage_key, body, link_url, file_url, file_name } = parsed.data;

    const { data: created, error: insErr } = await supabase
      .from('project_stage_entries')
      .insert({ project_id: projectId, stage_key, author_user_id: user.id, body: body || null, link_url: link_url || null, file_path: file_url || null, file_name: file_name || null })
      .select()
      .single();
    if (insErr) return jsonError(500, 'Could not post the update', insErr);

    const counterpartyId = project.owner_user_id === user.id ? project.counterparty_user_id : project.owner_user_id;
    const senderRole = project.owner_user_id === user.id ? 'brand' : 'creator';
    if (counterpartyId) {
      const projectLabel = project.title ? `“${project.title}”` : 'your project';
      await notifyUser({
        userId: counterpartyId,
        type: 'project_stage',
        title: `${projectLabel}: new update`,
        body: `The ${senderRole} sent an update. Review it and reply.`,
        link: `/dashboard/projects/${projectId}`,
      });
    }

    return NextResponse.json({ entry: created });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// DELETE: remove one of your own updates (RLS also enforces authorship).
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const url = new URL(req.url);
    const entryId = url.searchParams.get('entry_id');
    if (!entryId) return jsonError(400, 'entry_id required');

    const { error } = await supabase
      .from('project_stage_entries')
      .delete()
      .eq('id', entryId)
      .eq('project_id', projectId)
      .eq('author_user_id', user.id);
    if (error) return jsonError(500, 'Could not delete the update', error);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

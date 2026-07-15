import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

// GET: the project's activity timeline — a single legible history both parties
// can read. Returns stored project_activity rows (newest last) plus a synthesized
// "project created" event at the very start, each with the actor's public name
// resolved. Degrades gracefully if the activity table isn't migrated yet.
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    // Participant check + the data we need for the synthesized origin event.
    const { data: project, error: projErr } = await supabase
      .from('campaign_projects')
      .select(`
        id, created_at, owner_user_id, counterparty_user_id,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name)
      `)
      .eq('id', projectId)
      .single();

    if (projErr || !project) return jsonError(404, 'Project not found');
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    // Stored events (oldest → newest). Missing table degrades to [].
    const { data: rows, error: rowsErr } = await supabase
      .from('project_activity')
      .select('id, actor_user_id, type, summary, metadata, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    const stored = rowsErr ? [] : rows || [];

    // Resolve actor names in one query.
    const actorIds = Array.from(new Set(stored.map((r: any) => r.actor_user_id).filter(Boolean)));
    let nameById: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', actorIds as string[]);
      nameById = Object.fromEntries((profs || []).map((p: any) => [p.id, p.name]));
    }

    const owner = Array.isArray(project.owner) ? project.owner[0] : project.owner;

    const events = [
      {
        id: 'origin',
        type: 'project_created',
        summary: 'Collaboration started — project created',
        metadata: {},
        created_at: project.created_at,
        actor: owner ? { id: owner.id, name: owner.name } : null,
      },
      ...stored.map((r: any) => ({
        id: r.id,
        type: r.type,
        summary: r.summary,
        metadata: r.metadata || {},
        created_at: r.created_at,
        actor: r.actor_user_id ? { id: r.actor_user_id, name: nameById[r.actor_user_id] || null } : null,
      })),
    ];

    return NextResponse.json({ activity: events });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

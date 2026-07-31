import type { NextResponse } from 'next/server';
import { jsonError } from './api';

type ProjectParticipants = {
  id: number;
  owner_user_id: string;
  counterparty_user_id: string | null;
};

/**
 * Gate a project sub-resource on the caller actually being one of the two
 * participants. RLS on the child tables (project_cards, reviews) does not
 * restrict reads by project membership, so a route that filters only on
 * `project_id` will happily answer for someone else's project.
 */
export async function requireProjectParticipant(
  supabase: any,
  rawProjectId: string,
  userId: string
): Promise<
  | { ok: true; project: ProjectParticipants; projectId: number }
  | { ok: false; res: NextResponse }
> {
  const projectId = parseInt(rawProjectId, 10);
  if (Number.isNaN(projectId)) {
    return { ok: false, res: jsonError(400, 'Invalid project id') };
  }

  const { data: project, error } = await supabase
    .from('campaign_projects')
    .select('id, owner_user_id, counterparty_user_id')
    .eq('id', projectId)
    .single();

  // A non-participant must not be able to tell "exists but denied" from
  // "does not exist", so both answer 404.
  if (error || !project) {
    return { ok: false, res: jsonError(404, 'Project not found') };
  }
  if (project.owner_user_id !== userId && project.counterparty_user_id !== userId) {
    return { ok: false, res: jsonError(404, 'Project not found') };
  }

  return { ok: true, project: project as ProjectParticipants, projectId };
}

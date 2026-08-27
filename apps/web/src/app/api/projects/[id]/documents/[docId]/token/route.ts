/**
 * POST /api/projects/[id]/documents/[docId]/token → { url, expires_at }
 *
 * Mints a 10-minute signed download link for one document, for clients (the
 * mobile app) that cannot attach an Authorization header to the request that
 * actually opens the PDF. Requires a normal session and project participation
 * — the token is only ever handed to someone who already proved that here.
 */
import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { signDocumentToken } from '@/lib/documents/download-token';
import { originFromHeaders } from '@/lib/site';

export async function POST(req: Request, context: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id, docId } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const limited = await enforceRateLimit(req, {
      bucket: 'documents:token', limit: 20, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const { data: project } = await supabase
      .from('campaign_projects')
      .select('owner_user_id, counterparty_user_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return jsonError(404, 'Project not found');
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    const { data: doc } = await supabase
      .from('project_documents')
      .select('id')
      .eq('id', docId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (!doc) return jsonError(404, 'Document not found');

    const { token, expiresAt } = signDocumentToken(projectId, docId);
    const base = originFromHeaders(req.headers);
    const url = `${base}/api/projects/${projectId}/documents/${docId}?t=${token}`;

    return NextResponse.json({ url, expires_at: new Date(expiresAt).toISOString() });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

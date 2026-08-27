/**
 * GET /api/projects/[id]/documents/[docId]         → the rendered PDF (session auth)
 * GET /api/projects/[id]/documents/[docId]?t=<tok>  → the rendered PDF (signed-token auth)
 * POST /api/projects/[id]/documents/[docId]/token   → not this route, see ./token/route.ts
 *
 * The PDF is never stored — `project_documents.file_url` stays null by design.
 * This route re-renders it on every request from the frozen `snapshot` jsonb,
 * which is the same guarantee the generator route documents: "regenerating
 * gives back the same document; it is not re-rendered from data that may have
 * moved on."
 *
 * Two ways in, because the two clients have different capabilities:
 *   - web has an Authorization header on every fetch → normal session auth.
 *   - mobile hands this URL to the system browser via Linking.openURL(), which
 *     cannot attach a header. A signed, single-document, 10-minute token
 *     (download-token.ts) stands in instead of putting a real session token in
 *     a URL.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth, jsonError } from '@/lib/api';
import { verifyDocumentToken } from '@/lib/documents/download-token';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReceiptDocument, type ReceiptSnapshot } from '@/lib/documents/receipt-template';

export const runtime = 'nodejs';

export async function GET(req: Request, context: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { id, docId } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const url = new URL(req.url);
    const token = url.searchParams.get('t');

    let supabase: any;
    if (token) {
      // Token path: the token itself IS the authorization — it already proves
      // the holder was allowed to see this exact document at issue time. Use
      // the service-role client since there is no session to read RLS as.
      if (!verifyDocumentToken(token, projectId, docId)) {
        return jsonError(401, 'This download link has expired. Reopen the document from the app.');
      }
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!serviceKey || !svcUrl) return jsonError(500, 'Server misconfigured');
      supabase = createClient(svcUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    } else {
      const auth = await withAuth(req);
      if (!auth.ok) return auth.res;
      supabase = auth.supabase;

      // Session path still needs the participation check the token path gets
      // for free (a token can only be minted for a participant — see token/route.ts).
      const { data: project } = await supabase
        .from('campaign_projects')
        .select('owner_user_id, counterparty_user_id')
        .eq('id', projectId)
        .maybeSingle();
      if (!project) return jsonError(404, 'Project not found');
      if (project.owner_user_id !== auth.user.id && project.counterparty_user_id !== auth.user.id) {
        return jsonError(403, 'Forbidden');
      }
    }

    const { data: doc, error } = await supabase
      .from('project_documents')
      .select('id, project_id, kind, number, snapshot')
      .eq('id', docId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error || !doc) return jsonError(404, 'Document not found');

    const pdfBuffer = await renderToBuffer(<ReceiptDocument snapshot={doc.snapshot as ReceiptSnapshot} />);

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

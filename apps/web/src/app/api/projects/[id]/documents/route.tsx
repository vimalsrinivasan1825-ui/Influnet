/**
 * POST /api/projects/[id]/documents   { kind: 'receipt' | 'proforma' }
 *   → { document: { id, kind, number, file_url, issued_at } }
 * GET  /api/projects/[id]/documents
 *   → { documents: [...] }
 *
 * Both participants may generate and both may download. Issuing is idempotent
 * per (project_id, kind, payment set) — a second POST returns the existing row.
 *
 * Envelope: `document` on POST, `documents` on GET.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReceiptDocument, type ReceiptSnapshot } from '@/lib/documents/receipt-template';

const PostSchema = z.object({
  kind: z.enum(['receipt', 'proforma']),
});

export const runtime = 'nodejs';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    // Participation check
    const { data: project } = await supabase
      .from('campaign_projects')
      .select('owner_user_id, counterparty_user_id')
      .eq('id', projectId)
      .maybeSingle();

    if (!project) return jsonError(404, 'Project not found');
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    const { data: documents, error } = await supabase
      .from('project_documents')
      .select('id, kind, number, file_url, issued_at, total_paise, currency')
      .eq('project_id', projectId)
      .order('issued_at', { ascending: false });

    if (error) return jsonError(500, 'Failed to fetch documents', error);
    return NextResponse.json({ documents: documents ?? [] });
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
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    const limited = await enforceRateLimit(req, {
      bucket: 'documents:issue', limit: 10, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { kind } = parsed.data;

    // Participation check
    const { data: project, error: projErr } = await supabase
      .from('campaign_projects')
      .select('id, title, description, budget, owner_user_id, counterparty_user_id, flow_key, deliverables, is_barter')
      .eq('id', projectId)
      .single();

    if (projErr || !project) return jsonError(404, 'Project not found');
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    // Read confirmed payments from the ledger
    const { data: payments } = await supabase
      .from('project_payments')
      .select('stage_key, amount, status, paid_at')
      .eq('project_id', projectId)
      .eq('status', 'paid');

    const totalPaidPaise = (payments ?? []).reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
    const budgetPaise = Math.round((Number(project.budget) || 0) * 100);

    // Idempotency: if a document of this kind already exists for this payment set, return it
    const { data: existing } = await supabase
      .from('project_documents')
      .select('id, kind, number, file_url, issued_at')
      .eq('project_id', projectId)
      .eq('kind', kind)
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ document: existing });
    }

    // Generate document number: PROJ-{projectId}-{kind abbreviation}-{sequence}
    const abbrev = kind === 'receipt' ? 'REC' : 'PRO';
    const { count } = await supabase
      .from('project_documents')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('kind', kind);

    const number = `PROJ-${projectId}-${abbrev}-${String((count ?? 0) + 1).padStart(3, '0')}`;

    // Read party names
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', [project.owner_user_id, project.counterparty_user_id]);

    const ownerName = profiles?.find((p: { id: string; name: string }) => p.id === project.owner_user_id)?.name || 'Brand';
    const creatorName = profiles?.find((p: { id: string; name: string }) => p.id === project.counterparty_user_id)?.name || 'Creator';

    // Build the frozen snapshot
    const snapshot: ReceiptSnapshot = {
      kind,
      number,
      project: { title: project.title || 'Untitled Project', description: project.description },
      parties: { issuer: ownerName, recipient: creatorName },
      deliverables: project.deliverables || undefined,
      amountPaise: kind === 'receipt' ? totalPaidPaise : budgetPaise,
      currency: 'INR',
      payments: (payments ?? []).map((p: { stage_key: string; amount: number; status: string; paid_at: string | null }) => ({
        stage: p.stage_key,
        amountPaise: p.amount,
        status: p.status,
        paidAt: p.paid_at || undefined,
      })),
      issuedAt: new Date().toISOString(),
    };

    // Render PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderToBuffer(<ReceiptDocument snapshot={snapshot} />) as Buffer;
    } catch (renderErr) {
      console.error('[documents] PDF render failed:', renderErr);
      return jsonError(500, 'Failed to generate PDF');
    }

    // Store the document row
    const { data: doc, error: insErr } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        kind,
        number,
        snapshot,
        total_paise: snapshot.amountPaise,
        currency: 'INR',
        issued_by: user.id,
      })
      .select('id, kind, number, file_url, issued_at')
      .single();

    if (insErr) return jsonError(500, 'Failed to record document', insErr);

    return NextResponse.json({ document: doc });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

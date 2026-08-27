/**
 * POST /api/projects/[id]/documents → { document }
 * GET  /api/projects/[id]/documents → { documents }
 *
 * Envelope: `document` on single, `documents` on list.
 *
 * POST issues a receipt or proforma. GET lists issued documents.
 * Both participants may generate and download.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { requireProjectParticipant } from '@/lib/project-access';

const IssueSchema = z.object({
  kind: z.enum(['receipt', 'proforma']),
});

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id: projectId } = await context.params;

    const access = await requireProjectParticipant(supabase, projectId, user.id);
    if (!access.ok) return access.res;

    const { data: documents, error } = await supabase
      .from('project_documents')
      .select('id, kind, number, total_paise, currency, file_url, issued_at, cancelled_at')
      .eq('project_id', projectId)
      .order('issued_at', { ascending: false });

    if (error) return jsonError(500, 'Failed to fetch documents', error);
    return NextResponse.json({ documents: documents ?? [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id: projectId } = await context.params;

    const limited = await enforceRateLimit(req, {
      bucket: 'documents:issue',
      limit: 10,
      windowMs: 60_000,
      key: user.id,
    });
    if (limited) return limited;

    const access = await requireProjectParticipant(supabase, projectId, user.id);
    if (!access.ok) return access.res;

    const parsed = IssueSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 },
      );
    }
    const { kind } = parsed.data;

    // Fetch the project + payments to build the snapshot
    const { data: project } = await supabase
      .from('campaign_projects')
      .select(`
        id, title, description, deliverables, budget, flow_key,
        owner_user_id, counterparty_user_id,
        owner:profiles!campaign_projects_owner_user_id_fkey(name),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(name)
      `)
      .eq('id', projectId)
      .single();

    if (!project) return jsonError(404, 'Project not found');

    // Fetch confirmed payments
    const { data: payments } = await supabase
      .from('project_payments')
      .select('stage_key, amount_paise, status, paid_at')
      .eq('project_id', projectId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: true });

    const totalPaidPaise = (payments ?? []).reduce((sum: number, p: any) => sum + (p.amount_paise || 0), 0);
    const budgetPaise = Number(project.budget || 0) * 100;

    // Idempotent: if a document of this kind already exists for this payment set, return it
    const existingKey = JSON.stringify({
      payments: (payments ?? []).map((p: any) => `${p.stage_key}:${p.amount_paise}`),
    });

    const { data: existing } = await supabase
      .from('project_documents')
      .select('id, kind, number, file_url, issued_at')
      .eq('project_id', projectId)
      .eq('kind', kind)
      .eq('cancelled_at', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ document: existing });
    }

    // Generate a sequential number
    const { count } = await supabase
      .from('project_documents')
      .select('*', { count: 'exact', head: true })
      .eq('kind', kind);

    const sequenceNum = (count || 0) + 1;
    const prefix = kind === 'receipt' ? 'RCP' : 'PFM';
    const number = `${prefix}-${String(sequenceNum).padStart(5, '0')}`;

    // Determine if payment has been made — if not, force proforma
    const effectiveKind = totalPaidPaise === 0 ? 'proforma' : kind;

    const ownerName = (project.owner as any)?.name || 'Brand';
    const counterpartyName = (project.counterparty as any)?.name || 'Creator';

    // Build snapshot — frozen at issue time
    const snapshot = {
      kind: effectiveKind,
      number,
      project: { title: project.title, description: project.description },
      parties: { issuer: ownerName, recipient: counterpartyName },
      deliverables: project.deliverables || undefined,
      amountPaise: effectiveKind === 'receipt' ? totalPaidPaise : budgetPaise,
      currency: 'INR',
      payments: (payments ?? []).map((p: any) => ({
        stage: p.stage_key,
        amountPaise: p.amount_paise,
        status: p.status,
        paidAt: p.paid_at,
      })),
      issuedAt: new Date().toISOString(),
    };

    const { data: doc, error: insertErr } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        kind: effectiveKind,
        number,
        snapshot,
        total_paise: snapshot.amountPaise,
        currency: 'INR',
        issued_by: user.id,
      })
      .select('id, kind, number, file_url, issued_at')
      .single();

    if (insertErr) return jsonError(500, 'Failed to issue document', insertErr);

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

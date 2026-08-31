/**
 * POST /api/projects/[id]/documents   { kind: 'receipt' | 'proforma' | 'tax_invoice' }
 *   → { document: { id, kind, number, file_url, issued_at } }
 * GET  /api/projects/[id]/documents
 *   → { documents: [...] }
 *
 * Both participants may generate and both may download. Issuing is idempotent
 * per (project_id, kind, payment set) — a second POST returns the existing row.
 *
 * `tax_invoice` (B4): the creator is the supplier, the brand the recipient —
 * see the header comment on migration 135 for why. Renders as a real Tax
 * Invoice with a GST line when the creator has a GST number on file, or a
 * Bill of Supply (no tax charged) when they don't — most individual creators
 * are not GST-registered, and an unregistered supplier may not charge GST.
 * Either way it draws a real number from the gapless series in
 * allocate_invoice_number() (migration 135), and — same rule as receipt —
 * requires at least one confirmed payment to exist; it is not issuable
 * against an unpaid amount.
 *
 * Envelope: `document` on POST, `documents` on GET.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { requireQuota, releaseQuota } from '@/lib/entitlements';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReceiptDocument, type ReceiptSnapshot } from '@/lib/documents/receipt-template';

const PostSchema = z.object({
  kind: z.enum(['receipt', 'proforma', 'tax_invoice']),
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

    if (kind === 'tax_invoice' && totalPaidPaise <= 0) {
      return jsonError(400, 'A tax invoice needs at least one confirmed payment. Issue a proforma if nothing has been paid yet.');
    }

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

    // ── Free-tier invoice quota ──────────────────────────────────────────
    // Only tax invoices and proformas count — a receipt is an automatic record
    // of a payment that happened, not something a creator chooses to generate.
    // Consumed HERE, before allocate_invoice_number() runs: a number allocated
    // and then not written leaves a gap in the tax series (migration 135's own
    // caveat), so the quota must refuse before that point, and every error
    // path between here and the successful insert releases the unit.
    const metered = kind === 'tax_invoice' || kind === 'proforma';
    if (metered) {
      const blocked = await requireQuota(
        auth,
        'invoices_month',
        'You have generated the 10 documents a Free plan allows this month. Upgrade to Pro for unlimited invoicing.',
      );
      if (blocked) return blocked;
    }
    const releaseInvoiceUnit = async () => {
      if (metered) await releaseQuota(auth, 'invoices_month');
    };

    // Service role from here on: project_documents has RLS enabled with
    // deliberately NO insert policy for `authenticated` (migration 124) — a
    // participant is meant to trigger a document being written, not write one
    // themselves, so a forged document can't be inserted by talking to
    // PostgREST directly with the anon key. allocate_invoice_number() is
    // likewise revoked from authenticated (migration 135). Everything above
    // this point still ran on the caller's own client so RLS kept gating what
    // this route may read; only the two writes RLS is designed to refuse
    // cross over.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !serviceUrl) return jsonError(500, 'Server misconfigured');
    const admin = createClient(serviceUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Read party names (and, for a tax invoice, GST details) with the SERVICE
    // ROLE, not the caller's own client. gst_number has no SELECT grant for
    // `authenticated` at all on either profiles or business_profiles — and
    // deliberately so; it should not become broadly readable just because
    // this route wants it once. Postgres column privileges are all-or-nothing
    // PER QUERY too: including an ungranted column in a select fails the
    // WHOLE query, which is what silently turned every party name into its
    // fallback ("Brand" / "Creator") the moment gst_number was added here.
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name, gst_number')
      .in('id', [project.owner_user_id, project.counterparty_user_id]);

    const ownerRow = profiles?.find((p: { id: string }) => p.id === project.owner_user_id);
    const creatorRow = profiles?.find((p: { id: string }) => p.id === project.counterparty_user_id);
    const ownerName = ownerRow?.name || 'Brand';
    const creatorName = creatorRow?.name || 'Creator';

    let taxSnapshot: ReceiptSnapshot['tax'];
    let number: string;

    if (kind === 'tax_invoice') {
      // Creator is the supplier (see the module header comment for why).
      const supplierGstin: string | null = (creatorRow as any)?.gst_number ?? null;
      const isBillOfSupply = !supplierGstin;

      const { data: bizProfile } = await admin
        .from('business_profiles')
        .select('gst_number, registered_address, state')
        .eq('user_id', project.owner_user_id)
        .maybeSingle();

      const { data: settings } = await admin
        .from('billing_settings')
        .select('gst_rate_percent')
        .maybeSingle();
      const ratePercent = Number(settings?.gst_rate_percent ?? 18);

      const taxableAmountPaise = totalPaidPaise;
      const taxAmountPaise = isBillOfSupply ? 0 : Math.round((taxableAmountPaise * ratePercent) / 100);

      taxSnapshot = {
        isBillOfSupply,
        supplier: { name: creatorName, gstin: supplierGstin },
        recipient: {
          name: ownerName,
          gstin: bizProfile?.gst_number ?? null,
          address: bizProfile?.registered_address ?? null,
          state: bizProfile?.state ?? null,
        },
        ratePercent,
        taxableAmountPaise,
        taxAmountPaise,
      };

      const series = `${isBillOfSupply ? 'bos' : 'inv'}_${new Date().getFullYear()}`;
      const { data: seq, error: seqErr } = await admin.rpc('allocate_invoice_number', { p_series: series });
      if (seqErr || seq == null) { await releaseInvoiceUnit(); return jsonError(500, 'Could not allocate an invoice number', seqErr); }
      number = `${isBillOfSupply ? 'BOS' : 'INV'}-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
    } else {
      // Receipt / proforma keep their existing per-project sequence — this
      // has no legal numbering requirement, unlike a tax invoice.
      const abbrev = kind === 'receipt' ? 'REC' : 'PRO';
      const { count } = await supabase
        .from('project_documents')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('kind', kind);
      number = `PROJ-${projectId}-${abbrev}-${String((count ?? 0) + 1).padStart(3, '0')}`;
    }

    // Build the frozen snapshot
    const snapshot: ReceiptSnapshot = {
      kind,
      number,
      project: { title: project.title || 'Untitled Project', description: project.description },
      parties: { issuer: ownerName, recipient: creatorName },
      deliverables: project.deliverables || undefined,
      amountPaise: kind === 'proforma' ? budgetPaise : totalPaidPaise,
      currency: 'INR',
      payments: (payments ?? []).map((p: { stage_key: string; amount: number; status: string; paid_at: string | null }) => ({
        stage: p.stage_key,
        amountPaise: p.amount,
        status: p.status,
        paidAt: p.paid_at || undefined,
      })),
      issuedAt: new Date().toISOString(),
      tax: taxSnapshot,
    };

    // Render PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderToBuffer(<ReceiptDocument snapshot={snapshot} />) as Buffer;
    } catch (renderErr) {
      console.error('[documents] PDF render failed:', renderErr);
      await releaseInvoiceUnit();
      return jsonError(500, 'Failed to generate PDF');
    }

    const { data: doc, error: insErr } = await admin
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

    if (insErr) { await releaseInvoiceUnit(); return jsonError(500, 'Failed to record document', insErr); }

    return NextResponse.json({ document: doc });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

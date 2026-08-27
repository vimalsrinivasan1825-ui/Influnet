import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';
import { ensureStageItems } from '@/lib/stage-items-gate';
import { isRazorpayConfigured } from '@/lib/payments/razorpay';
import { flowOf } from '@influnet/core';

// GET: list a project's stage checklist. Seeds the default items on first load
// (idempotent via the UNIQUE(project_id, stage_key, label) constraint).
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    // Explicit participation check. RLS already stops a stranger SEEING any
    // rows, so this was never a data leak — but with only RLS the route
    // answered a non-participant `200 {items: []}`, which reads as "this
    // project has no checklist" rather than "this isn't your project". Say the
    // true thing, and keep the rule uniform across /api/projects/[id]/*.
    const { data: project } = await supabase
      .from('campaign_projects')
      .select('owner_user_id, counterparty_user_id, flow_key')
      .eq('id', projectId)
      .maybeSingle();

    if (!project) return jsonError(404, 'Project not found');
    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    // Shared with the advance/sign-off gate in the project PATCH route. One
    // seeding path means the gate can never disagree with what this endpoint
    // reports, which is exactly how the checklist used to end up empty for
    // anyone who acted on a project without opening it first.
    const items = await ensureStageItems(supabase, projectId, flowOf(project ?? {}));

    // null = the checklist genuinely can't be read (migration 054 not applied).
    // Return an empty list so the board still loads, same as before.
    if (items === null) return NextResponse.json({ items: [] });

    const sorted = [...items].sort(
      (a, b) => a.stage_key.localeCompare(b.stage_key) || a.position - b.position,
    );
    return NextResponse.json({ items: sorted });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

const PatchStageItemSchema = z.object({
  item_id: z.string().uuid(),
  done: z.boolean(),
});

// PATCH: toggle a single checklist item done/undone. Stamps done_by with the
// acting user. RLS restricts writes to project participants.
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    if (Number.isNaN(projectId)) return jsonError(400, 'Invalid project id');

    // Deletion hardening: a cancelled project may not have checklist items
    // toggled — the record is frozen for reference.
    const { data: projStatus } = await supabase
      .from('campaign_projects')
      .select('status')
      .eq('id', projectId)
      .maybeSingle();
    if (projStatus?.status === 'cancelled') {
      return jsonError(409, 'This project has been cancelled. The checklist is locked for reference.');
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON body');
    }

    const parsed = PatchStageItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { item_id, done } = parsed.data;

    // Ownership gate: the dashboard disables this control unless
    // it.owner_role is 'both' or matches the caller's project role — but that
    // was UI-only. Enforce the same rule here, or either party can tick the
    // OTHER side's approval gate (e.g. a creator marking "Brand approved the
    // concept" done themselves).
    const { data: project } = await supabase
      .from('campaign_projects')
      .select('owner_user_id, counterparty_user_id')
      .eq('id', projectId)
      .single();
    if (!project) return jsonError(404, 'Project not found');
    const userRole: 'business' | 'creator' = project.owner_user_id === user.id ? 'business' : 'creator';

    const { data: item } = await supabase
      .from('project_stage_items')
      .select('owner_role, is_gate, stage_key')
      .eq('id', item_id)
      .eq('project_id', projectId)
      .single();
    if (!item) return jsonError(404, 'Checklist item not found');
    if (item.owner_role !== 'both' && item.owner_role !== userRole) {
      return jsonError(403, `Only the ${item.owner_role} can mark this step done.`);
    }

    // Payment integrity: when in-app payments are configured, a payment GATE item
    // (advance/final "received") may NOT be ticked by hand — it opens only when a
    // real Razorpay payment is confirmed by the signed webhook. This closes the
    // "mark it done without paying" bypass. Off-platform (manual) mode is
    // unaffected: there the tick means "I've sent it" and the counterparty still
    // has to sign off the stage to advance.
    if (done && isRazorpayConfigured()) {
      // Only PAYMENT gates open via a confirmed payment. Approval gates
      // (content_confirmation, final_approval) are ticked by hand as normal.
      const isPaymentGate = item.is_gate && (item.stage_key === 'advance_payment' || item.stage_key === 'final_payment' || item.stage_key === 'quick_payment');
      if (isPaymentGate) {
        const { data: paid } = await supabase
          .from('project_payments')
          .select('id')
          .eq('project_id', projectId)
          .eq('stage_key', item.stage_key)
          .eq('status', 'paid')
          .limit(1)
          .maybeSingle();
        if (!paid) {
          return jsonError(403, 'This step opens only once the payment is confirmed. Use the Pay button to complete it.');
        }
      }
    }

    const { data: updated, error } = await supabase
      .from('project_stage_items')
      .update({
        done_at: done ? new Date().toISOString() : null,
        done_by: done ? user.id : null,
      })
      .eq('id', item_id)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) return jsonError(500, 'Failed to update stage item', error);
    return NextResponse.json({ item: updated });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

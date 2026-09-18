import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerClient, isSuperAdmin, jsonError, withAdmin } from '@/lib/api';
import { auditAdmin, type AdminAction } from '@/lib/admin-audit';
import { BroadcastUpdateSchema, approvalThreshold } from '@/lib/broadcast-schema';
import { runBroadcastCycle } from '@/lib/broadcasts';
import { intParam, strParam } from '@/lib/admin-insights';

/**
 * GET    /api/admin/broadcasts/[id]  → { data }  (detail + runs + deliveries)
 * PATCH  /api/admin/broadcasts/[id]  { action | fields }
 * DELETE /api/admin/broadcasts/[id]  (drafts only)
 *
 * Actions: schedule | send_now | test | pause | resume | cancel | approve.
 * Every one is audited. A send above the approval threshold needs a SECOND
 * admin to approve first — the composer cannot approve its own big send.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ActionSchema = z.object({
  action: z.enum(['schedule', 'send_now', 'test', 'pause', 'resume', 'cancel', 'approve']),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid broadcast id');
    const q = new URL(req.url).searchParams;
    const { data, error } = await callerClient(req).rpc('admin_broadcast_detail', {
      p_id: id,
      p_status: strParam(q, 'status', 20),
      p_limit: intParam(q, 'limit', 100, 1, 1000),
      p_offset: intParam(q, 'offset', 0, 0, 100_000),
    });
    if (error) return jsonError(500, 'Could not load this broadcast', error);
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(500, 'Could not load this broadcast', error);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid broadcast id');

    const body = await req.json().catch(() => ({}));

    const { data: current, error: readErr } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (readErr || !current) return jsonError(404, 'Broadcast not found', readErr);
    const b = current as any;

    // ── Editing fields (draft / scheduled / paused only) ────────────────────
    if (!body.action) {
      if (b.system_owned) return jsonError(400, 'This is a built-in automation; only pause and resume are available.');
      if (!['draft', 'scheduled', 'paused'].includes(b.status)) {
        return jsonError(400, `A ${b.status} broadcast can no longer be edited.`);
      }
      const parsed = BroadcastUpdateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
      }
      const patch: Record<string, unknown> = { ...parsed.data };
      // Any content change invalidates a previous approval.
      if (Object.keys(patch).length > 0) patch.approved_by = null;
      const { data, error } = await supabase.from('broadcasts').update(patch).eq('id', id).select('*').single();
      if (error) return jsonError(400, `Could not update: ${error.message}`, error);
      await auditAdmin({
        actorId: user.id, actorEmail: user.email ?? null, action: 'broadcast_updated',
        targetId: id, targetType: 'broadcast', metadata: { fields: Object.keys(parsed.data) }, req,
      });
      return NextResponse.json({ broadcast: data });
    }

    // ── Actions ────────────────────────────────────────────────────────────
    const parsedAction = ActionSchema.safeParse(body);
    if (!parsedAction.success) return jsonError(400, 'Unknown action');
    const { action } = parsedAction.data;

    const audit = async (a: AdminAction, metadata: Record<string, unknown> = {}) =>
      auditAdmin({
        actorId: user.id, actorEmail: user.email ?? null, action: a,
        targetId: id, targetType: 'broadcast', metadata: { name: b.name, ...metadata }, req,
      });

    if (action === 'approve') {
      if (b.created_by === user.id && !(await isSuperAdmin(supabase, user.id))) {
        return jsonError(403, 'A large send has to be approved by a different admin.');
      }
      await supabase.from('broadcasts').update({ approved_by: user.id }).eq('id', id);
      await audit('broadcast_approved');
      return NextResponse.json({ ok: true, approved: true });
    }

    if (action === 'pause' || action === 'resume' || action === 'cancel') {
      const status = action === 'pause' ? 'paused' : action === 'resume' ? 'scheduled' : 'cancelled';
      if (action !== 'cancel' && !['scheduled', 'paused', 'sending'].includes(b.status)) {
        return jsonError(400, `A ${b.status} broadcast cannot be ${action}d.`);
      }
      await supabase.from('broadcasts').update({ status }).eq('id', id);
      if (action === 'cancel') {
        // Nothing queued should still go out.
        await supabase
          .from('broadcast_deliveries')
          .update({ status: 'skipped', skip_reason: 'cancelled' })
          .eq('broadcast_id', id)
          .in('status', ['queued', 'deferred']);
      }
      await audit(action === 'pause' ? 'broadcast_paused' : action === 'cancel' ? 'broadcast_cancelled' : 'broadcast_scheduled');
      return NextResponse.json({ ok: true, status });
    }

    if (action === 'test') {
      const { data: run, error } = await supabase.rpc('enqueue_broadcast_run', {
        p_broadcast_id: id,
        p_scheduled_for: new Date().toISOString(),
        p_test_user: user.id,
      });
      if (error) return jsonError(500, `Could not queue the test send: ${error.message}`, error);
      // Deliver immediately so the admin sees it on their own phone now.
      const cycle = await runBroadcastCycle(supabase, { skipDue: true, skipReceipts: true });
      await audit('broadcast_test_sent', { run });
      return NextResponse.json({ ok: true, run, cycle });
    }

    // schedule | send_now
    if (!['draft', 'scheduled', 'paused'].includes(b.status)) {
      return jsonError(400, `A ${b.status} broadcast cannot be scheduled again.`);
    }

    // Approval gate — count the real audience first.
    const { data: preview } = await callerClient(req).rpc('admin_preview_audience', {
      p_segment: b.audience ?? {},
      p_kind: b.kind,
    });
    const total = Number((preview as any)?.total ?? 0);
    if (total > approvalThreshold() && !b.approved_by) {
      return NextResponse.json(
        {
          error: `This reaches ${total.toLocaleString('en-IN')} people. A second admin has to approve it first.`,
          needsApproval: true,
          recipients: total,
        },
        { status: 409 },
      );
    }

    const sendAt =
      action === 'send_now'
        ? new Date().toISOString()
        : b.frequency === 'once'
          ? (body.send_at ?? b.send_at)
          : null;

    if (b.frequency === 'once' && !sendAt) {
      return jsonError(400, 'Pick when this should go out.');
    }

    await supabase
      .from('broadcasts')
      .update({ status: 'scheduled', ...(b.frequency === 'once' ? { send_at: sendAt } : {}) })
      .eq('id', id);

    // send_now: run the cycle inline instead of waiting for the next tick.
    let cycle = null;
    if (action === 'send_now') {
      cycle = await runBroadcastCycle(supabase, { skipReceipts: true });
    }
    await audit(action === 'send_now' ? 'broadcast_sent' : 'broadcast_scheduled', { recipients: total, sendAt });
    return NextResponse.json({ ok: true, recipients: total, cycle });
  } catch (error) {
    return jsonError(500, 'Could not update this broadcast', error);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid broadcast id');

    const { data: b } = await supabase.from('broadcasts').select('status, name, system_owned').eq('id', id).maybeSingle();
    if (!b) return jsonError(404, 'Broadcast not found');
    if ((b as any).system_owned) return jsonError(400, 'Built-in automations cannot be deleted — pause it instead.');
    if ((b as any).status !== 'draft') {
      return jsonError(400, 'Only a draft can be deleted. Cancel it instead, so its delivery log survives.');
    }

    const { error } = await supabase.from('broadcasts').delete().eq('id', id);
    if (error) return jsonError(500, 'Could not delete this draft', error);
    await auditAdmin({
      actorId: user.id, actorEmail: user.email ?? null, action: 'broadcast_deleted',
      targetId: id, targetType: 'broadcast', metadata: { name: (b as any).name }, req,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not delete this draft', error);
  }
}

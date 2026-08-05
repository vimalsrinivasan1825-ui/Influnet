import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

/**
 * Admin project detail — participants, stage, budget, checklist, activity,
 * and the payment ledger. Read-only: no participant actions (no messaging,
 * no stage advancement) — this is oversight, not a way to operate the deal.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { id } = await context.params;

    const { data: project, error: projectErr } = await supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, email, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, email, role)
      `)
      .eq('id', id)
      .single();

    if (projectErr || !project) {
      return jsonError(404, 'Project not found');
    }

    const [{ data: stageItems }, { data: activity }, { data: payments }] = await Promise.all([
      supabase
        .from('project_stage_items')
        .select('id, stage_key, label, owner_role, is_required, is_gate, position, done_at, done_by')
        .eq('project_id', id)
        .order('position', { ascending: true }),
      supabase
        .from('project_activity')
        .select('id, actor_user_id, type, summary, metadata, created_at')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_payments')
        .select('id, stage_key, amount, currency, status, payer_id, created_at, paid_at')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
    ]);

    return NextResponse.json({
      project,
      stageItems: stageItems || [],
      activity: activity || [],
      // paise -> rupees for display.
      payments: (payments || []).map((p: any) => ({ ...p, amount: p.amount / 100 })),
    });
  } catch (error) {
    return jsonError(500, 'Could not load this project', error);
  }
}

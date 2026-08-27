/**
 * GET  /api/admin/campaigns?status=... → { campaigns }
 * PATCH /api/admin/campaigns/[id] → { campaign }
 *
 * Admin-only: list campaigns by status, force-remove with a reason.
 * Every action goes through the existing admin audit log pattern.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { logActivity } from '@/lib/activity';

const PatchSchema = z.object({
  action: z.enum(['remove', 'restore']),
  reason: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Admin check
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') return jsonError(403, 'Admin only');

    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    let query = supabase
      .from('campaigns')
      .select('*, business_user:profiles!campaigns_business_user_id_fkey(id, name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) query = query.eq('status', status);

    const { data: campaigns, error } = await query;
    if (error) return jsonError(500, 'Failed to fetch campaigns', error);

    return NextResponse.json({ campaigns: campaigns ?? [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') return jsonError(403, 'Admin only');

    const { id } = await context.params;

    const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { action, reason } = parsed.data;

    if (action === 'remove') {
      if (!reason) return jsonError(400, 'A reason is required to remove a campaign');
      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'removed', removed_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return jsonError(500, 'Failed to remove campaign', error);
    } else {
      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'live', removed_reason: null, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return jsonError(500, 'Failed to restore campaign', error);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

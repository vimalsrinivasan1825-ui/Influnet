/**
 * PATCH /api/admin/campaigns/[id] → { campaign }
 *
 * Envelope: `campaign`.
 *
 * Admin-only: approve (pending_review → live), reject, or remove a campaign.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';

const PatchSchema = z.object({
  action: z.enum(['approve', 'reject', 'remove']),
  reason: z.string().max(500).optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    const { id } = await context.params;

    // Admin check
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if ((profile as any)?.role !== 'admin') return jsonError(403, 'Admin only');

    const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 },
      );
    }
    const { action, reason } = parsed.data;

    const statusMap: Record<string, string> = {
      approve: 'live',
      reject: 'draft',
      remove: 'removed',
    };

    const updates: Record<string, unknown> = {
      status: statusMap[action],
      updated_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      updates.published_at = new Date().toISOString();
    }
    if (action === 'remove' && reason) {
      updates.removed_reason = reason;
    }

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !campaign) return jsonError(404, 'Campaign not found');

    return NextResponse.json({ campaign });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

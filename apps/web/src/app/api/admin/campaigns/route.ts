/**
 * GET    /api/admin/campaigns → { campaigns }
 * PATCH  /api/admin/campaigns/[id] → { campaign }
 *
 * Envelope: `campaigns` on list, `campaign` on single.
 *
 * Admin-only: list campaigns in pending_review, approve/remove them.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerClient, jsonError, withAdmin } from '@/lib/api';

const PatchSchema = z.object({
  action: z.enum(['approve', 'reject', 'remove']),
  reason: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  try {
    // withAdmin is the gate (admin role + the Campaigns section). Queries keep
    // running as the caller, so RLS and the campaign triggers see the admin's
    // own JWT exactly as before.
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const supabase = callerClient(req);

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pending_review';

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select(`
        id, title, description, status, created_at, updated_at,
        business_user:profiles!campaigns_business_user_id_fkey(id, name)
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return jsonError(500, 'Failed to fetch campaigns', error);
    return NextResponse.json({ campaigns: campaigns ?? [] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

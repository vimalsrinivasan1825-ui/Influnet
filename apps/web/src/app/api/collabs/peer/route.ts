import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { requireQuota, releaseQuota } from '@/lib/entitlements';
import { notifyUser } from '@/lib/notify';
import { profileNames, nameOf } from '@/lib/email/context';

/**
 * Creator → creator collaboration request.
 *
 * A separate route from the brand path (POST /api/collabs, business-only) so
 * that path and its notification copy stay untouched. The RECEIVING side is
 * shared: rows land in the same `collab_requests` table, show up in the same
 * GET /api/collabs list for both parties, and are accepted through the same
 * PATCH (which opens a conversation — no project, no role assumption).
 *
 * Free creators may send 10 peer requests a month (peer_requests_month meter).
 *
 * Envelope: `{ collab }`.
 */
const Body = z.object({
  to_user_id: z.string().uuid(),
  message: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req, { role: 'influencer' });
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const limited = await enforceRateLimit(req, {
      bucket: 'collabs:peer', limit: 15, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Validation failed');
    const { to_user_id, message } = parsed.data;

    if (to_user_id === user.id) return jsonError(400, 'You cannot send a request to yourself.');

    const { data: blocked } = await supabase.rpc('is_blocked_pair', { a: user.id, b: to_user_id });
    if (blocked) return jsonError(403, 'You can no longer send requests to this account.');

    // The recipient must also be a creator.
    const { data: recipient, error: recipientErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', to_user_id)
      .maybeSingle();
    if (recipientErr) return jsonError(500, 'Could not check who this request is for', recipientErr);
    if (!recipient) return jsonError(404, 'That account no longer exists.');
    if (recipient.role !== 'influencer') {
      return jsonError(400, 'Peer requests can only be sent to other creators.');
    }

    // Plan quota — last check before the write, so a unit is only spent on a
    // request that is genuinely about to be created.
    const overQuota = await requireQuota(
      { supabase, user },
      'peer_requests_month',
      'You have sent the 10 creator requests a Free plan allows this month. Upgrade to Pro for more.',
    );
    if (overQuota) return overQuota;

    const { data, error } = await supabase
      .from('collab_requests')
      .insert({
        from_user_id: user.id,
        to_user_id,
        message: message || 'Collaboration request',
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      await releaseQuota({ supabase, user }, 'peer_requests_month');
      if (error.code === '23505') {
        return jsonError(409, 'You already have a pending request with this creator.');
      }
      return jsonError(500, 'Could not send the request', error);
    }

    const names = await profileNames([user.id]);
    await notifyUser({
      userId: to_user_id,
      type: 'collab_request',
      title: 'New collaboration request',
      body: `${nameOf(names, user.id)} wants to collaborate with you. Accept it to open a conversation.`,
      link: '/dashboard/requests',
    });

    return NextResponse.json({ collab: data }, { status: 201 });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

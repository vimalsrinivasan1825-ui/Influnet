import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api';
import { resolveEntitlements } from '@/lib/entitlements';

/**
 * Pin / unpin a conversation for the CALLER.
 *
 * A pin is per-user (migration 138's conversation_pins), so it can't live in
 * the shared Stream channel. The Free cap of 3 is enforced by the
 * enforce_pin_quota trigger (migration 140) — this route maps its
 * `pin_quota_exceeded` exception to a 402.
 *
 * Envelope: returns `{ pinned: boolean }`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({ pinned: z.boolean() });

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return jsonError(400, 'Invalid conversation ID format');

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, 'Send { pinned: true | false }.');

    // Participant check — the RLS WITH CHECK enforces this too, but a clean 403
    // beats a confusing constraint error.
    const { data: part } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!part) return jsonError(403, 'You are not a participant of this conversation.');

    if (parsed.data.pinned) {
      const { error } = await supabase
        .from('conversation_pins')
        .insert({ user_id: user.id, conversation_id: id });

      if (error) {
        // Already pinned — idempotent success.
        if (error.code === '23505') return NextResponse.json({ pinned: true });

        if (/pin_quota_exceeded/i.test(error.message || '')) {
          const ent = await resolveEntitlements(supabase, user.id);
          return NextResponse.json(
            {
              error: `Free plans pin up to ${ent.limits.pinnedChats ?? 3} chats. Unpin one, or upgrade to Pro.`,
              feature: 'chats.pin',
              tier: ent.tier,
              limit: ent.limits.pinnedChats,
              upgradeUrl: '/dashboard/billing',
            },
            { status: 402 },
          );
        }
        return jsonError(500, 'Could not pin that conversation', error);
      }
      return NextResponse.json({ pinned: true });
    }

    const { error } = await supabase
      .from('conversation_pins')
      .delete()
      .eq('user_id', user.id)
      .eq('conversation_id', id);
    if (error) return jsonError(500, 'Could not unpin that conversation', error);
    return NextResponse.json({ pinned: false });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

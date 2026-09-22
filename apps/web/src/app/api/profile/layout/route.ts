import { NextResponse } from 'next/server';
import { sanitizeProfileLayout, resolveProfileLayout } from '@influnet/core';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/profile/layout — the caller's own published layout, resolved.
 *
 * Returns `{ layout, username }`. The mobile editor starts from this and needs
 * the username to load the page it previews.
 */
export async function GET(req: Request) {
  const auth = await withAuth(req, { role: 'influencer' });
  if (!auth.ok) return auth.res;

  const [{ data, error }, { data: me }] = await Promise.all([
    auth.supabase.rpc('get_profile_layout', { p_user_id: auth.user.id }),
    auth.supabase.from('influencer_profiles').select('username').eq('user_id', auth.user.id).maybeSingle(),
  ]);
  if (error) return jsonError(500, 'Could not load your layout. Try again.', error);

  return NextResponse.json({
    layout: resolveProfileLayout(data),
    username: (me as { username?: string } | null)?.username ?? null,
  });
}

/**
 * PUT /api/profile/layout — publish the caller's public-profile layout.
 *
 * Body: a ProfileLayout (packages/core/src/profile-layout.ts). Returns
 * `{ layout }`, the resolved layout as it will render.
 *
 * The body is sanitised here AND on every read. Here, so a creator gets back
 * exactly what was kept; on read, because set_my_profile_layout is callable
 * with the creator's own JWT straight through PostgREST, so the stored blob
 * cannot be assumed to have come through this route.
 */
export async function PUT(req: Request) {
  const auth = await withAuth(req, { role: 'influencer' });
  if (!auth.ok) return auth.res;

  const limited = await enforceRateLimit(req, { bucket: 'profile:layout', limit: 30, windowMs: 60_000, key: auth.user.id });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Send the layout as JSON.');
  }

  const layout = sanitizeProfileLayout(body);
  const { data, error } = await auth.supabase.rpc('set_my_profile_layout', { p_layout: layout });
  if (error) return jsonError(500, 'Could not publish your layout. Try again.', error);

  return NextResponse.json({ layout: resolveProfileLayout(data) });
}

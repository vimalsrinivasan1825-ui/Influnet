import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

/**
 * Mark the "Complete your media kit" dashboard nudge as dismissed for this
 * account — the same fix as /api/profile/welcome, applied to the nudge that
 * had the identical localStorage-only bug (migration 077).
 */
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { error } = await supabase
      .from('profiles')
      .update({ mediakit_nudge_dismissed_at: new Date().toISOString() })
      .eq('id', user.id);

    // Migration 077 not applied yet — the nudge keeps its localStorage
    // fallback, so this is not worth failing the request over.
    if (error) return NextResponse.json({ ok: false, migration_pending: true });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

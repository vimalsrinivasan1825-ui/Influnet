import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

/**
 * Snooze the "Verify your Instagram" dashboard nudge for this account — same
 * pattern as /api/profile/mediakit-nudge (migration 077), applied to the
 * ownership nudge (migration 085). This is a snooze, not a permanent
 * dismissal: the component re-shows it after 7 days if the account is still
 * unverified.
 */
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { error } = await supabase
      .from('profiles')
      .update({ ownership_nudge_dismissed_at: new Date().toISOString() })
      .eq('id', user.id);

    // Migration 085 not applied yet — the nudge keeps its localStorage
    // fallback, so this is not worth failing the request over.
    if (error) return NextResponse.json({ ok: false, migration_pending: true });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

/**
 * Mark the signup welcome card as seen for this account.
 *
 * Stored on the profile rather than in localStorage so it follows the user
 * across devices and private windows — the old per-browser flag meant the
 * "Account created!" card reappeared on ordinary logins.
 */
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { error } = await supabase
      .from('profiles')
      .update({ welcome_seen_at: new Date().toISOString() })
      .eq('id', user.id);

    // Migration 074 not applied yet — the modal keeps its localStorage
    // fallback, so this is not worth failing the request over.
    if (error) return NextResponse.json({ ok: false, migration_pending: true });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

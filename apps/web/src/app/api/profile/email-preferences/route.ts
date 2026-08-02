import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

/**
 * Per-category email opt-outs (migration 098).
 *
 * Reads and writes go through the CALLER's RLS-scoped client, so the policies
 * on email_preferences are the access control — this route never needs the
 * service-role key and therefore can't be tricked into editing someone else's
 * row.
 */

const CATEGORIES = ['collab', 'project', 'payment', 'message', 'marketing'] as const;
type Category = (typeof CATEGORIES)[number];

/** Absent row = these. Marketing is off until someone explicitly opts in. */
const DEFAULTS: Record<Category, boolean> = {
  collab: true,
  project: true,
  payment: true,
  message: true,
  marketing: false,
};

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from('email_preferences')
      .select('collab, project, payment, message, marketing')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      // Migration 098 not applied yet — report defaults rather than 500, so the
      // settings screen renders instead of showing an error nobody can act on.
      console.warn('[email-preferences] read failed:', error.message);
      return NextResponse.json({ preferences: DEFAULTS, migration_pending: true });
    }

    return NextResponse.json({ preferences: { ...DEFAULTS, ...(data ?? {}) } });
  } catch (error) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON body');
    }

    // Whitelist: only known categories, only booleans. Anything else — including
    // user_id — is dropped rather than passed through to the upsert.
    const patch: Partial<Record<Category, boolean>> = {};
    for (const key of CATEGORIES) {
      if (typeof body[key] === 'boolean') patch[key] = body[key] as boolean;
    }
    if (Object.keys(patch).length === 0) {
      return jsonError(400, 'Nothing to update. Send at least one of: ' + CATEGORIES.join(', '));
    }

    const { data, error } = await supabase
      .from('email_preferences')
      .upsert(
        { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select('collab, project, payment, message, marketing')
      .single();

    if (error) return jsonError(500, 'Could not save your email preferences', error);

    return NextResponse.json({ preferences: { ...DEFAULTS, ...(data ?? {}) } });
  } catch (error) {
    return jsonError(500, 'Internal server error', error);
  }
}

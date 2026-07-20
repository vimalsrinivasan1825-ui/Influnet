import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

export interface ActivityEvent {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  link: string | null;
  project_id: number | null;
  actor_is_me: boolean;
}

/**
 * The signed-in user's own timeline, newest first — account creation, every
 * collaboration request, the terms proposed and answered, projects started and
 * finished, each stage moved, and payments.
 *
 * Derived in the database from the rows that already record these facts (see
 * migration 073) rather than from a separate event log, so it covers a user's
 * whole history rather than only what happened after the feature shipped.
 */
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 200);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

    const { data, error } = await supabase.rpc('get_user_activity', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      // Degrade to an empty feed if migration 073 has not been applied, rather
      // than breaking the page.
      if (error.code === 'PGRST202' || error.message?.includes('Could not find the function')) {
        return NextResponse.json({ events: [], migration_pending: true });
      }
      return jsonError(500, 'Could not load your activity', error);
    }

    return NextResponse.json({ events: (data ?? []) as ActivityEvent[] });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

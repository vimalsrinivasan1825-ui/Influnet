import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

/**
 * Platform analytics, computed from our own database.
 *
 * Deliberately NOT PostHog. Two reasons: this works before anyone has created
 * a PostHog project (which is the state the product ships in), and it stays
 * correct for users running an ad blocker, which silently drops a meaningful
 * share of client-side analytics. PostHog answers "what did people click";
 * this answers "what is actually in the database", and for a marketplace the
 * second question is the one that matters.
 *
 * The RPCs guard themselves with is_admin(), so they must be called with the
 * CALLER's client — the service-role client has no auth.uid() and would fail
 * the check. Same trap documented on withAdmin in lib/api.ts.
 */

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { user } = auth;

    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get('days') ?? 30);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 180) : 30;

    // Rebuild a caller-scoped client so is_admin() sees a real auth.uid().
    const { createClient } = await import('@supabase/supabase-js');
    const authHeader = req.headers.get('Authorization') ?? '';
    const scoped = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
          fetch: (input: any, init: any) => fetch(input, { ...init, cache: 'no-store' }),
        },
      }
    );

    const [growth, funnel, support] = await Promise.all([
      scoped.rpc('get_admin_growth_series', { p_days: days }),
      scoped.rpc('get_admin_funnel'),
      scoped.rpc('get_admin_support_stats'),
    ]);

    // A missing RPC means migration 098 has not been applied yet. That is an
    // expected state on an environment that is behind, so it gets a specific
    // message rather than a generic 500 that sends someone reading logs.
    const missing = [growth.error, funnel.error, support.error].find((e) =>
      e?.message?.includes('does not exist')
    );
    if (missing) {
      return jsonError(
        503,
        'Analytics functions are not installed on this database yet. Apply migration 098 and retry.',
        missing
      );
    }

    if (growth.error) return jsonError(500, 'Could not load platform analytics', growth.error);

    return NextResponse.json({
      days,
      growth: growth.data ?? [],
      funnel: funnel.data ?? null,
      support: support.data ?? null,
      generated_at: new Date().toISOString(),
      generated_for: user.id,
    });
  } catch (error) {
    return jsonError(500, 'Could not load platform analytics', error);
  }
}

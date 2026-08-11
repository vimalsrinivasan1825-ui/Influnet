import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { resolveEntitlements } from '@/lib/entitlements';

/**
 * What the signed-in caller is entitled to, resolved at runtime.
 *
 * This is how the browser and the mobile app learn whether paid plans exist at
 * all. `SUBSCRIPTIONS_ENABLED` is a server variable with no NEXT_PUBLIC_
 * prefix, so it is NOT in the bundle — a client that tried to read it would
 * get `undefined` and render the wrong thing forever. It has to come from here.
 *
 * Reports on the CALLER ONLY. There is no user parameter and there must never
 * be one: an endpoint that answered "is this other person paying?" would turn
 * the subscriber list into something anyone signed in could enumerate.
 *
 * Envelope note (see AGENTS.md): this returns the entitlement object at the
 * TOP LEVEL, not wrapped. Read this route before consuming it.
 */
export async function GET(req: Request) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;

  const ent = await resolveEntitlements(auth.supabase, auth.user.id);

  return NextResponse.json(ent, {
    // `no-store`, not a short max-age.
    //
    // A 30-second browser cache here meant that immediately after paying, the
    // UI kept serving the cached FREE answer — the user completed checkout and
    // watched nothing change, which is the single worst moment to look broken.
    // Even an explicit refresh hit the HTTP cache rather than the server.
    //
    // Nothing is lost by removing it: resolveEntitlements() already memoises
    // per user for 60s in-process, so this costs a cheap round trip, not a
    // database read. `private` stays regardless — a shared cache handing one
    // user's plan to another would be far worse than either.
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

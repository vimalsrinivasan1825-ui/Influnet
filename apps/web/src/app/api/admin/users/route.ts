import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';
import { logger } from '@/lib/logger';

/**
 * Last sign-in time per user id, read from `auth.users`.
 *
 * The platform activity feed (099) is derived from product tables, so it only
 * ever shows someone once they DO something — a tester who signs in, looks
 * around and leaves is invisible there. This is the missing half: it answers
 * "who has actually been in?" during a tester round.
 *
 * `auth.users` is not reachable over PostgREST, so it has to come through the
 * Admin API, which pages at 1000 max. Never fatal: if the lookup fails the
 * users list still renders, just without the column.
 */
interface AuthUserLite {
  id: string;
  email: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
  emailConfirmedAt: string | null;
  metaRole: string | null;
  metaName: string | null;
  metaUsername: string | null;
}

/**
 * Every row in `auth.users` — reachable only through the Admin API (PostgREST
 * can't see the auth schema), which pages at 1000. Used both for the last
 * sign-in column and to surface ORPHANED accounts: an auth user with a
 * confirmed email but no `profiles` row (a signup that never finished, which
 * the profiles-only list would otherwise hide entirely). Never fatal.
 */
async function allAuthUsers(supabase: any): Promise<AuthUserLite[]> {
  const out: AuthUserLite[] = [];
  const perPage = 1000;

  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      logger.warn('admin/users: auth.users lookup failed (non-fatal)', { error: error.message });
      return out;
    }
    const batch = data?.users ?? [];
    for (const u of batch) {
      const m = (u.user_metadata ?? {}) as Record<string, unknown>;
      out.push({
        id: u.id,
        email: u.email ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        metaRole: typeof m.role === 'string' ? m.role : null,
        metaName: typeof m.name === 'string' ? m.name : null,
        metaUsername: typeof m.username === 'string' ? m.username : null,
      });
    }
    if (batch.length < perPage || page >= 20) break;
  }

  return out;
}

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    // Fetch all profiles. The auth.users lookup is a separate round trip to a
    // different API, so run it alongside rather than after.
    const [{ data: profiles, error }, authUsers] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, role, email, name, phone, location, created_at, updated_at')
        .order('created_at', { ascending: false }),
      allAuthUsers(supabase),
    ]);

    if (error) throw error;

    const lastSignIn = new Map(authUsers.map((u) => [u.id, u.lastSignInAt]));
    const profileIds = new Set((profiles || []).map((p: any) => p.id));

    // For each profile, fetch extended profile data
    const enrichedUsers = await Promise.all(
      (profiles || []).map(async (p: any) => {
        // `undefined` (id absent from auth.users) and `null` (present, never
        // signed in) both render as "Never" — the distinction isn't actionable.
        const enriched: any = { ...p, last_sign_in_at: lastSignIn.get(p.id) ?? null };

        if (p.role === 'business_owner') {
          const { data: biz } = await supabase
            .from('business_profiles')
            .select('company_name, industry, approval_status')
            .eq('user_id', p.id)
            .single();
          if (biz) {
            enriched.company_name = biz.company_name;
            enriched.business_industry = biz.industry;
            enriched.approval_status = biz.approval_status;
          }
        } else if (p.role === 'influencer') {
          const { data: inf } = await supabase
            .from('influencer_profiles')
            .select('username, niche')
            .eq('user_id', p.id)
            .single();
          if (inf) {
            enriched.username = inf.username;
            enriched.niche = inf.niche;
          }
        }

        return enriched;
      })
    );

    // Orphaned accounts: an auth user with no profiles row. Almost always a
    // signup that stalled (email confirmed, wizard never finished) — invisible
    // on a profiles-only list, and exactly what an admin needs to be able to
    // clean up. Test-harness accounts (@test.influnet.com / @influnet-audit.test)
    // are excluded — they're churned by the E2E suite, not a real problem.
    const orphans = authUsers
      .filter(
        (u) =>
          !profileIds.has(u.id) &&
          u.email &&
          !/@(test\.influnet\.com|influnet-audit\.test)$/i.test(u.email),
      )
      .map((u) => ({
        id: u.id,
        role: u.metaRole ?? 'unknown',
        email: u.email,
        name: u.metaName ?? '',
        phone: null,
        location: null,
        created_at: u.createdAt,
        updated_at: u.createdAt,
        last_sign_in_at: u.lastSignInAt,
        username: u.metaUsername ?? undefined,
        orphaned: true as const,
        email_confirmed: !!u.emailConfirmedAt,
      }));

    return NextResponse.json({
      users: enrichedUsers,
      orphans,
      counts: { profiled: enrichedUsers.length, orphaned: orphans.length },
    });
  } catch (error) {
    return jsonError(500, 'Could not load users', error);
  }
}

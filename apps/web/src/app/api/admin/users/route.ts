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
async function lastSignInByUser(supabase: any): Promise<Map<string, string | null>> {
  const seen = new Map<string, string | null>();
  const perPage = 1000;

  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      logger.warn('admin/users: last_sign_in lookup failed (non-fatal)', { error: error.message });
      return seen;
    }
    const batch = data?.users ?? [];
    for (const u of batch) seen.set(u.id, u.last_sign_in_at ?? null);
    // A short page means this was the last one. The guard is a safety net for
    // a provider that keeps returning full pages.
    if (batch.length < perPage || page >= 20) break;
  }

  return seen;
}

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    // Fetch all profiles. The sign-in lookup is a separate round trip to a
    // different API, so run it alongside rather than after.
    const [{ data: profiles, error }, lastSignIn] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, role, email, name, phone, location, created_at, updated_at')
        .order('created_at', { ascending: false }),
      lastSignInByUser(supabase),
    ]);

    if (error) throw error;

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

    return NextResponse.json({ users: enrichedUsers });
  } catch (error) {
    return jsonError(500, 'Could not load users', error);
  }
}

import { createServerClient } from '@/lib/supabase/server';

/**
 * The display card for a set of businesses: name, logo, profile slug.
 *
 * Why this exists: `authenticated` holds column-level SELECT on
 * `business_profiles` for only (user_id, company_name, industry,
 * approval_status) — migration 053. Asking the CALLER's client for `username`
 * or `logo_url` does not return nulls, it fails the entire query with 42501,
 * and code that ignores `error` then renders blank names. That is how "who
 * viewed your profile" showed every viewer anonymously and a brand's Home card
 * came back empty.
 *
 * The service-role read is deliberately narrow — three display columns, never
 * GST, address, contact or budget — and CALLERS MUST ONLY PASS IDS THE USER
 * ALREADY HAS A RELATIONSHIP WITH (a row they could read under RLS, or a
 * verified conversation partner). The slug is safe to hand out on those terms:
 * /b/<username> enforces its own relationship gate (get_business_eligibility).
 */
export interface BusinessCard {
  userId: string;
  companyName: string | null;
  username: string | null;
  logoUrl: string | null;
}

export async function businessCards(ids: string[]): Promise<Map<string, BusinessCard>> {
  const out = new Map<string, BusinessCard>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return out;

  const { data, error } = await createServerClient()
    .from('business_profiles')
    .select('user_id, company_name, username, logo_url')
    .in('user_id', unique);
  if (error || !data) return out;

  for (const row of data as {
    user_id: string;
    company_name: string | null;
    username: string | null;
    logo_url: string | null;
  }[]) {
    out.set(row.user_id, {
      userId: row.user_id,
      companyName: row.company_name,
      username: row.username,
      logoUrl: row.logo_url,
    });
  }
  return out;
}

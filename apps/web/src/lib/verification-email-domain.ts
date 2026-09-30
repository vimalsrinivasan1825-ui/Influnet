/**
 * Business email-domain verification: the business proves control of an inbox,
 * and the score rewards it only when that inbox sits on their own company
 * domain. Personal addresses (gmail etc.) can be verified too — they just do
 * not earn the bonus. Only ONE email needs verifying.
 */
import { randomInt } from 'node:crypto';
import { privileged } from '@/lib/service-client';
import { VERIFICATION_NOTIFICATION, decide, type VerificationSignals } from '@/lib/verification';
import { emailDomainMatch } from '@/lib/verification-scraper';

type Db = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export const EMAIL_CODE_TTL_SECONDS = 15 * 60;

export function generateEmailCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Re-decide after the inbox is confirmed, from the last run's stored signals
 * plus a fresh domain match — no new scrape. Returns null when there is no
 * prior check (the caller's pipeline run will populate it).
 */
export async function rescoreAfterEmailDomain(
  db: Db,
  opts: { userId: string; companyName?: string | null; website?: string | null; email: string },
): Promise<{ status: string; score: number } | null> {
  try {
    const { data: latest } = await db
      .from('verification_checks')
      .select('ai_signals')
      .eq('user_id', opts.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const signals = (latest as { ai_signals?: VerificationSignals } | null)?.ai_signals;
    if (!signals || Object.keys(signals).length === 0) return null;

    const match = emailDomainMatch({ companyName: opts.companyName, website: opts.website, email: opts.email });
    const updated: VerificationSignals = {
      ...signals,
      email_domain_verified: true,
      email_domain_matches_company: match.matches,
      uses_personal_email: match.personal,
    };
    const decision = decide('business_owner', updated);
    const notif = VERIFICATION_NOTIFICATION[decision.status];

    await (privileged(db) as Db).rpc('submit_verification', {
      p_user_id: opts.userId,
      p_signals: updated,
      p_score: decision.score,
      p_reason: `${decision.reason} — re-scored after business email was verified.`,
      p_status: decision.status,
      p_notif_type: notif.type,
      p_notif_title: notif.title,
      p_notif_body: notif.body,
    });
    return { status: decision.status, score: decision.score };
  } catch {
    return null;
  }
}

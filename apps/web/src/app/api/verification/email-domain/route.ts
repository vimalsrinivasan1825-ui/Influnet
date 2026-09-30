import { NextResponse } from 'next/server';
import { privileged } from '@/lib/service-client';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isValidEmail } from '@/lib/email/client';
import { deliverEmail } from '@/lib/email/policy';
import { profileNames, nameOf } from '@/lib/email/context';
import { emailDomainMatch } from '@/lib/verification-scraper';
import { EMAIL_CODE_TTL_SECONDS, generateEmailCode, rescoreAfterEmailDomain } from '@/lib/verification-email-domain';

// Business-only. Reads/writes business_profiles through the caller's own client
// (own-row RLS) and get_own_business_profile() for columns the SELECT grant
// hides; the confirm RPC is service-role only.

function domainOfWebsite(website: unknown): string | null {
  if (typeof website !== 'string' || !website.trim()) return null;
  try {
    const raw = website.trim();
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

async function loadBusiness(supabase: any) {
  const { data } = await supabase.rpc('get_own_business_profile');
  return (data as Record<string, any> | null) ?? {};
}

function describe(biz: Record<string, any>, accountEmail: string | null) {
  const email: string | null = biz.verification_email ?? null;
  const match = emailDomainMatch({ companyName: biz.company_name, website: biz.website, email });
  return {
    verification_email: email,
    account_email: accountEmail,
    email_verified: !!biz.email_verified && !!email,
    email_verified_at: biz.email_verified_at ?? null,
    domain: match.domain,
    is_personal_email: match.personal,
    matches_company: match.matches,
    match_basis: match.basis,
    // The company's own domain if we know it — lets the UI suggest
    // "you@<domain>" instead of leaving the business to guess what qualifies.
    suggested_domain: domainOfWebsite(biz.website),
  };
}

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    if (auth.role !== 'business_owner') return jsonError(403, 'Only business accounts can verify a business email');
    const biz = await loadBusiness(auth.supabase);
    return NextResponse.json(describe(biz, auth.user.email ?? null));
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;
    if (auth.role !== 'business_owner') return jsonError(403, 'Only business accounts can verify a business email');

    const limited = await enforceRateLimit(req, { bucket: 'verification:email-domain', limit: 8, windowMs: 60_000, key: user.id });
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) return jsonError(400, 'Enter a valid email address');

    const biz = await loadBusiness(supabase);

    if (action === 'initiate') {
      // Saving the address resets any earlier verification: proof of one inbox
      // says nothing about another.
      if ((biz.verification_email ?? null) !== email) {
        const { error: upErr } = await supabase
          .from('business_profiles')
          .update({ verification_email: email, email_verified: false, email_verified_at: null, email_verified_domain: null })
          .eq('user_id', user.id);
        if (upErr) return jsonError(500, 'Could not save that email', upErr);
      }

      const code = generateEmailCode();
      const { error } = await supabase.rpc('initiate_email_domain_claim', {
        p_email: email,
        p_code: code,
        p_ttl_seconds: EMAIL_CODE_TTL_SECONDS,
      });
      if (error) return jsonError(500, 'Could not start verification', error);

      const names = await profileNames([user.id]);
      const sent = await deliverEmail({
        userId: user.id,
        templateId: 'business_email_code',
        // Verifying an address other than the login one is the point, so send
        // to the address being verified.
        toOverride: email,
        dedupeKey: `bizemail:${user.id}:${email}:${code}`,
        data: {
          name: nameOf(names, user.id),
          companyName: biz.company_name ?? '',
          email,
          code,
          expiresInMinutes: Math.round(EMAIL_CODE_TTL_SECONDS / 60),
        },
      });
      if (!sent.sent) {
        return jsonError(503, 'We could not send the code right now. Please try again in a moment.');
      }
      return NextResponse.json({ sent: true, expires_in: EMAIL_CODE_TTL_SECONDS, ...describe({ ...biz, verification_email: email, email_verified: false }, user.email ?? null) });
    }

    if (action === 'confirm') {
      const code = String(body?.code ?? '').trim();
      if (!/^\d{6}$/.test(code)) return jsonError(400, 'Enter the 6-digit code');

      const { data, error } = await (privileged(supabase) as typeof supabase).rpc('confirm_email_domain_claim', {
        p_user_id: user.id,
        p_email: email,
        p_code: code,
      });
      if (error) {
        const msg = String((error as any).message || '');
        if (/too many/i.test(msg)) return jsonError(429, 'Too many attempts — request a new code');
        if (/no pending|expired/i.test(msg)) return jsonError(400, 'This code has expired — request a new one');
        return jsonError(500, 'Could not verify the code', error);
      }
      if (!(data as { matched?: boolean } | null)?.matched) {
        return NextResponse.json({ verified: false, message: 'That code is not right. Check the email and try again.' });
      }

      const rescored = await rescoreAfterEmailDomain(supabase as any, {
        userId: user.id,
        companyName: biz.company_name,
        website: biz.website,
        email,
      });
      const fresh = await loadBusiness(supabase);
      return NextResponse.json({ verified: true, verification: rescored, ...describe(fresh, user.email ?? null) });
    }

    return jsonError(400, "Unknown action — use 'initiate' or 'confirm'");
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

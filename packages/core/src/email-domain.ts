/**
 * Business email vs company domain — shared by web (server scoring + signup
 * hint) and mobile (signup hint), so the wording the user sees and the score
 * the server awards can never disagree about what "matches" means.
 */

function domainOf(website: string): string | null {
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Free / personal mail providers. A business on one of these has no company
// domain to prove, so "no match" is structural, not suspicious — this list is
// what lets the UI say "personal email" instead of an unexplained miss.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'yahoo.co.uk',
  'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.in', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me',
  'zoho.com', 'zohomail.com', 'rediffmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'rocketmail.com',
]);

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

export function emailDomainOf(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return null;
  const domain = value.slice(at + 1);
  return domain.includes('.') ? domain : null;
}

export interface EmailDomainMatch {
  domain: string | null;
  /** Domain is a free/personal mail provider. */
  personal: boolean;
  /** Domain lines up with the business's own domain. Never true when personal. */
  matches: boolean;
  /** What the match was made against, for UI copy. */
  basis: 'website' | 'company_name' | null;
}

/**
 * Does this email sit on the business's own domain?
 *
 * Two sources, in order of trust:
 *   1. website on file — its domain IS the company's domain; the email domain
 *      must equal it or be a subdomain of it.
 *   2. no website — fall back to the company name: the first word (slugified)
 *      must appear in the email domain. Same structural proxy as
 *      website_mentions_name; it is a string comparison, not proof of domain
 *      ownership. A live WHOIS/DNS/registry check is deliberately not built yet.
 */
export function emailDomainMatch(input: {
  companyName?: string | null;
  website?: string | null;
  email?: string | null;
}): EmailDomainMatch {
  const domain = emailDomainOf(input.email);
  if (!domain) return { domain: null, personal: false, matches: false, basis: null };
  if (isPersonalEmailDomain(domain)) return { domain, personal: true, matches: false, basis: null };

  const site = input.website?.trim() ? domainOf(input.website.trim()) : null;
  if (site) {
    const s = site.toLowerCase();
    return { domain, personal: false, matches: domain === s || domain.endsWith(`.${s}`), basis: 'website' };
  }

  const first = (input.companyName ?? '').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  if (first.length >= 3) {
    return {
      domain,
      personal: false,
      matches: domain.replace(/[^a-z0-9]/g, '').includes(first),
      basis: 'company_name',
    };
  }
  return { domain, personal: false, matches: false, basis: null };
}

export interface BusinessEmailHint {
  /** 'good' = earns score, 'warn' = personal address, 'info' = company-looking but not matched. */
  tone: 'good' | 'warn' | 'info';
  text: string;
}

/**
 * What to tell someone typing their business email at signup. null until the
 * address is complete enough to judge. Never blocks — a personal address is a
 * legitimate choice (plenty of small businesses have no domain), it just earns
 * less verification score.
 */
export function businessEmailHint(input: {
  companyName?: string | null;
  website?: string | null;
  email?: string | null;
}): BusinessEmailHint | null {
  const m = emailDomainMatch(input);
  if (!m.domain) return null;
  if (m.personal) {
    return {
      tone: 'warn',
      text: 'Personal email. You can still sign up, but it lowers your verification score. A company email (you@yourcompany.com) scores highest.',
    };
  }
  if (m.matches) {
    return { tone: 'good', text: 'Matches your company. Verifying this email raises your verification score.' };
  }
  return {
    tone: 'info',
    text: "We couldn't match this to your company name or website. An email on your company's own domain scores highest.",
  };
}

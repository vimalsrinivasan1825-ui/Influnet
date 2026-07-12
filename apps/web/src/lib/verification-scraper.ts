// Signal builder for verification.
//
// IMPORTANT: real scraping of social platforms / business registries has ToS and
// PII implications (see the audit doc, §3). It must only run against
// USER-SUBMITTED public URLs/handles, respect target ToS/robots, and store
// derived SIGNALS — never raw page dumps. Prefer official APIs / oEmbed.
//
// Until a compliant fetcher + credentials are wired, `buildSignals` derives
// signals deterministically from the data the user already gave us (structural
// validity + presence). This is honest: it verifies the submission is
// well-formed and self-consistent, and gives the scorer something real to work
// with, without performing any network scraping. Swap `buildSignals` for a
// compliant implementation behind the same interface.

import type { Role, VerificationSignals } from './verification';

export interface BusinessProfileInput {
  company_name?: string | null;
  website?: string | null;
  gst_number?: string | null;
  instagram_handle?: string | null;
  linkedin_handle?: string | null;
  phone?: string | null;
}

export interface CreatorProfileInput {
  bio?: string | null;
  niche?: unknown; // jsonb array
  instagram_handle?: string | null;
  youtube_handle?: string | null;
  twitter_handle?: string | null;
  phone?: string | null;
}

const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i;
// Indian GSTIN: 2-digit state + 10-char PAN + entity + Z + checksum
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const HANDLE_RE = /^@?[A-Za-z0-9._]{2,30}$/;

function domainOf(website: string): string | null {
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function buildBusinessSignals(p: BusinessProfileInput): VerificationSignals {
  const flags: string[] = [];
  const website = (p.website ?? '').trim();
  const websiteValid = !!website && URL_RE.test(website.startsWith('http') ? website : `https://${website}`);
  const domain = website ? domainOf(website) : null;
  const nameOk = !!p.company_name && p.company_name.trim().length >= 2;
  const gstValid = !!p.gst_number && GSTIN_RE.test(p.gst_number.trim().toUpperCase());
  const contactable = !!(p.phone || p.linkedin_handle || p.instagram_handle);

  if (website && !websiteValid) flags.push('website_malformed');
  if (p.gst_number && !gstValid) flags.push('gst_format_invalid');
  if (!website && !p.gst_number) flags.push('no_business_evidence');

  return {
    website_resolves: websiteValid,
    // Structural proxy for "the domain relates to the company": the registrable
    // domain contains a slug of the company name. A real fetch would confirm.
    website_mentions_name:
      websiteValid && nameOk && !!domain &&
      domain.toLowerCase().includes(p.company_name!.trim().toLowerCase().split(/\s+/)[0]),
    gst_format_valid: gstValid,
    has_contactable_channel: contactable,
    flags,
  };
}

export function buildCreatorSignals(p: CreatorProfileInput): VerificationSignals {
  const flags: string[] = [];
  const handles: Record<string, string | null | undefined> = {
    instagram: p.instagram_handle,
    youtube: p.youtube_handle,
    twitter: p.twitter_handle,
  };
  const live: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(handles)) {
    if (v && v.trim()) {
      const ok = HANDLE_RE.test(v.trim());
      live[k] = ok;
      if (!ok) flags.push(`${k}_handle_malformed`);
    }
  }
  const liveCount = Object.values(live).filter(Boolean).length;
  if (liveCount === 0) flags.push('no_social_handles');

  const niche = Array.isArray(p.niche) ? p.niche : [];
  const bio = (p.bio ?? '').toLowerCase();
  const bioMatchesNiche = niche.length > 0 && niche.some((n) => typeof n === 'string' && bio.includes(n.toLowerCase()));

  return {
    social_handles_live: live,
    bio_matches_niche: bioMatchesNiche,
    has_contactable_channel: !!p.phone || liveCount > 0,
    flags,
  };
}

export function buildSignals(
  role: Role,
  input: BusinessProfileInput | CreatorProfileInput,
): VerificationSignals {
  return role === 'business_owner'
    ? buildBusinessSignals(input as BusinessProfileInput)
    : buildCreatorSignals(input as CreatorProfileInput);
}

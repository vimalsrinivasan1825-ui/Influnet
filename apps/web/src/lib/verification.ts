// Verification scoring & decision logic — the trust-badge brain.
// PURE and deterministic so it can be unit-tested and reasoned about. The
// scraper (verification-scraper.ts) produces `signals`; this module turns them
// into a confidence score and a decision. Swap `scoreWithAI` for a real Claude
// call later — the thresholds and the "never auto-reject" rule stay here.

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'needs_more_info';

export type Role = 'business_owner' | 'influencer';

// Structured evidence gathered about a user. Everything optional so a partial
// scrape still scores.
export interface VerificationSignals {
  // business
  website_resolves?: boolean;
  website_mentions_name?: boolean;
  gst_format_valid?: boolean;
  domain_age_days?: number;
  // creator
  social_handles_live?: Record<string, boolean>;
  follower_count?: number;
  last_post_days_ago?: number;
  bio_matches_niche?: boolean;
  // shared
  platform_verified?: boolean; // the platform itself (e.g. Instagram) already verifies this account
  ownership_verified?: boolean; // the user PROVED control of the handle (bio-code handshake / OAuth)
  has_contactable_channel?: boolean;
  flags?: string[]; // e.g. ['gst_not_found', 'all_handles_dead', 'instagram_not_found']
  // Audit-only: what the live data provider actually returned. Never scored;
  // surfaced to admins in the escalation queue for a human sanity-check.
  live?: {
    provider: string; // 'hikerapi' | 'none'
    status: 'ok' | 'not_found' | 'unavailable' | 'skipped';
    instagram?: {
      handle: string;
      found: boolean;
      follower_count: number | null;
      is_verified: boolean;
      is_private: boolean;
      last_post_days_ago: number | null;
      error?: string;
    };
  };
}

export interface VerificationDecision {
  score: number; // 0..1
  status: Extract<VerificationStatus, 'verified' | 'in_review' | 'needs_more_info'>;
  reason: string;
  decided_by: 'ai';
}

// Thresholds — deliberately conservative to start; tune with real data.
export const AUTO_APPROVE_THRESHOLD = 0.85;
export const ESCALATE_THRESHOLD = 0.5;

// Hard fraud signals never auto-approve and never auto-reject — they escalate.
function hasFraudFlag(signals: VerificationSignals): boolean {
  const flags = signals.flags ?? [];
  // A claimed handle that doesn't resolve, or a wildly inflated follower claim,
  // is suspicious: never auto-approve, never auto-reject — send it to a human.
  return flags.some((f) => /fraud|impersonat|all_handles_dead|domain_not_found|handle_not_found|_inflated/.test(f));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// --- Heuristic scorers (default when no live AI call is configured) ----------

export function scoreBusinessSignals(s: VerificationSignals): number {
  let score = 0;
  if (s.website_resolves) score += 0.35;
  if (s.website_mentions_name) score += 0.25;
  if (s.gst_format_valid) score += 0.2;
  if ((s.domain_age_days ?? 0) >= 180) score += 0.1;
  if (s.has_contactable_channel) score += 0.1;
  // A platform-verified (Instagram blue-check) business account is strong proof.
  if (s.platform_verified) score += 0.2;
  return clamp01(score);
}

export function scoreCreatorSignals(s: VerificationSignals): number {
  let score = 0;
  const live = s.social_handles_live ?? {};
  const liveCount = Object.values(live).filter(Boolean).length;
  if (liveCount >= 1) score += 0.35;
  if (liveCount >= 2) score += 0.15;
  if ((s.follower_count ?? 0) >= 1000) score += 0.15;
  if ((s.last_post_days_ago ?? Infinity) <= 30) score += 0.2;
  if (s.bio_matches_niche) score += 0.15;
  // Instagram's own blue-check is the single strongest creator trust signal.
  if (s.platform_verified) score += 0.35;
  return clamp01(score);
}

export function scoreSignals(role: Role, signals: VerificationSignals): number {
  return role === 'business_owner'
    ? scoreBusinessSignals(signals)
    : scoreCreatorSignals(signals);
}

/**
 * The one checklist item whose truth lives outside the stored signals — see
 * hasVerifiedInstagramClaim(). Exported so the override has something stable to
 * match on.
 */
export const OWNERSHIP_KEY = 'ownership';

export interface ScoreBreakdownItem {
  /**
   * Stable identifier, safe to branch on. Labels are user-facing copy and get
   * rewritten; callers that need to find a specific item (the ownership
   * override in GET /api/verification) must not match on prose.
   */
  key: string;
  label: string;
  met: boolean;
  /** How many of the 1.0 total this item is worth when met — for the UI's "why" list, not re-scored client-side. */
  weight: number;
}

/**
 * Same criteria scoreCreatorSignals/scoreBusinessSignals check, as a list a
 * user can actually act on. The score alone ("62%") doesn't tell someone
 * what to go fix; this does. Mirrors the two scorers above item for item —
 * keep them in sync if the weights change.
 */
export function scoreBreakdown(role: Role, s: VerificationSignals): ScoreBreakdownItem[] {
  if (role === 'business_owner') {
    return [
      { key: 'website_live', label: 'Website is reachable', met: !!s.website_resolves, weight: 0.35 },
      { key: 'website_name', label: 'Website mentions your company name', met: !!s.website_mentions_name, weight: 0.25 },
      { key: 'gst', label: 'GST number format is valid', met: !!s.gst_format_valid, weight: 0.2 },
      { key: 'domain_age', label: 'Website domain is at least 6 months old', met: (s.domain_age_days ?? 0) >= 180, weight: 0.1 },
      { key: 'contactable', label: 'A contactable channel is on file', met: !!s.has_contactable_channel, weight: 0.1 },
      { key: 'platform_badge', label: "Instagram's own verified badge", met: !!s.platform_verified, weight: 0.2 },
    ];
  }
  const live = s.social_handles_live ?? {};
  const liveCount = Object.values(live).filter(Boolean).length;
  return [
    { key: 'handle_live', label: 'Instagram handle confirmed live', met: liveCount >= 1, weight: 0.35 },
    { key: OWNERSHIP_KEY, label: 'Account ownership confirmed (bio link)', met: !!s.ownership_verified, weight: 0 },
    { key: 'followers', label: 'At least 1,000 followers', met: (s.follower_count ?? 0) >= 1000, weight: 0.15 },
    { key: 'recent_post', label: 'Posted within the last 30 days', met: (s.last_post_days_ago ?? Infinity) <= 30, weight: 0.2 },
    { key: 'niche_bio', label: 'Bio matches your selected niche', met: !!s.bio_matches_niche, weight: 0.15 },
    { key: 'platform_badge', label: "Instagram's own verified badge", met: !!s.platform_verified, weight: 0.35 },
  ];
}

// --- Decision --------------------------------------------------------------

// Map a confidence score (+ fraud flags) to an automated decision.
// INVARIANT: this never returns 'rejected'. Low-confidence, non-fraud cases ask
// for more info; anything suspicious or middling escalates to a human.
export function decide(role: Role, signals: VerificationSignals): VerificationDecision {
  const score = scoreSignals(role, signals);
  const fraud = hasFraudFlag(signals);

  if (fraud) {
    return {
      score,
      status: 'in_review',
      reason: `Escalated: suspicious signals (${(signals.flags ?? []).join(', ')}).`,
      decided_by: 'ai',
    };
  }
  if (score >= AUTO_APPROVE_THRESHOLD) {
    // ANTI-IMPERSONATION GATE (creators): high metrics alone are not enough.
    // A creator's Instagram is scraped by handle, so someone could type a famous
    // creator's handle and inherit their metrics. Auto-approval therefore requires
    // PROVEN ownership (bio-code handshake / OAuth); without it we escalate to a
    // human. Businesses verify via other evidence (website/GST/admin) and are not
    // gated here.
    if (role === 'influencer' && !signals.ownership_verified) {
      return {
        score,
        status: 'in_review',
        reason: 'Metrics look strong, but account ownership is not yet confirmed — pending review.',
        decided_by: 'ai',
      };
    }
    return { score, status: 'verified', reason: 'High-confidence auto-approval.', decided_by: 'ai' };
  }
  if (score >= ESCALATE_THRESHOLD) {
    return { score, status: 'in_review', reason: 'Medium confidence — needs human review.', decided_by: 'ai' };
  }
  return {
    score,
    status: 'needs_more_info',
    reason: 'Low confidence — additional or corrected details needed.',
    decided_by: 'ai',
  };
}

// Notification copy for each terminal/interim status (reuses migration 047 pipeline).
export const VERIFICATION_NOTIFICATION: Record<
  VerificationDecision['status'] | 'rejected',
  { type: string; title: string; body: string }
> = {
  verified: {
    type: 'verification_approved',
    title: "You're verified ✅",
    body: 'Your account passed verification. Your verified badge is now live.',
  },
  in_review: {
    type: 'verification_in_review',
    title: 'Verification under review',
    body: "We're reviewing your details. You can keep using everything in the meantime.",
  },
  needs_more_info: {
    type: 'verification_needs_info',
    title: 'Action needed to get verified',
    body: 'We need a bit more information to verify your account.',
  },
  rejected: {
    type: 'verification_rejected',
    title: 'Verification update',
    body: "We couldn't verify your account yet. Review your details and try again.",
  },
};

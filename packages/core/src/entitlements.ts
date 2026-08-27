/**
 * Plan vocabulary shared by web and mobile.
 *
 * This module carries NAMES and TYPES only — never numbers. The limits live in
 * the `billing_settings` table (migration 115) because the database enforces
 * them too, and two copies of a revenue-guarding number is one copy that
 * silently drifts. Anything here that looked like a limit would be a second
 * definition pretending to be the first.
 *
 * Sits beside profile-visibility.ts for the same reason that module exists:
 * so web and mobile can never disagree about what a gate means.
 */

/** The tiers. Deliberately two — a third is a pricing decision, not a code one. */
export const PLAN_TIERS = ['free', 'pro'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/**
 * Every capability the product can gate, named once.
 *
 * A feature key exists here only if the SERVER enforces it. If you find
 * yourself wanting a key so the UI can hide a button, the button is not the
 * gate — add the server check first and the key will follow.
 */
export const GATED_FEATURES = [
  /** Browse/filter discovery by niche, location, followers. Free gets handle lookup only. */
  'search.browse',
  /** Audience demographics, engagement rate, reach history on someone else's profile. */
  'profile.audience',
  /** Export a creator's media kit. */
  'profile.mediakit',
  /** Analytics beyond the free window. */
  'analytics.full',
  /** Create another active project (quota-metered). */
  'projects.create',
  /** Send another collab request this month (quota-metered). */
  'requests.send',
  /** Publish a campaign (quota-metered). */
  'campaigns.publish',
  /** Apply to a campaign (quota-metered). */
  'campaigns.apply',
] as const;
export type GatedFeature = (typeof GATED_FEATURES)[number];

/**
 * What the server tells a client about itself. Mirrors `get_entitlements()`.
 *
 * `limits` values may be `null`, which means "no ceiling" — that is how Pro is
 * expressed, and how a limit is switched off without a code change.
 */
export interface Entitlements {
  tier: PlanTier;
  /** Razorpay's own status string, passed through unmapped. */
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelAtPeriodEnd: boolean;
  limits: {
    activeProjects: number | null;
    /** NULL on Free too as of migration 117 — requests are never capped. */
    requestsPerMonth: number | null;
    /** Lifetime cap on requests converted into a project. Never resets. */
    projectConversions: number | null;
    shortlistSize: number | null;
    analyticsDays: number | null;
    liveCampaigns: number | null;
    applicationsPerWeek: number | null;
  };
  /**
   * The FREE tier's ceilings, regardless of who is asking.
   *
   * `limits` is the CALLER's, so for a Pro subscriber every value there is
   * null. Anything that describes what the free plan offers — a comparison
   * table, marketing copy — must read this instead, or it will tell paying
   * users that Free is unlimited.
   */
  freeLimits: {
    activeProjects: number | null;
    requestsPerMonth: number | null;
    projectConversions: number | null;
    shortlistSize: number | null;
    analyticsDays: number | null;
    liveCampaigns: number | null;
    applicationsPerWeek: number | null;
  };
  usage: {
    activeProjects: number;
    requestsThisMonth: number;
    /** Total projects ever converted from a request — counts toward projectConversions. */
    projectConversions: number;
    /** How many campaigns this brand has LIVE right now — a standing count, not a running total. */
    liveCampaigns: number;
    /** Applications this creator has submitted since the start of the current week. */
    applicationsThisWeek: number;
  };
  price: {
    paise: number;
    currency: string;
  };
  /**
   * Whether the paid product exists at all in this environment
   * (SUBSCRIPTIONS_ENABLED). When false every gate is open and the UI must not
   * show pricing, upgrade prompts, or Pro badges — the feature is absent, not
   * merely unpurchased.
   */
  subscriptionsEnabled: boolean;
}

/** Which features a tier holds. The only place this mapping is written down. */
const FEATURES_BY_TIER: Record<PlanTier, ReadonlySet<GatedFeature>> = {
  free: new Set<GatedFeature>([
    // Quota-metered rather than forbidden: a Free user may create projects and
    // send requests, up to a ceiling. `hasFeature` says yes; the quota check
    // is what refuses at the boundary.
    'projects.create',
    'requests.send',
    'campaigns.publish',
    'campaigns.apply',
  ]),
  pro: new Set<GatedFeature>(GATED_FEATURES),
};

/**
 * Does this tier hold this feature?
 *
 * Safe to call on the client for rendering, and NEVER sufficient on its own —
 * the server answers the same question independently before doing anything.
 * A client that lies here changes what a button looks like, not what happens.
 */
export function hasFeature(tier: PlanTier, feature: GatedFeature): boolean {
  return FEATURES_BY_TIER[tier]?.has(feature) ?? false;
}

/** Quota-metered features need a limit check as well as a feature check. */
export function isMetered(feature: GatedFeature): boolean {
  return (
    feature === 'projects.create' ||
    feature === 'requests.send' ||
    feature === 'campaigns.publish' ||
    feature === 'campaigns.apply'
  );
}

/**
 * Formats paise as rupees for display. Money is carried in paise everywhere
 * (it is Razorpay's unit and an integer), so this is the single place it
 * becomes a string, and no float ever touches an amount.
 */
export function formatPrice(paise: number, currency = 'INR'): string {
  const major = paise / 100;
  const hasPaise = paise % 100 !== 0;
  const formatted = major.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return currency === 'INR' ? `₹${formatted}` : `${formatted} ${currency}`;
}

/**
 * Is a limit exceeded? `null` means unlimited, which is how Pro is expressed.
 * Written out rather than inlined because `used >= limit` with a nullable
 * limit is exactly the comparison people get backwards.
 */
export function isOverLimit(used: number, limit: number | null): boolean {
  if (limit === null || limit === undefined) return false;
  return used >= limit;
}

/** Copy for the paywall, kept next to the keys so the two cannot drift apart. */
export const FEATURE_LABELS: Record<GatedFeature, string> = {
  'search.browse': 'Browse and filter creators',
  'profile.audience': 'Audience and engagement data',
  'profile.mediakit': 'Media kit export',
  'analytics.full': 'Full analytics history',
  'projects.create': 'Active projects',
  'requests.send': 'Collaboration requests',
  'campaigns.publish': 'Publish campaigns',
  'campaigns.apply': 'Apply to campaigns',
};

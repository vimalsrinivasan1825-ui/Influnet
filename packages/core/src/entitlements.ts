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
  /** Generate a tax invoice / proforma (quota-metered, per month). */
  'invoices.generate',
  /** Send a collaboration request to another creator (quota-metered, per month). */
  'requests.peer',
  /** Connect more than one account on the same social platform. Pro only. */
  'social.multiaccount',
  /** See the full, identified list of who viewed your profile. Free sees a few. */
  'profile.viewers',
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
    /** Manual portfolio items. The one ceiling where Pro is a bigger number, not null. */
    portfolioItems: number | null;
    /** Conversations that can be pinned to the top of the inbox. */
    pinnedChats: number | null;
    /** Most-recent profile viewers shown identified; the rest are a count. */
    profileViewers: number | null;
    /** Distinct businesses whose contact card can be revealed, lifetime. */
    contactReveals: number | null;
    /** Accounts connectable on a single social platform. */
    connectedAccountsPerPlatform: number | null;
    /** Tax invoices / proformas generated per month. */
    invoicesPerMonth: number | null;
    /** Creator→creator collaboration requests sent per month. */
    peerRequestsPerMonth: number | null;
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
    portfolioItems: number | null;
    pinnedChats: number | null;
    profileViewers: number | null;
    contactReveals: number | null;
    connectedAccountsPerPlatform: number | null;
    invoicesPerMonth: number | null;
    peerRequestsPerMonth: number | null;
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
    /** Manual portfolio items this creator has added. */
    portfolioItems: number;
    /** Conversations this user currently has pinned. */
    pinnedChats: number;
    /** Distinct businesses that have viewed this creator's profile, all-time. */
    profileViewers: number;
    /** Distinct businesses whose contact card this creator has revealed, lifetime. */
    contactReveals: number;
    /** Invoices/proformas this user has generated in the current month. */
    invoicesThisMonth: number;
    /** Peer collaboration requests this creator has sent in the current month. */
    peerRequestsThisMonth: number;
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
    'invoices.generate',
    'requests.peer',
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
    feature === 'campaigns.apply' ||
    feature === 'invoices.generate' ||
    feature === 'requests.peer'
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
  'invoices.generate': 'Invoice generation',
  'requests.peer': 'Requests to other creators',
  'social.multiaccount': 'Multiple accounts per platform',
  'profile.viewers': 'Full profile-viewer list',
};

/**
 * Server-side entitlement resolution and enforcement.
 *
 * Usage mirrors the rate limiter, deliberately — one call at the top of a
 * handler that either returns a ready-made response or `null`:
 *
 *   const blocked = await requireFeature(auth, 'search.browse');
 *   if (blocked) return blocked;
 *
 * ── The master switch ─────────────────────────────────────────────────────
 * `SUBSCRIPTIONS_ENABLED` decides whether the paid product exists in this
 * environment at all. When it is not `true`, `resolveEntitlements()` returns a
 * synthetic unlimited Pro entitlement for everybody. That is the whole
 * mechanism: every gate below runs the same code path either way, and there is
 * no `if (flagOff) skip` sprinkled through the routes for someone to forget.
 *
 * It is a SERVER variable with no NEXT_PUBLIC_ prefix, on purpose. A
 * NEXT_PUBLIC_ value is inlined into the bundle at build time — including the
 * copy the server reads — so flipping it in a dashboard would change nothing
 * until the next build. The browser learns the flag from
 * GET /api/billing/entitlements at runtime instead.
 *
 * ── Fail CLOSED ───────────────────────────────────────────────────────────
 * lib/rate-limit.ts fails OPEN and says why: a limiter is an abuse guard, not
 * an auth control. This is the opposite. If the subscription store cannot be
 * read, the caller is treated as FREE.
 *
 * That trade is deliberate. A paying brand briefly losing Pro views is a
 * support ticket; a free account silently gaining them is an unbounded revenue
 * leak nobody would ever notice. The 60-second cache below is what keeps the
 * trade cheap — a blip does not downgrade anyone, and a real cancellation
 * still takes effect within a minute.
 */
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasFeature,
  isOverLimit,
  type Entitlements,
  type GatedFeature,
  type PlanTier,
} from '@influnet/core';
import { jsonError } from './api';
import { logger } from './logger';
import { flag } from './feature-flags';

/**
 * Is the paid product live in this environment?
 *
 * Defaults to OFF, the same way the phone-OTP and ownership gates do: turning
 * a restriction on must be a deliberate act, because switching it on instantly
 * changes what every existing user can do.
 *
 * Resolved from the `feature_flags` table (migration 137), falling back to the
 * `SUBSCRIPTIONS_ENABLED` env var. Still server-only and still not NEXT_PUBLIC_
 * — the browser learns it from GET /api/billing/entitlements as before.
 */
export function subscriptionsEnabled(): boolean {
  return flag('subscriptions');
}

/**
 * What everyone gets when the feature is switched off: unlimited Pro.
 *
 * `subscriptionsEnabled: false` is the signal the client uses to hide pricing,
 * upgrade prompts, and the Pro badge entirely — when the product does not
 * exist, nobody should see a locked door, let alone an unlocked one they can
 * boast about.
 */
function unlimitedEntitlements(): Entitlements {
  const noLimits: Entitlements['limits'] = {
    activeProjects: null,
    requestsPerMonth: null,
    projectConversions: null,
    shortlistSize: null,
    analyticsDays: null,
    liveCampaigns: null,
    applicationsPerWeek: null,
    portfolioItems: null,
    pinnedChats: null,
    profileViewers: null,
    contactReveals: null,
    connectedAccountsPerPlatform: null,
    invoicesPerMonth: null,
    peerRequestsPerMonth: null,
  };
  return {
    tier: 'pro',
    status: 'not_applicable',
    currentPeriodEnd: null,
    graceUntil: null,
    cancelAtPeriodEnd: false,
    limits: { ...noLimits },
    freeLimits: { ...noLimits },
    usage: {
      activeProjects: 0,
      requestsThisMonth: 0,
      projectConversions: 0,
      liveCampaigns: 0,
      applicationsThisWeek: 0,
      portfolioItems: 0,
      pinnedChats: 0,
      profileViewers: 0,
      contactReveals: 0,
      invoicesThisMonth: 0,
      peerRequestsThisMonth: 0,
    },
    price: { paise: 0, currency: 'INR' },
    subscriptionsEnabled: false,
  };
}

/** The safe answer when we genuinely cannot tell. Free, with real limits unknown. */
function freeFallback(): Entitlements {
  return {
    tier: 'free',
    status: 'unknown',
    currentPeriodEnd: null,
    graceUntil: null,
    cancelAtPeriodEnd: false,
    // Deliberately null rather than 0: a 0 would render "0 of 0 projects used"
    // in the UI, which is a lie. Null means "we could not read the ceiling",
    // and the tier alone is enough to close every non-metered gate.
    limits: {
      activeProjects: null,
      requestsPerMonth: null,
      projectConversions: null,
      shortlistSize: null,
      analyticsDays: null,
      liveCampaigns: null,
      applicationsPerWeek: null,
      portfolioItems: null,
      pinnedChats: null,
      profileViewers: null,
      contactReveals: null,
      connectedAccountsPerPlatform: null,
      invoicesPerMonth: null,
      peerRequestsPerMonth: null,
    },
    freeLimits: {
      activeProjects: null,
      requestsPerMonth: null,
      projectConversions: null,
      shortlistSize: null,
      analyticsDays: null,
      liveCampaigns: null,
      applicationsPerWeek: null,
      portfolioItems: null,
      pinnedChats: null,
      profileViewers: null,
      contactReveals: null,
      connectedAccountsPerPlatform: null,
      invoicesPerMonth: null,
      peerRequestsPerMonth: null,
    },
    usage: {
      activeProjects: 0,
      requestsThisMonth: 0,
      projectConversions: 0,
      liveCampaigns: 0,
      applicationsThisWeek: 0,
      portfolioItems: 0,
      pinnedChats: 0,
      profileViewers: 0,
      contactReveals: 0,
      invoicesThisMonth: 0,
      peerRequestsThisMonth: 0,
    },
    price: { paise: 0, currency: 'INR' },
    subscriptionsEnabled: true,
  };
}

// ── Cache ────────────────────────────────────────────────────────────────────
// Per-user, 60 seconds, in-process. Short enough that a cancellation lands
// within a minute; long enough that a momentary database blip does not
// downgrade a paying customer mid-session.
//
// In-process means each serverless instance holds its own copy, so the real
// worst case is 60s of staleness per instance. That is acceptable for both
// directions: an upgrade is invalidated explicitly by the webhook (see
// `invalidateEntitlements`), and a downgrade arriving up to a minute late is
// not a security boundary anyone can steer.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: Entitlements; expiresAt: number }>();

/** Drops a user's cached entitlement. Called by the billing webhook on any change. */
export function invalidateEntitlements(userId: string): void {
  cache.delete(userId);
}

/**
 * Resolves the caller's entitlements. Never throws.
 *
 * Takes the CALLER's Supabase client, not a service-role one: `get_entitlements()`
 * reads `auth.uid()` and reports on the caller alone, so there is no argument
 * that could be pointed at somebody else's subscription.
 */
export async function resolveEntitlements(
  supabase: SupabaseClient,
  userId: string,
): Promise<Entitlements> {
  if (!subscriptionsEnabled()) return unlimitedEntitlements();

  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const { data, error } = await (supabase.rpc as any)('get_entitlements');
    if (error || !data) {
      // Loud on purpose. A persistent failure here means paying customers are
      // being silently downgraded, and the only symptom is confused support
      // tickets — this log is the thing that turns that into a known incident.
      logger.error('entitlement lookup failed — treating caller as free', {
        userId,
        err: error,
      });
      return freeFallback();
    }

    const value: Entitlements = { ...(data as Entitlements), subscriptionsEnabled: true };
    cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });

    // Opportunistic prune; the map is otherwise unbounded on a long-lived instance.
    if (cache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
    }

    return value;
  } catch (err) {
    logger.error('entitlement lookup threw — treating caller as free', { userId, err });
    return freeFallback();
  }
}

// ── Enforcement ──────────────────────────────────────────────────────────────

export interface PaywallBody {
  error: string;
  /** Machine-readable so clients can render a precise prompt without parsing prose. */
  feature: GatedFeature;
  tier: PlanTier;
  limit: number | null;
  used: number | null;
  upgradeUrl: string;
}

/**
 * The refusal. 402 Payment Required rather than 403, so a client can tell
 * "you need to pay" apart from "you are not allowed" — they need different UI
 * and only one of them is worth interrupting someone for.
 */
export function paywall(
  feature: GatedFeature,
  ent: Entitlements,
  message: string,
  opts?: { limit?: number | null; used?: number | null },
): NextResponse {
  const body: PaywallBody = {
    error: message,
    feature,
    tier: ent.tier,
    limit: opts?.limit ?? null,
    used: opts?.used ?? null,
    upgradeUrl: '/dashboard/billing',
  };
  return NextResponse.json(body, { status: 402 });
}

type AuthCtx = { supabase: SupabaseClient; user: { id: string } };

/**
 * Gate a non-metered capability. Returns a 402 to return, or `null` to proceed.
 *
 * Note what this does NOT do: it does not tell the caller what the Pro version
 * of the data looks like. A gated read must return LESS data, not the same data
 * with a flag — see the redaction helpers used by the profile and search routes.
 */
export async function requireFeature(
  auth: AuthCtx,
  feature: GatedFeature,
  message?: string,
): Promise<NextResponse | null> {
  const ent = await resolveEntitlements(auth.supabase, auth.user.id);
  if (hasFeature(ent.tier, feature)) return null;
  return paywall(
    feature,
    ent,
    message ?? 'That is a Pro feature. Upgrade to unlock it.',
  );
}

/**
 * Gate a metered capability by CONSUMING a unit atomically.
 *
 * `consume_quota()` increments and checks in one statement, so two requests
 * arriving together cannot both pass at the boundary — the check-then-act race
 * that a `SELECT count(*)` followed by an `INSERT` walks straight into.
 *
 * Consuming means this must be called only once the action is definitely going
 * ahead. Call it after validation, immediately before the write.
 */
/**
 * The monthly metered features and where each reads its limit and current
 * usage from. Adding one is a line here — the mechanism (consume_quota, the
 * plan_usage row keyed by month) is identical for all of them.
 */
const MONTHLY_METERS = {
  requests_month: { feature: 'requests.send', limitKey: 'requestsPerMonth', usageKey: 'requestsThisMonth' },
  invoices_month: { feature: 'invoices.generate', limitKey: 'invoicesPerMonth', usageKey: 'invoicesThisMonth' },
  peer_requests_month: { feature: 'requests.peer', limitKey: 'peerRequestsPerMonth', usageKey: 'peerRequestsThisMonth' },
} as const;

type MonthlyMeter = keyof typeof MONTHLY_METERS;

export async function requireQuota(
  auth: AuthCtx,
  meter: MonthlyMeter,
  message: string,
): Promise<NextResponse | null> {
  const spec = MONTHLY_METERS[meter];
  const ent = await resolveEntitlements(auth.supabase, auth.user.id);
  if (ent.tier === 'pro') return null;

  const limit = ent.limits[spec.limitKey];
  if (limit === null || limit === undefined) return null; // no ceiling configured

  const { data, error } = await (auth.supabase.rpc as any)('consume_quota', {
    p_meter: meter,
    p_limit: limit,
  });

  if (error) {
    // Fail closed, consistent with resolveEntitlements. An unreadable counter
    // must not become a free pass.
    logger.error('quota consumption failed — refusing', { userId: auth.user.id, meter, err: error });
    return paywall(spec.feature, ent, message, { limit, used: ent.usage[spec.usageKey] });
  }

  if (data === false) {
    return paywall(spec.feature, ent, message, { limit, used: limit });
  }
  return null;
}

/**
 * Give back a monthly unit `requireQuota` consumed, when the write it guarded
 * did not actually happen. Same reasoning as `releaseWeeklyQuota` /
 * `release_quota` (migration 115): consume must run before the write to stay
 * atomic with it, so a later unrelated failure has already spent a unit.
 */
export async function releaseQuota(auth: AuthCtx, meter: MonthlyMeter): Promise<void> {
  try {
    await (auth.supabase.rpc as any)('release_quota', { p_meter: meter });
  } catch {
    /* best-effort */
  }
}

/**
 * `requireQuota`'s WEEKLY twin, for campaigns.apply — the only feature metered
 * per week rather than per month. Kept as a separate function rather than a
 * period parameter on `requireQuota` so a caller can't pass month/week for the
 * wrong meter by mistake; `campaigns.apply` only ever means week.
 */
export async function requireWeeklyQuota(
  auth: AuthCtx,
  feature: Extract<GatedFeature, 'campaigns.apply'>,
  meter: 'applications_week',
  message: string,
): Promise<NextResponse | null> {
  const ent = await resolveEntitlements(auth.supabase, auth.user.id);
  if (ent.tier === 'pro') return null;

  const limit = ent.limits.applicationsPerWeek;
  if (limit === null) return null;

  const { data, error } = await (auth.supabase.rpc as any)('consume_weekly_quota', {
    p_meter: meter,
    p_limit: limit,
  });

  if (error) {
    logger.error('weekly quota consumption failed — refusing', { userId: auth.user.id, meter, err: error });
    return paywall(feature, ent, message, { limit, used: ent.usage.applicationsThisWeek });
  }

  if (data === false) {
    return paywall(feature, ent, message, { limit, used: limit });
  }
  return null;
}

/**
 * Gate `campaigns.publish` — NOT atomic like the two quota helpers above,
 * because a live campaign isn't consumed and released the way a monthly
 * request unit is: it is a standing count (however many are live RIGHT NOW),
 * not a running total. Reading `usage.liveCampaigns` and comparing to the
 * limit is the correct check for a standing count; the enforce_campaign_quota
 * trigger (migration 131) is the atomic backstop for the race this read alone
 * cannot close (two publishes landing together both seeing "2 of 3 used").
 */
export async function requireLiveCampaignQuota(
  auth: AuthCtx,
  message: string,
): Promise<NextResponse | null> {
  const ent = await resolveEntitlements(auth.supabase, auth.user.id);
  if (ent.tier === 'pro') return null;

  const limit = ent.limits.liveCampaigns;
  if (limit === null) return null;

  if (isOverLimit(ent.usage.liveCampaigns, limit)) {
    return paywall('campaigns.publish', ent, message, { limit, used: ent.usage.liveCampaigns });
  }
  return null;
}

/**
 * Give back a unit `requireWeeklyQuota` consumed, when the write it guarded
 * did not actually happen (a duplicate-application conflict, a campaign that
 * expired between the check and the insert). Same reasoning as
 * `release_quota` in migration 115: consuming has to happen before the write
 * to stay atomic with it, so a write that fails afterward for an unrelated
 * reason has already spent a unit unless this is called in that catch path.
 */
export async function releaseWeeklyQuota(
  auth: AuthCtx,
  meter: 'applications_week',
): Promise<void> {
  // supabase-js's query builder is a PromiseLike, not a real Promise — it
  // implements .then() but not .catch(), so chaining .catch() directly on it
  // throws "not a function" instead of swallowing the RPC's own error the way
  // this was meant to. Awaiting it inside a real try/catch works either way.
  try {
    await (auth.supabase.rpc as any)('release_weekly_quota', { p_meter: meter });
  } catch {
    /* best-effort — a failed release just means the unit isn't given back */
  }
}

/**
 * Read-side helper: may this caller see depth-gated data?
 *
 * Returns a plain boolean rather than a response, because the caller's job is
 * to fetch LESS — not to refuse. A read gate that returns 402 turns a profile
 * page into an error page; a read gate that returns `false` turns it into the
 * free view, which is what a paywall is supposed to look like.
 */
export async function canSee(
  auth: AuthCtx,
  feature: GatedFeature,
): Promise<{ allowed: boolean; ent: Entitlements }> {
  const ent = await resolveEntitlements(auth.supabase, auth.user.id);
  return { allowed: hasFeature(ent.tier, feature), ent };
}

/** True when this user should render with the Pro treatment (golden badge). */
export async function isProUser(auth: AuthCtx): Promise<boolean> {
  if (!subscriptionsEnabled()) return false; // the product does not exist here
  const ent = await resolveEntitlements(auth.supabase, auth.user.id);
  return ent.tier === 'pro';
}

/** Re-exported so routes need one import. */
export { isOverLimit, jsonError };

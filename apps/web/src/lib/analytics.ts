/**
 * Product analytics — a typed event vocabulary that is INERT until configured.
 *
 * Design constraints, in priority order:
 *
 *   1. **Zero effect when unconfigured.** With no `NEXT_PUBLIC_POSTHOG_KEY`,
 *      every function here is a no-op: no network, no globals, no script tag,
 *      no console noise. Shipping this to production before anyone has created
 *      a PostHog project must be indistinguishable from not shipping it.
 *   2. **Never break a render.** Analytics is the least important thing on any
 *      page. Every call is wrapped so a failure inside the SDK can never
 *      propagate into React.
 *   3. **A closed event vocabulary.** `track()` only accepts names from
 *      `AnalyticsEvent`. Free-form strings are how analytics turns into a
 *      landfill of `button_clicked_2_final` within a month.
 *
 * Why a wrapper rather than calling posthog-js directly: the funnel we care
 * about is the collaboration lifecycle, and that lifecycle is already modelled
 * in the stage machine. Keeping the names in one file means the funnel in the
 * PostHog UI can be rebuilt from this file alone, and swapping vendors later is
 * one module rather than a hundred call sites.
 */

/**
 * The journey, start to finish. Names are `noun_verb` past tense so they read
 * as facts that happened, which is what an event is.
 *
 * Keep this list ordered by where it sits in the funnel — the order here is
 * the order to rebuild the funnel in the PostHog UI.
 */
export type AnalyticsEvent =
  // Acquisition
  | 'signup_started'
  | 'signup_role_selected'
  | 'signup_otp_sent'
  | 'signup_otp_verified'
  | 'signup_completed'
  | 'login_completed'
  // Creator activation
  | 'profile_step_completed'
  | 'profile_completed'
  | 'social_handle_added'
  | 'ownership_code_issued'
  | 'ownership_confirmed'
  | 'verification_submitted'
  | 'verification_granted'
  // Marketplace
  | 'discover_searched'
  | 'creator_profile_viewed'
  | 'collab_request_sent'
  | 'collab_request_accepted'
  | 'collab_request_declined'
  // Delivery
  | 'deal_proposed'
  | 'deal_agreed'
  | 'project_created'
  | 'project_stage_advanced'
  | 'project_stage_skipped'
  | 'change_request_opened'
  | 'project_completed'
  | 'project_cancelled'
  // Money
  | 'payment_started'
  | 'payment_succeeded'
  | 'payment_failed'
  // Voice of the customer
  | 'support_ticket_opened'
  | 'feedback_submitted'
  // Health
  | 'client_error';

/** Values allowed on an event. Objects/arrays are rejected at the type level
 *  to keep properties queryable in PostHog rather than opaque blobs. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

/** True when a key is present. Exported so UI can hide analytics-only affordances. */
export const analyticsEnabled = Boolean(KEY);

type PostHogLike = {
  init: (key: string, options: Record<string, unknown>) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string, props?: Record<string, unknown>) => void;
  reset: () => void;
  register: (props: Record<string, unknown>) => void;
};

let client: PostHogLike | null = null;
let loading = false;

/**
 * Load posthog-js lazily, on the client, only when a key exists.
 *
 * Dynamic import rather than a static one so the SDK is not in the main bundle
 * for deployments that never configure it — an unconfigured build should not
 * pay ~50KB for a feature that is switched off.
 */
async function getClient(): Promise<PostHogLike | null> {
  if (!KEY || typeof window === 'undefined') return null;
  if (client) return client;
  if (loading) return null;
  loading = true;

  try {
    const mod = await import('posthog-js');
    const posthog = (mod.default ?? mod) as unknown as PostHogLike;
    posthog.init(KEY, {
      api_host: HOST,
      // We send our own pageviews from the app router (see AnalyticsProvider):
      // posthog's automatic capture misses client-side route changes in the
      // Next.js App Router and double-counts the first load.
      capture_pageview: false,
      capture_pageleave: true,
      // Autocapture records every click/input on the page. Off deliberately:
      // this app has creator PII and message drafts in the DOM, and autocapture
      // is the classic way that leaks into a third party. Explicit events only.
      autocapture: false,
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
      // Respect the browser's Do Not Track signal rather than overriding it.
      respect_dnt: true,
    });
    posthog.register({ app_env: process.env.NEXT_PUBLIC_APP_ENV || 'unknown' });
    client = posthog;
    return client;
  } catch {
    // A blocked or failed SDK load must be silent — an ad blocker eating
    // posthog is the expected case, not an error worth reporting.
    return null;
  } finally {
    loading = false;
  }
}

/** Record an event. No-op when analytics is unconfigured. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!KEY) return;
  void getClient()
    .then((c) => c?.capture(event, props))
    .catch(() => {});
}

/** Record a page view. Called by AnalyticsProvider on route change. */
export function trackPageView(path: string): void {
  if (!KEY) return;
  void getClient()
    .then((c) => c?.capture('$pageview', { $current_url: path }))
    .catch(() => {});
}

/**
 * Associate subsequent events with a user.
 *
 * Deliberately takes only an id and a role — no email, no name, no handle.
 * Analytics answers "how many creators finished verification", which needs a
 * stable id and a segment, not an identity. Keeping PII out of the analytics
 * vendor is much easier than getting it deleted later.
 */
export function identify(userId: string, role?: string): void {
  if (!KEY) return;
  void getClient()
    .then((c) => c?.identify(userId, role ? { role } : undefined))
    .catch(() => {});
}

/** Clear the identity on sign-out so the next user is not merged into it. */
export function resetIdentity(): void {
  if (!KEY) return;
  void getClient()
    .then((c) => c?.reset())
    .catch(() => {});
}

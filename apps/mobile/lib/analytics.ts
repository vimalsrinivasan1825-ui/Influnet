/**
 * Mobile analytics and crash reporting — with NO new native dependency.
 *
 * This is the one hard constraint on this file. `posthog-react-native` and
 * `@sentry/react-native` both pull native modules, and a native module can
 * only reach a device through a NEW BUILD. Testers already have the app
 * installed from the production channel; asking them to re-download is exactly
 * what we are avoiding. So both providers are spoken to over plain `fetch`
 * against their documented HTTP APIs, which means this whole file ships as an
 * ordinary OTA update.
 *
 * The trade-off, stated plainly: no native crash capture (a hard crash in
 * native code kills the process before JS can report), no session replay, no
 * automatic device/network breadcrumbs. What we do get is every JS-level error
 * and the full funnel — which is the part that actually answers "where do
 * creators get stuck". Swap to the native SDKs at the next real build.
 *
 * Inert by default: with neither EXPO_PUBLIC_POSTHOG_KEY nor
 * EXPO_PUBLIC_SENTRY_DSN set, nothing here makes a request.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? extra.posthogKey;
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ?? extra.posthogHost ?? 'https://us.i.posthog.com';
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? extra.sentryDsn;

const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';

export const analyticsEnabled = Boolean(POSTHOG_KEY);
export const crashReportingEnabled = Boolean(SENTRY_DSN);

/**
 * The event vocabulary, kept deliberately identical to the web's
 * `AnalyticsEvent` union. Same names on both platforms is what makes a funnel
 * answer "did creators drop off on mobile or on web" instead of producing two
 * unrelated reports.
 */
export type AnalyticsEvent =
  | 'signup_started'
  | 'signup_role_selected'
  | 'signup_otp_sent'
  | 'signup_otp_verified'
  | 'signup_completed'
  | 'login_completed'
  | 'profile_step_completed'
  | 'profile_completed'
  | 'social_handle_added'
  | 'ownership_code_issued'
  | 'ownership_confirmed'
  | 'verification_submitted'
  | 'verification_granted'
  | 'discover_searched'
  | 'creator_profile_viewed'
  | 'collab_request_sent'
  | 'collab_request_accepted'
  | 'collab_request_declined'
  | 'deal_proposed'
  | 'deal_agreed'
  | 'project_created'
  | 'project_stage_advanced'
  | 'project_stage_skipped'
  | 'change_request_opened'
  | 'project_completed'
  | 'project_cancelled'
  | 'payment_started'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'support_ticket_opened'
  | 'feedback_submitted'
  | 'screen_viewed'
  | 'client_error';

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Who the events belong to.
 *
 * PostHog requires a distinct_id on every event. Until sign-in we do not have
 * one, and generating a persistent anonymous id would mean writing a device
 * identifier to storage — more tracking than this app needs. So events before
 * sign-in are simply dropped rather than attributed to a synthetic person.
 */
let distinctId: string | null = null;

export function identify(userId: string, role?: string): void {
  distinctId = userId;
  if (!POSTHOG_KEY || !userId) return;
  void post(`${POSTHOG_HOST}/capture/`, {
    api_key: POSTHOG_KEY,
    event: '$identify',
    distinct_id: userId,
    properties: {
      $set: { role: role ?? null, platform: Platform.OS, app_version: APP_VERSION },
    },
    timestamp: new Date().toISOString(),
  });
}

export function resetIdentity(): void {
  distinctId = null;
}

/** Record an event. No-op without a key, or before the user is known. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!POSTHOG_KEY || !distinctId) return;
  void post(`${POSTHOG_HOST}/capture/`, {
    api_key: POSTHOG_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      ...props,
      platform: Platform.OS,
      app_version: APP_VERSION,
      surface: 'mobile',
    },
    timestamp: new Date().toISOString(),
  });
}

/** Screen view. Mobile's equivalent of a page view. */
export function trackScreen(name: string): void {
  track('screen_viewed', { screen: name });
}

// ---------------------------------------------------------------------------
// Crash reporting
// ---------------------------------------------------------------------------

function parseDsn(dsn: string): string | null {
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    return (
      `${u.protocol}//${u.host}/api/${projectId}/envelope/` +
      `?sentry_key=${publicKey}&sentry_version=7`
    );
  } catch {
    return null;
  }
}

const SENTRY_ENDPOINT = SENTRY_DSN ? parseDsn(SENTRY_DSN) : null;

// Same flood control as the web reporter: a render loop must not be able to
// burn the error quota or the user's mobile data.
const MAX_EVENTS_PER_SESSION = 25;
let sentCount = 0;
const seenErrors = new Set<string>();

function randomHex(bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes; i += 1) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

/** Report a JS error. Never throws. No-op without a DSN. */
export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  if (!SENTRY_ENDPOINT) return;
  if (sentCount >= MAX_EVENTS_PER_SESSION) return;

  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const fingerprint = `${err.name}:${err.message}`;
    if (seenErrors.has(fingerprint)) return;
    seenErrors.add(fingerprint);
    sentCount += 1;

    const eventId = randomHex(16);
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'mobile',
      release: APP_VERSION,
      tags: {
        runtime: 'react-native',
        os: Platform.OS,
        app_version: APP_VERSION,
      },
      exception: {
        values: [
          {
            type: err.name || 'Error',
            value: err.message || String(error),
            stacktrace: err.stack ? { frames: framesFromStack(err.stack) } : undefined,
          },
        ],
      },
      extra: context,
    };

    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
      '\n' +
      JSON.stringify({ type: 'event' }) +
      '\n' +
      JSON.stringify(event) +
      '\n';

    void fetch(SENTRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    }).catch(() => {});
  } catch {
    // Reporting must never become the crash.
  }
}

function framesFromStack(stack: string) {
  return stack
    .split('\n')
    .slice(1)
    .map((line) => {
      const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
      if (!m) return null;
      return {
        function: m[1] || '<anonymous>',
        filename: m[2],
        lineno: Number(m[3]),
        colno: Number(m[4]),
      };
    })
    .filter(Boolean)
    .reverse();
}

/**
 * Install the global JS error handler.
 *
 * React Native exposes `ErrorUtils` rather than window.onerror. Chaining the
 * previous handler matters: replacing it outright would swallow the red-box in
 * development and break any handler Expo installed first.
 */
export function installGlobalErrorHandler(): void {
  if (!SENTRY_ENDPOINT) return;

  const globalAny = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const ErrorUtils = globalAny.ErrorUtils;
  if (!ErrorUtils) return;

  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    captureException(error, { fatal: Boolean(isFatal) });
    previous?.(error, isFatal);
  });
}

// ---------------------------------------------------------------------------

/** Fire-and-forget POST that can never reject into a caller. */
function post(url: string, body: unknown): Promise<void> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(() => undefined)
    .catch(() => undefined);
}

/** Test seam. */
export function __resetForTests(): void {
  sentCount = 0;
  seenErrors.clear();
  distinctId = null;
}

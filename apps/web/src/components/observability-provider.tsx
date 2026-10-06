'use client';

/**
 * One mount point for everything that watches the app from the browser:
 * page views, Web Vitals, and uncaught client errors.
 *
 * All three are independently gated. With neither `NEXT_PUBLIC_POSTHOG_KEY`
 * nor `NEXT_PUBLIC_SENTRY_DSN` set, this component installs no listeners,
 * makes no requests, and renders nothing — it is a `<></>` with extra steps.
 * That is intentional: it can be merged and deployed long before anyone has
 * created the accounts, which is exactly how it is being shipped.
 */

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { analyticsEnabled, identify, resetIdentity, track, trackPageView } from '@/lib/analytics';
import { createClient } from '@/lib/supabase/client';
import { captureBrowserError, browserReportingEnabled } from '@/lib/observability-client';

/**
 * Page views on the App Router.
 *
 * posthog's `capture_pageview` is disabled in `analytics.ts` because it hooks
 * `history.pushState` and misses App Router soft navigations while
 * double-firing on the first paint. Deriving the path from `usePathname()` is
 * the supported way and gives exactly one event per navigation.
 */
function PageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Skip the duplicate fire that React 18 StrictMode causes in development.
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!analyticsEnabled || !pathname) return;

    // Query strings carry password-reset tokens, OAuth codes and invite codes.
    // Recording the raw URL would put those in a third-party system, so only
    // an allowlist of harmless, genuinely useful params is kept.
    const KEEP = new Set(['tab', 'stage', 'view', 'role', 'ref']);
    const kept = new URLSearchParams();
    searchParams?.forEach((value, key) => {
      if (KEEP.has(key)) kept.set(key, value);
    });

    // Usernames are in the path (/c/<username>), and a raw path would make
    // every profile its own page in the report. Collapse to the route shape.
    const normalized = normalizePath(pathname);
    const qs = kept.toString();
    const full = qs ? `${normalized}?${qs}` : normalized;

    if (lastPath.current === full) return;
    lastPath.current = full;
    trackPageView(full);
  }, [pathname, searchParams]);

  return null;
}

/** Collapse dynamic segments so the report groups by route, not by row. */
export function normalizePath(pathname: string): string {
  return pathname
    .replace(/^\/(c|b)\/[^/]+$/, '/$1/:username')
    .replace(/\/projects\/[^/]+/, '/projects/:id')
    .replace(/\/conversations\/[^/]+/, '/conversations/:id')
    .replace(/\/collabs\/[^/]+/, '/collabs/:id')
    .replace(/^\/vf\/[^/]+$/, '/vf/:code')
    .replace(/^\/influnet\/[^/]+$/, '/influnet/:slug');
}

/**
 * Core Web Vitals.
 *
 * Sent as ordinary events rather than to a separate RUM product — LCP/INP/CLS
 * next to the funnel is what answers "did the slow project page cost us
 * completions", which is the only reason to collect them here.
 */
function WebVitals() {
  useReportWebVitals((metric) => {
    if (!analyticsEnabled) return;
    // Only the three that map to user-perceived speed. FCP/TTFB are noise at
    // this stage and triple the event volume against the free tier.
    if (!['LCP', 'INP', 'CLS'].includes(metric.name)) return;
    track('client_error', {
      // Reusing the health event with a kind discriminator keeps the event
      // vocabulary small; `kind` separates them in queries.
      kind: 'web_vital',
      metric: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: (metric as { rating?: string }).rating ?? null,
    });
  });
  return null;
}

/**
 * Uncaught browser errors and rejected promises.
 *
 * Before this, a client-side crash was completely invisible: `observability.ts`
 * only reports from `jsonError`, which is server-side. A creator whose project
 * page white-screened produced no signal anywhere.
 */
function ClientErrors() {
  useEffect(() => {
    if (!browserReportingEnabled) return;

    const onError = (event: ErrorEvent) => {
      captureBrowserError(event.error ?? new Error(event.message), {
        kind: 'window.onerror',
        source: event.filename,
        line: event.lineno,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      captureBrowserError(
        reason instanceof Error ? reason : new Error(String(reason)),
        { kind: 'unhandledrejection' }
      );
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

/**
 * Ties analytics events to the signed-in account.
 *
 * Without this every web visitor was an anonymous PostHog person: a creator
 * who signed up on web and carried on in the app counted as two people, and no
 * funnel could follow anyone past the first page. Mobile already identifies in
 * its root layout; this is the web half, using the same id (profiles.id).
 *
 * Listening to the auth client here, rather than at each sign-in/sign-out call
 * site, covers every path at once — password, OTP, account switching, a session
 * restored on reload, and sign-out from either the login page or the menu.
 */
function Identity() {
  useEffect(() => {
    if (!analyticsEnabled) return;
    const sb = createClient();
    let current: string | null = null;

    const bind = async (userId: string) => {
      if (current === userId) return;
      current = userId;
      // Role is the one segment every funnel splits on (creator vs business).
      // profiles.role is in the authenticated column allow-list.
      const { data } = await sb.from('profiles').select('role').eq('id', userId).maybeSingle();
      if (current === userId) identify(userId, (data as { role?: string } | null)?.role ?? undefined);
    };

    void sb.auth.getSession().then(({ data }) => {
      if (data.session) void bind(data.session.user.id);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        current = null;
        resetIdentity();
      } else if (session) {
        void bind(session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}

export function ObservabilityProvider() {
  return (
    <>
      <Identity />
      <PageViews />
      <WebVitals />
      <ClientErrors />
    </>
  );
}

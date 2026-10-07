import { after } from 'next/server';
import type { AnalyticsEvent, AnalyticsProps } from '@/lib/analytics';
import { parseClientHeader } from '@/lib/api';
import { appEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Server-side product analytics — the funnel's facts, sent from the route that
 * records them.
 *
 * The browser wrapper (`lib/analytics.ts`) is right for UI moments ("opened the
 * signup form"), but wrong for the events the funnel is built on: an ad blocker
 * drops a meaningful share of browser analytics, a re-render can fire twice,
 * and the mobile app would need the same call duplicated. Sending
 * `collab_request_sent` from the route that inserted the row means it fires
 * exactly when the database says it happened, from web and mobile alike.
 *
 * Same rules as the browser side:
 *   - **Inert without a key.** No `NEXT_PUBLIC_POSTHOG_KEY`, no network.
 *   - **Never breaks a request.** The send runs in `after()`, once the response
 *     has gone out, and every failure is swallowed (logged at debug).
 *   - **No PII.** `distinctId` is profiles.id — the same id the web and mobile
 *     clients `identify()` with, so server and client events join to one
 *     person. Properties are ids, roles, stages and amounts, never names,
 *     emails or handles.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');

async function send(event: AnalyticsEvent, distinctId: string, props?: AnalyticsProps): Promise<void> {
  try {
    const res = await fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: KEY,
        event,
        distinct_id: distinctId,
        properties: {
          ...props,
          source: 'server',
          // APP_ENV, not NEXT_PUBLIC_APP_ENV: the public one is inlined at build
          // time even in server code, and is not a build arg everywhere.
          app_env: appEnv,
        },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) logger.debug('[analytics] capture rejected', { event, status: res.status });
  } catch (err) {
    logger.debug('[analytics] capture failed', { event, err: String(err) });
  }
}

/**
 * Record a funnel event for `distinctId` (a profiles.id). Fire-and-forget.
 *
 * Call it AFTER the write it describes has succeeded — an event for something
 * that was rolled back is a lie in the funnel.
 */
export function captureServer(
  event: AnalyticsEvent,
  distinctId: string | null | undefined,
  props?: AnalyticsProps,
  /** The request that caused it — adds `platform` (web/ios/android) and
   *  `app_version`, so every funnel step splits by platform for free. */
  req?: Request,
): void {
  if (!KEY || !distinctId) return;
  if (req) {
    const client = parseClientHeader(req);
    props = { platform: client.platform, app_version: client.version, ...props };
  }
  try {
    after(() => send(event, distinctId, props));
  } catch {
    // Outside a request scope (a script, a unit test) `after` throws. Send
    // anyway rather than lose the event; nothing awaits it either way.
    void send(event, distinctId, props);
  }
}

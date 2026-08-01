/**
 * Browser-side error reporting to Sentry.
 *
 * The server already reports 5xx faults via `observability.ts`. That module is
 * deliberately NOT reused here: it imports `./env`, which pulls zod and a
 * schema requiring `SUPABASE_SERVICE_ROLE_KEY` into whatever bundle imports it.
 * Duplicating ~30 lines of DSN parsing is a better trade than shipping the
 * server env schema to every browser.
 *
 * Same contract as the server module: no DSN → every call is a no-op with no
 * network and no globals touched.
 */

const RAW_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

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

const ENDPOINT = RAW_DSN ? parseDsn(RAW_DSN) : null;

/** True when browser error reporting is active. */
export const browserReportingEnabled = ENDPOINT !== null;

/**
 * Flood control.
 *
 * A React render loop or a broken event handler can throw thousands of times
 * per second. Without a cap, the first such bug would burn a month of Sentry
 * quota in a minute and bury every other error — so the reporter itself must
 * be the thing that fails safe.
 */
const MAX_EVENTS_PER_SESSION = 25;
let sent = 0;
/** Same message twice is the same bug; report it once per page load. */
const seen = new Set<string>();

function hex(bytes: number): string {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function framesFromStack(stack: string) {
  const frames = stack
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
    .filter(Boolean);
  return frames.reverse();
}

/**
 * Strip anything identifying from the URL before it leaves the browser.
 *
 * Reset tokens, OAuth codes and invite codes all live in query strings on this
 * app, and a crash report that carries a live password-reset token to a third
 * party is a credential leak wearing an error's clothes.
 */
function safeUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const u = new URL(window.location.href);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

export interface BrowserErrorContext {
  kind?: string;
  source?: string;
  line?: number;
  [key: string]: unknown;
}

/**
 * Report a browser error. Never throws, never blocks, never logs.
 */
export function captureBrowserError(
  error: unknown,
  context: BrowserErrorContext = {}
): void {
  if (!ENDPOINT) return;
  if (sent >= MAX_EVENTS_PER_SESSION) return;

  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const fingerprint = `${err.name}:${err.message}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    sent += 1;

    const eventId = hex(16);
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      environment: process.env.NEXT_PUBLIC_APP_ENV || 'unknown',
      request: { url: safeUrl() },
      exception: {
        values: [
          {
            type: err.name || 'Error',
            value: err.message || String(error),
            stacktrace: err.stack
              ? { frames: framesFromStack(err.stack) }
              : undefined,
          },
        ],
      },
      tags: { runtime: 'browser', kind: context.kind ?? 'manual' },
      extra: context,
    };

    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
      '\n' +
      JSON.stringify({ type: 'event' }) +
      '\n' +
      JSON.stringify(event) +
      '\n';

    // keepalive so a report survives the navigation that a crash often causes.
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never become the error.
  }
}

/** Test seam: reset the flood counters between cases. */
export function __resetBrowserReporter(): void {
  sent = 0;
  seen.clear();
}

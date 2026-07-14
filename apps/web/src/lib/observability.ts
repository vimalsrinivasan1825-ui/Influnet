/**
 * Minimal, dependency-free error reporting to Sentry.
 *
 * Why not @sentry/nextjs? That SDK is the richer option (auto-instrumentation,
 * source maps, tracing) and you can adopt it later. This module gives you the
 * one thing that actually matters for launch — "an unhandled server error
 * happened and here's the stack" — with ZERO dependencies and ZERO overhead
 * when unconfigured:
 *
 *   - No DSN set  → every call is a no-op. Nothing is imported, sent, or logged.
 *   - DSN set     → posts a valid Sentry "event" envelope over fetch,
 *                   fire-and-forget, timeout-guarded so it can never delay or
 *                   break a request.
 *
 * Wired into `jsonError` for 5xx responses (see lib/api.ts), so any server fault
 * that already returns a 500 is also reported. Call `captureException` directly
 * from a catch block when you want to report without a specific HTTP response.
 */
import { appEnv } from './env';

interface ParsedDsn {
  endpoint: string; // full envelope URL incl. auth query
}

// DSN shape: https://<publicKey>@<host>[:port]/<path?>/<projectId>
function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    const endpoint =
      `${u.protocol}//${u.host}/api/${projectId}/envelope/` +
      `?sentry_key=${publicKey}&sentry_version=7`;
    return { endpoint };
  } catch {
    return null;
  }
}

let cachedDsn: ParsedDsn | null | undefined;

function dsn(): ParsedDsn | null {
  if (cachedDsn !== undefined) return cachedDsn;
  const raw = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  cachedDsn = raw ? parseDsn(raw) : null;
  return cachedDsn;
}

/** Is error reporting active? (Useful for the boot banner / tests.) */
export function isObservabilityEnabled(): boolean {
  return dsn() !== null;
}

function hex(bytes: number): string {
  const a = new Uint8Array(bytes);
  // Web Crypto is available in Node 20+ and the edge runtime.
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CaptureContext {
  /** Short searchable tags, e.g. { route: '/api/verification', status: '500' }. */
  tags?: Record<string, string | number>;
  /** Arbitrary structured detail attached to the event. */
  extra?: Record<string, unknown>;
}

/**
 * Report an error to Sentry. Never throws, never blocks — safe to call from any
 * catch. No-op when no DSN is configured.
 */
export function captureException(error: unknown, context: CaptureContext = {}): void {
  const target = dsn();
  if (!target) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const eventId = hex(16);
  const nowSeconds = Date.now() / 1000;

  const event = {
    event_id: eventId,
    timestamp: nowSeconds,
    platform: 'node',
    level: 'error',
    environment: appEnv,
    server_name: undefined as string | undefined,
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: err.message || String(error),
          stacktrace: err.stack ? { frames: framesFromStack(err.stack) } : undefined,
        },
      ],
    },
    tags: context.tags,
    extra: context.extra,
  };

  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event) +
    '\n';

  // Fire-and-forget. Swallow every failure — telemetry must never surface.
  void fetch(target.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body: envelope,
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

// Best-effort parse of a V8 stack into Sentry frames (most-recent-call last).
function framesFromStack(stack: string) {
  const lines = stack.split('\n').slice(1);
  const frames = lines
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

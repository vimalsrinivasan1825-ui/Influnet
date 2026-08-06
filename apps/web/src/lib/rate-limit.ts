/**
 * Provider-agnostic rate limiting for API routes.
 *
 * Design goals:
 *  - Zero required dependencies. Works out of the box with an in-process
 *    fixed-window counter (a sane floor for single-instance / preview / dev).
 *  - Auto-upgrades to a DISTRIBUTED limiter when Upstash Redis REST credentials
 *    are present (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) — required
 *    for correctness across serverless instances in production.
 *  - Fails OPEN: if the backing store errors, we allow the request rather than
 *    lock users out. Rate limiting is an abuse/cost guard, not an auth control.
 *
 * Usage (at the very top of a route handler):
 *
 *   const limited = await enforceRateLimit(req, { bucket: 'collabs:create', limit: 20, windowMs: 60_000 });
 *   if (limited) return limited;
 */
import { NextResponse } from 'next/server';
import { jsonError } from './api';
import { recordRateLimitHit } from './rate-limit-log';

export interface RateLimitResult {
  ok: boolean;
  /** Requests remaining in the current window (>= 0). */
  remaining: number;
  /** Configured ceiling for the window. */
  limit: number;
  /** Unix ms when the window resets. */
  resetAt: number;
}

const upstashUrl = () => process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
const upstashToken = () => process.env.UPSTASH_REDIS_REST_TOKEN;

/** True when a distributed backend is configured. */
export function isDistributedRateLimit(): boolean {
  return Boolean(upstashUrl() && upstashToken());
}

// ── In-process fallback ──────────────────────────────────────────────────────
// A fixed-window counter keyed by `${bucket}:${key}:${windowStart}`. Bounded by
// opportunistic pruning so a long-lived instance can't leak memory.
const memStore = new Map<string, { count: number; resetAt: number }>();

function memHit(fullKey: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const storeKey = `${fullKey}:${windowStart}`;

  const existing = memStore.get(storeKey);
  const count = (existing?.count ?? 0) + 1;
  memStore.set(storeKey, { count, resetAt });

  // Opportunistic prune of expired windows (cheap; runs ~1/50 calls).
  if (memStore.size > 500 && Math.random() < 0.02) {
    for (const [k, v] of memStore) if (v.resetAt <= now) memStore.delete(k);
  }

  return { ok: count <= limit, remaining: Math.max(0, limit - count), limit, resetAt };
}

// ── Upstash (distributed) ────────────────────────────────────────────────────
// One INCR per hit; set the TTL only when the counter is first created. Uses the
// REST API so we need no SDK. Fails open on any transport error.
async function upstashHit(fullKey: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const storeKey = `rl:${fullKey}:${windowStart}`;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  const url = `${upstashUrl()}/pipeline`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${upstashToken()}`,
      'Content-Type': 'application/json',
    },
    // INCR then set expiry (NX = only if no TTL yet) in a single round-trip.
    body: JSON.stringify([
      ['INCR', storeKey],
      ['EXPIRE', storeKey, String(ttlSeconds), 'NX'],
    ]),
    // Never let a slow limiter store hang the request.
    signal: AbortSignal.timeout(1500),
  });

  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const body = (await res.json()) as Array<{ result: number }>;
  const count = Number(body?.[0]?.result ?? 0);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), limit, resetAt };
}

/**
 * Records one hit against `bucket:key` and reports whether it's within `limit`
 * for the rolling `windowMs`. Never throws — degrades to the in-process store.
 */
export async function checkRateLimit(opts: {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const fullKey = `${opts.bucket}:${opts.key}`;
  const result = await (async () => {
    if (isDistributedRateLimit()) {
      try {
        return await upstashHit(fullKey, opts.limit, opts.windowMs);
      } catch {
        // Distributed store unreachable — fall back to the local floor rather
        // than fail open entirely.
        return memHit(fullKey, opts.limit, opts.windowMs);
      }
    }
    return memHit(fullKey, opts.limit, opts.windowMs);
  })();

  // Fire-and-forget: admin visibility only, must never add latency or a new
  // failure mode to the request this limiter is guarding.
  void recordRateLimitHit({ bucket: opts.bucket, identity: opts.key, ok: result.ok, limit: opts.limit });

  return result;
}

/**
 * Best-effort client identity for anonymous/pre-auth rate limiting.
 *
 * X-Forwarded-For is a comma-separated list that grows as a request passes
 * through proxies — each hop APPENDS the address it saw. That means the
 * platform's own edge proxy appends the real client address as the LAST
 * (right-most) entry; anything to its left is whatever the client itself
 * claimed in the header it sent, which is entirely spoofable. Trusting the
 * left-most hop (the previous behaviour) let a caller rotate a fake IP on
 * every request and bypass every limiter keyed on it — including the
 * unauthenticated scrape:instagram bucket, which spends paid provider credits
 * per call. Vercel also injects its own header with the value it verified,
 * which is preferred here when present.
 */
export function clientKey(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.trim();

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }

  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

/**
 * Enforce a limit at the top of a route. Returns a ready-to-return 429
 * `NextResponse` when the caller is over budget, or `null` to proceed.
 *
 * @param key  Override the identity (e.g. a user id). Defaults to client IP.
 */
export async function enforceRateLimit(
  req: Request,
  opts: { bucket: string; limit: number; windowMs: number; key?: string },
): Promise<NextResponse | null> {
  const key = opts.key ?? clientKey(req);
  const result = await checkRateLimit({ bucket: opts.bucket, key, limit: opts.limit, windowMs: opts.windowMs });
  if (result.ok) return null;

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  const res = jsonError(429, 'Too many requests — please slow down and try again shortly.');
  res.headers.set('Retry-After', String(retryAfter));
  res.headers.set('X-RateLimit-Limit', String(result.limit));
  res.headers.set('X-RateLimit-Remaining', String(result.remaining));
  res.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  return res;
}

/**
 * A circuit breaker per third party.
 *
 * ── The problem it solves ─────────────────────────────────────────────────
 * Deadlines (lib/fetch-timeout.ts) bound a single call. They do not stop you
 * making the call. When a vendor is fully down, every request still tries it,
 * still waits the full budget, and still fails — so a 15-second Apify timeout
 * on a dead vendor means every profile refresh takes 15 seconds to fail, and
 * a hundred of them occupy the request pool for the entire time.
 *
 * The breaker makes the SECOND failure cheap: after enough consecutive
 * failures it stops calling for a cooldown and fails instantly instead. The
 * vendor also gets to recover without being hammered by a retry storm, which
 * is the other half of why this exists.
 *
 * ── States ────────────────────────────────────────────────────────────────
 *   closed    normal. Calls go through. Failures counted.
 *   open      too many consecutive failures. Calls short-circuit instantly
 *             until the cooldown expires.
 *   half-open cooldown elapsed. The NEXT call is allowed through as a probe:
 *             success closes the breaker and clears the count, failure opens
 *             it again for another cooldown.
 *
 * Only CONSECUTIVE failures count — one success resets to zero. A vendor that
 * fails 5% of the time should never trip a breaker, and a counter that never
 * resets would eventually trip it anyway.
 *
 * ── Deliberately in-process ───────────────────────────────────────────────
 * State lives in module memory, not Redis. Each instance learns independently
 * and a deploy resets everything. That is a real limitation and it is the
 * right trade here: the breaker is a latency guard, not a correctness
 * mechanism, and a shared store would put a network call in front of the
 * thing whose job is avoiding network calls. The same reasoning the rate
 * limiter uses for its in-process fallback.
 *
 * For a deliberate, operator-driven "stop calling this vendor", use the
 * vendor kill switch (migration 149) — that IS shared, and it is not
 * time-limited.
 */
import { captureException } from './observability';
import { logger } from './logger';

export type BreakerName =
  | 'apify'
  | 'hikerapi'
  | 'razorpay'
  | 'stream'
  | 'resend'
  | 'expo_push'
  // Bulk admin broadcasts (lib/broadcasts.ts). Separate so a large send that
  // trips it cannot block transactional pushes on `expo_push`.
  | 'expo_push_broadcast'
  | 'cloudinary';

export interface BreakerPolicy {
  /** Consecutive failures required to open the breaker. */
  threshold: number;
  /** How long it stays open before allowing one probe through. */
  cooldownMs: number;
}

/**
 * Money gets a higher threshold and a shorter cooldown than scraping.
 *
 * Refusing a payment because of a transient blip is far more costly than
 * refusing a profile refresh, so Razorpay has to fail more times to trip and
 * recovers sooner. Scrapers are the opposite: flaky by nature, nobody is
 * watching, and calling a dead one is pure waste.
 */
const POLICY: Record<BreakerName, BreakerPolicy> = {
  razorpay: { threshold: 8, cooldownMs: 15_000 },
  stream: { threshold: 6, cooldownMs: 20_000 },
  resend: { threshold: 5, cooldownMs: 30_000 },
  expo_push: { threshold: 5, cooldownMs: 30_000 },
  expo_push_broadcast: { threshold: 3, cooldownMs: 60_000 },
  cloudinary: { threshold: 5, cooldownMs: 30_000 },
  apify: { threshold: 4, cooldownMs: 60_000 },
  hikerapi: { threshold: 4, cooldownMs: 60_000 },
};

interface BreakerState {
  consecutiveFailures: number;
  openedAt: number | null;
  /** Set while a half-open probe is in flight, so only one probe is allowed. */
  probing: boolean;
}

const state = new Map<BreakerName, BreakerState>();

function get(name: BreakerName): BreakerState {
  let s = state.get(name);
  if (!s) {
    s = { consecutiveFailures: 0, openedAt: null, probing: false };
    state.set(name, s);
  }
  return s;
}

/** Thrown instead of calling a vendor whose breaker is open. */
export class CircuitOpenError extends Error {
  readonly vendor: BreakerName;
  readonly retryAfterMs: number;
  constructor(vendor: BreakerName, retryAfterMs: number) {
    super(`${vendor} is temporarily unavailable (circuit open)`);
    this.name = 'CircuitOpenError';
    this.vendor = vendor;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isCircuitOpen(err: unknown): err is CircuitOpenError {
  return err instanceof Error && err.name === 'CircuitOpenError';
}

/** Current state, for the admin screen. Never mutates. */
export function breakerStatus(): Record<
  BreakerName,
  { state: 'closed' | 'open' | 'half-open'; consecutiveFailures: number; retryInMs: number }
> {
  const now = Date.now();
  const out = {} as ReturnType<typeof breakerStatus>;
  for (const name of Object.keys(POLICY) as BreakerName[]) {
    const s = state.get(name);
    if (!s || s.openedAt === null) {
      out[name] = {
        state: 'closed',
        consecutiveFailures: s?.consecutiveFailures ?? 0,
        retryInMs: 0,
      };
      continue;
    }
    const elapsed = now - s.openedAt;
    const remaining = POLICY[name].cooldownMs - elapsed;
    out[name] = {
      state: remaining > 0 ? 'open' : 'half-open',
      consecutiveFailures: s.consecutiveFailures,
      retryInMs: Math.max(0, remaining),
    };
  }
  return out;
}

/**
 * Run `fn` through this vendor's breaker.
 *
 * Throws CircuitOpenError instead of calling when the breaker is open, so a
 * caller can tell "we did not even try" apart from "the vendor said no" and
 * degrade accordingly.
 *
 * `shouldCount` decides what counts as a vendor failure. By default every
 * throw does — but a 400 from Razorpay means OUR request was wrong, and
 * counting it would let a bug in our own code trip a breaker and take
 * payments down. Callers pass a predicate to exclude that.
 */
export async function withBreaker<T>(
  name: BreakerName,
  fn: () => Promise<T>,
  opts: { shouldCount?: (err: unknown) => boolean } = {},
): Promise<T> {
  const policy = POLICY[name];
  const s = get(name);
  const now = Date.now();

  if (s.openedAt !== null) {
    const remaining = policy.cooldownMs - (now - s.openedAt);
    if (remaining > 0) throw new CircuitOpenError(name, remaining);
    // Cooldown elapsed → half-open. Exactly one probe goes through; anything
    // else arriving in the meantime keeps short-circuiting, so recovery does
    // not become its own thundering herd.
    if (s.probing) throw new CircuitOpenError(name, policy.cooldownMs);
    s.probing = true;
  }

  try {
    const result = await fn();
    if (s.openedAt !== null) {
      logger.info('[circuit] recovered', { vendor: name });
    }
    s.consecutiveFailures = 0;
    s.openedAt = null;
    s.probing = false;
    return result;
  } catch (err) {
    s.probing = false;

    if (opts.shouldCount && !opts.shouldCount(err)) throw err;

    s.consecutiveFailures += 1;
    if (s.consecutiveFailures >= policy.threshold && s.openedAt === null) {
      s.openedAt = Date.now();
      logger.error('[circuit] opened', {
        vendor: name,
        failures: s.consecutiveFailures,
        cooldownMs: policy.cooldownMs,
      });
      // Worth a Sentry event: a breaker opening is the single clearest signal
      // that a third party is down, and it is exactly what you want to be
      // told about rather than discover in a log later.
      captureException(err, {
        tags: { circuit: 'opened', vendor: name },
        extra: { consecutiveFailures: s.consecutiveFailures, cooldownMs: policy.cooldownMs },
      });
    } else if (s.openedAt !== null) {
      // The half-open probe failed. Restart the cooldown from now.
      s.openedAt = Date.now();
    }
    throw err;
  }
}

/** Test seam. Never called in application code. */
export function __resetBreakers(): void {
  state.clear();
}

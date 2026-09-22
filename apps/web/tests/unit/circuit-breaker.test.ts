import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import {
  withBreaker,
  isCircuitOpen,
  breakerStatus,
  __resetBreakers,
  CircuitOpenError,
} from '@/lib/circuit-breaker';

const boom = () => Promise.reject(new Error('vendor down'));
const ok = () => Promise.resolve('fine');

/** apify's policy is threshold 4 / cooldown 60s. */
async function tripApify() {
  for (let i = 0; i < 4; i++) {
    await withBreaker('apify', boom).catch(() => {});
  }
}

describe('circuit breaker', () => {
  beforeEach(() => {
    __resetBreakers();
    vi.useRealTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('passes values through while closed', async () => {
    await expect(withBreaker('apify', ok)).resolves.toBe('fine');
    expect(breakerStatus().apify.state).toBe('closed');
  });

  it('rethrows the vendor error rather than masking it, below threshold', async () => {
    await expect(withBreaker('apify', boom)).rejects.toThrow('vendor down');
    expect(breakerStatus().apify.state).toBe('closed');
    expect(breakerStatus().apify.consecutiveFailures).toBe(1);
  });

  it('opens after the threshold and then short-circuits without calling', async () => {
    await tripApify();
    expect(breakerStatus().apify.state).toBe('open');

    const fn = vi.fn(ok);
    await expect(withBreaker('apify', fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled(); // the whole point: we did not even try
  });

  it('counts only CONSECUTIVE failures — one success resets', async () => {
    await withBreaker('apify', boom).catch(() => {});
    await withBreaker('apify', boom).catch(() => {});
    await withBreaker('apify', ok);
    expect(breakerStatus().apify.consecutiveFailures).toBe(0);

    await withBreaker('apify', boom).catch(() => {});
    expect(breakerStatus().apify.state).toBe('closed');
  });

  it('does not count errors the caller excludes — our bug must not trip it', async () => {
    const ourFault = () => Promise.reject(Object.assign(new Error('400'), { status: 400 }));
    const shouldCount = (e: unknown) => (e as any)?.status !== 400;

    for (let i = 0; i < 10; i++) {
      await withBreaker('razorpay', ourFault, { shouldCount }).catch(() => {});
    }
    expect(breakerStatus().razorpay.state).toBe('closed');
    expect(breakerStatus().razorpay.consecutiveFailures).toBe(0);
  });

  it('goes half-open after the cooldown and closes on a successful probe', async () => {
    await tripApify();
    expect(breakerStatus().apify.state).toBe('open');

    // Advance past the 60s cooldown.
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      expect(breakerStatus().apify.state).toBe('half-open');
      await expect(withBreaker('apify', ok)).resolves.toBe('fine');
    } finally {
      Date.now = realNow;
    }
    expect(breakerStatus().apify.state).toBe('closed');
  });

  it('reopens when the half-open probe fails', async () => {
    await tripApify();
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      await withBreaker('apify', boom).catch(() => {});
      expect(breakerStatus().apify.state).toBe('open');
    } finally {
      Date.now = realNow;
    }
  });

  it('keeps each vendor independent', async () => {
    await tripApify();
    expect(breakerStatus().apify.state).toBe('open');
    expect(breakerStatus().razorpay.state).toBe('closed');
    await expect(withBreaker('razorpay', ok)).resolves.toBe('fine');
  });

  it('gives razorpay a higher threshold than apify — money is not scraping', async () => {
    for (let i = 0; i < 4; i++) await withBreaker('razorpay', boom).catch(() => {});
    // apify would be open by now; razorpay must not be.
    expect(breakerStatus().razorpay.state).toBe('closed');
  });

  it('identifies its own error type', async () => {
    await tripApify();
    const err = await withBreaker('apify', ok).catch((e) => e);
    expect(isCircuitOpen(err)).toBe(true);
    expect(isCircuitOpen(new Error('other'))).toBe(false);
    expect(err.vendor).toBe('apify');
    expect(err.retryAfterMs).toBeGreaterThan(0);
  });
});

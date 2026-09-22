import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/rate-limit-log', () => ({ recordRateLimitHit: vi.fn() }));

/**
 * The behaviour under test is what happens when the DISTRIBUTED store is
 * configured but unreachable — the case that only shows up in production.
 */
async function fresh() {
  vi.resetModules();
  return import('@/lib/rate-limit');
}

const origFetch = globalThis.fetch;

describe('rate limiting when Upstash is unreachable', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
  });
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('fails OPEN by default — an abuse guard must not lock everyone out', async () => {
    const { checkRateLimit } = await fresh();
    const r = await checkRateLimit({
      bucket: 'discover:list',
      key: 'u1',
      limit: 5,
      windowMs: 60_000,
    });
    expect(r.ok).toBe(true);
  });

  it('fails CLOSED with strict — a money limiter must not silently become N x', async () => {
    const { checkRateLimit } = await fresh();
    const r = await checkRateLimit({
      bucket: 'payments:create',
      key: 'u1',
      limit: 12,
      windowMs: 60_000,
      strict: true,
    });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('reports a strict fail-closed, because it is an infrastructure event', async () => {
    const { captureException } = await import('@/lib/observability');
    const { checkRateLimit } = await fresh();
    await checkRateLimit({
      bucket: 'payments:create',
      key: 'u1',
      limit: 12,
      windowMs: 60_000,
      strict: true,
    });
    expect(captureException).toHaveBeenCalled();
  });
});

describe('rate limiting with no distributed store at all', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('strict changes nothing — there is nothing to be unreachable', async () => {
    const { checkRateLimit } = await fresh();
    const r = await checkRateLimit({
      bucket: 'payments:create',
      key: 'solo',
      limit: 3,
      windowMs: 60_000,
      strict: true,
    });
    expect(r.ok).toBe(true);
  });

  it('still enforces the local ceiling', async () => {
    const { checkRateLimit } = await fresh();
    const hit = () =>
      checkRateLimit({ bucket: 'b', key: 'same', limit: 2, windowMs: 60_000 });
    expect((await hit()).ok).toBe(true);
    expect((await hit()).ok).toBe(true);
    expect((await hit()).ok).toBe(false);
  });
});

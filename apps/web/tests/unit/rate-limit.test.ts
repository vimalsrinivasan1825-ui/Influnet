import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, clientKey, isDistributedRateLimit } from '@/lib/rate-limit';

// These tests exercise the in-process fallback (no Upstash env set). Each uses a
// unique bucket/key so windows don't collide across tests.

describe('checkRateLimit (in-process fallback)', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('reports the in-process backend when Upstash is unset', () => {
    expect(isDistributedRateLimit()).toBe(false);
  });

  it('allows up to the limit then blocks', async () => {
    const opts = { bucket: 'test:a', key: 'user-1', limit: 3, windowMs: 60_000 };
    const r1 = await checkRateLimit(opts);
    const r2 = await checkRateLimit(opts);
    const r3 = await checkRateLimit(opts);
    const r4 = await checkRateLimit(opts);

    expect([r1.ok, r2.ok, r3.ok]).toEqual([true, true, true]);
    expect(r4.ok).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r1.remaining).toBe(2);
  });

  it('isolates counters by key', async () => {
    const base = { bucket: 'test:b', limit: 1, windowMs: 60_000 };
    const a = await checkRateLimit({ ...base, key: 'alice' });
    const b = await checkRateLimit({ ...base, key: 'bob' });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true); // different key => its own budget
  });

  it('isolates counters by bucket', async () => {
    const first = await checkRateLimit({ bucket: 'test:c1', key: 'k', limit: 1, windowMs: 60_000 });
    const second = await checkRateLimit({ bucket: 'test:c2', key: 'k', limit: 1, windowMs: 60_000 });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});

describe('clientKey', () => {
  it('prefers the left-most X-Forwarded-For hop', () => {
    const req = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    expect(clientKey(req)).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip, then unknown', () => {
    expect(clientKey(new Request('https://x.test', { headers: { 'x-real-ip': '198.51.100.4' } }))).toBe('198.51.100.4');
    expect(clientKey(new Request('https://x.test'))).toBe('unknown');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The DSN is read + cached at module load, so re-import fresh per test.
async function freshModule() {
  vi.resetModules();
  return import('@/lib/observability');
}

describe('observability', () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('is disabled and never calls fetch when no DSN is set', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as any;
    const { captureException, isObservabilityEnabled } = await freshModule();

    expect(isObservabilityEnabled()).toBe(false);
    captureException(new Error('boom'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('is enabled and posts an envelope when a valid DSN is set', async () => {
    process.env.SENTRY_DSN = 'https://abc123@o123.ingest.sentry.io/456';
    const spy = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = spy as any;
    const { captureException, isObservabilityEnabled } = await freshModule();

    expect(isObservabilityEnabled()).toBe(true);
    captureException(new Error('boom'), { tags: { status: 500 } });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/456/envelope/');
    expect(String(url)).toContain('sentry_key=abc123');
    expect(String(init.body)).toContain('"boom"');
  });

  it('never throws on a malformed DSN', async () => {
    process.env.SENTRY_DSN = 'not-a-url';
    const { captureException, isObservabilityEnabled } = await freshModule();
    expect(isObservabilityEnabled()).toBe(false);
    expect(() => captureException(new Error('x'))).not.toThrow();
  });
});

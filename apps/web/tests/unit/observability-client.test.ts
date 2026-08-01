import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The browser error reporter's two jobs, both of which are safety properties
 * rather than features:
 *
 *   1. Do NOTHING when unconfigured. This ships to production before anyone
 *      has created a Sentry project, so "no DSN" must mean "no network, no
 *      side effects" — not "quietly fails".
 *   2. Never flood. A React render loop throws thousands of times a second;
 *      an uncapped reporter would burn the quota and hide every other error.
 *
 * The module reads its DSN at import time, so each case re-imports with a
 * fresh module registry rather than trying to mutate a captured constant.
 */

const DSN = 'https://abc123@o1.ingest.sentry.io/42';

async function loadWithDsn(dsn?: string) {
  vi.resetModules();
  if (dsn) process.env.NEXT_PUBLIC_SENTRY_DSN = dsn;
  else delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  return import('@/lib/observability-client');
}

describe('observability-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    // jsdom is not the environment here, so provide what the reporter touches.
    vi.stubGlobal('window', { location: { href: 'https://app.test/dashboard?token=secret' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDsn) process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
    else delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  it('is completely inert with no DSN configured', async () => {
    const mod = await loadWithDsn(undefined);
    expect(mod.browserReportingEnabled).toBe(false);

    mod.captureBrowserError(new Error('boom'));
    mod.captureBrowserError(new Error('bang'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports once when a DSN is configured', async () => {
    const mod = await loadWithDsn(DSN);
    expect(mod.browserReportingEnabled).toBe(true);

    mod.captureBrowserError(new Error('boom'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/42/envelope/');
    expect(String(url)).toContain('sentry_key=abc123');
    expect(init.method).toBe('POST');
  });

  it('deduplicates the same error so a render loop reports once', async () => {
    const mod = await loadWithDsn(DSN);
    mod.__resetBrowserReporter();

    for (let i = 0; i < 50; i += 1) {
      mod.captureBrowserError(new Error('same message'));
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps total events per session even when every error is distinct', async () => {
    const mod = await loadWithDsn(DSN);
    mod.__resetBrowserReporter();

    for (let i = 0; i < 100; i += 1) {
      mod.captureBrowserError(new Error(`distinct ${i}`));
    }

    // The cap is 25; the exact number matters less than "bounded".
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(25);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  });

  it('strips the query string so reset tokens never reach Sentry', async () => {
    const mod = await loadWithDsn(DSN);
    mod.__resetBrowserReporter();

    mod.captureBrowserError(new Error('leaky'));

    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('https://app.test/dashboard');
    expect(body).not.toContain('token=secret');
  });

  it('never throws, whatever it is handed', async () => {
    const mod = await loadWithDsn(DSN);
    mod.__resetBrowserReporter();

    expect(() => mod.captureBrowserError(undefined)).not.toThrow();
    expect(() => mod.captureBrowserError('a string')).not.toThrow();
    expect(() => mod.captureBrowserError({ weird: true })).not.toThrow();
  });

  it('swallows a rejecting transport rather than surfacing it', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const mod = await loadWithDsn(DSN);
    mod.__resetBrowserReporter();

    expect(() => mod.captureBrowserError(new Error('boom'))).not.toThrow();
  });
});

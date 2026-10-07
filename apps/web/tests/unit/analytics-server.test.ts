import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Server-side funnel events. Three properties matter, in this order:
 *   1. without a key it makes no network call (the state it ships in for any
 *      environment that hasn't configured PostHog),
 *   2. it can never throw into the route that called it,
 *   3. what it sends joins to the client's identify() — same distinct_id —
 *      and carries the caller's platform, but no PII.
 *
 * Outside a request scope `after()` throws, so these tests also exercise the
 * fallback path that sends immediately.
 */

async function load(key?: string) {
  vi.resetModules();
  if (key) process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
  else delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com/';
  return import('@/lib/analytics-server');
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('captureServer', () => {
  const original = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original) process.env.NEXT_PUBLIC_POSTHOG_KEY = original;
    else delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it('makes no network call without a key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { captureServer } = await load(undefined);
    captureServer('signup_completed', 'user-1', { role: 'influencer' });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips an event with no person to attach it to', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { captureServer } = await load('phc_test');
    captureServer('payment_failed', null);
    captureServer('payment_failed', undefined);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the event under the profile id, with platform from the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { captureServer } = await load('phc_test');

    const req = new Request('https://app.test/api/collabs', {
      headers: { 'x-influnet-client': 'ios/1.0.0' },
    });
    captureServer('collab_request_sent', 'user-42', { request_id: 'r1' }, req);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // Trailing slash on the configured host must not produce `//capture/`.
    expect(url).toBe('https://eu.i.posthog.com/capture/');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'collab_request_sent',
      distinct_id: 'user-42',
      properties: { request_id: 'r1', platform: 'ios', app_version: '1.0.0', source: 'server' },
    });
  });

  it('never throws when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { captureServer } = await load('phc_test');
    expect(() => captureServer('project_created', 'user-1', { project_id: 7 })).not.toThrow();
    await flush();
  });
});

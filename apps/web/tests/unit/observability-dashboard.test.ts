import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FUNNEL_EVENTS,
  __resetObservabilityCache,
  loadObservability,
  mapSentryIssues,
  posthogApiBase,
  sentryApiBase,
} from '@/lib/observability-dashboard';

const CONFIGURED = {
  SENTRY_DSN: 'https://abc@o4509.ingest.de.sentry.io/123',
  SENTRY_API_TOKEN: 'sntrys_test',
  SENTRY_ORG: 'influnet-65',
  SENTRY_PROJECT: 'influnet',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
  POSTHOG_PERSONAL_API_KEY: 'phx_test',
  POSTHOG_PROJECT_ID: '4242',
} as unknown as NodeJS.ProcessEnv;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetObservabilityCache();
});

describe('vendor API hosts', () => {
  it('queries an EU Sentry org on its region domain', () => {
    expect(sentryApiBase(CONFIGURED.SENTRY_DSN)).toBe('https://de.sentry.io');
    expect(sentryApiBase('https://k@o1.ingest.us.sentry.io/2')).toBe('https://us.sentry.io');
    expect(sentryApiBase(undefined)).toBe('https://sentry.io');
    expect(sentryApiBase(CONFIGURED.SENTRY_DSN, 'https://sentry.example.com/')).toBe('https://sentry.example.com');
  });

  it('queries PostHog on the app host, not the ingest host', () => {
    expect(posthogApiBase('https://eu.i.posthog.com')).toBe('https://eu.posthog.com');
    expect(posthogApiBase('https://us.i.posthog.com/')).toBe('https://us.posthog.com');
    expect(posthogApiBase(undefined)).toBe('https://us.posthog.com');
    expect(posthogApiBase('https://ph.self-hosted.dev')).toBe('https://ph.self-hosted.dev');
  });
});

describe('mapSentryIssues', () => {
  it('coerces string counts and flags issues first seen in the last day', () => {
    const now = Date.parse('2026-09-17T12:00:00Z');
    const [fresh, old] = mapSentryIssues(
      [
        { id: '1', shortId: 'INF-1', title: 'TypeError', count: '42', userCount: 3, firstSeen: '2026-09-17T08:00:00Z', lastSeen: '2026-09-17T11:00:00Z', level: 'error', permalink: 'https://x' },
        { id: '2', shortId: 'INF-2', title: 'Old', count: '1', userCount: 1, firstSeen: '2026-09-01T08:00:00Z', lastSeen: '2026-09-17T11:00:00Z' },
      ],
      now,
    );
    expect(fresh).toMatchObject({ count: 42, userCount: 3, isNew: true });
    expect(old).toMatchObject({ count: 1, isNew: false, level: 'error', permalink: null });
    expect(mapSentryIssues({ detail: 'nope' })).toEqual([]);
  });
});

describe('loadObservability', () => {
  it('makes no network call and names the missing variables when unconfigured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const snap = await loadObservability({ env: { NEXT_PUBLIC_POSTHOG_KEY: 'phc_x' } as unknown as NodeJS.ProcessEnv });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(snap.sentry).toMatchObject({ configured: false, ok: false });
    expect(snap.sentry.missing).toEqual(['SENTRY_API_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']);
    expect(snap.posthog.missing).toEqual(['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID']);
    expect(snap.posthog.reason).toMatch(/being captured/);
  });

  it('keeps one vendor failing from blanking the other', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('sentry.io')) return json({ detail: 'forbidden' }, 403);
        if (url.includes('/query/')) return json({ results: [] });
        throw new Error(`unexpected ${url}`);
      }),
    );

    const snap = await loadObservability({ env: CONFIGURED });

    expect(snap.sentry).toMatchObject({ configured: true, ok: false });
    expect(snap.sentry.reason).toMatch(/scope/);
    expect(snap.posthog.ok).toBe(true);
  });

  it('calls the right endpoints with the read tokens and shapes the panels', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.includes('sentry.io')) {
          return json([{ id: '9', shortId: 'INF-9', title: 'Boom', count: '5', userCount: 2, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), level: 'error' }]);
        }
        const q = JSON.parse(String(init.body)).query.query as string;
        if (q.includes('toDate(timestamp)')) return json({ results: [['2026-09-16', 7], ['2026-09-17', 9]] });
        if (q.includes('event IN')) return json({ results: [['signup_completed', 12, 10], ['project_created', 3, 2]] });
        return json({ results: [['LCP', 2100.5, 40, 300], ['__error__', 0, 4, 11]] });
      }),
    );

    const snap = await loadObservability({ env: CONFIGURED });

    const sentryCall = calls.find((c) => c.url.includes('sentry.io'))!;
    expect(sentryCall.url).toContain('https://de.sentry.io/api/0/organizations/influnet-65/issues/');
    expect(sentryCall.url).toContain('project=influnet');
    expect((sentryCall.init.headers as Record<string, string>).Authorization).toBe('Bearer sntrys_test');

    const phCalls = calls.filter((c) => c.url.includes('/query/'));
    expect(phCalls).toHaveLength(3);
    expect(phCalls[0].url).toBe('https://eu.posthog.com/api/projects/4242/query/');
    expect((phCalls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer phx_test');

    expect(snap.sentry.totals).toMatchObject({ unresolved: 1, newIn24h: 1, events24h: 5, usersAffected24h: 2 });
    expect(snap.sentry.dashboardUrl).toBe('https://influnet-65.sentry.io/issues/');
    expect(snap.posthog.activeUsers).toEqual([{ date: '2026-09-16', users: 7 }, { date: '2026-09-17', users: 9 }]);
    // Every funnel step is present, in order, zeros included.
    expect(snap.posthog.funnel.map((f) => f.event)).toEqual([...FUNNEL_EVENTS]);
    expect(snap.posthog.funnel.find((f) => f.event === 'deal_agreed')).toEqual({ event: 'deal_agreed', events: 0, users: 0 });
    expect(snap.posthog.webVitals).toEqual([{ metric: 'LCP', p75: 2100.5, samples: 300 }]);
    expect(snap.posthog.clientErrors24h).toBe(4);
  });

  it('reports a timeout as a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('The operation timed out');
        err.name = 'TimeoutError';
        throw err;
      }),
    );
    const snap = await loadObservability({ env: CONFIGURED });
    expect(snap.sentry.reason).toMatch(/did not answer/);
    expect(snap.posthog.reason).toMatch(/did not answer/);
  });
});

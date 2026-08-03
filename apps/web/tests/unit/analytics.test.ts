import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizePath } from '@/components/observability-provider';

/**
 * Analytics has one behaviour that matters more than any event it sends:
 * being switched off must cost nothing. If `NEXT_PUBLIC_POSTHOG_KEY` is
 * absent, `track()` must not import the SDK, not open a socket, and not throw
 * — because that is the state this code ships in.
 */

async function loadWithKey(key?: string) {
  vi.resetModules();
  if (key) process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
  else delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  return import('@/lib/analytics');
}

describe('analytics gating', () => {
  const original = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  afterEach(() => {
    if (original) process.env.NEXT_PUBLIC_POSTHOG_KEY = original;
    else delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  it('reports disabled and no-ops without a key', async () => {
    const mod = await loadWithKey(undefined);
    expect(mod.analyticsEnabled).toBe(false);

    expect(() => mod.track('signup_completed')).not.toThrow();
    expect(() => mod.trackPageView('/dashboard')).not.toThrow();
    expect(() => mod.identify('user-1', 'influencer')).not.toThrow();
    expect(() => mod.resetIdentity()).not.toThrow();
  });

  it('reports enabled once a key is present', async () => {
    const mod = await loadWithKey('phc_test_key');
    expect(mod.analyticsEnabled).toBe(true);
  });
});

describe('normalizePath', () => {
  // Usernames and ids in the path would make every profile and every project
  // its own row in the analytics report, which is unreadable AND leaks who was
  // looked at. Collapsing to the route shape is what makes the report useful.
  it('collapses creator and business profile paths', () => {
    expect(normalizePath('/c/priya')).toBe('/c/:username');
    expect(normalizePath('/b/acme-corp')).toBe('/b/:username');
  });

  it('collapses project, conversation and collab ids', () => {
    expect(normalizePath('/dashboard/projects/1842')).toBe('/dashboard/projects/:id');
    expect(normalizePath('/dashboard/conversations/abc-def')).toBe(
      '/dashboard/conversations/:id',
    );
    expect(normalizePath('/dashboard/collabs/99')).toBe('/dashboard/collabs/:id');
  });

  it('collapses verification and vanity paths', () => {
    expect(normalizePath('/vf/AB12CD')).toBe('/vf/:code');
    expect(normalizePath('/influnet/some-slug')).toBe('/influnet/:slug');
  });

  it('leaves static routes untouched', () => {
    expect(normalizePath('/dashboard')).toBe('/dashboard');
    expect(normalizePath('/login')).toBe('/login');
    expect(normalizePath('/dashboard/admin/support')).toBe('/dashboard/admin/support');
  });
});

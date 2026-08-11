/**
 * The Free/Pro split, tested at the two places it can actually leak:
 *
 *   1. the tier decision — which must fail CLOSED, unlike the rate limiter
 *      beside it, which deliberately fails open;
 *   2. the profile projection — which must be an allow-list, so a field added
 *      to the view model later is absent from the Free response until somebody
 *      classifies it.
 *
 * Both are regression tests for failure modes that are invisible in production:
 * a paywall that leaks does not throw, does not log, and looks exactly like a
 * paywall that works.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasFeature, isOverLimit, formatPrice, GATED_FEATURES } from '@influnet/core';

// ─────────────────────────────────────────────────────────────────────────────
describe('hasFeature', () => {
  it('gives Pro every gated feature', () => {
    for (const f of GATED_FEATURES) expect(hasFeature('pro', f)).toBe(true);
  });

  it('withholds the depth features from Free', () => {
    expect(hasFeature('free', 'search.browse')).toBe(false);
    expect(hasFeature('free', 'profile.audience')).toBe(false);
    expect(hasFeature('free', 'profile.mediakit')).toBe(false);
    expect(hasFeature('free', 'analytics.full')).toBe(false);
  });

  it('lets Free create projects and send requests — those are metered, not forbidden', () => {
    // The distinction matters: a metered feature answers "yes" here and is
    // refused at the ceiling by the quota check. If these returned false, a
    // Free user could never create their FIRST project.
    expect(hasFeature('free', 'projects.create')).toBe(true);
    expect(hasFeature('free', 'requests.send')).toBe(true);
  });

  it('treats an unknown tier as holding nothing', () => {
    expect(hasFeature('enterprise' as any, 'search.browse')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('isOverLimit', () => {
  it('treats null as unlimited — this is how Pro is expressed', () => {
    expect(isOverLimit(9_999, null)).toBe(false);
  });

  it('blocks AT the limit, not past it', () => {
    // 2 of 2 used means the next one is the third. Off-by-one here would hand
    // out one free project per account, forever.
    expect(isOverLimit(1, 2)).toBe(false);
    expect(isOverLimit(2, 2)).toBe(true);
    expect(isOverLimit(3, 2)).toBe(true);
  });

  it('blocks immediately on a zero limit', () => {
    expect(isOverLimit(0, 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('formatPrice', () => {
  it('renders ₹999 from paise without a decimal tail', () => {
    expect(formatPrice(99_900)).toBe('₹999');
  });

  it('keeps two decimal places when the amount has paise', () => {
    // Money shows both digits or neither — "₹999.5" reads as a truncation bug.
    expect(formatPrice(99_950)).toBe('₹999.50');
  });

  it('groups in the Indian system, not thousands', () => {
    // 1234567 paise = ₹12,345.67 — en-IN groups as 12,345 not 12,345 the
    // western way at this magnitude, and larger values differ more.
    expect(formatPrice(1_00_00_000)).toBe('₹1,00,000');
  });

  it('falls back to a suffix for non-INR', () => {
    expect(formatPrice(1000, 'USD')).toBe('10 USD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The projection. Imported lazily because it pulls in the web app's path
// aliases, which the core tests above do not need.
describe('toFreeProfileView', () => {
  let toFreeProfileView: typeof import('@/lib/public-profile/tier-projection')['toFreeProfileView'];

  beforeEach(async () => {
    ({ toFreeProfileView } = await import('@/lib/public-profile/tier-projection'));
  });

  /** A view with every premium field populated, so their absence is meaningful. */
  function fullView(): any {
    return {
      name: 'Aditi R',
      username: 'aditi',
      avatarUrl: null,
      subtitleLead: 'Fashion',
      subtitleAccent: 'Creator',
      tagline: 'tag',
      location: 'Chennai',
      languages: ['Tamil'],
      niches: ['fashion'],
      instagramHandle: 'aditi',
      youtubeHandle: null,
      profileUrl: 'https://x/aditi',
      isVerified: true,
      ownershipVerified: true,
      reviews: { count: 3, average: 4.7 },
      heroStats: [{ label: 'Followers', value: '120K' }],
      platformCards: [],
      stats: [],
      featured: [],
      videos: [],
      portfolio: [],
      pastCollaborations: ['Nike'],
      collabTypes: ['reel'],
      usingMock: false,
      snapshotAge: '2d',
      packages: [],

      // Premium — none of these may survive the projection.
      audience: {
        locations: [{ label: 'India', pct: 72 }],
        ages: [{ label: '18-24', pct: 40 }],
        genders: [{ label: 'F', pct: 61 }],
        interests: [{ label: 'Beauty', pct: 30 }],
      },
      contact: [{ kind: 'email', value: 'aditi@example.com' }],
      priceLabel: '₹25K+',
      postPreview: { url: 'https://x/p/1' },
    };
  }

  it('omits every premium field from the Free view', () => {
    const free = toFreeProfileView(fullView()) as any;

    // Absent, not null and not empty — a key that is present with a falsy value
    // still tells the client the field exists, and a blurred-out value is one
    // CSS property away from being read.
    expect('audience' in free).toBe(false);
    expect('contact' in free).toBe(false);
    expect('priceLabel' in free).toBe(false);
    expect('postPreview' in free).toBe(false);
  });

  it('keeps identity, reach and trust signals', () => {
    const free = toFreeProfileView(fullView()) as any;
    expect(free.name).toBe('Aditi R');
    expect(free.heroStats).toHaveLength(1);
    // Verification and ratings are never gated: a trust signal only paying
    // viewers can see is not a trust signal.
    expect(free.isVerified).toBe(true);
    expect(free.reviews).toEqual({ count: 3, average: 4.7 });
    expect(free.portfolio).toEqual([]);
  });

  it('excludes a NEW field by default — the allow-list property', () => {
    // This is the whole reason the projection is an allow-list. Someone adds a
    // field to CreatorProfileView six months from now and does not think about
    // tiers; it must not ship to Free until a human classifies it.
    const withNewField = { ...fullView(), audienceQualityScore: 91 };
    const free = toFreeProfileView(withNewField) as any;
    expect('audienceQualityScore' in free).toBe(false);
  });

  it('advertises only the locked sections that actually have content', () => {
    const free = toFreeProfileView(fullView()) as any;
    expect(free.lockedSections).toEqual(['audience', 'contact', 'rate']);
  });

  it('advertises nothing when the creator filled none of it in', () => {
    // Otherwise Pro looks emptier than it is the first time someone pays to
    // look at a sparse profile.
    const sparse = {
      ...fullView(),
      audience: { locations: [], ages: [], genders: [], interests: [] },
      contact: [],
      priceLabel: null,
    };
    const free = toFreeProfileView(sparse) as any;
    expect(free.lockedSections).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('resolveEntitlements', () => {
  const ORIGINAL = process.env.SUBSCRIPTIONS_ENABLED;

  afterEach(() => {
    process.env.SUBSCRIPTIONS_ENABLED = ORIGINAL;
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    return import('@/lib/entitlements');
  }

  function clientReturning(result: { data: any; error: any }) {
    return { rpc: vi.fn().mockResolvedValue(result) } as any;
  }

  it('gives everyone unlimited Pro when subscriptions are switched off', async () => {
    process.env.SUBSCRIPTIONS_ENABLED = 'false';
    const { resolveEntitlements } = await load();
    const supabase = clientReturning({ data: null, error: new Error('should not be called') });

    const ent = await resolveEntitlements(supabase, 'user-1');

    expect(ent.tier).toBe('pro');
    expect(ent.limits.activeProjects).toBeNull();
    // The flag being off must be visible to the client, so the UI can hide
    // pricing and badges rather than showing an unlocked padlock.
    expect(ent.subscriptionsEnabled).toBe(false);
    // And the database is never consulted — one code path, no per-route branch.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED to free when the entitlement lookup errors', async () => {
    // The deliberate opposite of lib/rate-limit.ts, which fails open. A paying
    // brand losing Pro for a moment is a support ticket; a free account gaining
    // it is an invisible, unbounded leak.
    process.env.SUBSCRIPTIONS_ENABLED = 'true';
    const { resolveEntitlements } = await load();
    const supabase = clientReturning({ data: null, error: { message: 'connection reset' } });

    const ent = await resolveEntitlements(supabase, 'user-2');

    expect(ent.tier).toBe('free');
    expect(ent.subscriptionsEnabled).toBe(true);
  });

  it('fails closed when the RPC throws rather than returning an error', async () => {
    process.env.SUBSCRIPTIONS_ENABLED = 'true';
    const { resolveEntitlements } = await load();
    const supabase = { rpc: vi.fn().mockRejectedValue(new Error('boom')) } as any;

    const ent = await resolveEntitlements(supabase, 'user-3');
    expect(ent.tier).toBe('free');
  });

  it('does not cache a failure — the next call retries', async () => {
    // Caching the fallback would turn a one-second blip into a full minute of
    // downgraded paying customers.
    process.env.SUBSCRIPTIONS_ENABLED = 'true';
    const { resolveEntitlements } = await load();

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'blip' } })
      .mockResolvedValueOnce({
        data: { tier: 'pro', status: 'active', limits: {}, usage: {}, price: {} },
        error: null,
      });
    const supabase = { rpc } as any;

    expect((await resolveEntitlements(supabase, 'user-4')).tier).toBe('free');
    expect((await resolveEntitlements(supabase, 'user-4')).tier).toBe('pro');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('caches a success, so a hot path does not hit the database every request', async () => {
    process.env.SUBSCRIPTIONS_ENABLED = 'true';
    const { resolveEntitlements } = await load();
    const rpc = vi.fn().mockResolvedValue({
      data: { tier: 'pro', status: 'active', limits: {}, usage: {}, price: {} },
      error: null,
    });
    const supabase = { rpc } as any;

    await resolveEntitlements(supabase, 'user-5');
    await resolveEntitlements(supabase, 'user-5');

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('invalidateEntitlements drops the cache, so an upgrade is visible at once', async () => {
    process.env.SUBSCRIPTIONS_ENABLED = 'true';
    const { resolveEntitlements, invalidateEntitlements } = await load();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { tier: 'free', status: 'inactive', limits: {}, usage: {}, price: {} },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { tier: 'pro', status: 'active', limits: {}, usage: {}, price: {} },
        error: null,
      });
    const supabase = { rpc } as any;

    expect((await resolveEntitlements(supabase, 'u6')).tier).toBe('free');
    invalidateEntitlements('u6');
    expect((await resolveEntitlements(supabase, 'u6')).tier).toBe('pro');
  });
});

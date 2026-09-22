// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { resolveProfileLayout } from '@influnet/core';
import { buildCreatorProfileView, type RawPublicProfile } from '@/lib/public-profile/creator-profile';
import { projectProfileForTier } from '@/lib/public-profile/tier-projection';

/**
 * The public profile as a visitor, as its owner, and inside the app's WebView.
 * The owner path is the one nobody else can exercise without a real login: it
 * must preview every choice live and send exactly what was chosen on Publish.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiFetch = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('@/lib/hooks/use-link-click', () => ({ useLinkClick: () => () => {} }));
vi.mock('@/components/public-profile/editorial/fonts', () => ({ fontVars: '' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src, alt: p.alt }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { href, ...rest }, children as never),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const IG = (code: string) => `https://www.instagram.com/p/${code}/`;

function view(overrides: Partial<RawPublicProfile> = {}) {
  const raw: RawPublicProfile = {
    userId: 'u1',
    name: 'Madan Gowri',
    username: 'madangowri',
    bio: 'Tamil content creator.',
    city: 'Chennai',
    state: 'Tamil Nadu',
    languages: ['Tamil', 'English'],
    niche: ['Entertainment', 'Comedy'],
    collabTypes: ['Reel'],
    pricingMin: 1000,
    pricingMax: 5000,
    ...overrides,
  };
  const built = buildCreatorProfileView(raw, {
    useMock: false,
    origin: 'https://influnet.io',
    instagram: {
      followerCount: 2_855_152,
      postsCount: 700,
      avgViews: 1_337_507,
      engagementRate: 10.7,
      isVerified: false,
      profilePicUrl: null,
      fetchedAt: null,
      posts: [
        { url: IG('AAA'), thumbUrl: 'https://img.test/a.jpg', views: 5_063_553, likes: 1, type: 'Video', caption: 'Dedicated to every fan #fans' },
        { url: IG('BBB'), thumbUrl: 'https://img.test/b.jpg', views: 100, likes: 1, type: 'Video', caption: 'Small one' },
      ],
    },
    reviews: { count: 1, average: 5, items: [{ id: 'r1', rating: 5, comment: 'Smooth collaboration.', reviewerName: 'Jupiter Media', createdAt: null }] },
    portfolio: [
      {
        id: '1', source: 'platform', verified: true, title: 'x', brandName: 'AuraGold', description: null,
        platform: 'other', contentUrl: null, thumbnailUrl: null, views: null, happenedAt: '2026-03-26T00:00:00Z',
      },
    ],
  });
  return projectProfileForTier(built, false);
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(props: Record<string, unknown>) {
  const { default: EditorialProfile } = await import('@/components/public-profile/editorial/editorial-profile');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      createElement(EditorialProfile as never, {
        data: view(),
        layout: resolveProfileLayout({}),
        isOwner: false,
        ctaHref: '/signup?next=/madangowri',
        ctaLabel: 'Send a request',
        collaborationStats: { partners: 1, projectsTotal: 1, projectsActive: 0, projectsCompleted: 1, firstCollabAt: null, lastCollabAt: null },
        ...props,
      }),
    );
  });
  return host;
}

const text = () => host!.textContent ?? '';
const button = (label: string) =>
  [...host!.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const click = async (el: Element) => act(async () => (el as HTMLElement).click());

beforeEach(() => apiFetch.mockReset());
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('public profile — visitor', () => {
  it('shows every section with real data and a working request button', async () => {
    await render({});
    for (const s of ['Madan Gowri', 'What Madan makes', 'Track record', 'AuraGold', 'What brands say', 'Work with Madan', 'Planning a campaign? Ask Madan.']) {
      expect(text()).toContain(s);
    }
    // Numbers appear once each, distinct.
    expect(text().match(/Instagram followers/gi)?.length).toBe(1);
    expect([...host!.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/signup?next=/madangowri')).toBe(true);
    expect(text()).not.toContain('Customize');
  });

  it('never invents a rate card for a creator who has not set their formats', async () => {
    const { default: EditorialProfile } = await import('@/components/public-profile/editorial/editorial-profile');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        createElement(EditorialProfile as never, {
          data: view({ collabTypes: [] }),
          layout: resolveProfileLayout({}),
          isOwner: false,
          ctaHref: '#',
          ctaLabel: 'Send a request',
        }),
      );
    });
    expect(text()).not.toContain('Work with Madan');
    expect(text()).not.toContain('₹25,000+');
  });
});

describe('public profile — owner', () => {
  it('previews choices live and publishes exactly what was chosen', async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      error: null,
      requestId: null,
      data: path === '/api/profile/layout' ? { layout: JSON.parse(String(init!.body)) } : null,
    }));
    await render({ isOwner: true, ctaHref: '/dashboard/settings', ctaLabel: 'Edit profile' });

    await click(button('Customize'));
    expect(text()).toContain('Pick a design for each section');
    expect(button('Publish').disabled).toBe(true);

    await click(button('Showreel'));
    expect(text()).toContain('Watch the work'); // the showreel opening is now on the page
    expect(text()).toContain('Unpublished changes');

    // Feature the small post only.
    const pick = host!.querySelector('button[aria-label^="Feature \\"Small one"]') as HTMLElement;
    await click(pick);
    expect(text()).toContain('Chosen by Madan');

    const note = host!.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(note, 'Let us build something.');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(text()).toContain('Let us build something.');

    await click(button('Publish'));
    const calls = apiFetch.mock.calls.filter(([p]) => p === '/api/profile/layout');
    expect(calls).toHaveLength(1);
    const [, init] = calls[0];
    expect(init.method).toBe('PUT');
    const sent = JSON.parse(init.body);
    expect(sent.sections.hero).toBe('showreel');
    expect(sent.featured).toEqual([IG('BBB')]);
    expect(sent.closingNote).toBe('Let us build something.');
    expect(text()).toContain('Your public page'); // nothing left unpublished
  });

  it('Discard puts the published layout back', async () => {
    await render({ isOwner: true, ctaHref: '/dashboard/settings', ctaLabel: 'Edit profile' });
    await click(button('Customize'));
    await click(button('Magazine cover'));
    expect(text()).toContain('See the work');
    await click(button('Discard'));
    expect(text()).not.toContain('See the work');
    expect(apiFetch.mock.calls.filter(([p]) => p === '/api/profile/layout')).toHaveLength(0);
  });
});

describe('public profile — inside the app', () => {
  it('has no site chrome, request buttons or owner controls', async () => {
    await render({ embedded: true, isOwner: true });
    expect(text()).not.toContain('Send a request');
    expect(text()).not.toContain('Customize');
    expect(text()).not.toContain('WhatsApp');
    expect(text()).toContain('What Madan makes');
  });
});

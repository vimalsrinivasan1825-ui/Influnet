import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_LAYOUT_SECTIONS,
  MAX_CLOSING_NOTE,
  MAX_FEATURED_POSTS,
  applyProfileDesignParam,
  profileDesignParam,
  profilePostKey,
  resolveProfileLayout,
  sanitizeProfileLayout,
} from '@influnet/core';
import type { ShowcaseItem } from '@/lib/public-profile/creator-profile';
import {
  groupBookedBrands,
  otherBrands,
  pickHeroPost,
  pickWork,
} from '@/lib/public-profile/profile-layout-view';
import type { PublicPortfolioItem } from '@/lib/public-profile/get-portfolio';

const item = (key: string, over: Partial<ShowcaseItem> = {}): ShowcaseItem => ({
  key,
  kind: key.startsWith('yt:') ? 'youtube' : 'instagram',
  url: key.startsWith('yt:')
    ? `https://www.youtube.com/watch?v=${key.slice(3)}`
    : `https://www.instagram.com/p/${key.slice(3)}/`,
  thumbUrl: `https://img.test/${key}.jpg`,
  title: key,
  views: 0,
  viewsLabel: null,
  takenAt: null,
  isVideo: true,
  ...over,
});

describe('profilePostKey', () => {
  it('treats reel, post and tracking-param variants of one Instagram post as the same key', () => {
    expect(profilePostKey('https://www.instagram.com/reel/DbV0zC-PaD9/?igsh=abc')).toBe('ig:DbV0zC-PaD9');
    expect(profilePostKey('https://instagram.com/p/DbV0zC-PaD9')).toBe('ig:DbV0zC-PaD9');
  });
  it('reads YouTube watch, shorts and youtu.be links', () => {
    expect(profilePostKey('https://www.youtube.com/watch?v=e1EZwaA2kEc')).toBe('yt:e1EZwaA2kEc');
    expect(profilePostKey('https://youtube.com/shorts/e1EZwaA2kEc')).toBe('yt:e1EZwaA2kEc');
    expect(profilePostKey('https://youtu.be/e1EZwaA2kEc')).toBe('yt:e1EZwaA2kEc');
  });
  it('rejects anything that is not a public post link', () => {
    expect(profilePostKey('javascript:alert(1)')).toBeNull();
    expect(profilePostKey('http://www.instagram.com/p/abc/')).toBeNull();
    expect(profilePostKey('https://evil.test/p/abc')).toBeNull();
    expect(profilePostKey('https://www.instagram.com/madangowri/')).toBeNull();
    expect(profilePostKey(42)).toBeNull();
  });
});

describe('sanitizeProfileLayout', () => {
  it('keeps known designs and drops unknown sections and designs', () => {
    const out = sanitizeProfileLayout({
      sections: { hero: 'cover', stats: 'nope', admin: 'yes', work: 'reel' },
    });
    expect(out.sections).toEqual({ hero: 'cover', work: 'reel' });
  });
  it('dedupes, validates and caps featured links', () => {
    const links = Array.from({ length: 20 }, (_, i) => `https://www.instagram.com/p/post${i}/`);
    const out = sanitizeProfileLayout({
      featured: ['https://www.instagram.com/p/post0/', ...links, 'https://evil.test/x', 7],
    });
    expect(out.featured).toHaveLength(MAX_FEATURED_POSTS);
    expect(new Set(out.featured!.map(profilePostKey)).size).toBe(MAX_FEATURED_POSTS);
  });
  it('trims, collapses and caps the closing note', () => {
    const out = sanitizeProfileLayout({ closingNote: `  Hello \n\n\n world ${'x'.repeat(400)}` });
    expect(out.closingNote!.startsWith('Hello world')).toBe(true);
    expect(out.closingNote!.length).toBe(MAX_CLOSING_NOTE);
    expect(sanitizeProfileLayout({ closingNote: '   ' }).closingNote).toBeNull();
  });
  it('turns garbage into an empty layout rather than throwing', () => {
    for (const junk of [null, 'x', 3, [], { sections: 'x', featured: 'y' }]) {
      expect(() => sanitizeProfileLayout(junk)).not.toThrow();
    }
  });
  it('fills every section with its default when nothing is stored', () => {
    expect(resolveProfileLayout({}).sections).toEqual(DEFAULT_PROFILE_LAYOUT_SECTIONS);
    expect(resolveProfileLayout({ sections: { hero: 'showreel' } }).sections.hero).toBe('showreel');
  });
});

describe('pickWork', () => {
  const showcase = [
    item('ig:a', { views: 100 }),
    item('ig:b', { views: 5_000 }),
    item('yt:c1234567', { views: 900 }),
    item('pf:1', { kind: 'portfolio', url: null, views: null }),
  ];

  it('without picks: the creator’s own portfolio first, then most watched', () => {
    expect(pickWork(showcase, []).map((i) => i.key)).toEqual(['pf:1', 'ig:b', 'yt:c1234567', 'ig:a']);
  });
  it('with picks: exactly those, in the order chosen, skipping posts no longer captured', () => {
    const picks = [
      'https://www.youtube.com/watch?v=c1234567',
      'https://www.instagram.com/p/gone/',
      'https://www.instagram.com/reel/a/',
    ];
    expect(pickWork(showcase, picks).map((i) => i.key)).toEqual(['yt:c1234567', 'ig:a']);
  });
  it('falls back to automatic when every pick has disappeared', () => {
    expect(pickWork(showcase, ['https://www.instagram.com/p/gone/'])[0].key).toBe('pf:1');
  });
});

describe('pickHeroPost', () => {
  it('uses the chosen post, else the most-watched Instagram post', () => {
    const showcase = [item('ig:a', { views: 10 }), item('ig:b', { views: 99 }), item('yt:zzzzzzzz', { views: 1e6 })];
    expect(pickHeroPost(showcase, null)!.key).toBe('ig:b');
    expect(pickHeroPost(showcase, 'https://youtu.be/zzzzzzzz')!.key).toBe('yt:zzzzzzzz');
    expect(pickHeroPost([], null)).toBeNull();
  });
});

describe('groupBookedBrands', () => {
  const pf = (brand: string, at: string, source: 'platform' | 'manual' = 'platform'): PublicPortfolioItem => ({
    id: `${brand}-${at}`,
    source,
    verified: source === 'platform',
    title: 't',
    brandName: brand,
    description: null,
    platform: 'other',
    contentUrl: null,
    thumbnailUrl: null,
    views: null,
    happenedAt: at,
  });

  it('merges repeat brands, counts them, and ignores self-reported entries', () => {
    const rows = groupBookedBrands([
      pf('Jupiter Media Audit', '2026-07-29'),
      pf('jupiter media audit ', '2026-08-13'),
      pf('AuraGold', '2026-03-26'),
      pf('Made Up Co', '2026-09-01', 'manual'),
    ]);
    expect(rows).toEqual([
      { name: 'Jupiter Media Audit', count: 2, latestAt: '2026-08-13' },
      { name: 'AuraGold', count: 1, latestAt: '2026-03-26' },
    ]);
    expect(otherBrands(['AuraGold', 'Nykaa'], rows)).toEqual(['Nykaa']);
  });
});

describe('design preview param', () => {
  it('round-trips section designs', () => {
    const base = resolveProfileLayout({});
    const param = profileDesignParam({ hero: 'cover', work: 'grid' });
    expect(param).toBe('hero:cover,work:grid');
    const out = applyProfileDesignParam(base, param);
    expect(out.sections).toEqual({ ...DEFAULT_PROFILE_LAYOUT_SECTIONS, hero: 'cover', work: 'grid' });
  });

  it('ignores unknown sections and designs, and never carries text or posts', () => {
    const base = resolveProfileLayout({ closingNote: 'mine', featured: ['https://instagram.com/p/abc'] });
    const out = applyProfileDesignParam(base, 'hero:evil,bogus:card,closer:centered,closingNote:hi');
    expect(out.sections.hero).toBe('card');
    expect(out.sections.closer).toBe('centered');
    expect(out.closingNote).toBe('mine');
    expect(out.featured).toEqual(['https://instagram.com/p/abc']);
  });

  it('leaves the layout alone for empty or oversized input', () => {
    const base = resolveProfileLayout({});
    expect(applyProfileDesignParam(base, undefined)).toBe(base);
    expect(applyProfileDesignParam(base, 'x'.repeat(301))).toBe(base);
  });
});

/**
 * Turns a creator's saved layout (packages/core/src/profile-layout.ts) plus
 * their real content into what each section actually shows.
 *
 * Pure and shared by the server render and the owner's live preview, so what
 * the creator sees while choosing is exactly what visitors get after publish.
 */
import { MAX_FEATURED_POSTS, isSectionVisible, profilePostKey, type ProfileSectionVisibility } from '@influnet/core';
import type { CreatorProfileView, ShowcaseItem } from './creator-profile';
import type { PublicPortfolioItem } from './get-portfolio';

const byViews = (a: ShowcaseItem, b: ShowcaseItem) => (b.views ?? -1) - (a.views ?? -1);

/**
 * The work section.
 *
 * With picks: exactly those, in the creator's order. A pick whose post has
 * since dropped out of the captured snapshot is skipped rather than shown as
 * a broken tile.
 *
 * Without picks: the creator's own portfolio entries first (they chose those
 * too), then their best-performing posts and videos by views.
 */
export function pickWork(
  showcase: ShowcaseItem[],
  featured: string[],
  max = MAX_FEATURED_POSTS,
): ShowcaseItem[] {
  if (featured.length) {
    const byKey = new Map(showcase.map((item) => [item.key, item]));
    const picked: ShowcaseItem[] = [];
    for (const link of featured) {
      const item = byKey.get(profilePostKey(link) ?? '');
      if (item && !picked.includes(item)) picked.push(item);
    }
    if (picked.length) return picked.slice(0, max);
  }
  const own = showcase.filter((i) => i.kind === 'portfolio');
  const rest = showcase.filter((i) => i.kind !== 'portfolio').sort(byViews);
  return [...own, ...rest].slice(0, max);
}

/**
 * The post shown large in the cover and showreel openings: the creator's pick,
 * else their most-watched post that has an image. Instagram first because both
 * designs frame it portrait.
 */
export function pickHeroPost(showcase: ShowcaseItem[], heroPost: string | null): ShowcaseItem | null {
  const withThumb = showcase.filter((i) => i.thumbUrl);
  if (heroPost) {
    const key = profilePostKey(heroPost);
    const chosen = withThumb.find((i) => i.key === key);
    if (chosen) return chosen;
  }
  const ig = withThumb.filter((i) => i.kind === 'instagram').sort(byViews);
  return ig[0] ?? [...withThumb].sort(byViews)[0] ?? null;
}

export interface BookedBrand {
  name: string;
  /** Completed Influnet projects with this brand. */
  count: number;
  latestAt: string | null;
}

/**
 * Brands that booked the creator through Influnet, one row per brand.
 * Only completed platform projects count — these are the verified ones.
 */
export function groupBookedBrands(portfolio: PublicPortfolioItem[]): BookedBrand[] {
  const map = new Map<string, BookedBrand>();
  for (const item of portfolio) {
    if (item.source !== 'platform' || !item.brandName) continue;
    const key = item.brandName.trim().toLowerCase();
    const row = map.get(key);
    if (row) {
      row.count += 1;
      if (item.happenedAt && (!row.latestAt || item.happenedAt > row.latestAt)) row.latestAt = item.happenedAt;
    } else {
      map.set(key, { name: item.brandName.trim(), count: 1, latestAt: item.happenedAt });
    }
  }
  return [...map.values()].sort((a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? ''));
}

/** Self-reported brands not already verified above, for a quieter "also worked with" line. */
export function otherBrands(pastCollaborations: string[], booked: BookedBrand[]): string[] {
  const verified = new Set(booked.map((b) => b.name.toLowerCase()));
  return pastCollaborations.filter((name) => !verified.has(name.trim().toLowerCase())).slice(0, 12);
}

/**
 * Apply the creator's show/hide switches (migration 088) to a built view.
 *
 * The switches hide CONTENT, not the numbers derived alongside it: follower
 * count, engagement and audience come off the same snapshots and stay visible
 * with "Recent posts" switched off. The showcase is the same posts, videos and
 * portfolio entries merged for the section designs, so the same switches apply.
 *
 * One function for every surface that renders a profile (the public page, the
 * creators API behind the search overlay and the app, the dashboard preview),
 * so none of them can forget a switch.
 */
export function applySectionVisibility(
  view: CreatorProfileView,
  visibility: ProfileSectionVisibility | null | undefined,
): void {
  const ig = isSectionVisible(visibility, 'instagram_posts');
  const yt = isSectionVisible(visibility, 'youtube_videos');
  const pf = isSectionVisible(visibility, 'portfolio');
  if (!ig) view.featured = [];
  if (!yt) view.videos = [];
  if (!pf) view.portfolio = [];
  view.showcase = view.showcase.filter((item) =>
    item.kind === 'instagram' ? ig : item.kind === 'youtube' ? yt : pf,
  );
}

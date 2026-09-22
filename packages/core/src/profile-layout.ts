/**
 * How a creator has chosen to lay out their public profile (migration 173).
 *
 * The page has a FIXED order of sections — hero, numbers, work, brands,
 * testimonials, rates, closing note — and each section offers a few designs.
 * The creator picks one per section, plus which posts to feature and the text
 * of their closing note. Everything else (the data in each section) still comes
 * from the real snapshots and completed projects; a layout can change how a
 * fact is presented, never what the fact is.
 *
 * Stored as one JSONB blob on influencer_profiles.profile_layout. A missing
 * key means "use the default", so an untouched profile ('{}') renders the
 * defaults and a new section or design can be added without a backfill.
 *
 * The blob is creator-written, so everything that reads it goes through
 * `sanitizeProfileLayout` first: unknown sections and designs are dropped,
 * featured links must be real Instagram/YouTube URLs, and the closing note is
 * trimmed and length-capped. Shared so web, mobile and the API route can never
 * disagree about what a stored value means.
 */

export const PROFILE_LAYOUT_VARIANTS = {
  hero: ['card', 'cover', 'showreel'],
  stats: ['tiles', 'ledger', 'ticker'],
  work: ['masonry', 'grid', 'reel'],
  brands: ['timeline', 'ledger', 'pills'],
  testimonials: ['spotlight', 'quote', 'accent'],
  rates: ['rows', 'cards', 'menu'],
  closer: ['slab', 'centered'],
} as const;

export type ProfileLayoutSection = keyof typeof PROFILE_LAYOUT_VARIANTS;
export type ProfileLayoutVariant<S extends ProfileLayoutSection = ProfileLayoutSection> =
  (typeof PROFILE_LAYOUT_VARIANTS)[S][number];

/** Page order. Structural, not creator-configurable. */
export const PROFILE_LAYOUT_ORDER: readonly ProfileLayoutSection[] = [
  'hero',
  'stats',
  'work',
  'brands',
  'testimonials',
  'rates',
  'closer',
];

export type ProfileLayoutSections = { [S in ProfileLayoutSection]: ProfileLayoutVariant<S> };

export const DEFAULT_PROFILE_LAYOUT_SECTIONS: ProfileLayoutSections = {
  hero: 'card',
  stats: 'tiles',
  work: 'masonry',
  brands: 'timeline',
  testimonials: 'spotlight',
  rates: 'rows',
  closer: 'slab',
};

/** Most posts a creator can pin to the work section. */
export const MAX_FEATURED_POSTS = 9;
/** Longest closing note, in characters. */
export const MAX_CLOSING_NOTE = 160;

export interface ProfileLayout {
  sections?: Partial<ProfileLayoutSections>;
  /** Post links in the creator's chosen order. Empty = pick automatically. */
  featured?: string[];
  /** The post shown large in the hero (cover and showreel designs). */
  heroPost?: string | null;
  /** The creator's own words for the closing section. */
  closingNote?: string | null;
}

/** A fully-resolved layout: every section has a design, nothing is undefined. */
export interface ResolvedProfileLayout {
  sections: ProfileLayoutSections;
  featured: string[];
  heroPost: string | null;
  closingNote: string | null;
}

export const PROFILE_LAYOUT_LABELS: {
  [S in ProfileLayoutSection]: { title: string; variants: Record<ProfileLayoutVariant<S>, string> };
} = {
  hero: { title: 'Opening', variants: { card: 'Visiting card', cover: 'Magazine cover', showreel: 'Showreel' } },
  stats: { title: 'Numbers', variants: { tiles: 'Tiles', ledger: 'Ledger line', ticker: 'Ticker' } },
  work: { title: 'Reels and videos', variants: { masonry: 'Collage', grid: 'Grid with tabs', reel: 'Sideways reel' } },
  brands: { title: 'Brands', variants: { timeline: 'Timeline', ledger: 'Ledger', pills: 'Name tags' } },
  testimonials: { title: 'Testimonials', variants: { spotlight: 'Spotlight card', quote: 'Big quote', accent: 'Side rule' } },
  rates: { title: 'Rates', variants: { rows: 'Rows', cards: 'Cards', menu: 'Price list' } },
  closer: { title: 'Closing note', variants: { slab: 'Colour block', centered: 'Centred' } },
};

function isVariant<S extends ProfileLayoutSection>(section: S, value: unknown): value is ProfileLayoutVariant<S> {
  return typeof value === 'string' && (PROFILE_LAYOUT_VARIANTS[section] as readonly string[]).includes(value);
}

/**
 * Normalise a post link to a stable key, or null if it is not a public
 * Instagram post/reel or YouTube video. The key is what the renderer matches
 * against snapshot URLs, so `https://www.instagram.com/reel/X/?igsh=…` and
 * `https://instagram.com/p/X` count as the same post.
 */
export function profilePostKey(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  if (host === 'instagram.com') {
    const m = url.pathname.match(/^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return m ? `ig:${m[1]}` : null;
  }
  if (host === 'youtube.com') {
    const v = url.searchParams.get('v');
    if (url.pathname === '/watch' && v && /^[A-Za-z0-9_-]{6,20}$/.test(v)) return `yt:${v}`;
    const m = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,20})/);
    return m ? `yt:${m[1]}` : null;
  }
  if (host === 'youtu.be') {
    const m = url.pathname.match(/^\/([A-Za-z0-9_-]{6,20})/);
    return m ? `yt:${m[1]}` : null;
  }
  return null;
}

/** Strip anything that is not a known section, design, post link or note. */
export function sanitizeProfileLayout(raw: unknown): ProfileLayout {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: ProfileLayout = {};

  const rawSections = input.sections;
  if (rawSections && typeof rawSections === 'object' && !Array.isArray(rawSections)) {
    const sections: Partial<Record<ProfileLayoutSection, string>> = {};
    for (const section of PROFILE_LAYOUT_ORDER) {
      const v = (rawSections as Record<string, unknown>)[section];
      if (isVariant(section, v)) sections[section] = v;
    }
    if (Object.keys(sections).length) out.sections = sections as Partial<ProfileLayoutSections>;
  }

  if (Array.isArray(input.featured)) {
    const seen = new Set<string>();
    const featured: string[] = [];
    for (const link of input.featured) {
      const key = profilePostKey(link);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      featured.push((link as string).trim());
      if (featured.length >= MAX_FEATURED_POSTS) break;
    }
    out.featured = featured;
  }

  if (input.heroPost === null) out.heroPost = null;
  else if (profilePostKey(input.heroPost)) out.heroPost = (input.heroPost as string).trim();

  if (input.closingNote === null) out.closingNote = null;
  else if (typeof input.closingNote === 'string') {
    // Collapse whitespace so a note can't be padded into a wall of blank lines.
    const note = input.closingNote.replace(/\s+/g, ' ').trim().slice(0, MAX_CLOSING_NOTE);
    out.closingNote = note || null;
  }

  return out;
}

/** Fill every gap with the default, after sanitising. */
export function resolveProfileLayout(raw: unknown): ResolvedProfileLayout {
  const clean = sanitizeProfileLayout(raw);
  return {
    sections: { ...DEFAULT_PROFILE_LAYOUT_SECTIONS, ...clean.sections },
    featured: clean.featured ?? [],
    heroPost: clean.heroPost ?? null,
    closingNote: clean.closingNote ?? null,
  };
}

/**
 * Section designs as a URL value — `hero:cover,work:grid` — for previewing a
 * layout that is not published yet. The mobile editor loads the real web page
 * in a WebView with `?app=1&design=…`, because the page is the only renderer.
 *
 * Only DESIGNS travel this way, never the closing note or featured posts: a
 * design can change how a creator's facts look, but a crafted link must not be
 * able to put words or posts on somebody else's page.
 */
export function profileDesignParam(sections: Partial<ProfileLayoutSections>): string {
  return PROFILE_LAYOUT_ORDER.filter((s) => sections[s])
    .map((s) => `${s}:${sections[s]}`)
    .join(',');
}

/** Applies a `design` value over a resolved layout. Unknown pairs are ignored. */
export function applyProfileDesignParam(layout: ResolvedProfileLayout, param: unknown): ResolvedProfileLayout {
  if (typeof param !== 'string' || !param || param.length > 300) return layout;
  const raw: Record<string, string> = {};
  for (const pair of param.split(',')) {
    const [section, variant] = pair.split(':');
    if (section && variant) raw[section] = variant;
  }
  const clean = sanitizeProfileLayout({ sections: raw });
  return clean.sections ? { ...layout, sections: { ...layout.sections, ...clean.sections } } : layout;
}

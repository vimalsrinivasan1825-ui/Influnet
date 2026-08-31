/**
 * What a project looks like, classified from what it is called.
 *
 * ── KEEP IN SYNC WITH MOBILE ──────────────────────────────────────────
 *
 * This is a verbatim mirror of `apps/mobile/lib/project-icon.ts`. The two
 * clients have to classify a project identically or the same project wears a
 * different face on web and on the phone. It is pure — no React, no
 * React Native — so a copy is cheaper than a shared package and there is
 * nothing here to diverge except the keyword list, which must be edited in
 * both files together.
 *
 * ── WHY A PROJECT NEEDS A FACE ────────────────────────────────────────
 *
 * `campaign_projects` has no image column, so every project in a list is a
 * title, a name and a progress bar — three lines of text, repeated. Nothing
 * about "Diwali mega reel" is visually distinguishable from "Skincare product
 * promo" until you read both, and a list you have to read is a list you scroll
 * past.
 *
 * ── WHY THE ICON IS CLASSIFIED AND NOT HASHED ─────────────────────────
 *
 * The avatar colours elsewhere in this app are hashed: a person's colour only
 * has to be STABLE and DISTINCT, and it cannot mean anything, because there is
 * nothing about a person for it to mean.
 *
 * A project is different — it has a subject, and the subject is usually in the
 * title. So this reads the title and picks an icon that says what the work IS.
 * Two skincare campaigns then look like two skincare campaigns, which is a fact
 * worth showing; hashing them would have made them differ for no reason and
 * taught the user that the icon means nothing.
 *
 * The colour rides with the category for the same reason. It is not the role
 * accent: a screen of projects all in the signed-in user's pink is one pink
 * smear, and the accent's job on that screen is the buttons.
 *
 * ── WHEN IT DOESN'T MATCH ─────────────────────────────────────────────
 *
 * Having no subject in the title is common and legitimate ("August
 * collaboration", "Jupiter Media Audit — collaboration", "Round 2"), and the
 * classifier must not invent one: telling someone their media audit is about
 * food is worse than saying nothing.
 *
 * But ONE shared fallback is its own failure — every unmatched project drew the
 * identical slate folder, so eight generically-titled projects were eight
 * identical rows, which is exactly the unreadable list the icon exists to
 * prevent. So the fallback is a neutral GRID: six palettes crossed with six
 * subject-free glyphs, indexed by a hash of the project's id.
 *
 * Six of each rather than one list of six because the two are chosen
 * INDEPENDENTLY: a single list gives six possible looks and collides constantly
 * on a list of eight, while crossing them gives 36 and collides rarely. Nothing
 * in the grid claims a subject — a folder, a briefcase, a crate are all "some
 * piece of work" — so no fact is asserted that the title didn't support.
 *
 * That is the one place a hash is correct here, and the distinction is worth
 * keeping straight: a MATCHED project's look is meaning (two skincare campaigns
 * look alike because they are alike); an UNMATCHED project's look is only
 * identity.
 *
 * ── WHY THE DESCRIPTION IS NOT READ ───────────────────────────────────
 *
 * It used to be part of the haystack, and it cost a day. Descriptions are long
 * free text, so their odds of holding a stray keyword are far higher than a
 * title's, and a wrong match is silent. Every seeded demo project carries
 * "[home-demo] active work seeded for the Home review." — the word "home" — so
 * all of them classified as furniture and the whole app went green, on projects
 * whose titles said "Media Audit" and "delivered campaign".
 *
 * A title is what a project is called; a description is prose about it. Only
 * the first is a name, so only the first is classified.
 */

/** The subjects a title can be recognised as. `general` means "not one of these". */
export type ProjectCategory =
  | 'video'
  | 'beauty'
  | 'fashion'
  | 'footwear'
  | 'food'
  | 'travel'
  | 'tech'
  | 'fitness'
  | 'jewellery'
  | 'home'
  | 'general';

/**
 * Which glyph to draw.
 *
 * Separate from the category because for a classified project the two are the
 * same thing, while for an unclassified one the glyph and the colour are picked
 * independently — see the grid note at the top.
 */
export type ProjectGlyph =
  | ProjectCategory
  | 'briefcase'
  | 'clipboard'
  | 'crate'
  | 'megaphone'
  | 'spark';

export interface ProjectLook {
  category: ProjectCategory;
  glyph: ProjectGlyph;
  /** Soft ground for the roundel. */
  bg: string;
  /** Ink for the glyph, dark enough to read on `bg`. */
  fg: string;
  /** The two stops of the generated cover, for the detail hero. */
  cover: [string, string];
}

type Palette = Pick<ProjectLook, 'bg' | 'fg' | 'cover'>;

/**
 * Keyword → category, in priority order.
 *
 * Order matters and is not alphabetical: the list is walked top-down and the
 * first hit wins, so the more specific categories sit above the ones whose
 * words they contain. "Sneaker launch reel" is footwear before it is video,
 * because the subject is the shoe and the reel is only the format — and format
 * words appear in a large share of titles, so `video` last is what keeps it
 * from swallowing everything.
 */
const KEYWORDS: readonly (readonly [ProjectCategory, readonly string[]])[] = [
  ['beauty', ['skincare', 'skin care', 'beauty', 'cosmetic', 'makeup', 'serum', 'lipstick', 'haircare', 'shampoo', 'fragrance', 'perfume']],
  ['footwear', ['sneaker', 'shoe', 'footwear', 'boot', 'sandal', 'trainer']],
  ['fashion', ['fashion', 'apparel', 'clothing', 'outfit', 'saree', 'kurta', 'denim', 'wardrobe', 'style', 'ethnic']],
  ['jewellery', ['jewel', 'jewellery', 'jewelry', 'gold', 'diamond', 'necklace', 'earring', 'bangle']],
  ['food', ['food', 'restaurant', 'cafe', 'recipe', 'snack', 'beverage', 'coffee', 'tea', 'sweet', 'bakery', 'cracker', 'biryani']],
  ['travel', ['travel', 'trip', 'hotel', 'resort', 'tourism', 'vacation', 'flight', 'stay']],
  ['tech', ['tech', 'gadget', 'phone', 'mobile', 'laptop', 'app', 'software', 'electronic', 'headphone', 'earbud']],
  ['fitness', ['fitness', 'gym', 'workout', 'yoga', 'protein', 'health', 'wellness', 'supplement']],
  ['home', ['home', 'furniture', 'decor', 'kitchen', 'appliance', 'interior']],
  ['video', ['reel', 'video', 'shoot', 'film', 'vlog', 'youtube', 'short', 'unboxing', 'review']],
] as const;

/**
 * Palettes per recognised category.
 *
 * Each `bg`/`fg` pair clears 4.5:1 — these carry a glyph that has to be
 * identifiable, not merely visible. `cover` is a saturated pair for the detail
 * hero, which carries white artwork instead and wants the opposite contrast.
 */
const CATEGORY_PALETTE: Record<Exclude<ProjectCategory, 'general'>, Palette> = {
  video: { bg: '#FFE4EC', fg: '#C2185B', cover: ['#C2185B', '#F26E59'] },
  beauty: { bg: '#E8E4FF', fg: '#5B34C7', cover: ['#6D28D9', '#A855F7'] },
  fashion: { bg: '#FFE3D6', fg: '#C2410C', cover: ['#C2410C', '#F97316'] },
  footwear: { bg: '#FFF0D6', fg: '#B45309', cover: ['#B45309', '#F59E0B'] },
  food: { bg: '#FDE8D8', fg: '#9A3412', cover: ['#9A3412', '#EA580C'] },
  travel: { bg: '#DCEEFF', fg: '#1D4ED8', cover: ['#1D4ED8', '#38BDF8'] },
  tech: { bg: '#E2E8F0', fg: '#334155', cover: ['#334155', '#64748B'] },
  fitness: { bg: '#D6F5EA', fg: '#0F766E', cover: ['#0F766E', '#14B8A6'] },
  jewellery: { bg: '#FFF4D6', fg: '#A16207', cover: ['#A16207', '#EAB308'] },
  home: { bg: '#E2F0D9', fg: '#3F6212', cover: ['#3F6212', '#84CC16'] },
};

/**
 * The neutral half of the grid: colours that carry no category meaning.
 *
 * Deliberately more muted than the category palettes above. On a mixed list
 * that reads correctly — the projects we actually know something about are the
 * ones that stand out, and the rest are told apart without shouting.
 */
const NEUTRAL_PALETTE: readonly Palette[] = [
  { bg: '#EDF0F5', fg: '#475569', cover: ['#475569', '#94A3B8'] },
  { bg: '#E4EEFF', fg: '#3B5BA9', cover: ['#3B5BA9', '#7DA0DC'] },
  { bg: '#EDE7FB', fg: '#5B4B9C', cover: ['#5B4B9C', '#9585CE'] },
  { bg: '#E2F1EE', fg: '#3B6F66', cover: ['#3B6F66', '#79AFA5'] },
  { bg: '#F7E9E4', fg: '#8C5340', cover: ['#8C5340', '#C08B76'] },
  { bg: '#F1ECE0', fg: '#6B6042', cover: ['#6B6042', '#A99C79'] },
];

/** The neutral glyphs. Every one means "a piece of work" and nothing narrower. */
const NEUTRAL_GLYPH: readonly ProjectGlyph[] = [
  'general', 'briefcase', 'clipboard', 'crate', 'megaphone', 'spark',
];

/**
 * FNV-1a. Small, dependency-free, and — the part that matters — STABLE: the
 * same project id yields the same look on the list, on the project's own
 * screen, and after a reinstall. A random pick would reshuffle a user's
 * projects on every render.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Classify a project from its title.
 *
 * Matching is on whole words rather than substrings. "Reelected" contains
 * "reel" and "Chennai" contains "hen"; a substring match would classify a
 * political campaign as a video shoot and be very hard to explain afterwards.
 *
 * `seed` is the project's id. It is used ONLY when the title matches nothing,
 * to pick this project's cell of the neutral grid — see the note at the top.
 * Callers should always pass it: without one every unmatched project collapses
 * onto the same slate folder, which is the behaviour this replaced.
 *
 * It is typed `string | number` on purpose: `campaign_projects.id` is a bigint,
 * so a list response hands it over as a NUMBER while a route param hands over a
 * string. `hash()` does string work, and on a number it reads `.length` as
 * undefined, never loops, and returns the FNV offset basis unchanged — the same
 * constant for every project. That is why an un-normalised list showed one
 * identical periwinkle megaphone on every row while the detail screen, fed the
 * string route param, looked fine. Normalise here, once.
 */
export function lookForProject(
  title?: string | null,
  seed?: string | number | null,
): ProjectLook {
  const haystack = ` ${title ?? ''} `
    .toLowerCase()
    // Every non-letter becomes a space, so word boundaries are just spaces and
    // the check below is a plain `includes` on a padded string.
    .replace(/[^a-z]+/g, ' ');

  for (const [category, words] of KEYWORDS) {
    if (words.some((w) => haystack.includes(` ${w} `))) {
      return { category, glyph: category, ...CATEGORY_PALETTE[category as Exclude<ProjectCategory, 'general'>] };
    }
  }

  const key = seed == null ? '' : String(seed);
  if (!key) {
    return { category: 'general', glyph: 'general', ...NEUTRAL_PALETTE[0] };
  }

  // Colour and glyph off different parts of the same hash, so they vary
  // independently and the grid is 36 cells rather than 6.
  const h = hash(key);
  const palette = NEUTRAL_PALETTE[h % NEUTRAL_PALETTE.length];
  const glyph = NEUTRAL_GLYPH[Math.floor(h / NEUTRAL_PALETTE.length) % NEUTRAL_GLYPH.length];
  return { category: 'general', glyph, ...palette };
}

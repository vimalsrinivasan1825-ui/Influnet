/**
 * What a project looks like, classified from what it is called.
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
 * `general` is a real answer, not a failure. Plenty of titles ("August
 * collaboration", "Round 2") genuinely have no subject in them, and a folder
 * in neutral slate is the honest way to say so — better than forcing one of
 * the specific icons and telling someone their beauty campaign is about food.
 */

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

export interface ProjectLook {
  category: ProjectCategory;
  /** Soft ground for the roundel. */
  bg: string;
  /** Ink for the glyph, dark enough to read on `bg`. */
  fg: string;
  /** The two stops of the generated cover, for the detail hero. */
  cover: [string, string];
}

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
 * Palettes per category.
 *
 * Each `bg`/`fg` pair clears 4.5:1 — these carry a glyph that has to be
 * identifiable, not merely visible. `cover` is a saturated pair for the detail
 * hero, which carries white artwork instead and wants the opposite contrast.
 */
const LOOKS: Record<ProjectCategory, Omit<ProjectLook, 'category'>> = {
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
  general: { bg: '#EDF0F5', fg: '#475569', cover: ['#475569', '#94A3B8'] },
};

/**
 * Classify a project from its title (and description, when there is one).
 *
 * Matching is on whole words rather than substrings. "Reelected" contains
 * "reel" and "Chennai" contains "hen"; a substring match would classify a
 * political campaign as a video shoot and be very hard to explain afterwards.
 */
export function lookForProject(title?: string | null, description?: string | null): ProjectLook {
  const haystack = ` ${(title ?? '')} ${(description ?? '')} `
    .toLowerCase()
    // Every non-letter becomes a space, so word boundaries are just spaces and
    // the check below is a plain `includes` on a padded string.
    .replace(/[^a-z]+/g, ' ');

  for (const [category, words] of KEYWORDS) {
    if (words.some((w) => haystack.includes(` ${w} `))) {
      return { category, ...LOOKS[category] };
    }
  }
  return { category: 'general', ...LOOKS.general };
}

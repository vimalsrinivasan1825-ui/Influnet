/**
 * @influnet/tokens — the design tokens shared by web and mobile.
 *
 * These values mirror the custom properties in apps/web/src/app/globals.css.
 * That file stays the web's runtime source (Tailwind reads CSS vars), but the
 * numbers live here so the mobile app is not re-typing hex codes that drift.
 *
 * Role accents work the same way they do on web: the shell picks a palette by
 * role and every primitive re-tints itself off `brand*`.
 */

export const palette = {
  /**
   * The page ground.
   *
   * Deepened from #f6f7f9 as part of the flat redesign. Against a white card
   * that was roughly a 3% luminance step — barely a visible edge on a phone in
   * daylight — and it only ever read as a surface because the brand wash used
   * to sit on top of it. With the wash gone, the ground has to do that work
   * itself, and it does it together with the card shadows below: neither is
   * enough alone.
   */
  surface: '#f2f4f8',
  surfaceCard: '#ffffff',
  surfaceMuted: '#f8fafc',

  hairline: '#eef0f4',
  hairlineStrong: '#e3e6ec',

  content: '#0f172a',
  contentSoft: '#475569',
  contentMuted: '#94a3b8',

  ok: '#16a34a',
  okSoft: '#f0fdf4',
  warn: '#d97706',
  warnSoft: '#fffbeb',
  info: '#2563eb',
  infoSoft: '#eff6ff',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',

  // Ownership-verification trust mark. Fixed and role-independent — sampled
  // from the Influnet logo mark itself, deliberately NOT tied to `brand`
  // (which recolors per role: pink for business, purple for creator). A
  // verified badge must look the same to everyone, and must read as
  // "Influnet confirmed this," not as generic UI chrome or the ordinary
  // `ok`/success green used for unrelated positive states.
  verified: '#FF0B8D',
  verifiedSoft: '#FFE4F3',

  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

export interface BrandAccent {
  brand: string;
  brand2: string;
  brandStrong: string;
  brandSoft: string;
  brandRing: string;
}

/** Per-role accents — same three themes as .theme-* on the web shell. */
export const accents = {
  /** Business / default. */
  brand: {
    brand: '#ee3e96',
    brand2: '#f26e59',
    brandStrong: '#d6358a',
    brandSoft: '#fdf2f8',
    brandRing: 'rgba(238, 62, 150, 0.35)',
  },
  creator: {
    brand: '#7c3aed',
    brand2: '#8b5cf6',
    brandStrong: '#6d28d9',
    brandSoft: '#f5f3ff',
    brandRing: 'rgba(124, 58, 237, 0.35)',
  },
  admin: {
    brand: '#6366f1',
    brand2: '#8b5cf6',
    brandStrong: '#4f46e5',
    brandSoft: '#eef2ff',
    brandRing: 'rgba(99, 102, 241, 0.35)',
  },
} as const satisfies Record<string, BrandAccent>;

export type AccentName = keyof typeof accents;

/** Map an app role onto its accent. Mirrors ROLE_META on the web sidebar. */
export function accentForRole(role?: string | null): BrandAccent {
  switch (role) {
    case 'influencer':
      return accents.creator;
    case 'admin':
      return accents.admin;
    default:
      return accents.brand;
  }
}

/**
 * 4-pt spacing grid. `screen` is the standard horizontal gutter — every screen
 * body uses it so content lines up across the whole app.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  screen: 16,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Mobile type scale. Larger than the web dashboard's dense 14px baseline —
 * body text is 16px because phone reading distance and small glyphs don't mix.
 */
export const typography = {
  /**
   * The screen-opening headline. Bigger and heavier than `display`, and the
   * only place in the app that gets this much weight — a screen with two of
   * these has neither.
   *
   * Tracking is negative because at 30pt the default letter-spacing reads
   * loose and web-like; large type needs less air between glyphs, not more.
   */
  hero: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title1: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  title2: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

/**
 * Shadows as RN style objects. iOS reads shadow*, Android reads elevation —
 * both are set so a card looks raised on either platform.
 */
export const shadows = {
  /**
   * The default card elevation — every card gets it.
   *
   * It used to be 5% opacity at 3px, applied only to the two or three cards
   * per screen that passed `raised`. That is invisible on a phone, so cards
   * and page were telling apart by a hairline border alone, and after the
   * gradient wash was removed the whole app read as one flat white sheet.
   *
   * Web can express this as two stacked shadows — a tight contact shadow plus
   * a wider ambient one. React Native takes a single shadow per view, so the
   * numbers here are the compromise that reads closest to that pair: enough
   * radius to be an ambient falloff, enough opacity to survive an outdoor
   * screen, and a 1px offset so it still reads as contact rather than glow.
   *
   * `elevation` is Android's own renderer and is NOT derived from the iOS
   * numbers — it is tuned separately, because a given elevation draws heavier
   * on Android than the equivalent iOS shadow.
   */
  card: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** For a card that has to sit above its neighbours — a decision, a milestone. */
  raised: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pop: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

/** Minimum tappable size. Anything interactive must meet this. */
export const HIT_SLOP_MIN = 44;

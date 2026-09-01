/**
 * Generated cover art for anything that has no image.
 *
 * ── WHY NOT A PLACEHOLDER LIBRARY ─────────────────────────────────────
 *
 * The obvious options all fetch: DiceBear's hosted API, picsum.photos,
 * unsplash source URLs. Every one of them is a network round trip per card, on
 * a screen that already competes for bandwidth with real data, and every one is
 * a blank grey rectangle on a bad connection or in an airport — which is worse
 * than no image at all, because a broken image reads as a broken app. They also
 * mean shipping an outbound request per campaign to a third party, from a
 * screen full of a user's own commercial pipeline.
 *
 * The bundled alternatives are worse in a different way. A folder of stock
 * illustrations is megabytes in the app, repeats visibly across a list of six,
 * and dates the whole product the moment the illustration style does.
 *
 * So the art is generated, locally, from the row's own id. Everything below is
 * react-native-svg, which is already a dependency.
 *
 * ── WHAT IT ACTUALLY DRAWS ────────────────────────────────────────────
 *
 * A two-stop diagonal wash with a few soft overlaid circles. Not an attempt at
 * a photograph and not an attempt at a picture of anything — deliberately
 * abstract, because abstract art that is obviously decorative reads as a
 * designed empty slot, while a bad illustration of a product reads as the wrong
 * product.
 *
 * Three properties make it work as a system rather than as noise:
 *
 *  1. **Deterministic.** The same id always yields the same art, so a campaign
 *     looks the same on Home, in the list, and on its own page. Random art per
 *     render would make the same campaign unrecognisable between two screens
 *     and would flicker on every re-render.
 *  2. **Off the role accent.** The palette is a fixed six-hue table, not
 *     `brand`. A grid of six cards all in the signed-in user's accent is a
 *     single pink smear with no card boundaries; the accent's job on this
 *     screen is the buttons, and art that competes with it weakens both.
 *  3. **Always paired with a glyph.** The wash alone is wallpaper. The mark on
 *     top — the campaign's platform, or a fallback — is the part that carries
 *     meaning, and it is why this is better than a real but arbitrary stock
 *     photo, which carries meaning that is actively wrong.
 */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { hashSeed } from '@/lib/seed';

/**
 * Six palettes, each a light-to-mid pair that stays readable under white text
 * and under a dark glyph. Fixed, and deliberately not the role accent — see
 * note 2 above.
 */
const PALETTES: readonly (readonly [string, string])[] = [
  ['#FFE4EC', '#FFB4CE'], // rose
  ['#E8E4FF', '#C0B4FF'], // violet
  ['#DFF1FF', '#A9D8FF'], // sky
  ['#E2F7EC', '#A8E6C6'], // mint
  ['#FFF0DC', '#FFD59E'], // amber
  ['#FDE6DC', '#F9BCA0'], // clay
] as const;

/** Shared with the avatar palette — see lib/seed.ts for why it is a real hash. */
const hash = hashSeed;

/** Deterministic 0–1 stream from one seed, so each blob differs from the last. */
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    // xorshift32 — small, fast, and good enough for placing four circles.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

/** The palette a given seed always resolves to. Exported so callers can tint
 *  a matching chip or border without re-deriving the hash. */
export function coverPalette(seed: string): readonly [string, string] {
  return PALETTES[hash(seed) % PALETTES.length];
}

export function CoverArt({
  seed,
  width,
  height,
  radius = 0,
  colors,
  children,
  style,
}: {
  /** Stable identity — a row id. NOT a title: two campaigns can share a title. */
  seed: string;
  width: number;
  height: number;
  radius?: number;
  /**
   * Override the palette.
   *
   * The seeded pick is right when the only requirement is "distinct and
   * stable" — campaign cards, where nothing about the row could determine a
   * colour. A project CAN determine one: its category does (see
   * lib/project-icon.ts), and a classified colour beats a random one because
   * it means something. Passing `colors` is how that gets to say so.
   */
  colors?: [string, string];
  /** The glyph laid over the wash. See note 3 above — the wash alone is wallpaper. */
  children?: ReactNode;
  style?: ViewStyle;
}) {
  // The seed still drives the BLOB placement even when the palette is given,
  // so two projects in one category share a colour and not a composition.
  const [from, to] = colors ?? coverPalette(seed);
  const h = hash(seed);
  const next = rng(h);
  const id = `cover${h.toString(36)}`;

  // Four blobs is the number that reads as texture. Three looks like a mistake
  // someone made; six turns into mud at card size.
  const blobs = Array.from({ length: 4 }, () => ({
    cx: next() * width,
    cy: next() * height,
    // Generous relative to the box — small circles on a wash look like dust.
    r: (0.18 + next() * 0.3) * Math.max(width, height),
    o: 0.1 + next() * 0.16,
  }));

  return (
    <View
      style={[
        { width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: from },
        style,
      ]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
        {blobs.map((b, i) => (
          <Circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="#ffffff" opacity={b.o} />
        ))}
      </Svg>

      {children ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

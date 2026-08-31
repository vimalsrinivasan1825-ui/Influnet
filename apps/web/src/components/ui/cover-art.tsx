/**
 * Generated cover art for anything that has no image — the web twin of
 * `apps/mobile/components/ui/cover-art.tsx`, same palettes and same maths so a
 * campaign wears the same face on both.
 *
 * A two-stop diagonal wash with a few soft overlaid circles, seeded on the
 * row's own id. Deterministic (a campaign looks the same in the list and on its
 * own page), off the role accent (a grid of cards all in the user's pink is one
 * smear), and meant to be paired with a glyph on top — the wash alone is
 * wallpaper. The `campaigns` table has no image column; this is why there is
 * something to look at anyway.
 */

import type { CSSProperties, ReactNode } from "react";

/** Six light→mid pairs, readable under white text and a dark glyph. */
const PALETTES: readonly (readonly [string, string])[] = [
  ["#FFE4EC", "#FFB4CE"], // rose
  ["#E8E4FF", "#C0B4FF"], // violet
  ["#DFF1FF", "#A9D8FF"], // sky
  ["#E2F7EC", "#A8E6C6"], // mint
  ["#FFF0DC", "#FFD59E"], // amber
  ["#FDE6DC", "#F9BCA0"], // clay
] as const;

/** FNV-1a, matches lib/project-icon.ts and mobile lib/seed.ts. */
function hash(seed: string | number): number {
  const s = typeof seed === "string" ? seed : String(seed ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 0–1 stream — xorshift32, good enough to place four circles. */
function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

/** The palette a seed always resolves to — exported so a chip can match. */
export function coverPalette(seed: string | number): readonly [string, string] {
  return PALETTES[hash(seed) % PALETTES.length];
}

export function CoverArt({
  seed,
  className,
  style,
  colors,
  children,
}: {
  /** Stable identity — a row id, not a title. */
  seed: string | number;
  className?: string;
  style?: CSSProperties;
  /** Override the seeded palette (a classified project passes its category pair). */
  colors?: readonly [string, string];
  /** The glyph laid over the wash. */
  children?: ReactNode;
}) {
  const [from, to] = colors ?? coverPalette(seed);
  const h = hash(seed);
  const next = rng(h);
  const id = `cover-${h.toString(36)}`;

  // Four blobs reads as texture; three looks like a mistake, six turns to mud.
  const blobs = Array.from({ length: 4 }, () => ({
    cx: next() * 100,
    cy: next() * 100,
    r: (0.18 + next() * 0.3) * 100,
    o: 0.1 + next() * 0.16,
  }));

  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden", background: from, ...style }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
        {blobs.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="#ffffff" opacity={b.o} />
        ))}
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}

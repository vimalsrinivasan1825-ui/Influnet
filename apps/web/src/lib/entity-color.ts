/**
 * A stable, distinct color for a person or brand — the WhatsApp trick.
 *
 * Every avatar on the dashboard used to fall back to the same brand-gradient
 * monogram, so a list of ten different brands read as ten identical purple
 * circles with different letters. WhatsApp (and every contacts app since)
 * solves this by hashing the name into a fixed palette: no state, no
 * coordination between components, and the same name always lands on the same
 * color — which is what makes it useful as an identity cue rather than
 * decoration. Deterministic hashing means an avatar and a chart legend entry
 * for "Jupiter Media" land on the same color for free, without either one
 * knowing the other exists.
 *
 * Plain, framework-free values on purpose: this runs from a server route
 * (bucketing an earnings chart by brand) as often as from a component.
 */

/**
 * Ten solid, saturated hues, evenly spaced around the wheel (roughly 36° apart)
 * on purpose — the earlier version packed sky/blue/indigo into one 40° wedge,
 * so three unrelated brands landing anywhere in that wedge all read as "blue".
 * Each is picked for readable white text on top, and for staying distinct from
 * the semantic palette (--ok/--warn/--danger) so a colored avatar or chart line
 * is never mistaken for a status indicator.
 */
export const ENTITY_PALETTE = [
  "#F04438", // red
  "#F79009", // amber
  "#66C61C", // lime
  "#12B76A", // emerald
  "#0E9384", // teal
  "#2E90FA", // blue
  "#7A5AF8", // violet
  "#C11574", // magenta
  "#F63D68", // rose
  "#EF6820", // orange
  "#667085", // slate — the fallback for an empty/unknown name
] as const;

/** djb2 — small, fast, and stable across JS engines (no Math.random, no Date). */
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * The color for a given identity key (a name, a brand, a username). Same
 * input always produces the same output — that stability is the entire point.
 */
export function colorForKey(key: string | null | undefined): string {
  const k = (key ?? "").trim();
  if (!k) return ENTITY_PALETTE[ENTITY_PALETTE.length - 1];
  return ENTITY_PALETTE[hash(k) % (ENTITY_PALETTE.length - 1)];
}

/**
 * Colors for a SET of keys shown together — a chart's series, a legend — where
 * two colliding on the same hue is a real problem rather than a coincidence
 * nobody will notice. colorForKey alone can't promise that: with eleven slots
 * and a handful of names in one chart, two different brands landing on the
 * same bucket is common, not rare, and the result is a chart where "every line
 * is blue" regardless of how well-spaced the palette is.
 *
 * Each key keeps its normal hashed color UNLESS that color was already taken
 * by an earlier key in the same call, in which case it walks forward to the
 * next free slot. So a brand's color is still stable and still matches its
 * avatar elsewhere in the common case (no collision), and only shifts when
 * sharing a chart with something that hashed to the same place.
 */
/**
 * A hand-ordered sequence for multi-series charts, alternating warm and cool
 * hues (red → blue → green → violet → orange → teal → magenta → lime → rose →
 * amber) so that ANY run of consecutive picks off the front is well-spread.
 *
 * colorsForKeys (hash + collision-walk) is the right tool when a color needs
 * to be the SAME thing everywhere — an avatar today, the same avatar next
 * week. A chart doesn't need that: it needs "these N lines look like N
 * different things" to be true on every render, for every combination of
 * names that happens to hash together, and a five-color subset drawn from an
 * 11-color wheel by hash can still land all five within one warm quadrant —
 * distinct in the strict sense (colorsForKeys' collision walk guarantees
 * that), but not distinct at a glance, which is what a chart is actually for.
 * Picking by POSITION instead of by hash removes that risk entirely, at the
 * cost of a brand's line no longer matching its avatar's color — the
 * trade this function makes on purpose for anything with more than ~2 series.
 */
const CHART_SEQUENCE = [
  "#F04438", // red
  "#2E90FA", // blue
  "#12B76A", // emerald
  "#7A5AF8", // violet
  "#EF6820", // orange
  "#0E9384", // teal
  "#C11574", // magenta
  "#66C61C", // lime
  "#F63D68", // rose
  "#F79009", // amber
] as const;

export function chartSeriesColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => CHART_SEQUENCE[i % CHART_SEQUENCE.length]);
}

export function colorsForKeys(keys: (string | null | undefined)[]): string[] {
  const usable = ENTITY_PALETTE.length - 1; // last slot is the empty-name fallback, never assigned here
  const used = new Set<number>();
  const result: string[] = [];

  for (const key of keys) {
    const k = (key ?? "").trim();
    let idx = k ? hash(k) % usable : usable - 1;

    for (let attempts = 0; used.has(idx) && attempts < usable; attempts++) {
      idx = (idx + 1) % usable;
    }

    used.add(idx);
    result.push(ENTITY_PALETTE[idx]);
  }
  return result;
}

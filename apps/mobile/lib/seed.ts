/**
 * Deterministic hashing for anything that has to pick a stable colour.
 *
 * FNV-1a, 32-bit. A real hash rather than summing char codes: sums collide
 * constantly on ids that share characters — which is exactly what a column of
 * UUIDs from one table does — and the result is six people in a list wearing
 * the same colour.
 *
 * `>>> 0` after each step keeps it unsigned. JS bitwise operators produce
 * SIGNED 32-bit integers, and a negative value here would index off the front
 * of whatever palette array it is used against.
 *
 * Shared so that a person's colour is the same everywhere it is derived, and
 * so there is one place to look when asking why something is the colour it is.
 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Pick from a palette by seed. Same seed, same entry, forever. */
export function pickBySeed<T>(palette: readonly T[], seed: string): T {
  return palette[hashSeed(seed) % palette.length];
}

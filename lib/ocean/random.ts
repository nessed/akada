/**
 * Randomness for the ocean, all of it reproducible.
 *
 * The fan's `seedFrom` folds everything into fewer than a thousand values,
 * which is plenty for one drawing and far too few for an ocean that names
 * thousands of animals: two sittings would keep meeting the same creature.
 * Everything here works on full 32-bit seeds instead, and nothing reads the
 * clock or `Math.random`, so the same key always rolls the same sea.
 */

export type Rand = () => number;

/**
 * A 32-bit hash of any mix of strings and numbers: FNV-1a over the parts,
 * then the murmur finaliser so neighbouring inputs (slot 41, slot 42) land
 * nowhere near each other.
 */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? String(part) : part;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // A separator, so ('ab', 'c') and ('a', 'bc') differ.
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A small, fast generator with a full 32-bit state. */
export function mulberry32(seed: number): Rand {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (r: Rand, a: number, b: number) => a + (b - a) * r();
export const int = (r: Rand, a: number, b: number) => Math.floor(range(r, a, b + 1));
export const chance = (r: Rand, p: number) => r() < p;

/** One of `[value, weight]` pairs, in proportion to the weights. */
export function weighted<T>(r: Rand, options: [T, number][]): T {
  const total = options.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  let x = r() * total;
  for (const [value, w] of options) {
    x -= Math.max(0, w);
    if (x <= 0) return value;
  }
  return options[options.length - 1][0];
}

/** An index into `weights`, in proportion to them. */
export function pickIndex(r: Rand, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

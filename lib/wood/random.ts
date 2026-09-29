/**
 * The wood's dice.
 *
 * Everything in the wood is rolled, and everything rolled has to come back
 * the same: a reload mid-sitting, the still frame behind the log sheet and
 * the line on it all rebuild the wood from its key rather than remember it.
 * So nothing here touches Math.random.
 *
 * `seedFrom` in lib/fan.ts is not used for this. It folds into 997 values,
 * which is plenty for one tree and far too few for a wood: a sitting rolls
 * thousands of things, and with 997 seeds two of them would be the same
 * animal every few minutes.
 */

/**
 * A 32-bit hash of any run of parts. FNV-1a over the characters, with a
 * separator after each part so ('ab', 'c') and ('a', 'bc') differ, then
 * murmur3's finaliser to spread the bits, because FNV alone leaves the low
 * bits of short, similar keys (slot 41, slot 42) too alike.
 */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** One number in [0, 1) from a hash of the parts. */
export function unit(...parts: (string | number)[]): number {
  return hash32(...parts) / 4294967296;
}

/** Mulberry32: small, fast, and good enough that a wood looks unplanned. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Dice {
  /** [0, 1). */
  next(): number;
  /** [a, b). */
  range(a: number, b: number): number;
  /** a to b, both ends included. */
  int(a: number, b: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** One of the options, each as likely as its weight. */
  weighted<T>(options: readonly (readonly [T, number])[]): T;
}

export function dice(seed: number): Dice {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),
    chance: (p) => r() < p,
    pick: (items) => items[Math.min(items.length - 1, Math.floor(r() * items.length))],
    weighted: (options) => {
      let total = 0;
      for (const [, w] of options) total += Math.max(0, w);
      let x = r() * total;
      for (const [value, w] of options) {
        x -= Math.max(0, w);
        if (x < 0) return value;
      }
      return options[options.length - 1][0];
    },
  };
}

/**
 * The long tail. Rank k (from 0) is seen in proportion to 1/(k+1)^s, so a
 * pool of twelve has three or four animals met every sitting and a handful
 * met once in a long while. Nothing is marked rare: rarity is only ever how
 * seldom something turns up.
 */
export function zipf(n: number, s = 1.15): number[] {
  const w = Array.from({ length: n }, (_, k) => 1 / Math.pow(k + 1, s));
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / total);
}

/** Pick an index from normalised weights with a number in [0, 1). */
export function pickIndex(weights: readonly number[], x: number): number {
  let left = x;
  for (let i = 0; i < weights.length; i++) {
    left -= weights[i];
    if (left < 0) return i;
  }
  return weights.length - 1;
}

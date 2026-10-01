/**
 * The hero jelly's body, and its family.
 *
 * The plain jellyfish drawing is always the same animal. In the ocean it is
 * not: its tentacle count, arms, fringe, the shape of its bell and a shift in
 * its colour are all rolled from the sitting, and each new block's jelly is
 * the child of the last one, a little different. A long sitting's jellies
 * drift, block by block, into something the first one would not recognise.
 */

import { hash32, int, mulberry32, range } from './random';

export interface JellyGenome {
  tentacles: number;
  hairs: number;
  arms: number;
  /** Bell height against its width, about 1 for today's jelly. */
  aspect: number;
  /** Lobes on the rim. */
  scallops: number;
  /** Share of tentacles strung with stinging cells. */
  stingP: number;
  /** Which pastel the course colour leans toward, and how far. */
  hue: number;
  hueMix: number;
  /** The oral arms' length against the plain jelly's (`JellyBody.armLength`). */
  armLength: number;
  /** How deep the rim's lobes are cut against the plain jelly's (`JellyBody.lobeDepth`). */
  lobeDepth: number;
}

/** Exactly the jelly the plain "jellyfish" option has always drawn. */
export const DEFAULT_JELLY: JellyGenome = {
  tentacles: 16,
  hairs: 15,
  arms: 4,
  aspect: 1,
  scallops: 16,
  stingP: 0.4,
  hue: 0,
  hueMix: 0,
  armLength: 1,
  lobeDepth: 1,
};

export function rollJellyGenome(seed: number): JellyGenome {
  const r = mulberry32(seed);
  // The traits added later roll off a stream of their own, so every jelly
  // rolled before them keeps the rest of its body.
  const r2 = mulberry32(seed ^ 0x6a09e667);
  const tentacles = int(r, 8, 26);
  return {
    armLength: range(r2, 0.6, 1.6),
    lobeDepth: range(r2, 0.5, 2.2),
    tentacles,
    hairs: Math.max(0, tentacles - 1 + int(r, -4, 4)),
    arms: int(r, 2, 6),
    aspect: range(r, 0.72, 1.18),
    scallops: int(r, 10, 22),
    stingP: range(r, 0.15, 0.7),
    hue: int(r, 0, 9),
    hueMix: range(r, 0, 0.3),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One generation on: counts step by one now and then, shapes drift a little. */
export function childOf(parent: JellyGenome, seed: number): JellyGenome {
  const r = mulberry32(seed);
  const r2 = mulberry32(seed ^ 0x6a09e667);
  const step = (v: number, lo: number, hi: number) =>
    r() < 0.4 ? clamp(v + (r() < 0.5 ? -1 : 1) * int(r, 1, 2), lo, hi) : v;
  return {
    tentacles: step(parent.tentacles, 6, 32),
    hairs: step(parent.hairs, 0, 34),
    arms: step(parent.arms, 1, 8),
    aspect: clamp(parent.aspect * range(r, 0.92, 1.08), 0.65, 1.25),
    scallops: step(parent.scallops, 8, 26),
    stingP: clamp(parent.stingP + range(r, -0.08, 0.08), 0, 0.9),
    hue: r() < 0.15 ? int(r, 0, 9) : parent.hue,
    hueMix: clamp(parent.hueMix + range(r, -0.05, 0.05), 0, 0.4),
    armLength: clamp((parent.armLength ?? 1) * range(r2, 0.88, 1.12), 0.5, 2),
    lobeDepth: clamp((parent.lobeDepth ?? 1) * range(r2, 0.85, 1.15), 0.3, 3),
  };
}

const lines = new Map<string, JellyGenome>();

/**
 * The jelly of a sitting's `block`th block (0 is the first). The same object
 * every time it is asked for, so a drawing keyed on it is only rebuilt when
 * the block really changes.
 */
export function jellyForBlock(sittingKey: string, block: number): JellyGenome {
  const id = `${sittingKey}|${block}`;
  const known = lines.get(id);
  if (known) return known;
  const g =
    block <= 0
      ? rollJellyGenome(hash32(sittingKey, 'jelly'))
      : childOf(jellyForBlock(sittingKey, block - 1), hash32(sittingKey, 'jelly', block));
  if (lines.size > 200) lines.clear();
  lines.set(id, g);
  return g;
}

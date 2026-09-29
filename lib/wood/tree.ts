import { DEFAULT_SHAPE, type FanShape, type FlowerForm, type LeafForm } from '../fan';
import { dice, hash32 } from './random';

/**
 * The tree in the middle of the wood, and its family.
 *
 * The fan grows the same habit from every seed; only the branching falls
 * differently. In the wood each sitting's first tree rolls a habit of its
 * own (how wide it splits, how hard it reaches up, what leaf it carries and
 * how it flowers), and every block after that grows the child of the block
 * before: most of it the same, a little drifted, now and then one trait
 * flipped. A long sitting leaves a family standing behind the tree on the
 * clock, and they look like a family.
 */

export interface TreeGenome {
  shape: FanShape;
  leaf: LeafForm;
  flower: FlowerForm;
  /** One outermost tip in this many flowers when the block is done. */
  every: number;
  /** A small turn of the course colour for this tree's leaves, -1 cool to 1
      warm. The stem stays the course's own. */
  tint: number;
}

/** The fan, exactly: what `StudyFan` draws with no genome at all. */
export const DEFAULT_TREE: TreeGenome = {
  shape: DEFAULT_SHAPE,
  leaf: 'oval',
  flower: 'disc',
  every: 3,
  tint: 0,
};

/* Every number a habit can roll, and the range it stays inside however many
   generations it drifts. The ranges sit round the fan's own values rather
   than far from them: a tree still has to reach the top of its frame at the
   end of a block, and a habit much wider than the fan's would be held back
   by the frame's sides before its crown got there. */
const RANGES: Record<keyof FanShape, [number, number]> = {
  spreadMin: [0.4, 0.6],
  spreadVar: [0.24, 0.42],
  jitter: [0.18, 0.4],
  keep: [0.85, 0.94],
  up: [0.06, 0.15],
  lenMin: [0.66, 0.74],
  lenVar: [0.08, 0.15],
  taper: [0.68, 0.76],
  bow: [0.12, 0.32],
};

const LEAVES: readonly (readonly [LeafForm, number])[] = [
  ['oval', 3],
  ['round', 1.2],
  ['narrow', 1.2],
  ['broad', 1],
];
const FLOWERS: readonly (readonly [FlowerForm, number])[] = [
  ['disc', 2],
  ['star', 1.4],
  ['bell', 1],
  ['cluster', 1.1],
];

export function rollTree(seed: number): TreeGenome {
  const d = dice(seed);
  const at = (k: keyof FanShape) => d.range(RANGES[k][0], RANGES[k][1]);
  const up = at('up');
  return {
    shape: {
      spreadMin: at('spreadMin'),
      spreadVar: at('spreadVar'),
      jitter: at('jitter'),
      keep: 1 - up,
      up,
      lenMin: at('lenMin'),
      lenVar: at('lenVar'),
      taper: at('taper'),
      bow: at('bow'),
    },
    leaf: d.weighted(LEAVES),
    flower: d.weighted(FLOWERS),
    every: d.int(2, 4),
    tint: d.range(-1, 1),
  };
}

/**
 * One generation on. Numbers drift a few percent and stay in their range,
 * the flower count moves by one now and then, and once in a while the leaf
 * or the flower changes altogether.
 */
export function mutateTree(g: TreeGenome, seed: number): TreeGenome {
  const d = dice(seed);
  const drift = (k: keyof FanShape) => {
    const [lo, hi] = RANGES[k];
    return Math.min(hi, Math.max(lo, g.shape[k] * (1 + (d.next() - 0.5) * 0.12)));
  };
  const up = drift('up');
  return {
    shape: {
      spreadMin: drift('spreadMin'),
      spreadVar: drift('spreadVar'),
      jitter: drift('jitter'),
      keep: 1 - up,
      up,
      lenMin: drift('lenMin'),
      lenVar: drift('lenVar'),
      taper: drift('taper'),
      bow: drift('bow'),
    },
    leaf: d.chance(0.12) ? d.weighted(LEAVES) : g.leaf,
    flower: d.chance(0.12) ? d.weighted(FLOWERS) : g.flower,
    every: d.chance(0.2) ? Math.min(4, Math.max(2, g.every + (d.chance(0.5) ? 1 : -1))) : g.every,
    tint: Math.min(1, Math.max(-1, g.tint + (d.next() - 0.5) * 0.3)),
  };
}

/**
 * Block `block`'s tree in the sitting keyed `key`: the root rolled from the
 * key, then mutated once per block. Pure, so the tree on screen, the family
 * behind it and a reloaded page all agree.
 */
export function treeForBlock(key: string, block: number): TreeGenome {
  let g = rollTree(hash32(key, 'tree'));
  for (let i = 1; i <= block; i++) g = mutateTree(g, hash32(key, 'tree', i));
  return g;
}

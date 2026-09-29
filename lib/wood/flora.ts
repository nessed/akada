import { DEFAULT_SHAPE, type FanShape } from '../fan';
import { dice, hash32, type Dice } from './random';

/**
 * The land, laid out once per sitting.
 *
 * Everything that grows is placed up front, each piece with the point on the
 * succession scale where it starts arriving (`from`, on `Succession.z`), so
 * the wood fills in continuously rather than switching scenes: grass is up
 * inside the first few minutes, the meadow flowers over the first quarter
 * hour, bushes come with the scrub, the young trees rise as fans (the same
 * drawing as the tree on the clock, grown on the same rule), and old growth
 * brings the fallen log, the fungi and the trunk too wide to fit the frame.
 *
 * Positions are in scene terms: `x` across the width from 0 to 1, and `d`
 * the depth, 0 on the horizon and 1 on the ground line the tree stands on.
 * `rank` is what a small view culls on: a phone frame shows the elements
 * with the lowest ranks and a full screen shows them all, so a wood never
 * crowds a small page.
 */

export type LandKind = 'grass' | 'flower' | 'bush' | 'tree' | 'fern' | 'log' | 'fungus' | 'stone' | 'trunk' | 'shaft';

export type FlowerKind = 'daisy' | 'bell' | 'umbel' | 'spike' | 'cup';
export type FungusKind = 'cap' | 'bell' | 'shelf';

export interface LandElement {
  id: number;
  kind: LandKind;
  x: number;
  d: number;
  /** Where on the z scale it starts arriving, and how long it takes. */
  from: number;
  over: number;
  rank: number;
  seed: number;
  /** Height as a share of the view's height, at the ground line. */
  h: number;
  /** Index into the pastels, for anything with a colour of its own. */
  hue: number;
  flower?: FlowerKind;
  fungus?: FungusKind;
  /** A tree's habit and how deep it branches. */
  shape?: FanShape;
  depth?: number;
  tripleP?: number;
  /** Which way a trunk or a log leans into the frame from. */
  side?: 1 | -1;
}

export interface Land {
  elements: LandElement[];
  /** The z at which the first tree is up enough to land on, and the first
      flower open enough to visit. Arrivals before these do something else. */
  treesAt: number;
  flowersAt: number;
  /** The horizon's rise and fall, sampled across the width, in shares of
      the gap between the horizon and the ground. */
  horizon: number[];
  /** The far treeline's height along the horizon, same sampling. */
  treeline: number[];
}

/* A background tree's habit: kin to the fan's, leaning a little more toward
   the shapes a wood has (tall and narrow, broad and low). */
function treeShape(d: Dice): FanShape {
  const up = d.range(0.07, 0.2);
  return {
    ...DEFAULT_SHAPE,
    spreadMin: d.range(0.32, 0.62),
    spreadVar: d.range(0.2, 0.42),
    jitter: d.range(0.2, 0.42),
    keep: 1 - up,
    up,
    lenMin: d.range(0.64, 0.76),
    lenVar: d.range(0.08, 0.16),
    taper: d.range(0.66, 0.76),
    bow: d.range(0.12, 0.34),
  };
}

/** Sideways positions that keep clear of the tree on the clock. */
function flank(d: Dice, reach = 0.36): number {
  return d.chance(0.5) ? d.range(0.03, reach) : d.range(1 - reach, 0.97);
}

export function rollLand(key: string): Land {
  const d = dice(hash32(key, 'land'));
  const out: LandElement[] = [];
  let id = 0;
  const add = (e: Omit<LandElement, 'id' | 'rank' | 'seed'>) => {
    out.push({ ...e, id: id++, rank: d.next(), seed: hash32(key, 'land', id) });
  };

  // Stones are there from the start: the field before anything grew on it.
  for (let i = d.int(2, 4); i > 0; i--) add({ kind: 'stone', x: d.range(0.05, 0.95), d: d.range(0.55, 1), from: 0, over: 0.01, h: d.range(0.012, 0.026), hue: 8 });

  // Grass first, in the first few minutes.
  for (let i = d.int(30, 42); i > 0; i--) {
    add({ kind: 'grass', x: d.range(0, 1), d: Math.pow(d.next(), 0.35), from: d.range(-0.05, 0.06), over: 0.04, h: d.range(0.025, 0.05), hue: d.pick([0, 0, 7, 6]) });
  }
  // The meadow flowers.
  const flowers: FlowerKind[] = ['daisy', 'bell', 'umbel', 'spike', 'cup'];
  for (let i = d.int(10, 18); i > 0; i--) {
    add({
      kind: 'flower',
      x: d.range(0.02, 0.98),
      d: Math.pow(d.range(0.3, 1), 0.6),
      from: d.range(0.03, 0.17),
      over: 0.05,
      h: d.range(0.035, 0.075),
      hue: d.pick([1, 2, 3, 4, 6, 9]),
      flower: d.pick(flowers),
    });
  }
  // Scrub: bushes on the flanks, with the odd one further back.
  for (let i = d.int(3, 6); i > 0; i--) {
    add({ kind: 'bush', x: flank(d, 0.4), d: d.range(0.3, 0.85), from: d.range(0.2, 0.34), over: 0.08, h: d.range(0.05, 0.085), hue: d.pick([0, 7, 0, 6]) });
  }
  // Young wood: small trees behind, growing as fans.
  for (let i = d.int(5, 8); i > 0; i--) {
    add({
      kind: 'tree',
      x: d.chance(0.25) ? d.range(0.3, 0.7) : flank(d, 0.42),
      d: d.range(0.05, 0.5),
      from: d.range(0.38, 0.56),
      over: 0.16,
      h: d.range(0.28, 0.5),
      hue: d.pick([0, 7, 0, 3]),
      shape: treeShape(d),
      depth: d.int(5, 6),
      tripleP: d.range(0.15, 0.3),
    });
  }
  // High wood: tall trees at the edges, reaching out of the top of the view.
  for (let i = d.int(3, 5); i > 0; i--) {
    add({
      kind: 'tree',
      x: flank(d, 0.2),
      d: d.range(0.62, 0.92),
      from: d.range(0.58, 0.74),
      over: 0.16,
      h: d.range(0.85, 1.25),
      hue: d.pick([0, 7, 0, 5]),
      shape: treeShape(d),
      depth: 6,
      tripleP: d.range(0.18, 0.3),
    });
  }
  // Light through the gaps, once there is a canopy to have gaps in.
  for (let i = d.int(2, 4); i > 0; i--) add({ kind: 'shaft', x: d.range(0.1, 0.9), d: 0.5, from: d.range(0.6, 0.72), over: 0.1, h: 1, hue: 6 });
  // Old growth: ferns, a fallen log with fungi on it, and one great trunk.
  for (let i = d.int(4, 8); i > 0; i--) add({ kind: 'fern', x: flank(d, 0.45), d: d.range(0.65, 1), from: d.range(0.78, 0.9), over: 0.06, h: d.range(0.06, 0.1), hue: 0 });
  const logSide: 1 | -1 = d.chance(0.5) ? 1 : -1;
  const logX = logSide > 0 ? d.range(0.68, 0.8) : d.range(0.2, 0.32);
  add({ kind: 'log', x: logX, d: d.range(0.72, 0.85), from: 0.82, over: 0.05, h: d.range(0.035, 0.05), hue: 5, side: logSide });
  for (let i = d.int(5, 9); i > 0; i--) {
    add({
      kind: 'fungus',
      x: d.chance(0.5) ? logX + d.range(-0.08, 0.08) : d.range(0.05, 0.95),
      d: d.range(0.7, 1),
      from: d.range(0.84, 0.96),
      over: 0.03,
      h: d.range(0.012, 0.026),
      hue: d.pick([3, 5, 6, 1, 8]),
      fungus: d.pick(['cap', 'cap', 'bell', 'shelf'] as FungusKind[]),
    });
  }
  add({ kind: 'trunk', x: d.chance(0.5) ? 0 : 1, d: 1, from: 0.86, over: 0.08, h: 1, hue: 5, side: d.chance(0.5) ? 1 : -1 });

  // The horizon: a gentle rise and fall, and the treeline that fills in
  // along it as the land matures.
  const n = 48;
  const phase = d.range(0, Math.PI * 2);
  const phase2 = d.range(0, Math.PI * 2);
  const horizon = Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return 0.08 * Math.sin(u * 3.1 + phase) + 0.04 * Math.sin(u * 7.3 + phase2);
  });
  const treeline = Array.from({ length: n }, () => d.range(0.4, 1));

  // Now and then old growth grows a fairy ring: toadstools in a circle on
  // the floor, rolled on dice of their own so nothing above moves.
  const ring = dice(hash32(key, 'ring'));
  if (ring.chance(0.35)) {
    const cx = flank(ring, 0.4);
    const rd = ring.range(0.78, 0.9);
    const hue = ring.pick([3, 5, 6, 1]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      out.push({
        id: id++,
        kind: 'fungus',
        x: cx + Math.cos(a) * 0.05,
        d: rd + Math.sin(a) * 0.05,
        from: 0.9 + ring.range(0, 0.04),
        over: 0.03,
        rank: ring.next() * 0.5,
        seed: hash32(key, 'ring', i),
        h: ring.range(0.013, 0.019),
        hue,
        fungus: 'cap',
      });
    }
  }

  // `arrival` is a smoothstep, which passes 0.85 at 73% of the way through
  // its window and 0.6 at 57%.
  let treesAt = 1;
  let flowersAt = 1;
  for (const e of out) {
    if (e.kind === 'tree') treesAt = Math.min(treesAt, e.from + e.over * 0.73);
    if (e.kind === 'flower') flowersAt = Math.min(flowersAt, e.from + e.over * 0.57);
  }
  return { elements: out, horizon, treeline, treesAt, flowersAt };
}

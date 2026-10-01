/**
 * Kelp: the sea's one plant, and only where the light is.
 *
 * About half of sittings (`env.kelp`) start at the edge of a kelp forest. A
 * few stalks stand at one side of the page or both, rooted on a ledge of rock
 * far below the start and reaching all the way up to the surface. The reader
 * starts among their tops and sinks down past them: the stalks slide up the
 * page, the ledge they stand on rises into view about six minutes in, and by
 * the end of the sunlit zone it has gone up and out of sight and the water is
 * open. Nothing grows deeper, since nothing can live on light where there is
 * none, which is the true reason the deep has no plants.
 *
 * Everything is measured in frame heights, so a phone and a monitor sink past
 * the same forest at the same pace. Like the rest of the ocean it is a pure
 * function of the sitting and the focus time. The stalks stand at three
 * depths, the far ones smaller, paler and hazier.
 */

import { hash32, int, mulberry32, range, type Rand } from './random';

/** 0 standing furthest back (palest, haziest, finest), 1 between, 2 near. */
export type KelpLayer = 0 | 1 | 2;

export interface KelpBlade {
  /** Where on the stalk it grows, 0 at the holdfast to 1 at the top. */
  t: number;
  side: 1 | -1;
  /** Length and greatest width, as shares of the page's height. */
  len: number;
  width: number;
  /** How far it turns off the stalk before the current takes it, in radians. */
  angle: number;
  /** How far it hangs down as it streams with the current, 0 to 1. */
  droop: number;
  /** How much it curls along its length, as a share of it. */
  curl: number;
  /** Where its ruffled margin starts. */
  ph: number;
}

export interface KelpStalk {
  layer: KelpLayer;
  /** Across the page, 0 to 1. */
  x: number;
  /** The holdfast, in frame heights below the top of the page at the start. */
  base: number;
  /** Frame heights from the holdfast to the tip. */
  height: number;
  phase: number;
  /** How the stipe winds as it goes up: its amplitude in frame heights, its
      frequency in radians a frame height, and where it starts. */
  wave: [number, number, number];
  blades: KelpBlade[];
  /** The holdfast's roots, as angles off straight down. */
  roots: number[];
}

export interface KelpLedge {
  /** Which side of the page it juts out from. */
  edge: -1 | 1;
  /** How far across the page it reaches, 0 to 1 from its own edge. */
  reach: number;
  /** Its top, in frame heights below the top of the page at the start. */
  top: number;
  /** The rock's own dice (see `rockShape`). */
  seed: number;
}

export interface Kelp {
  stalks: KelpStalk[];
  ledges: KelpLedge[];
}

/** Where the surface sits at the start: `drawSurface`'s first line. */
export const KELP_SURFACE = 0.08;
/** The top of the ledge the forest stands on. */
const LEDGE = 2.2;
/** How fast the forest slides up the page, in frame heights per focus minute. */
const RATE = 0.19;
/** How thick the ledge is where it meets the edge of the page, in frame heights. */
export const KELP_ROCK = 0.3;
/** Blades to a frame height of stalk, back to near. */
const BLADES_PER_FRAME = [18, 23, 28];
/** How big a stalk is drawn, back to near: the further, the smaller. */
export const KELP_SCALE = [0.62, 0.8, 1];
/** How much of a forest's mass a stalk at each depth is. */
const MASS = [0.35, 0.65, 1];

/** How far the forest has slid up the page, in frame heights. */
export function kelpDescent(focusSeconds: number): number {
  return (RATE * Math.max(0, Number.isFinite(focusSeconds) ? focusSeconds : 0)) / 60;
}

/** Whether any of the forest is still on the page. */
export function kelpInView(focusSeconds: number): boolean {
  return LEDGE + KELP_ROCK + 0.05 > kelpDescent(focusSeconds);
}

function rollStalk(r: Rand, edge: -1 | 1, layer: KelpLayer): KelpStalk {
  // The near ones stand nearest their wall; the far ones a little further out.
  const off = [range(r, 0.06, 0.21), range(r, 0.04, 0.18), range(r, 0.03, 0.16)][layer];
  const base = LEDGE + range(r, 0.005, 0.02);
  const water = base - KELP_SURFACE;
  // Most are longer than the water is deep and lay their tops along the
  // surface; a few are young and stop short of it.
  const height = r() < 0.2 ? water * range(r, 0.55, 0.8) : water + range(r, 0.02, 0.24);
  const count = Math.max(4, Math.round(height * BLADES_PER_FRAME[layer]));
  const blades: KelpBlade[] = [];
  let side: 1 | -1 = r() < 0.5 ? 1 : -1;
  const k = KELP_SCALE[layer];
  for (let j = 0; j < count; j++) {
    const t = (j + 0.3 + r() * 0.4) / count;
    // Nothing on the lowest bit of stalk, and smaller blades at the growing tip.
    if (t * height < 0.05) continue;
    const tip = 1 - 0.45 * Math.max(0, (t - 0.9) / 0.1);
    blades.push({
      t,
      side,
      len: range(r, layer === 2 ? 0.05 : 0.04, 0.07) * k * tip,
      width: range(r, 0.008, 0.012) * k * (0.75 + 0.25 * tip),
      angle: range(r, 0.35, 0.8),
      droop: range(r, 0.45, 1),
      curl: range(r, -0.15, 0.15),
      ph: range(r, 0, Math.PI * 2),
    });
    side = side === 1 ? -1 : 1;
  }
  return {
    layer,
    x: edge < 0 ? off : 1 - off,
    base,
    height,
    phase: range(r, 0, Math.PI * 2),
    wave: [range(r, 0.022, 0.036) * k, range(r, 5, 8.5), range(r, 0, Math.PI * 2)],
    blades,
    roots: Array.from({ length: int(r, 6, 10) }, () => range(r, -1.3, 1.3)),
  };
}

const massOf = (ss: KelpStalk[]) => ss.reduce((m, s) => m + MASS[s.layer] * s.height, 0);

/**
 * The forest a sitting starts beside. Call only when `env.kelp` is set.
 *
 * Five to nine stalks at three depths. Where it stands at both edges of the
 * page the two sides are never a pair of curtains: one is the forest, the
 * other a few stragglers back in the haze, never more than two fifths of it.
 */
export function rollKelp(key: string): Kelp {
  // The first roll says which edges, and `picture/layout.ts` reads it the
  // same way: it must stay the first. The rest comes off its own stream.
  const r0 = mulberry32(hash32(key, 'kelp'));
  const u = r0();
  const edges: (-1 | 1)[] = u < 0.4 ? [-1, 1] : u < 0.7 ? [-1] : [1];
  const r = mulberry32(hash32(key, 'kelp', 'forest'));
  const total = int(r, 5, 9);
  const main: -1 | 1 = edges.length === 2 ? (r() < 0.5 ? -1 : 1) : edges[0];
  const few = edges.length === 2 ? Math.min(2, Math.max(1, total - 4), int(r, 1, 2)) : 0;
  const stalks: KelpStalk[] = [];
  const ledges: KelpLedge[] = [];
  const sides = new Map<-1 | 1, KelpStalk[]>();
  for (const edge of edges) {
    const n = edge === main ? total - few : few;
    // The forest: at least one near, the rest spread back through the depths.
    // The stragglers: only back in the haze.
    const layers: KelpLayer[] =
      edge === main
        ? Array.from({ length: n }, (_, i) => (i === 0 ? 2 : i === 1 ? 1 : i === 2 ? 0 : ([0, 1, 2] as const)[int(r, 0, 2)]))
        : Array.from({ length: n }, () => 0 as KelpLayer);
    const mine = layers.map((l) => rollStalk(r, edge, l));
    if (edge === main) {
      // The forest's stalks spread out from the wall, each in a share of its
      // own, so they never stand in one clump that reads as two.
      const order = mine.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = int(r, 0, i);
        [order[i], order[j]] = [order[j], order[i]];
      }
      order.forEach((k, i) => {
        const off = 0.025 + (0.175 * (i + 0.5 + range(r, -0.3, 0.3))) / mine.length;
        mine[k].x = edge < 0 ? off : 1 - off;
      });
    }
    sides.set(edge, mine);
  }
  if (edges.length === 2) {
    const big = sides.get(main)!;
    const small = sides.get(main === -1 ? 1 : -1)!;
    // Never more than two fifths of the forest's mass: further back, then shorter.
    for (let guard = 0; guard < 12 && massOf(small) > 0.4 * massOf(big); guard++) {
      const s = small.reduce((a, b) => (MASS[b.layer] * b.height > MASS[a.layer] * a.height ? b : a));
      if (s.layer > 0) s.layer = (s.layer - 1) as KelpLayer;
      else s.height *= 0.8;
    }
  }
  for (const edge of edges) {
    const mine = sides.get(edge)!;
    stalks.push(...mine);
    const furthest = Math.max(...mine.map((s) => (edge < 0 ? s.x : 1 - s.x)));
    ledges.push({
      edge,
      // The stragglers' rock is a small one; the forest's runs further out.
      reach: Math.min(edge === main ? 0.32 : 0.22, furthest + (edge === main ? range(r, 0.08, 0.12) : range(r, 0.04, 0.07))),
      top: LEDGE,
      seed: (r() * 4294967296) >>> 0,
    });
  }
  // Back ones first, so the near ones are drawn over them.
  stalks.sort((a, b) => a.layer - b.layer);
  return { stalks, ledges };
}

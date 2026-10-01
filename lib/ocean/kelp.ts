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
 * function of the sitting and the focus time; the far stalks stand further
 * off, and so slide by slower.
 */

import { hash32, int, mulberry32, range, type Rand } from './random';

export type KelpLayer = 0 | 1;

export interface KelpBlade {
  /** Where on the stalk it grows, 0 at the holdfast to 1 at the top. */
  t: number;
  side: 1 | -1;
  /** Length and greatest half-width, in CSS pixels. */
  len: number;
  width: number;
  /** How far it turns off the stalk, in radians. */
  angle: number;
  /** How much it curls along its length, as a share of it. */
  curl: number;
}

export interface KelpStalk {
  /** 0 standing further back (fainter, finer), 1 near. */
  layer: KelpLayer;
  /** Across the page, 0 to 1. */
  x: number;
  /** The holdfast, in frame heights below the top of the page at the start. */
  base: number;
  /** Frame heights from the holdfast to the tip. */
  height: number;
  phase: number;
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
  /** Boulders along its top, -1 to 1 each. */
  bumps: number[];
  /** Stipple on the rock, as shares of its reach and thickness. */
  specks: { x: number; y: number; r: number }[];
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
/** Blades to a frame height of stalk, back and near. */
const BLADES_PER_FRAME: [number, number] = [9, 12];

/** How far the forest has slid up the page, in frame heights. */
export function kelpDescent(focusSeconds: number): number {
  return (RATE * Math.max(0, Number.isFinite(focusSeconds) ? focusSeconds : 0)) / 60;
}

/** Whether any of the forest is still on the page. */
export function kelpInView(focusSeconds: number): boolean {
  return LEDGE + KELP_ROCK + 0.05 > kelpDescent(focusSeconds);
}

function rollStalk(r: Rand, edge: -1 | 1, layer: KelpLayer): KelpStalk {
  const off = layer === 1 ? range(r, 0.02, 0.12) : range(r, 0.06, 0.18);
  const base = LEDGE + range(r, 0.005, 0.02);
  const water = base - KELP_SURFACE;
  // Most are longer than the water is deep and lay their tops along the
  // surface; a few are young and stop short of it.
  const height = r() < 0.25 ? water * range(r, 0.5, 0.8) : water + range(r, -0.04, 0.22);
  const count = Math.max(4, Math.round(height * BLADES_PER_FRAME[layer]));
  const blades: KelpBlade[] = [];
  let side: 1 | -1 = r() < 0.5 ? 1 : -1;
  for (let j = 0; j < count; j++) {
    const t = (j + 0.3 + r() * 0.4) / count;
    // Nothing on the lowest bit of stalk, and smaller blades at the growing tip.
    if (t * height < 0.06) continue;
    const tip = 1 - 0.5 * Math.max(0, (t - 0.88) / 0.12);
    const len = range(r, 32, 56) * (layer === 1 ? 1 : 0.75) * tip;
    blades.push({
      t,
      side,
      len,
      width: len * range(r, 0.1, 0.15),
      angle: range(r, 0.25, 0.6),
      curl: range(r, -0.18, 0.18),
    });
    side = side === 1 ? -1 : 1;
  }
  return {
    layer,
    x: edge < 0 ? off : 1 - off,
    base,
    height,
    phase: range(r, 0, Math.PI * 2),
    blades,
    roots: Array.from({ length: int(r, 4, 7) }, () => range(r, -1.2, 1.2)),
  };
}

/** The forest a sitting starts beside. Call only when `env.kelp` is set. */
export function rollKelp(key: string): Kelp {
  const r = mulberry32(hash32(key, 'kelp'));
  const u = r();
  const edges: (-1 | 1)[] = u < 0.4 ? [-1, 1] : u < 0.7 ? [-1] : [1];
  const stalks: KelpStalk[] = [];
  const ledges: KelpLedge[] = [];
  for (const edge of edges) {
    const mine = [
      ...Array.from({ length: int(r, 1, 2) }, () => rollStalk(r, edge, 0)),
      ...Array.from({ length: int(r, 2, 3) }, () => rollStalk(r, edge, 1)),
    ];
    stalks.push(...mine);
    const furthest = Math.max(...mine.map((s) => (edge < 0 ? s.x : 1 - s.x)));
    ledges.push({
      edge,
      reach: furthest + range(r, 0.05, 0.09),
      top: LEDGE,
      bumps: Array.from({ length: 6 }, () => range(r, -1, 1)),
      specks: Array.from({ length: 16 }, () => ({ x: r(), y: r(), r: range(r, 0.6, 1.4) })),
    });
  }
  // Back ones first, so the near ones are drawn over them.
  stalks.sort((a, b) => a.layer - b.layer);
  return { stalks, ledges };
}

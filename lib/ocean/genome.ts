/**
 * What a creature is, rolled.
 *
 * Every animal in the ocean is a genome: a body plan and a list of traits,
 * each a dice roll. The rolls follow a body grammar (a ray has no dorsal
 * fin, a crawler has legs, only the deep grow lures) and the depth leans on
 * the dice, so what comes out reads as something that could live down there
 * rather than a pile of parts. The drawing is `anatomy.ts`; this is only the
 * recipe, plain data, so it can be mutated, compared and tested.
 */

import { chance, int, mulberry32, range, weighted, type Rand } from './random';

export type Plan = 'bell' | 'comb' | 'star' | 'chain' | 'fish' | 'eel' | 'ray' | 'squid' | 'crawler';
export const RADIAL_PLANS: Plan[] = ['bell', 'comb', 'star', 'chain'];
/** The plans that live on the floor, not in the water. */
export const FLOOR_PLANS: Plan[] = ['star', 'crawler'];

export type TentacleStyle = 'straight' | 'wavy' | 'coiled' | 'beaded';
export type Tail = 'fork' | 'round' | 'lunate' | 'filament' | 'fan' | 'none';
export type Pattern = 'none' | 'spots' | 'stripes' | 'bands' | 'reticulate';
export type FinShape = 'tri' | 'sail' | 'frill' | 'spines';

export interface Genome {
  plan: Plan;
  radial: boolean;
  /** The depth it was rolled at, 0 surface to 1 trench. */
  z: number;
  /** Index into the course pastels, and into the glow colours. */
  hue: number;
  glow: number;
  size: number;
  /** Carries its own light. */
  lit: boolean;
  /** See-through, insides showing. */
  clear: boolean;

  // bell
  bw?: number;
  bh?: number;
  shape?: number;
  lobes?: number;
  tentN?: number;
  tentL?: number;
  tentStyle?: TentacleStyle;
  arms?: number;
  armL?: number;
  rings?: number;
  canals?: number;
  cap?: boolean;
  // comb
  ow?: number;
  oh?: number;
  lobed?: boolean;
  rows?: number;
  feathers?: boolean;
  featherL?: number;
  // star
  armsN?: number;
  starL?: number;
  starW?: number;
  curl?: number;
  spines?: boolean;
  feet?: boolean;
  // chain
  units?: number;
  unit?: number;
  bend?: number;
  dangle?: number;
  float?: boolean;
  // bilateral
  A?: number;
  skew?: number;
  blunt?: number;
  segs?: number;
  armor?: boolean;
  tail?: Tail;
  tailSize?: number;
  dorsal?: number;
  dorsalShape?: FinShape;
  dorsalH?: number;
  pectoral?: boolean;
  anal?: boolean;
  legs?: number;
  antennae?: number;
  headArms?: number;
  armLen?: number;
  barbels?: number;
  eyes?: number;
  eyeBig?: boolean;
  lure?: boolean;
  teeth?: boolean;
  pattern?: Pattern;
  patN?: number;
  lateral?: boolean;
  photo?: boolean;
  photoN?: number;
  wave?: number;
}

/** Which plan the depth favours, when the caller has not chosen one. */
export function rollPlan(r: Rand, z: number, floor = false): Plan {
  if (floor) return weighted(r, [['star', 1], ['crawler', 1.2]]);
  if (r() < 0.26 + 0.24 * z) {
    return weighted<Plan>(r, [
      ['bell', 0.55],
      ['comb', 0.14 + 0.1 * z],
      ['chain', 0.08 + 0.16 * z],
    ]);
  }
  return weighted<Plan>(r, [
    ['fish', 0.56 - 0.22 * z],
    ['eel', 0.14 + 0.06 * z],
    ['ray', 0.12],
    ['squid', 0.12 + 0.08 * z],
  ]);
}

export function rollGenome(seed: number, z: number, plan?: Plan): Genome {
  const r = mulberry32(seed * 7919 + 13);
  const rr = (a: number, b: number) => range(r, a, b);
  const ri = (a: number, b: number) => int(r, a, b);
  const p = plan ?? rollPlan(r, z);
  const g: Genome = {
    plan: p,
    radial: RADIAL_PLANS.includes(p),
    z,
    hue: ri(0, 9),
    glow: ri(0, 3),
    size: rr(0.5, 1.2 + 0.8 * z),
    lit: chance(r, z * 0.85),
    clear: chance(r, z * 0.6),
  };
  if (p === 'bell') {
    Object.assign(g, {
      bw: rr(26, 58),
      bh: rr(16, 56),
      shape: rr(0.45, 2.2),
      lobes: ri(0, 16),
      tentN: ri(4, 30),
      tentL: rr(40, 170),
      tentStyle: weighted<TentacleStyle>(r, [['straight', 1], ['wavy', 1.4], ['coiled', 0.6 + 0.4 * z], ['beaded', 0.6]]),
      arms: ri(0, 6),
      armL: rr(0.25, 0.9),
      rings: weighted(r, [[0, 1], [4, 1.2], [ri(2, 8), 0.8]]),
      canals: ri(0, 16),
      cap: chance(r, 0.2),
    });
  } else if (p === 'comb') {
    Object.assign(g, {
      ow: rr(14, 30),
      oh: rr(26, 62),
      lobed: chance(r, 0.4),
      rows: weighted(r, [[8, 3], [4, 1], [12, 0.6]]),
      feathers: chance(r, 0.45),
      featherL: rr(50, 140),
    });
  } else if (p === 'star') {
    Object.assign(g, {
      armsN: ri(4, 11),
      starL: rr(26, 60),
      starW: rr(5, 14),
      curl: rr(-0.6, 0.6),
      spines: chance(r, 0.5),
      feet: chance(r, 0.6),
    });
  } else if (p === 'chain') {
    Object.assign(g, {
      units: ri(5, 15),
      unit: rr(5, 10),
      bend: rr(-1, 1),
      dangle: rr(18, 90),
      float: chance(r, 0.7),
    });
  } else {
    const A = { fish: rr(18, 40), eel: rr(4, 9), ray: rr(46, 72), squid: rr(16, 28), crawler: rr(12, 22) }[p];
    Object.assign(g, {
      A,
      skew: rr(0.55, 1.9),
      blunt: rr(0.55, 1.5),
      segs: ri(5, 20),
      armor: chance(r, p === 'crawler' ? 0.8 : 0.18),
      tail:
        p === 'fish'
          ? weighted<Tail>(r, [['fork', 1.3], ['round', 1], ['lunate', 0.8], ['filament', 0.4], ['none', 0.2]])
          : p === 'eel'
            ? weighted<Tail>(r, [['none', 1], ['filament', 0.6], ['round', 0.4]])
            : p === 'ray'
              ? 'filament'
              : p === 'crawler'
                ? weighted<Tail>(r, [['fan', 1], ['none', 1]])
                : 'none',
      tailSize: rr(0.6, 1.4),
      dorsal: p === 'fish' ? ri(0, 2) : 0,
      dorsalShape: weighted<FinShape>(r, [['tri', 1], ['sail', 0.7], ['frill', 0.7], ['spines', 0.6]]),
      dorsalH: rr(0.3, 1.3),
      pectoral: p === 'fish' && chance(r, 0.85),
      anal: p === 'fish' && chance(r, 0.6),
      legs: p === 'crawler' ? ri(3, 8) : 0,
      antennae: p === 'crawler' ? rr(30, 90) : 0,
      headArms: p === 'squid' ? ri(6, 10) : 0,
      armLen: rr(30, 90),
      barbels: p === 'fish' && chance(r, 0.22) ? ri(1, 3) : 0,
      eyes: p === 'ray' ? 0 : chance(r, 0.25 * z) ? 0 : chance(r, 0.08 + 0.14 * z) ? ri(2, 6) : 1,
      eyeBig: chance(r, 0.15 + 0.5 * z),
      lure: (p === 'fish' || p === 'eel') && chance(r, z > 0.45 ? 0.55 * z : 0),
      teeth: p === 'fish' && chance(r, 0.6 * z),
      pattern: weighted<Pattern>(r, [
        ['none', 0.6 + z],
        ['spots', 1 - 0.5 * z],
        ['stripes', 0.8 - 0.4 * z],
        ['bands', 0.6 - 0.3 * z],
        ['reticulate', 0.5],
      ]),
      patN: ri(4, 16),
      lateral: chance(r, 0.5),
      photoN: ri(6, 18),
      wave: p === 'eel' ? rr(4, 12) : rr(0, 3),
    });
    g.photo = g.lit && chance(r, 0.8);
  }
  return g;
}

const OPTIONS: Partial<Record<keyof Genome, readonly string[]>> = {
  tentStyle: ['straight', 'wavy', 'coiled', 'beaded'],
  pattern: ['none', 'spots', 'stripes', 'bands', 'reticulate'],
  dorsalShape: ['tri', 'sail', 'frill', 'spines'],
};
const COUNTS = new Set<string>([
  'lobes', 'tentN', 'arms', 'rings', 'canals', 'rows', 'armsN', 'units', 'segs', 'dorsal', 'legs',
  'headArms', 'barbels', 'eyes', 'patN', 'photoN', 'hue', 'glow',
]);
const FIXED = new Set<string>(['z', 'plan', 'radial', 'tail']);
/** Bounds a count may not mutate past, so a line never loses its body. */
const LIMITS: Record<string, [number, number]> = {
  lobes: [0, 20], tentN: [3, 40], arms: [0, 8], rings: [0, 10], canals: [0, 20], rows: [4, 12],
  armsN: [4, 12], units: [3, 18], segs: [4, 24], dorsal: [0, 2], legs: [2, 10], headArms: [6, 12],
  barbels: [0, 4], eyes: [0, 6], patN: [2, 20], photoN: [4, 22], hue: [0, 9], glow: [0, 3],
};

/**
 * A child of the creature before it, `generations` times over: numbers drift
 * a little, counts go up or down by one now and then, and once in a while a
 * whole trait flips. The body plan never changes; a jelly's line stays jelly.
 */
export function mutate(parent: Genome, seed: number, generations: number): Genome {
  const g: Genome = { ...parent };
  const rec = g as unknown as Record<string, unknown>;
  for (let i = 1; i <= generations; i++) {
    const r = mulberry32(seed * 31 + i * 977);
    for (const k of Object.keys(rec)) {
      if (FIXED.has(k)) continue;
      const v = rec[k];
      if (typeof v === 'number') {
        if (COUNTS.has(k)) {
          if (r() < 0.3) {
            const [lo, hi] = LIMITS[k] ?? [0, 99];
            rec[k] = Math.max(lo, Math.min(hi, v + (r() < 0.5 ? -1 : 1)));
          }
        } else {
          rec[k] = v * (1 + (r() - 0.5) * 0.26);
        }
      } else if (typeof v === 'boolean') {
        if (r() < 0.07) rec[k] = !v;
      } else if (typeof v === 'string' && OPTIONS[k as keyof Genome] && r() < 0.12) {
        const opts = OPTIONS[k as keyof Genome]!;
        rec[k] = opts[Math.floor(r() * opts.length)];
      }
    }
  }
  return g;
}

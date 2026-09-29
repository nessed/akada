import { visible, type Species, type Wood } from './biome';
import { animalName, rollAnimal } from './fauna';
import { sceneAtFocus } from './clock';
import type { AnimalGenome, Plan } from './fauna';
import type { Pose, PoseKind } from './figures';
import type { LandElement } from './flora';
import { arrival, successionAt, type Stage } from './succession';
import { hash32, pickIndex, unit } from './random';
import type { SessionSegment } from '../data/types';

/**
 * Who is in the wood at a given moment.
 *
 * Nothing is simulated. Focus time is cut into one-second slots and a hash
 * of the wood's key and the slot decides whether something arrives in it,
 * and what: the chance rises as the land matures, and the species is drawn
 * from that stage's pool on its long tail. From there an animal's whole
 * visit is a pure function of how long ago it arrived on the scene clock,
 * so a reload, a still frame or a slow phone all see the same animal in the
 * same place. Arrivals only happen on focus seconds, which is what makes a
 * break quiet: nobody new comes, and whoever was there drifts on slowly and
 * leaves.
 *
 * `rank` is how a small view stays uncluttered. Every arrival rolls one, and
 * a view shows the arrivals whose rank is under its density, so a phone
 * sees a thinner wood than a full screen, never a different one. The recap
 * only counts arrivals under the smallest view's density, so it never names
 * an animal the reader could not have seen.
 */

export type Behaviour =
  | 'cross'
  | 'soar'
  | 'perchTree'
  | 'perchHero'
  | 'ground'
  | 'flutter'
  | 'dart'
  | 'visit'
  | 'walk'
  | 'hop'
  | 'shuffle'
  | 'flit';

export type Depth = 'far' | 'mid' | 'near';

/** The thinnest wood any view shows; the recap counts from under it. */
export const MIN_DENSITY = 0.45;
/** Longest visit, in scene seconds. What the scan looks back over. */
export const MAX_LIFE = 150;

export interface View {
  night: boolean;
  /** MIN_DENSITY to 1, from the view's area. */
  density: number;
  /** Width over height. */
  aspect: number;
}

/** One arrival, as rolled. */
export interface Spawn {
  slot: number;
  species: Species;
  stage: Stage;
  behaviour: Behaviour;
  depth: Depth;
  /** 0 on the horizon to 1 on the ground line: where it is in the scene. */
  d: number;
  dir: 1 | -1;
  rank: number;
  life: number;
  /** How many come together. */
  company: number;
  seed: number;
}

/** An animal on screen now. */
export interface Visitor {
  id: string;
  spawn: Spawn;
  member: number;
  genome: AnimalGenome;
  /** Across the view, 0 to 1 (off either edge on the way in and out). */
  x: number;
  /** Down the view, 0 at the top to 1 on the ground line. */
  y: number;
  d: number;
  pose: Pose;
  /** Facing right (1) or left (-1), for side-on figures. */
  facing: 1 | -1;
  /** Radians, for figures drawn from above or below. */
  heading: number;
  alpha: number;
  /**
   * For a bird that lands: on the tree on the clock, or on one of the wood's
   * own trees (by element id). The schedule only knows it wants a seat and
   * when; the scene finds the actual branch, and flies the bird in from
   * `from` and out to `to` (view fractions) as `landing` and `leaving` run.
   */
  seat?: {
    on: 'hero' | 'tree';
    tree?: number;
    pick: number;
    u: number;
    landing: number;
    leaving: number;
    from: [number, number];
    to: [number, number];
  };
}

const FLIERS: ReadonlySet<Plan> = new Set(['songbird', 'raptor', 'owl', 'bat', 'butterfly', 'moth', 'dragonfly', 'bee']);

/** How likely an arrival is in a given focus second, by how grown the land is. */
export function arrivalRate(z: number): number {
  return 0.035 + 0.13 * z;
}

function behaviourFor(g: AnimalGenome, z: number, u: number, hasFlowers: boolean, trees: boolean): Behaviour {
  const pick = (options: [Behaviour, number][]): Behaviour => {
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    let x = u * total;
    for (const [b, w] of options) {
      x -= w;
      if (x < 0) return b;
    }
    return options[options.length - 1][0];
  };
  switch (g.plan) {
    case 'songbird':
      return pick([
        ['cross', 3],
        ['perchHero', 1.7],
        ['perchTree', trees ? 2 : 0],
        ['ground', z < 0.6 ? 1.4 : 0.6],
      ]);
    case 'owl':
      return pick([
        ['cross', 2],
        ['perchHero', 1.4],
        ['perchTree', trees ? 2 : 0],
      ]);
    case 'raptor':
      return pick([
        ['soar', 3],
        ['cross', 1],
      ]);
    case 'bat':
      return 'flit';
    case 'butterfly':
      return hasFlowers && u < 0.4 ? 'visit' : 'flutter';
    case 'moth':
      return 'flutter';
    case 'dragonfly':
      return 'dart';
    case 'bee':
      return hasFlowers ? 'visit' : 'flutter';
    case 'hare':
      return 'hop';
    case 'hedgehog':
      return 'shuffle';
    default:
      return 'walk';
  }
}

function lifeFor(b: Behaviour, depth: Depth, u: number): number {
  switch (b) {
    case 'cross':
      return depth === 'far' ? 34 + 12 * u : depth === 'mid' ? 20 + 6 * u : 11 + 3 * u;
    case 'soar':
      return 50 + 45 * u;
    case 'perchTree':
    case 'perchHero':
      return 34 + 50 * u;
    case 'ground':
      return 16 + 16 * u;
    case 'flutter':
      return 22 + 16 * u;
    case 'dart':
      return 12 + 10 * u;
    case 'visit':
      return 18 + 18 * u;
    case 'walk':
      return 70 + 60 * u;
    case 'hop':
      return 26 + 14 * u;
    case 'shuffle':
      return 60 + 40 * u;
    case 'flit':
      return 9 + 6 * u;
  }
}

/**
 * What arrives in focus second `slot`, if anything. Pure: the same key and
 * slot always give the same answer, whatever view asks.
 */
export function spawnAt(wood: Wood, slot: number, night: boolean): Spawn | null {
  const z = successionAt(slot).z;
  const stag = stagAt(wood, slot, z);
  if (stag) return stag;
  if (unit(wood.key, 'slot', slot) >= arrivalRate(z)) return null;
  const stage = successionAt(slot).stage;
  const { species, weights } = visible(wood.pools[stage], night);
  if (!species.length) return null;
  const sp = species[pickIndex(weights, unit(wood.key, 'who', slot, night ? 'n' : 'd'))];
  const g = sp.genome;
  const seed = hash32(wood.key, 'spawn', slot);
  const u = (k: string) => unit(seed, k);
  const hasFlowers = z >= wood.land.flowersAt && z < 0.75;
  const behaviour = behaviourFor(g, z, u('b'), hasFlowers, z >= wood.land.treesAt);
  const flier = FLIERS.has(g.plan);
  let depth: Depth;
  if (behaviour === 'perchHero' || behaviour === 'visit') depth = 'mid';
  else if (behaviour === 'soar') depth = 'far';
  else {
    const r = u('layer');
    depth = r < 0.55 ? 'far' : r < 0.86 ? 'mid' : 'near';
  }
  // Big walkers keep their distance; a deer at the front of the frame would
  // stand in front of the tree.
  if (!flier && (g.plan === 'deer' || g.plan === 'fox') && depth === 'near') depth = 'mid';
  const d =
    behaviour === 'perchHero'
      ? 0.95
      : depth === 'far'
        ? 0.08 + 0.25 * u('d')
        : depth === 'mid'
          ? 0.4 + 0.3 * u('d')
          : 0.85 + 0.15 * u('d');
  const company =
    behaviour === 'cross' || behaviour === 'flit' || behaviour === 'walk' || behaviour === 'visit'
      ? g.flock > 0.3 && u('flock') < g.flock
        ? g.plan === 'songbird'
          ? 4 + Math.floor(u('n') * 9)
          : 2 + Math.floor(u('n') * 2)
        : 1
      : 1;
  return {
    slot,
    species: sp,
    stage,
    behaviour,
    depth,
    d,
    dir: u('dir') < 0.5 ? 1 : -1,
    rank: u('rank'),
    life: lifeFor(behaviour, depth, u('life')),
    company,
    seed,
  };
}

/**
 * The stag. About once in two hours of focus in a grown wood, on the half
 * minute, a big deer with a full head of antlers comes out on the far side,
 * stops, and stands there a long while before it goes. It is the rarest
 * thing the wood has, and nothing announces it.
 */
function stagAt(wood: Wood, slot: number, z: number): Spawn | null {
  if (z < 0.5 || slot % 60 !== 30 || unit(wood.key, 'stag', slot) >= 1 / 120) return null;
  const seed = hash32(wood.key, 'stag', slot);
  const genome = { ...rollAnimal(seed, 'deer'), antlers: 3, size: 1.3, pattern: 'rump', flock: 0 };
  const stage = successionAt(slot).stage;
  const species: Species = { id: `stag:${seed.toString(36)}`, seed, genome, name: animalName(genome, seed, stage), stage, weight: 0.001, regular: false };
  return { slot, species, stage, behaviour: 'walk', depth: 'mid', d: 0.45, dir: unit(seed, 'dir') < 0.5 ? 1 : -1, rank: 0, life: 140, company: 1, seed };
}

/** A small cache of decoded slots, so a frame does not re-roll 150 seconds. */
export class SpawnCache {
  private map = new Map<string, Spawn | null>();
  constructor(private readonly wood: Wood) {}
  get(slot: number, night: boolean): Spawn | null {
    const k = `${slot}:${night ? 1 : 0}`;
    if (this.map.has(k)) return this.map.get(k) ?? null;
    const s = spawnAt(this.wood, slot, night);
    this.map.set(k, s);
    if (this.map.size > 800) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    return s;
  }
}

type Segment = Pick<SessionSegment, 'kind' | 'seconds' | 'startedAt' | 'targetSeconds'>;

export interface Moment {
  focus: number;
  scene: number;
  segments: readonly Segment[];
}

/**
 * Everyone on screen at this moment, for this view: the arrivals of the last
 * few minutes that are still on their visit, walked along their paths.
 */
export function visitorsAt(wood: Wood, at: Moment, view: View, cache?: SpawnCache, land?: readonly LandElement[]): Visitor[] {
  const out: Visitor[] = [];
  const top = Math.floor(at.focus);
  const z = successionAt(at.focus).z;
  for (let slot = Math.max(0, top - MAX_LIFE); slot <= top; slot++) {
    const spawn = cache ? cache.get(slot, view.night) : spawnAt(wood, slot, view.night);
    if (!spawn || spawn.rank >= view.density) continue;
    const born = sceneAtFocus(at.segments, slot);
    const age = at.scene - born;
    if (age < 0 || age > spawn.life) continue;
    for (let m = 0; m < spawn.company; m++) {
      const v = walk(spawn, m, age, view, z, land);
      if (v) out.push(v);
    }
  }
  return out;
}

/* -------------------------------------------------------------- the paths */

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const fade = (age: number, life: number, edge = 0.8) => Math.min(1, age / edge, (life - age) / edge);

/** Where the ground is, 0 to 1 down the view, at depth `d`. */
export function groundY(d: number, horizon: number): number {
  return horizon + (1 - horizon) * Math.pow(Math.min(1, Math.max(0, d)), 1.25);
}

/** The horizon's height in the view, as a share of the way to the ground. */
export const HORIZON = 0.68;

function walk(s: Spawn, member: number, age: number, view: View, z: number, land?: readonly LandElement[]): Visitor | null {
  const g = s.species.genome;
  const u = (k: string) => unit(s.seed, k, member);
  const id = `${s.slot}:${member}`;
  const base = { id, spawn: s, member, genome: g, d: s.d };
  const margin = 0.1;
  const dir = s.dir;
  // Company keeps together but not in step.
  const lag = member * (0.5 + u('lag') * 0.7);
  const t = age - lag;
  if (t < 0) return null;
  const life = s.life;

  switch (s.behaviour) {
    case 'cross':
    case 'flit': {
      const speed = (1 + 2 * margin) / (life - (s.company - 1) * 1.2);
      const along = -margin + speed * t;
      const x = dir > 0 ? along : 1 - along;
      if (x < -margin - 0.05 || x > 1 + margin + 0.05) return null;
      const y0 = (s.depth === 'far' ? 0.08 : 0.16) + (s.depth === 'far' ? 0.3 : 0.38) * unit(s.seed, 'y');
      const spread = member ? (u('dy') - 0.5) * 0.08 : 0;
      if (s.behaviour === 'flit') {
        const y = y0 + spread + 0.05 * Math.sin(t * 2.1 + u('p') * 6) + 0.025 * Math.sin(t * 5.3);
        return { ...base, x, y, pose: { kind: 'fly', t: (t * 7) % 1 }, facing: dir, heading: 0, alpha: 1 };
      }
      if (g.plan === 'songbird') {
        // Finch flight: a burst of beats, then wings shut for a bound, the
        // line rising on the beats and dipping on the bounds.
        const cycle = 0.95;
        const c = (t / cycle + u('p')) % 1;
        const beating = c < 0.58;
        const y = y0 + spread - 0.012 * Math.sin(c * Math.PI * 2);
        const pose: Pose = beating ? { kind: 'fly', t: ((c / 0.58) * 4) % 1 } : { kind: 'bound', t: 0 };
        return { ...base, x, y, pose, facing: dir, heading: 0, alpha: 1 };
      }
      const y = y0 + spread + 0.01 * Math.sin(t * 1.3);
      const beat = g.plan === 'owl' ? 1.6 : g.plan === 'raptor' ? 1.2 : 3;
      const glide = g.plan === 'owl' && (t % 5) > 3.2;
      return { ...base, x, y, pose: glide ? { kind: 'glide', t: 0 } : { kind: g.plan === 'raptor' ? 'glide' : 'fly', t: (t * beat) % 1 }, facing: dir, heading: dir > 0 ? 0 : Math.PI, alpha: 1 };
    }

    case 'soar': {
      const cx = 0.25 + 0.5 * u('cx');
      const cy = 0.12 + 0.12 * u('cy');
      const r = 0.07 + 0.06 * u('r');
      const w = (0.28 + 0.12 * u('w')) * (u('turn') < 0.5 ? 1 : -1);
      const tin = 8;
      const tout = life - 8;
      const circ = (tt: number) => {
        const a = tt * w + u('a0') * Math.PI * 2;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * view.aspect * 0.35, a };
      };
      let x: number;
      let y: number;
      let heading: number;
      if (t < tin) {
        const p = circ(0);
        const k = smooth(t / tin);
        const sx = dir > 0 ? -margin : 1 + margin;
        x = sx + (p.x - sx) * k;
        y = p.y - 0.05 * (1 - k);
        heading = dir > 0 ? 0 : Math.PI;
      } else if (t < tout) {
        const p = circ(t - tin);
        x = p.x;
        y = p.y;
        heading = p.a + (w > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else {
        const p = circ(tout - tin);
        const k = smooth((t - tout) / 8);
        const ex = dir > 0 ? 1 + margin : -margin;
        x = p.x + (ex - p.x) * k;
        y = p.y - 0.06 * k;
        heading = dir > 0 ? 0 : Math.PI;
      }
      return { ...base, x, y, pose: { kind: 'glide', t: (t * 0.4) % 1 }, facing: dir, heading, alpha: fade(t, life, 2) };
    }

    case 'perchHero':
    case 'perchTree': {
      // Fly in, sit, fly off. The seat itself is found by the scene; here
      // is only when, and the way in and out.
      const tin = 3.2;
      const tout = life - 3;
      const sx = dir > 0 ? -margin : 1 + margin;
      const sy = 0.1 + 0.25 * u('sy');
      const ex = dir > 0 ? 1 + margin : -margin;
      const ey = 0.05 + 0.2 * u('ey');
      const sitting = t >= tin && t < tout;
      const pose: Pose = sitting ? { kind: 'perch', t: (t * 0.2) % 1 } : { kind: 'fly', t: (t * 3.4) % 1 };
      // Sitting, it turns about now and then.
      const facing: 1 | -1 = sitting && Math.floor((t + u('turn') * 9) / 7) % 2 ? (-dir as 1 | -1) : dir;
      let tree: number | undefined;
      if (s.behaviour === 'perchTree') {
        const trees = (land ?? []).filter((e) => e.kind === 'tree' && arrival(z, e.from, e.over) > 0.85);
        if (!trees.length) return null;
        tree = trees[Math.floor(u('tree') * trees.length)].id;
      }
      return {
        ...base,
        x: sx,
        y: sy,
        pose,
        facing,
        heading: 0,
        alpha: 1,
        seat: {
          on: s.behaviour === 'perchHero' ? 'hero' : 'tree',
          tree,
          pick: u('pick'),
          u: 0.55 + 0.35 * u('u'),
          landing: t < tin ? smooth(t / tin) : 1,
          leaving: t > tout ? smooth((t - tout) / 3) : 0,
          from: [sx, sy],
          to: [ex, ey],
        },
      };
    }

    case 'ground': {
      const tin = 2.6;
      const tout = life - 2.4;
      const gx = 0.1 + 0.8 * u('gx');
      const gy = groundY(s.d, HORIZON);
      const sx = dir > 0 ? -margin : 1 + margin;
      const sy = 0.2 + 0.2 * u('sy');
      if (t < tin) {
        const k = smooth(t / tin);
        return { ...base, x: sx + (gx - sx) * k, y: sy + (gy - sy) * k - 0.04 * Math.sin(k * Math.PI), pose: { kind: 'fly', t: (t * 3.4) % 1 }, facing: dir, heading: 0, alpha: 1 };
      }
      if (t > tout) {
        const k = smooth((t - tout) / 2.4);
        const ex = dir > 0 ? 1 + margin : -margin;
        return { ...base, x: gx + (ex - gx) * k, y: gy + (0.15 - gy) * k, pose: { kind: 'fly', t: (t * 3.4) % 1 }, facing: dir, heading: 0, alpha: 1 };
      }
      // Hop, peck, look about.
      const hopAt = Math.floor((t - tin) / 1.6);
      const into = ((t - tin) % 1.6) / 1.6;
      const hopDir = unit(s.seed, 'hop', hopAt) < 0.5 ? -1 : 1;
      const hx = gx + 0.012 * hopAt * (unit(s.seed, 'wander') < 0.5 ? 1 : -1) + (into < 0.2 ? 0.012 * smooth(into / 0.2) * hopDir : 0.012 * hopDir) - 0.012 * hopDir;
      const hy = gy - (into < 0.2 ? 0.015 * Math.sin((into / 0.2) * Math.PI) : 0);
      return { ...base, x: hx, y: hy, pose: { kind: 'perch', t: into }, facing: hopDir as 1 | -1, heading: 0, alpha: 1 };
    }

    case 'flutter': {
      const speed = (1 + 2 * margin) / life;
      const along = -margin + speed * t;
      const x0 = dir > 0 ? along : 1 - along;
      const low = g.plan === 'moth' ? 0.35 : 0.45;
      const y0 = low + 0.35 * unit(s.seed, 'y') + (member ? (u('dy') - 0.5) * 0.06 : 0);
      const p1 = u('p1') * 6;
      const p2 = u('p2') * 6;
      const x = x0 + 0.02 * Math.sin(t * 0.9 + p1);
      const y = y0 + 0.045 * Math.sin(t * 1.3 + p1) + 0.02 * Math.sin(t * 3.7 + p2);
      const vx = speed * dir + 0.018 * Math.cos(t * 0.9 + p1);
      const vy = 0.058 * Math.cos(t * 1.3 + p1) + 0.074 * Math.cos(t * 3.7 + p2);
      return { ...base, x, y, pose: { kind: 'fly', t: (t * (g.plan === 'moth' ? 6 : 4.2)) % 1 }, facing: dir, heading: Math.atan2(vy, vx * view.aspect) + Math.PI / 2, alpha: 1 };
    }

    case 'dart': {
      // Hover, dart, hover: a handful of stations inside the view.
      const legs = 5;
      const span = life / legs;
      const i = Math.min(legs - 1, Math.floor(t / span));
      const into = (t - i * span) / span;
      const station = (k: number) => {
        if (k < 0) return { x: dir > 0 ? -margin : 1 + margin, y: 0.4 + 0.2 * u('s0') };
        if (k >= legs - 1) return { x: dir > 0 ? 1 + margin : -margin, y: 0.3 + 0.2 * u('s9') };
        return { x: 0.12 + 0.76 * unit(s.seed, 'sx', k), y: 0.3 + 0.45 * unit(s.seed, 'sy', k) };
      };
      // Each leg is a dart from the last station, fast, then a hover.
      const a = station(i - 1);
      const b = station(i);
      const k = smooth(Math.min(1, into / 0.18));
      const hover = k >= 1;
      const x = a.x + (b.x - a.x) * k + (hover ? 0.004 * Math.sin(t * 9) : 0);
      const y = a.y + (b.y - a.y) * k + (hover ? 0.006 * Math.sin(t * 7.3) : 0);
      const heading = Math.atan2(b.y - a.y, (b.x - a.x) * view.aspect) + Math.PI / 2;
      return { ...base, x, y, pose: { kind: 'fly', t: (t * 11) % 1 }, facing: dir, heading, alpha: 1 };
    }

    case 'visit': {
      const flowers = (land ?? []).filter((e) => e.kind === 'flower' && arrival(z, e.from, e.over) > 0.6);
      if (!flowers.length) return null;
      const stops = 4;
      const span = life / stops;
      const i = Math.min(stops - 1, Math.floor(t / span));
      const into = (t - i * span) / span;
      const at = (k: number) => {
        const f = flowers[Math.floor(unit(s.seed, 'f', k, member) * flowers.length)];
        return { x: f.x, y: groundY(f.d, HORIZON) - f.h * (0.3 + 0.7 * f.d) * 0.85 };
      };
      const enter = { x: dir > 0 ? -margin : 1 + margin, y: 0.5 };
      const a = i === 0 ? enter : at(i - 1);
      const b = at(i);
      const k = smooth(Math.min(1, into / 0.35));
      const x = a.x + (b.x - a.x) * k + 0.006 * Math.sin(t * 6 + member);
      const y = a.y + (b.y - a.y) * k - 0.012 - 0.008 * Math.sin(t * 4.3 + member) - (k < 1 ? 0.04 * Math.sin(k * Math.PI) : 0);
      const heading = Math.atan2(b.y - a.y, (b.x - a.x) * view.aspect) + Math.PI / 2;
      return { ...base, x, y, pose: { kind: 'fly', t: (t * 14) % 1 }, facing: b.x >= a.x ? 1 : -1, heading, alpha: fade(t, life, 0.8) };
    }

    case 'walk':
    case 'hop':
    case 'shuffle': {
      const gy = groundY(s.d + (member ? (u('dd') - 0.5) * 0.06 : 0), HORIZON);
      const pace = g.plan === 'deer' ? 0.018 : g.plan === 'fox' ? 0.024 : g.plan === 'hare' ? 0.02 : 0.008;
      const scale = 0.3 + 0.7 * s.d;
      const speed = pace * scale;
      // One pause somewhere along the way, to graze or to look up.
      const stopAt = 0.3 + 0.35 * u('stop');
      const stag = s.species.id.startsWith('stag:');
      const stopFor = stag ? 50 : s.behaviour === 'walk' ? 8 + 10 * u('stopFor') : 3 + 3 * u('stopFor');
      const moving = life - stopFor;
      const travel = (1 + 2 * margin) / Math.max(1, moving);
      const effSpeed = Math.max(speed, travel);
      const tStop = moving * stopAt;
      let run: number;
      let stopped = false;
      if (t < tStop) run = t;
      else if (t < tStop + stopFor) {
        run = tStop;
        stopped = true;
      } else run = t - stopFor;
      const along = -margin + effSpeed * run - member * 0.035;
      const x = dir > 0 ? along : 1 - along;
      if (x < -margin - 0.1 || x > 1 + margin + 0.1) return null;
      let kind: PoseKind = s.behaviour === 'hop' ? 'hop' : 'walk';
      let cycle = (run * (g.plan === 'deer' ? 1.1 : g.plan === 'fox' ? 1.9 : g.plan === 'hare' ? 1.6 : 2.4)) % 1;
      let y = gy;
      if (stopped) {
        kind = g.plan === 'deer' && !stag && u('graze') < 0.6 ? 'graze' : 'stand';
        cycle = 0;
      } else if (s.behaviour === 'hop') {
        y = gy - 0.03 * scale * Math.max(0, Math.sin(cycle * Math.PI));
      }
      return { ...base, x, y, pose: { kind, t: cycle }, facing: dir, heading: 0, alpha: 1 };
    }
  }
}

/* -------------------------------------------------------------- fireflies */

export interface Firefly {
  id: number;
  x: number;
  y: number;
  /** 0 to 1: how lit, on its species' rhythm. */
  lit: number;
  species: Species;
}

/**
 * Fireflies are not visitors. Once the scrub is in, a night wood has a
 * standing crowd of them low among the bushes, each drifting about a home
 * spot and flashing on its species' own rhythm: so many flashes, so far
 * apart, every few seconds, loosely in time with the others of its kind.
 */
export function firefliesAt(wood: Wood, focus: number, scene: number, view: View): Firefly[] {
  if (!view.night) return [];
  const z = successionAt(focus).z;
  const count = Math.floor(Math.max(0, z - 0.14) * 46 * view.density);
  if (!count) return [];
  const kinds: Species[] = [];
  for (const stage of ['scrub', 'young', 'high', 'old', 'meadow'] as Stage[]) {
    for (const sp of wood.pools[stage]) if (sp.genome.plan === 'firefly') kinds.push(sp);
  }
  if (!kinds.length) return [];
  const out: Firefly[] = [];
  for (let i = 0; i < count; i++) {
    const r = (k: string) => unit(wood.key, 'firefly', i, k);
    const sp = kinds[Math.floor(r('kind') * kinds.length)];
    const g = sp.genome;
    const hx = 0.03 + 0.94 * r('x');
    const hy = 0.58 + 0.38 * r('y');
    const x = hx + 0.03 * Math.sin(scene * 0.21 + r('p') * 7) + 0.012 * Math.sin(scene * 0.73 + r('q') * 7);
    const y = hy + 0.02 * Math.sin(scene * 0.27 + r('q') * 7) + 0.01 * Math.sin(scene * 0.9 + r('p') * 7);
    const period = g.period ?? 4;
    const offset = r('sync') * 0.45 + (sp.seed % 997) / 997 * period;
    const into = (((scene + offset) % period) + period) % period;
    let lit = 0;
    const flashes = g.flashes ?? 2;
    const gap = g.gap ?? 0.35;
    for (let f = 0; f < flashes; f++) {
      const start = f * gap;
      const since = into - start;
      if (since >= 0 && since < 0.35) lit = Math.max(lit, since < 0.08 ? since / 0.08 : Math.exp(-(since - 0.08) * 11));
    }
    out.push({ id: i, x, y, lit, species: sp });
  }
  return out;
}

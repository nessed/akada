/**
 * The picture, composed: where the depth falls on the page, the path the
 * jellies make down it, the rocks of the breaks and the rocks passed, the
 * rare things, the floor or the trench, and a cast placed round all of it by
 * a small solver that tries many layouts and keeps the best. Pure and
 * deterministic: the same sitting and shape always come out as the same plan.
 *
 * Everything here is in units of a reference page whose shorter side is
 * 1000 (S), so a phone, a laptop and a poster are composed alike and only the
 * aspect changes the composition.
 *
 * Some rules are hard, not costs to trade: the hero keeps a clear margin
 * round its bell and trails, jellies keep their distance from each other,
 * nothing stands over the window of sky, the big rare things never touch the
 * hero, each other or the rocks. When one is broken, what moves is the rock
 * or the cast, never the way down.
 */

import { buildAnatomy } from '../anatomy';
import type { Species } from '../biome';
import { depthAt, ZONES } from '../depth';
import { EVENTS, type EventKind, type OceanEvent } from '../events';
import { KELP_ROCK, rollKelp, type Kelp } from '../kelp';
import { siphonophoreReach } from '../sightings-shallow';
import { ROCK_GRAMMARS, rockShape, rollGrammar, type RockGrammar } from '../outcrop-sprite';
import { moonPhase, sunFor } from '../light';
import { jellyForBlock } from '../lineage';
import { hash32, mulberry32, type Rand } from '../random';
import { HUES } from '../palette';
import type { GrowthKind } from '../outcrop';
import { DEEP_GROWTHS, growthExtent } from '../outcrop-sprite';
import type { Met, Session } from './encode';

export const REF = 1000;
/** Nothing important closer to an edge than this share of the page. */
export const MARGIN = 0.06;
/** The clear margin round the hero, in units (0.02 S). */
export const CLEAR = 0.02 * REF;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A jelly's build for the picture: the lineage's traits, rolled wider so siblings differ at a glance. */
export interface JellyBuild {
  tentacles: number;
  hairs: number;
  arms: number;
  /** As jelly.ts takes it: the bell's height is 0.4 x this of its width. */
  aspect: number;
  scallops: number;
  stingP: number;
  /** The oral arms' length, the rim's lobes and the tint's turn on the wheel, as jelly.ts takes them. */
  armLength: number;
  lobeDepth: number;
  hueShift: number;
}

export interface PlacedJelly {
  block: number;
  /** The middle of the bell. */
  x: number;
  y: number;
  /** The bell's radius, and how long its trails hang below the rim. */
  r: number;
  len: number;
  aspect: number;
  hero: boolean;
  z: number;
  /** How it is laid: its opacity, its pen's weight, and whether it is far off in the haze. */
  alpha: number;
  weight: number;
  far: boolean;
  /** One of the far shoal of tiny bells the oldest blocks are. */
  shoal: boolean;
  body: JellyBuild;
  /** Its hull: bell and trails. */
  box: Box;
}

/**
 * One of the shared engine's rocks (`rockShape` in outcrop-sprite.ts) that a
 * picture's rock is built from: where its wall stands along the whole
 * rock's span, its own span and how low its top sits (shares of the whole
 * span), and its depth (a share of its own span).
 */
export interface RockPart {
  seed: number;
  at: number;
  span: number;
  dy: number;
  thick: number;
  /** The engine's grammar for it (a heap of boulders, a slab, a spire, an overhang, a field of them). */
  grammar?: RockGrammar;
  /**
   * Its span counts every boulder, out past the engine's nominal lip to the
   * last of them (`partExt`): a rock drawn whole, never cut square at its lip.
   */
  whole?: boolean;
}

/**
 * A rock's silhouette, normalised to its box: `top` and `under` sampled
 * from the end that runs off the page (u = 0) to the lip (u = 1), 0 at the
 * box's top and 1 at its foot. It is one engine rock, or two set together
 * (a tall block behind a lower ledge, a spur standing out at the lip, a
 * pair of humps), so no two on a page share a silhouette.
 */
export interface RockShape {
  parts: RockPart[];
  /** How far its highest point stands above the parts' nominal top, as a share of the span. */
  lift: number;
  /** Height over width, the width counted off the page too: as it shows, its foot let go of. */
  ratio: number;
  top: number[];
  under: number[];
  /** The underside as it reads: above where the wash starts to let go of the foot. */
  solid: number[];
}

export interface PlacedRock {
  /** A break's rock (near), a rock merely passed (far), or the rock the kelp stands on. */
  kind: 'break' | 'passed' | 'kelp';
  /** The rest it stands for, or -1. */
  rest: number;
  /** The outcrop slot it was passed at, or -1. */
  slot: number;
  edge: -1 | 1;
  /** The top of its box, and its height, in units. */
  y: number;
  height: number;
  /** How far it reaches in from the edge, and how far it runs on off the page, as shares of the width. */
  reach: number;
  off: number;
  /** 2 near, 1 middle, 0 far. */
  plane: 0 | 1 | 2;
  zone: number;
  seconds: number;
  seed: number;
  shape: RockShape;
  /** Its box on the page. */
  box: Box;
  /** The wall it stands out from (`Plan.walls`): rock and wall are one solid, and `rockTouches` counts both. */
  wall?: Wall;
}

/**
 * A side wall: the cliff a side's rocks stand out from, so none floats.
 * It runs from under its top rock (or its top ledge) down to the floor, the
 * trench's wall or the foot of the page, a narrow strip at the page's edge
 * that flares into a buttress under each rock, so no rock is a cap on a
 * stem, and carries the ledges of the older breaks its rocks could not.
 */
export interface Wall {
  edge: -1 | 1;
  /** Where it starts and where it is lost in the ground, in units. */
  top: number;
  bottom: number;
  /** The plane of its top rock: how strongly it is drawn. */
  plane: 0 | 1 | 2;
  seed: number;
  /** How far in from the page's edge its face stands, every `WALL_STEP` units down from `top`. */
  face: number[];
  /** The older breaks it carries as ledges: the depth of the bench, how far it juts past the face, the rest. */
  ledges: { y: number; jut: number; rest: number }[];
  /** Its beds, top down: where each course of stone begins; the face steps a little at each. */
  beds: number[];
}

/** A wall's own width (where nothing stands out from it), as shares of the page's width. */
export const WALL_W: [number, number] = [0.035, 0.065];

/** The wall's face is sampled every this many units down. */
export const WALL_STEP = 5;

export interface PlacedEvent {
  kind: EventKind;
  seed: number;
  /** Focus seconds it began at. */
  start: number;
  /** How far through it the picture catches it. */
  age: number;
  /** The region it is drawn into: its top-left on the page, its size, and whether it is mirrored. */
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  mirror: boolean;
  /** Where on the page it lands, near enough. */
  x: number;
  y: number;
  far: boolean;
  /** What the cast keeps out of, when it is something to keep out of. */
  box: Box | null;
  /** Meant to sit at the page's edge (the eye looking in). */
  edge: boolean;
  /** A jelly to look at (the turtle), in region units. */
  look?: { x: number; y: number };
  /** How it lies, for the siphonophore. */
  lie?: number;
}

export interface PlacedAnimal {
  /** The pool and the place in it. */
  zone: number;
  slot: number;
  id: string;
  layer: 0 | 1 | 2;
  x: number;
  y: number;
  len: number;
  dir: 1 | -1;
  alpha: number;
  rare: boolean;
  floor: boolean;
  /** A school: each member's offset from the middle, and its length. */
  members: { dx: number; dy: number; len: number; phase: number }[] | null;
  phase: number;
  box: Box;
}

/** Where a trench's walls start at the page's edges, a share of its height (tall, wide): low enough that the water over it is the hero's stage. */
export const TRENCH_TOP: [number, number] = [0.73, 0.77];
/** How much higher they start on the longest sittings (four and a half hours and more), a share of its height. */
export const TRENCH_RISE = 0.05;
/** Where a whale fall lies in a trench, its wall starts in a level shelf, this share of the wall's run, before it falls. */
export const TRENCH_SHELF = 0.45;

export interface Trench {
  /** The middle of the cleft, and its width at the foot of the page, in units. */
  x: number;
  gap: number;
  /** Where the walls start at the page's edges. */
  top: number;
  /** How the walls fall: gently at first, then steeply into the cleft. */
  fall: number;
  /** How much of each wall's run (left, right), from the page's edge, is a level shelf before it starts to fall. */
  shelf?: [number, number];
  /**
   * Each wall (left, right) broken into ledges: where each drop is across
   * the wall (0 at the page's edge, 1 at the cleft), its share of the
   * wall's fall, and how wide the drop is. Benches between them.
   */
  ledges: [number, number, number][][];
}

export interface Plan {
  key: string;
  courseKey: string;
  color: string;
  ground: 'paper' | 'night';
  /** The page in units, and CSS px to a unit. */
  w: number;
  h: number;
  unit: number;
  tall: boolean;
  seed: number;
  focus: number;
  meters: number;
  zone: number;
  zMax: number;
  hour: number;
  night: boolean;
  moon: number | null;
  current: 1 | -1;
  /** The depth dial down the page. */
  zStops: { y: number; z: number }[];
  window: { x: number; y: number; r: number };
  /** What nothing may stand over: the window of sky and its rim. */
  windowBox: Box;
  /** The way down, surface to the hero, as flat x, y points. */
  path: number[];
  jellies: PlacedJelly[];
  /** Far to near: the rocks passed, the rocks of the breaks, the rock the kelp stands on. */
  rocks: PlacedRock[];
  /** The side walls the rocks stand out from, at most one a side. */
  walls: Wall[];
  kelp: { bottom: number; top: number; keep: number[]; mirror?: boolean } | null;
  /** Where the kelp forest stands on the page (its stalks and canopy), in units. */
  kelpZones: Box[];
  /** The calm water the page keeps: nothing in it but water, light and bubbles. */
  calm: Box;
  /** Which of a few real arrangements the page takes. */
  composition: Composition;
  /** What grows on the rocks, the wall and the floor, and the length of stone and floor it was laid along (units). */
  life: PlacedLife[];
  lifeEdge: number;
  floor: { y: number; amp: number; phase: number } | null;
  trench: Trench | null;
  events: PlacedEvent[];
  cast: PlacedAnimal[];
  bubbles: { x: number; y: number; r: number }[];
  /** The lowest thing in the picture that is not the floor: below it the page falls away. */
  contentBottom: number;
  /** How well the winning layout fits (the solver's cost, lower is better): about the layout, never the sitting. */
  fit: number;
  /** Sightings the page had room to draw (two at most) that it could not keep. */
  missed?: number;
  /** The far shoal of the oldest blocks, its tiny bells and the cloud they make, or null. */
  shoal?: Shoal | null;
  /** Where a second sheaf of the light comes down, out over the open water when nothing else stands in it (its source, units), or null. */
  sheaf?: { x: number; y: number } | null;
}

/* ---- The depth on the page ---- */

/** How much room each zone gets when it is crossed whole: perceptual, not metres. */
const ROOM = [1, 1, 0.95, 0.85, 0.55];

/** How far down the page a focus second is, in zone-room. */
export function roomAt(focus: number): number {
  const min = Math.max(0, focus) / 60;
  let p = 0;
  for (let i = 0; i < ZONES.length; i++) {
    const zn = ZONES[i];
    if (min >= zn.to) {
      p += ROOM[i];
      continue;
    }
    p += ROOM[i] * Math.max(0, (min - zn.from) / (zn.to - zn.from));
    break;
  }
  return p;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

export function area(b: Box): number {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
}

export function inter(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The share of the smaller of two boxes that the other covers. */
export function overlapShare(a: Box, b: Box): number {
  const i = inter(a, b);
  if (!i) return 0;
  return i / Math.max(1e-6, Math.min(area(a), area(b)));
}

/** The gap between two boxes, 0 if they touch or overlap. */
export function boxGap(a: Box, b: Box): number {
  const gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  return Math.hypot(gx, gy);
}

const grow = (b: Box, d: number): Box => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });

function gauss(r: Rand): number {
  return (r() + r() + r() - 1.5) / 1.5;
}

const range = (r: Rand, a: number, b: number) => a + (b - a) * r();
const unit01 = (...parts: (string | number)[]) => (hash32(...parts) % 100000) / 100000;

/* ---- Species, measured ---- */

const shapeOf = new Map<string, { w: number; h: number }>();

/** A species' outline, as shares of its longest side. */
function proportions(sp: Species): { w: number; h: number } {
  let s = shapeOf.get(sp.id);
  if (!s) {
    const a = buildAnatomy(sp.genome, sp.seed);
    const w = Math.max(1e-6, a.maxX - a.minX);
    const h = Math.max(1e-6, a.maxY - a.minY);
    const m = Math.max(w, h);
    s = { w: w / m, h: h / m };
    if (shapeOf.size > 2000) shapeOf.clear();
    shapeOf.set(sp.id, s);
  }
  return s;
}

/* ---- Rock ---- */

const ROCK_N = 40;
/** Where the engine's wash has run dry at the foot, as a share of its height. */
export const ROCK_FOOT = 0.88;
/** Where it starts to let go of the foot: the silhouette's edge stops reading below this. */
export const ROCK_SOLID = 0.62;

const profiles = new Map<string, { top: number[]; under: number[]; solid: number[]; ext: number }>();

/**
 * An engine rock's outline across its own span (u 0 to 1), in shares of
 * that span below its nominal top: the top its boulders make, and their
 * underside down to where the wash lets go of it. `whole`: the span runs
 * on past the engine's nominal lip to its last boulder (`ext` times it).
 */
function profile(seed: number, thick: number, grammar: RockGrammar = 'heap', whole = false): { top: number[]; under: number[]; solid: number[]; ext: number } {
  const key = `${seed}|${thick}|${grammar}|${whole ? 1 : 0}`;
  const hit = profiles.get(key);
  if (hit) return hit;
  const S0 = 100;
  const shape = rockShape(seed, S0, thick * S0, 1, grammar);
  const ext = whole ? Math.max(1, shape.hi / S0) : 1;
  const S = S0 * ext;
  const foot = shape.height * ROCK_FOOT;
  const firm = shape.height * ROCK_SOLID;
  const ph = [((seed >>> 3) % 628) / 100, ((seed >>> 11) % 628) / 100];
  const top: number[] = [];
  const under: number[] = [];
  const solid: number[] = [];
  for (let i = 0; i <= ROCK_N; i++) {
    const x = (i / ROCK_N) * S;
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of shape.boulders) {
      const m = b.pts.length / 2;
      for (let k = 0; k < m; k++) {
        const j = (k + 1) % m;
        const x0 = b.pts[k * 2];
        const x1 = b.pts[j * 2];
        if ((x0 - x) * (x1 - x) > 0 || x0 === x1) continue;
        const y = b.pts[k * 2 + 1] + ((b.pts[j * 2 + 1] - b.pts[k * 2 + 1]) * (x - x0)) / (x1 - x0);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
    }
    if (!Number.isFinite(lo)) {
      lo = shape.top(x);
      hi = lo + 1;
    }
    top.push(lo / S);
    if (whole) {
      // Drawn whole and cut here: its underside rises from the wall toward
      // the lip, as a ledge's does, rough, and never thinner than a third
      // of it (nor below its stone).
      const q = i / ROCK_N;
      const cut = shape.height * (ROCK_FOOT - 0.36 * q ** 1.4 + 0.035 * Math.sin(q * 8.3 + ph[0]) + 0.018 * Math.sin(q * 21 + ph[1]));
      const u = Math.min(hi, Math.max(cut, lo + shape.height * 0.34));
      under.push(Math.max(lo, u) / S);
      solid.push(Math.max(lo, Math.min(firm, u)) / S);
    } else {
      under.push(Math.max(lo, Math.min(foot, hi)) / S);
      solid.push(Math.max(lo, Math.min(firm, hi)) / S);
    }
  }
  const made = { top, under, solid, ext };
  if (profiles.size > 800) profiles.clear();
  profiles.set(key, made);
  return made;
}

/**
 * How much longer than the engine's nominal span a part's whole rock runs
 * (1 unless `whole`): the engine draws it at its part's span over this, so
 * its last boulder ends at the part's lip.
 */
export function partExt(p: RockPart): number {
  return p.whole ? profile(p.seed, p.thick, p.grammar, true).ext : 1;
}

const silhouettes = new Map<string, RockShape>();

/** The silhouette of engine rocks set together, normalised to its box. */
export function rockSilhouette(parts: RockPart[]): RockShape {
  const ps = parts.map((p) => ({ ...p, thick: Math.round(p.thick * 1000) / 1000 }));
  const key = ps.map((p) => `${p.seed}|${p.at}|${p.span}|${p.dy}|${p.thick}|${p.grammar ?? 'heap'}|${p.whole ? 1 : 0}`).join(';');
  const hit = silhouettes.get(key);
  if (hit) return hit;
  const top: number[] = [];
  const under: number[] = [];
  const solid: number[] = [];
  const prof = ps.map((p) => profile(p.seed, p.thick, p.grammar, p.whole));
  for (let i = 0; i <= ROCK_N; i++) {
    const u = i / ROCK_N;
    let t = Infinity;
    let b = -Infinity;
    let sb = -Infinity;
    ps.forEach((p, k) => {
      const lu = (u - p.at) / p.span;
      if (lu < 0 || lu > 1) return;
      const f = lu * ROCK_N;
      const i0 = Math.floor(f);
      const i1 = Math.min(ROCK_N, i0 + 1);
      const q = f - i0;
      const pt = prof[k].top[i0] * (1 - q) + prof[k].top[i1] * q;
      const pu = prof[k].under[i0] * (1 - q) + prof[k].under[i1] * q;
      const ps2 = prof[k].solid[i0] * (1 - q) + prof[k].solid[i1] * q;
      t = Math.min(t, p.dy + pt * p.span);
      b = Math.max(b, p.dy + pu * p.span);
      sb = Math.max(sb, p.dy + ps2 * p.span);
    });
    if (!Number.isFinite(t)) {
      t = top.length ? top[top.length - 1] : 0;
      b = under.length ? under[under.length - 1] : t + 0.05;
      sb = solid.length ? solid[solid.length - 1] : t + 0.05;
    }
    top.push(t);
    under.push(b);
    solid.push(sb);
  }
  if (ps.every((p) => p.whole)) {
    // A whole rock's underside only rises (a little rough) from its wall
    // out to its lip: no boulder hangs under the lip as a tail, cut off.
    for (let i = 1; i <= ROCK_N; i++) {
      under[i] = Math.max(top[i], Math.min(under[i], under[i - 1] + 0.012));
      solid[i] = Math.max(top[i], Math.min(solid[i], under[i]));
    }
  }
  const minY = Math.min(...top);
  const maxY = Math.max(...under);
  const span = Math.max(1e-6, maxY - minY);
  const made: RockShape = {
    parts: ps,
    lift: -minY,
    ratio: span,
    top: top.map((v) => (v - minY) / span),
    under: under.map((v) => (v - minY) / span),
    solid: solid.map((v) => (v - minY) / span),
  };
  if (silhouettes.size > 800) silhouettes.clear();
  silhouettes.set(key, made);
  return made;
}

/**
 * A rock of a kind, about `want` tall for its width: one heap (0), a tall
 * block behind a lower ledge (1), a spur standing up at the lip from a low
 * shelf (2), or two humps, the outer one lower (3).
 */
export function rockOfKind(seed: number, kind: number, want: number, exact = true, grammar: RockGrammar = 'heap'): RockShape {
  const r = mulberry32(hash32('rock-kind', seed, kind));
  const sd = (i: number) => hash32(seed, 'part', i);
  const build = (k: number): RockPart[] => {
    switch (kind) {
      case 1: {
        const sp = 0.42 + 0.14 * r();
        return [
          { seed: sd(0), at: 0, span: sp, dy: 0, thick: 1.15 * k },
          { seed: sd(1), at: 0, span: 1, dy: (0.2 + 0.1 * r()) * k, thick: 0.5 * k },
        ];
      }
      case 2: {
        const sp = 0.4 + 0.15 * r();
        return [
          { seed: sd(0), at: 0, span: 1, dy: (0.24 + 0.1 * r()) * k, thick: 0.5 * k },
          { seed: sd(1), at: 1 - sp, span: sp, dy: 0, thick: 1.2 * k },
        ];
      }
      case 3: {
        const a = 0.55 + 0.1 * r();
        return [
          { seed: sd(0), at: 0, span: a, dy: 0, thick: 0.95 * k },
          { seed: sd(1), at: a * 0.55, span: 1 - a * 0.55, dy: (0.08 + 0.1 * r()) * k, thick: 0.8 * k },
        ];
      }
      default:
        return [{ seed: sd(0), at: 0, span: 1, dy: 0, thick: 0.9 * k }];
    }
  };
  // Scaled to stand as tall as asked, as near as the engine goes.
  let k = want;
  const dressed = (parts: RockPart[]) => parts.map((p) => (grammar === 'heap' ? { ...p, whole: true } : { ...p, grammar, whole: true }));
  // A slab or an overhang is one rock: stacked, they read as tables.
  if ((grammar === 'slab' || grammar === 'overhang') && kind !== 0) kind = 0;
  let s = rockSilhouette(dressed(build(k)));
  for (let i = 0; i < (exact ? 3 : 0) && Math.abs(s.ratio - want) > 0.02; i++) {
    k = Math.max(0.35, Math.min(1.6, k * (want / Math.max(0.05, s.ratio))));
    k = Math.round(k * 50) / 50;
    s = rockSilhouette(dressed(build(k)));
  }
  return s;
}

/** The same rock, standing `want` tall for its width (its parts' depths scaled). */
export function rockOfRatio(shape: RockShape, want: number): RockShape {
  let k = 1;
  let s = shape;
  // (Again while it is short of half as tall as it is wide: never a sliver.)
  for (let i = 0; i < 1 || (i < 4 && s.ratio < 0.5 && want >= 0.5); i++) {
    k = Math.max(0.3, Math.min(1.6, k * (want / Math.max(0.05, s.ratio))));
    k = Math.round(k * 50) / 50;
    s = rockSilhouette(shape.parts.map((p) => ({ ...p, thick: p.thick * k, dy: p.dy * k })));
  }
  return s;
}

/**
 * How alike two silhouettes are as they read (crest to where the foot
 * starts to fade), each normalised to its own box: intersection over union
 * on a grid.
 */
export function rockIoU(a: RockShape, b: RockShape): number {
  const G = 28;
  const norm = (s: RockShape) => {
    const lo = Math.min(...s.top);
    const hi = Math.max(...s.solid);
    const k = 1 / Math.max(1e-6, hi - lo);
    return { top: s.top.map((v) => (v - lo) * k), bot: s.solid.map((v) => (v - lo) * k) };
  };
  const A = norm(a);
  const B = norm(b);
  let both = 0;
  let either = 0;
  for (let i = 0; i < G; i++) {
    const u = (i + 0.5) / G;
    const k = u * ROCK_N;
    const i0 = Math.floor(k);
    const i1 = Math.min(ROCK_N, i0 + 1);
    const f = k - i0;
    const ta = A.top[i0] * (1 - f) + A.top[i1] * f;
    const ua = A.bot[i0] * (1 - f) + A.bot[i1] * f;
    const tb = B.top[i0] * (1 - f) + B.top[i1] * f;
    const ub = B.bot[i0] * (1 - f) + B.bot[i1] * f;
    for (let j = 0; j < G; j++) {
      const v = (j + 0.5) / G;
      const inA = v >= ta && v <= ua;
      const inB = v >= tb && v <= ub;
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  }
  return either ? both / either : 0;
}

/** How differently two rocks' crests run, normalised to their boxes: the mean gap between them, 0 to 1. */
export function crestDiff(a: RockShape, b: RockShape): number {
  let d = 0;
  for (let i = 0; i <= ROCK_N; i++) d += Math.abs(a.top[i] - b.top[i]);
  return d / (ROCK_N + 1);
}

const alike = new WeakMap<RockShape, WeakMap<RockShape, boolean>>();

/** Whether two rocks would read as the same rock: their silhouettes alike and their crests too. */
export function sameRock(a: RockShape, b: RockShape): boolean {
  let m = alike.get(a);
  if (!m) {
    m = new WeakMap();
    alike.set(a, m);
  }
  const hit = m.get(b);
  if (hit !== undefined) return hit;
  const v = rockIoU(a, b) > 0.6 && crestDiff(a, b) < 0.05;
  m.set(b, v);
  return v;
}

/** The page x of a rock at u (0 off the page, 1 the lip), in units. */
export function rockX(k: PlacedRock, w: number, u: number): number {
  const span = (k.off + k.reach) * w;
  return k.edge < 0 ? -k.off * w + u * span : w + k.off * w - u * span;
}

/** The rock's top and foot at page x, or null where it is not. */
export function rockSpan(k: PlacedRock, w: number, x: number): [number, number] | null {
  const span = (k.off + k.reach) * w;
  const u = k.edge < 0 ? (x + k.off * w) / span : (w + k.off * w - x) / span;
  if (u < 0 || u > 1) return null;
  const f = u * ROCK_N;
  const i0 = Math.floor(f);
  const i1 = Math.min(ROCK_N, i0 + 1);
  const t = f - i0;
  const top = k.shape.top[i0] * (1 - t) + k.shape.top[i1] * t;
  const under = k.shape.under[i0] * (1 - t) + k.shape.under[i1] * t;
  return [k.y + top * k.height, k.y + under * k.height];
}

/** How far in from its edge a wall's face stands at depth y (units), or null above or below it. */
export function wallAt(wall: Wall, y: number): number | null {
  if (y < wall.top || y > wall.bottom) return null;
  const f = (y - wall.top) / WALL_STEP;
  const i0 = Math.min(wall.face.length - 1, Math.floor(f));
  const i1 = Math.min(wall.face.length - 1, i0 + 1);
  return wall.face[i0] + (wall.face[i1] - wall.face[i0]) * (f - i0);
}

/** Whether a wall comes within `pad` of a box. */
export function wallTouches(wall: Wall, w: number, b: Box, pad = 0): boolean {
  const y0 = Math.max(wall.top, b.y0 - pad);
  const y1 = Math.min(wall.bottom, b.y1 + pad);
  if (y1 < y0) return false;
  // How far in from the wall's edge the box comes.
  const reach = wall.edge < 0 ? b.x0 - pad : w - (b.x1 + pad);
  for (let y = y0; ; y = Math.min(y1, y + WALL_STEP * 0.5)) {
    const f = wallAt(wall, y);
    if (f != null && f > reach) return true;
    if (y >= y1) break;
  }
  return false;
}

/** Whether the rock's silhouette, or the wall it stands out from, comes within `pad` of a box. */
export function rockTouches(k: PlacedRock, w: number, b: Box, pad = 0): boolean {
  if (k.wall && wallTouches(k.wall, w, b, pad)) return true;
  const x0 = b.x0 - pad;
  const x1 = b.x1 + pad;
  if (x1 < k.box.x0 || x0 > k.box.x1 || b.y1 + pad < k.box.y0 || b.y0 - pad > k.box.y1) return false;
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const s = rockSpan(k, w, x);
    if (s && s[0] < b.y1 + pad && s[1] > b.y0 - pad) return true;
  }
  return false;
}

/** The rock's outline in units, closed: along the top from off the page to the lip, then back underneath. */
export function rockOutline(k: PlacedRock, w: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= ROCK_N; i++) pts.push(rockX(k, w, i / ROCK_N), k.y + k.shape.top[i] * k.height);
  for (let i = ROCK_N; i >= 0; i--) pts.push(rockX(k, w, i / ROCK_N), k.y + k.shape.under[i] * k.height);
  return pts;
}

function rockBox(k: Omit<PlacedRock, 'box'>, w: number): Box {
  const lip = k.reach * w;
  return k.edge < 0 ? { x0: 0, x1: lip, y0: k.y, y1: k.y + k.height } : { x0: w - lip, x1: w, y0: k.y, y1: k.y + k.height };
}

/* ---- The walls ---- */

/** The forest as the picture rolls it (paint.ts rolls it the same): its far side's stragglers left out, which read as a vine. */
export const PICTURE_KELP = { farSide: 'none' } as const;

/** The forest seen from the other side: its stalks across the page mirrored, its ledges on the other wall. */
export function mirrorKelp(k: Kelp, mirror: boolean | undefined): Kelp {
  if (!mirror) return k;
  return { stalks: k.stalks.map((st) => ({ ...st, x: 1 - st.x })), ledges: k.ledges.map((l) => ({ ...l, edge: -l.edge as -1 | 1 })) };
}

/** Rocks a side, the kelp's own counted. */
export const SIDE_ROCKS = 2;
/** The widest a rock may stand over the wall it comes out of: its width on the page over its buttress's. */
export const STEM = 1.6;

/**
 * Where a rock's buttress is: the wall flared out under it, as wide as the
 * rock's width on the page over `STEM` from inside the rock down to where its
 * underside reads, then narrowing to the wall's own width.
 */
function buttressOf(k: Omit<PlacedRock, 'box'>, w: number, h: number, firmOnly = false): { y0: number; y1: number; y2: number; flare: number } {
  let low = 0;
  // (A picture's rock is drawn whole down to its underside, the kelp's let go of at its foot.)
  // (Over the stretch the buttress stands under: from the page's edge to its flare.)
  // (`firmOnly`: down to where it once let go, as the rocks are placed.)
  const prof = k.kind === 'kelp' || firmOnly ? k.shape.solid : k.shape.under;
  const span = (k.off + k.reach) * w;
  const ua = Math.floor((k.off * w * (prof.length - 1)) / span);
  const ub = Math.ceil(((k.off * w + (k.reach * w) / STEM) * (prof.length - 1)) / span);
  for (let i = Math.max(0, Math.min(prof.length - 1, ua)); i <= Math.min(prof.length - 1, ub); i++) low = Math.max(low, prof[i]);
  const y1 = k.y + low * k.height;
  // Narrowing to the wall's own width by as far under where its underside
  // once let go (`solid`) as ever, but never before its underside now.
  let firm = 0;
  for (const v of k.shape.solid) firm = Math.max(firm, v);
  const y2 = Math.max(k.y + firm * k.height + Math.max(k.height * 0.9, h * 0.06), y1 + h * 0.03);
  return { y0: k.y + k.height * (k.kind === 'kelp' ? 0.45 : 0.3), y1, y2, flare: (k.reach * w) / STEM };
}

/**
 * How far in from its edge the rock stands unbroken at depth y, its top
 * above y all the way: a buttress inside the rock goes no further, so it
 * never shows as a block in a cleft of the rock's crest (between two
 * spires) or over a low shelf of it.
 */
function coveredTo(k: Omit<PlacedRock, 'box'>, w: number, y: number, most: number): number {
  const step = 2;
  for (let d = 0; d < most; d += step) {
    const s = rockSpan(k as PlacedRock, w, k.edge < 0 ? d : w - d);
    if (!s || s[0] > y) return Math.max(0, d - step);
  }
  return most;
}

/** How far in from its edge a rock's buttress stands at depth y, over a wall `base` wide; 0 where it is not. `inside`: no further than the rock covers it above its underside. */
function buttressAt(k: Omit<PlacedRock, 'box'>, w: number, h: number, y: number, base: number, inside = false, firmOnly = false): number {
  const b = buttressOf(k, w, h, firmOnly);
  if (y < b.y0 || y > b.y2) return 0;
  const flare = Math.max(base, b.flare);
  if (y <= b.y1) return inside ? Math.max(base, coveredTo(k, w, y, flare)) : flare;
  const t = (y - b.y1) / Math.max(1e-6, b.y2 - b.y1);
  return base + (flare - base) * (1 - t * t * (3 - 2 * t));
}

/** Whether a rock's buttress, over the narrowest wall, comes within `pad` of a box. */
function buttressTouches(k: Omit<PlacedRock, 'box'>, w: number, h: number, b: Box, pad: number): boolean {
  const reach = k.edge < 0 ? b.x0 - pad : w - (b.x1 + pad);
  if (reach >= (k.reach * w) / STEM) return false;
  const bt = buttressOf(k, w, h, true);
  const y0 = Math.max(bt.y0, b.y0 - pad);
  const y1 = Math.min(bt.y2, b.y1 + pad);
  if (y1 < y0) return false;
  for (let y = y0; ; y = Math.min(y1, y + 3)) {
    if (buttressAt(k, w, h, y, 0, false, true) > reach) return true;
    if (y >= y1) break;
  }
  return false;
}

/**
 * The side walls: one for each side with a rock or a ledge on it, from
 * under its top rock down into the ground, a strip 0.04 to 0.09 of the width
 * with a buttress under each rock and a ledge for each older break that
 * came to no rock of its own. The face gives way to every jelly (and to the
 * window): never within the hero's margin, never on a jelly.
 */
function buildWalls(
  rocks: PlacedRock[],
  extra: { rest: number; y: number; nearX: number }[],
  e: { w: number; h: number; jellies: PlacedJelly[]; winBox: Box; groundY: (x: number) => number; seed: number; side: -1 | 1; kelpBottom: number | null },
): Wall[] {
  const { w, h } = e;
  const S = Math.min(w, h);
  const bases = new Map<-1 | 1, number>();
  for (const edge of [-1, 1] as const) {
    const r = mulberry32(hash32(e.seed, 'wall-base', edge));
    bases.set(edge, w * (WALL_W[0] + (WALL_W[1] - WALL_W[0]) * r()));
  }
  // The older breaks with no rock: each a ledge on the wall with the most
  // room at its depth, kept off the rocks and each other on that wall.
  const ledges = new Map<-1 | 1, { y: number; jut: number; rest: number }[]>([
    [-1, []],
    [1, []],
  ]);
  const roomAtY = (edge: -1 | 1, y: number) => {
    let d = Infinity;
    for (const k of rocks) if (k.edge === edge) d = Math.min(d, Math.max(0, k.y - y, y - (k.y + k.height)));
    for (const l of ledges.get(edge) ?? []) d = Math.min(d, Math.abs(l.y - y));
    return d;
  };
  for (const x of [...extra].sort((a, b) => a.y - b.y)) {
    let best: { edge: -1 | 1; y: number; score: number } | null = null;
    // On the page's one wall; on the other side only if that wall has no room left.
    // (Closer together on it, a little, before the other side.)
    for (const [edge, need, from] of [[e.side, 0.05, 0.1], [e.side, 0.036, 0.1], [e.side, 0.03, 0.06], [e.side, 0.024, 0.05], [e.side, 0.018, 0.05], [e.side, 0.012, 0.04]] as [-1 | 1, number, number][]) {
      if (best) break;
      for (let k = 0; k <= 90; k++) {
        const y = clamp(x.y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h * 0.02, h * from, Math.min(h * 0.9, e.groundY(edge < 0 ? 0 : w) - h * 0.06));
        const room = roomAtY(edge, y);
        if (room < h * need) continue;
        // Never in the kelp forest, nor over the window.
        if (rocks.some((o) => o.kind === 'kelp' && o.edge === edge && y < o.y + o.height)) continue;
        if (y < e.winBox.y1 + h * 0.03 && (edge < 0 ? e.winBox.x0 < w * 0.15 : e.winBox.x1 > w * 0.85)) continue;
        // Near its depth, on the wall that has one already, toward its jelly.
        // (Above the wall's top rock it would carry the wall up the page with it.)
        const top = Math.min(...rocks.filter((o) => o.edge === edge).map((o) => o.y + o.height * 0.5));
        const score = Math.abs(y - x.y) / h + (Number.isFinite(top) ? (Math.max(0, top - y) / h) * 3 : 0.3) + ((x.nearX < w / 2 ? -1 : 1) === edge ? 0 : 0.08);
        if (!best || score < best.score) best = { edge, y, score };
      }
    }
    if (!best) best = { edge: e.side, y: clamp(x.y, h * 0.15, h * 0.85), score: 0 };
    const r = mulberry32(hash32(e.seed, 'wall-ledge', x.rest));
    (ledges.get(best.edge) as { y: number; jut: number; rest: number }[]).push({ y: best.y, jut: S * (0.022 + 0.016 * r()), rest: x.rest });
  }
  const walls: Wall[] = [];
  for (const edge of [-1, 1] as const) {
    const side = rocks.filter((k) => k.edge === edge);
    const lg = ledges.get(edge) as { y: number; jut: number; rest: number }[];
    if (!side.length && !lg.length) continue;
    const base = bases.get(edge) as number;
    const r = mulberry32(hash32(e.seed, 'wall', edge));
    const tops = [...side.map((k) => buttressOf(k, w, h).y0), ...lg.map((l) => l.y - h * 0.03)];
    const top = Math.min(...tops);
    // (A wall on the far side holding only the ledges the page's wall had no
    // room for stands far off in the water, so the open side stays open.)
    // (As near as its nearest rock: a wall hazed behind a near rock reads as glass between its ledges.)
    const plane: 0 | 1 | 2 = side.length ? (Math.max(...side.map((k) => k.plane)) as 0 | 1 | 2) : edge !== e.side ? 0 : 1;
    // Into the ground: the floor's line (or the trench wall's top) a little in from the edge.
    const gx = edge < 0 ? base : w - base;
    // (And at least under each of its rocks, one resting low on the ground too.)
    const bottom = Math.min(h + 4, Math.max(e.groundY(gx) + h * 0.03, ...side.map((k) => buttressOf(k, w, h).y1 + h * 0.02)));
    const n = Math.max(2, Math.ceil((bottom - top) / WALL_STEP) + 1);
    const ph = [r() * TAU, r() * TAU, r() * TAU];
    // Courses of stone, each standing a little in or out of the next, so
    // the face steps at its beds as a cliff's does.
    const beds: number[] = [];
    const jogs: number[] = [];
    for (let y = top - h * 0.01 * r(); y < top + (n - 1) * WALL_STEP; y += h * (0.022 + 0.026 * r())) {
      beds.push(y);
      jogs.push(base * (r() - 0.45) * (plane === 0 ? 0.12 : 0.55));
    }
    const jogAt = (y: number) => {
      let i = 0;
      while (i + 1 < beds.length && beds[i + 1] <= y) i++;
      return jogs[i] ?? 0;
    };
    const face: number[] = [];
    const keepOff = e.jellies.filter((j) => plane === 0 || !j.far).map((j) => j.box);
    keepOff.push(e.winBox);
    for (let i = 0; i < n; i++) {
      const y = top + i * WALL_STEP;
      // A cliff's face, never ruled: long bays and short ones.
      const jog = jogAt(y);
      let f = base * (1 + 0.1 * Math.sin(y / (h * 0.055) + ph[0]) + 0.03 * Math.sin(y / (h * 0.011) + ph[1]) + 0.015 * Math.sin(y / (h * 0.004) + ph[2])) + jog;
      for (const k of side) {
        const bt = buttressAt(k, w, h, y, f, true);
        f = Math.max(f, bt + (bt >= buttressAt(k, w, h, y, f) - 1e-6 ? Math.max(0, jog) * 0.6 : 0));
      }
      for (const l of lg) {
        // A bench: out at once at its top, its underside going back into the wall.
        const t = (y - l.y) / (h * 0.032);
        const p = t < -0.12 ? 0 : t < 0 ? 1 - (t / -0.12) ** 2 : t < 1 ? 1 - t ** 1.6 : 0;
        f = Math.max(f, base + l.jut * p);
      }
      // In the rows a rock covers, its face stays inside the rock: never
      // showing in the notches between the rock's beds.
      for (const k of side) {
        const at = rockSpan(k as PlacedRock, w, edge < 0 ? 1 : w - 1);
        if (!at || y < at[0] || y > buttressOf(k, w, h).y1) continue;
        f = Math.min(f, Math.max(10, coveredTo(k, w, y, f)));
      }
      for (const b of keepOff) {
        if (y < b.y0 - CLEAR - 1 || y > b.y1 + CLEAR + 1) continue;
        f = Math.min(f, (edge < 0 ? b.x0 : w - b.x1) - CLEAR - 1);
      }
      face.push(Math.max(2, f));
    }
    walls.push({ edge, top, bottom: top + (n - 1) * WALL_STEP, plane, seed: hash32(e.seed, 'wall', edge), face, ledges: lg, beds });
  }
  return walls;
}

/** A shape for a new rock unlike any already on the page. */
function distinctShape(seed: number, want: number, others: RockShape[]): RockShape {
  let bestIoU = Infinity;
  const first = seed % 4;
  // A grammar of its own as well: a slab, a spire, an overhang, a field of
  // boulders or a heap, the page's rocks each told by its build.
  const g0 = ROCK_GRAMMARS.indexOf(rollGrammar(hash32(seed, 'grammar')));
  const grammarOf = (t: number) => ROCK_GRAMMARS[(g0 + t) % ROCK_GRAMMARS.length];
  const used = new Set(others.map((o) => o.parts[0]?.grammar ?? 'heap'));
  let bestT = 0;
  for (let t = 0; t < (others.length ? 10 : 1); t++) {
    // Judged roughly (the silhouette, normalised, hardly cares how tall it is asked to be), made exactly after.
    const s = rockOfKind(hash32(seed, 'try', t), (first + t) % 4, want, false, grammarOf(t));
    // Alike in silhouette counts, and more so with the crest alike as well, and a grammar already on the page.
    const worst = others.reduce((a, o) => Math.max(a, rockIoU(s, o) + Math.max(0, 0.12 - crestDiff(s, o))), 0) + (used.has(grammarOf(t)) ? 0.25 : 0);
    if (worst < bestIoU) {
      bestIoU = worst;
      bestT = t;
    }
    if (t >= 1 && !used.has(grammarOf(t)) && !others.some((o) => sameRock(s, o))) break;
  }
  return rockOfKind(hash32(seed, 'try', bestT), (first + bestT) % 4, want, true, grammarOf(bestT));
}

/* ---- The floor and the trench ---- */

/** The floor's line at x, in units: long low swells, and smaller ones on them. */
export function floorAt(plan: { w: number; h: number; floor: Plan['floor']; trench: Plan['trench'] }, x: number): number {
  const f = plan.floor;
  if (!f) return plan.h;
  const k = plan.w / 1000;
  const swell = f.amp * (0.62 * Math.sin(x / (140 * k) + f.phase) + 0.28 * Math.sin(x / (37 * k) + f.phase * 2) + 0.04 * Math.sin(x / (9 * k) + f.phase));
  const t = plan.trench;
  if (!t) return f.y + swell;
  // The walls of the trench: from their top at the page's edges, falling
  // gently and then steeply to the foot of the page, either side of a cleft.
  const l = t.x - t.gap / 2;
  const r = t.x + t.gap / 2;
  if (x > l && x < r) return plan.h * 2;
  const left = x <= l;
  const s0 = clamp(left ? x / Math.max(1, l) : (plan.w - x) / Math.max(1, plan.w - r), 0, 1);
  // A level shelf from the page's edge, then the wall in ledges: benches
  // falling gently, then a steep drop to the next.
  const shelf = t.shelf?.[left ? 0 : 1] ?? 0;
  const s = clamp((s0 - shelf) / (1 - shelf), 0, 1);
  let fl = 0.42 * Math.pow(s, t.fall);
  for (const [at, d, wd] of t.ledges?.[left ? 0 : 1] ?? []) {
    const q = clamp((s - (at - wd)) / (2 * wd), 0, 1);
    fl += 0.58 * d * q * q * (3 - 2 * q);
  }
  // Rough as rock is, a little, all along.
  const rough = plan.h * 0.006 * (Math.sin(x / (23 * k) + fl * 9) * 0.6 + Math.sin(x / (7.3 * k) + 1.7) * 0.4) * Math.min(1, s * 6);
  return t.top + (plan.h * 1.01 - t.top) * fl + swell * 0.35 * (1 - s) + rough;
}

/** Where a trench wall is at depth y: x in units, on the given side of the cleft. */
export function trenchWallX(t: Trench, w: number, h: number, side: -1 | 1, y: number): number {
  const shelf = t.shelf?.[side < 0 ? 0 : 1] ?? 0;
  const s = shelf + (1 - shelf) * Math.pow(clamp((y - t.top) / Math.max(1, h * 1.01 - t.top), 0, 1), 1 / t.fall);
  return side < 0 ? s * (t.x - t.gap / 2) : w - s * (w - (t.x + t.gap / 2));
}

/* ---- The jellies' builds ---- */

/**
 * Each block's jelly, rolled wider than the live sea rolls them so a family
 * on one page reads as relatives, not copies: the bell from low and wide to
 * tall (height over width 0.45 to 0.8), eight to thirty-two trails, the rim's
 * lobes, the arms. The lineage still leads: each is pulled toward its
 * parent's build, but never left within a step of it.
 */
function buildsFor(key: string, n: number): JellyBuild[] {
  const out: JellyBuild[] = [];
  for (let i = 0; i < n; i++) {
    const g = jellyForBlock(key, i);
    const r = mulberry32(hash32(key, 'picture-jelly', i));
    const prev = out[i - 1];
    let hw = 0.45 + 0.35 * clamp((g.aspect - 0.65) / 0.6, 0, 1) * 0.5 + 0.35 * r() * 0.5;
    let tentacles = Math.round(8 + 24 * clamp((g.tentacles - 6) / 26, 0, 1) * 0.5 + 24 * r() * 0.5);
    let scallops = Math.round(8 + 20 * r());
    let arms = Math.max(2, Math.min(8, g.arms + Math.round((r() - 0.5) * 3)));
    if (prev) {
      const phw = prev.aspect * 0.4;
      // Alternately low and wide, tall and domed: the bell is what reads first.
      hw = phw >= 0.62 ? 0.45 + 0.11 * r() : 0.67 + 0.13 * r();
      if (Math.abs(tentacles - prev.tentacles) < 6) tentacles = prev.tentacles + (prev.tentacles < 20 ? 1 : -1) * (6 + Math.floor(r() * 6));
      if (Math.abs(scallops - prev.scallops) < 4) scallops = prev.scallops + (prev.scallops < 18 ? 5 : -5);
      if (arms === prev.arms) arms = arms < 5 ? arms + 2 : arms - 2;
    }
    hw = clamp(hw, 0.45, 0.8);
    tentacles = clamp(tentacles, 8, 32);
    // What else tells a sibling from its parent across a room: long trailing
    // arms or short stubs, a clean rim or a deeply lobed one, and a tint
    // turned some way round the wheel, one way and then the other.
    const age = n - 1 - i;
    const swing = (i % 2 ? 1 : -1) * (hash32(key, 'picture-jelly-side') & 1 ? 1 : -1);
    out.push({
      tentacles,
      hairs: clamp(tentacles - 2 + Math.round((r() - 0.5) * 8), 0, 34),
      arms: clamp(arms, 1, 8),
      aspect: hw / 0.4,
      scallops: clamp(scallops, 8, 28),
      stingP: g.stingP,
      armLength: age === 0 ? 1.15 + 0.2 * r() : swing > 0 ? 0.5 + 0.2 * r() : 1.7 + 0.3 * r(),
      lobeDepth: age === 0 ? 1 + 0.4 * r() : swing > 0 ? 2.6 + 1.2 * r() : 0.15 + 0.3 * r(),
      hueShift: age === 0 ? 0 : swing * (25 + 10 * r()),
    });
  }
  // Every sibling apart from the hero at a glance, in ways a print shows
  // besides its size: a bell a fifth taller or lower, and four tenths more
  // trails or fewer (its arms and tint are turned already). Each moves the
  // way it already leaned, and only as far as it must.
  const hero = out[n - 1];
  if (hero) {
    const hh = hero.aspect * 0.4;
    const ht = hero.tentacles;
    const bellApart = (hw: number) => Math.abs(hw / hh - 1) >= 0.2;
    const trailsApart = (t: number) => Math.abs(t / ht - 1) >= 0.4;
    for (let i = 0; i < n - 1; i++) {
      const b = out[i];
      const hw = b.aspect * 0.4;
      if (!bellApart(hw)) {
        const lo = hh / 1.21;
        const hi = hh * 1.21;
        const fits = (v: number) => v >= 0.45 - 1e-9 && v <= 0.8 + 1e-9;
        b.aspect = (hw <= hh ? (fits(lo) ? lo : hi) : fits(hi) ? hi : lo) / 0.4;
      }
      if (!trailsApart(b.tentacles)) {
        const lo = Math.floor(ht * 0.59);
        const hi = Math.ceil(ht * 1.41);
        const t = b.tentacles <= ht ? (lo >= 8 ? lo : hi) : hi <= 32 ? hi : lo;
        b.hairs = clamp(b.hairs + (t - b.tentacles), 0, 34);
        b.tentacles = t;
      }
    }
    // And still apart from the one after: the bell's shape or its trails.
    for (let i = n - 2; i >= 1; i--) {
      const a = out[i - 1];
      const b = out[i];
      if (Math.abs(a.aspect - b.aspect) * 0.4 >= 0.08 || Math.abs(a.tentacles - b.tentacles) >= 6) continue;
      // The older one takes more of what already parts it from the hero.
      const t = a.tentacles <= ht ? Math.max(8, b.tentacles - 6) : Math.min(32, b.tentacles + 6);
      if (Math.abs(t - b.tentacles) >= 6 && trailsApart(t)) {
        a.hairs = clamp(a.hairs + (t - a.tentacles), 0, 34);
        a.tentacles = t;
        continue;
      }
      const hw = clamp(a.aspect * 0.4 <= hh ? b.aspect * 0.4 - 0.08 : b.aspect * 0.4 + 0.08, 0.45, 0.8);
      if (bellApart(hw)) a.aspect = hw / 0.4;
    }
  }
  return out;
}

/** A jelly's hull, bell and trails, in units. */
export function jellyHull(j: { x: number; y: number; r: number; len: number; aspect: number }): Box {
  const bh = 0.8 * j.r * j.aspect;
  return { x0: j.x - j.r * 1.15, x1: j.x + j.r * 1.15, y0: j.y - bh / 2 - j.r * 0.1, y1: j.y + bh / 2 + j.len };
}

/** The hero's bell's radius, a share of the page's short side: a fifth of it across. */
export const HERO_R = 0.1;
/** The largest a sibling may be, against the hero. */
export const SIBLING_SCALE = 0.5;
/** The largest a ghost may be, against the hero (the shoal's bells are far smaller). */
export const GHOST_SCALE = 0.33;
/** How far apart in depth two ghosts hang, at the least, a share of the page (two jellies: a twentieth). */
export const GHOST_ROW = 0.035;

/** How many of the hero's elders are drawn as jellies, on a tall page and a wide one; older blocks are a far shoal. */
export const SIBLINGS_TALL = 2;
export const SIBLINGS_WIDE = 3;
/** A ghost's strength, against the hero's. */
export const GHOST_ALPHA = 0.25;
/** The shoal's tiny bells, their radius against the hero's. */
export const SHOAL_SCALE: [number, number] = [0.035, 0.075];
/** How unlike each step down the family is to the next, across and down: at least this share of the larger. */
export const STEP_APART = 0.4;
/** No two bells of the family nearer across than this share of the width: never a hanging string. */
export const BELL_APART = 0.08;
/** One elder at least this share of the width across the hero's axis. */
export const ACROSS = 0.25;
/** Where the hero hangs, its centre from the wall as a share of the width. */
export const HERO_FROM_WALL: { tall: [number, number]; wide: [number, number] } = { tall: [0.38, 0.55], wide: [0.4, 0.62] };
/** The least lean of the hour's light (radians) at which the hero hangs off to the side of the window rather than under it. */
export const SLANT_MIN = 0.15;
/** How far off the window the hero then hangs, across, a share of the width. */
export const SLANT_OFFSET: [number, number] = [0.15, 0.28];
/** How much of the open third (away from the wall) things must stand in, at the least, for it not to want a sheaf of light of its own. */
export const OPEN_HELD = 0.08;
/** Where that sheaf crosses the page, from the wall, a share of the width. */
export const SHEAF_AT = 0.84;
/** The steepest the shafts lean to reach it (radians): short of the hour's own steepest. */
export const SLANT_MAX = 0.55;

/** Whether two steps between jellies (each to the next one down) are unlike enough, across and down. */
export function stepsApart(a: { dx: number; dy: number }, b: { dx: number; dy: number }): boolean {
  const apart = (p: number, q: number) => Math.abs(p - q) >= STEP_APART * Math.max(Math.abs(p), Math.abs(q)) - 1e-9;
  return apart(a.dx, b.dx) && apart(a.dy, b.dy);
}

/**
 * The few real arrangements a page takes, chosen by the sitting's own key so
 * pages from different sittings are not one picture twice: the calm water
 * across from the hero with the hero low (`across`) or high (`lifted`), or
 * the calm laid over the hero with the family down the wall (`vault`). The
 * wall's side is the kelp's or the key's.
 */
export type CompositionName = 'across' | 'lifted' | 'vault';
export const COMPOSITIONS: CompositionName[] = ['across', 'lifted', 'vault'];

export interface Composition {
  name: CompositionName;
  /** The hero's centre, from the wall, as a share of the width. */
  hero: number;
  /** Whether the hero hangs high (a little below the middle) rather than low. */
  high: boolean;
  /** Whether the calm is laid over the hero rather than across from it. */
  calmAbove: boolean;
  /** The window of sky, from the wall, as a share of the width: on a tall page a little out from the hero over the open water, its light down it; on a wide one straight over the hero, its far edge no further out than the hero's, so the calm beside them runs from the top of the page down; and over the calm on a page calm above, its light down into it. */
  win: number;
  /** The wall's side, once the page knows it. */
  wallSide: -1 | 1;
  /** How far the shafts lean from straight down (radians, positive down to the right): the hour's lean, or as steep as it takes to reach the hero. */
  lean?: number;
  /** How far the hero hangs off the window, across, a share of the width: 0 when straight under it. */
  offset?: number;
}

export function composeFor(key: string, tall: boolean, turn = 0): Composition {
  const name = COMPOSITIONS[(hash32(key, 'composition-5') + turn) % COMPOSITIONS.length];
  const u = unit01(key, 'composition-x');
  const v = unit01(key, 'composition-win');
  const [lo, hi] = tall ? HERO_FROM_WALL.tall : HERO_FROM_WALL.wide;
  const span = hi - lo;
  const at = name === 'vault' ? 0.55 + 0.4 * u : name === 'lifted' ? 0.1 + 0.4 * u : 0.05 + 0.4 * u;
  return { name, hero: lo + span * at, high: name === 'lifted', calmAbove: name === 'vault', win: name === 'vault' ? (tall ? 0.64 + 0.12 * v : 0.46 + 0.08 * v) : tall ? lo + span * at + 0.08 + 0.08 * v : lo + span * at - 0.035 + 0.025 * v, wallSide: -1 };
}

/** The largest clear stretch among some boxes, judged on a coarse grid (for the solvers, many times over). */
function coarseCalm(w: number, h: number, boxes: Box[], cell = 0.05 * REF): { box: Box; share: number } {
  const o = occupancy({ w, h, boxes, rocks: [], walls: [], ground: null }, cell);
  const box = largestEmpty(o);
  return { box, share: area(box) / (w * h) };
}

interface FamilyEnv {
  /** Whether an elder must hang out over the open water, across the hero's axis from the wall. */
  open: boolean;
  w: number;
  h: number;
  tall: boolean;
  seed: number;
  comp: Composition;
  winBox: Box;
  kelpZone: Box | null;
  /** The kelp's rocks, as boxes: no jelly on them. */
  kelpRocks: Box[];
  groundTop: number | null;
  rowGap: number;
  wallSide: -1 | 1;
  yOf: (f: number) => number;
  blocks: { to: number }[];
}

/** What a composition asks of where the calm falls: 0 where it falls as asked. */
function calmMiss(c: { box: Box }, comp: Composition, hero: PlacedJelly, w: number, h: number, wallSide: -1 | 1): number {
  const b = c.box;
  const share = (x: number) => (wallSide < 0 ? x / w : 1 - x / w);
  if (comp.calmAbove) return 4 * Math.max(0, (b.y1 - hero.box.y0) / h) + 3 * Math.max(0, 0.5 - (b.x1 - b.x0) / w);
  return 4 * Math.max(0, 0.66 - share((b.x0 + b.x1) / 2));
}

/**
 * The family round the hero: each elder above the next by a twentieth of the
 * page, near the depth its block ended, clear of the others by 0.02 S and
 * 1.4 times their radii, no two bells within BELL_APART across, one at least
 * ACROSS from the hero's axis, never a staircase, and laid so the page keeps
 * its calm where its composition puts it. Many arrangements are tried from
 * the sitting's key and the one that costs least is kept.
 */
function placeFamily(s: Session, family: PlacedJelly[], e: FamilyEnv): void {
  const { w, h } = e;
  const hero = family[family.length - 1];
  const kin = family.length - 1;
  const S = Math.min(w, h);
  const top = e.winBox.y1 + h * 0.06;
  const targets = family.map((j, m) => {
    if (j.hero) return j.y;
    const depth = e.yOf(e.blocks[j.block]?.to ?? 0);
    const line = top + ((hero.y - top) * (m + 1)) / (kin + 1);
    return Math.min(0.5 * depth + 0.5 * line, hero.y - (kin - m) * e.rowGap);
  });
  const wallZone: Box = e.wallSide < 0 ? { x0: 0, x1: w * 0.12, y0: 0, y1: h } : { x0: w * 0.88, x1: w, y0: 0, y1: h };
  const fixedBoxes = [e.winBox, wallZone, ...(e.kelpZone ? [e.kelpZone] : []), ...(e.groundTop != null ? [{ x0: 0, x1: w, y0: e.groundTop, y1: h }] : [])];
  const share = (x: number) => (e.wallSide < 0 ? x / w : 1 - x / w);
  const ok = (j: PlacedJelly, x: number, y: number, m: number, at: { x: number; y: number }[], level: number): boolean => {
    const box = jellyHull({ x, y, r: j.r, len: j.len, aspect: j.aspect });
    if (box.y0 < h * MARGIN || box.x0 < w * MARGIN - 1e-6 || box.x1 > w * (1 - MARGIN) + 1e-6) return false;
    if (inter(box, grow(e.winBox, CLEAR)) > 0) return false;
    if (e.kelpZone && inter(box, grow(e.kelpZone, CLEAR)) > 0) return false;
    if (e.kelpRocks.some((k) => inter(box, grow(k, CLEAR)) > 0)) return false;
    if (e.groundTop != null && box.y1 > e.groundTop - CLEAR) return false;
    const next = at[m + 1];
    if (y > next.y - e.rowGap + 1e-6) return false;
    for (let k = m + 1; k < family.length; k++) {
      const o = family[k];
      const p = at[k];
      if (Math.hypot(p.x - x, p.y - y) < 1.4 * (o.r + j.r)) return false;
      if (boxGap(jellyHull({ x: p.x, y: p.y, r: o.r, len: o.len, aspect: o.aspect }), box) < CLEAR) return false;
      if (level < 2 && Math.abs(p.x - x) < w * BELL_APART) return false;
    }
    const after = at[m + 2];
    if (level < 2 && after && !stepsApart({ dx: next.x - x, dy: next.y - y }, { dx: after.x - next.x, dy: after.y - next.y })) return false;
    // Never a stair: no three of the family (each above the next) running
    // the same way across, whatever their steps.
    if (level < 2) for (let a = m + 1; a <= kin; a++) for (let b = a + 1; b <= kin; b++) if ((at[a].x - x) * (at[b].x - at[a].x) > 0) return false;
    return true;
  };
  type Got = { at: { x: number; y: number }[]; cost: number; calm: number };
  let best: Got | null = null;
  let kept: Got | null = null;
  for (const level of [0, 1, 2]) {
    if (kept && level === 2) break;
    best = null;
    const r = mulberry32(hash32(e.seed, 'family', level));
    for (let t = 0; t < (kin ? 420 : 1); t++) {
      const at = family.map((j) => ({ x: j.x, y: j.y }));
      let built = true;
      for (let m = kin - 1; m >= 0 && built; m--) {
        const j = family[m];
        let got = false;
        for (let k = 0; k < 24 && !got; k++) {
          const x = w * MARGIN + j.r * 1.15 + r() * (w * (1 - 2 * MARGIN) - j.r * 2.3);
          const y = Math.min(at[m + 1].y - e.rowGap, targets[m] + gauss(r) * h * 0.08);
          if (ok(j, x, y, m, at, level)) {
            at[m] = { x, y };
            got = true;
          }
        }
        built = got;
      }
      if (!built) continue;
      // One elder at least a quarter of the width out across the hero's
      // axis, on the open water's side; and never all of them to one side.
      if (kin && level < 1 && e.open && !at.slice(0, kin).some((p) => share(p.x) - share(hero.x) >= ACROSS - 1e-6)) continue;
      if (kin && level < 2 && !at.slice(0, kin).some((p) => Math.abs(p.x - hero.x) >= w * ACROSS - 1e-6)) continue;
      if (kin >= 2 && level < 1 && (at.slice(0, kin).every((p) => p.x < hero.x) || at.slice(0, kin).every((p) => p.x > hero.x))) continue;
      // What it costs: off its depth, crowding the wall the rocks stand on,
      // hung as a string, and the calm it leaves (how much, and where).
      let cost = 0;
      const boxes: Box[] = [];
      for (let m = 0; m <= kin; m++) {
        const j = family[m];
        const b = jellyHull({ x: at[m].x, y: at[m].y, r: j.r, len: j.len, aspect: j.aspect });
        boxes.push(b);
        if (j.hero) continue;
        cost += (1.5 * Math.abs(at[m].y - targets[m])) / h;
        const edge = share(e.wallSide < 0 ? b.x0 : b.x1);
        if (edge < 0.1) cost += (0.1 - edge) * 4;
        // Off the water the composition keeps calm: the far side, or the water over the hero.
        const far = share(e.wallSide < 0 ? b.x1 : b.x0);
        if (!e.comp.calmAbove) cost += 6 * Math.max(0, far - 0.58);
        else if (b.y0 < hero.y) cost += 6 * Math.max(0, far - 0.4) * Math.min(1, (hero.y - b.y0) / (h * 0.2));
        // (Nor under the kelp's rock, where a break's rock would stand.)
        if (e.kelpZone && inter(b, { x0: e.kelpZone.x0 - w * 0.1, x1: e.kelpZone.x1 + w * 0.1, y0: e.kelpZone.y1, y1: e.kelpZone.y1 + h * 0.14 }) > 0) cost += 1;
        if (Math.abs(at[m + 1].x - at[m].x) < w * 0.14) cost += 0.4;
      }
      // (Never a row across: two of them level read as the start of one.)
      for (let m = 0; m < kin; m++) for (let k = m + 1; k <= kin; k++) if (Math.abs(at[m].y - at[k].y) < h * 0.1) cost += 0.8;
      // (Not all to one side of the hero: the family hangs round it.)
      if (kin >= 2 && (at.slice(0, kin).every((p) => p.x < hero.x) || at.slice(0, kin).every((p) => p.x > hero.x))) cost += 0.5;
      const calm = coarseCalm(w, h, [...fixedBoxes, ...boxes]);
      cost += 25 * Math.max(0, 0.4 - calm.share) + calmMiss(calm, e.comp, { ...hero, box: boxes[kin] }, w, h, e.wallSide);
      if (!best || cost < best.cost) best = { at, cost, calm: calm.share };
    }
    // (Strictly if the page keeps its calm that way; else looser, if that
    // keeps more; with no rule given up, only if nothing else can be had.)
    if (best && (!kept || best.calm > kept.calm + 0.02)) kept = best;
    if (kept && kept.calm >= 0.38) break;
  }
  best = kept ?? best;
  if (!best) {
    // Nowhere: stacked up the page beside the hero, as small as they come.
    best = { at: family.map((j, m) => ({ x: hero.x + (m % 2 ? 1 : -1) * w * 0.2, y: hero.y - (kin - m) * Math.max(e.rowGap, S * 0.15) })), cost: 0, calm: 0 };
  }
  family.forEach((j, m) => {
    j.x = best.at[m].x;
    j.y = best.at[m].y;
    j.box = jellyHull(j);
  });
}

interface ShoalEnv {
  w: number;
  h: number;
  seed: number;
  comp: Composition;
  winBox: Box;
  kelpZone: Box | null;
  groundTop: number | null;
  wallSide: -1 | 1;
  avoid: ((b: Box) => boolean) | null;
}

/** One tiny bell of the far shoal: a block's own (`block`), or one of the bells drifting with them (-1). */
export interface ShoalBell {
  x: number;
  y: number;
  r: number;
  alpha: number;
  block: number;
}

/** The far shoal: its bells, and the box the whole cloud of them takes (bells and trails). */
export interface Shoal {
  box: Box;
  bells: ShoalBell[];
}

/** How many bells the far shoal has, at the least: a block's each, and others drifting with them to make it a shoal. */
export const SHOAL_COUNT: [number, number] = [14, 22];
/** The widest the shoal's cloud is, a share of the page's width. */
export const SHOAL_SPAN = 0.22;
/** How strongly its bells are drawn: the middle of the cloud, and its edge. */
export const SHOAL_ALPHA: [number, number] = [0.28, 0.18];

/** A tiny bell's reach: its dome and its short trails. */
function bellHull(x: number, y: number, r: number): Box {
  return { x0: x - r * 1.2, x1: x + r * 1.2, y0: y - r * 0.6, y1: y + r * 2.6 };
}

/**
 * The oldest blocks, far off: a loose cloud of tiny bells in the haze out
 * over the open water, one for each block (the oldest highest) and a dozen
 * or so more drifting with them, so it reads as a shoal and never as a
 * ghost of the hero. Thickest at its middle and thinning out, a fifth of
 * the width across at most, clear of the family, the window, the kelp and
 * the ground, and set where the page keeps its calm.
 */
function placeShoal(shoal: PlacedJelly[], family: PlacedJelly[], e: ShoalEnv): Shoal | null {
  if (!shoal.length) return null;
  const { w, h } = e;
  const r = mulberry32(hash32(e.seed, 'shoal'));
  const hero = family[family.length - 1];
  const n = Math.max(shoal.length, SHOAL_COUNT[0] + Math.floor(r() * (SHOAL_COUNT[1] - SHOAL_COUNT[0] + 1)));
  // The cloud's own shape: each bell scattered round its middle (thicker
  // there), drawn out a little along the current, none on another.
  const half = (SHOAL_SPAN * w) / 2;
  const tilt = (r() - 0.5) * 0.5;
  const offs: { x: number; y: number; r: number }[] = [];
  for (let k = 0; k < n; k++) {
    const rad = k < shoal.length ? shoal[k].r : hero.r * (SHOAL_SCALE[0] + (SHOAL_SCALE[1] - SHOAL_SCALE[0]) * r() * r());
    for (let t = 0; t < 60; t++) {
      const gx = gauss(r) * half * 0.6;
      const gy = gauss(r) * half * 0.36;
      const p = { x: clamp(gx * Math.cos(tilt) - gy * Math.sin(tilt), -half + rad * 1.2, half - rad * 1.2), y: gx * Math.sin(tilt) + gy * Math.cos(tilt), r: rad };
      if (offs.every((q) => Math.hypot(q.x - p.x, (q.y - p.y) * 0.8) >= 1.5 * (q.r + p.r))) {
        offs.push(p);
        break;
      }
    }
  }
  // The oldest highest: the blocks' bells are spread through the cloud top
  // down, in block order; the rest drift between them.
  const byY = offs.map((_, k) => k).sort((a, b) => offs[a].y - offs[b].y);
  const mine = shoal.map((_, i) => byY[Math.round(((i + 0.5) * byY.length) / shoal.length - 0.5)]);
  // (Their own radii go with the place each takes.)
  mine.forEach((k, i) => {
    offs[k] = { ...offs[k], r: shoal[i].r };
  });
  let ext: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const o of offs) {
    const b = bellHull(o.x, o.y, o.r);
    ext = { x0: Math.min(ext.x0, b.x0), y0: Math.min(ext.y0, b.y0), x1: Math.max(ext.x1, b.x1), y1: Math.max(ext.y1, b.y1) };
  }
  const famBoxes = family.map((j) => j.box);
  const share = (x: number) => (e.wallSide < 0 ? x / w : 1 - x / w);
  let best: { x: number; y: number; cost: number } | null = null;
  for (let gy = 0; gy <= 36; gy++) {
    for (let gx = 0; gx <= 30; gx++) {
      const cx = w * (0.05 + (0.9 * gx) / 30);
      const cy = h * (0.06 + (0.84 * gy) / 36);
      const box = { x0: cx + ext.x0, x1: cx + ext.x1, y0: cy + ext.y0, y1: cy + ext.y1 };
      if (box.x0 < w * MARGIN || box.x1 > w * (1 - MARGIN) || box.y0 < h * MARGIN || box.y1 > h * (1 - MARGIN)) continue;
      // The rules, nearly (whatever breaks fewest of them, if all break some).
      let broken = 0;
      if (inter(box, grow(e.winBox, CLEAR)) > 0 || (e.kelpZone && inter(box, grow(e.kelpZone, CLEAR)) > 0)) broken++;
      if (e.groundTop != null && box.y1 > e.groundTop - CLEAR) broken++;
      if (famBoxes.some((f) => boxGap(f, box) < CLEAR * 2)) broken++;
      if (e.avoid && e.avoid(box)) broken++;
      // Out over the open water, the third away from the wall, in from its
      // edge; above the hero, where the older blocks were, and off the top.
      let cost = 50 * broken + 4 * Math.max(0, 0.72 - share(cx)) + 2 * Math.max(0, share(cx) - 0.88);
      cost += (2 * Math.max(0, box.y1 - hero.y)) / h + 2 * Math.max(0, 0.2 - cy / h) + (0.3 * Math.abs(cy / h - 0.32));
      if (!best || cost < best.cost) best = { x: cx, y: cy, cost };
    }
  }
  const at = best ?? { x: w * 0.5, y: h * 0.2 };
  const dist = Math.max(1, ...offs.map((o) => Math.hypot(o.x, o.y)));
  const bells: ShoalBell[] = offs.map((o, k) => {
    const block = mine.indexOf(k);
    return { x: at.x + o.x, y: at.y + o.y, r: o.r, alpha: SHOAL_ALPHA[0] + (SHOAL_ALPHA[1] - SHOAL_ALPHA[0]) * Math.min(1, Math.hypot(o.x, o.y) / dist), block: block >= 0 ? shoal[block].block : -1 };
  });
  shoal.forEach((j, i) => {
    const b = bells[mine[i]];
    j.x = b.x;
    j.y = b.y;
    j.box = jellyHull(j);
  });
  return { box: { x0: at.x + ext.x0, x1: at.x + ext.x1, y0: at.y + ext.y0, y1: at.y + ext.y1 }, bells };
}

/* ---- Planning ---- */

interface Shape {
  width: number;
  height: number;
}

/**
 * The picture's plan: laid in the composition the sitting's key chooses, and
 * if that one cannot keep the page's rules that are about the whole of it (a
 * quarter of the page calm, the cast not all by the wall, one of it over the
 * page's middle), in the next that can.
 */
export function plan(s: Session, color: string, ground: 'paper' | 'night', shape: Shape): Plan {
  let best: { plan: Plan; miss: number } | null = null;
  // (The hero off to the side of the window first, as the hour's light
  // leans; then, if no composition keeps the page's rules that way, under it.)
  // (And an elder out over the open water first; then, failing that, wherever the family keeps the calm.)
  // (Last, on a wide page, two elders rather than three, the third joining
  // the far shoal. Past the first pass only the composition that came
  // nearest is tried again: each try lays the whole page.)
  let bestTurn = 0;
  const passes = [
    [true, true, false],
    [true, false, false],
    [true, false, true],
    [false, false, false],
    [false, false, true],
  ] as const;
  for (let k = 0; k < passes.length; k++) {
    const [slant, open, fewer] = passes[k];
    if (fewer && shape.width <= shape.height * 1.1) continue;
    for (let turn = 0; turn < COMPOSITIONS.length; turn++) {
      if (k > 0 && turn !== bestTurn) continue;
      const p = planIn(s, color, ground, shape, turn, slant, open, fewer);
      const miss = pageMiss(p);
      if (!best || miss < best.miss - 1e-9) {
        best = { plan: p, miss };
        bestTurn = turn;
      }
      if (miss <= 0) break;
    }
    // (A sighting with no room is no reason to give up the slant or an elder: only the page's own rules are.)
    const got = best as { plan: Plan; miss: number };
    if (got.miss - 0.5 * (got.plan.missed ?? 0) <= 1e-9) break;
  }
  return (best as { plan: Plan }).plan;
}

/** How far a plan falls short of the rules about the whole page: 0 when it keeps them. */
export function pageMiss(p: Plan): number {
  const calm = calmArea(p).share;
  let miss = Math.max(0, CALM + 0.001 - calm) * 10;
  const share = (x: number) => (p.composition.wallSide < 0 ? x / p.w : 1 - x / p.w);
  const water = p.cast.filter((a) => !a.floor);
  // (The rarest animal met is always drawn, and the sightings too where a page can have them.)
  if (p.cast.length && !p.cast.some((a) => a.rare)) miss += 1;
  miss += 0.5 * (p.missed ?? 0);
  // (And the cast in three groups at most.)
  {
    const S = Math.min(p.w, p.h);
    const swim = water.filter((a) => !a.rare);
    const root = swim.map((_, i) => i);
    const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
    for (let i = 0; i < swim.length; i++) for (let k = i + 1; k < swim.length; k++) if (boxGap(swim[i].box, swim[k].box) <= LONE_GAP * S) root[find(i)] = find(k);
    const groups = new Set(swim.map((_, i) => find(i))).size;
    if (groups > 3) miss += 0.3 * (groups - 3);
  }
  if (water.length >= 2) {
    const byWall = water.filter((a) => share(a.x) < 1 / 3).length / water.length;
    miss += Math.max(0, byWall - CAST_BY_WALL);
    if (!water.some((a) => Math.max(share(a.box.x0), share(a.box.x1)) > 0.5)) miss += 0.2;
  }
  return miss;
}

export function planIn(s: Session, color: string, ground: 'paper' | 'night', shape: Shape, turn: number, slant = true, open = true, fewer = false): Plan {
  const minSide = Math.max(1, Math.min(shape.width, shape.height));
  const unit = minSide / REF;
  const w = (shape.width / minSide) * REF;
  const h = (shape.height / minSide) * REF;
  const tall = shape.width <= shape.height * 1.1;
  const seed = hash32(s.key, 'picture', Math.round(w), Math.round(h));
  const rnd = mulberry32(seed);
  const depth = depthAt(s.focus);
  const zMax = depth.z;
  const F = Math.max(1, s.focus);
  const roomF = Math.max(1e-6, roomAt(F));
  const S = Math.min(w, h);

  // ---- The floor, and past three hours the trench.
  const floorY = s.floor ? h * (1 - (0.105 + 0.03 * unit01(s.key, 'floor-band'))) : null;
  const trenchOn = s.floor && s.focus > 3 * 3600;
  // The longer past three hours, the higher its walls begin: deeper.
  const trenchK = trenchOn ? clamp((s.focus - 3 * 3600) / (1.5 * 3600), 0, 1) : 0;

  // ---- The window of sky at the very top, where the way down begins:
  // small, and wholly on the page, as looking straight up.
  const winR = tall ? w * 0.13 : w * 0.085;
  const winTop = h * 0.022;
  const winY = winTop + winR * 0.46 * 1.04;

  // Where the hero's bell hangs: the deepest point of the dive. It owns the
  // page: a fifth of its short side across.
  const heroR = HERO_R * S;
  // A short sitting's hero hangs a little lower (0.58 to 0.66 of the page),
  // its trails reaching well into the lowest fifth, so the foot of the page
  // is never empty paper.
  const short = s.focus < 3600;
  // The page's composition, from the sitting's own key: where the hero
  // hangs across and how high, and where the calm water lies.
  const comp = composeFor(s.key, tall, turn);
  const yEnd = comp.high
    ? h * ((tall ? 0.54 : 0.47) + 0.04 * unit01(s.key, 'hero-y'))
    : tall
      ? h * ((short ? 0.6 : 0.62) + 0.06 * unit01(s.key, 'hero-y'))
      : h * ((short ? 0.58 : 0.56) + (short ? 0.06 : 0.04) * unit01(s.key, 'hero-y'));
  const yTop = winY + winR * 0.46 + h * 0.03;
  const yOf = (f: number) => yTop + ((yEnd - yTop) * roomAt(Math.min(F, f))) / roomF;

  // The depth dial down the page: surface to the deepest point, and a
  // little deeper below it.
  const zStops: { y: number; z: number }[] = [];
  const samples: { y: number; z: number }[] = [{ y: 0, z: 0 }];
  for (let i = 0; i <= 160; i++) {
    const f = (F * i) / 160;
    samples.push({ y: yOf(f), z: depthAt(f).z });
  }
  for (let i = 0; i <= 40; i++) {
    const y = (h * i) / 40;
    let z: number;
    if (y >= yEnd) z = Math.min(1, zMax + (0.05 * (y - yEnd)) / Math.max(1, h - yEnd));
    else {
      let k = 1;
      while (k < samples.length - 1 && samples[k].y < y) k++;
      const a = samples[k - 1];
      const b = samples[k];
      z = a.z + ((b.z - a.z) * (y - a.y)) / Math.max(1e-6, b.y - a.y);
    }
    zStops.push({ y, z: clamp(z, 0, 1) });
  }
  const zAt = (y: number) => {
    const i = clamp(Math.floor((y / h) * 40), 0, 39);
    const a = zStops[i];
    const b = zStops[i + 1];
    return a.z + ((b.z - a.z) * (y - a.y)) / Math.max(1e-6, b.y - a.y);
  };

  // ---- The page's one wall, and the composition laid across from it.
  const flip = (hash32(s.key, 'wall-side') & 1) === 1 ? -1 : 1;
  // The kelp's canopy lies along the surface, in from its wall: the window
  // keeps clear of it.
  const kelpTop = h * 0.03;
  const kelpBottom = s.kelp ? clamp(yOf(11.6 * 60) + h * 0.06, h * 0.3, h * 0.8) : 0;
  const kelpHf = (kelpBottom - kelpTop) / 2.45;
  // (Its forest stands on either wall, as the sitting's key has it: the same forest, seen from the other side.)
  const kelpMirror = (hash32(s.key, 'kelp-mirror') & 1) === 1;
  const forest = s.kelp ? mirrorKelp(rollKelp(s.biome.key, PICTURE_KELP), kelpMirror) : null;
  // A side of the forest is three stalks or more in the picture, or none: a
  // lone straggler at the far wall reads as a vine, not kelp.
  const stalkSide = (x: number): -1 | 1 => (x < 0.5 ? -1 : 1);
  const kelpKeep = forest ? forest.stalks.map((_, i) => i).filter((i) => forest.stalks.filter((o) => stalkSide(o.x) === stalkSide(forest.stalks[i].x)).length >= 3) : [];
  const kelpKept = new Set(kelpKeep.map((i) => stalkSide((forest as NonNullable<typeof forest>).stalks[i].x)));
  // The forest is measured against the short side, not the width: a wide
  // page does not grow its kelp and their rock wider, it shows more water.
  const kelpW = Math.min(w, h);
  let inL = 0;
  let inR = 0;
  if (forest) {
    for (const st of forest.stalks.filter((_, i) => kelpKeep.includes(i))) {
      // What of it is longer than the water is deep lies along the surface.
      const over = Math.max(0, st.height - (st.base - 0.08)) * kelpHf + 0.06 * kelpHf;
      if (st.x < 0.5) inL = Math.max(inL, st.x * kelpW + over + kelpW * 0.03);
      else inR = Math.max(inR, (1 - st.x) * kelpW + over + kelpW * 0.03);
    }
  }
  // The wall's side: the kelp's, or else the sitting's own.
  let wallSide: -1 | 1 = flip;
  if (forest && kelpKept.size) {
    const left = kelpKeep.filter((i) => forest.stalks[i].x < 0.5).length;
    const right = kelpKeep.length - left;
    wallSide = left >= right ? -1 : 1;
  }
  const calmSide = (-wallSide) as -1 | 1;
  comp.wallSide = wallSide;
  /** A share of the width measured from the wall, as x in units. */
  const fromWall = (f: number) => w * (0.5 + wallSide * (0.5 - f));
  /** And back: how far from the wall x is, as a share of the width. */
  const wallShare = (x: number) => (wallSide < 0 ? x / w : 1 - x / w);
  // The window over the open side, as far as the kelp lets it.
  const winLo = Math.max(winR * 1.3, inL + winR * 1.12);
  const winHi = Math.min(w - winR * 1.3, w - inR - winR * 1.12);
  // Where the light leans toward the wall, the window stands out over the
  // open water instead, so its shafts cross the calm to the hero and the
  // open side is never dark and bare.
  const lean = sunFor(s.hour).tilt;
  const winAt = lean * calmSide < -0.12 && !comp.calmAbove ? Math.max(comp.win, comp.hero + (tall ? 0.24 : 0.2)) : comp.win;
  let winX = winLo <= winHi ? clamp(fromWall(winAt), winLo, winHi) : (winLo + winHi) / 2;
  // When the light leans (any hour but the middle of the day or of the
  // night), the hero hangs off to one side of the window, 0.15 to 0.3 of the
  // width down the light's lean, and the shafts come down at a slant to it:
  // the window upstream of the hero, toward the wall or out over the open
  // water as the hour has it. The hero keeps to its range from the wall.
  const yEndHere = yEnd;
  comp.lean = lean;
  comp.offset = 0;
  if (slant && Math.abs(lean) >= SLANT_MIN && winLo <= winHi) {
    const dir = lean > 0 ? 1 : -1;
    const [lo, hi] = tall ? HERO_FROM_WALL.tall : HERO_FROM_WALL.wide;
    // (Never steeper than SLANT_MAX: on a wide page, whose hero hangs only half a page under the window, that is a little less far across.)
    const most = Math.max(SLANT_OFFSET[0], Math.min(SLANT_OFFSET[1], (Math.tan(SLANT_MAX) * (yEndHere - winY)) / w));
    const want = SLANT_OFFSET[0] + (most - SLANT_OFFSET[0]) * unit01(s.key, 'slant');
    const heroes = Array.from({ length: 23 }, (_, i) => lo + ((hi - lo) * i) / 22).sort((a, b) => Math.abs(a - comp.hero) - Math.abs(b - comp.hero));
    let got: { hero: number; x: number; d: number } | null = null;
    for (const d of [want, (want + SLANT_OFFSET[0]) / 2, SLANT_OFFSET[0]]) {
      for (const f of heroes) {
        const x = fromWall(f) - dir * d * w;
        if (x >= winLo - 1e-6 && x <= winHi + 1e-6) {
          got = { hero: f, x, d };
          break;
        }
      }
      if (got) break;
    }
    if (got) {
      comp.hero = got.hero;
      comp.win = wallShare(got.x);
      comp.offset = got.d;
      winX = got.x;
      // The shafts aimed at the hero's bell from the window.
      comp.lean = Math.atan2(fromWall(got.hero) - got.x, yEndHere - winY);
    }
  }
  const win = { x: winX, y: winY, r: winR };
  const winBox: Box = { x0: winX - winR * 1.08, x1: winX + winR * 1.08, y0: 0, y1: winY + winR * 0.46 * 1.08 };

  // The rocks the kelp stands on, as kelp-draw lays them.
  const kelpRocks = (bottom: number): PlacedRock[] => {
    if (!forest) return [];
    const hf = (bottom - kelpTop) / 2.45;
    return forest.ledges.filter((ledge) => kelpKept.has(ledge.edge)).map((ledge) => {
      // kelp-draw stands the ledge on the same engine: (reach + 3%) of the
      // width out from a wall 3% off the page, KELP_ROCK of a frame deep.
      const span = (ledge.reach + 0.03) * kelpW;
      const sh = rockSilhouette([{ seed: ledge.seed, at: 0, span: 1, dy: 0, thick: Math.max(KELP_ROCK * hf, 0.75 * span) / span }]);
      const k: Omit<PlacedRock, 'box'> = {
        kind: 'kelp',
        rest: -1,
        slot: -1,
        edge: ledge.edge,
        y: kelpTop + ledge.top * hf - sh.lift * span,
        height: sh.ratio * span,
        reach: (ledge.reach * kelpW) / w,
        off: (0.03 * kelpW) / w,
        plane: 2,
        zone: 0,
        seconds: 0,
        seed: ledge.seed,
        shape: sh,
      };
      return { ...k, box: rockBox(k, w) };
    });
  };
  // ---- The jellies: one per block. The hero and its youngest elders (two
  // on a tall page, three on a wide one) are drawn as the family; the older
  // blocks are a far shoal of tiny bells.
  const n = s.blocks.length;
  const builds = buildsFor(s.key, n);
  // (Past three hours the deep crowds a wide page too: two there as well.)
  const kin = Math.min(n - 1, tall || trenchOn || fewer ? SIBLINGS_TALL : SIBLINGS_WIDE);
  const shoalN = n - 1 - kin;
  const rowGap = h * 0.05;
  const kelpZone: Box | null = forest && kelpKept.size ? (wallSide < 0 ? { x0: 0, x1: Math.max(inL, w * 0.06), y0: 0, y1: kelpBottom } : { x0: w - Math.max(inR, w * 0.06), x1: w, y0: 0, y1: kelpBottom }) : null;
  const groundTop = s.floor ? (trenchOn ? h * (tall ? TRENCH_TOP[0] : TRENCH_TOP[1]) - h * TRENCH_RISE * trenchK : (floorY as number) - h * 0.02) : null;
  const jellies: PlacedJelly[] = [];
  for (let i = 0; i < n; i++) {
    const age = n - 1 - i;
    const hero = age === 0;
    const shoal = age > kin;
    const u = unit01(s.key, 'jelly-size', i);
    // (The shoal's bells are one size: a shoal of one kind, far off.)
    const scale = hero ? 1 : age === 1 ? SIBLING_SCALE : shoal ? SHOAL_SCALE[0] + (SHOAL_SCALE[1] - SHOAL_SCALE[0]) * unit01(s.key, 'shoal-size', i) : age === 2 ? 0.4 + 0.1 * u : 0.32 + 0.16 * u;
    const r = heroR * scale;
    const body = builds[i];
    jellies.push({
      block: i,
      x: 0,
      y: 0,
      r,
      // The hero's trails reach 0.86 of the page down at least; with no
      // floor to close the page, 0.9 (drawn, their tips curl up to about
      // 0.85), so the lowest fifth is never empty water.
      len: hero ? Math.max(r * (tall ? 2.9 : 2.5), Math.min(h * (s.floor ? 0.86 : 0.9) - yEnd - 0.4 * r * body.aspect, r * (s.floor ? 3.6 : 4.2))) : r * 2.5,
      aspect: body.aspect,
      hero,
      z: 0,
      alpha: hero ? 1 : age === 1 ? 0.95 : shoal ? GHOST_ALPHA : age === 2 ? 0.75 : 0.6,
      weight: hero ? 1 : age === 1 ? 0.8 : shoal ? 0.5 : age === 2 ? 0.75 : 0.7,
      far: shoal,
      shoal,
      body,
      box: { x0: 0, y0: 0, x1: 0, y1: 0 },
    });
  }
  const hero = jellies[n - 1];
  hero.x = fromWall(comp.hero);
  hero.y = yEnd;
  hero.box = jellyHull(hero);
  const family = jellies.slice(n - 1 - kin);
  placeFamily(s, family, { open, w, h, tall, seed, comp, winBox, kelpZone, kelpRocks: kelpRocks(kelpBottom).map((k) => k.box), groundTop, rowGap, wallSide, yOf, blocks: s.blocks });
  const shoal = jellies.slice(0, shoalN);
  /** What the shoal keeps off besides the family and the window: none yet. */
  const placeTheShoal = (avoid: ((b: Box) => boolean) | null) => placeShoal(shoal, family, { w, h, seed, winBox, kelpZone, groundTop, wallSide, comp, avoid });
  let cloud = placeTheShoal(null);
  for (const j of jellies) j.z = zAt(j.y);

  // ---- The way down, through the family: from under the window to the
  // eldest drawn, and on from each to the next, in easy curves.
  const wayDown = (): number[] => {
    const out: number[] = [];
    const anchors = [{ x: winX, y: winY + winR * 0.46 }, ...family.map((j) => ({ x: j.x, y: j.y }))];
    out.push(anchors[0].x, anchors[0].y);
    for (let a = 1; a < anchors.length; a++) {
      const A = anchors[a - 1];
      const B = anchors[a];
      const bulge = (a % 2 ? 1 : -0.6) * w * (tall ? 0.03 : 0.02) * (B.x >= A.x ? 1 : -1);
      for (let k = 1; k <= 40; k++) {
        const t = k / 40;
        const e = t * t * (3 - 2 * t);
        out.push(A.x + (B.x - A.x) * e + bulge * Math.sin(Math.PI * t), A.y + (B.y - A.y) * t);
      }
    }
    return out;
  };
  let path = wayDown();

  // ---- The floor and the trench under the hero.
  let trench: Trench | null = null;
  if (trenchOn && floorY != null) {
    const gap = w * (tall ? 0.3 : 0.27) * (0.97 + 0.08 * unit01(s.key, 'trench-gap'));
    const tx = clamp(hero.x, gap / 2 + w * 0.25, w - gap / 2 - w * 0.25);
    const lr = mulberry32(hash32(s.key, 'trench-ledges'));
    const wall = (): [number, number, number][] => {
      const n = 3 + Math.floor(lr() * 3);
      const out: [number, number, number][] = [];
      let total = 0;
      for (let i = 0; i < n; i++) {
        // Drops spread along the wall, closer and deeper toward the cleft.
        const at = 0.12 + (0.84 * (i + 0.3 + lr() * 0.4)) / n;
        const d = (0.6 + lr() * 0.8) * (0.6 + at);
        out.push([at, d, 0.02 + lr() * 0.035]);
        total += d;
      }
      return out.map(([a, d, wd]) => [a, d / total, wd]);
    };
    trench = { x: tx, gap, top: h * ((tall ? TRENCH_TOP[0] : TRENCH_TOP[1]) - TRENCH_RISE * trenchK), fall: 2.3 - 0.4 * trenchK, shelf: [0, 0], ledges: [wall(), wall()] };
    // A whale fall lies on a level shelf at the top of the wider wall: that wall starts in one.
    if (s.events.some((v) => v.kind === 'whalefall')) {
      const wide = tx - gap / 2 >= w - (tx + gap / 2) ? 0 : 1;
      trench.shelf = wide === 0 ? [TRENCH_SHELF, 0] : [0, TRENCH_SHELF];
    }
  }
  const floor = floorY != null ? { y: trench ? trench.top : floorY, amp: h * (0.012 + 0.006 * unit01(s.key, 'floor-amp')), phase: unit01(s.key, 'silt') * TAU } : null;
  const geo = { w, h, floor, trench };
  const groundY = (x: number) => floorAt(geo, x);
  /** The highest the ground comes under a box (units), or the page's foot. */
  const groundUnder = (b: Box) => {
    let g = h;
    if (floor) for (let k = 0; k <= 12; k++) g = Math.min(g, groundY(b.x0 + ((b.x1 - b.x0) * k) / 12));
    return g;
  };
  if (floor) {
    // The hero's trails end clear of the ground, 0.02 S over it all across them.
    const most = groundUnder(hero.box) - CLEAR - (hero.y + 0.4 * hero.r * hero.aspect + hero.r * 0.15);
    if (hero.len > most) {
      hero.len = Math.max(hero.r * 1.6, most);
      hero.box = jellyHull(hero);
    }
  }
  // How low a rock may come: clear of the floor, or of the trench's walls.
  // A rock may come down to rest on the floor or on a trench wall's top, never below it.
  const rockFoot = trench ? trench.top + h * 0.1 : floorY != null ? floorY + h * 0.06 : h * 0.95;

  // ---- The kelp at the top: one side the forest, the other (if any) a
  // few stalks; their rock is a real rock, holdfasts on its crest.
  let kelp: Plan['kelp'] = null;
  const rocks: PlacedRock[] = [];
  const shapes: RockShape[] = [];
  if (forest) {
    // The forest is the live sea's own (one side the forest, the other at
    // most a few stragglers), drawn from the top of the page down, its
    // canopy inside the page; its rocks are kelp-draw's. Here they only
    // hold their place, so no other rock crowds them.
    // The forest stands higher if its rock would crowd a jelly: the rock
    // moves, never the way down.
    let bottom = kelpBottom;
    let made = kelpRocks(bottom);
    // (A far jelly is behind it, in the haze.)
    while (bottom > h * 0.22 && made.some((k) => jellies.some((j) => !j.far && rockTouches(k, w, j.box, CLEAR)))) {
      bottom -= h * 0.02;
      made = kelpRocks(bottom);
    }
    kelp = { bottom, top: kelpTop, keep: kelpKeep, mirror: kelpMirror };
    rocks.push(...made);
  }

  // ---- The rocks: each break's near and inked, at the depth of its rest,
  // near its jelly but never under it; the rocks merely passed far off in
  // the water, small and hazy.
  placeRocks(s, rocks, shapes, { w, h, tall, jellies, winBox, rockFoot, yOf, seed, kelpBottom: kelp?.bottom ?? null, side: wallSide });
  // ---- The walls the rocks stand out from, carrying as ledges the older
  // breaks that came to no rock of their own.
  const ledged = s.rests
    .filter((rest) => !rocks.some((k) => k.kind === 'break' && k.rest === rest.index))
    .map((rest) => {
      const j = rest.after >= 0 ? jellies[rest.after] : null;
      return { rest: rest.index, y: j ? j.y : yOf(rest.at), nearX: j ? j.x : w / 2 };
    });
  const walls = buildWalls(rocks, ledged, { w, h, jellies, winBox, groundY, seed, side: wallSide, kelpBottom: kelp?.bottom ?? null });
  for (const k of rocks) k.wall = walls.find((wl) => wl.edge === k.edge);
  // The shoal of the oldest blocks is far off in the water, never on a
  // rock, its wall or the kelp: moved whole if it would be.
  {
    const kelpZones: Box[] = kelp ? kelpSides(rocks).map((edge) => (edge < 0 ? { x0: 0, x1: Math.max(inL, w * 0.06), y0: 0, y1: kelp!.bottom } : { x0: w - Math.max(inR, w * 0.06), x1: w, y0: 0, y1: kelp!.bottom })) : [];
    const onGround = (b: Box) =>
      rocks.some((k) => rockTouches(k, w, b, CLEAR)) || walls.some((wl) => wallTouches(wl, w, b, CLEAR)) || kelpZones.some((z) => inter(b, grow(z, CLEAR)) > 0) || (floor != null && b.y1 > groundY((b.x0 + b.x1) / 2) - CLEAR);
    if (cloud && onGround(cloud.box)) {
      cloud = placeTheShoal(onGround);
      for (const j of shoal) j.z = zAt(j.y);
    }
  }

  // ---- The rare things, at the depth they happened.
  const pathXAt = (y: number) => distToPathX(path, y);
  const awaySide = (y: number) => (pathXAt(y) < w / 2 ? 1 : -1);
  // At most two rare things to a picture, the rarest: more is a page of
  // sightings, not a sea. Each is placed where it happened, and settled;
  // one with nowhere to be gives its place to the next rarest.
  const kinds: OceanEvent[] = [];
  for (const e of s.events) if (!kinds.some((k) => k.kind === e.kind)) kinds.push(e);
  kinds.sort((a, b) => EVENTS[b.kind].weight - EVENTS[a.kind].weight);
  // The kelp forests, stalks and canopy: no rare thing in them.
  const kelpBoxes: Box[] = kelp
    ? kelpSides(rocks).map((edge) => (edge < 0 ? { x0: 0, x1: Math.max(inL, w * 0.06), y0: 0, y1: kelp.bottom } : { x0: w - Math.max(inR, w * 0.06), x1: w, y0: 0, y1: kelp.bottom }))
    : [];
  const M = Math.min(w, h);
  const eventEnv: EventEnv = { w, h, M, floorY: floor ? floor.y : null, current: s.biome.env.current, awaySide, jellies, groundY, trench };
  /** The jellies' boxes, the far shoal's taken whole; and those the calm water keeps out (the far shoal is in the haze beyond it, like the light). */
  const jellyBoxes = [...jellies.filter((j) => !j.shoal).map((j) => j.box), ...(cloud ? [cloud.box] : [])];
  const calmBoxes = jellies.filter((j) => !j.shoal).map((j) => j.box);
  const calmWith = (extra: Box[]) => calmOf({ w, h, boxes: [winBox, ...calmBoxes, ...kelpBoxes, ...extra], rocks, walls, ground: floor ? groundY : null }).share;
  const settleEnv = { w, h, M, jellies, cloud: cloud?.box ?? null, rocks, walls, winBox, floorTop: floor ? (trench ? trench.top : floor.y) : null, kelp: kelpBoxes, steepY: steepestFall(zStops, h), current: s.biome.env.current, calmWith, groundUnder: floor ? groundUnder : undefined };
  let events: PlacedEvent[] = [];
  for (let take = Math.min(EVENTS_MAX, kinds.length); take <= kinds.length; take++) {
    const list: PlacedEvent[] = [];
    for (const e of kinds.slice(0, take)) {
      const pe = placeEvent(e, yOf(e.start), eventEnv);
      if (pe) list.push(pe);
    }
    settleEvents(list, settleEnv);
    events = list.sort((a, b) => EVENTS[b.kind].weight - EVENTS[a.kind].weight).slice(0, EVENTS_MAX);
    if (events.length >= EVENTS_MAX) break;
  }
  // A second sighting is drawn only if the page keeps its calm with it:
  // otherwise the rarest alone.
  while (events.length > 1 && calmWith(eventSolids(events, M, s.biome.env.current)) < CALM + 0.02) {
    events = events.slice(0, -1);
    settleEvents(events, settleEnv);
  }

  // ---- The calm water: the largest stretch nothing stands in yet, cut to
  // about three tenths of the page (its top kept, where the light comes
  // down through it), and the cast kept out of it.
  const calmBox = chooseCalm({ w, h, boxes: [winBox, ...calmBoxes, ...kelpBoxes, ...eventSolids(events, M, s.biome.env.current)], rocks, walls, ground: floor ? groundY : null }, comp, hero);

  // ---- The cast.
  const cast = solveCast(s, {
    cloud: cloud?.box ?? null,
    calm: calmBox,
    calmSide,
    w,
    h,
    M,
    rnd,
    seed,
    yOf,
    F,
    floorY: floor ? floor.y : null,
    groundY,
    trench,
    jellies,
    rocks,
    events,
    path,
    kelp,
    kelpEdges: kelp ? kelpSides(rocks) : [],
    winBox,
    tall,
  });

  // ---- The rarest is an anglerfish: then it is the picture's one, and the
  // lure's light is not drawn as a second.
  if (cast.cast.some((a) => a.rare && !a.floor && speciesById(s, a.id)?.genome.lure)) {
    const i = events.findIndex((v) => v.kind === 'lure');
    if (i >= 0) events.splice(i, 1);
  }


  // ---- What grows on the stone and the floor, thicker the longer the sitting.
  const { life, edge: lifeEdge } = placeLife({
    w,
    h,
    seed,
    focus: s.focus,
    rocks,
    walls,
    floor,
    trench,
    groundY,
    zAt,
    clear: [winBox, ...jellyBoxes, ...cast.cast.filter((a) => !a.floor).map((a) => a.box), ...events.filter((v) => v.box && v.kind !== 'whalefall').map((v) => v.box as Box)],
    touch: [...cast.cast.filter((a) => a.floor).map((a) => a.box), ...events.filter((v) => v.kind === 'whalefall' && v.box).map((v) => grow(v.box as Box, 6))],
    calm: calmBox,
    dark: ground === 'night',
  });

  // ---- The bubbles: a faint trail rising off the way down, never a line.
  const bubbles = trail(path, jellies, rocks, mulberry32(hash32(seed, 'bubbles')), h, w);

  // ---- The open water's third, away from the wall: never dead. If nothing
  // stands in it (a far shoal, an elder, the whale, the cast), the light
  // comes down through it too, a second narrower sheaf at the window's lean.
  let sheaf: Plan['sheaf'] = null;
  {
    const third: Box = wallSide < 0 ? { x0: (w * 2) / 3, x1: w, y0: 0, y1: h } : { x0: 0, x1: w / 3, y0: 0, y1: h };
    let held = 0;
    const take = (b: Box | null | undefined, k = 1) => {
      if (b) held += (k * inter(b, third)) / area(third);
    };
    for (const j of jellies) if (!j.hero && !j.shoal) take(j.box);
    if (cloud) take(cloud.box);
    for (const a of cast.cast) if (!a.floor) take(a.box, a.layer === 0 ? 0.5 : 1);
    for (const v of eventSolids(events, M, s.biome.env.current)) take(v);
    if (held < OPEN_HELD) {
      const tilt = comp.lean ?? lean;
      const at = { x: fromWall(SHEAF_AT), y: h * 0.38 };
      const top = -h * 0.04;
      sheaf = { x: at.x - Math.tan(tilt) * (at.y - top), y: top };
    }
  }

  let contentBottom = hero.box.y1;
  for (const r of rocks) contentBottom = Math.max(contentBottom, r.box.y1);
  for (const a of cast.cast) if (!a.floor) contentBottom = Math.max(contentBottom, a.box.y1);

  const date = new Date(s.startMs);
  const sun = sunFor(s.hour);
  return {
    key: s.key,
    courseKey: s.courseKey,
    color,
    ground,
    w,
    h,
    unit,
    tall,
    seed,
    focus: s.focus,
    meters: depth.meters,
    zone: depth.zone,
    zMax,
    hour: s.hour,
    night: sun.night,
    moon: sun.night ? moonPhase(date) : null,
    current: s.biome.env.current,
    zStops,
    window: win,
    windowBox: winBox,
    path,
    jellies,
    rocks: rocks.sort((a, b) => a.plane - b.plane),
    walls,
    kelp,
    kelpZones: kelpBoxes,
    calm: calmBox,
    composition: comp,
    life,
    lifeEdge,
    floor,
    trench,
    events,
    cast: cast.cast,
    bubbles,
    contentBottom,
    fit: cast.score,
    missed: Math.max(0, Math.min(EVENTS_MAX, kinds.length) - events.length),
    sheaf,
    shoal: cloud,
  };
}

function kelpSides(rocks: PlacedRock[]): (-1 | 1)[] {
  return [...new Set(rocks.filter((r) => r.kind === 'kelp').map((r) => r.edge))];
}

/* ---- The rocks, placed ---- */

interface RockEnv {
  w: number;
  h: number;
  tall: boolean;
  jellies: PlacedJelly[];
  winBox: Box;
  rockFoot: number;
  yOf: (f: number) => number;
  seed: number;
  kelpBottom: number | null;
  /** The one side the page's wall stands on. */
  side: -1 | 1;
}

function placeRocks(s: Session, rocks: PlacedRock[], shapes: RockShape[], e: RockEnv): void {
  const { w, h, tall, jellies } = e;
  const nBreaks = s.rests.length;
  // Two rocks a side at most, the kelp's own counted: a wall with ledges,
  // never an archipelago. The older breaks past that are ledges in a wall.
  const cap = SIDE_ROCKS;
  const minGap = h * 0.12;
  const fixed = rocks.slice();
  const ratioMax = tall ? 1.1 : 0.8;

  // Each break's rock: its size from how long the rest was.
  type Spec = Omit<PlacedRock, 'box' | 'y' | 'edge'> & { anchor: number; nearX: number };
  const specs: Spec[] = s.rests.map((rest, i) => {
    const near = i >= nBreaks - 2;
    const vary = (unit01(s.key, 'rock-reach', rest.index) - 0.5) * 0.05;
    let reach = clamp(0.17 + 0.11 * Math.min(1, rest.seconds / 1800) + vary, 0.15, 0.32);
    if (!near) reach = Math.max(0.15, reach * (nBreaks > 4 ? 0.75 : 0.86));
    // Every rock runs well off the page (0.08 W or more): it is the end of a wall, never an island.
    // (A wide page crowded with breaks has no room for rocks that big: there they run off it less.)
    const off = (!tall && nBreaks > 4 ? 0.065 : 0.085) + 0.03 * unit01(s.key, 'rock-off', rest.index);
    const want = 0.55 + (ratioMax - 0.55) * unit01(s.key, 'rock-ratio', rest.index);
    let sh = distinctShape(hash32(s.key, 'break-rock', rest.index), want, shapes);
    const cap0 = (near ? (nBreaks > 4 ? 0.14 : 0.2) : nBreaks > 4 ? 0.1 : 0.15) * h;
    let height = sh.ratio * (reach + off) * w;
    if (height > cap0) {
      // Too tall for the page: narrower, keeping its proportions; then, if
      // it must, lower, never under half as tall as it is wide.
      const k = cap0 / height;
      reach = Math.max(0.15, (reach + off) * k - off);
      const lower = Math.max(0.55, Math.min(sh.ratio, cap0 / ((reach + off) * w)));
      if (lower < sh.ratio - 0.01) sh = rockOfRatio(sh, lower);
      height = sh.ratio * (reach + off) * w;
    }
    shapes.push(sh);
    const j = rest.after >= 0 ? jellies[rest.after] : null;
    return {
      kind: 'break',
      rest: rest.index,
      slot: -1,
      height,
      reach,
      off,
      plane: near ? 2 : 1,
      zone: depthAt(rest.at).zone,
      seconds: rest.seconds,
      seed: hash32(s.key, 'break-rock', rest.index),
      shape: sh,
      anchor: j ? j.y : e.yOf(rest.at),
      nearX: j ? j.x : w / 2,
    } as Spec;
  });

  const blocked = (k: PlacedRock, placed: PlacedRock[], gapK = 1, capPlus = 0, mirK = 0): boolean => {
    if (k.y < h * 0.07 || k.y + k.height > e.rockFoot) return true;
    if (rockTouches(k, w, e.winBox, 4)) return true;
    for (const j of jellies) if (rockTouches(k, w, j.box, CLEAR) || buttressTouches(k, w, h, j.box, CLEAR + 1)) return true;
    const same = placed.filter((o) => o.edge === k.edge);
    if (same.length >= cap) return true;
    for (const o of same) {
      const gap = Math.max(o.y - (k.y + k.height), k.y - (o.y + o.height));
      if (gap < (o.kind === 'kelp' ? h * 0.04 : minGap * gapK)) return true;
    }
    for (const o of placed) {
      if (o.edge === k.edge) continue;
      if (rockTouches(k, w, o.box, 8)) return true;
      if (mirK > 0 && mirrors(k, o, mirK)) return true;
    }
    return false;
  };
  /** Never a mirrored pair: two rocks across the page from each other at the same depth read as a stage's wings. */
  const mirrors = (k: PlacedRock, o: PlacedRock, mirK = 1) => {
    if (o.edge === k.edge) return false;
    const mid = (r: PlacedRock) => r.y + r.height / 2;
    return Math.abs(mid(o) - mid(k)) < h * 0.08 * mirK || Math.abs(o.y - k.y) < h * 0.08 * mirK;
  };
  const mirrorCost = (k: PlacedRock, placed: PlacedRock[]) => placed.reduce((a, o) => a + (mirrors(k, o) ? 4 : 0), 0);
  const bandCost = (k: PlacedRock) => {
    const c = k.y + k.height * 0.5;
    let near = 0;
    for (const j of jellies) if (Math.abs(j.y - c) < h * 0.015) near++;
    return near >= 2 ? 0.6 : 0;
  };

  // A rock for a break, from where it is put: its wall, the depth of its
  // middle, and how much smaller than it would be (smaller: less of it off
  // the page, a little less reach, and lower, never under half as tall as
  // it is wide; a wide page's long width lets it reach a little less of it,
  // still a fifth of the short side).
  type Pose = { edge: -1 | 1; centre: number; k: number };
  const build = (sp: Spec, p: Pose): PlacedRock => {
    const off = !tall && nBreaks > 4 ? 0.065 : p.k < 1 ? 0.08 : sp.off;
    const reach = Math.max(!tall && (p.k <= 0.6 || nBreaks > 4) ? (sp.plane === 1 && nBreaks > 4 ? 0.1 : 0.12) : 0.15, (sp.reach + sp.off) * p.k - off);
    const shape = p.k < 1 ? rockOfRatio(sp.shape, Math.max(p.k < 0.5 ? 0.52 : 0.55, sp.shape.ratio * p.k)) : sp.shape;
    const height = shape.ratio * (reach + off) * w;
    const base: Omit<PlacedRock, 'box'> = { ...sp, shape, edge: p.edge, height, reach, off, y: p.centre - height / 2 };
    return { ...base, box: rockBox(base, w) };
  };
  // One wall: every rock on the wall's side, the breaks it has no room for
  // its ledges.
  const nearWallOf = (sp: Spec): -1 | 1 => (sp ? e.side : e.side);
  const sides: (-1 | 1)[] = [e.side];
  /** What a rock costs where it is: off its depth, far across from its jelly, in a row. */
  const costOf = (sp: Spec, k: PlacedRock) => {
    const lip = k.edge < 0 ? k.reach * w : w - k.reach * w;
    const across = Math.max(0, Math.abs(lip - sp.nearX) - w * 0.22);
    // The latest breaks' rocks are held closest to their depth.
    const hold = sp.plane === 2 ? 14 : 3;
    return (Math.abs(k.y + k.height / 2 - sp.anchor) / h) * hold + (across / w) * 2 + bandCost(k) + (k.edge !== nearWallOf(sp) ? 0.15 : 0) + (1 - (k.height / sp.height)) * 0.6;
  };
  const alternates = (placed: PlacedRock[]) => {
    const order = placed.filter((k) => k.kind === 'break').sort((a, b) => a.y - b.y);
    if (order.length < 3) return false;
    for (let i = 1; i < order.length; i++) if (order[i].edge === order[i - 1].edge) return false;
    return true;
  };
  /** A whole arrangement: its cost, and how many rocks in it break a rule (each heavily). */
  const total = (poses: Pose[]) => {
    const placed: PlacedRock[] = fixed.slice();
    let cost = 0;
    for (let i = specs.length - 1; i >= 0; i--) {
      const k = build(specs[i], poses[i]);
      if (blocked(k, placed)) cost += 40;
      cost += costOf(specs[i], k) + mirrorCost(k, placed);
      placed.push(k);
    }
    // Never strict left-right-left down the page: that is a diagram.
    if (alternates(placed)) cost += 1.5;
    // Nor the same rock twice.
    const drawn = placed.filter((k) => k.kind === 'break');
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) if (sameRock(drawn[i].shape, drawn[j].shape)) cost += 6;
    return { cost, placed };
  };

  // First, greedy: each rock where it fits best given those already put,
  // the latest first (as they matter most), and in other orders too.
  let bestPoses: Pose[] | null = null;
  let bestCost = Infinity;
  const K = 24;
  for (let c = 0; c < K; c++) {
    const r = mulberry32(hash32(e.seed, 'rocks', c));
    const orderOf = specs.map((_, i) => i).reverse();
    if (c % 2 === 1) for (let i = orderOf.length - 1; i > 1; i--) {
      const k = 2 + Math.floor(r() * (i - 1));
      [orderOf[i], orderOf[k]] = [orderOf[k], orderOf[i]];
    }
    if (c % 4 === 2) orderOf.sort((a, b) => specs[a].anchor - specs[b].anchor);
    const placed: PlacedRock[] = fixed.slice();
    const poses: Pose[] = specs.map((sp) => ({ edge: nearWallOf(sp), centre: sp.anchor, k: 0.72 }));
    for (const i of orderOf) {
      const sp = specs[i];
      const nearWall = nearWallOf(sp);
      const tries: Pose[] = [];
      for (let t = 0; t < 30; t++) tries.push({ edge: nearWall, centre: sp.anchor + (gauss(r) * 0.07 + 0.03) * h * (1 + t / 15), k: 1 });
      for (const k of [1, 0.85, 0.72, 0.6]) for (let y = h * 0.1; y < h * 0.9; y += h * 0.025) for (const edge of sides) tries.push({ edge, centre: y, k });
      let pick: { pose: Pose; rock: PlacedRock; cost: number } | null = null;
      for (let t = 0; t < tries.length; t++) {
        // Found near where it belongs: done. Otherwise the whole scan, and the best of it.
        if (pick && t === 30) break;
        const rock = build(sp, tries[t]);
        if (blocked(rock, placed)) continue;
        const kc = costOf(sp, rock) + mirrorCost(rock, placed);
        if (!pick || kc < pick.cost) pick = { pose: tries[t], rock, cost: kc };
      }
      if (pick) {
        poses[i] = pick.pose;
        placed.push(pick.rock);
      }
    }
    const tc = total(poses).cost;
    if (tc < bestCost) {
      bestCost = tc;
      bestPoses = poses;
    }
  }
  // Then a slow settling of the whole: one rock moved at a time, kept if
  // the arrangement is better for it (now and then if a little worse, so it
  // can get out of a corner), until nothing breaks a rule and each is as
  // near its rest as the page allows.
  let poses = (bestPoses as Pose[]).map((p) => ({ ...p }));
  let cur = bestCost;
  let best = { poses: poses.map((p) => ({ ...p })), cost: cur };
  if (specs.length) {
    const r = mulberry32(hash32(e.seed, 'settle'));
    const steps = 900 + specs.length * 250;
    for (let it = 0; it < steps; it++) {
      const temp = 2 * (1 - it / steps) ** 2;
      const i = Math.floor(r() * specs.length);
      const p = { ...poses[i] };
      const m = r();
      let next: Pose[];
      if (m > 0.85 && specs.length > 1) {
        // Two rocks trade places: the move that gets each nearer its own rest.
        let j = Math.floor(r() * (specs.length - 1));
        if (j >= i) j++;
        next = poses.map((q, k) => (k === i ? { ...poses[j], k: q.k } : k === j ? { ...poses[i], k: q.k } : q));
      } else {
        if (m < 0.5) p.centre = clamp(p.centre + gauss(r) * h * (0.04 + 0.1 * temp), h * 0.05, h * 0.95);
        else if (m < 0.65) p.k = [1, 0.85, 0.72, 0.6][Math.floor(r() * 4)];
        else if (m < 0.78) p.k = [1, 0.85, 0.72, 0.6][Math.floor(r() * 4)];
        else p.centre = h * (0.1 + 0.8 * r());
        next = poses.map((q, k) => (k === i ? p : q));
      }
      const nc = total(next).cost;
      if (nc < cur || r() < Math.exp(-(nc - cur) / Math.max(1e-3, temp))) {
        poses = next;
        cur = nc;
        if (cur < best.cost) best = { poses: poses.map((q) => ({ ...q })), cost: cur };
      }
    }
  }
  // A last polish: each rock in turn, the latest first, moved to the best
  // place it has with the others where they are, if that is better.
  {
    const poses2 = best.poses.map((q) => ({ ...q }));
    let cost2 = total(poses2).cost;
    for (let round = 0; round < 2; round++) {
      // Pairs trading places, at sizes of their own.
      for (let i = 0; i < specs.length; i++) {
        for (let j = i + 1; j < specs.length; j++) {
          for (const [ki, kj] of [[poses2[i].k, poses2[j].k], [0.72, 0.72], [0.6, 0.85], [0.85, 0.6]]) {
            const trial = poses2.map((q, n) => (n === i ? { ...poses2[j], k: ki } : n === j ? { ...poses2[i], k: kj } : q));
            const tc = total(trial).cost;
            if (tc < cost2 - 1e-9) {
              cost2 = tc;
              poses2[i] = trial[i];
              poses2[j] = trial[j];
            }
          }
        }
      }
      for (let i = specs.length - 1; i >= 0; i--) {
        for (const k of [1, 0.85, 0.72, 0.6, 0.5]) {
          for (let y = h * 0.08; y < h * 0.92; y += h * 0.015) {
            for (const edge of sides) {
              const trial = poses2.map((q, j) => (j === i ? { edge, centre: y, k } : q));
              const tc = total(trial).cost;
              if (tc < cost2 - 1e-9) {
                cost2 = tc;
                poses2[i] = { edge, centre: y, k };
              }
            }
          }
        }
      }
    }
    if (cost2 < best.cost) best = { poses: poses2, cost: cost2 };
  }
  // Whatever still breaks a rule is left out rather than crowd a jelly or
  // the window: the plan's tests make sure that never happens.
  const settled = total(best.poses).placed.filter((k) => k.kind === 'break');
  const kept: PlacedRock[] = fixed.slice();
  for (const k of settled) {
    // Sized and settled, two may have come out the same rock: the later
    // one is made again, another kind at the same size, where it stands.
    let rock = k;
    const twins = () => kept.some((o) => o.kind !== 'kelp' && sameRock(o.shape, rock.shape));
    for (let t = 0; twins() && t < 12; t++) {
      const want = Math.max(0.53, k.shape.ratio * 0.97);
      let shape = rockOfKind(hash32(k.seed, 'again', t), t % 4, want, true, ROCK_GRAMMARS[t % ROCK_GRAMMARS.length]);
      if (shape.ratio > k.shape.ratio) shape = rockOfRatio(shape, want);
      if (shape.ratio > Math.max(k.shape.ratio * 1.01, 0.56) || shape.ratio < 0.5) continue;
      const height = shape.ratio * (k.reach + k.off) * w;
      const next = { ...k, shape, height, y: k.y + (k.height - height) / 2 };
      const made: PlacedRock = { ...next, box: rockBox(next, w) };
      if (!blocked(made, kept)) rock = made;
    }
    if (!blocked(rock, kept)) kept.push(rock);
  }
  // A break with no room left still gets its rock: smaller, anywhere it can
  // stand, and (only then) closer to its neighbour on that wall.
  const fit = (sp: Spec, among: PlacedRock[]): PlacedRock | null => {
    let pick: { rock: PlacedRock; cost: number } | null = null;
    // The pair rule gives way before the room between rocks on one wall does.
    for (const [gapK, capPlus, mirK] of [[1, 0, 1], [1, 0, 0.5], [1, 0, 0], [0.66, 0, 0], [0.4, 0, 0]]) {
      for (const kk of [0.72, 0.6, 0.5, 0.45]) {
        for (let y = h * 0.08; y < h * 0.92; y += h * 0.01) {
          for (const edge of sides) {
            const rock = build(sp, { edge, centre: y, k: kk });
            if (blocked(rock, among, gapK, capPlus, mirK)) continue;
            const cost = costOf(sp, rock) + (among.some((o) => o.kind === 'break' && sameRock(o.shape, rock.shape)) ? 6 : 0);
            if (!pick || cost < pick.cost) pick = { rock, cost };
          }
        }
      }
      if (pick) break;
    }
    return (pick as { rock: PlacedRock; cost: number } | null)?.rock ?? null;
  };
  for (const sp of specs) {
    if (kept.some((o) => o.kind === 'break' && o.rest === sp.rest)) continue;
    const got = fit(sp, kept);
    if (got) {
      kept.push(got);
      continue;
    }
    // Still no room: one of the others made smaller where it stands, to let it in.
    for (let i = 0; i < kept.length; i++) {
      const o = kept[i];
      const os = specs.find((q) => o.kind === 'break' && q.rest === o.rest);
      if (!os) continue;
      const others = kept.filter((_, j) => j !== i);
      const small = build(os, { edge: o.edge, centre: o.y + o.height / 2, k: 0.5 });
      if (small.height >= o.height - 1e-6 || blocked(small, others, 0.4, 1)) continue;
      const made = fit(sp, [...others, small]);
      if (!made) continue;
      kept[i] = small;
      kept.push(made);
      break;
    }
  }
  // And once all are down: no two the same rock. The later one is made
  // again, another kind no bigger, where it stands.
  for (let i = 0; i < kept.length; i++) {
    const k = kept[i];
    if (k.kind !== 'break') continue;
    const others = kept.filter((o, j) => j !== i && o.kind === 'break');
    if (!others.some((o) => sameRock(o.shape, k.shape))) continue;
    const rest = kept.filter((_, j) => j !== i);
    for (let t = 0; t < 24; t++) {
      const want = Math.max(0.52, k.shape.ratio * (0.92 + 0.02 * (t % 4)));
      let shape = rockOfKind(hash32(k.seed, 'twin', t), (t + 1) % 4, want, true, ROCK_GRAMMARS[(t + 2) % ROCK_GRAMMARS.length]);
      if (shape.ratio > k.shape.ratio) shape = rockOfRatio(shape, want);
      if (shape.ratio > Math.max(k.shape.ratio * 1.01, 0.56) || shape.ratio < 0.5) continue;
      if (others.some((o) => sameRock(o.shape, shape))) continue;
      const height = shape.ratio * (k.reach + k.off) * w;
      const next = { ...k, shape, height, y: k.y + (k.height - height) / 2 };
      const made: PlacedRock = { ...next, box: rockBox(next, w) };
      if (blocked(made, rest, 0.4, 1)) continue;
      kept[i] = made;
      break;
    }
  }
  const chosen = kept;

  const breaks = chosen.filter((k) => k.kind === 'break');

  // The rocks merely passed: far, small, faint, where room is left.
  const passed: PlacedRock[] = [];
  for (const { outcrop: o, at } of s.rocks) {
    if (passed.length >= 3) break;
    // One wall to a page: a rock passed stands far off only where there is no other, on the wall's side.
    if (o.edge !== e.side || chosen.length) continue;
    const y0 = e.yOf(at);
    if (e.kelpBottom != null && y0 < e.kelpBottom && o.zone === 0) continue;
    const r = mulberry32(hash32(s.key, 'passed', o.slot));
    const reach = clamp(o.reach, 0.15, 0.26) * 0.6;
    const off = 0.08 + 0.02 * r();
    const want = Math.max(0.55, Math.min(ratioMax, (h * 0.1) / ((reach + off) * w)));
    const sh = distinctShape(hash32(s.key, 'passed-rock', o.slot), want, shapes);
    const height = sh.ratio * (reach + off) * w;
    // Only on a wall of its own: a far rock on a near rock's wall would stand in front of it.
    if ([...chosen, ...passed].some((k) => k.edge === o.edge && k.kind !== 'passed')) continue;
    for (let t = 0; t < 12; t++) {
      const centre = y0 + (t === 0 ? 0 : gauss(r) * h * 0.08);
      const base: Omit<PlacedRock, 'box'> = {
        kind: 'passed',
        rest: -1,
        slot: o.slot,
        edge: o.edge,
        y: centre - height / 2,
        height,
        reach,
        off,
        plane: 0,
        zone: o.zone,
        seconds: 0,
        seed: hash32(s.key, 'passed-rock', o.slot),
        shape: sh,
      };
      const k: PlacedRock = { ...base, box: rockBox(base, w) };
      if (blocked(k, [...chosen, ...passed], 1, 0, 1)) continue;
      passed.push(k);
      shapes.push(sh);
      break;
    }
  }
  rocks.push(...breaks, ...passed);
}

/* ---- The rare things, placed ---- */

interface EventEnv {
  w: number;
  h: number;
  M: number;
  floorY: number | null;
  current: 1 | -1;
  awaySide: (y: number) => 1 | -1;
  jellies: PlacedJelly[];
  groundY: (x: number) => number;
  trench: Trench | null;
}

/** The paper sea's lightness (L*) at a depth, near enough: its tones' own, read off. */
const SEA_L: [number, number][] = [
  [0, 94],
  [0.15, 88],
  [0.3, 77],
  [0.45, 61],
  [0.6, 46],
  [0.75, 34],
  [0.88, 26],
  [1, 22],
];

/**
 * Where the water down the page darkens fastest in its upper three fifths,
 * as paint.ts lays it (the depth's tone, blurred down the page over about a
 * quarter of it): a long dark edge there sharpens the fall into a horizon.
 */
export function steepestFall(zStops: { y: number; z: number }[], h: number): number | null {
  if (zStops.length < 2) return null;
  const N = 120;
  const Lz = (z: number) => {
    for (let i = 1; i < SEA_L.length; i++) {
      if (z <= SEA_L[i][0]) {
        const [z0, a] = SEA_L[i - 1];
        const [z1, b] = SEA_L[i];
        return a + ((b - a) * (z - z0)) / (z1 - z0);
      }
    }
    return SEA_L[SEA_L.length - 1][1];
  };
  const zy = (y: number) => {
    let k = 1;
    while (k < zStops.length - 1 && zStops[k].y < y) k++;
    const a = zStops[k - 1];
    const b = zStops[k];
    return a.z + ((b.z - a.z) * clamp((y - a.y) / Math.max(1e-6, b.y - a.y), 0, 1));
  };
  const L = Array.from({ length: N }, (_, i) => Lz(zy((h * i) / (N - 1))));
  const sigma = N * 0.12;
  const rad = Math.ceil(sigma * 3);
  const blurred = L.map((_, i) => {
    let acc = 0;
    let ws = 0;
    for (let k = -rad; k <= rad; k++) {
      const wk = Math.exp(-((k / sigma) ** 2) / 2);
      acc += L[clamp(i + k, 0, N - 1)] * wk;
      ws += wk;
    }
    return acc / ws;
  });
  let at = -1;
  let worst = 0;
  for (let i = 1; i < Math.round(N * 0.6); i++) {
    const d = blurred[i - 1] - blurred[i];
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  return at < 0 ? null : (h * (at - 0.5)) / (N - 1);
}

/**
 * The squid's eye as drawEye (draw.ts) lays it in a picture: its radius
 * (EYE_PICTURE of the page's short side, so 0.05 S across); how far in
 * radii it keeps its middle from its band's top and foot (PATCH_RY ragged,
 * and a little); and how far its patch of mantle reaches, in radii from the
 * eye's middle, toward the page, up and down.
 */
export const EYE_R = 0.025 * REF;
/** Where the eye looks in from, shares of the page's height. */
export const EYE_BAND: [number, number] = [0.45, 0.8];
const EYE_REACH = 3.92;
const EYE_PATCH_IN = 3.1;
const EYE_PATCH_UP = 3.9;
const EYE_PATCH_DOWN = 3.9;

/**
 * The turtle come to look at a jelly, from its own side of it or (mirrored)
 * the other: drawTurtle sets it a fixed way off the jelly it is given, so
 * moving it is choosing the jelly and the side.
 */
function turtleAt(e: { kind: EventKind; seed: number; start: number }, jel: PlacedJelly, mirror: boolean, w: number, M: number): PlacedEvent {
  const sd = e.seed;
  const rh = M * 0.6;
  const L = 0.16 * Math.min(w, rh);
  const dir = sd & 1 ? 1 : -1;
  const jitter = ((sd >>> 8) % 100) / 100 - 0.5;
  const gap = Math.max(0.2 * w, L * 1.15 + jel.r * 1.2);
  const x = mirror ? jel.x + dir * gap : jel.x - dir * gap;
  const ry = jel.y - rh / 2;
  const ty = jel.y + jitter * 0.06 * rh;
  return {
    kind: e.kind,
    seed: sd,
    start: e.start,
    edge: false,
    age: 0.5,
    rx: 0,
    ry,
    rw: w,
    rh,
    mirror,
    x,
    y: ty,
    far: false,
    box: { x0: x - L * 0.95, x1: x + L * 0.95, y0: ty - L * 0.5, y1: ty + L * 0.5 },
    look: { x: mirror ? w - jel.x : jel.x, y: rh / 2 },
  };
}

/**
 * How soft the whale's shadow is in a picture, a share of the short side:
 * the live sea's own hundredth (never past 0.012 of the width), crisp
 * enough that its flukes and flipper read as a whale's and not a cloud's.
 * Its back is kept off a level line by its pitch and its lost top, not by
 * blurring the whole of it.
 */
export const WHALE_BLUR = 0.01;
/** And how it pitches, head up, as it rises: so its back is never level across the page. */
export const WHALE_PITCH = 0.1;

/**
 * The whale's measure, as drawWhale lays it in its region: its length, the
 * middle of its body, the line of its back, and what it covers (units): its
 * body, its flipper, and the two together. `current` is the way it swims
 * (the region's own; mirrored with it).
 */
export function whaleHull(e: PlacedEvent, S: number, current: 1 | -1 = 1): { len: number; cx: number; cy: number; dorsal: number; body: Box; flipper: Box; box: Box } {
  // drawWhale (draw.ts): blurred by WHALE_BLUR of the page, its length
  // 0.6 of its region's width (if the region is deep enough), 0.11 of its
  // length above its middle and 0.228 below, and its middle down the region
  // where its seed puts it. Caught at the middle of its pass: across, the
  // region's middle. Its outline (WHALE_BODY): back 0.07 of its length
  // above the middle (the fin 0.085), belly 0.09 below, flukes 0.105 either
  // way, snout to flukes 0.5 ahead and 0.556 behind; the flipper hangs from
  // 0.07 to 0.29 ahead, down to 0.22.
  const blur = WHALE_BLUR * S;
  const len = Math.max(20, Math.min(e.rw * 0.6, Math.max(e.rw, e.rh) * 0.62, (e.rh - blur * 4) / (0.11 + 0.228)));
  const top = 0.11 * len + blur * 2;
  const bottom = 0.228 * len + blur * 2;
  const want = e.rh * (0.1 + (((e.seed >>> 8) % 100) / 100) * 0.12);
  const cy = e.ry + (e.rh > top + bottom ? Math.max(top, Math.min(e.rh - bottom, want)) : top);
  const cx = e.rx + e.rw / 2;
  const ahead = current * (e.mirror ? -1 : 1);
  // A little more for its pitch and its blur.
  const pad = 0.04 * len + blur;
  const body = { x0: cx - 0.556 * len - pad, x1: cx + 0.556 * len + pad, y0: cy - 0.105 * len - pad, y1: cy + 0.105 * len + pad };
  const fx0 = cx + ahead * 0.07 * len;
  const fx1 = cx + ahead * 0.29 * len;
  const flipper = { x0: Math.min(fx0, fx1) - pad, x1: Math.max(fx0, fx1) + pad, y0: cy + 0.05 * len - pad, y1: cy + 0.22 * len + pad };
  return { len, cx, cy, dorsal: cy - 0.07 * len, body, flipper, box: { x0: body.x0, x1: body.x1, y0: body.y0, y1: flipper.y1 } };
}

function placeEvent(e: OceanEvent, y: number, o: EventEnv): PlacedEvent | null {
  const { w, h, M } = o;
  const side = o.awaySide(y);
  const base = { kind: e.kind, seed: e.seed, start: e.start, mirror: false, edge: false } as const;
  const sd = e.seed;
  switch (e.kind) {
    case 'whale': {
      // Its whole silhouette, never cut: drawWhale makes it 0.6 of its
      // region's width and fits it inside the region's height, so a square
      // region a little bigger than the whale holds all of it (the flukes,
      // the flipper, the head's taper). It is 0.42 to 0.5 of the page's
      // width, caught at the middle of its pass (full strength), inside the
      // page and on the side away from the way down.
      // (Never longer than 0.6 to 0.7 of the short side: on a wide page a
      // whale across most of it would leave no water calm under it.)
      const len = Math.min(w * (0.42 + 0.08 * (((sd >>> 3) % 100) / 100)), M * (0.55 + 0.1 * (((sd >>> 3) % 100) / 100)));
      const rw = len / 0.6;
      const rh = rw * 0.8;
      // The body runs from 0.6 of its length behind the middle to 0.5 ahead.
      const lo = len * 0.62 + w * 0.02;
      const hi = w - len * 0.62 - w * 0.02;
      const want = clamp(w * (side > 0 ? 0.6 : 0.4), Math.min(lo, hi), Math.max(lo, hi));
      const cy = clamp(y, h * 0.2, h * 0.45);
      return { ...base, age: 0.5, rx: want - rw / 2, ry: cy - rh * 0.3, rw, rh, x: want, y: cy, far: true, box: null };
    }
    case 'leviathan': {
      const top = clamp(y - h * 0.3, h * 0.25, h * 0.7);
      return { ...base, age: 0.5, rx: 0, ry: top, rw: w, rh: h - top + 20, x: w / 2, y: top + (h - top) * 0.5, far: true, box: null };
    }
    case 'storm': {
      // The haze is a gradient laid over the whole of the region it is
      // given, so the region is made square and big enough that the haze has
      // faded to nothing well inside it.
      const reach = Math.min(w, h) * 0.32;
      const R = reach / (0.2 + 0.35 * 0.1);
      const nx = R * (0.25 + (((sd >>> 4) % 100) / 100) * 0.5);
      const ny = R * (0.35 + (((sd >>> 12) % 100) / 100) * 0.35);
      const want = w * (side > 0 ? 0.68 : 0.32);
      return { ...base, age: 0.1, rx: want - nx, ry: y - ny, rw: R, rh: R, x: want, y, far: true, box: null };
    }
    case 'siphonophore': {
      // Lying easy and mostly off one side, in a gentle curve: never a long
      // line across the page, and never along the way down.
      // Always hung at a tilt the picture gives it, 22 to 36 degrees (never
      // the level clothesline a shallow one reads as), and its region deep
      // enough for that tilt whole: drawSiphonophore eases the tilt down to
      // fit a shallower region, so the region is grown until it need not.
      const rw = Math.min(w * 0.52, M * 0.62);
      const tilt = SIPHON_TILT[0] + (SIPHON_TILT[1] - SIPHON_TILT[0]) * (((sd >>> 5) % 1000) / 1000);
      const lie = side * tilt;
      let rh = Math.min(h * 0.55, rw * 0.5);
      while (rh < h * 0.9 && siphonophoreReach(rw, rh, sd, lie).tilt < tilt - 1e-6) rh += h * 0.01;
      const ry = clamp(y - rh / 2, h * 0.04, h * 0.95 - rh);
      const rx = side > 0 ? w * 0.72 : w * 0.28 - rw;
      const pe: PlacedEvent = { ...base, age: 0.5, rx, ry, rw, rh, x: side > 0 ? w : 0, y: ry + rh / 2, far: false, box: null, lie };
      pe.box = eventHull(pe, w);
      return pe;
    }
    case 'eye': {
      // Small in a print, its patch of mantle cut by the edge of the page.
      // drawEye sizes the eye to the page (EYE_R: 5% of the short side
      // across), sets it 0.82 of a radius in from the edge, and keeps its
      // whole patch (EYE_PATCH_Y radii up and down) inside its band.
      const re = EYE_R;
      const reach = re * EYE_REACH + 2;
      const rh = Math.max(w * 0.2, 0.2 * M, reach * 2 + 16, re * 7.2);
      const left = sd % 2 === 0;
      const want = rh * (0.18 + (((sd >>> 6) % 100) / 100) * 0.2);
      const ny = clamp(want, reach, rh - reach);
      const ry = clamp(y, h * EYE_BAND[0], h * EYE_BAND[1]) - ny;
      const mirror = (left ? -1 : 1) !== side;
      const onLeft = left !== mirror;
      const pe: PlacedEvent = { ...base, age: 0.4, rx: 0, ry, rw: w, rh, mirror, x: onLeft ? re * 0.82 : w - re * 0.82, y: ry + ny, far: false, box: null, edge: true };
      pe.box = eventHull(pe, w);
      return pe;
    }
    case 'turtle': {
      // It comes to look at a jelly: the one nearest the depth it came at.
      let jel = o.jellies[0];
      for (const j of o.jellies) if (Math.abs(j.y - y) < Math.abs(jel.y - y)) jel = j;
      if (!jel) return null;
      const L = 0.16 * Math.min(w, M * 0.6);
      const natX = turtleAt(e, jel, false, w, M).x;
      return turtleAt(e, jel, natX < w * MARGIN + L || natX > w * (1 - MARGIN) - L, w, M);
    }
    case 'oarfish': {
      const rh = h * 0.6;
      const left = (sd & 1) === 0;
      const nx = w * (left ? 0.15 + (((sd >>> 4) % 100) / 100) * 0.15 : 0.85 - (((sd >>> 4) % 100) / 100) * 0.15);
      const ny = rh * (0.12 + (((sd >>> 11) % 100) / 100) * 0.08) - 0.5 * rh * 0.035;
      const mirror = (left ? -1 : 1) !== side;
      const x = mirror ? w - nx : nx;
      const ry = clamp(y, h * 0.12, h * 0.6) - ny;
      const pe: PlacedEvent = { ...base, age: 0.5, rx: 0, ry, rw: w, rh, mirror, x, y: ry + ny, far: false, box: null };
      pe.box = eventHull(pe, w);
      return pe;
    }
    case 'lure': {
      const rh = M * 0.45;
      const rand = mulberry32(sd ^ 0x51a7e);
      const right = (sd & 1) === 1;
      const nx = w * (right ? 0.7 + rand() * 0.18 : 0.12 + rand() * 0.18);
      const ny = rh * (0.15 + rand() * 0.4);
      const L = Math.min(w, rh) * 0.2;
      const mirror = (right ? 1 : -1) !== side;
      // It faces the middle, so the body lies toward its edge.
      const onRight = right !== mirror;
      const want = onRight ? w * (1 - MARGIN) - L * 0.15 : w * MARGIN + L * 0.98;
      const natX = mirror ? w - nx : nx;
      const yy = clamp(y, h * 0.12, h * 0.85);
      const pe: PlacedEvent = { ...base, age: 0.54, rx: want - natX, ry: yy - ny, rw: w, rh, mirror, x: want, y: yy, far: false, box: null };
      pe.box = eventHull(pe, w);
      return pe;
    }
    case 'dumbo': {
      const rh = M * 0.7;
      const rand = mulberry32(sd ^ 0xd0b0);
      rand();
      const startX = 0.28 + rand() * 0.44;
      rand();
      rand();
      const baseY = 0.64 + rand() * 0.1;
      const S = Math.min(w, rh) * 0.11;
      const want = w * (side > 0 ? 0.72 : 0.28);
      const yy = clamp(y, h * 0.2, (o.floorY ?? h) - S * 1.2);
      return { ...base, age: 0.5, rx: want - w * startX, ry: yy - rh * baseY, rw: w, rh, x: want, y: yy, far: false, box: { x0: want - S * 1.1, x1: want + S * 1.1, y0: yy - S * 0.9, y1: yy + S * 0.75 } };
    }
    case 'whalefall': {
      if (o.floorY == null) return null;
      // On the floor, half sunk; in a trench, on the bench beside the cleft,
      // never in it. Where the ground is level under the whole of it, every
      // bone resting on it: the flattest stretch near where its seed puts it.
      const rand = mulberry32(sd ^ 0x3a1ef);
      rand();
      const at = 0.375 + rand() * 0.25;
      let L = w * 0.36;
      let x0 = w * 0.1;
      let x1 = w * 0.9;
      let want = w * (0.3 + 0.4 * at);
      const t = o.trench;
      if (t) {
        const leftRoom = t.x - t.gap / 2;
        const rightRoom = w - (t.x + t.gap / 2);
        const onLeft = leftRoom >= rightRoom;
        const room = Math.max(leftRoom, rightRoom);
        L = Math.min(L, room * 0.45);
        x0 = onLeft ? w * 0.07 : t.x + t.gap / 2;
        x1 = onLeft ? leftRoom : w * 0.93;
        want = onLeft ? x0 + L / 2 : x1 - L / 2;
      }
      // (drawWhaleFall's bones run from 0.57 of its length one side of the
      // middle to 0.58 the other, skull to tail.)
      const rise = (cx: number, len: number) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 0; k <= 20; k++) {
          const g = o.groundY(cx - len * 0.58 + (len * 1.16 * k) / 20);
          lo = Math.min(lo, g);
          hi = Math.max(hi, g);
        }
        return { lo, hi };
      };
      let pick: { cx: number; L: number; cost: number } | null = null;
      const level = (t ? WHALEFALL_LEVEL_TRENCH : WHALEFALL_LEVEL) * REF;
      for (const len of [L, L * 0.85, L * 0.72, L * 0.6, L * 0.5]) {
        for (let k = 0; k <= 40; k++) {
          const cx = x0 + len * 0.58 + ((x1 - x0 - len * 1.16) * k) / 40;
          if (x1 - x0 < len * 1.16) break;
          const { lo, hi } = rise(cx, len);
          const cost = Math.max(0, hi - lo - level) * 0.2 + Math.abs(cx - want) / w + (1 - len / L);
          if (!pick || cost < pick.cost) pick = { cx, L: len, cost };
        }
      }
      // Nowhere level enough for its bones to rest on: not drawn (a sighting that cannot have its room is not).
      if (!pick || rise(pick.cx, pick.L).hi - rise(pick.cx, pick.L).lo > level * 1.25) return null;
      const cx = pick.cx;
      L = pick.L;
      const rw = L / 0.45;
      // (Its bones are laid along the lowest of the ground under it, so none stands off it.)
      const fy = rise(cx, L).hi + 0.004 * h;
      return { ...base, age: 1, rx: cx - rw * at, ry: 0, rw, rh: h, x: cx, y: fy, far: false, box: { x0: cx - L * 0.58, x1: cx + L * 0.58, y0: fy - L * 0.05, y1: fy + L * 0.115 } };
    }
  }
  return null;
}

/** What a rare thing takes up on the page, for the ones that move: in units. */
function eventHull(e: PlacedEvent, w: number): Box | null {
  switch (e.kind) {
    case 'siphonophore': {
      // Where the colony reaches, as sightings-shallow.ts measures it in
      // its region (drawn mirrored when the region is), as far as the page.
      const mir = e.mirror;
      const p0 = mir ? e.rw - (w - e.rx) : -e.rx;
      const p1 = mir ? e.rw + e.rx : w - e.rx;
      const lie = e.lie ?? 0.1;
      const r = siphonophoreReach(e.rw, e.rh, e.seed, lie, lie > 0 ? p1 : p0);
      const X0 = mir ? e.rx + e.rw - r.x1 : e.rx + r.x0;
      const X1 = mir ? e.rx + e.rw - r.x0 : e.rx + r.x1;
      return { x0: Math.max(0, X0), x1: Math.min(w, X1), y0: e.ry + r.y0, y1: e.ry + r.y1 };
    }
    case 'eye': {
      // drawEye sizes itself to the page: an eye 5% of the short side
      // across, 0.82 of a radius in from the edge, in its patch of mantle.
      const r = EYE_R;
      const onLeft = e.x < w / 2;
      return onLeft ? { x0: 0, x1: e.x + r * EYE_PATCH_IN, y0: e.y - r * EYE_PATCH_UP, y1: e.y + r * EYE_PATCH_DOWN } : { x0: e.x - r * EYE_PATCH_IN, x1: w, y0: e.y - r * EYE_PATCH_UP, y1: e.y + r * EYE_PATCH_DOWN };
    }
    case 'oarfish': {
      const D = Math.min(w, e.rh) * 0.042;
      const toward = e.x < w / 2 ? -1 : 1;
      const drift = e.rh * 0.14;
      const xa = e.x - D * 3;
      const xb = e.x + D * 3;
      return { x0: toward < 0 ? xa - drift : xa, x1: toward > 0 ? xb + drift : xb, y0: e.y - D * 2, y1: e.ry + e.rh };
    }
    case 'lure': {
      const L = Math.min(w, e.rh) * 0.2;
      const onRight = e.x > w / 2;
      return onRight ? { x0: e.x - 0.25 * L, x1: e.x + L * 0.98, y0: e.y - L * 0.35, y1: e.y + L * 0.6 } : { x0: e.x - L * 0.98, x1: e.x + 0.25 * L, y0: e.y - L * 0.35, y1: e.y + L * 0.6 };
    }
    default:
      return e.box;
  }
}

function shiftEvent(e: PlacedEvent, dy: number): void {
  e.ry += dy;
  e.y += dy;
  if (e.box) e.box = { ...e.box, y0: e.box.y0 + dy, y1: e.box.y1 + dy };
}

/** Across the page by dx, its hull measured again (what of it the page shows changes). */
function slideEvent(e: PlacedEvent, dx: number, w: number): void {
  e.rx += dx;
  e.x += dx;
  e.box = eventHull(e, w);
}

/** Across the page to the other side: the region mirrored about the middle. */
function flipEvent(e: PlacedEvent, w: number): void {
  e.mirror = !e.mirror;
  e.rx = w - e.rx - e.rw;
  e.x = w - e.x;
  if (e.box) e.box = { x0: w - e.box.x1, x1: w - e.box.x0, y0: e.box.y0, y1: e.box.y1 };
}

/** The tilt, radians below level, a picture hangs its siphonophore at: well inside the colony's own 0.26 to 0.7. */
export const SIPHON_TILT: [number, number] = [0.38, 0.63];

/** The least gap a rare thing laid by the looser rules keeps from a rock, a wall, a jelly (0.01 S). */
const LOOSE = 0.01 * REF;

/** How much calm water short of CALM_ENOUGH a rare thing may leave weighs against moving it (a share of the page's height moved for each share of it short). */
const CALM_PULL = 20;
const CALM_ENOUGH = 0.31;

/** How far the middle and near cast keep from the whale's shadow, a share of the width. */
export const WHALE_CLEAR = 0.05;
/** The most of the cast by the wall: its third of the page. */
export const CAST_BY_WALL = 0.6;
/** Where a rare jelly hangs, shares of the page's height. */
export const RARE_BELL: [number, number] = [0.7, 0.95];

/** How far the ground under a whale fall may rise and fall along it, a share of the short side: level enough that every bone rests on it. */
export const WHALEFALL_LEVEL = 0.006;
/** On a trench's bench, a little more (it is rock, and falls in ledges). */
export const WHALEFALL_LEVEL_TRENCH = 0.02;

/** The most rare things one picture draws. */
export const EVENTS_MAX = 2;

/** The big rare things that must never touch the hero, each other or a rock. */
const LONE: EventKind[] = ['lure', 'siphonophore', 'oarfish'];

/**
 * The hard rules for the rare things: none over the window, none within the
 * hero's margin; the lure, the siphonophore and the oarfish touching nothing
 * solid nor each other; the eye never on a rock. Each is moved the least it
 * takes, up or down near its depth, and only then across the page.
 */
function settleEvents(
  events: PlacedEvent[],
  e: { w: number; h: number; M: number; jellies: PlacedJelly[]; cloud?: Box | null; rocks: PlacedRock[]; walls: Wall[]; winBox: Box; floorTop: number | null; kelp: Box[]; steepY: number | null; current: 1 | -1; calmWith: (extra: Box[]) => number; groundUnder?: (b: Box) => number },
): void {
  const { w, h } = e;
  const hero = e.jellies[e.jellies.length - 1];
  /** How much of a box stands in the water kept calm (its side of the page, under the window and over the ground), 0 to 1. */

  // Strictly: a clear gap of 0.02 of the short side from every rock, the
  // kelp, every jelly and every other rare thing. Failing that anywhere,
  // the old, looser rules, before it is given up.
  const bad = (v: PlacedEvent, done: PlacedEvent[], strict: boolean): boolean => {
    const b = v.box;
    if (!b) return false;
    if (inter(b, grow(e.winBox, 4)) > 0) return true;
    if (v.kind !== 'whalefall' && b.y0 < h * 0.04) return true;
    // The squid's eye low on the page, and never under the window.
    if (v.kind === 'eye' && (v.y < h * EYE_BAND[0] || v.y > h * EYE_BAND[1] || Math.abs(v.x - (e.winBox.x0 + e.winBox.x1) / 2) < w * 0.25)) return true;
    if (v.kind !== 'whalefall' && v.kind !== 'oarfish' && e.floorTop != null && b.y1 > e.floorTop) return true;
    if (v.kind !== 'whalefall' && v.kind !== 'oarfish' && e.groundUnder && b.y1 > e.groundUnder(b) - CLEAR) return true;
    // Nothing of the middle water in the whale's shadow.
    if (v.kind !== 'whale' && v.kind !== 'whalefall' && !v.far) {
      for (const o of events) {
        if (o.kind !== 'whale') continue;
        const at = whaleHull(o, e.M, e.current);
        if (inter(b, grow(at.body, w * WHALE_CLEAR)) > 0 || inter(b, grow(at.flipper, w * WHALE_CLEAR)) > 0) return true;
      }
    }
    if (v.kind !== 'whalefall' && boxGap(b, hero.box) < CLEAR) return true;
    if (strict) {
      // The eye is padded by the dark it sits in.
      for (const k of e.rocks) if (rockTouches(k, w, b, v.kind === 'eye' ? 40 : CLEAR)) return true;
      for (const wl of e.walls) if (wallTouches(wl, w, b, v.kind === 'eye' ? 40 : CLEAR)) return true;
      for (const k of e.kelp) if (inter(b, grow(k, CLEAR)) > 0) return true;
      for (const j of e.jellies) if (!j.hero && boxGap(b, j.box) < CLEAR) return true;
      if (e.cloud && boxGap(b, e.cloud) < CLEAR) return true;
      for (const o of done) if (o.box && !o.far && o.kind !== 'whalefall' && boxGap(o.box, b) < CLEAR) return true;
      return false;
    }
    for (const o of done) if (o.box && !o.far && o.kind !== 'whalefall' && boxGap(o.box, b) < CLEAR) return true;
    // Even loosely, never on a rock or a wall, nor touching a jelly: a
    // hundredth of the short side at the least.
    for (const k of e.rocks) if (rockTouches(k, w, b, v.kind === 'eye' ? 40 : LOOSE)) return true;
    for (const wl of e.walls) if (wallTouches(wl, w, b, v.kind === 'eye' ? 40 : LOOSE)) return true;
    for (const j of e.jellies) if (!j.hero && v.kind !== 'eye' && boxGap(b, j.box) < LOOSE) return true;
    return false;
  };
  for (const v of events) if (v.kind === 'whale') settleWhale(v, e);
  /** One settling of `list` in place: how many had to be laid by the looser rules (and ten for each given up). */
  const attempt = (list: PlacedEvent[], how: 0 | 1 | 2): number => {
  let loose = 0;
  const done: PlacedEvent[] = [];
  // The ones with the least room to move go first (or the eye before all,
  // held as it is to the page's edge and kept off the rocks by its dark; or
  // the eye, then the rest, and the big ones last).
  const rank = (v: PlacedEvent) => (how > 0 && v.kind === 'eye' ? 3 : LONE.includes(v.kind) ? (how === 2 ? 0 : 2) : 1);
  const order = [...list].sort((a, b) => rank(b) - rank(a));
  for (const v of order) {
    if (v.kind === 'whalefall' || v.far || !v.box) {
      done.push(v);
      continue;
    }
    let fixed = false;
    // The big rare things and the eye are laid strictly or not at all: one
    // on a cliff, or two pressed together, is worse than one fewer.
    for (const strict of LONE.includes(v.kind) || v.kind === 'eye' ? [true] : [true, false]) {
      if (v.kind === 'turtle') {
        // Another jelly to look at, or the other side of it, then up or
        // down a little: it is drawn a fixed way off the jelly it watches.
        // Of the places it may be, the one that leaves the page its calm
        // (a turtle that would take the calm is not given up for it: it
        // looks at another jelly, or from the other side).
        const jels = e.jellies.filter((j) => !j.far).sort((a, b) => Math.abs(a.y - v.y) - Math.abs(b.y - v.y));
        const others = eventSolids([...done, ...list.filter((o) => o.kind === 'whale' && !done.includes(o))], e.M, e.current);
        let pick: { t: PlacedEvent; cost: number } | null = null;
        jels.forEach((jel, ji) => {
          for (const mirror of [v.mirror, !v.mirror]) {
            for (let k = 0; k <= 8; k++) {
              const t = turtleAt(v, jel, mirror, w, e.M);
              const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h * 0.012;
              shiftEvent(t, dy);
              if (bad(t, done, strict)) continue;
              const cost = ji * 0.3 + (mirror !== v.mirror ? 0.1 : 0) + Math.abs(dy) / h + CALM_PULL * Math.max(0, CALM + 0.03 - e.calmWith(t.box ? [...others, t.box] : others));
              if (!pick || cost < pick.cost) pick = { t, cost };
            }
          }
        });
        if (pick) {
          Object.assign(v, (pick as { t: PlacedEvent }).t);
          fixed = true;
        }
      } else {
        const canFlip = v.kind !== 'dumbo';
        // A siphonophore may also come further in off its edge, its tail
        // then ending in the water rather than off the page.
        const slides = v.kind === 'siphonophore' ? [0, 0.1, 0.2, 0.3] : [0];
        // Every place it may be, near its depth, either side: the one that
        // moves it least and leaves the most water calm (judged among the
        // nearest few dozen, the calm counted up to a third of the page).
        const fits: { flip: boolean; slide: number; dy: number; base: number; box: Box | null }[] = [];
        for (const flip of canFlip ? [false, true] : [false]) {
          if (flip) flipEvent(v, w);
          for (const slide of slides) {
            const dx = (v.x < w / 2 ? 1 : -1) * slide * w;
            if (dx) slideEvent(v, dx, w);
            for (let k = 0; k <= 170; k++) {
              const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h * 0.012;
              shiftEvent(v, dy);
              if (!bad(v, done, strict)) fits.push({ flip, slide, dy, base: Math.abs(dy) / h + (flip ? 0.04 : 0) + slide * 0.2, box: v.box ? { ...v.box } : null });
              shiftEvent(v, -dy);
            }
            if (dx) slideEvent(v, -dx, w);
          }
          if (flip) flipEvent(v, w);
        }
        fits.sort((p, q) => p.base - q.base);
        const others = eventSolids([...done, ...list.filter((o) => o.kind === 'whale' && !done.includes(o))], e.M, e.current);
        let pick: (typeof fits)[number] | null = null;
        let pickCost = Infinity;
        const stride = Math.max(1, Math.ceil((fits.length - 12) / 60));
        for (let i = 0; i < fits.length; i += i < 12 ? 1 : stride) {
          const f = fits[i];
          const cost = f.base + CALM_PULL * Math.max(0, CALM_ENOUGH - e.calmWith(f.box ? [...others, f.box] : others));
          if (cost < pickCost) {
            pickCost = cost;
            pick = f;
          }
        }
        if (pick) {
          if (pick.flip) flipEvent(v, w);
          const dx = (v.x < w / 2 ? 1 : -1) * pick.slide * w;
          if (dx) slideEvent(v, dx, w);
          shiftEvent(v, pick.dy);
          fixed = true;
        }
      }
      if (fixed) {
        if (!strict) loose++;
        break;
      }
    }
    if (!fixed) {
      // Nowhere it may be: better gone than over the hero or a rock.
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1);
      loose += 10 + EVENTS[v.kind].weight / 1e4;
      continue;
    }
    done.push(v);
  }
  return loose;
  };
  // As they come; and if anything had to be laid loosely, the eye first
  // instead, kept if that lays fewer loosely.
  const copy = () => events.map((v) => ({ ...v, box: v.box ? { ...v.box } : null, look: v.look ? { ...v.look } : undefined }));
  let best = copy();
  let worst = attempt(best, 0);
  for (const how of [1, 2] as const) {
    if (worst <= 0) break;
    const other = copy();
    const score = attempt(other, how);
    if (score < worst) {
      best = other;
      worst = score;
    }
  }
  events.length = 0;
  events.push(...best);
}

/**
 * The whale's shadow kept off the jellies in front of it (a jelly hung in a
 * shadow reads as caught in it), off the window, and with its back never
 * along the depth's steepest fall, where its long dark top would sharpen
 * the fall into a false horizon. It moves up or down from where its depth
 * put it, then across: the least it takes.
 */
function settleWhale(v: PlacedEvent, e: { w: number; h: number; M: number; jellies: PlacedJelly[]; winBox: Box; steepY: number | null; current: 1 | -1; calmWith: (extra: Box[]) => number }): void {
  const { w, h } = e;
  const S = Math.min(w, h);
  type Fit = { cost: number; dx: number; dy: number; k: number; box: Box };
  let best = null as Fit | null;
  const fits: Fit[] = [];
  // Its full size first; on a crowded page a little smaller (never under
  // seven tenths), rather than over a jelly.
  for (const k of [1, 0.9, 0.8, 0.7]) {
    const cx = v.rx + v.rw / 2;
    const sized: PlacedEvent = { ...v, rx: cx - (v.rw * k) / 2, rw: v.rw * k, rh: v.rh * k };
    const at0 = whaleHull(sized, S, e.current);
    const len = at0.len;
    const lo = len * 0.62 + w * 0.02;
    const hi = w - len * 0.62 - w * 0.02;
    const xs = [v.x, w - v.x, ...Array.from({ length: 11 }, (_, i) => lo + ((hi - lo) * i) / 10)].map((x) => clamp(x, Math.min(lo, hi), Math.max(lo, hi)));
    for (let xi = 0; xi < xs.length; xi++) {
      for (let s2 = 0; s2 <= 50; s2++) {
        const dy = (s2 % 2 ? 1 : -1) * Math.ceil(s2 / 2) * h * 0.01;
        const dx = xs[xi] - cx;
        const move = (b: Box) => ({ x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy });
        const box = move(at0.box);
        const parts = [move(at0.body), move(at0.flipper)];
        const dorsal = at0.dorsal + dy;
        if (box.y0 < h * 0.05 || at0.cy + dy > h * 0.55) continue;
        let cost = Math.abs(dy) / h + (xi === 0 ? 0 : xi === 1 ? 0.08 : 0.1 + Math.abs(dx) / w * 0.2) + (1 - k) * 1.5;
        if (inter(box, grow(e.winBox, 6)) > 0) cost += 10;
        if (e.steepY != null) {
          if (Math.abs(dorsal - e.steepY) < h * 0.045) cost += 3;
          // Better still, its body (back to belly) clear of the steepest
          // stretch: its dark laid on the fall steepens it.
          const belly = at0.cy + dy + 0.12 * len;
          if (belly > e.steepY - h * 0.05 && dorsal < e.steepY + h * 0.05) cost += 0.6;
        }
        for (const j of e.jellies) {
          if (j.far) continue;
          const o = parts.reduce((t, p) => t + inter(p, grow(j.box, CLEAR)), 0);
          if (o > 0) cost += 4 + o / area(j.box);
        }
        fits.push({ cost, dx, dy, k, box });
      }
    }
    // Of the few dozen that cost least, the one that leaves the most water calm.
    fits.sort((a, b) => a.cost - b.cost);
    const stride = Math.max(1, Math.ceil((fits.length - 12) / 80));
    for (let i = 0; i < fits.length; i += i < 12 ? 1 : stride) {
      const f = fits[i];
      if (f.cost >= 4) break;
      const cost = f.cost + CALM_PULL * Math.max(0, CALM_ENOUGH - e.calmWith([f.box]));
      if (!best || cost < best.cost) best = { ...f, cost };
    }
    if (best && best.cost < 4) break;
    fits.length = 0;
  }
  if (!best) return;
  const cx = v.rx + v.rw / 2;
  v.rw *= best.k;
  v.rh *= best.k;
  v.rx = cx - v.rw / 2 + best.dx;
  v.x = cx + best.dx;
  v.ry += best.dy;
  v.y += best.dy;
}

/* ---- The cast ---- */

interface CastEnv {
  /** The far shoal's cloud, if any: the cast keeps off it. */
  cloud: Box | null;
  w: number;
  h: number;
  M: number;
  rnd: Rand;
  seed: number;
  yOf: (f: number) => number;
  F: number;
  floorY: number | null;
  groundY: (x: number) => number;
  trench: Trench | null;
  jellies: PlacedJelly[];
  rocks: PlacedRock[];
  events: PlacedEvent[];
  path: number[];
  kelp: Plan['kelp'];
  kelpEdges: (-1 | 1)[];
  winBox: Box;
  tall: boolean;
  /** The calm water: nothing of the cast in it. */
  calm: Box;
  calmSide: -1 | 1;
}

interface Pick {
  met: Met;
  rare: boolean;
  score: number;
}

/** How tall a band across the page may hold no more than two animals of the middle and near cast. */
export const ROW_BAND = 0.06;
/** And how near in depth two of them may be: never level. */
export const ROW_LEVEL = 0.025;

/** Whether an animal at `y` makes a third in some band ROW_BAND of the page tall, with the others at `ys`. */
export function rowCrowded(y: number, ys: number[], h: number): boolean {
  // Nor two level with each other: a pair at one depth is the start of a row.
  if (ys.some((v) => Math.abs(v - y) < h * ROW_LEVEL)) return true;
  const near = ys.filter((v) => Math.abs(v - y) < h * ROW_BAND);
  if (near.length < 2) return false;
  near.push(y);
  near.sort((a, b) => a - b);
  for (let k = 0; k + 2 < near.length; k++) if (near[k + 2] - near[k] < h * ROW_BAND) return true;
  return false;
}

/** A species of the sitting's sea, by its id. */
function speciesById(s: Session, id: string): Species | null {
  for (const m of s.met) if (m.species.id === id) return m.species;
  return null;
}

/**
 * How many animals a sitting's picture holds, a school counted as one and
 * what lies on the floor with them: five for a quarter of an hour, a few
 * more for each hour after, never more than eleven.
 */
export function castWant(focus: number): number {
  return Math.round(clamp(5 + (1.55 * focus) / 3600, 5, CAST_MAX));
}
/** The most animals any picture holds. */
export const CAST_MAX = 11;

/** Who makes the picture: the rarest, the regulars, the deep ones, a spread of every zone. */
function curate(s: Session): Pick[] {
  const met = s.met;
  if (!met.length) return [];
  const zoneMax = Math.max(...met.map((m) => m.zone));
  let rarest = met[0];
  for (const m of met) {
    if (m.zone > rarest.zone || (m.zone === rarest.zone && m.species.abundance < rarest.species.abundance)) rarest = m;
  }
  const want = Math.min(met.length, castWant(s.focus));
  const scored = met.filter((m) => m === rarest || m.species.genome.plan !== 'bell').map((m) => {
    const rarity = clamp((1 / m.species.abundance - 2) / 11, 0, 1);
    const deep = (m.zone + 1) / (zoneMax + 1);
    const jitter = (hash32(s.key, 'curate', m.species.id) % 1000) / 1000;
    return { met: m, rare: m === rarest, score: 0.55 * rarity + 0.6 * deep + (m.species.regular ? 0.3 : 0) + 0.2 * jitter + (m === rarest ? 10 : 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked: Pick[] = [];
  const taken = new Set<Met>();
  // No more for the floor than it holds (floorFauna): the rest of the cast swims.
  const floorCap = s.floor ? (s.focus > 3 * 3600 ? 1 : 2) : Infinity;
  const floorFull = (p: Pick) => s.floor && p.met.species.floor && !p.rare && picked.filter((q) => q.met.species.floor).length >= floorCap;
  // Every zone the dive went through keeps one of its own.
  for (let z = 0; z <= zoneMax; z++) {
    const inZone = scored.filter((p) => p.met.zone === z);
    for (const p of inZone.filter((q) => !floorFull(q)).slice(0, 1)) {
      if (picked.length < want && !taken.has(p.met)) {
        picked.push(p);
        taken.add(p.met);
      }
    }
  }
  for (const p of scored) {
    if (picked.length >= want) break;
    if (!taken.has(p.met) && !floorFull(p)) {
      picked.push(p);
      taken.add(p.met);
    }
  }
  if (!taken.has(rarest)) picked[picked.length - 1] = scored[0];
  return picked;
}

interface Item {
  pick: Pick;
  sp: Species;
  layer: 0 | 1 | 2;
  len: number;
  bw: number;
  bh: number;
  x: number;
  y: number;
  ty: number;
  ya: number;
  yb: number;
  dir: 1 | -1;
  members: PlacedAnimal['members'];
  phase: number;
  floor: boolean;
  /** The gathering it belongs to, if any: where the loose group's middle is. */
  gx: number | null;
  gy: number | null;
}

function boxOf(it: { x: number; y: number; bw: number; bh: number }): Box {
  return { x0: it.x - it.bw / 2, x1: it.x + it.bw / 2, y0: it.y - it.bh / 2, y1: it.y + it.bh / 2 };
}

function distToPath(path: number[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0; i < path.length; i += 4) {
    const dx = path[i] - x;
    const dy = path[i + 1] - y;
    d = Math.min(d, dx * dx + dy * dy);
  }
  return Math.sqrt(d);
}

/**
 * How long each kind of animal is in the near plane, in units: the real
 * sizes kept relative to each other, so a squid is a fish or two long, an
 * eel longer, a school's fish small, and a comb jelly a thumbnail.
 */
const NEAR_LEN: Record<string, [number, number]> = {
  fish: [84, 118],
  eel: [128, 168],
  ray: [100, 136],
  squid: [92, 126],
  chain: [100, 140],
  bell: [56, 76],
  comb: [34, 40],
};
/** The farthest an animal of the cast (but the rarest) may be from the next, nose to tail: a group, never a lone speck (0.12 S). */
export const LONE_GAP = 0.12;
/** A school's fish against a lone one of its kind. */
const SCHOOL_K = 0.42;
/** The three planes, each its own scale and strength: far 0.35 and faint, the middle 0.6, the near whole. */
export const LAYER_SCALE = [0.35, 0.6, 1];
export const LAYER_ALPHA = [0.45, 0.75, 1];
/** No comb jelly bigger than this but the rarest (0.04 S). */
export const COMB_MAX = 0.04 * REF;

function solveCast(s: Session, e: CastEnv): { cast: PlacedAnimal[]; score: number } {
  // One anglerfish to a picture at most, the lure's own if it came: a
  // second reads as the sea having one kind of fish (the rarest is kept
  // whatever it is, and then the lure is not drawn).
  const lureOn = e.events.some((v) => v.kind === 'lure');
  let anglers = 0;
  const picks = curate(s).filter((p) => {
    if (!p.met.species.genome.lure || p.rare) return true;
    if (lureOn || anglers > 0) return false;
    anglers++;
    return true;
  });
  if (picks.some((p) => p.rare && p.met.species.genome.lure) && anglers > 0) {
    const i = picks.findIndex((p) => !p.rare && p.met.species.genome.lure);
    if (i >= 0) picks.splice(i, 1);
  }
  if (!picks.length) return { cast: [], score: 0 };
  const { w, h } = e;
  const mx = w * MARGIN;
  const my = h * MARGIN;
  const hero = e.jellies[e.jellies.length - 1];
  const fixed: { box: Box; weight: number }[] = [
    ...e.jellies.map((j) => ({ box: j.box, weight: j.hero ? 6 : 4 })),
    ...e.rocks.map((r) => ({ box: r.box, weight: r.plane === 0 ? 0.6 : 1.6 })),
    ...e.events.filter((v) => v.box).map((v) => ({ box: v.box as Box, weight: 2.5 })),
    // Nothing in front of the window of sky.
    { box: e.winBox, weight: 6 },
    ...(e.cloud ? [{ box: e.cloud, weight: 3 }] : []),
  ];
  if (e.kelp) {
    for (const edge of e.kelpEdges) {
      fixed.push({ box: edge < 0 ? { x0: 0, x1: w * 0.2, y0: 0, y1: e.kelp.bottom } : { x0: w * 0.8, x1: w, y0: 0, y1: e.kelp.bottom }, weight: 0.5 });
    }
  }
  const floorTop = e.trench ? e.trench.top : e.floorY;
  // The whale's shadow, and a twentieth of the page round it: no animal of
  // the middle or the near water hangs in it (they read as remoras).
  const whales = e.events.filter((v) => v.kind === 'whale').flatMap((v) => {
    const at = whaleHull(v, Math.min(w, h), s.biome.env.current);
    return [grow(at.body, w * WHALE_CLEAR), grow(at.flipper, w * WHALE_CLEAR)];
  });
  for (const b of whales) fixed.push({ box: b, weight: 3 });
  /** The highest the ground comes under a box, or the page's foot. */
  const groundUnder = (b: Box) => {
    let g = h;
    if (e.floorY != null) for (let k = 0; k <= 8; k++) g = Math.min(g, e.groundY(b.x0 + ((b.x1 - b.x0) * k) / 8));
    return g;
  };
  // The centres of the things that do not move, for keeping rows from forming.
  const fixedCentres = [
    ...e.jellies.map((j) => j.y),
    ...e.rocks.map((r) => r.y + r.height / 2),
    ...e.events.filter((v) => v.box && !v.far).map((v) => (v.box as Box).y0 / 2 + (v.box as Box).y1 / 2),
  ];

  const water = picks.filter((p) => !(p.met.species.floor && floorTop != null));
  const onFloor = picks.filter((p) => p.met.species.floor && floorTop != null);

  // Who is near, who is middling and who is far is the same in every
  // layout: the rarest and two more near, a school far off at most, the
  // rest in the middle.
  const layerOf = new Map<Pick, 0 | 1 | 2>();
  {
    const ranked = [...water].sort((a, b) => (b.rare ? 1 : 0) - (a.rare ? 1 : 0) || b.score - a.score);
    let near = 0;
    let far = 0;
    for (const p of ranked) {
      const sp = p.met.species;
      let layer: 0 | 1 | 2 = 1;
      if (p.rare) layer = 2;
      else if (near < 2 && !sp.school) {
        layer = 2;
        near++;
      } else if (far < 1 && sp.school && ranked.length > 4) {
        layer = 0;
        far++;
      }
      layerOf.set(p, layer);
    }
  }

  // The calm water is kept: nothing of the cast stands in it.
  const open: Box = e.calm;
  const calmPad = grow(open, Math.min(w, h) * 0.03);
  const inCalm = (b: Box) => inter(b, calmPad) > 0;
  // The jellies' side of the page, and the foot when no floor closes it.
  const footY = floorTop != null ? null : h * 0.84;

  const K = 28;
  let best: { items: Item[]; score: number } | null = null;
  for (let c = 0; c < K; c++) {
    const r = mulberry32(hash32(e.seed, 'layout', c));
    const items: Item[] = [];
    // Where the animals gather: one to three loose groups, never in the
    // calm water, each at the depth most of its own were met at.
    const nGroups = water.length <= 3 ? 1 : water.length <= 6 ? 2 : 2 + (r() < 0.5 ? 1 : 0);
    const depths = water.filter((p) => !p.rare).map((p) => e.yOf(p.met.mid)).sort((a, b) => a - b);
    const groups: { x: number; y: number }[] = [];
    for (let g = 0; g < nGroups; g++) {
      const chunk = depths.slice(Math.floor((g * depths.length) / nGroups), Math.max(Math.floor(((g + 1) * depths.length) / nGroups), Math.floor((g * depths.length) / nGroups) + 1));
      let gy = chunk.length ? chunk[Math.floor(chunk.length / 2)] : h * (0.3 + 0.4 * r());
      // The last group of a page with no floor gathers in its foot.
      if (footY != null && g === nGroups - 1 && nGroups > 1 && r() < 0.7) gy = footY - r() * h * 0.05;
      gy = clamp(gy + gauss(r) * h * 0.04, Math.max(h * MARGIN, e.winBox.y1) + h * 0.05, (floorTop ?? h * (1 - MARGIN)) - h * 0.06);
      let pick: { x: number; y: number; cost: number } | null = null;
      for (let t = 0; t < 40; t++) {
        const y = clamp(gy + (t ? gauss(r) * h * 0.06 : 0), Math.max(h * MARGIN, e.winBox.y1) + h * 0.05, (floorTop ?? h * (1 - MARGIN)) - h * 0.06);
        const x = w * (0.14 + 0.72 * r());
        const zone = { x0: x - w * 0.1, x1: x + w * 0.1, y0: y - h * 0.05, y1: y + h * 0.05 };
        let cost = Math.abs(y - gy) / h + (inCalm(zone) ? 2 + inter(zone, calmPad) / area(zone) : 0);
        for (const o of groups) if (Math.hypot(o.x - x, o.y - y) < Math.min(w, h) * 0.3) cost += 0.6;
        for (const j of e.jellies) if (j.hero && boxGap(zone, j.box) < CLEAR) cost += 0.4;
        // Rather out from the hero toward the open side than packed in by the wall.
        if (e.calmSide * (x - hero.x) < 0) cost += 0.5;
        const fromWall = e.calmSide > 0 ? x : w - x;
        if (fromWall < w * 0.22) cost += (0.8 * (w * 0.22 - fromWall)) / (w * 0.22);
        // The cast is not the wall's: a group at least past the page's middle.
        if (g === nGroups - 1 && nGroups > 1 && groups.every((o) => (e.calmSide > 0 ? o.x : w - o.x) < w * 0.5) && fromWall < w * 0.5) cost += 0.9;
        if (fromWall < w / 3) cost += 0.3;
        if (!pick || cost < pick.cost) pick = { x, y, cost };
      }
      if (pick) groups.push({ x: pick.x, y: pick.y });
    }
    for (const p of water) {
      const sp = p.met.species;
      // The jellies that are the blocks are the only jellies that read as
      // the path: another bell only if it is the rare one. (Small and far in
      // the haze, a bell is a soap bubble: a pale disc with a rim.)
      const bell = sp.genome.plan === 'bell';
      if (bell && !p.rare) continue;
      const layer = layerOf.get(p) ?? 0;
      const [a, b] = NEAR_LEN[sp.genome.plan] ?? NEAR_LEN.fish;
      const size = clamp(Math.sqrt(sp.genome.size), 0.85, 1.15);
      let len = (a + (b - a) * r()) * size * LAYER_SCALE[layer];
      if (sp.genome.plan === 'comb') len = Math.min(len, COMB_MAX);
      if (p.rare) len = Math.max(120, (140 + 26 * r()) * size * (bell ? 0.85 : 1));
      const prop = proportions(sp);
      let bw = len * prop.w;
      let bh = len * prop.h;
      let members: PlacedAnimal['members'] = null;
      if (sp.school) {
        const m = Math.min(sp.school, layer === 0 ? 7 : 9);
        members = [];
        const ml = len * SCHOOL_K;
        const rx = ml * (1.6 + m * 0.12);
        const ry = ml * (0.45 + m * 0.05);
        const rm = mulberry32(hash32(sp.id, 'school', m));
        for (let k = 0; k < m; k++) {
          // A loose shoal: spread round an ellipse, the ones at the back a little behind.
          const ang = (k / m) * Math.PI * 2 + rm() * 0.8;
          const rad = Math.sqrt((k + 0.5) / m);
          members.push({ dx: Math.cos(ang) * rx * rad, dy: Math.sin(ang) * ry * rad, len: ml * (0.85 + rm() * 0.3), phase: rm() * Math.PI * 2 });
        }
        bw = rx * 2 + ml * prop.w;
        bh = ry * 2 + ml * prop.h;
      }
      // Where it was met: anywhere between its first and last sighting.
      let ya = e.yOf(p.met.first);
      let yb = e.yOf(p.met.last);
      let ty = e.yOf(p.met.mid);
      if (p.met.zone >= depthAt(e.F).zone) {
        // The deepest water reached is the rest of the page: its animals
        // spread down it, each given its own depth in it.
        yb = Math.max(yb, floorTop != null ? floorTop - bh : h * 0.92);
        const k = (hash32(sp.id, 'spread') % 1000) / 1000;
        ty = ya + (yb - ya) * (0.15 + 0.85 * k);
      }
      ya -= h * 0.05;
      yb += h * 0.05;
      ya = clamp(ya, Math.max(my, e.winBox.y1) + bh / 2, h - my - bh / 2);
      yb = clamp(yb, ya, h - my - bh / 2);
      if (floorTop != null) {
        yb = Math.min(yb, floorTop - bh / 2 - h * 0.01);
        ya = Math.min(ya, yb);
      }
      if (p.rare && bell) {
        // A rare jelly glows where its glow means something: low, 0.7 to 0.95 of the page.
        const lo = h * RARE_BELL[0] + bh / 2;
        const hi = Math.min(h * RARE_BELL[1] - bh / 2, floorTop != null ? floorTop - bh / 2 - CLEAR : h * (1 - MARGIN) - bh / 2);
        ya = Math.min(lo, hi);
        yb = Math.max(ya, hi);
        ty = (ya + yb) / 2;
      }
      ty = clamp(ty, ya, yb);
      const dir: 1 | -1 = r() < 0.78 ? s.biome.env.current : s.biome.env.current === 1 ? -1 : 1;
      let gx: number | null = null;
      let gy: number | null = null;
      if (!p.rare) {
        // Every one in a group: the nearest in depth, its depth given a
        // little to it (a tenth of the page either way at most).
        let bestG: { x: number; y: number } | null = null;
        for (const g of groups) if (!bestG || Math.abs(g.y - ty) < Math.abs(bestG.y - ty)) bestG = g;
        if (bestG) {
          const lo = Math.max(Math.max(my, e.winBox.y1) + bh / 2, ya - h * 0.1);
          const hi = Math.min(floorTop != null ? floorTop - bh / 2 - h * 0.01 : h - my - bh / 2, yb + h * 0.1);
          if (bestG.y >= lo && bestG.y <= hi) {
            ya = Math.min(ya, bestG.y);
            yb = Math.max(yb, bestG.y);
          }
          gx = bestG.x;
          gy = clamp(bestG.y, ya, yb);
          ty = clamp(ty + (gy - ty) * 0.85, ya, yb);
        }
      }
      items.push({ pick: p, sp, layer, len, bw, bh, x: w / 2, y: ty, ty, ya, yb, dir, members, phase: r() * Math.PI * 2, floor: false, gx, gy });
    }

    // Within a group each has a place of its own, round its middle on a
    // loose spiral (each a golden turn on from the last, a little further
    // out), so a group is a clump: never a ladder down the page, never a row.
    for (const g of groups) {
      const mine = items.filter((it) => it.gx === g.x && it.gy != null).sort((a, b) => a.ty - b.ty);
      const turn = r() * TAU;
      mine.forEach((it, k) => {
        const ang = turn + k * 2.39996;
        const rad = Math.sqrt(k + 0.6);
        const want = g.y + Math.sin(ang) * rad * h * 0.05;
        const lo = Math.max(Math.max(my, e.winBox.y1) + it.bh / 2, it.ya - h * 0.06);
        const hi = Math.min(floorTop != null ? floorTop - it.bh / 2 - h * 0.01 : h - my - it.bh / 2, it.yb + h * 0.06);
        const y = clamp(want, lo, Math.max(lo, hi));
        it.ya = Math.min(it.ya, y);
        it.yb = Math.max(it.yb, y);
        it.ty = y;
        it.gy = y;
        it.gx = g.x + Math.cos(ang) * rad * w * 0.065;
      });
    }

    const ctx: SolveCtx = { fixed, e, open, fixedCentres, hero };
    // Greedy: the rarest first, then near to far, each where it fits best.
    const placed: Item[] = [];
    const orderIdx = items.map((_, i) => i).sort((i, j) => {
      const a = items[i];
      const b = items[j];
      if (a.pick.rare !== b.pick.rare) return a.pick.rare ? -1 : 1;
      if (a.layer !== b.layer) return b.layer - a.layer;
      return 0;
    });
    for (const i of orderIdx) {
      const it = items[i];
      let bestCost = Infinity;
      let bx = it.x;
      let by = it.y;
      for (let t = 0; t < 18; t++) {
        let x: number;
        if (it.pick.rare && hero) {
          // The best spot: near the path, beside a jelly, off the bell.
          const side = r() < 0.5 ? -1 : 1;
          const py = clamp(it.ty + gauss(r) * h * 0.05, it.ya, it.yb);
          x = clampX(distToPathX(e.path, py) + side * (w * (0.18 + r() * 0.14)), it, w);
          it.y = py;
        } else if (it.gx != null && r() < 0.95) {
          // In its group, loosely: the far ones spread wider.
          x = clampX(it.gx + gauss(r) * w * (it.layer === 0 ? 0.06 : 0.04), it, w);
          it.y = clamp(it.ty + gauss(r) * h * 0.015, it.ya, it.yb);
        } else {
          x = mx + it.bw / 2 + r() * Math.max(0, w - 2 * mx - it.bw);
          it.y = clamp(it.ty + gauss(r) * h * 0.035, it.ya, it.yb);
        }
        it.x = x;
        const cost = itemCost(it, placed, ctx, true);
        if (cost < bestCost) {
          bestCost = cost;
          bx = it.x;
          by = it.y;
        }
      }
      it.x = bx;
      it.y = by;
      placed.push(it);
    }
    relax(items, fixed, e);
    const score = layoutScore(items, ctx);
    if (!best || score < best.score) best = { items, score };
  }

  // The hard rules, after the solver's best: none in the hero's margin, none
  // over the window, none in a rock's face if near; moved if it can be, and
  // left out if it cannot (never the rarest, which is moved until it fits).
  const items = (best as { items: Item[]; score: number }).items;
  // The rare things that are animals in the water, for the rows.
  const rowEvents = e.events.filter((v) => v.box && !v.far && (v.kind === 'turtle' || v.kind === 'dumbo' || v.kind === 'lure')).map((v) => ((v.box as Box).y0 + (v.box as Box).y1) / 2);
  const legal = (it: Item, others: Item[]): boolean => {
    const b = boxOf(it);
    if (boxGap(b, hero.box) < CLEAR) return false;
    if (inter(b, grow(e.winBox, 4)) > 0) return false;
    if (b.x0 < w * MARGIN - 0.5 || b.x1 > w * (1 - MARGIN) + 0.5 || b.y0 < h * MARGIN - 0.5 || b.y1 > h * (1 - MARGIN) + 0.5) return false;
    if (floorTop != null && b.y1 > floorTop) return false;
    // Clear of the ground by 0.02 S, as of everything else.
    if (b.y1 > groundUnder(b) - CLEAR) return false;
    if (it.layer > 0 && whales.some((q) => inter(b, q) > 0)) return false;
    // A rare bell is never in line with the family.
    if (it.sp.genome.plan === 'bell') {
      // (Under one of them by a fifth of the page or more, it hangs apart from it anyway.)
      for (const j of e.jellies) if (!j.shoal && Math.abs(j.x - it.x) < w * BELL_APART && Math.abs(j.y - it.y) < h * 0.2) return false;
    }
    // Never in the calm water.
    if (inter(b, open) > 0) return false;
    // Clear of the jellies by 0.02 S (never in their trails); of a far
    // ghost, at least not over it.
    for (const j of e.jellies) if (!j.hero && (j.far ? (it.layer > 0 ? boxGap(b, j.box) <= 0 : overlapShare(b, j.box) > 0.3) : boxGap(b, j.box) < CLEAR)) return false;
    if (e.cloud && (it.layer > 0 ? boxGap(b, e.cloud) < CLEAR : overlapShare(b, e.cloud) > 0.3)) return false;
    for (const v of e.events) if (v.box && !v.far && overlapShare(b, v.box) > 0.3) return false;
    if (it.layer > 0) for (const k of e.rocks) if (k.plane > 0 && rockTouches(k, w, b, 2)) return false;
    for (const o of others) {
      if (o === it) continue;
      const tol = o.layer === it.layer ? 0.25 : 0.5;
      if (overlapShare(b, boxOf(o)) > tol) return false;
      // Two animals never touch: 0.02 S between them, nose to tail, unless
      // both are far off in the haze.
      if ((it.layer > 0 || o.layer > 0) && boxGap(b, boxOf(o)) < CLEAR) return false;
    }
    // Nor three stacked in a column, a ladder down the page.
    if (it.layer > 0 && others.filter((o) => o !== it && o.layer > 0 && Math.abs(o.x - it.x) < w * 0.07 && Math.abs(o.y - it.y) < h * 0.2).length >= 2) return false;
    // Never three of the middle and near cast on one line across the page.
    if (it.layer > 0 && rowCrowded(it.y, [...others.filter((o) => o !== it && o.layer > 0).map((o) => o.y), ...rowEvents], h)) return false;
    // Nor does one touch a rare thing in the water.
    for (const v of e.events) if (v.box && !v.far && v.kind !== 'whalefall' && boxGap(b, v.box) < 6) return false;
    return true;
  };
  const kept: Item[] = [];
  const fr = mulberry32(hash32(e.seed, 'legal'));
  const ordered = [...items].sort((a, b) => Number(b.pick.rare) - Number(a.pick.rare) || b.layer - a.layer);
  for (const it of ordered) {
    if (legal(it, kept)) {
      kept.push(it);
      continue;
    }
    let ok = false;
    const x0 = it.x;
    const y0 = it.y;
    for (let t = 0; t < (it.pick.rare ? 400 : 120) && !ok; t++) {
      const spread = 1 + t / 20;
      it.x = clampX(x0 + gauss(fr) * w * 0.08 * spread, it, w);
      const loose = it.pick.rare && it.sp.genome.plan !== 'bell';
      // (Past eighty tries, a little further from the depth it was met at, as the calm water needs.)
      const give = !it.pick.rare && t >= 80 ? h * 0.15 : 0;
      const lo = Math.max(Math.max(h * MARGIN, e.winBox.y1) + it.bh / 2, it.ya - give);
      const hi = Math.min((floorTop ?? h * (1 - MARGIN)) - it.bh / 2, it.yb + give);
      it.y = clamp(y0 + gauss(fr) * h * 0.04 * spread * (give ? 3 : 1), loose ? Math.max(h * MARGIN, e.winBox.y1) + it.bh / 2 : lo, loose ? (floorTop ?? h * (1 - MARGIN)) - it.bh / 2 : hi);
      ok = legal(it, kept);
    }
    if (!ok && it.pick.rare) {
      // The rarest is never left out: anywhere on the page it may be, the
      // nearest its depth.
      let best: { x: number; y: number; d: number } | null = null;
      for (let a = 0; a <= 40; a++) {
        for (let b = 0; b <= 60; b++) {
          it.x = clampX(w * (a / 40), it, w);
          // (A rare jelly as low as it can be, if not where it should.)
          const bellLow = it.sp.genome.plan === 'bell';
          it.y = clamp(h * (b / 60), bellLow ? Math.max(Math.max(h * MARGIN, e.winBox.y1) + it.bh / 2, it.ya - h * 0.3) : Math.max(h * MARGIN, e.winBox.y1) + it.bh / 2, bellLow ? it.yb : (floorTop ?? h * (1 - MARGIN)) - it.bh / 2);
          const d = (bellLow ? (3 * Math.max(0, it.ya - it.y)) / h : Math.abs(it.y - it.ty) / h) + (Math.abs(it.x - x0) / w) * 0.3;
          if ((!best || d < best.d) && legal(it, kept)) best = { x: it.x, y: it.y, d };
        }
      }
      if (best) {
        it.x = best.x;
        it.y = best.y;
        ok = true;
      }
    }
    if (ok) kept.push(it);
  }

  // No lone specks: each but the rarest within LONE_GAP of another of the
  // cast, moved in beside the nearest if it is not, and left out if it
  // cannot be.
  const S = Math.min(w, h);
  const gapTo = (it: Item, among: Item[]) => among.reduce((d, o) => (o === it ? d : Math.min(d, boxGap(boxOf(it), boxOf(o)))), Infinity);
  const unalone = () => {
    for (let round = 0; round < 3; round++) {
      let changed = false;
      for (const it of [...kept]) {
        if (it.pick.rare || kept.length < 2) continue;
        if (gapTo(it, kept) <= LONE_GAP * S) continue;
        const others = kept.filter((o) => o !== it);
        const near = [...others].sort((a, b) => boxGap(boxOf(a), boxOf(it)) - boxGap(boxOf(b), boxOf(it)));
        const x0 = it.x;
        const y0 = it.y;
        let ok = false;
        for (const o of near.slice(0, 3)) {
          for (let t = 0; t < 60 && !ok; t++) {
            const ang = fr() * TAU;
            const d = (0.5 * (o.bw + it.bw) + S * (0.03 + 0.06 * fr())) * (0.7 + 0.3 * Math.abs(Math.cos(ang)));
            it.x = clampX(o.x + Math.cos(ang) * d, it, w);
            it.y = clamp(o.y + Math.sin(ang) * d * 0.6, Math.max(h * MARGIN, e.winBox.y1) + it.bh / 2, (floorTop ?? h * (1 - MARGIN)) - it.bh / 2);
            ok = legal(it, others) && gapTo(it, others) <= LONE_GAP * S;
          }
          if (ok) break;
        }
        if (!ok) {
          it.x = x0;
          it.y = y0;
          kept.splice(kept.indexOf(it), 1);
        }
        changed = true;
      }
      if (!changed) break;
    }
  };
  unalone();

  // Not the wall's: three in five of the cast at most in the wall's third of
  // the page, and one at least over its middle. One by the wall is moved out
  // across the page (beside another, legally) if it can be, and left out if
  // it cannot; the rarest stays where it is.
  {
    const share = (x: number) => (e.calmSide > 0 ? x / w : 1 - x / w);
    const byWall = () => kept.filter((it) => share(it.x) < 1 / 3).length / Math.max(1, kept.length);
    const crosses = () => kept.some((it) => Math.max(share(it.x - it.bw / 2), share(it.x + it.bw / 2)) > 0.5);
    const moveOut = (it: Item, past: number, alone = false, near: Item | null = null): boolean => {
      const others = kept.filter((o) => o !== it);
      const x0 = it.x;
      const y0 = it.y;
      let best: { x: number; y: number; d: number } | null = null;
      for (let a = 0; a <= 32; a++) {
        for (let b = 0; b <= 40; b++) {
          it.x = clampX(w * (a / 32), it, w);
          // (Near the depth it was met at, as near as the page lets it.)
          it.y = clamp(h * (b / 40), it.ya - h * 0.25, it.yb + h * 0.25);
          if (share(it.x) < past) continue;
          const d = Math.abs(it.y - it.ty) / h + Math.abs(it.x - x0) / w * 0.2;
          if (best && d >= best.d) continue;
          if (near && boxGap(boxOf(it), boxOf(near)) > LONE_GAP * S) continue;
          if (legal(it, others) && (alone || others.length < 1 || gapTo(it, others) <= LONE_GAP * S)) best = { x: it.x, y: it.y, d };
        }
      }
      it.x = best ? best.x : x0;
      it.y = best ? best.y : y0;
      return !!best;
    };
    const least = Math.max(3, Math.ceil(kept.length * 0.6));
    for (let guard = 0; guard < 12 && kept.length >= 2 && byWall() > CAST_BY_WALL + 1e-9; guard++) {
      const by = kept.filter((it) => share(it.x) < 1 / 3 && !it.pick.rare).sort((a, b) => a.layer - b.layer);
      if (!by.length) break;
      if (by.some((it) => moveOut(it, 1 / 3))) continue;
      if (kept.length <= least) break;
      kept.splice(kept.indexOf(by[0]), 1);
    }
    if (kept.length >= 2 && !crosses()) {
      const free = kept.filter((q) => !q.pick.rare).sort((a, b) => share(b.x) - share(a.x));
      let done = free.some((it) => moveOut(it, 0.5 + it.bw / 2 / w));
      // Or two together, out across the page, the second beside the first.
      for (let i = 0; i < free.length && !done; i++) {
        const a = free[i];
        const was = { x: a.x, y: a.y };
        if (!moveOut(a, 0.5 + a.bw / 2 / w, true)) continue;
        for (let k = 0; k < free.length && !done; k++) if (k !== i) done = moveOut(free[k], 0.4, false, a);
        if (!done) {
          a.x = was.x;
          a.y = was.y;
        }
      }
    }
  }

  // (And none left alone by the moves.)
  unalone();

  const out = kept.map<PlacedAnimal>((it) => ({
    zone: it.pick.met.zone,
    slot: it.pick.met.slot,
    id: it.sp.id,
    layer: it.layer,
    x: it.x,
    y: it.y,
    len: it.members ? it.members[0].len : it.len,
    dir: it.dir,
    alpha: LAYER_ALPHA[it.layer],
    rare: it.pick.rare,
    floor: false,
    members: it.members,
    phase: it.phase,
    box: boxOf(it),
  }));
  out.push(...floorFauna(onFloor, e, hero, out.map((a) => a.box)));
  // Far first, near last: the order they are painted in.
  out.sort((a, b) => a.layer - b.layer || a.y - b.y);
  return { cast: out, score: (best as { score: number }).score };
}

/**
 * What lives on the floor: at most four (two in a trench), scattered as a
 * Poisson disc at least 0.08 of the width apart, each at its own depth on the
 * floor, none big: no more than 0.06 S, nor more than 0.6 of the hero's bell.
 */
function floorFauna(picks: Pick[], e: CastEnv, hero: PlacedJelly, cast: Box[]): PlacedAnimal[] {
  if (!picks.length || e.floorY == null) return [];
  const { w, h } = e;
  const most = e.trench ? 1 : 2;
  const r = mulberry32(hash32(e.seed, 'floor-fauna'));
  const out: PlacedAnimal[] = [];
  const gap = w * 0.08;
  const capLen = Math.min(0.06 * REF, 0.6 * hero.r * 2);
  const avoid: Box[] = [...e.events.filter((v) => v.kind === 'whalefall' && v.box).map((v) => grow(v.box as Box, w * 0.02)), ...e.rocks.filter((k) => k.plane > 0).map((k) => grow(k.box, w * 0.02))];
  for (const p of [...picks].sort((a, b) => Number(b.rare) - Number(a.rare)).slice(0, most)) {
    const sp = p.met.species;
    const prop = proportions(sp);
    const len = p.rare ? capLen : Math.min(capLen, 50 * (0.6 + 0.6 * r()));
    const bw = len * prop.w;
    const bh = len * prop.h;
    for (let t = 0; t < 40; t++) {
      const x = w * MARGIN + bw / 2 + r() * (w * (1 - 2 * MARGIN) - bw);
      if (out.some((o) => Math.abs(o.x - x) < gap)) continue;
      const g = e.groundY(x);
      if (g > h * 0.98) continue;
      if (e.trench && (Math.abs(x - e.trench.x) < e.trench.gap / 2 + bw || g > e.trench.top + (h - e.trench.top) * 0.45)) continue;
      let y = clamp(g + (r() - 0.35) * h * 0.04 - bh * 0.35, 0, h * (1 - MARGIN) - bh / 2);
      // On the ground, never off it: a star lies wholly on it (below its
      // line all across), what crawls has its middle below the line all
      // across, so neither hangs half off a slope into the water.
      let low = g;
      for (let q = 0; q <= 6; q++) low = Math.max(low, e.groundY(x - bw / 2 + (bw * q) / 6));
      y = Math.max(y, sp.genome.plan === 'star' ? low + bh / 2 + 1 : low);
      if (y > h * (1 - MARGIN) - bh / 2 || low > h * 0.98) continue;
      const box = { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 };
      if (avoid.some((b) => inter(b, box) > 0) || cast.some((b) => boxGap(b, box) < CLEAR)) continue;
      if (boxGap(box, hero.box) < CLEAR) continue;
      out.push({
        zone: p.met.zone,
        slot: p.met.slot,
        id: sp.id,
        layer: p.rare ? 2 : 1,
        x,
        y,
        len: p.rare ? capLen : len,
        dir: r() < 0.5 ? 1 : -1,
        alpha: 1,
        rare: p.rare,
        floor: true,
        members: null,
        phase: r() * TAU,
        box,
      });
      break;
    }
  }
  return out;
}

function distToPathX(path: number[], y: number): number {
  let best = path[0];
  let d = Infinity;
  for (let i = 0; i < path.length; i += 2) {
    const dd = Math.abs(path[i + 1] - y);
    if (dd < d) {
      d = dd;
      best = path[i];
    }
  }
  return best;
}

function clampX(x: number, it: { bw: number }, w: number): number {
  return clamp(x, w * MARGIN + it.bw / 2, w * (1 - MARGIN) - it.bw / 2);
}

const LAYER_MIX = [
  [1, 0.6, 0.35],
  [0.6, 1, 0.6],
  [0.35, 0.6, 1],
];

interface SolveCtx {
  fixed: { box: Box; weight: number }[];
  e: CastEnv;
  open: Box;
  fixedCentres: number[];
  hero: PlacedJelly;
}

function itemCost(it: Item, others: Item[], c: SolveCtx, placing: boolean): number {
  const { fixed, e } = c;
  const b = boxOf(it);
  const a = Math.max(1, area(b));
  let cost = 0;
  let band = 0;
  for (const o of others) {
    if (o === it) continue;
    const i = inter(b, boxOf(o));
    if (i) cost += (i / Math.min(a, Math.max(1, o.bw * o.bh))) * 3 * LAYER_MIX[it.layer][o.layer];
    // A little room round each, so they read as separate animals.
    const gx = Math.max(0, Math.abs(it.x - o.x) - (it.bw + o.bw) / 2);
    const gy = Math.max(0, Math.abs(it.y - o.y) - (it.bh + o.bh) / 2);
    const gap = Math.hypot(gx, gy);
    const want = 0.35 * Math.min(it.len, o.len) + 4;
    if (gap < want) cost += ((want - gap) / want) * 0.6;
    if (Math.abs(o.y - it.y) < e.h * 0.015) band++;
    // Nor stacked in a column, one over the next a few hundredths across.
    if (Math.abs(o.x - it.x) < e.w * 0.04 && Math.abs(o.y - it.y) < e.h * 0.22) cost += 0.35;
  }
  for (const j of e.jellies) if (Math.abs(j.x - it.x) < e.w * 0.04 && Math.abs(j.y - it.y) < e.h * 0.22) cost += 0.25;
  for (const y of c.fixedCentres) if (Math.abs(y - it.y) < e.h * 0.015) band++;
  // Three in a row across the page is a chart, not a sea.
  if (band >= 2) cost += 0.5 * (band - 1);
  for (const f of fixed) {
    const i = inter(b, f.box);
    if (i) cost += (i / a) * f.weight * 3;
  }
  if (boxGap(b, c.hero.box) < CLEAR * 2) cost += 2;
  // The calm water stays calm.
  const io = inter(b, c.open);
  if (io) cost += 2 + (io / a) * 8;
  cost += (Math.abs(it.y - it.ty) / e.h) * 1.5;
  if (it.gx != null && it.gy != null) cost += (Math.hypot(it.x - it.gx, (it.y - it.gy) * 1.5) / e.w) * 2.5;
  if (it.layer > 0 && !it.pick.rare) {
    // Keep the way down clear: the jellies and their bubbles read as the path.
    const d = distToPath(e.path, it.x, it.y);
    const want = it.bw / 2 + e.w * 0.04;
    if (d < want) cost += ((want - d) / want) * 0.6;
  }
  if (it.pick.rare) {
    const d = distToPath(e.path, it.x, it.y);
    cost += Math.abs(d - e.w * (it.sp.genome.plan === 'bell' ? 0.3 : 0.22)) / e.w;
  }
  if (placing) {
    // Spread across the page: a gentle pull away from the crowded side.
    let lean = 0;
    for (const o of others) if (o !== it) lean += Math.sign(o.x - e.w / 2) * o.bw * o.bh;
    cost += ((Math.sign(it.x - e.w / 2) * lean) / (e.w * e.h)) * 2;
  }
  return cost;
}

function relax(items: Item[], fixed: { box: Box; weight: number }[], e: CastEnv): void {
  const { w } = e;
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (const it of items) {
      const b = boxOf(it);
      let px = 0;
      let py = 0;
      const push = (o: Box, k: number) => {
        const ix = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0);
        const iy = Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0);
        if (ix <= 0 || iy <= 0) return;
        const ocx = (o.x0 + o.x1) / 2;
        const ocy = (o.y0 + o.y1) / 2;
        // Out along whichever way is shorter, and prefer sideways: depth is meaning.
        if (ix < iy * 1.6) px += (it.x < ocx ? -ix : ix) * 0.5 * k;
        else py += (it.y < ocy ? -iy : iy) * 0.5 * k;
      };
      for (const o of items) if (o !== it) push(boxOf(o), LAYER_MIX[it.layer][o.layer] > 0.5 ? 1 : 0.6);
      for (const f of fixed) if (f.weight >= 1) push(f.box, 1);
      if (px || py) {
        moved = true;
        it.x = clampX(it.x + px, it, w);
        it.y = clamp(it.y + py, it.ya, it.yb);
      }
    }
    if (!moved) break;
  }
}

function layoutScore(items: Item[], c: SolveCtx): number {
  const { e, fixed } = c;
  let score = 0;
  for (const it of items) score += itemCost(it, items, c, false);
  // Balance: the weight of everything on the page, left against right.
  let mass = 0;
  let mx = 0;
  for (const it of items) {
    const m = it.bw * it.bh * (0.4 + 0.3 * it.layer);
    mass += m;
    mx += m * it.x;
  }
  for (const j of e.jellies) {
    const m = area(j.box);
    mass += m;
    mx += m * j.x;
  }
  if (mass > 0) score += (Math.abs(mx / mass - e.w / 2) / e.w) * 6;
  // Not all by the wall: three in five of the cast at most in its third of
  // the page, and one at least over the page's middle.
  const share = (x: number) => (e.calmSide > 0 ? x / e.w : 1 - x / e.w);
  if (items.length >= 2) {
    const byWall = items.filter((it) => share(it.x) < 1 / 3).length / items.length;
    if (byWall > CAST_BY_WALL - 0.1) score += 30 * (byWall - CAST_BY_WALL + 0.1);
    if (!items.some((it) => share(it.x) + it.bw / 2 / e.w > 0.5)) score += 3;
  }
  // Open water: a coarse grid, and how much of it anything stands in.
  const G = 16;
  const cells = new Uint8Array(G * G);
  const all = [...items.map(boxOf), ...fixed.filter((f) => f.weight > 0.6).map((f) => f.box)];
  for (const b of all) {
    for (let gy = Math.max(0, Math.floor((b.y0 / e.h) * G)); gy <= Math.min(G - 1, Math.floor((b.y1 / e.h) * G)); gy++) {
      for (let gx = Math.max(0, Math.floor((b.x0 / e.w) * G)); gx <= Math.min(G - 1, Math.floor((b.x1 / e.w) * G)); gx++) cells[gy * G + gx] = 1;
    }
  }
  let filled = 0;
  for (const cell of cells) filled += cell;
  const open = 1 - filled / (G * G);
  if (open < 0.4) score += (0.4 - open) * 20;
  // The middle and near cast at three depths or more, a tenth of the page apart.
  const ys = items.filter((it) => it.layer > 0).map((it) => it.y).sort((a, b) => a - b);
  if (ys.length >= 3) {
    let bands = 0;
    let last = -Infinity;
    for (const y of ys) if (y >= last + e.h * 0.1) {
      bands++;
      last = y;
    }
    score += Math.max(0, 3 - bands) * 3;
  }
  return score;
}

/* ---- The calm water ---- */

/** The least share of the page left as one calm stretch of water: nothing in it but water, light and bubbles. */
export const CALM = 0.25;
/** The grid the calm is judged on, a cell this many units (0.025 S) square. */
const CALM_CELL = 0.025 * REF;

/** What stands in the water, for judging where it is calm. */
export interface Solids {
  w: number;
  h: number;
  boxes: Box[];
  rocks: PlacedRock[];
  walls: Wall[];
  /** The ground's line at x, or null with no floor. */
  ground: ((x: number) => number) | null;
}

/** The page as a grid of cells, 1 where anything stands. */
function occupancy(s: Solids, cell = CALM_CELL): { cells: Uint8Array; gx: number; gy: number; cw: number; ch: number } {
  const gx = Math.max(4, Math.round(s.w / cell));
  const gy = Math.max(4, Math.round(s.h / cell));
  const cw = s.w / gx;
  const ch = s.h / gy;
  const cells = new Uint8Array(gx * gy);
  const mark = (b: Box) => {
    const i0 = Math.max(0, Math.floor(b.x0 / cw));
    const i1 = Math.min(gx - 1, Math.floor((b.x1 - 1e-6) / cw));
    const j0 = Math.max(0, Math.floor(b.y0 / ch));
    const j1 = Math.min(gy - 1, Math.floor((b.y1 - 1e-6) / ch));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * gx + i] = 1;
  };
  for (const b of s.boxes) mark(b);
  for (const k of s.rocks) {
    // The rock, and what grows along its top.
    for (let i = 0; i < gx; i++) {
      for (const x of [i * cw + 1, (i + 0.5) * cw, (i + 1) * cw - 1]) {
        const sp = rockSpan(k, s.w, x);
        if (sp) mark({ x0: i * cw + 1, x1: (i + 1) * cw - 1, y0: sp[0] - (k.plane > 0 ? 0.03 * s.h : 0), y1: sp[1] });
      }
    }
  }
  for (const wl of s.walls) {
    for (let j = 0; j < gy; j++) {
      let f = 0;
      for (const y of [j * ch, (j + 0.5) * ch, (j + 1) * ch]) f = Math.max(f, wallAt(wl, y) ?? 0);
      if (f > 0) mark(wl.edge < 0 ? { x0: 0, x1: f, y0: j * ch + 1, y1: (j + 1) * ch - 1 } : { x0: s.w - f, x1: s.w, y0: j * ch + 1, y1: (j + 1) * ch - 1 });
    }
  }
  if (s.ground) {
    for (let i = 0; i < gx; i++) {
      let g = Infinity;
      for (const x of [i * cw, (i + 0.5) * cw, (i + 1) * cw]) g = Math.min(g, s.ground(x));
      if (g < s.h) mark({ x0: i * cw + 1, x1: (i + 1) * cw - 1, y0: g - 0.01 * s.h, y1: s.h });
    }
  }
  return { cells, gx, gy, cw, ch };
}

/** The largest rectangle of empty cells, as a box in units. */
function largestEmpty(o: { cells: Uint8Array; gx: number; gy: number; cw: number; ch: number }): Box {
  const { cells, gx, gy, cw, ch } = o;
  const heights = new Array<number>(gx).fill(0);
  let best = 0;
  let box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) heights[i] = cells[j * gx + i] ? 0 : heights[i] + 1;
    for (let i = 0; i < gx; i++) {
      let minH = Infinity;
      for (let k = i; k < gx && heights[k] > 0; k++) {
        minH = Math.min(minH, heights[k]);
        const a = minH * (k - i + 1);
        if (a > best) {
          best = a;
          box = { x0: i * cw, x1: (k + 1) * cw, y0: (j + 1 - minH) * ch, y1: (j + 1) * ch };
        }
      }
    }
  }
  return box;
}

/** The calm water left among `s`: the largest clear rectangle, and its share of the page. */
export function calmOf(s: Solids): { box: Box; share: number } {
  const box = largestEmpty(occupancy(s));
  return { box, share: area(box) / (s.w * s.h) };
}

/** What the rare things take of the water (the storm is light in it, and leaves it calm). */
function eventSolids(events: PlacedEvent[], S: number, current: 1 | -1): Box[] {
  const boxes: Box[] = [];
  for (const e of events) {
    if (e.kind === 'storm') continue;
    if (e.kind === 'whale') boxes.push(whaleHull(e, S, current).box);
    else if (e.kind === 'leviathan') boxes.push({ x0: e.rx, x1: e.rx + e.rw, y0: e.ry + e.rh * 0.3, y1: e.ry + e.rh });
    else if (e.box) boxes.push(e.box);
  }
  return boxes;
}

/**
 * The calm the page keeps: of the clear stretches big enough (CALM_KEEP of
 * the page), the one where its composition puts the calm (a column down the
 * open side, or the water over the hero), cut to that size from the side
 * the rest of the page is on, so the cast has the rest. The largest, cut,
 * if none is big enough.
 */
function chooseCalm(sol: Solids, comp: Composition, hero: PlacedJelly): Box {
  const { w, h } = sol;
  const want = CALM_KEEP * w * h;
  const o = occupancy(sol);
  const { cells, gx, gy, cw, ch } = o;
  const share = (x: number) => (comp.wallSide < 0 ? x / w : 1 - x / w);
  const fit = (b: Box) =>
    comp.calmAbove
      ? Math.max(0, (b.y1 - hero.box.y0) / h) * 3 + Math.max(0, 0.6 - (b.x1 - b.x0) / w)
      : Math.max(0, 0.7 - share((b.x0 + b.x1) / 2)) * 3 + Math.max(0, 0.55 - (b.y1 - b.y0) / h);
  const heights = new Array<number>(gx).fill(0);
  let best: { box: Box; cost: number } | null = null;
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) heights[i] = cells[j * gx + i] ? 0 : heights[i] + 1;
    for (let i = 0; i < gx; i++) {
      let minH = Infinity;
      for (let k = i; k < gx && heights[k] > 0; k++) {
        minH = Math.min(minH, heights[k]);
        const a = minH * (k - i + 1) * cw * ch;
        if (a < want) continue;
        const box = { x0: i * cw, x1: (k + 1) * cw, y0: (j + 1 - minH) * ch, y1: (j + 1) * ch };
        const cost = fit(box) - (a / (w * h)) * 0.2;
        if (!best || cost < best.cost) best = { box, cost };
      }
    }
  }
  if (!best) return keepCalm(largestEmpty(o), w, h);
  const out = { ...best.box };
  if (area(out) <= want) return out;
  if (comp.calmAbove) {
    // Over the hero: its foot taken off first (never under 0.3 of the page tall), then the wall's side.
    const tall = Math.max(h * 0.3, want / Math.max(1, out.x1 - out.x0));
    if (tall < out.y1 - out.y0) out.y1 = out.y0 + tall;
    if (area(out) > want) {
      const wide = want / Math.max(1, out.y1 - out.y0);
      if (comp.wallSide < 0) out.x0 = out.x1 - wide;
      else out.x1 = out.x0 + wide;
    }
  } else {
    // Down the open side: from the side toward the middle first (never under a quarter of the width), then its foot.
    const wide = Math.max(w * 0.25, want / Math.max(1, out.y1 - out.y0));
    if (wide < out.x1 - out.x0) {
      if (comp.wallSide < 0) out.x0 = out.x1 - wide;
      else out.x1 = out.x0 + wide;
    }
    if (area(out) > want) out.y1 = out.y0 + want / Math.max(1, out.x1 - out.x0);
  }
  return out;
}

/** The calm a page keeps, as a share of it: about this much of the largest clear stretch, the rest left to the cast. */
const CALM_KEEP = 0.28;

/** The clear stretch cut to CALM_KEEP of the page: its foot taken off first (never under 0.4 of the page tall), then its far side. */
function keepCalm(b: Box, w: number, h: number): Box {
  const want = CALM_KEEP * w * h;
  const out = { ...b };
  if (area(out) <= want) return out;
  const bw = out.x1 - out.x0;
  const tall = Math.max(h * 0.4, want / Math.max(1, bw));
  if (tall < out.y1 - out.y0) out.y1 = out.y0 + tall;
  if (area(out) > want) {
    const wide = want / Math.max(1, out.y1 - out.y0);
    // (From the side nearer the page's middle, so it keeps to its edge.)
    if (out.x0 + out.x1 > w) out.x0 = out.x1 - wide;
    else out.x1 = out.x0 + wide;
  }
  return out;
}

/** Everything a plan stands in its water: the jellies, the cast, the rare things, the rocks and walls, the kelp, the window and the ground. */
export function solidsOf(plan: Plan): Solids {
  const S = Math.min(plan.w, plan.h);
  // (The far shoal hangs in the haze beyond the calm, as the light does: it is not counted.)
  const boxes: Box[] = [plan.windowBox, ...plan.jellies.filter((j) => !j.shoal).map((j) => j.box), ...plan.cast.map((a) => a.box), ...plan.kelpZones, ...eventSolids(plan.events, S, plan.current), ...(plan.life ?? []).map((l) => l.box)];
  return { w: plan.w, h: plan.h, boxes, rocks: plan.rocks, walls: plan.walls, ground: plan.floor ? (x) => floorAt(plan, x) : null };
}

/** The calm water a plan leaves: one clear rectangle, and its share of the page. */
export function calmArea(plan: Plan): { box: Box; share: number } {
  return calmOf(solidsOf(plan));
}

/* ---- What grows on the stone and the floor ---- */

/** What grows: the reef's growths and the deep's (`drawGrowth`: sea pens, crinoids, brittle stars, glass sponges, whips). */
export type LifeKind = GrowthKind;

export interface PlacedLife {
  kind: LifeKind;
  /** Where it stands (its foot), in units, and how tall it is (a star: how wide). */
  x: number;
  y: number;
  size: number;
  hue: number;
  seed: number;
  zone: number;
  /** How far it leans from upright (radians, clockwise): out from a wall's face. */
  lean: number;
  /** What it grows on: a rock (by `rockKey`), the wall, or the floor. */
  on: 'rock' | 'wall' | 'floor';
  host: string;
  box: Box;
}

/** A rock's name in a plan, for what grows on it. */
export function rockKey(k: { kind: PlacedRock['kind']; rest: number; slot: number; edge: -1 | 1 }): string {
  return `${k.kind}|${k.rest}|${k.slot}|${k.edge}`;
}

/**
 * How far apart the things growing on the stone and the floor stand, a
 * share of the short side: a long sitting's sea has been watched for hours
 * and holds more. One every 0.15 S for an hour or less, one every 0.04 S by
 * four and a half hours (twice as thick as at two).
 */
export function lifeSpacing(focus: number): number {
  const min = Math.max(60, focus / 60);
  return Math.max(0.04, 0.15 * Math.pow(60 / min, 0.88));
}

/** What grows at each depth: the live sea's kits, the deep's glass sponges, sea pens and whips. */
const LIFE_KITS: (readonly GrowthKind[])[] = [
  ['branch', 'fan', 'tube', 'brain', 'anemone', 'fan', 'tube'],
  ['plate', 'fan', 'whip', 'tube', 'crinoid', 'anemone'],
  DEEP_GROWTHS,
];
/** The course pastels, not the grey. */
const LIFE_HUES = HUES.map((_, i) => i).filter((i) => HUES[i] !== '#9AA3AB');

interface LifeEnv {
  w: number;
  h: number;
  seed: number;
  focus: number;
  rocks: PlacedRock[];
  walls: Wall[];
  floor: Plan['floor'];
  trench: Trench | null;
  groundY: (x: number) => number;
  zAt: (y: number) => number;
  /** What it keeps clear of by 0.02 S (the animals, the jellies, the rare things, the window), and what it may not stand in at all (the calm). */
  clear: Box[];
  touch: Box[];
  calm: Box;
  /** Whether it is drawn on the night ground (a growth's reach there counts its glow). */
  dark: boolean;
}

/** What a growth's ink covers on the page (units): its drawn extent (`growthExtent`, the drawing's own dice), turned by its lean about its foot. */
function lifeBox(x: number, y: number, g: { kind: LifeKind; size: number; seed: number }, zone: number, dark: boolean, lean: number): Box {
  const ex = growthExtent(g, zone, dark);
  const c = Math.cos(lean);
  const sn = Math.sin(lean);
  const pts = [
    [ex.x0, ex.y0],
    [ex.x1, ex.y0],
    [ex.x0, ex.y1],
    [ex.x1, ex.y1],
  ].map(([dx, dy]) => [x + dx * c - dy * sn, y + dx * sn + dy * c]);
  return { x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), y1: Math.max(...pts.map((q) => q[1])) };
}

/**
 * The life on the structure: growths along each rock's crest, out from the
 * wall's face and on its ledges, and over the floor or the trench's benches,
 * as thick as the sitting was long (`lifeSpacing`), in loose clumps. None in
 * the calm water, none within 0.02 S of an animal, a jelly or a rare thing.
 */
function placeLife(e: LifeEnv): { life: PlacedLife[]; edge: number } {
  const { w, h } = e;
  const S = Math.min(w, h);
  const sp = lifeSpacing(e.focus) * S;
  // Smaller as they thicken, so a long sitting's floor is a field, never a hedge.
  const shrink = clamp(sp / (0.08 * S), 0.72, 1);
  const r = mulberry32(hash32(e.seed, 'life'));
  const out: PlacedLife[] = [];
  let edge = 0;
  const zoneAt = (y: number) => {
    const z = e.zAt(y);
    return z < 0.3 ? 0 : z < 0.6 ? 1 : 2;
  };
  const tryPut = (kind: LifeKind, x: number, y: number, size: number, lean: number, on: PlacedLife['on'], host: string, zone: number) => {
    const seed = (r() * 4294967296) >>> 0;
    const hue = LIFE_HUES[Math.floor(r() * LIFE_HUES.length)];
    // (Lying on the ground, a star is never turned up a slope.)
    if (kind === 'brittlestar') lean = 0;
    const box = lifeBox(x, y, { kind, size, seed }, zone, e.dark, lean);
    if (box.x1 < 0 || box.x0 > w || box.y1 > h + 2) return;
    if (inter(box, e.calm) > 0) return;
    for (const b of e.clear) if (boxGap(b, box) < CLEAR) return;
    for (const b of e.touch) if (inter(b, box) > 0) return;
    for (const o of out) if (boxGap(o.box, box) < 1) return;
    out.push({ kind, x, y, size, hue, seed, zone, lean, on, host, box });
  };
  const kindAt = (zone: number, floor: boolean): LifeKind => {
    if (floor && zone === 1 && r() < 0.2) return 'brittlestar';
    const kit = LIFE_KITS[zone];
    return kit[Math.floor(r() * kit.length)];
  };
  const tallOf = (kind: LifeKind, k: number) => h * (kind === 'tube' ? 0.015 + 0.015 * r() : 0.02 + 0.016 * r()) * k * shrink;
  // Along each rock's crest.
  for (const k of e.rocks) {
    if (k.kind === 'kelp' || k.plane === 0) continue;
    const span = (k.off + k.reach) * w;
    const from = k.off / (k.off + k.reach) + 0.05;
    const L = (0.88 - from) * span;
    edge += L;
    const count = Math.max(k.plane === 2 ? 2 : 1, Math.round(L / sp));
    const zone = Math.min(2, k.zone);
    const N = k.shape.top.length - 1;
    for (let i = 0; i < count; i++) {
      const u = from + ((0.88 - from) * (i + 0.2 + r() * 0.6)) / count;
      const f = u * N;
      const i0 = Math.floor(f);
      const i1 = Math.min(N, i0 + 1);
      const y = k.y + (k.shape.top[i0] * (1 - (f - i0)) + k.shape.top[i1] * (f - i0)) * k.height + 2;
      const kit = LIFE_KITS[zone];
      const kind = kit[Math.floor(r() * kit.length)];
      tryPut(kind, rockX(k, w, u), y, tallOf(kind, k.plane === 2 ? 1 : 0.8), 0, 'rock', rockKey(k), zone);
    }
  }
  // Out from the wall's face, and on its ledges.
  for (const wl of e.walls) {
    if (wl.plane === 0) continue;
    const mine = e.rocks.filter((k) => k.wall === wl);
    // (Under a rock the wall begins inside it, as it is drawn: nothing grows on the wall above its top rock.)
    const topRock = mine.reduce<PlacedRock | null>((a, k) => (!a || k.y + k.height * 0.3 < a.y + a.height * 0.3 ? k : a), null);
    const from = Math.max(wl.top, topRock && topRock.y + topRock.height * 0.6 >= wl.top ? topRock.y + topRock.height : wl.top) + h * 0.04;
    const to = Math.min(wl.bottom, e.floor ? e.groundY(wl.edge < 0 ? 4 : w - 4) : h) - h * 0.04;
    edge += Math.max(0, to - from);
    for (let y = from + r() * sp; y < to; y += sp * (0.7 + 0.9 * r())) {
      if (mine.some((k) => y > k.y - h * 0.03 && y < k.y + k.height + h * 0.03)) continue;
      const f = wallAt(wl, y);
      if (f == null) continue;
      const zone = zoneAt(y);
      const kit = LIFE_KITS[zone];
      const kind = kit[Math.floor(r() * kit.length)];
      const x = wl.edge < 0 ? f - 1 : w - f + 1;
      tryPut(kind, x, y, tallOf(kind, 0.75), -wl.edge * (0.7 + 0.4 * r()), 'wall', `wall|${wl.edge}`, zone);
    }
    for (const l of wl.ledges) {
      const f = wallAt(wl, l.y + 1) ?? 0;
      const zone = zoneAt(l.y);
      const kit = LIFE_KITS[zone];
      for (let i = 0; i < Math.max(1, Math.round((f * 0.6) / sp)); i++) {
        const kind = kit[Math.floor(r() * kit.length)];
        const d = f * (0.45 + 0.4 * r());
        tryPut(kind, wl.edge < 0 ? d : w - d, l.y + 1, tallOf(kind, 0.7), 0, 'wall', `wall|${wl.edge}`, zone);
      }
    }
  }
  // Over the floor, or the trench's benches: in clumps, where the ground lies easy.
  if (e.floor) {
    const t = e.trench;
    edge += t ? w - t.gap : w;
    /** How far into the long sittings: 0 for two hours or less, 1 by four and a half (more of the floor's face grown over). */
    const front = clamp((0.085 - sp / S) / 0.045, 0, 1);
    const at = (x: number) => {
      const g = e.groundY(x);
      const dg = (e.groundY(x + 6) - e.groundY(x - 6)) / 12;
      const ok = !(t && Math.abs(x - t.x) < t.gap / 2 + w * 0.02) && g < h * 0.985 && Math.abs(dg) < 2.5;
      return { g, dg, ok };
    };
    // Clumps scattered at random along the floor (a Poisson scatter of
    // centres, one to five in each), most of them standing out on the
    // floor's face in front of its line, a few on the line itself: a colony,
    // never a fence along the crest. Each a little taller or shorter than
    // the next (four tenths either way).
    const want = Math.max(2, Math.round((t ? w - t.gap : w) / sp));
    const share = FLOOR_FACE[0] + (FLOOR_FACE[1] - FLOOR_FACE[0]) * front;
    for (let guard = 0, made = 0; made < want && guard < want * 5; guard++) {
      const cx = w * 0.02 + r() * w * 0.96;
      const m = 1 + Math.floor(r() * 5);
      const q = 0.02 + 0.08 * r();
      // (Which clumps stand in front, spread evenly through them, so the share holds on a short floor too.)
      const below = (guard * 0.618034 + 0.31) % 1 < share;
      for (let k = 0; k < m && made < want; k++) {
        const xi = cx + gauss(r) * sp * 0.13;
        const p = at(xi);
        if (!p.ok) continue;
        // (On a trench's bench, in front of its line only away from the lip.)
        const face = below && !(t && Math.abs(xi - t.x) < t.gap / 2 + w * 0.06);
        const y = face ? p.g + (q + (r() - 0.5) * 0.012) * h : p.g + 1.5 + Math.abs(p.dg) * 2;
        if (y > h * 0.985) continue;
        const zone = zoneAt(p.g);
        const kind = kindAt(zone, true);
        const n0 = out.length;
        tryPut(kind, xi, kind === 'brittlestar' ? y + 2 + r() * 4 : y, tallOf(kind, 0.95) * (0.6 + 0.8 * r()), face ? (r() - 0.5) * 0.3 : -Math.atan(p.dg) * 0.6 + (r() - 0.5) * 0.25, 'floor', 'floor', zone);
        if (out.length > n0) made++;
      }
    }
  }
  return { life: out, edge };
}

/** The share of the floor's growths that stand out on its face in front of its line rather than on the line: an hour's and four and a half hours'. */
export const FLOOR_FACE: [number, number] = [0.7, 0.8];

/**
 * How much of the picture's second fall of marine snow comes down at depth
 * y (units), 0 to 1: none for a sitting of under forty-five minutes, and
 * thickening down the page and with the hours, whole in the deep by four
 * and a half (the snow there two and a half times the first fall).
 */
export function snowAt(plan: { focus: number; h: number; zStops: { y: number; z: number }[] }, y: number): number {
  const dur = clamp((plan.focus / 60 - 45) / 225, 0, 1);
  if (dur <= 0) return 0;
  const st = plan.zStops;
  let k = 1;
  while (k < st.length - 1 && st[k].y < y) k++;
  const a = st[k - 1];
  const b = st[k];
  const z = a.z + (b.z - a.z) * clamp((y - a.y) / Math.max(1e-6, b.y - a.y), 0, 1);
  const t = clamp((z - 0.3) / 0.6, 0, 1);
  return dur * t * t * (3 - 2 * t);
}

/** Where the thick snow of a long sitting's deep marks the page, as `snowAt` gives it. */
export const SNOW_MARK = 0.5;

/**
 * The share of the page with no mark on it at all: cells a twentieth of the
 * short side square that nothing drawn stands in (the jellies and the cast,
 * the rare things, the rocks, the wall and the ground, what grows on them,
 * the bubbles, and the thick snow of a long sitting's deep). The light is not
 * a mark. It falls as the sitting lengthens, the calm stretch kept.
 */
export function emptyShare(plan: Plan): number {
  const o = occupancy(solidsOf(plan), 0.05 * REF);
  let empty = 0;
  for (let j = 0; j < o.gy; j++) {
    const thick = snowAt(plan, (j + 0.5) * o.ch) >= SNOW_MARK;
    for (let i = 0; i < o.gx; i++) {
      if (thick || o.cells[j * o.gx + i]) continue;
      const x0 = i * o.cw;
      const y0 = j * o.ch;
      if (plan.bubbles.some((b) => b.x >= x0 && b.x < x0 + o.cw && b.y >= y0 && b.y < y0 + o.ch)) continue;
      empty++;
    }
  }
  return empty / (o.gx * o.gy);
}

/* ---- The bubbles ---- */

/** The largest a bubble may be, in units: no lens-sized discs (0.004 S across). */
export const BUBBLE_MAX = 0.002 * REF;

function trail(path: number[], jellies: PlacedJelly[], rocks: PlacedRock[], r: Rand, h: number, w: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  let carry = 0;
  for (let i = 2; i < path.length; i += 2) {
    const x0 = path[i - 2];
    const y0 = path[i - 1];
    const x1 = path[i];
    const y1 = path[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0);
    // Only where it was sinking: at rest nothing rises.
    if (y1 - y0 < d * 0.25) continue;
    carry += d;
    while (carry > 12) {
      carry -= 12 + r() * 10;
      const t = r();
      const x = x0 + (x1 - x0) * t + gauss(r) * 12;
      const y = y0 + (y1 - y0) * t + gauss(r) * 6;
      if (jellies.some((j) => Math.abs(x - j.x) < j.r * 1.2 && y > j.y - j.r && y < j.y + j.r * 0.8)) continue;
      if (rocks.some((k) => k.plane > 0 && rockTouches(k, w, { x0: x, x1: x, y0: y, y1: y }, 3))) continue;
      if (y < h * 0.06) continue;
      // Thickest just above each jelly, where they rise from, and thinning
      // out up the way: a trail, never a dotted line.
      let near = Infinity;
      for (const j of jellies) if (y < j.y) near = Math.min(near, Math.hypot((x - j.x) * 0.6, j.y - y));
      if (r() > Math.exp(-near / (h * 0.09)) * 0.95 + 0.04) continue;
      out.push({ x, y, r: Math.min(BUBBLE_MAX, 0.9 + r() * 1.1) });
      // Now and then a short string of them, rising.
      if (r() < 0.2) {
        for (let k = 1; k <= 2 + Math.floor(r() * 3); k++) out.push({ x: x + gauss(r) * 3, y: y - k * (8 + r() * 6), r: Math.min(BUBBLE_MAX, 0.7 + r() * 0.9) });
      }
    }
  }
  return out;
}

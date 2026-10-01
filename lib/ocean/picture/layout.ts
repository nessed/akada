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
import type { EventKind, OceanEvent } from '../events';
import { KELP_ROCK, rollKelp } from '../kelp';
import { rockShape } from '../outcrop-sprite';
import { moonPhase, sunFor } from '../light';
import { jellyForBlock } from '../lineage';
import { hash32, mulberry32, type Rand } from '../random';
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
}

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

export interface Trench {
  /** The middle of the cleft, and its width at the foot of the page, in units. */
  x: number;
  gap: number;
  /** Where the walls start at the page's edges. */
  top: number;
  /** How the walls fall: gently at first, then steeply into the cleft. */
  fall: number;
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
  kelp: { bottom: number; top: number; keep: number[] } | null;
  floor: { y: number; amp: number; phase: number } | null;
  trench: Trench | null;
  events: PlacedEvent[];
  cast: PlacedAnimal[];
  bubbles: { x: number; y: number; r: number }[];
  /** The lowest thing in the picture that is not the floor: below it the page falls away. */
  contentBottom: number;
  /** How well the winning layout fits (the solver's cost, lower is better): about the layout, never the sitting. */
  fit: number;
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

const profiles = new Map<string, { top: number[]; under: number[]; solid: number[] }>();

/**
 * An engine rock's outline across its own span (u 0 to 1), in shares of
 * that span below its nominal top: the top its boulders make, and their
 * underside down to where the wash lets go of it.
 */
function profile(seed: number, thick: number): { top: number[]; under: number[]; solid: number[] } {
  const key = `${seed}|${thick}`;
  const hit = profiles.get(key);
  if (hit) return hit;
  const S = 100;
  const shape = rockShape(seed, S, thick * S, 1);
  const foot = shape.height * ROCK_FOOT;
  const firm = shape.height * ROCK_SOLID;
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
    under.push(Math.max(lo, Math.min(foot, hi)) / S);
    solid.push(Math.max(lo, Math.min(firm, hi)) / S);
  }
  const made = { top, under, solid };
  if (profiles.size > 800) profiles.clear();
  profiles.set(key, made);
  return made;
}

const silhouettes = new Map<string, RockShape>();

/** The silhouette of engine rocks set together, normalised to its box. */
export function rockSilhouette(parts: RockPart[]): RockShape {
  const ps = parts.map((p) => ({ ...p, thick: Math.round(p.thick * 1000) / 1000 }));
  const key = ps.map((p) => `${p.seed}|${p.at}|${p.span}|${p.dy}|${p.thick}`).join(';');
  const hit = silhouettes.get(key);
  if (hit) return hit;
  const top: number[] = [];
  const under: number[] = [];
  const solid: number[] = [];
  const prof = ps.map((p) => profile(p.seed, p.thick));
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
export function rockOfKind(seed: number, kind: number, want: number, exact = true): RockShape {
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
  let s = rockSilhouette(build(k));
  for (let i = 0; i < (exact ? 1 : 0); i++) {
    k = Math.max(0.35, Math.min(1.3, k * (want / Math.max(0.05, s.ratio))));
    k = Math.round(k * 50) / 50;
    s = rockSilhouette(build(k));
  }
  return s;
}

/** The same rock, standing `want` tall for its width (its parts' depths scaled). */
export function rockOfRatio(shape: RockShape, want: number): RockShape {
  let k = 1;
  let s = shape;
  for (let i = 0; i < 1; i++) {
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

/** Whether the rock's silhouette comes within `pad` of a box. */
export function rockTouches(k: PlacedRock, w: number, b: Box, pad = 0): boolean {
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

/** A shape for a new rock unlike any already on the page. */
function distinctShape(seed: number, want: number, others: RockShape[]): RockShape {
  let best: RockShape | null = null;
  let bestIoU = Infinity;
  const first = seed % 4;
  let bestT = 0;
  for (let t = 0; t < (others.length ? 10 : 1); t++) {
    // Judged roughly (the silhouette, normalised, hardly cares how tall it is asked to be), made exactly after.
    const s = rockOfKind(hash32(seed, 'try', t), (first + t) % 4, want, false);
    // Alike in silhouette counts, and more so with the crest alike as well.
    const worst = others.reduce((a, o) => Math.max(a, rockIoU(s, o) + Math.max(0, 0.12 - crestDiff(s, o))), 0);
    if (worst < bestIoU) {
      best = s;
      bestIoU = worst;
      bestT = t;
    }
    if (t >= 1 && !others.some((o) => sameRock(s, o))) break;
  }
  void best;
  return rockOfKind(hash32(seed, 'try', bestT), (first + bestT) % 4, want);
}

/* ---- The floor and the trench ---- */

/** The floor's line at x, in units: long low swells, and smaller ones on them. */
export function floorAt(plan: { w: number; h: number; floor: Plan['floor']; trench: Plan['trench'] }, x: number): number {
  const f = plan.floor;
  if (!f) return plan.h;
  const k = plan.w / 1000;
  const swell = f.amp * (0.62 * Math.sin(x / (140 * k) + f.phase) + 0.28 * Math.sin(x / (37 * k) + f.phase * 2) + 0.1 * Math.sin(x / (9 * k) + f.phase));
  const t = plan.trench;
  if (!t) return f.y + swell;
  // The walls of the trench: from their top at the page's edges, falling
  // gently and then steeply to the foot of the page, either side of a cleft.
  const l = t.x - t.gap / 2;
  const r = t.x + t.gap / 2;
  if (x > l && x < r) return plan.h * 2;
  const left = x <= l;
  const s = clamp(left ? x / Math.max(1, l) : (plan.w - x) / Math.max(1, plan.w - r), 0, 1);
  // A wall in ledges: benches falling gently, then a steep drop to the next.
  let fl = 0.3 * Math.pow(s, t.fall);
  for (const [at, d, wd] of t.ledges?.[left ? 0 : 1] ?? []) {
    const q = clamp((s - (at - wd)) / (2 * wd), 0, 1);
    fl += 0.7 * d * q * q * (3 - 2 * q);
  }
  // Rough as rock is, a little, all along.
  const rough = plan.h * 0.006 * (Math.sin(x / (23 * k) + fl * 9) * 0.6 + Math.sin(x / (7.3 * k) + 1.7) * 0.4) * Math.min(1, s * 6);
  return t.top + (plan.h * 1.01 - t.top) * fl + swell * 0.5 * (1 - s) + rough;
}

/** Where a trench wall is at depth y: x in units, on the given side of the cleft. */
export function trenchWallX(t: Trench, w: number, h: number, side: -1 | 1, y: number): number {
  const s = Math.pow(clamp((y - t.top) / Math.max(1, h * 1.01 - t.top), 0, 1), 1 / t.fall);
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
      hueShift: age === 0 ? 0 : swing * (14 + 11 * r()),
    });
  }
  return out;
}

/** A jelly's hull, bell and trails, in units. */
export function jellyHull(j: { x: number; y: number; r: number; len: number; aspect: number }): Box {
  const bh = 0.8 * j.r * j.aspect;
  return { x0: j.x - j.r * 1.15, x1: j.x + j.r * 1.15, y0: j.y - bh / 2 - j.r * 0.1, y1: j.y + bh / 2 + j.len };
}

/* ---- Planning ---- */

interface Shape {
  width: number;
  height: number;
}

export function plan(s: Session, color: string, ground: 'paper' | 'night', shape: Shape): Plan {
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

  // ---- The window of sky at the very top, where the way down begins:
  // small, and wholly on the page, as looking straight up.
  const winR = tall ? w * 0.13 : w * 0.085;
  const winTop = h * 0.022;
  const winY = winTop + winR * 0.46 * 1.04;

  // Where the hero's bell hangs: the deepest point of the dive.
  const heroR = 0.0875 * S;
  // A short sitting's hero hangs a little lower (0.58 to 0.66 of the page),
  // its trails reaching well into the lowest fifth, so the foot of the page
  // is never empty paper.
  const short = s.focus < 3600;
  const yEnd = tall
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

  // ---- The path: time across, depth down. A break moves the path along
  // without sinking it. Tall pages take it as an S; wide ones as a diagonal
  // from the upper left to the lower right.
  const flip = (hash32(s.key, 'side') & 1) === 1 ? -1 : 1;
  const amp = 0.18 + 0.07 * unit01(s.key, 'swing');
  const share = (sec: number) => F * (0.05 + 0.09 * Math.min(1, sec / 1800));
  type Leg = { kind: 'focus' | 'rest'; u0: number; u1: number; f0: number; f1: number };
  const legs: Leg[] = [];
  let u = 0;
  const order: { wall: number; leg: () => void }[] = [];
  for (const b of s.blocks) order.push({ wall: b.wallFrom, leg: () => { legs.push({ kind: 'focus', u0: u, u1: u + (b.to - b.from), f0: b.from, f1: b.to }); u += b.to - b.from; } });
  for (const r of s.rests) order.push({ wall: r.wallFrom + 1e-3, leg: () => { legs.push({ kind: 'rest', u0: u, u1: u + share(r.seconds), f0: r.at, f1: r.at }); u += share(r.seconds); } });
  order.sort((a, b) => a.wall - b.wall);
  for (const o of order) o.leg();
  const U = Math.max(1e-6, u);
  const focusAtU = (uu: number) => {
    for (const l of legs) {
      if (uu <= l.u1) return l.f0 + ((l.f1 - l.f0) * (uu - l.u0)) / Math.max(1e-6, l.u1 - l.u0);
    }
    return F;
  };
  const xAt = (t: number) => (tall ? w * (0.5 + amp * flip * Math.sin(Math.PI * (1.7 * t + 0.15))) : w * (0.2 + 0.52 * t + 0.03 * Math.sin(Math.PI * 2 * (1.1 * t + 0.2))));
  // The kelp's canopy lies along the surface, in from its wall: the window
  // keeps clear of it.
  const kelpTop = h * 0.03;
  const kelpBottom = s.kelp ? clamp(yOf(11.6 * 60) + h * 0.06, h * 0.3, h * 0.8) : 0;
  const kelpHf = (kelpBottom - kelpTop) / 2.45;
  const forest = s.kelp ? rollKelp(s.biome.key) : null;
  // The forest is measured against the short side, not the width: a wide
  // page does not grow its kelp and their rock wider, it shows more water.
  const kelpW = Math.min(w, h);
  let inL = 0;
  let inR = 0;
  if (forest) {
    for (const st of forest.stalks) {
      // What of it is longer than the water is deep lies along the surface.
      const over = Math.max(0, st.height - (st.base - 0.08)) * kelpHf + 0.06 * kelpHf;
      if (st.x < 0.5) inL = Math.max(inL, st.x * kelpW + over + kelpW * 0.03);
      else inR = Math.max(inR, (1 - st.x) * kelpW + over + kelpW * 0.03);
    }
  }
  const winLo = Math.max(winR * 1.3, inL + winR * 1.12);
  const winHi = Math.min(w - winR * 1.3, w - inR - winR * 1.12);
  const winX = winLo <= winHi ? clamp(xAt(0), winLo, winHi) : (winLo + winHi) / 2;
  const win = { x: winX, y: winY, r: winR };
  const winBox: Box = { x0: winX - winR * 1.08, x1: winX + winR * 1.08, y0: 0, y1: winY + winR * 0.46 * 1.08 };
  const uOfBlockEnd = (b: number) => {
    let k = 0;
    for (const l of legs) {
      if (l.kind === 'focus') {
        if (k === b) return l.u1;
        k++;
      }
    }
    return U;
  };

  // ---- The jellies: one per block, where the block ended; the last is
  // the hero. The one before is half its size; older ones smaller and
  // fainter; past the fourth they are far off in the water.
  const n = s.blocks.length;
  const builds = buildsFor(s.key, n);
  const jellies: PlacedJelly[] = [];
  const at: number[] = [];
  const jitter = (i: number) => (unit01(s.key, 'jelly-jitter', i) - 0.5) * 0.12 * w;
  const lineK = tall ? 0.35 : 0.7;
  const place = (j: PlacedJelly, uu: number) => {
    const t = uu / U;
    const top = winBox.y1 + 0.4 * j.r * j.aspect + j.r * 0.2;
    j.x = clamp(xAt(t) + (j.hero ? 0 : jitter(j.block)), w * MARGIN + j.r * 1.15, w * (1 - MARGIN) - j.r * 1.15);
    if (!j.hero) {
      // Never stacked in a column with the one before it: stepped aside.
      const prev = jellies[j.block - 1];
      if (prev && Math.abs(prev.x - j.x) < w * 0.05) {
        const away = j.x >= prev.x ? 1 : -1;
        const x = prev.x + away * w * 0.07;
        j.x = x > w * MARGIN + j.r * 1.15 && x < w * (1 - MARGIN) - j.r * 1.15 ? x : prev.x - away * w * 0.07;
        j.x = clamp(j.x, w * MARGIN + j.r * 1.15, w * (1 - MARGIN) - j.r * 1.15);
      }
    }
    // Down the page with depth, eased toward the path's own line so the
    // blocks of a long sitting, all deep, do not line up along one row.
    // On a wide page the way down steepens toward its end, so the last
    // blocks, which matter most, stand apart in depth as well as across.
    const lineY = tall ? h * 0.2 + (yEnd - h * 0.2) * t : h * 0.16 + (yEnd - h * 0.16) * Math.pow(t, 1.7);
    const y = yOf(focusAtU(uu)) * (1 - lineK) + lineY * lineK;
    j.y = j.hero ? yEnd : clamp(y, top, h * (1 - MARGIN) - j.len - j.r * 0.45 * j.aspect);
    j.z = zAt(j.y);
    j.box = jellyHull(j);
  };
  // Their sizes: the hero, the one before half of it, and the older ones
  // smaller, but not in an even ladder: siblings differ, and an older one
  // may be bigger than the one after it. Never more than three in a row
  // growing.
  const scales: number[] = [];
  for (let i = 0; i < n; i++) {
    const age = n - 1 - i;
    const u = unit01(s.key, 'jelly-size', i);
    scales.push(age === 0 ? 1 : age === 1 ? 0.55 : age === 2 ? 0.47 + 0.15 * u : age === 3 ? 0.34 + 0.16 * u : 0.25 + 0.15 * u);
  }
  for (let i = 1, run = 0; i < n - 2; i++) {
    run = scales[i] > scales[i - 1] ? run + 1 : 0;
    // (The last two always grow, to the hero: room is left for them.)
    if (run >= (i === n - 3 ? 1 : 3)) {
      scales[i] = Math.max(0.24, scales[i - 1] * (0.82 + 0.08 * unit01(s.key, 'jelly-shrink', i)));
      run = 0;
    }
  }
  // Spaced along the way down by when each block ended, give or take a
  // third of the room either side, so they never fall at even steps.
  const ends = Array.from({ length: n }, (_, i) => uOfBlockEnd(i));
  const spaced = ends.map((uu, i) => {
    if (i === n - 1) return uu;
    const room = Math.min(uu - (i ? ends[i - 1] : 0), ends[i + 1] - uu);
    return uu + (unit01(s.key, 'jelly-space', i) - 0.5) * 0.7 * room;
  });
  for (let i = 0; i < n; i++) {
    const age = n - 1 - i;
    const hero = age === 0;
    const scale = scales[i];
    const r = heroR * scale;
    const body = builds[i];
    const j: PlacedJelly = {
      block: i,
      x: 0,
      y: 0,
      r,
      // The hero's trails reach 0.86 of the page down at least.
      len: hero ? Math.max(r * (tall ? 2.9 : 2.5), Math.min(h * 0.86 - yEnd - 0.4 * r * body.aspect, r * 3.6)) : r * 2.5,
      aspect: body.aspect,
      hero,
      z: 0,
      alpha: hero ? 1 : age === 1 ? 0.95 : age === 2 ? 0.75 : age === 3 ? 0.6 : 0.35,
      weight: hero ? 1 : age === 1 ? 0.8 : age === 2 ? 0.75 : age === 3 ? 0.7 : 0.5,
      far: age >= 4,
      body,
      box: { x0: 0, y0: 0, x1: 0, y1: 0 },
    };
    at.push(spaced[i]);
    place(j, at[i]);
    jellies.push(j);
  }
  // Each keeps its distance: centres at least 1.4 times their radii summed
  // apart, and nothing within the hero's margin. The older one gives way,
  // back up the way it came, so the way down is never bent to fit.
  const hero = jellies[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    const j = jellies[i];
    for (let tries = 0; tries < 120; tries++) {
      const bad = j.y > jellies[i + 1].y || jellies.slice(i + 1).some((o) => Math.hypot(o.x - j.x, o.y - j.y) < 1.4 * (o.r + j.r) || (o.hero && boxGap(o.box, j.box) < CLEAR) || inter(o.box, j.box) > 0);
      if (!bad) break;
      if (at[i] > U * 0.004) at[i] = Math.max(0, at[i] - U * 0.012);
      else if (j.r > heroR * 0.22) {
        j.r *= 0.92;
        j.len = j.r * 2.5;
      } else break;
      place(j, at[i]);
    }
  }

  // ---- The way down, through the jellies: from under the window to the
  // first, and on from each to the next, in easy curves.
  const path: number[] = [];
  {
    const anchors = [{ x: winX, y: winY + winR * 0.46 }, ...jellies.map((j) => ({ x: j.x, y: j.y }))];
    path.push(anchors[0].x, anchors[0].y);
    for (let a = 1; a < anchors.length; a++) {
      const A = anchors[a - 1];
      const B = anchors[a];
      const bulge = (a % 2 ? 1 : -1) * flip * w * (tall ? 0.04 : 0.02);
      for (let k = 1; k <= 40; k++) {
        const t = k / 40;
        const e = t * t * (3 - 2 * t);
        path.push(A.x + (B.x - A.x) * e + bulge * Math.sin(Math.PI * t), A.y + (B.y - A.y) * t);
      }
    }
  }

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
        out.push([at, d, 0.012 + lr() * 0.02]);
        total += d;
      }
      return out.map(([a, d, wd]) => [a, d / total, wd]);
    };
    trench = { x: tx, gap, top: h * 0.7, fall: 2.3, ledges: [wall(), wall()] };
  }
  const floor = floorY != null ? { y: trench ? trench.top : floorY, amp: h * (0.012 + 0.006 * unit01(s.key, 'floor-amp')), phase: unit01(s.key, 'silt') * TAU } : null;
  const geo = { w, h, floor, trench };
  const groundY = (x: number) => floorAt(geo, x);
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
    const kelpRocks = (bottom: number): PlacedRock[] => {
      const hf = (bottom - kelpTop) / 2.45;
      return forest.ledges.map((ledge) => {
        // kelp-draw stands the ledge on the same engine: (reach + 3%) of the
        // width out from a wall 3% off the page, KELP_ROCK of a frame deep.
        const span = (ledge.reach + 0.03) * kelpW;
        const sh = rockSilhouette([{ seed: ledge.seed, at: 0, span: 1, dy: 0, thick: (KELP_ROCK * hf) / span }]);
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
    // The forest stands higher if its rock would crowd a jelly: the rock
    // moves, never the way down.
    let bottom = kelpBottom;
    let made = kelpRocks(bottom);
    // (A far jelly is behind it, in the haze.)
    while (bottom > h * 0.22 && made.some((k) => jellies.some((j) => !j.far && rockTouches(k, w, j.box, CLEAR)))) {
      bottom -= h * 0.02;
      made = kelpRocks(bottom);
    }
    kelp = { bottom, top: kelpTop, keep: forest.stalks.map((_, i) => i) };
    rocks.push(...made);
  }

  // ---- The rocks: each break's near and inked, at the depth of its rest,
  // near its jelly but never under it; the rocks merely passed far off in
  // the water, small and hazy.
  placeRocks(s, rocks, shapes, { w, h, tall, jellies, winBox, rockFoot, yOf, seed, kelpBottom: kelp?.bottom ?? null });

  // ---- The rare things, at the depth they happened.
  const pathXAt = (y: number) => distToPathX(path, y);
  const awaySide = (y: number) => (pathXAt(y) < w / 2 ? 1 : -1);
  const events: PlacedEvent[] = [];
  const seen = new Set<EventKind>();
  const M = Math.min(w, h);
  for (const e of s.events) {
    if (seen.has(e.kind)) continue;
    seen.add(e.kind);
    const pe = placeEvent(e, yOf(e.start), { w, h, M, floorY: floor ? floor.y : null, current: s.biome.env.current, awaySide, jellies, groundY, trench });
    if (pe) events.push(pe);
  }
  settleEvents(events, { w, h, jellies, rocks, winBox, floorTop: floor ? (trench ? trench.top : floor.y) : null });

  // ---- The cast.
  const cast = solveCast(s, {
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

  // ---- The bubbles: a faint trail rising off the way down, never a line.
  const bubbles = trail(path, jellies, rocks, mulberry32(hash32(seed, 'bubbles')), h, w);

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
    kelp,
    floor,
    trench,
    events,
    cast: cast.cast,
    bubbles,
    contentBottom,
    fit: cast.score,
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
}

function placeRocks(s: Session, rocks: PlacedRock[], shapes: RockShape[], e: RockEnv): void {
  const { w, h, tall, jellies } = e;
  const nBreaks = s.rests.length;
  const cap = tall ? (nBreaks > 4 ? 3 : 2) : 3;
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
    for (const j of jellies) if (rockTouches(k, w, j.box, CLEAR)) return true;
    const same = placed.filter((o) => o.edge === k.edge);
    // The kelp's own rock is the forest's foot, not one of the page's rocks.
    if (same.filter((o) => o.kind !== 'kelp').length >= cap + capPlus) return true;
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
  const nearWallOf = (sp: Spec): -1 | 1 => (sp.nearX < w / 2 ? -1 : 1);
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
      for (let t = 0; t < 30; t++) tries.push({ edge: r() < (t < 15 ? 0.68 : 0.5) ? nearWall : ((-nearWall) as -1 | 1), centre: sp.anchor + (gauss(r) * 0.07 + 0.03) * h * (1 + t / 15), k: 1 });
      for (const k of [1, 0.85, 0.72, 0.6]) for (let y = h * 0.1; y < h * 0.9; y += h * 0.025) for (const edge of [nearWall, -nearWall as -1 | 1]) tries.push({ edge, centre: y, k });
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
        else if (m < 0.65) p.edge = (-p.edge) as -1 | 1;
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
            for (const edge of [-1, 1] as const) {
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
      let shape = rockOfKind(hash32(k.seed, 'again', t), t % 4, want);
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
    for (const [gapK, capPlus, mirK] of [[1, 0, 1], [1, 0, 0.5], [1, 0, 0], [0.66, 0, 0], [0.4, 0, 0], [0.4, 1, 0]]) {
      for (const kk of [0.72, 0.6, 0.5, 0.45]) {
        for (let y = h * 0.08; y < h * 0.92; y += h * 0.01) {
          for (const edge of [-1, 1] as const) {
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
      let shape = rockOfKind(hash32(k.seed, 'twin', t), (t + 1) % 4, want);
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
    const y0 = e.yOf(at);
    if (e.kelpBottom != null && y0 < e.kelpBottom && o.zone === 0) continue;
    const r = mulberry32(hash32(s.key, 'passed', o.slot));
    const reach = clamp(o.reach, 0.15, 0.26) * 0.6;
    const off = 0.08 + 0.02 * r();
    const want = Math.max(0.55, Math.min(ratioMax, (h * 0.1) / ((reach + off) * w)));
    const sh = distinctShape(hash32(s.key, 'passed-rock', o.slot), want, shapes);
    const height = sh.ratio * (reach + off) * w;
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
      // the flipper, the head's taper). It is 0.45 to 0.6 of the page's
      // width, caught at the middle of its pass (full strength), inside the
      // page and on the side away from the way down.
      const len = w * (0.48 + 0.1 * (((sd >>> 3) % 100) / 100));
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
      const rw = w * 0.62;
      const rh = Math.min(h * 0.28, rw * 0.62);
      const ry = clamp(y - rh / 2, h * 0.08, h * 0.85 - rh);
      const rx = side > 0 ? w * 0.72 : w * 0.28 - rw;
      const pe: PlacedEvent = { ...base, age: 0.5, rx, ry, rw, rh, x: side > 0 ? w : 0, y: ry + rh / 2, far: false, box: null, lie: side * 0.1 };
      pe.box = eventHull(pe, w);
      return pe;
    }
    case 'eye': {
      // Small in a print, and half in the dark at the edge of the page.
      const rh = w * 0.2;
      const r = 0.2 * Math.min(w, rh);
      const left = sd % 2 === 0;
      const ny = rh * (0.18 + (((sd >>> 6) % 100) / 100) * 0.2);
      const ry = clamp(y, h * 0.15, h * 0.85) - ny;
      const mirror = (left ? -1 : 1) !== side;
      const onLeft = left !== mirror;
      void r;
      // drawEye keeps three quarters of it in from the edge itself.
      const re = 0.0375 * REF;
      const pe: PlacedEvent = { ...base, age: 0.4, rx: 0, ry, rw: w, rh, mirror, x: onLeft ? re * 0.4 : w - re * 0.4, y: ry + ny, far: false, box: null, edge: true };
      pe.box = eventHull(pe, w);
      return pe;
    }
    case 'turtle': {
      const rh = M * 0.6;
      const L = 0.16 * Math.min(w, rh);
      // It comes to look at a jelly: the one nearest the depth it came at.
      let jel = o.jellies[0];
      for (const j of o.jellies) if (Math.abs(j.y - y) < Math.abs(jel.y - y)) jel = j;
      if (!jel) return null;
      const dir = sd & 1 ? 1 : -1;
      const jitter = ((sd >>> 8) % 100) / 100 - 0.5;
      const gap = Math.max(0.2 * w, L * 1.15 + jel.r * 1.2);
      const natX = jel.x - dir * gap;
      const mirror = natX < w * MARGIN + L || natX > w * (1 - MARGIN) - L;
      const x = mirror ? jel.x + dir * gap : natX;
      const ry = jel.y - rh / 2;
      const ty = jel.y + jitter * 0.06 * rh;
      return {
        ...base,
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
      // never in it.
      const rand = mulberry32(sd ^ 0x3a1ef);
      rand();
      const at = 0.375 + rand() * 0.25;
      let L = w * 0.36;
      let cx: number;
      const t = o.trench;
      if (t) {
        // On the gentle upper part of the larger wall, well clear of the cleft.
        const leftRoom = t.x - t.gap / 2;
        const rightRoom = w - (t.x + t.gap / 2);
        const onLeft = leftRoom >= rightRoom;
        const room = Math.max(leftRoom, rightRoom);
        L = Math.min(L, room * 0.4);
        cx = onLeft ? room * 0.12 + L / 2 : w - room * 0.12 - L / 2;
      } else {
        cx = w * (0.3 + 0.4 * at);
      }
      const rw = L / 0.45;
      const fy = o.groundY(cx) + 0.004 * h;
      return { ...base, age: 1, rx: cx - rw * at, ry: 0, rw, rh: h, x: cx, y: fy, far: false, box: { x0: cx - L / 2, x1: cx + L / 2, y0: fy - L * 0.12, y1: fy + 4 } };
    }
  }
  return null;
}

/** What a rare thing takes up on the page, for the ones that move: in units. */
function eventHull(e: PlacedEvent, w: number): Box | null {
  switch (e.kind) {
    case 'siphonophore': {
      const x0 = Math.max(0, e.rx);
      const x1 = Math.min(w, e.rx + e.rw);
      const cy = e.ry + e.rh / 2;
      return { x0, x1, y0: cy - e.rw * 0.1, y1: cy + e.rw * 0.16 };
    }
    case 'eye': {
      // drawEye sizes itself to the page: an eye 7.5% of the short side
      // across, three quarters in from the edge, in a soft dark of its own.
      const r = 0.0375 * REF;
      const onLeft = e.x < w / 2;
      return onLeft ? { x0: 0, x1: r * 1.8, y0: e.y - r * 1.5, y1: e.y + r * 1.5 } : { x0: w - r * 1.8, x1: w, y0: e.y - r * 1.5, y1: e.y + r * 1.5 };
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

/** Across the page to the other side: the region mirrored about the middle. */
function flipEvent(e: PlacedEvent, w: number): void {
  e.mirror = !e.mirror;
  e.rx = w - e.rx - e.rw;
  e.x = w - e.x;
  if (e.box) e.box = { x0: w - e.box.x1, x1: w - e.box.x0, y0: e.box.y0, y1: e.box.y1 };
}

/** The big rare things that must never touch the hero, each other or a rock. */
const LONE: EventKind[] = ['lure', 'siphonophore', 'oarfish'];

/**
 * The hard rules for the rare things: none over the window, none within the
 * hero's margin; the lure, the siphonophore and the oarfish touching nothing
 * solid nor each other; the eye never on a rock. Each is moved the least it
 * takes, up or down near its depth, and only then across the page.
 */
function settleEvents(events: PlacedEvent[], e: { w: number; h: number; jellies: PlacedJelly[]; rocks: PlacedRock[]; winBox: Box; floorTop: number | null }): void {
  const { w, h } = e;
  const hero = e.jellies[e.jellies.length - 1];
  const bad = (v: PlacedEvent, done: PlacedEvent[]): boolean => {
    const b = v.box;
    if (!b) return false;
    if (inter(b, grow(e.winBox, 4)) > 0) return true;
    if (v.kind !== 'whalefall' && b.y0 < h * 0.04) return true;
    if (v.kind !== 'whalefall' && v.kind !== 'oarfish' && e.floorTop != null && b.y1 > e.floorTop) return true;
    if (v.kind !== 'whalefall' && boxGap(b, hero.box) < CLEAR) return true;
    if (v.kind === 'turtle') return false;
    for (const j of e.jellies) if (!j.hero && v.kind !== 'eye' && inter(b, j.box) > 0) return true;
    if (LONE.includes(v.kind) || v.kind === 'eye' || v.kind === 'dumbo') {
      // The eye is padded by the dark it sits in.
      for (const k of e.rocks) if (rockTouches(k, w, b, v.kind === 'eye' ? 40 : LONE.includes(v.kind) ? 6 : 0)) return true;
    }
    if (LONE.includes(v.kind)) {
      for (const o of done) if (o.box && LONE.includes(o.kind) && boxGap(o.box, b) < 6) return true;
    }
    return false;
  };
  const done: PlacedEvent[] = [];
  // The ones with the least room to move go first.
  const order = [...events].sort((a, b) => Number(LONE.includes(b.kind)) - Number(LONE.includes(a.kind)));
  for (const v of order) {
    if (v.kind === 'whalefall' || v.far || !v.box) {
      done.push(v);
      continue;
    }
    if (!bad(v, done)) {
      done.push(v);
      continue;
    }
    const canFlip = v.kind !== 'turtle' && v.kind !== 'dumbo';
    let fixed = false;
    for (const flip of canFlip ? [false, true] : [false]) {
      if (flip) flipEvent(v, w);
      for (let k = 1; k <= 60 && !fixed; k++) {
        const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h * 0.012;
        shiftEvent(v, dy);
        if (!bad(v, done)) fixed = true;
        else shiftEvent(v, -dy);
      }
      if (fixed) break;
      if (flip) flipEvent(v, w);
    }
    if (!fixed) {
      // Nowhere it may be: better gone than over the hero or a rock.
      const i = events.indexOf(v);
      if (i >= 0) events.splice(i, 1);
      continue;
    }
    done.push(v);
  }
}

/* ---- The cast ---- */

interface CastEnv {
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
}

interface Pick {
  met: Met;
  rare: boolean;
  score: number;
}

/** Who makes the picture: the rarest, the regulars, the deep ones, a spread of every zone. */
function curate(s: Session): Pick[] {
  const met = s.met;
  if (!met.length) return [];
  const zoneMax = Math.max(...met.map((m) => m.zone));
  let rarest = met[0];
  for (const m of met) {
    if (m.zone > rarest.zone || (m.zone === rarest.zone && m.species.abundance < rarest.species.abundance)) rarest = m;
  }
  const fmin = s.focus / 60;
  const want = Math.min(met.length, Math.round(clamp(14 + fmin * 0.06, 16, 26)));
  const scored = met.map((m) => {
    const rarity = clamp((1 / m.species.abundance - 2) / 11, 0, 1);
    const deep = (m.zone + 1) / (zoneMax + 1);
    const jitter = (hash32(s.key, 'curate', m.species.id) % 1000) / 1000;
    return { met: m, rare: m === rarest, score: 0.55 * rarity + 0.6 * deep + (m.species.regular ? 0.3 : 0) + 0.2 * jitter + (m === rarest ? 10 : 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked: Pick[] = [];
  const taken = new Set<Met>();
  // Every zone the dive went through keeps a couple of its own.
  for (let z = 0; z <= zoneMax; z++) {
    const inZone = scored.filter((p) => p.met.zone === z);
    for (const p of inZone.slice(0, 2)) {
      if (picked.length < want && !taken.has(p.met)) {
        picked.push(p);
        taken.add(p.met);
      }
    }
  }
  for (const p of scored) {
    if (picked.length >= want) break;
    if (!taken.has(p.met)) {
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
/** A school's fish against a lone one of its kind. */
const SCHOOL_K = 0.42;
/** The three planes, each its own scale and strength: far 0.35 and faint, the middle 0.6, the near whole. */
export const LAYER_SCALE = [0.35, 0.6, 1];
export const LAYER_ALPHA = [0.45, 0.75, 1];
/** No comb jelly bigger than this but the rarest (0.04 S). */
export const COMB_MAX = 0.04 * REF;

function solveCast(s: Session, e: CastEnv): { cast: PlacedAnimal[]; score: number } {
  const picks = curate(s);
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
  ];
  if (e.kelp) {
    for (const edge of e.kelpEdges) {
      fixed.push({ box: edge < 0 ? { x0: 0, x1: w * 0.2, y0: 0, y1: e.kelp.bottom } : { x0: w * 0.8, x1: w, y0: 0, y1: e.kelp.bottom }, weight: 0.5 });
    }
  }
  const floorTop = e.trench ? e.trench.top : e.floorY;
  // The centres of the things that do not move, for keeping rows from forming.
  const fixedCentres = [
    ...e.jellies.map((j) => j.y),
    ...e.rocks.map((r) => r.y + r.height / 2),
    ...e.events.filter((v) => v.box && !v.far).map((v) => (v.box as Box).y0 / 2 + (v.box as Box).y1 / 2),
  ];

  const water = picks.filter((p) => !(p.met.species.floor && floorTop != null));
  const onFloor = picks.filter((p) => p.met.species.floor && floorTop != null);

  // Who is near, who is middling and who is far is the same in every layout.
  const layerOf = new Map<Pick, 0 | 1 | 2>();
  {
    const ranked = [...water].sort((a, b) => (b.rare ? 1 : 0) - (a.rare ? 1 : 0) || b.score - a.score);
    let near = 0;
    let mid = 0;
    const midWant = Math.round(ranked.length * 0.32);
    for (const p of ranked) {
      const sp = p.met.species;
      const bell = sp.genome.plan === 'bell';
      let layer: 0 | 1 | 2 = 0;
      if (p.rare) layer = 2;
      else if (near < 3 && !sp.school && !bell) {
        layer = 2;
        near++;
      } else if (mid < midWant && !bell) {
        layer = 1;
        mid++;
      }
      layerOf.set(p, layer);
    }
  }

  // Where the water is left open: about a third of the page, in one piece.
  const opens: Box[] = e.tall
    ? [
        { x0: 0, x1: w * 0.5, y0: h * 0.12, y1: h * 0.78 },
        { x0: w * 0.5, x1: w, y0: h * 0.12, y1: h * 0.78 },
        { x0: w * 0.08, x1: w * 0.92, y0: h * 0.1, y1: h * 0.48 },
        { x0: w * 0.08, x1: w * 0.92, y0: h * 0.36, y1: h * 0.76 },
      ]
    : [
        { x0: 0, x1: w * 0.38, y0: h * 0.08, y1: h * 0.92 },
        { x0: w * 0.31, x1: w * 0.69, y0: h * 0.08, y1: h * 0.92 },
        { x0: w * 0.62, x1: w, y0: h * 0.08, y1: h * 0.92 },
        { x0: 0, x1: w, y0: h * 0.06, y1: h * 0.4 },
      ];

  const K = 28;
  let best: { items: Item[]; score: number } | null = null;
  for (let c = 0; c < K; c++) {
    const r = mulberry32(hash32(e.seed, 'layout', c));
    const open = opens[c % opens.length];
    const items: Item[] = [];
    let bells = 0;
    // Where the animals gather: three to five loose groups, outside the
    // open water.
    const groups: { x: number; y: number }[] = [];
    const nGroups = 3 + Math.floor(r() * 3);
    for (let g = 0; g < nGroups; g++) {
      for (let t = 0; t < 12; t++) {
        const gy = h * (0.12 + 0.74 * ((g + 0.15 + r() * 0.7) / nGroups));
        const along = r() < 0.55;
        const px0 = distToPathX(e.path, gy);
        const gx = clamp(along ? px0 + (r() < 0.5 ? -1 : 1) * w * (0.14 + r() * 0.14) : w * (0.12 + r() * 0.76), w * 0.12, w * 0.88);
        const inOpen = gx > open.x0 && gx < open.x1 && gy > open.y0 && gy < open.y1;
        if (!inOpen || t === 11) {
          groups.push({ x: gx, y: gy });
          break;
        }
      }
    }
    for (const p of water) {
      const sp = p.met.species;
      // Jelly-like animals are kept few, far and small, so the jellies
      // that are the blocks are the only jellies that read as the path.
      const bell = sp.genome.plan === 'bell';
      if (bell && !p.rare && ++bells > 3) continue;
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
      ty = clamp(ty, ya, yb);
      const dir: 1 | -1 = r() < 0.78 ? s.biome.env.current : s.biome.env.current === 1 ? -1 : 1;
      let gx: number | null = null;
      let gy: number | null = null;
      if (!p.rare) {
        let bestG: { x: number; y: number } | null = null;
        for (const g of groups) if (g.y >= ya - h * 0.06 && g.y <= yb + h * 0.06 && (!bestG || Math.abs(g.y - ty) < Math.abs(bestG.y - ty))) bestG = g;
        if (bestG && r() < 0.85) {
          gx = bestG.x;
          gy = clamp(bestG.y, ya, yb);
          ty = clamp(ty + (gy - ty) * 0.7, ya, yb);
        }
      }
      items.push({ pick: p, sp, layer, len, bw, bh, x: w / 2, y: ty, ty, ya, yb, dir, members, phase: r() * Math.PI * 2, floor: false, gx, gy });
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
        } else if (it.gx != null && r() < 0.8) {
          // In its group, loosely: the far ones spread wider.
          x = clampX(it.gx + gauss(r) * w * (it.layer === 0 ? 0.12 : 0.08), it, w);
          it.y = clamp(it.ty + gauss(r) * h * 0.035, it.ya, it.yb);
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
  const legal = (it: Item, others: Item[]): boolean => {
    const b = boxOf(it);
    if (boxGap(b, hero.box) < CLEAR) return false;
    if (inter(b, grow(e.winBox, 4)) > 0) return false;
    if (b.x0 < w * MARGIN - 0.5 || b.x1 > w * (1 - MARGIN) + 0.5 || b.y0 < h * MARGIN - 0.5 || b.y1 > h * (1 - MARGIN) + 0.5) return false;
    if (floorTop != null && b.y1 > floorTop) return false;
    for (const j of e.jellies) if (!j.hero && overlapShare(b, j.box) > 0.3) return false;
    for (const v of e.events) if (v.box && !v.far && overlapShare(b, v.box) > 0.3) return false;
    if (it.layer > 0) for (const k of e.rocks) if (k.plane > 0 && rockTouches(k, w, b, 2)) return false;
    for (const o of others) {
      if (o === it) continue;
      const tol = o.layer === it.layer ? 0.25 : 0.5;
      if (overlapShare(b, boxOf(o)) > tol) return false;
      // Two animals in the same plane never touch.
      if (o.layer === it.layer && it.layer > 0 && boxGap(b, boxOf(o)) < 3) return false;
    }
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
    for (let t = 0; t < (it.pick.rare ? 400 : 80) && !ok; t++) {
      const spread = 1 + t / 20;
      it.x = clampX(x0 + gauss(fr) * w * 0.08 * spread, it, w);
      it.y = clamp(y0 + gauss(fr) * h * 0.04 * spread, it.pick.rare ? Math.max(h * MARGIN, e.winBox.y1) + it.bh / 2 : it.ya, it.pick.rare ? (floorTop ?? h * (1 - MARGIN)) - it.bh / 2 : it.yb);
      ok = legal(it, kept);
    }
    if (ok) kept.push(it);
  }

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
  out.push(...floorFauna(onFloor, e, hero));
  // Far first, near last: the order they are painted in.
  out.sort((a, b) => a.layer - b.layer || a.y - b.y);
  return { cast: out, score: (best as { score: number }).score };
}

/**
 * What lives on the floor: at most four (two in a trench), scattered as a
 * Poisson disc at least 0.08 of the width apart, each at its own depth on the
 * floor, none big: no more than 0.06 S, nor more than 0.6 of the hero's bell.
 */
function floorFauna(picks: Pick[], e: CastEnv, hero: PlacedJelly): PlacedAnimal[] {
  if (!picks.length || e.floorY == null) return [];
  const { w, h } = e;
  const most = e.trench ? 2 : 4;
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
      const y = clamp(g + (r() - 0.35) * h * 0.04 - bh * 0.35, 0, h * (1 - MARGIN) - bh / 2);
      const box = { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 };
      if (avoid.some((b) => inter(b, box) > 0)) continue;
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
  // The open water stays open.
  const io = inter(b, c.open);
  if (io) cost += (io / a) * 1.6;
  cost += (Math.abs(it.y - it.ty) / e.h) * 1.5;
  if (it.gx != null && it.gy != null) cost += (Math.hypot(it.x - it.gx, (it.y - it.gy) * 1.5) / e.w) * 0.8;
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
  // Real calm water: one piece of it about a third of the page, not crumbs
  // of space between stickers.
  score += Math.max(0, 0.26 - largestClear(cells, G)) * 24;
  return score;
}

/** The largest rectangle of empty cells in a G x G grid, as a share of it. */
function largestClear(cells: Uint8Array, G: number): number {
  const heights = new Array<number>(G).fill(0);
  let best = 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) heights[x] = cells[y * G + x] ? 0 : heights[x] + 1;
    for (let x = 0; x < G; x++) {
      let minH = Infinity;
      for (let k = x; k < G && heights[k] > 0; k++) {
        minH = Math.min(minH, heights[k]);
        best = Math.max(best, minH * (k - x + 1));
      }
    }
  }
  return best / (G * G);
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

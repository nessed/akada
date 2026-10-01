/**
 * The picture, composed: where the depth falls on the page, the path the
 * jellies make down it, the ledges and rocks, the rare things, and a cast
 * placed round all of it by a small solver that tries many layouts and keeps
 * the best. Pure and deterministic: the same sitting and shape always come
 * out as the same plan.
 *
 * Everything here is in units of a reference page whose shorter side is
 * 1000, so a phone, a laptop and a poster are composed alike and only the
 * aspect changes the composition.
 */

import { buildAnatomy } from '../anatomy';
import type { Species } from '../biome';
import { depthAt, ZONES } from '../depth';
import type { EventKind, OceanEvent } from '../events';
import { moonPhase, sunFor } from '../light';
import { jellyForBlock } from '../lineage';
import { hash32, mulberry32, type Rand } from '../random';
import type { Met, Session } from './encode';

export const REF = 1000;
/** Nothing important closer to an edge than this share of the page. */
export const MARGIN = 0.06;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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
  box: Box;
}

export interface PlacedLedge {
  rest: number;
  /** The top of the rock, and which edge it juts from. */
  y: number;
  edge: -1 | 1;
  /** Share of the width it reaches across, and its thickness in units. */
  reach: number;
  thick: number;
  zone: number;
  seconds: number;
  seed: number;
  box: Box;
}

export interface PlacedRock {
  slot: number;
  y: number;
  edge: -1 | 1;
  reach: number;
  thick: number;
  zone: number;
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
  /** The way down, surface to the hero, as flat x, y points. */
  path: number[];
  jellies: PlacedJelly[];
  ledges: PlacedLedge[];
  rocks: PlacedRock[];
  kelp: { bottom: number } | null;
  floor: { y: number } | null;
  events: PlacedEvent[];
  cast: PlacedAnimal[];
  bubbles: { x: number; y: number; r: number }[];
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

function gauss(r: Rand): number {
  return (r() + r() + r() - 1.5) / 1.5;
}

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

  const floorY = s.floor ? h * (tall ? 0.885 : 0.87) : null;
  // Where the hero's bell hangs: the deepest point of the dive.
  const yEnd = h * (tall ? (s.floor ? 0.65 : 0.71) : s.floor ? 0.57 : 0.63);
  const yTop = h * 0.02;
  const yOf = (f: number) => yTop + ((yEnd - yTop) * roomAt(Math.min(F, f))) / roomF;

  // The depth dial down the page: surface to the deepest point, and a
  // little deeper below it.
  const zStops: { y: number; z: number }[] = [];
  const samples: { y: number; z: number }[] = [];
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
  // without sinking it, which is the flat of a ledge.
  const flip = (hash32(s.key, 'side') & 1) === 1 ? -1 : 1;
  const phase = 0.12 + ((hash32(s.key, 'phase') % 1000) / 1000) * 0.3;
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
  const xAt = (t: number) =>
    tall
      ? w * (0.5 + 0.17 * flip * Math.sin(Math.PI * 2 * (0.85 * t + phase)))
      : w * (0.15 + 0.64 * t + 0.035 * Math.sin(Math.PI * 2 * (1.1 * t + phase)));
  const path: number[] = [];
  const startX = xAt(0);
  path.push(startX, h * 0.05);
  for (let i = 1; i <= 240; i++) {
    const t = i / 240;
    path.push(xAt(t), Math.max(h * 0.05, yOf(focusAtU(t * U))));
  }
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

  // ---- The jellies: one per block, where the block ended; the last is the hero.
  const n = s.blocks.length;
  const heroR = tall ? 66 : 62;
  const jellies: PlacedJelly[] = [];
  const jellyBox = (j: { x: number; y: number; r: number; len: number; aspect: number }): Box => ({
    x0: j.x - j.r * 1.12,
    x1: j.x + j.r * 1.12,
    y0: j.y - j.r * 0.45 * j.aspect - j.r * 0.08,
    y1: j.y + j.r * 0.4 * j.aspect + j.len,
  });
  for (let i = 0; i < n; i++) {
    const hero = i === n - 1;
    const r = hero ? heroR : heroR * (0.4 + (0.32 * i) / Math.max(1, n - 1));
    const aspect = jellyForBlock(s.key, i).aspect;
    const len = r * (hero ? 2.9 : 2.5);
    let x = xAt(uOfBlockEnd(i) / U);
    let y = yOf(s.blocks[i].to);
    x = clamp(x, w * MARGIN + r * 1.15, w * (1 - MARGIN) - r * 1.15);
    y = clamp(y, h * MARGIN + r * 0.6 * aspect + 4, h * (1 - MARGIN) - len - r * 0.45 * aspect);
    const j = { block: i, x, y, r, len, aspect, hero, z: zAt(y), box: { x0: 0, y0: 0, x1: 0, y1: 0 } };
    j.box = jellyBox(j);
    jellies.push(j);
  }
  // A crowd of short blocks: the older ones give way, smaller and aside.
  for (let i = n - 2; i >= 0; i--) {
    const j = jellies[i];
    for (let tries = 0; tries < 12; tries++) {
      let worst = 0;
      let other: PlacedJelly | null = null;
      for (let k = i + 1; k < n; k++) {
        const o = overlapShare(j.box, jellies[k].box);
        if (o > worst) {
          worst = o;
          other = jellies[k];
        }
      }
      if (worst < 0.12 || !other) break;
      if (j.r > heroR * 0.3) {
        j.r *= 0.9;
        j.len = j.r * 2.5;
      } else {
        const away = j.x < other.x ? -1 : 1;
        j.x = clamp(j.x + away * j.r * 0.8, w * MARGIN + j.r * 1.15, w * (1 - MARGIN) - j.r * 1.15);
      }
      j.box = jellyBox(j);
    }
  }

  // ---- The ledges: one per break, under where the jelly rested, wider for a longer rest.
  const ledges: PlacedLedge[] = [];
  for (const r of s.rests) {
    const j = r.after >= 0 ? jellies[r.after] : null;
    const jx = j ? j.x : startX;
    const top = j ? j.box.y1 + h * 0.012 : h * 0.12;
    const edge: -1 | 1 = jx < w / 2 ? -1 : 1;
    const toJelly = edge < 0 ? jx / w : 1 - jx / w;
    const reach = clamp(toJelly + 0.03 + 0.12 * Math.min(1, r.seconds / 1800), 0.14, 0.7);
    const y = clamp(top, h * 0.1, h * 0.9);
    const thick = h * (0.035 + 0.02 * Math.min(1, r.seconds / 1800));
    const zone = depthAt(r.at).zone;
    ledges.push({
      rest: r.index,
      y,
      edge,
      reach,
      thick,
      zone,
      seconds: r.seconds,
      seed: hash32(s.key, 'ledge', r.index),
      box: edge < 0 ? { x0: 0, x1: reach * w, y0: y - 46, y1: y + thick * 0.45 } : { x0: w - reach * w, x1: w, y0: y - 46, y1: y + thick * 0.45 },
    });
  }

  // ---- The kelp at the top, the rocks at their depths, the floor.
  const kelp = s.kelp ? { bottom: clamp(yOf(11.6 * 60) + h * 0.06, h * 0.3, h * 0.8) } : null;
  const rocks: PlacedRock[] = [];
  for (const { outcrop: o, at } of s.rocks) {
    if (rocks.length >= 3) break;
    const y = yOf(at);
    if (y < h * 0.12 || y > (floorY ?? h) - h * 0.08) continue;
    const thick = h * clamp(o.thick * 0.35, 0.035, 0.06);
    const box: Box = o.edge < 0 ? { x0: 0, x1: o.reach * w, y0: y - 60, y1: y + thick * 0.45 } : { x0: w - o.reach * w, x1: w, y0: y - 60, y1: y + thick * 0.45 };
    const near = [...ledges.map((l) => l.y), ...rocks.map((k) => k.y)].some((ly) => Math.abs(ly - y) < h * 0.1);
    const clash = near || jellies.some((k) => inter(k.box, box) > 0);
    if (clash) continue;
    if (kelp && y < kelp.bottom && o.zone === 0) continue;
    rocks.push({ slot: o.slot, y, edge: o.edge, reach: o.reach, thick, zone: o.zone, box });
  }
  const floor = floorY != null ? { y: floorY } : null;

  // ---- The rare things, at the depth they happened.
  const pathXAt = (y: number) => {
    let best = startX;
    let d = Infinity;
    for (let i = 0; i < path.length; i += 2) {
      const dd = Math.abs(path[i + 1] - y);
      if (dd < d) {
        d = dd;
        best = path[i];
      }
    }
    return best;
  };
  const awaySide = (y: number) => (pathXAt(y) < w / 2 ? 1 : -1);
  const events: PlacedEvent[] = [];
  const seen = new Set<EventKind>();
  const M = Math.min(w, h);
  for (const e of s.events) {
    if (seen.has(e.kind)) continue;
    seen.add(e.kind);
    const pe = placeEvent(e, yOf(e.start), { w, h, M, floorY, current: s.biome.env.current, awaySide, jellies });
    if (!pe) continue;
    // Something seen in the water keeps clear of the rocks and the jellies:
    // moved up or down the least it takes, which keeps it near its depth.
    if (pe.box && pe.kind !== 'whalefall' && pe.kind !== 'turtle') {
      const solid = [...ledges.map((l) => l.box), ...rocks.map((k) => k.box), ...jellies.map((j) => j.box), ...events.flatMap((v) => (v.box ? [v.box] : []))];
      let best = 0;
      let bestHit = Infinity;
      for (let k = 0; k <= 30; k++) {
        const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h * 0.012;
        const b = { ...pe.box, y0: pe.box.y0 + dy, y1: pe.box.y1 + dy };
        if (b.y0 < h * MARGIN * (pe.edge ? 0 : 1) || b.y1 > (floorY ?? h * (1 - MARGIN))) continue;
        const hit = solid.reduce((a, o) => a + inter(o, b), 0);
        if (hit < bestHit - 1e-6) {
          bestHit = hit;
          best = dy;
        }
        if (hit === 0) break;
      }
      pe.ry += best;
      pe.y += best;
      pe.box = { ...pe.box, y0: pe.box.y0 + best, y1: pe.box.y1 + best };
    }
    events.push(pe);
  }

  // ---- The cast.
  const cast = solveCast(s, { w, h, M, rnd, seed, yOf, F, floorY, jellies, ledges, rocks, events, path, kelp, kelpEdges: s.kelp ? kelpEdges(s.key) : [] });

  // ---- The bubbles: a faint trail rising off the way down, never a line.
  const bubbles = trail(path, jellies, ledges, mulberry32(hash32(seed, 'bubbles')), h);

  const date = new Date(s.startMs);
  const sun = sunFor(s.hour);
  const winR = tall ? w * 0.16 : w * 0.1;
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
    // Clear of the kelp at the sides, when the sitting began in it.
    window: { x: clamp(startX, Math.max(winR * 1.4, s.kelp ? w * 0.26 : 0), Math.min(w - winR * 1.4, s.kelp ? w * 0.74 : w)), y: winR * 1.02 + h * 0.012, r: winR },
    path,
    jellies,
    ledges,
    rocks,
    kelp,
    floor,
    events,
    cast: cast.cast,
    bubbles,
    fit: cast.score,
  };
}

/** Which edges the sitting's kelp stands at (rolled the way `rollKelp` rolls them). */
function kelpEdges(key: string): (-1 | 1)[] {
  const r = mulberry32(hash32(key, 'kelp'));
  const u = r();
  return u < 0.4 ? [-1, 1] : u < 0.7 ? [-1] : [1];
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
}

function placeEvent(e: OceanEvent, y: number, o: EventEnv): PlacedEvent | null {
  const { w, h, M } = o;
  const side = o.awaySide(y);
  const base = { kind: e.kind, seed: e.seed, start: e.start, mirror: false, edge: false } as const;
  const sd = e.seed;
  switch (e.kind) {
    case 'whale': {
      const rh = h * 0.5;
      const len = Math.max(w, rh) * 0.62;
      const ny = rh * (0.1 + (((sd >>> 8) % 100) / 100) * 0.12);
      const want = w * (side > 0 ? 0.62 : 0.38);
      const travel = w + len * 2;
      const age = o.current > 0 ? (want + len) / travel : (w + len - want) / travel;
      const ry = clamp(y, h * 0.08, h * 0.45) - ny;
      return { ...base, age: clamp(age, 0.15, 0.85), rx: 0, ry, rw: w, rh, x: want, y: ry + ny, far: true, box: null };
    }
    case 'leviathan': {
      const top = clamp(y - h * 0.3, h * 0.25, h * 0.7);
      return { ...base, age: 0.5, rx: 0, ry: top, rw: w, rh: h - top + 20, x: w / 2, y: top + (h - top) * 0.5, far: true, box: null };
    }
    case 'storm': {
      // The haze is a gradient laid over the whole of the region it is
      // given, so the region is made square and big enough that the haze has
      // faded to nothing well inside it: its reach is a fixed share of the
      // region early on (age 0.1), and its middle never nearer an edge than
      // a quarter of it.
      const reach = Math.min(w, h) * 0.32;
      const R = reach / (0.2 + 0.35 * 0.1);
      const nx = R * (0.25 + (((sd >>> 4) % 100) / 100) * 0.5);
      const ny = R * (0.35 + (((sd >>> 12) % 100) / 100) * 0.35);
      const want = w * (side > 0 ? 0.68 : 0.32);
      return { ...base, age: 0.1, rx: want - nx, ry: y - ny, rw: R, rh: R, x: want, y, far: true, box: null };
    }
    case 'siphonophore': {
      const rh = h * 0.5;
      const ry = clamp(y - rh / 2, 0, h - rh);
      return { ...base, age: 0.5, rx: 0, ry, rw: w, rh, x: w / 2, y: ry + rh / 2, far: true, box: null };
    }
    case 'eye': {
      const rh = M * 0.42;
      const r = 0.2 * Math.min(w, rh);
      const left = sd % 2 === 0;
      const ny = rh * (0.18 + (((sd >>> 6) % 100) / 100) * 0.2);
      const ry = clamp(y, h * 0.15, h * 0.85) - ny;
      const mirror = (left ? -1 : 1) !== side;
      const onLeft = left !== mirror;
      // Further in than the live screen puts it: a print can spare the room.
      const rx = onLeft ? r * 0.6 : -r * 0.6;
      const box: Box = onLeft ? { x0: 0, x1: r * 1.5, y0: ry + ny - r * 1.2, y1: ry + ny + r * 1.2 } : { x0: w - r * 1.5, x1: w, y0: ry + ny - r * 1.2, y1: ry + ny + r * 1.2 };
      return { ...base, age: 0.4, rx, ry, rw: w, rh, mirror, x: onLeft ? r * 0.3 : w - r * 0.3, y: ry + ny, far: false, box, edge: true };
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
      const gap = Math.max(0.2 * w, L * 1.15);
      // Mirrored if it would otherwise be off the page.
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
      const D = Math.min(w, rh) * 0.042;
      return { ...base, age: 0.5, rx: 0, ry, rw: w, rh, mirror, x, y: ry + ny, far: false, box: { x0: x - D * 3, x1: x + D * 3, y0: ry + ny - D * 2, y1: Math.min(h, ry + rh) } };
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
      const box: Box = onRight ? { x0: want - 0.1 * L, x1: want + L * 0.98, y0: yy - L * 0.25, y1: yy + L * 0.55 } : { x0: want - L * 0.98, x1: want + 0.1 * L, y0: yy - L * 0.25, y1: yy + L * 0.55 };
      return { ...base, age: 0.54, rx: want - natX, ry: yy - ny, rw: w, rh, mirror, x: want, y: yy, far: false, box };
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
      const rand = mulberry32(sd ^ 0x3a1ef);
      rand();
      const cx = w * (0.375 + rand() * 0.25);
      const L = w * 0.45;
      return { ...base, age: 1, rx: 0, ry: 0, rw: w, rh: h, x: cx, y: o.floorY, far: false, box: { x0: cx - L / 2, x1: cx + L / 2, y0: o.floorY - L * 0.11, y1: o.floorY + 4 } };
    }
  }
  return null;
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
  jellies: PlacedJelly[];
  ledges: PlacedLedge[];
  rocks: PlacedRock[];
  events: PlacedEvent[];
  path: number[];
  kelp: { bottom: number } | null;
  kelpEdges: (-1 | 1)[];
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
  const want = Math.min(met.length, Math.round(clamp(18 + fmin * 0.12, 20, 35)));
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

const LAYER_LEN: [number, number][] = [
  [40, 56],
  [66, 90],
  [110, 140],
];
const LAYER_ALPHA = [0.62, 0.88, 1];

function solveCast(s: Session, e: CastEnv): { cast: PlacedAnimal[]; score: number } {
  const picks = curate(s);
  if (!picks.length) return { cast: [], score: 0 };
  const { w, h } = e;
  const mx = w * MARGIN;
  const my = h * MARGIN;
  const fixed: { box: Box; weight: number }[] = [
    ...e.jellies.map((j) => ({ box: j.box, weight: 4 })),
    ...e.ledges.map((l) => ({ box: l.box, weight: 1.5 })),
    ...e.rocks.map((r) => ({ box: r.box, weight: 1.2 })),
    ...e.events.filter((v) => v.box).map((v) => ({ box: v.box as Box, weight: 2.5 })),
  ];
  if (e.kelp) {
    for (const edge of e.kelpEdges) {
      fixed.push({ box: edge < 0 ? { x0: 0, x1: w * 0.2, y0: 0, y1: e.kelp.bottom } : { x0: w * 0.8, x1: w, y0: 0, y1: e.kelp.bottom }, weight: 0.5 });
    }
  }
  const floorTop = e.floorY;
  const jellyHero = e.jellies[e.jellies.length - 1];

  const K = 28;
  let best: { items: Item[]; score: number } | null = null;
  for (let c = 0; c < K; c++) {
    const r = mulberry32(hash32(e.seed, 'layout', c));
    const items: Item[] = [];
    let near = 0;
    let bells = 0;
    for (const p of picks) {
      const sp = p.met.species;
      // Jelly-like animals are kept few, far and small, so the jellies
      // that are the blocks are the only jellies that read as the path.
      const bell = sp.genome.plan === 'bell';
      if (bell && !p.rare && ++bells > 3) continue;
      const floor = sp.floor && floorTop != null;
      let layer: 0 | 1 | 2;
      if (p.rare) layer = 2;
      else if (floor) layer = 1;
      else {
        const rare = clamp((1 / sp.abundance - 2) / 11, 0, 1);
        const u = r();
        layer = u < 0.08 + 0.12 * rare && near < 3 && !sp.school && !bell ? 2 : u < 0.55 && !bell ? 1 : 0;
        if (sp.school && layer === 2) layer = 1;
      }
      if (layer === 2 && !p.rare) near++;
      const [a, b] = LAYER_LEN[layer];
      const size = clamp(Math.sqrt(sp.genome.size), 0.8, 1.2);
      let len = (a + (b - a) * r()) * size;
      if (p.rare) len = Math.max(125, (150 + 30 * r()) * size * (bell ? 0.85 : 1));
      if (floor) len = p.rare ? 125 : 40 + 20 * r();
      const prop = proportions(sp);
      let bw = len * prop.w;
      let bh = len * prop.h;
      let members: PlacedAnimal['members'] = null;
      if (sp.school) {
        const m = Math.min(sp.school, layer === 0 ? 7 : 9);
        members = [];
        const ml = len * 0.62;
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
      if (floor && floorTop != null) {
        ya = floorTop + bh * 0.1;
        yb = Math.min(h * (1 - MARGIN) - bh / 2, floorTop + h * 0.05);
        ty = (ya + yb) / 2;
      }
      ya = clamp(ya, my + bh / 2, h - my - bh / 2);
      yb = clamp(yb, ya, h - my - bh / 2);
      if (floorTop != null && !floor) {
        yb = Math.min(yb, floorTop - bh / 2);
        ya = Math.min(ya, yb);
      }
      ty = clamp(ty, ya, yb);
      const dir: 1 | -1 = r() < 0.78 ? s.biome.env.current : s.biome.env.current === 1 ? -1 : 1;
      items.push({ pick: p, sp, layer, len, bw, bh, x: w / 2, y: ty, ty, ya, yb, dir, members, phase: r() * Math.PI * 2, floor });
    }

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
      for (let t = 0; t < 16; t++) {
        let x: number;
        if (it.pick.rare && jellyHero) {
          // The best spot: near the path, beside a jelly, off the bell.
          const side = r() < 0.5 ? -1 : 1;
          const py = clamp(it.ty + gauss(r) * h * 0.04, it.ya, it.yb);
          x = clampX(distToPathX(e.path, py) + side * (w * (0.16 + r() * 0.12)), it, w);
          it.y = py;
        } else {
          x = mx + it.bw / 2 + r() * Math.max(0, w - 2 * mx - it.bw);
          it.y = clamp(it.ty + gauss(r) * h * 0.035, it.ya, it.yb);
        }
        it.x = x;
        const cost = itemCost(it, placed, fixed, e, true);
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
    const score = layoutScore(items, fixed, e);
    if (!best || score < best.score) best = { items, score };
  }

  const out = (best as { items: Item[]; score: number }).items.map<PlacedAnimal>((it) => ({
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
    floor: it.floor,
    members: it.members,
    phase: it.phase,
    box: boxOf(it),
  }));
  // Far first, near last: the order they are painted in.
  out.sort((a, b) => a.layer - b.layer || a.y - b.y);
  return { cast: out, score: (best as { score: number }).score };
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

function itemCost(it: Item, others: Item[], fixed: { box: Box; weight: number }[], e: CastEnv, placing: boolean): number {
  const b = boxOf(it);
  const a = Math.max(1, area(b));
  let cost = 0;
  for (const o of others) {
    if (o === it) continue;
    const i = inter(b, boxOf(o));
    if (i) cost += (i / Math.min(a, Math.max(1, o.bw * o.bh))) * 3 * LAYER_MIX[it.layer][o.layer];
    // A little room round each, so they read as separate animals.
    const gx = Math.max(0, Math.abs(it.x - o.x) - (it.bw + o.bw) / 2);
    const gy = Math.max(0, Math.abs(it.y - o.y) - (it.bh + o.bh) / 2);
    const gap = Math.hypot(gx, gy);
    const want = 0.25 * Math.min(it.len, o.len);
    if (gap < want) cost += ((want - gap) / want) * 0.25;
  }
  for (const f of fixed) {
    const i = inter(b, f.box);
    if (i) cost += (i / a) * f.weight * 3;
  }
  cost += (Math.abs(it.y - it.ty) / e.h) * 1.5;
  if (it.layer > 0 && !it.pick.rare) {
    // Keep the way down clear: the jellies and their bubbles read as the path.
    const d = distToPath(e.path, it.x, it.y);
    const want = it.bw / 2 + e.w * 0.04;
    if (d < want) cost += ((want - d) / want) * 0.6;
  }
  if (it.pick.rare) {
    const d = distToPath(e.path, it.x, it.y);
    cost += Math.abs(d - e.w * (it.sp.genome.plan === 'bell' ? 0.3 : 0.2)) / e.w;
  }
  if (placing) {
    // Spread across the page: a gentle pull away from the crowded side.
    let lean = 0;
    for (const o of others) if (o !== it) lean += Math.sign(o.x - e.w / 2) * o.bw * o.bh;
    cost += (Math.sign(it.x - e.w / 2) * lean) / (e.w * e.h) * 2;
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

function layoutScore(items: Item[], fixed: { box: Box; weight: number }[], e: CastEnv): number {
  let score = 0;
  for (const it of items) score += itemCost(it, items, fixed, e, false);
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
  if (mass > 0) score += Math.abs(mx / mass - e.w / 2) / e.w * 6;
  // Open water: a coarse grid, and how much of it anything stands in.
  const G = 12;
  const cells = new Uint8Array(G * G);
  const all = [...items.map(boxOf), ...fixed.map((f) => f.box)];
  for (const b of all) {
    for (let gy = Math.max(0, Math.floor((b.y0 / e.h) * G)); gy <= Math.min(G - 1, Math.floor((b.y1 / e.h) * G)); gy++) {
      for (let gx = Math.max(0, Math.floor((b.x0 / e.w) * G)); gx <= Math.min(G - 1, Math.floor((b.x1 / e.w) * G)); gx++) cells[gy * G + gx] = 1;
    }
  }
  let filled = 0;
  for (const c of cells) filled += c;
  const open = 1 - filled / (G * G);
  if (open < 0.34) score += (0.34 - open) * 20;
  // No great empty tract either: a third of the page left as water is
  // breathing room, a whole ninth of it with nothing in it is a hole.
  for (let by = 0; by < 3; by++) {
    for (let bx = 0; bx < 3; bx++) {
      let n = 0;
      for (let gy = by * 4; gy < by * 4 + 4; gy++) for (let gx = bx * 4; gx < bx * 4 + 4; gx++) n += cells[gy * G + gx];
      if (n === 0) score += 1.2;
      else if (n === 1) score += 0.4;
    }
  }
  return score;
}

/* ---- The bubbles ---- */

function trail(path: number[], jellies: PlacedJelly[], ledges: PlacedLedge[], r: Rand, h: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  let carry = 0;
  for (let i = 2; i < path.length; i += 2) {
    const x0 = path[i - 2];
    const y0 = path[i - 1];
    const x1 = path[i];
    const y1 = path[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0);
    // Only where it was sinking: at rest on a ledge nothing rises.
    if (y1 - y0 < d * 0.25) continue;
    carry += d;
    while (carry > 22) {
      carry -= 22 + r() * 18;
      const t = r();
      const x = x0 + (x1 - x0) * t + gauss(r) * 9;
      const y = y0 + (y1 - y0) * t + gauss(r) * 6;
      if (jellies.some((j) => Math.abs(x - j.x) < j.r * 1.2 && y > j.y - j.r && y < j.y + j.r * 0.8)) continue;
      if (ledges.some((l) => x > l.box.x0 && x < l.box.x1 && y > l.box.y0 && y < l.box.y1)) continue;
      if (y < h * 0.04) continue;
      const big = r() < 0.12;
      out.push({ x, y, r: big ? 4.5 + r() * 3 : 1.8 + r() * 2.2 });
      // Now and then a short string of them, rising.
      if (r() < 0.2) {
        for (let k = 1; k <= 2 + Math.floor(r() * 3); k++) out.push({ x: x + gauss(r) * 3, y: y - k * (10 + r() * 7), r: 1.3 + r() * 1.8 });
      }
    }
  }
  return out;
}

/**
 * A genome turned into a body, in the creature's own units.
 *
 * Every creature is built as a set of layers of plain shapes (outlines,
 * strokes and discs), each layer drawn later in one style: the body wash,
 * the fins, the tentacles, the pattern, the glowing dots. Bilateral animals
 * are built along a spine from tail (x = 0) to head (x = 100), facing right;
 * radial ones around their own middle. Nothing here knows about pixels or a
 * canvas, so the same body can be drawn at any size, or tested for sense.
 *
 * A plan gets only its own parts: a squid's arms grow from a squid's head,
 * never a fish's, and a fish's barbels never come with a crawler's legs, so
 * whatever the dice say, the animal is one animal. The bodies are drawn the
 * way a plate draws them, not a diagram: tentacles hang at their own lengths
 * and curl their own ways, a star's arms are never a pinwheel, an eel is one
 * body from its snout to the point of its tail.
 */

import type { Genome } from './genome';
import { mulberry32, range } from './random';

export type LayerName =
  | 'glowBack'
  | 'tentB'
  | 'legs'
  | 'limb'
  | 'fin'
  | 'finRay'
  | 'rays'
  | 'body'
  | 'gape'
  | 'teeth'
  | 'gonad'
  | 'guts'
  | 'gutFill'
  | 'pat'
  | 'patLine'
  | 'lines'
  | 'detail'
  | 'rowB'
  | 'rowF'
  | 'tentF'
  | 'barbel'
  | 'beads'
  | 'nodes'
  | 'dotGlow'
  | 'dots'
  | 'eye'
  | 'pupil'
  | 'lure';

export const LAYERS: LayerName[] = [
  'glowBack', 'tentB', 'legs', 'limb', 'fin', 'finRay', 'rays', 'body', 'gape', 'teeth', 'gonad', 'guts', 'gutFill', 'pat', 'patLine',
  'lines', 'detail', 'rowB', 'rowF', 'tentF', 'barbel', 'beads', 'nodes', 'dotGlow', 'dots', 'eye', 'pupil', 'lure',
];

/**
 * The fine work an engraver adds only when the drawing is big: the rays in
 * a fin, the lateral line's pores and the gill cover, the stinging cells
 * along a tentacle and the suckers on an arm, the knobs on a star. They are
 * made from the genome like everything else, but with dice of their own, so
 * adding them never moves a line the animal already had, and they sit
 * inside it, so they are left out of its bounds.
 */
export const FINE: ReadonlySet<LayerName> = new Set<LayerName>(['rays', 'lines', 'nodes']);

export type Shape =
  | { kind: 'path'; pts: number[]; close: boolean }
  | { kind: 'disc'; x: number; y: number; rx: number; ry: number };

/** A body (or an arm of one) as its two edges sampled in step: see `Tube` in pen.ts. */
export interface Tube {
  a: number[];
  b: number[];
}

export interface Anatomy {
  layers: Record<LayerName, Shape[]>;
  /** The solid bodies as tubes, for the wash graded across them and the contour hatching. */
  tubes: Tube[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** How many of the first `finRay` lines are the tail's: the fine `rays`
      draw those better, so a big drawing leaves them out. */
  tailRays: number;
}

type Pt = [number, number];
type PathFn = (layer: LayerName, pts: Pt[], close?: boolean) => void;
type DiscFn = (layer: LayerName, x: number, y: number, rx: number, ry?: number) => void;
type Rng = (a: number, b: number) => number;

interface Kit {
  P: PathFn;
  C: DiscFn;
  T: (a: Pt[], b: Pt[]) => void;
  /** The body's own dice. */
  rr: Rng;
  /** The fine work's dice. */
  fine: Rng;
  /** The dice for how loosely a part hangs: its own, so the rest stays put. */
  vr: Rng;
}

const TAU = Math.PI * 2;

export function buildAnatomy(g: Genome, seed: number): Anatomy {
  const r = mulberry32(seed * 104729 + 7);
  const fr = mulberry32(seed * 7368787 + 101);
  const lr = mulberry32(seed * 2654435 + 977);
  const layers = Object.fromEntries(LAYERS.map((k) => [k, [] as Shape[]])) as Record<LayerName, Shape[]>;
  const tubes: Tube[] = [];
  const k: Kit = {
    P: (layer, pts, close = false) => {
      if (pts.length < 2) return;
      const flat: number[] = [];
      for (const [x, y] of pts) flat.push(x, y);
      layers[layer].push({ kind: 'path', pts: flat, close });
    },
    C: (layer, x, y, rx, ry = rx) => layers[layer].push({ kind: 'disc', x, y, rx, ry }),
    T: (a, b) => tubes.push({ a: a.flat(), b: b.flat() }),
    rr: (a, b) => range(r, a, b),
    fine: (a, b) => range(fr, a, b),
    vr: (a, b) => range(lr, a, b),
  };
  let tailRays = 0;
  if (g.plan === 'bell') bell(g, k);
  else if (g.plan === 'comb') comb(g, k);
  else if (g.plan === 'star') star(g, k);
  else if (g.plan === 'chain') chain(g, k);
  else tailRays = bilateral(g, k);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const name of LAYERS) {
    if (name === 'glowBack' || name === 'dotGlow' || FINE.has(name)) continue;
    for (const s of layers[name]) {
      if (s.kind === 'disc') {
        minX = Math.min(minX, s.x - s.rx);
        maxX = Math.max(maxX, s.x + s.rx);
        minY = Math.min(minY, s.y - s.ry);
        maxY = Math.max(maxY, s.y + s.ry);
      } else {
        for (let i = 0; i < s.pts.length; i += 2) {
          minX = Math.min(minX, s.pts[i]);
          maxX = Math.max(maxX, s.pts[i]);
          minY = Math.min(minY, s.pts[i + 1]);
          maxY = Math.max(maxY, s.pts[i + 1]);
        }
      }
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -1;
    minY = -1;
    maxX = 1;
    maxY = 1;
  }
  return { layers, tubes, minX, minY, maxX, maxY, tailRays };
}

/* ---- Helpers ---- */

/** A point a share `t` of the way along a polyline, by length. */
function along(line: Pt[], t: number): Pt {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < line.length; i++) {
    const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (want <= d || i === line.length - 1) {
      const q = d > 0 ? Math.min(1, want / d) : 0;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * q, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * q];
    }
    want -= d;
  }
  return line[line.length - 1];
}

function lengthOf(line: Pt[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return total;
}

/** Rays fanning from a root to an edge, stopping a little short of it. */
function fanRays(P: PathFn, root: Pt, edge: Pt[], n: number) {
  for (let q = 1; q < n; q++) {
    const [ex, ey] = along(edge, q / n);
    P('rays', [root, [root[0] + (ex - root[0]) * 0.35, root[1] + (ey - root[1]) * 0.35], [root[0] + (ex - root[0]) * 0.93, root[1] + (ey - root[1]) * 0.93]]);
  }
}

/** Rays across a fin from its base to its edge, the two read in step. */
function pairRays(P: PathFn, base: Pt[], edge: Pt[], n: number) {
  for (let q = 0; q <= n; q++) {
    const t = 0.04 + (q / n) * 0.92;
    const [bx, by] = along(base, t);
    const [ex, ey] = along(edge, t);
    P('rays', [[bx, by], [bx + (ex - bx) * 0.5, by + (ey - by) * 0.5], [bx + (ex - bx) * 0.94, by + (ey - by) * 0.94]]);
  }
}

/**
 * A soft, uneven blob: a dab of wash, not a stamped circle. Longer along
 * `angle` than across it.
 */
function blob(x: number, y: number, rx: number, ry: number, angle: number, vr: Rng, n = 9): Pt[] {
  const out: Pt[] = [];
  const ph = vr(0, TAU);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + 0.14 * Math.sin(a * 2 + ph) + vr(-0.12, 0.12);
    const u = Math.cos(a) * rx * k;
    const v = Math.sin(a) * ry * k;
    out.push([x + u * c - v * s, y + u * s + v * c]);
  }
  return out;
}

/**
 * A strand that hangs: a walk from its root, heading `dir` and drifting,
 * with its own wave, and, for some, a curl at the tip. Points every `step`.
 */
function hang(x0: number, y0: number, len: number, dir: number, o: { wave: number; freq: number; ph: number; curl: number; drift: number }, step = 3): Pt[] {
  const line: Pt[] = [[x0, y0]];
  let x = x0;
  let y = y0;
  for (let s = step; s <= len; s += step) {
    const t = s / len;
    const a = dir + o.drift * t + Math.sin(s * o.freq + o.ph) * o.wave * Math.min(1, s / 18) + (t > 0.72 ? o.curl * Math.pow((t - 0.72) / 0.28, 2) : 0);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    line.push([x, y]);
  }
  return line;
}

/** Marks along a strand at an uneven spacing, from its own phase. */
function marks(line: Pt[], spacing: number, vr: Rng, put: (p: Pt, t: number) => void, from = 0.08) {
  const total = lengthOf(line);
  if (total <= 0) return;
  let d = vr(0, spacing) + total * from;
  while (d < total * 0.97) {
    put(along(line, d / total), d / total);
    d += spacing * vr(0.75, 1.25);
  }
}

/* ---- The radial plans ---- */

function bell(g: Genome, { P, C, vr, fine }: Kit) {
  // A dome, its sides always curving in toward the rim: never the straight
  // walls of a lampshade, never taller than a little over its width.
  // Never a saucer with a brim either: at least a shallow dome deep, and
  // the sides never flaring out at the rim.
  const bw = g.bw!, bh = Math.max(g.bw! * 0.42, Math.min(g.bh!, g.bw! * 1.05));
  const shape = Math.max(1, Math.min(1.6, g.shape!));
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI - (i / 40) * Math.PI;
    const x = Math.cos(a) * bw;
    // A cap rises out of the dome as one swell, not a knob set on it.
    const peak = g.cap ? 1 + 0.12 * Math.max(0, 1 - Math.pow(x / (bw * 0.4), 2)) : 1;
    pts.push([x, bh - Math.pow(Math.max(0, Math.sin(a)), shape) * bh * peak]);
  }
  const n = Math.max(1, g.lobes!);
  // The margin seen a little from below: its near half bows down, so the
  // rim is the front of an ellipse and not a ruled line.
  const bow = Math.min(6, bh * 0.14) * 0.8;
  for (let i = 1; i <= n * 4; i++) {
    const x = bw - (i / (n * 4)) * 2 * bw;
    const near = bow * Math.sqrt(Math.max(0, 1 - Math.pow(x / bw, 2)));
    // Scallops, never a saw: each no deeper than a third of its width.
    const dip = g.lobes ? Math.abs(Math.sin((i / 4) * Math.PI)) * Math.min(6, bw * 0.12, ((2 * bw) / n) * 0.33) : 0;
    pts.push([x, bh + dip + near]);
  }
  P('body', pts, true);
  C('glowBack', 0, bh * 0.55, bw * 1.3, bh * 1.1);
  for (let i = 0; i < g.canals!; i++) {
    const x = (-bw * 0.85 + (i / Math.max(1, g.canals! - 1)) * bw * 1.7) * vr(0.94, 1.04);
    P('detail', [[x * 0.08, bh * 0.2], [x * 0.6 + vr(-1, 1), bh * 0.45], [x, bh - 1]]);
  }
  P('detail', [[-bw * 0.85, bh], [-bw * 0.5, bh * 0.55], [0, bh * 0.45], [bw * 0.5, bh * 0.55], [bw * 0.85, bh]]);
  // The gonads, seen through the bell: soft folded loops, each its own shape.
  for (let i = 0; i < g.rings!; i++) {
    const a = (i / g.rings!) * TAU + 0.4 + vr(-0.15, 0.15);
    const m = Math.min(bw, bh);
    const cx = Math.cos(a) * bw * 0.3;
    const cy = bh * 0.6 + Math.sin(a) * bh * 0.13;
    const side = 0.55 + 0.45 * Math.abs(Math.sin(a));
    P('gonad', blob(cx, cy, m * 0.12 * side, m * 0.075, vr(-0.4, 0.4), vr, 11), true);
  }
  // The tentacles: round the rim in perspective, the near ones lower, each
  // at its own length, spacing and wave, and a few curled at the tip.
  const rimD = Math.min(6, bh * 0.14);
  const N = g.tentN!;
  const beadOn = new Set<number>();
  const nodeOn = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (vr(0, 1) < 0.34) beadOn.add(i);
    if (vr(0, 1) < 0.34) nodeOn.add(i);
  }
  if (g.tentStyle === 'beaded' && !beadOn.size) beadOn.add(Math.floor(N / 2));
  for (let i = 0; i < N; i++) {
    const th = ((i + vr(-0.35, 0.35)) / N) * TAU + 0.3;
    const x0 = Math.cos(th) * bw * 0.93;
    const y0 = bh + Math.sin(th) * rimD;
    const L = g.tentL! * (0.32 + 0.68 * Math.pow(vr(0, 1), 0.6));
    const style = g.tentStyle;
    const wave = style === 'straight' ? vr(0.02, 0.06) : style === 'coiled' ? vr(0.25, 0.45) : vr(0.08, 0.22);
    const freq = style === 'coiled' ? vr(0.18, 0.3) : vr(0.05, 0.11);
    const curl = vr(0, 1) < 0.3 ? vr(1.2, 3) * (vr(0, 1) < 0.5 ? -1 : 1) : 0;
    const line = hang(x0, y0, L, Math.PI / 2 + (x0 / bw) * 0.12, { wave, freq, ph: vr(0, TAU), curl, drift: vr(-0.25, 0.25) });
    P('tentB', line);
    if (nodeOn.has(i)) marks(line, 9, fine, ([x, y], t) => C('nodes', x, y, 0.25 + 0.55 * (1 - t)));
    if (style === 'beaded' && beadOn.has(i)) marks(line, 15, vr, ([x, y], t) => C('beads', x, y, 1.25 * (1 - 0.4 * t)), 0.12);
    if (g.lit && vr(0, 1) < 0.5 && line.length) {
      const e = line[line.length - 1];
      C('dotGlow', e[0], e[1], 3);
      C('dots', e[0], e[1], 1.2);
    }
  }
  for (let i = 0; i < g.arms!; i++) {
    const x0 = (i - (g.arms! - 1) / 2) * bw * 0.12;
    const L = g.tentL! * g.armL! * vr(0.8, 1.1);
    const ph = vr(0, TAU);
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let s = 0; s <= L; s += 3) {
      const x = x0 + Math.sin(s / 20 + ph) * 6 + (x0 * s) / 60;
      const w = bw * 0.12 * (1 - s / L) * (0.4 + 0.6 * Math.abs(Math.cos(s / 12 + ph))) + 0.5;
      left.push([x - w - Math.abs(Math.sin(s / 2.5 + ph)) * 1.2, bh - 2 + s]);
      right.unshift([x + w, bh - 2 + s]);
    }
    P('fin', left.concat(right), true);
  }
  if (g.lit) {
    for (let i = 0; i < 10; i++) {
      const x = (-bw + (i / 9) * 2 * bw) * vr(0.95, 1);
      C('dotGlow', x, bh + 1, 3);
      C('dots', x, bh + 1, 1.1);
    }
  }
}

/**
 * A comb jelly: a soft lobed body a little off true, never an egg, with its
 * eight rows of beating combs running pole to mouth, the near ones plain and
 * the far ones seen faint through it, and the gonads lying along them.
 */
function comb(g: Genome, { P, C, vr }: Kit) {
  // Never a cigar: at least a third as wide as it is long.
  const oh = g.oh!, ow = Math.max(g.ow!, oh * 0.36);
  const lean = vr(-0.09, 0.09);
  const lobes = g.lobed;
  // The right half's outline from the pole down, as shares of the half-width
  // and half-height: a lobate one's two lobes hang below a notch, a sac-like
  // one is widest at its mouth, with lips; each a little its own.
  const right: Pt[] = lobes
    ? [[0, -1], [0.32, -0.92], [0.6, -0.66], [0.8, -0.24], [0.9, 0.2], [0.95, 0.58], [0.9, 0.9], [0.76, 1.1], [0.56, 1.22], [0.34, 1.27], [0.14, 1.29]]
    : [[0, -1], [0.42, -0.9], [0.74, -0.6], [0.93, -0.15], [0.98, 0.3], [0.9, 0.7], [0.8, 0.93], [0.52, 1.03], [0.22, 1.06]];
  const sides = [-1, 1].map((sg) => {
    const k = sg > 0 ? vr(1, 1.14) : vr(0.86, 1);
    // How much further one side hangs than the other: a little, or the
    // mouth end steps.
    const drop = 1 + (vr(0.85, 1.12) - 1) * 0.35;
    return right.map(([x, y], i) => {
      const yy = (y > 0.5 ? 0.5 + (y - 0.5) * drop : y) * oh + (i ? vr(-0.025, 0.025) * oh : 0);
      return [sg * x * ow * k * (i ? vr(0.95, 1.05) : 1) + lean * yy, yy] as Pt;
    });
  });
  // The mouth end is one soft curve: the lobes are drawn inside it, never
  // notched out of it (a notch reads as a mitten).
  const e0 = sides[0][sides[0].length - 1];
  const e1 = sides[1][sides[1].length - 1];
  const pts: Pt[] = [...sides[1], [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2 + oh * 0.01], ...sides[0].slice(1).reverse()];
  P('body', pts, true);
  /** The half-width at a height, from the outline above the lobes. */
  const at = (u: number, side: number, kk = 1): Pt => {
    const pts2 = sides[side > 0 ? 1 : 0];
    const y = u * oh;
    let x = 0;
    for (let i = 1; i < pts2.length; i++) {
      const [x0, y0] = pts2[i - 1];
      const [x1, y1] = pts2[i];
      if (y1 <= y0) break;
      if (y <= y1 || i === pts2.length - 1) {
        const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
        x = x0 + (x1 - x0) * t;
        break;
      }
    }
    return [(x - lean * y) * kk + lean * y, y];
  };
  // The eight comb rows, meridians from the pole toward the mouth.
  const ph = vr(0, TAU);
  for (let q = 0; q < 8; q++) {
    const phi = ((q + 0.5) / 8) * TAU + ph;
    const front = Math.cos(phi) > 0;
    const row: Pt[] = [];
    const u0 = -0.86 + vr(-0.04, 0.04);
    const u1 = (lobes ? 0.45 : 0.7) + vr(-0.06, 0.06);
    for (let i = 0; i <= 16; i++) {
      const u = u0 + (i / 16) * (u1 - u0);
      const [x] = at(u, Math.sin(phi) >= 0 ? 1 : -1, 0.93 * Math.abs(Math.sin(phi)));
      row.push([x, u * oh * 0.98]);
    }
    P(front ? 'rowF' : 'rowB', row);
    if (front && Math.abs(Math.sin(phi)) < 0.88) {
      // A gonad along the canal under the row: a soft strip, not a glyph.
      const a: Pt[] = [];
      const b: Pt[] = [];
      for (let i = 3; i <= 12; i++) {
        const [x, y] = row[i];
        const w = ow * 0.045 * Math.sin(((i - 3) / 9) * Math.PI) + 0.3;
        a.push([x - w - ow * 0.03, y]);
        b.unshift([x + w - ow * 0.03, y]);
      }
      P('gonad', a.concat(b), true);
    }
    if (front && g.lit) {
      for (let i = 2; i < row.length - 1; i += 3) {
        C('dotGlow', row[i][0], row[i][1], 2.4);
        C('dots', row[i][0], row[i][1], 0.9);
      }
    }
  }
  if (lobes) {
    // The two oral lobes, folded up inside the outline: a fine line each.
    for (const side of [-1, 1]) {
      // Inset from the side and following it down, then turning in under
      // the body toward the mouth: a fold, not a straight cut.
      const lobe: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        const turn = Math.pow(Math.max(0, (k - 0.55) / 0.45), 1.6);
        lobe.push(at(0.38 + k * 0.78, side, 0.84 - 0.66 * turn));
      }
      P('lines', lobe);
    }
  }
  // The pharynx, faint through it, and the statocyst at the pole.
  C('gutFill', lean * oh * 0.35, oh * 0.3, ow * 0.15, oh * 0.38);
  C('detail', -lean * oh * 0.9, -oh * 0.9, Math.max(0.9, ow * 0.05));
  if (g.feathers) {
    for (const side of [-1, 1]) {
      const [bx, by] = at(0.1, side, 0.6);
      const line = hang(bx, by, g.featherL! * vr(0.75, 1.05), Math.PI / 2 + side * vr(0.15, 0.45), {
        wave: vr(0.1, 0.25),
        freq: vr(0.04, 0.08),
        ph: vr(0, TAU),
        curl: vr(-2, 2),
        drift: -side * vr(0.1, 0.5),
      });
      P('tentB', line);
      // The side branches: uneven, some curled back.
      marks(line, 8, vr, ([x, y], t) => {
        const len = vr(3, 9) * (1 - 0.5 * t);
        const a = Math.PI / 2 + side * vr(0.5, 1.2);
        const c = vr(-0.9, 0.9);
        P('tentB', [[x, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5], [x + Math.cos(a + c) * len, y + Math.sin(a + c) * len]]);
      }, 0.1);
    }
  }
}

/**
 * A star: a disc and its arms, each its own length, curling its own way,
 * so it lies on the floor as an animal does and never as a pinwheel.
 */
function star(g: Genome, { P, C, T, vr, fine }: Kit) {
  const n = g.armsN!;
  const W = g.starW!, L = g.starL!;
  const gap = Math.tan((0.7 * Math.PI) / n);
  const R0 = Math.max(W * 1.05, (0.62 * W) / (0.85 * gap));
  const w0 = Math.min(W, 0.85 * R0 * gap);
  const curl = g.curl!;
  const arms = Array.from({ length: n }, (_, i) => ({
    a0: ((i + vr(-0.1, 0.1)) / n) * TAU - Math.PI / 2,
    len: L * vr(0.7, 1.15),
    curl: Math.max(-1, Math.min(1, (vr(0, 1) < 0.5 ? -1 : 1) * Math.abs(curl) * vr(0.25, 1.3) + vr(-0.25, 0.25))) * Math.min(1.1, (0.75 * TAU) / n),
    wave: vr(-0.3, 0.3) * Math.min(1, 6 / n),
    thin: vr(0.8, 0.92),
  }));
  const pts: Pt[] = [];
  const spineTicks: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const arm = arms[i];
    const axis: Pt[] = [];
    const S = 14;
    for (let q = 0; q <= S; q++) {
      const s = q / S;
      const a = arm.a0 + arm.curl * s * s + arm.wave * Math.sin(Math.PI * s) * s;
      const d = R0 * 0.85 + s * arm.len;
      axis.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    const minus: Pt[] = [];
    const plus: Pt[] = [];
    for (let q = 0; q <= S; q++) {
      const s = q / S;
      const p = axis[q];
      const p0 = axis[Math.max(0, q - 1)];
      const p1 = axis[Math.min(S, q + 1)];
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d;
      const ny = dx / d;
      const w = w0 * (1 - s * arm.thin) * (1 + 0.05 * Math.sin(s * 9 + i));
      minus.push([p[0] - nx * w, p[1] - ny * w]);
      plus.push([p[0] + nx * w, p[1] + ny * w]);
      if (g.feet && s > 0.12 && s < 0.88 && vr(0, 1) < 0.7) C('pat', p[0] + vr(-0.4, 0.4), p[1] + vr(-0.4, 0.4), w0 * vr(0.06, 0.11));
      // Knobs down the arm, never quite in rows.
      if (s > 0.06 && s < 0.86) {
        for (const sd of [-0.55, 0.55]) {
          if (fine(0, 1) < 0.85) C('nodes', p[0] + nx * w * sd + fine(-0.5, 0.5), p[1] + ny * w * sd + fine(-0.5, 0.5), w * (0.09 + fine(0, 0.07)));
        }
      }
      if (g.spines && s > 0.05 && s < 0.95 && vr(0, 1) < 0.75) {
        for (const sg of [-1, 1]) {
          if (vr(0, 1) < 0.5) continue;
          const len = vr(1.2, 3.6) * (1 - s * 0.5);
          const tilt = vr(-0.5, 0.5);
          const vx = sg * nx;
          const vy = sg * ny;
          const ex = vx * Math.cos(tilt) - vy * Math.sin(tilt);
          const ey = vx * Math.sin(tilt) + vy * Math.cos(tilt);
          const bx = p[0] + vx * w;
          const by = p[1] + vy * w;
          spineTicks.push([[bx, by], [bx + ex * len, by + ey * len]]);
        }
      }
    }
    T(minus, plus);
    const tip = axis[S];
    const prev = axis[S - 1];
    const td = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]) || 1;
    pts.push(...minus, [tip[0] + ((tip[0] - prev[0]) / td) * w0 * 0.12, tip[1] + ((tip[1] - prev[1]) / td) * w0 * 0.12], ...plus.reverse());
    // The edge of the disc between this arm and the next, a little hollow.
    const next = arms[(i + 1) % n];
    const aFrom = Math.atan2(plus[plus.length - 1][1], plus[plus.length - 1][0]);
    // The short way round to the next arm, whichever side of ±π the two lie.
    const aTo = aFrom + ((((next.a0 - Math.atan2(w0, R0 * 0.85) - aFrom) % TAU) + TAU) % TAU);
    for (let q = 1; q < 7; q++) {
      const a = aFrom + ((aTo - aFrom) * q) / 7;
      const rad = Math.hypot(R0 * 0.85, w0) * (1 - 0.12 * Math.sin((q / 7) * Math.PI));
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
  }
  P('body', pts, true);
  for (const s of spineTicks) P('detail', s);
  // The madreporite, off the middle of the disc.
  const ma = vr(0, TAU);
  C('detail', Math.cos(ma) * R0 * 0.55, Math.sin(ma) * R0 * 0.55, Math.max(0.5, R0 * 0.055));
}

/**
 * A siphonophore: a colony, never a string of beads. At its head a float,
 * if it has one, and the swimming bells packed two rows deep, overlapping,
 * glass over glass (without a float, the two big angular bells of a
 * calycophore); behind them the stem, tapering away, its groups (a bract, a
 * feeding polyp, a fishing line with its side branches) set along it at
 * uneven intervals and shrinking toward the end. It swims head first: the
 * stem trails down behind it at 15 to 40 degrees, never level, so it never
 * hangs as a clothesline or sags into a necklace.
 */
function chain(g: Genome, { P, C, vr, fine }: Kit) {
  const u = g.unit!;
  const units = g.units!;
  // Which way it swims, how steeply its stem leaves the bells, and how it
  // droops further down behind: the chord between its ends lies 15 to 40
  // degrees below level.
  const side = g.bend! >= 0 ? 1 : -1;
  const tilt = ((14 + 16 * Math.min(1, Math.abs(g.bend!))) * Math.PI) / 180;
  const a0 = Math.atan2(Math.sin(tilt), -side * Math.cos(tilt));
  const sag = -side * vr(0.12, 0.34);
  const ph = vr(0, TAU);
  const wave = vr(0.05, 0.14);
  const head = g.float ? u * 0.9 : 0;
  const bells = g.float ? 4 + Math.round(units * 0.4) : 2;
  const bellS = (i: number) => (g.float ? u * (0.95 + 0.4 * Math.min(1, i / 3)) : u * (i ? 1.7 : 2.1));
  const step = (i: number) => bellS(i) * (g.float ? 0.6 : 0.75);
  let nectoLen = head;
  for (let i = 0; i < bells; i++) nectoLen += step(i);
  const siphoLen = u * (5 + units * 0.75);
  const total = nectoLen + siphoLen;
  // The axis from the head back, every short step, with its heading.
  const axis: [number, number, number][] = [];
  {
    let x = 0;
    let y = 0;
    const ds = Math.max(0.6, u * 0.35);
    for (let d = 0; d <= total + 1e-6; d += ds) {
      const t = d / total;
      const a = a0 + sag * t * t + wave * Math.sin(t * 7 + ph) * Math.min(1, t * 3);
      axis.push([x, y, a]);
      x += Math.cos(a) * ds;
      y += Math.sin(a) * ds;
    }
  }
  const atD = (d: number): [number, number, number] => {
    const i = Math.max(0, Math.min(axis.length - 1, Math.round((d / total) * (axis.length - 1))));
    return axis[i];
  };
  /** A frame at a point, turned to `a`: along it, then across. */
  const frame = (cx: number, cy: number, a: number) => (px: number, py: number): Pt => [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)];

  if (g.float) {
    // The float: a small ovoid ahead of the bells, its pigment spot at the tip.
    const [x, y, a] = atD(0);
    const f = frame(x, y, a);
    const pts: Pt[] = [];
    for (let q = 0; q < 14; q++) {
      const t = (q / 14) * TAU;
      pts.push(f(Math.cos(t) * u * 0.62 + u * 0.15, Math.sin(t) * u * 0.36));
    }
    P('body', pts, true);
    C('glowBack', x, y, u * 1.6);
    const [sx, sy] = f(-u * 0.3, 0);
    C('detail', sx, sy, u * 0.12);
  }

  // The swimming bells: alternate sides of the stem, each overlapping the
  // one before, the youngest (nearest the float) smallest.
  let d = head;
  for (let i = 0; i < bells; i++) {
    const s = bellS(i) * vr(0.9, 1.1);
    d += step(i) * vr(0.85, 1.15);
    const [x, y, a] = atD(d - step(i) * 0.5);
    const sg = g.float ? (i % 2 ? 1 : -1) : i ? 1 : 0;
    const turn = a + sg * (g.float ? vr(0.35, 0.6) : 0.3);
    const f = frame(x - Math.sin(a) * sg * s * 0.3, y + Math.cos(a) * sg * s * 0.3, turn);
    const pts: Pt[] = [];
    const n = 16;
    for (let q = 0; q < n; q++) {
      const t = (q / n) * TAU;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      if (g.float) {
        // A physonect's bell: a soft box with two shoulders, its mouth facing back.
        const sq = 1 + 0.12 * Math.pow(Math.sin(2 * t), 2);
        const mouth = c > 0.8 ? 0.86 : 1;
        pts.push(f(c * s * 0.62 * sq * mouth, sn * s * 0.44 * sq));
      } else {
        // A calycophore's bell: a rounded bullet, blunt at the front, its
        // mouth wide at the back.
        const k = c < 0 ? 1 - 0.25 * Math.pow(-c, 3) : 1;
        pts.push(f(c * s * 0.7, sn * s * 0.36 * k * (c > 0.85 ? 0.92 : 1)));
      }
    }
    P('body', pts, true);
    // The swimming sac inside it, open toward the bell's mouth.
    const sac: Pt[] = [];
    const m0 = vr(0.5, 0.8);
    for (let q = 0; q <= 8; q++) {
      const t = m0 + (q / 8) * (TAU - 2 * m0);
      sac.push(f(Math.cos(t) * s * 0.4 + s * 0.16, Math.sin(t) * s * (g.float ? 0.26 : 0.22)));
    }
    P('lines', sac);
    if (!g.float) P('lines', [f(-s * 0.6, -s * 0.12), f(s * 0.1, -s * 0.2), f(s * 0.6, -s * 0.2)]);
    if (g.lit) {
      const [lx, ly] = f(0, 0);
      C('dotGlow', lx, ly, Math.max(2, s * 0.35));
      C('dots', lx, ly, Math.max(0.6, s * 0.1));
    }
  }

  // The stem: one pen line from the bells back, tapering to a hair.
  P('tentF', axis.filter((_, i) => (i / (axis.length - 1)) * total >= nectoLen * 0.6).map(([x, y]) => [x, y] as Pt));

  // The groups down the stem, at uneven intervals (each gap 0.65 to 1.35 of
  // the mean), smaller toward the end.
  const groups = 3 + Math.round(units * 0.5);
  const gap = siphoLen / groups;
  let at = nectoLen + gap * vr(0.3, 0.6);
  while (at < total - u * 0.8) {
    const t = (at - nectoLen) / siphoLen;
    const k = 1 - 0.55 * t;
    const [x, y, a] = atD(at);
    // A bract: a pointed leaf of glass, its root on the stem, raked back
    // and out above it, now one way and now the other: a feather, not a bead.
    const up = vr(0, 1) < 0.7 ? -1 : 1;
    const bf = frame(x, y, a - side * up * vr(0.3, 0.7));
    const bl = u * vr(0.9, 1.25) * k;
    const bw = u * vr(0.26, 0.36) * k;
    P('body', [[0, 0], [bl * 0.3, -bw * 0.9], [bl * 0.72, -bw * 0.8], [bl, -bw * 0.15], [bl * 0.62, bw * 0.3], [bl * 0.2, bw * 0.35]].map(([px, py]) => bf(px, py * up * side)), true);
    // The feeding polyp, hanging: a small flask with a tinge.
    P('gonad', blob(x + Math.cos(a) * u * 0.1, y + u * 0.36 * k, u * 0.16 * k, u * 0.32 * k, Math.PI / 2 + side * 0.25, vr, 8), true);
    // Its fishing line, streaming back as the colony swims, each its own
    // length, a few curled, with the side branches it fishes with.
    const len = g.dangle! * (u / 7) * vr(0.35, 1.15) * (1 - 0.3 * t);
    const line = hang(x, y + u * 0.62 * k, len, Math.PI / 2 + side * vr(0.2, 0.55), {
      wave: vr(0.05, 0.2),
      freq: vr(0.05, 0.11),
      ph: vr(0, TAU),
      curl: vr(0, 1) < 0.4 ? vr(1.2, 2.6) * (vr(0, 1) < 0.5 ? -1 : 1) : 0,
      drift: side * vr(0.05, 0.45),
    });
    P('tentB', line);
    marks(line, Math.max(3.5, u * 1.1), fine, ([bx, by], tt) => {
      const l = u * 0.28 * (1 - 0.6 * tt) * k;
      const sa = Math.PI / 2 + side * fine(0.4, 1.2);
      // Fine work: only a drawing big enough to hold it shows the side branches.
      P('lines', [[bx, by], [bx + Math.cos(sa) * l * 0.6, by + Math.sin(sa) * l * 0.6], [bx + Math.cos(sa + 1.2) * l, by + Math.sin(sa + 1.2) * l]]);
      C('nodes', bx + Math.cos(sa + 1.2) * l, by + Math.sin(sa + 1.2) * l, Math.max(0.2, l * 0.18));
    }, 0.14);
    if (g.lit) {
      C('dotGlow', x, y + u * 0.36 * k, Math.max(1.6, u * 0.3 * k));
      C('dots', x, y + u * 0.36 * k, Math.max(0.5, u * 0.08));
    }
    at += gap * vr(0.65, 1.35);
  }
}

/* ---- The bilateral plans ---- */

/**
 * A fish that grew a lure is a dark hunter with a jaw, whatever else it
 * rolled, drawn as one of two: a round anglerfish with its rod on its
 * forehead, or a long dragonfish with its light on a barbel under its chin.
 * (A lure on a mackerel's body, see-through, reads as a skeleton.)
 */
export function lureKind(g: Genome): 'angler' | 'dragon' | null {
  if (g.plan !== 'fish' || !g.lure) return null;
  return (g.blunt ?? 1) >= 0.85 ? 'angler' : 'dragon';
}

/** One of the jawed hunters: one dark wash, never see-through. */
export function jawed(g: Genome): boolean {
  return lureKind(g) !== null;
}

/**
 * A fish's tail fin. Every fish has one, at least 0.22 of its body's length
 * and never more than a third: a body that tapers to a point with no fin
 * reads as a lemon or a zeppelin. Its height goes by the body's depth as
 * well as the dice, so a slim fish never carries a deep one's crescent.
 * A tail rolled as none is the squared-off fan of a wrasse; a filament is a
 * spear-point fin the thread runs on from. Returns how many straight tail
 * rays it put first in `finRay`.
 */
function caudal(g: Genome, { P, vr }: Kit, tx: number, ty: number, depth: number, angler: boolean): number {
  const raw = g.A! * 0.75 * g.tailSize!;
  const shape = angler ? 'round' : g.tail;
  const reach = angler ? 24 : Math.max(22, Math.min(34, raw * 1.05));
  const span = (k: number, lo = 8) => Math.max(lo, Math.min(depth * k, raw));
  const root = depth * 0.05;
  let f: Pt[];
  let edge: Pt[];
  let H: number;
  if (shape === 'fork' || shape === 'lunate') {
    // A fork's notch is a V halfway in; a crescent's a shallow curve, its
    // horns swept back.
    const lun = shape === 'lunate';
    H = span(lun ? 0.95 : 0.85);
    const notch = lun ? 0.6 : 0.48;
    f = [
      [tx + 2, ty - root],
      [tx - reach * (lun ? 0.5 : 0.4), ty - H * (lun ? 0.62 : 0.55)],
      [tx - reach, ty - H],
      [tx - reach * (lun ? 0.68 : 0.72), ty - H * (lun ? 0.42 : 0.5)],
      [tx - reach * notch, ty],
      [tx - reach * (lun ? 0.68 : 0.72), ty + H * (lun ? 0.42 : 0.5)],
      [tx - reach, ty + H],
      [tx - reach * (lun ? 0.5 : 0.4), ty + H * (lun ? 0.62 : 0.55)],
      [tx + 2, ty + root],
    ];
    edge = f.slice(2, 7);
  } else if (shape === 'round') {
    H = span(angler ? 0.32 : 0.62, angler ? 12 : 8);
    f = [[tx + 2, ty]];
    for (let a = 2.25; a <= 4.04; a += 0.12) f.push([tx + 2 + Math.cos(a) * (reach + 2), ty + Math.sin(a) * H]);
    edge = f.slice(1);
  } else if (shape === 'filament') {
    H = span(0.36);
    f = [[tx + 2, ty - root], [tx - reach * 0.4, ty - H], [tx - reach, ty], [tx - reach * 0.4, ty + H], [tx + 2, ty + root]];
    edge = f.slice(1, 4);
  } else {
    H = span(0.55);
    f = [
      [tx + 2, ty - root],
      [tx - reach * 0.82, ty - H],
      [tx - reach, ty - H * 0.82],
      [tx - reach * 0.93, ty],
      [tx - reach, ty + H * 0.82],
      [tx - reach * 0.82, ty + H],
      [tx + 2, ty + root],
    ];
    edge = f.slice(1, 6);
  }
  P('fin', f, true);
  fanRays(P, [tx + 1, ty], edge, shape === 'filament' ? 9 : 14);
  if (shape === 'filament') {
    // The thread runs on from the fin's point.
    const line: Pt[] = [];
    const ph = vr(0, TAU);
    const len = Math.max(26, Math.min(60, raw * 2.2));
    for (let s = 0; s <= len; s += 3) line.push([tx - reach - s, ty + Math.sin(s / 10 + ph) * 3 * Math.min(1, s / 12)]);
    P('tentF', line);
  }
  for (let q = -3; q <= 3; q++) P('finRay', [[tx, ty], [tx - reach * 0.75, ty + q * H * 0.2]]);
  return 7;
}

/** Fish, eels, rays, squid and crawlers: a spine with a width along it.
    Returns how many tail rays it put first in `finRay`. */
function bilateral(g: Genome, kit: Kit): number {
  const { P, C, T, rr, fine, vr } = kit;
  const plan = g.plan;
  const fish = plan === 'fish';
  const eel = plan === 'eel';
  const ray = plan === 'ray';
  const squid = plan === 'squid';
  const crawler = plan === 'crawler';
  const lk = lureKind(g);
  const angler = lk === 'angler';
  const dragon = lk === 'dragon';
  let tailRays = 0;
  const L = 100;
  const A = angler ? 52 + g.A! * 0.6 : dragon ? 12 + g.A! * 0.25 : g.A!;
  const N = 44;
  const spine: [number, number, number][] = [];
  const top: Pt[] = [];
  const bot: Pt[] = [];
  const prof = (t: number) => {
    if (ray) {
      if (t < 0.34) return 0.05 * (0.45 + 0.55 * (t / 0.34));
      const u = (t - 0.34) / 0.66;
      return Math.max(0.05, 1 - Math.pow(Math.abs(2 * Math.pow(u, 0.8) - 1), 1.25)) * (u > 0.92 ? 0.8 : 1);
    }
    // One body from the snout to the point of the tail.
    if (eel) return Math.max(0.015, Math.pow(Math.min(1, t * 2.4), 0.85) * Math.pow(Math.min(1, (1.02 - t) * 8), 0.5));
    if (squid) {
      // The mantle to a point behind, the collar, the head, the crown of arms.
      if (t < 0.66) return Math.max(0.03, Math.pow(Math.sin((Math.PI / 2) * Math.min(1, t / 0.6)), 1.1));
      if (t < 0.7) return 0.96 - ((t - 0.66) / 0.04) * 0.2;
      if (t < 0.94) return 0.72 + 0.1 * Math.sin(((t - 0.7) / 0.24) * Math.PI);
      return 0.72 - ((t - 0.94) / 0.06) * 0.22;
    }
    const u = Math.pow(t, g.skew!);
    let p = Math.pow(Math.max(0.02, Math.sin(Math.PI * (0.05 + 0.9 * u))), g.blunt!);
    if (angler) {
      // A globe behind a blunt face, the tail on a short wrist.
      const ball = Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.6) / 0.43, 2)));
      return Math.max(ball, Math.min(0.12 + 0.55 * t, 0.3));
    }
    if (fish) {
      // A snout rounds off and a tail narrows to its wrist, however blunt the
      // dice made the middle: never a bottle's flat face and flat base.
      if (t > 0.88) p *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.88) / 0.12, 2) * 0.86));
      p = Math.min(p, 0.15 + 1.7 * t);
    }
    return p;
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * L;
    const y = angler ? 0 : Math.sin(t * Math.PI * (eel ? 2.6 : 1) + g.segs!) * g.wave! * (squid ? 0.4 : 1);
    let w = A * prof(t);
    // Plates show as a faint ripple in the outline, never a saw's edge.
    if (g.armor && !lk && (fish || crawler)) w *= 1 + (fish ? 0.03 : 0.07) * Math.cos(t * g.segs! * TAU);
    spine.push([x, y, w]);
    top.push([x, y - w * 0.46]);
    bot.unshift([x, y + w * 0.54]);
  }
  const outline = top.concat(bot);
  /** A hunter's open mouth: the snout, the corner of the gape, the jaw's tip. */
  let gape: Pt[] | null = null;
  if (lk) {
    const [hx, hy, hw] = spine[N];
    // The gape cut into the face, back nearly to the eye, the lower jaw
    // slung out past the snout and turned up.
    const back = angler ? A * 0.33 : 13;
    const jut = angler ? A * 0.08 : 3.5;
    gape = [
      [hx + 0.5, hy - hw * (angler ? 0.3 : 0.2)],
      [hx - back, hy + hw * 0.1],
      [hx + jut, hy + hw * (angler ? 0.1 : 0.22)],
    ];
    outline.splice(top.length, 0, ...gape, [hx + jut * 0.45, hy + hw * 0.5]);
  }
  P('body', outline, true);
  T(top, bot.slice().reverse());
  const at = (t: number) => spine[Math.max(0, Math.min(N, Math.round(t * N)))];
  const [tx, ty] = spine[0];
  const T0 = A * 0.75 * g.tailSize!;

  // The tail: a fish's own, a crawler's fan, a ray's whip; an eel's is its fin.
  if (fish) tailRays = caudal(g, kit, tx, ty, Math.max(...spine.map((p) => p[2])), angler);
  if (ray && g.tail === 'filament') {
    // A whip, never much past the disc's own length: longer, the disc is a
    // kite on its string.
    const f: Pt[] = [];
    const ph = vr(0, TAU);
    for (let s = 0; s <= Math.min(T0 * 3, L * 0.5); s += 3) f.push([tx - s, ty + Math.sin(s / 10 + ph) * 3 * Math.min(1, s / 12)]);
    P('tentF', f);
  }
  if (crawler && g.tail === 'fan') {
    for (let q = -2; q <= 2; q++) {
      const f: Pt[] = [[tx + 2, ty], [tx - T0 * 0.8, ty + q * T0 * 0.28 - T0 * 0.12], [tx - T0 * 0.8, ty + q * T0 * 0.28 + T0 * 0.12]];
      P('fin', f, true);
      fanRays(P, [tx, ty], f.slice(1), 3);
    }
    for (let q = -3; q <= 3; q++) P('finRay', [[tx, ty], [tx - T0 * 0.7, ty + q * T0 * 0.22]]);
    tailRays = 7;
  }

  if (lk) {
    // Small soft fins far back, above and below the wrist: on the globe of
    // an angler, or set opposite each other near a dragonfish's tail.
    for (const sg of [-1, 1]) {
      const t0 = angler ? (sg < 0 ? 0.2 : 0.17) : sg < 0 ? 0.1 : 0.08;
      const t1 = t0 + (angler ? 0.14 : 0.13);
      const H = angler ? A * (sg < 0 ? 0.13 : 0.1) : A * 0.45;
      const base: Pt[] = [];
      const edge: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const [x, y, w] = at(t0 + ((t1 - t0) * i) / 8);
        const off = sg < 0 ? w * 0.46 : w * 0.54;
        const q = i / 8;
        base.push([x, y + sg * (off - 1)]);
        edge.unshift([x - H * 0.5 * (1 - q), y + sg * (off + H * Math.sin(Math.PI * Math.pow(q, 0.8)) * 0.9 + H * 0.15)]);
      }
      P('fin', base.concat(edge), true);
      pairRays(P, base, edge.slice().reverse(), 7);
    }
  }
  if (fish && !lk) {
    for (let d = 0; d < g.dorsal!; d++) {
      const t0 = 0.3 + d * 0.28 + rr(-0.05, 0.05);
      const t1 = t0 + rr(0.12, 0.3);
      const H = A * 0.5 * g.dorsalH!;
      const f: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const [x, y, w] = at(t0 + ((t1 - t0) * i) / 10);
        f.push([x, y - w * 0.46 + 1]);
      }
      const back: Pt[] = [];
      for (let i = 10; i >= 0; i--) {
        const [x, y, w] = at(t0 + ((t1 - t0) * i) / 10);
        const q = i / 10;
        let h =
          g.dorsalShape === 'tri'
            ? H * (1 - q)
            : g.dorsalShape === 'sail'
              ? H * 1.3 * Math.sin(Math.PI * Math.pow(q, 0.7))
              : H * 0.8 * Math.sin(Math.PI * q);
        if (g.dorsalShape === 'frill') h += Math.sin(i * 2.2) * H * 0.18;
        back.push([x - (g.dorsalShape === 'tri' ? H * 0.4 * (1 - q) : 0), y - w * 0.46 - h]);
        if (g.dorsalShape === 'spines') P('finRay', [[x, y - w * 0.46], [x, y - w * 0.46 - h * 1.25]]);
      }
      P('fin', f.concat(back), true);
      if (g.dorsalShape !== 'spines') pairRays(P, f, back.slice().reverse(), Math.round(7 + (t1 - t0) * 30));
    }
  }

  if (eel) {
    // One fin, as an eel's is: along the back from behind the head, round
    // the point of the tail and forward under the belly, a continuous ribbon.
    const H = Math.max(1.6, A * 0.36);
    const d0 = Math.round(N * 0.6);
    const v0 = Math.round(N * 0.5);
    const outer: Pt[] = [];
    const baseTop: Pt[] = [];
    const baseBot: Pt[] = [];
    const ph = vr(0, TAU);
    const hAt = (i: number, from: number) => {
      const rise = Math.min(1, (from - i) / 5);
      return H * rise * (0.75 + 0.35 * (1 - i / N)) * (1 + 0.08 * Math.sin(i * 0.9 + ph));
    };
    for (let i = d0; i >= 0; i--) {
      const [x, y, w] = spine[i];
      outer.push([x, y - w * 0.46 - hAt(i, d0)]);
      baseTop.push([x, y - w * 0.46]);
    }
    outer.push([tx - H * 1.1, ty + H * 0.05]);
    for (let i = 0; i <= v0; i++) {
      const [x, y, w] = spine[i];
      outer.push([x, y + w * 0.54 + hAt(i, v0) * 0.9]);
      baseBot.push([x, y + w * 0.54]);
    }
    P('fin', outer, true);
    pairRays(P, baseTop, outer.slice(0, baseTop.length), Math.round(baseTop.length * 0.55));
    pairRays(P, baseBot, outer.slice(baseTop.length + 1), Math.round(baseBot.length * 0.55));
    // And the small pectoral behind the head.
    const [x, y, w] = at(0.8);
    const f: Pt[] = [];
    for (let q = 0; q <= 10; q++) {
      const a = (q / 10) * TAU;
      const u = (Math.cos(a) - 1) * 0.5;
      const v = Math.sin(a) * 0.5;
      // A small rounded paddle from behind the gill, angled back and down.
      f.push([x + 0.6 + u * w * 0.95 - v * w * 0.25, y + w * 0.12 + v * w * 0.4 - u * w * 0.35]);
    }
    P('fin', f, true);
  }
  if (fish && !lk && g.pectoral) {
    const [x, y, w] = at(0.72);
    const f: Pt[] = [[x, y + w * 0.1], [x - A * 0.55, y + w * 0.35 + A * 0.25], [x - A * 0.35, y + w * 0.15]];
    P('fin', f, true);
    fanRays(P, [x - A * 0.12, y + w * 0.12], f, 7);
  }
  if (fish && !lk && g.anal) {
    const [x, y, w] = at(0.26);
    const f: Pt[] = [[x + 6, y + w * 0.54], [x - 6, y + w * 0.54 + A * 0.35], [x - 8, y + w * 0.5]];
    P('fin', f, true);
    pairRays(P, [f[0], f[2]], [f[0], f[1], f[1]], 6);
  }

  if (squid) {
    // The fins at the mantle's point, one each side.
    const F = A * 0.55;
    for (const sgn of [-1, 1]) {
      const base: Pt[] = [];
      const edge: Pt[] = [];
      for (let i = 1; i <= 15; i++) {
        const t = (i / 15) * 0.4;
        const [x, y, w] = at(t);
        const k = t < 0.16 ? Math.pow(t / 0.16, 0.7) : Math.pow((0.4 - t) / 0.24, 1.2);
        const off = sgn < 0 ? w * 0.46 : w * 0.54;
        base.push([x, y + sgn * off]);
        edge.unshift([x - F * 0.15 * k, y + sgn * (off + F * k)]);
      }
      P('fin', base.concat(edge), true);
    }
    // The arms, a crown of them, and the two long tentacles with their clubs.
    const [hx, hy, hw] = spine[N];
    const n = Math.min(8, g.headArms!);
    const arm = (v: number, len: number, wb: number, club: boolean) => {
      const dir = v * 0.5 + vr(-0.1, 0.1);
      const line = hang(hx - 2.5, hy + v * hw * 0.28, len, dir, {
        wave: vr(0.06, 0.16),
        freq: vr(0.06, 0.12),
        ph: vr(0, TAU),
        curl: vr(0, 1) < 0.55 ? vr(-2.2, 2.2) : 0,
        drift: v * vr(0, 0.4) + vr(-0.2, 0.2),
      }, 2.5);
      const left: Pt[] = [];
      const right: Pt[] = [];
      const m = line.length;
      for (let i = 0; i < m; i++) {
        const t = i / (m - 1);
        const p = line[i];
        const q = line[Math.min(m - 1, i + 1)];
        const o = line[Math.max(0, i - 1)];
        const dx = q[0] - o[0];
        const dy = q[1] - o[1];
        const d = Math.hypot(dx, dy) || 1;
        let w = club ? wb * (0.45 + (t > 0.72 && t < 0.97 ? 0.75 * Math.sin(((t - 0.72) / 0.25) * Math.PI) : 0)) * (1 - 0.4 * t) : wb * (1 - 0.88 * t);
        w = Math.max(0.12, w);
        left.push([p[0] - (dy / d) * w, p[1] + (dx / d) * w]);
        right.unshift([p[0] + (dy / d) * w, p[1] - (dx / d) * w]);
        // Suckers along the underside: down the arm, or on the club only.
        if ((club ? t > 0.72 && t < 0.97 : t > 0.12 && t < 0.92) && i % 2 === 0) {
          C('nodes', p[0] - (dy / d) * w * 0.35, p[1] + (dx / d) * w * 0.35, Math.max(0.18, w * 0.42));
        }
      }
      P('limb', left.concat(right), true);
    };
    const wb = hw * 0.12;
    for (let q = 0; q < n; q++) arm((q / Math.max(1, n - 1)) * 2 - 1, g.armLen! * 0.42 * vr(0.75, 1.1), wb, false);
    for (const v of [-0.3, 0.3]) arm(v, g.armLen! * vr(0.85, 1.05), wb * 0.75, true);
    // The edge of the mantle at the collar.
    const [cx, cy, cw] = at(0.68);
    P('detail', [[cx - 1, cy - cw * 0.42], [cx + 0.5, cy], [cx - 1, cy + cw * 0.5]]);
  }

  if (crawler && g.legs) {
    for (let q = 0; q < g.legs; q++) {
      const [x, y, w] = at(0.25 + (q / Math.max(1, g.legs - 1)) * 0.5);
      const kneeX = x + rr(-6, 6);
      const kneeY = y + w * 0.54 + A * 0.5;
      const foot: Pt = [kneeX + 2, y + w * 0.54 + A * 1.1];
      // Three joints and a foot, each leg set a little its own way.
      P('legs', [[x, y + w * 0.4], [x + 2 + vr(-1, 1), y + w * 0.54 + A * 0.18], [kneeX + 6, kneeY - 4], [kneeX + 3 + vr(-1, 1), kneeY + A * 0.25], foot, [foot[0] - vr(1, 2.5), foot[1] + vr(0, 0.6)]]);
    }
    const [hx, hy] = spine[N];
    for (const sgn of [-1, 1]) {
      const line: Pt[] = [];
      const ph = vr(0, TAU);
      for (let s = 0; s <= g.antennae!; s += 3) line.push([hx + s * 0.9, hy - 2 + sgn * s * 0.35 - s * 0.2 + Math.sin(s / 10 + ph) * 2]);
      P('legs', line);
    }
  }
  if ((g.armor && fish && !lk) || crawler) {
    for (let q = 1; q < g.segs!; q++) {
      const [x, y, w] = at(0.1 + (q / g.segs!) * 0.8);
      P('detail', [[x, y - w * 0.44], [x - 2, y], [x, y + w * 0.52]]);
    }
  }
  if (lk && gape) {
    const jaw = angler ? A : 46;
    // The jaw: the throat dark in the gape, and needle teeth along both lips,
    // the front ones longest, leaning in, a few crossing the gape.
    P('gape', gape, true);
    const [S, Cn, J] = gape;
    const tooth = (from: Pt, to: Pt, t: number, len: number, up: number) => {
      const px = from[0] + (to[0] - from[0]) * t;
      const py = from[1] + (to[1] - from[1]) * t;
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      // Across the lip into the mouth, raked back toward the throat.
      const nx = -uy * up;
      const ny = ux * up;
      const rake = vr(0.15, 0.5);
      const bw = Math.max(0.6, len * 0.13);
      const tx = px + (nx + ux * rake) * len;
      const ty = py + (ny + uy * rake) * len;
      // A needle, curved a little back along its length.
      const mx = px + (nx + ux * rake * 0.4) * len * 0.55;
      const my = py + (ny + uy * rake * 0.4) * len * 0.55;
      P('teeth', [[px - ux * bw, py - uy * bw], [mx - ux * bw * 0.55, my - uy * bw * 0.55], [tx, ty], [mx + ux * bw * 0.55, my + uy * bw * 0.55], [px + ux * bw, py + uy * bw]], true);
    };
    const nU = 6 + Math.floor(vr(0, 3));
    for (let q = 0; q < nU; q++) {
      const t = 0.05 + (q / nU) * 0.75 + vr(-0.03, 0.03);
      tooth(S, Cn, t, jaw * (0.045 + 0.09 * (1 - t)) * vr(0.5, 1.3), 1);
    }
    const nL = 5 + Math.floor(vr(0, 3));
    for (let q = 0; q < nL; q++) {
      const t = 0.04 + (q / nL) * 0.75 + vr(-0.03, 0.03);
      tooth(J, Cn, t, jaw * (0.05 + 0.11 * (1 - t)) * vr(0.5, 1.3), -1);
    }
    // The gill opening: small, low on an angler's globe; a cover's edge on a dragonfish.
    if (angler) {
      const [gx, gy, gw] = at(0.5);
      P('detail', [[gx + 1, gy + gw * 0.12], [gx - 0.5, gy + gw * 0.22], [gx + 0.5, gy + gw * 0.32]]);
    } else {
      const [gx, gy, gw] = at(0.78);
      P('detail', [[gx + 0.5, gy - gw * 0.3], [gx - gw * 0.07, gy + gw * 0.04], [gx + 0.8, gy + gw * 0.4]]);
    }
  }
  if (fish && !lk) {
    // The gill cover's edge, and the mouth.
    const [x, y, w] = at(0.8);
    P('detail', [[x + 0.5, y - w * 0.3], [x - w * 0.07, y + w * 0.04], [x + 0.8, y + w * 0.4]]);
    const [sx, sy, sw] = spine[N];
    const [mx, my, mw] = at(0.925);
    // A plate's fish keeps its mouth shut and level: a cleft from the tip of
    // the snout running back and a little down, bowed up a hair rather than
    // dipped (a dip is a smile), its corner turned down.
    const mouth: Pt[] = [
      [sx - 0.3, sy + sw * 0.12],
      [(sx + mx) / 2, (sy + my) / 2 + (sw * 0.12 + mw * 0.2) / 2 - mw * 0.025],
      [mx, my + mw * 0.2],
      [mx - 0.9, my + mw * 0.27],
    ];
    P('detail', mouth);
    if (g.teeth) {
      // A few fangs along the jaw, uneven.
      const nT = 3 + Math.floor(vr(0, 3));
      for (let q = 0; q < nT; q++) {
        const [px, py] = along(mouth, 0.1 + (q / nT) * 0.8 + vr(-0.03, 0.03));
        const len = mw * vr(0.06, 0.13);
        const up = q % 2 ? 1 : -1;
        P('detail', [[px, py], [px - len * 0.15, py + up * len]]);
      }
    }
  }
  if ((fish && !lk) || eel) {
    // The lateral line: plain when it is the animal's mark, fine otherwise.
    const line: Pt[] = [];
    for (let i = 5; i <= N - 7; i++) {
      const [x, y, w] = spine[i];
      line.push([x, y - w * (0.1 + 0.06 * Math.sin((i / N) * Math.PI))]);
    }
    P(g.lateral ? 'detail' : 'lines', line);
    for (let i = 2; i < line.length - 1; i += 3) {
      const [x, y] = line[i];
      P('lines', [[x - 0.25, y - 0.45], [x + 0.25, y + 0.45]]);
    }
  }
  if (ray) {
    // Seen from above: the two small eyes and the spiracles behind them, a
    // ridge down the middle, and the wing's radials faint.
    const [x, y, w] = at(0.8);
    for (const sg of [-1, 1]) {
      C('eye', x, y + sg * w * 0.1, A * 0.022);
      C('pupil', x + A * 0.004, y + sg * w * 0.1, A * 0.011);
      C('detail', x - A * 0.07, y + sg * w * 0.11, A * 0.008);
    }
    P('lines', spine.slice(Math.round(N * 0.36), N - 2).map(([sx, sy]) => [sx, sy] as Pt));
    for (let q = 0; q < 14; q++) {
      const t = 0.42 + (q / 13) * 0.5;
      const [rx, ry, rw] = at(t);
      for (const sg of [-1, 1]) P('lines', [[rx, ry + sg * rw * 0.08], [rx - rw * 0.06, ry + sg * rw * 0.3], [rx - rw * 0.1, ry + sg * rw * (sg < 0 ? 0.43 : 0.5)]]);
    }
  }

  // Markings, as an engraver colours them: dabs and bars of wash that follow
  // the body round, stronger on the back than the belly; never a grid.
  const inside = (t: number, v: number): [number, number, number] => {
    const [x, y, w] = at(t);
    return [x, y + v * w * 0.42, w];
  };
  // A hunter is one dark wash: markings on it read as a toy's.
  const pattern = lk ? 'none' : g.pattern;
  if (squid && pattern !== 'none') {
    // A squid's colour is its chromatophores: a scatter of small dabs.
    for (let q = 0; q < g.patN! * 3; q++) {
      const [x, y, w] = inside(rr(0.08, 0.92), rr(-0.9, 0.7));
      C('pat', x, y, w * rr(0.025, 0.06));
    }
  } else if (pattern === 'spots') {
    for (let q = 0; q < g.patN! + 4; q++) {
      const [x, y, w] = inside(rr(0.15, 0.85), rr(-0.85, 0.55));
      const s = Math.min(A * rr(0.035, 0.07), w * 0.16);
      P('pat', blob(x, y, s * 1.25, s * 0.85, vr(-0.3, 0.3), vr, 8), true);
    }
  } else if (pattern === 'stripes' || pattern === 'bands') {
    const n = Math.min(9, g.patN!);
    const wide = pattern === 'bands';
    for (let q = 0; q < n; q++) {
      const t = 0.18 + (q / n) * 0.62 + vr(-0.015, 0.015);
      const [x, y, w] = at(t);
      const hw = (wide ? vr(1.5, 2.4) : vr(0.6, 1.0)) * (eel ? 0.6 : 1);
      const end = vr(0.1, 0.42);
      const lean = vr(-0.6, 0.6);
      const left: Pt[] = [];
      const right: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const v = -0.55 + (i / 10) * (end + 0.55);
        // Full on the back, drawn out to a point toward the belly, as a brush lifts.
        const narrow = Math.max(0.06, 1 - Math.pow(Math.max(0, (v + 0.2) / (end + 0.2)), 1.4) * 0.94);
        const bow = -v * v * hw * 1.4 + lean * v * hw;
        const jl = vr(-0.16, 0.16) * hw;
        const jr = vr(-0.16, 0.16) * hw;
        left.push([x - hw * narrow + bow + jl, y + v * w]);
        right.unshift([x + hw * narrow + bow + jr, y + v * w]);
      }
      P('pat', left.concat(right), true);
    }
  } else if (pattern === 'reticulate') {
    // Vermiculation, as on a mackerel's back: wavering lines of pigment from
    // the ridge of the back down toward the flank, leaning with the body.
    const n = Math.round(g.patN! * 1.6);
    for (let q = 0; q < n; q++) {
      const t0 = 0.2 + (q / n) * 0.62 + vr(-0.012, 0.012);
      const v1 = vr(-0.35, 0.05);
      const ph = vr(0, TAU);
      const amp = vr(0.006, 0.014);
      const line: Pt[] = [];
      for (let i = 0; i <= 7; i++) {
        const k = i / 7;
        const [x, y] = inside(t0 - k * 0.025 + Math.sin(ph + k * 7) * amp, -1.05 + k * (v1 + 1.05));
        line.push([x, y]);
      }
      P('patLine', line);
    }
  }
  if (g.clear && squid) {
    // Through a clear squid: the pen down its back, and the gland.
    P('guts', spine.slice(1, Math.round(N * 0.68)).map(([x, y, w]) => [x, y - w * 0.05] as Pt));
    const [gx, gy, gw] = at(0.5);
    C('gutFill', gx, gy, A * 0.16, gw * 0.14);
  } else if (g.clear && !ray && !lk) {
    // Through a glass fish: the backbone, and the gut slung under it. The
    // ribs only fine and only over the belly, raked back as ribs are: a
    // ladder of them from snout to tail is an X-ray, or a whale fall.
    P('guts', spine.slice(4, N - 6).map(([x, y, w]) => [x, y - w * 0.04] as Pt));
    for (let q = Math.round(N * 0.36); q < N * 0.7; q += 2) {
      const [x, y, w] = spine[q];
      P('lines', [[x, y], [x - w * 0.06, y + w * 0.16], [x - w * 0.14, y + w * 0.3]]);
    }
    // The gut: a soft bean under the backbone, never a coin.
    const [gx, gy, gw] = at(0.55);
    P('gutFill', blob(gx, gy + gw * 0.14, Math.min(A * 0.5, 15), gw * 0.14, vr(-0.12, 0.05), vr, 10), true);
  }
  if (g.photo && !ray && !angler) {
    for (let q = 0; q < g.photoN!; q++) {
      const [x, y, w] = at(0.18 + (q / g.photoN!) * 0.72);
      C('dotGlow', x, y + w * 0.42, 2.8);
      C('dots', x, y + w * 0.42, 1.1);
    }
  }

  // The eye: one, set in the head, as a profile shows it; a squid seen from
  // above shows one each side. More than one rolled reads as a row of small
  // organs under it, as a lanternfish's are.
  const eyes = g.eyes!;
  if (angler) {
    // Small and high, over the corner of the gape.
    const [x, y, w] = at(0.82);
    const er = A * 0.04;
    C('eye', x, y - w * 0.2, er);
    C('pupil', x + er * 0.1, y - w * 0.2, er * 0.72);
  } else if (eyes > 0 && !ray) {
    const et = squid ? 0.82 : eel ? 0.9 : crawler ? 0.9 : 0.87;
    const [x, y, w] = at(et);
    const er = w * (squid ? 0.14 : eel ? 0.15 : crawler ? 0.16 : g.eyeBig ? 0.17 : 0.12);
    const put = (ex: number, ey: number) => {
      C('eye', ex, ey, er);
      C('pupil', ex + er * 0.1, ey, er * 0.55);
    };
    if (squid) {
      put(x, y - w * 0.27);
      put(x, y + w * 0.31);
    } else {
      put(x, y - w * 0.1);
      for (let q = 1; q < eyes; q++) C('dots', x - er * (0.6 + q * 0.9), y + w * 0.12 + er * (0.9 + (q % 2) * 0.4), er * 0.22);
    }
  }
  if (fish && g.barbels) {
    const [x, y, w] = at(0.95);
    for (let q = 0; q < g.barbels; q++) {
      const line: Pt[] = [];
      const ph = vr(0, TAU);
      const len = (10 + q * 5) * vr(0.8, 1.2);
      const bend = vr(-1, 1) * 1.6;
      for (let s = 0; s < len; s += 1.5) {
        const t = s / len;
        line.push([x - s * (0.25 + 0.4 * t) + bend * t * t * 3, y + w * 0.4 + s * 0.8 + Math.sin(s / 4 + ph) * 0.8 * t]);
      }
      P('barbel', line);
    }
  }
  if (angler) {
    // The rod from the forehead, arched forward over the mouth, and the
    // bait at its end: a bulb with a filament or two, its light.
    const [x, y, w] = at(0.8);
    const b: Pt = [x, y - w * 0.46];
    const tip: Pt = [b[0] + A * 0.46, b[1] - A * 0.2];
    P('lure', [b, [b[0] + A * 0.04, b[1] - A * 0.24], [b[0] + A * 0.22, b[1] - A * 0.36], [b[0] + A * 0.38, b[1] - A * 0.33], tip]);
    const er = A * 0.045;
    P('fin', blob(tip[0], tip[1] + er * 0.6, er, er * 1.2, 0.3, vr, 9), true);
    for (let q = 0; q < 2; q++) {
      const a = Math.PI / 2 + vr(-0.6, 0.6);
      const len = A * vr(0.06, 0.12);
      P('lure', [[tip[0], tip[1] + er * 1.6], [tip[0] + Math.cos(a) * len * 0.5, tip[1] + er * 1.6 + Math.sin(a) * len * 0.5], [tip[0] + Math.cos(a + 0.4) * len, tip[1] + er * 1.6 + Math.sin(a + 0.4) * len]]);
    }
    C('dotGlow', tip[0], tip[1] + er * 0.6, A * 0.13);
    C('dots', tip[0], tip[1] + er * 0.6, er * 0.55);
  } else if ((eel || dragon) && g.lure) {
    // A dragonfish's lure: a barbel off the chin, hanging, its bulb lit.
    const [x, y, w] = at(0.95);
    // Trailing back under the throat as it swims, slack, curled at the bulb:
    // never a stiff pin with a ball on it.
    const len = L * vr(0.1, 0.16);
    const line = hang(x, y + w * 0.5, len, Math.PI / 2 + vr(0.15, 0.45), { wave: vr(0.12, 0.22), freq: vr(0.12, 0.2), ph: vr(0, TAU), curl: vr(0.8, 1.6), drift: vr(0.3, 0.7) }, 1);
    P('lure', line);
    const e = line[line.length - 1];
    C('dotGlow', e[0], e[1], Math.max(2.5, Math.min(6, A * 0.6)));
    C('dots', e[0], e[1], Math.max(0.9, Math.min(1.8, A * 0.17)));
  }
  return tailRays;
}

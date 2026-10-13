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

import { darkHunter, type Genome } from './genome';
import { hash32, mulberry32, range } from './random';

export type LayerName =
  | 'glowBack'
  | 'tentB'
  | 'legs'
  | 'limb'
  | 'fin'
  | 'finRay'
  | 'rays'
  | 'body'
  | 'finF'
  | 'raysF'
  | 'dome'
  | 'lens'
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
  'glowBack', 'tentB', 'legs', 'limb', 'fin', 'finRay', 'rays', 'body', 'finF', 'raysF', 'dome', 'lens', 'gape', 'teeth', 'gonad', 'guts', 'gutFill', 'pat', 'patLine',
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
export const FINE: ReadonlySet<LayerName> = new Set<LayerName>(['rays', 'raysF', 'lines', 'nodes']);

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
  const crown = crownOf(g, seed);
  if (crown) coronate(g, k, crown);
  else if (g.plan === 'bell') bell(g, k);
  else if (g.plan === 'comb') comb(g, k);
  else if (g.plan === 'star') star(g, k);
  else if (g.plan === 'chain') chain(g, k);
  else if (g.plan === 'cucumber') tailRays = cucumber(g, k);
  else if (g.plan === 'crawler' && g.amphi) tailRays = amphipod(g, k);
  else if (g.form && !PLAIN_FORMS.has(g.form)) tailRays = formed(g, k);
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
function fanRays(P: PathFn, root: Pt, edge: Pt[], n: number, layer: LayerName = 'rays') {
  for (let q = 1; q < n; q++) {
    const [ex, ey] = along(edge, q / n);
    P(layer, [root, [root[0] + (ex - root[0]) * 0.35, root[1] + (ey - root[1]) * 0.35], [root[0] + (ex - root[0]) * 0.93, root[1] + (ey - root[1]) * 0.93]]);
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

/** How deep a bell must live to be a crown jelly: the midnight zone and below. */
export const CROWN_Z = 0.6;

/**
 * Which crown jelly a bell is, if it is one: below CROWN_Z every bell is a
 * coronate, as the deep's are, an Atolla (a flat disc ringed by a deep
 * groove) or a Periphylla (a tall helmet), the taller bells leaning to the
 * helmet. Read from the genome and the species' seed, never a roll of its
 * own, so the same species is the same animal in the live sea and in a
 * picture, and every roll after it is where it was.
 */
export function crownOf(g: Genome, seed: number): 'atolla' | 'periphylla' | null {
  if (g.plan !== 'bell' || g.z < CROWN_Z) return null;
  const ratio = g.bh! / g.bw!;
  const helmet = Math.max(0.2, Math.min(0.8, ratio - 0.45));
  return (hash32('crown', seed) % 1000) / 1000 < helmet ? 'periphylla' : 'atolla';
}

/**
 * A crown jelly, side on and seen a little from below. Both kinds have the
 * coronal groove, a deep furrow right round the bell that cuts the dome off
 * from the thick pads of the pedalia below it, and a margin of rounded
 * lobes with a stiff tentacle between each two; through the clear bell the
 * stomach shows, a dark wine red, and the band of the pedalia is stained
 * with it. An Atolla is a flat disc, its dome a low lens, its pedalia
 * flaring out as a brim, its twenty short tentacles held out like spokes
 * and one of them grown far longer and thicker than the rest, trailing. A
 * Periphylla is a tall helmet, a blunt cone above the groove, its twelve
 * tentacles curving out and up at their tips.
 */
function coronate(g: Genome, { P, C, vr, fine }: Kit, form: 'atolla' | 'periphylla') {
  const W = g.bw!;
  const ratio = Math.max(0.3, Math.min(2, g.bh! / g.bw!));
  const tall = form === 'periphylla';
  // The dome's height, the groove's depth below it, where the pedalia end at the rim.
  const Ht = tall ? W * (1.7 + 0.35 * Math.max(0, Math.min(1, (ratio - 0.8) / 0.8))) : W * (0.56 + 0.08 * Math.min(1, ratio));
  const Hg = tall ? Ht * 0.64 : W * (0.3 + 0.06 * Math.min(1, ratio));
  const Wg = tall ? W * 0.8 : W * 0.66;
  const Wp = tall ? W * 0.84 : W * 0.68;
  const bow = tall ? Math.min(6, W * 0.12) : Math.min(7, W * 0.16);
  const n = tall ? 16 : 20;
  const pow = tall ? 1.4 : 0.85;
  const pts: Pt[] = [];
  // The dome, left to right over the top.
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI - (i / 40) * Math.PI;
    const h = Math.max(0, Math.sin(a));
    pts.push([Math.cos(a) * Wg, Hg - Hg * Math.pow(h, pow)]);
  }
  // Down the right side: into the groove and out, the pedalia's pad swelling to the rim.
  const notch = W * 0.05;
  const side = (sgn: number): Pt[] => {
    const out: Pt[] = [[sgn * Wg * 0.93, Hg + notch * 0.6], [sgn * Wp, Hg + notch * 1.4]];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const pad = Math.sin(t * Math.PI) * W * 0.04;
      out.push([sgn * (Wp + (W - Wp) * Math.pow(t, 0.7) + pad), Hg + notch * 1.4 + (Ht - Hg - notch * 1.4) * t]);
    }
    return out;
  };
  pts.push(...side(1));
  // The margin's lobes, round the front of the rim, each a rounded tongue.
  for (let i = 1; i < n * 4; i++) {
    const x = W - (i / (n * 4)) * 2 * W;
    const near = bow * Math.sqrt(Math.max(0, 1 - Math.pow(x / W, 2)));
    const dip = Math.pow(Math.abs(Math.sin((i / 4) * Math.PI)), 0.6) * Math.min(tall ? 5 : 6, ((2 * W) / n) * (tall ? 0.45 : 0.6));
    pts.push([x, Ht + dip + near]);
  }
  pts.push(...side(-1).reverse());
  P('body', pts, true);
  C('glowBack', 0, Ht * 0.55, W * 1.3, Math.max(Ht * 0.8, W * 0.6));

  // The groove's front, and the furrows between the pedalia down to the margin.
  const groove: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const th = (i / 16) * Math.PI;
    groove.push([Math.cos(th) * Wg * 0.95, Hg + notch + bow * 0.75 * Math.sin(th)]);
  }
  P('detail', groove);
  const ped = tall ? 12 : 20;
  for (let k = 0; k < ped; k++) {
    const th = ((k + 0.5) / ped) * Math.PI * 2;
    const sn = Math.sin(th);
    if (sn < 0.2) continue;
    const c = Math.cos(th);
    P('detail', [[c * Wp * 1.02, Hg + notch * 1.6 + bow * 0.8 * sn], [c * (Wp + W) * 0.5 * 1.03, (Hg + Ht) * 0.5 + notch + bow * 0.9 * sn], [c * W * 0.98, Ht - W * 0.02 + bow * sn]]);
  }

  // The pedalia's band, stained: from the groove down to the margin, at the front.
  const band: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const th = (i / 16) * Math.PI;
    band.push([Math.cos(th) * Wp, Hg + notch * 1.4 + bow * 0.8 * Math.sin(th)]);
  }
  for (let i = 16; i >= 0; i--) {
    const th = (i / 16) * Math.PI;
    band.push([Math.cos(th) * W * 0.99, Ht + bow * Math.sin(th)]);
  }
  P('pat', band, true);
  // The stomach, wine red, seen through the dome; and the gonads at the
  // groove, beans of the same. The stomach is always the first gutFill
  // shape: the sprite lays it as a soft wash fading toward the rim, never
  // a filled hole, and the beans after it fainter still.
  if (tall) {
    // A blunt cone in the helmet, its rounded tip high in the crown and its
    // foot opening out to the groove, where it fades into the band below.
    const st: Pt[] = [];
    const sw = Wg * 0.5;
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI - (i / 24) * Math.PI;
      const h = Math.max(0, Math.sin(a));
      // (Flanks a little hollow, so it is a stomach's cone and not a dome.)
      const x = Math.cos(a) * sw * (1 - 0.18 * h * h);
      st.push([x, Hg + notch * 0.4 - Hg * 0.78 * Math.pow(h, 2.6)]);
    }
    for (let i = 1; i < 12; i++) {
      const x = sw - (i / 12) * sw * 2;
      st.push([x, Hg + notch * 0.4 + bow * 0.6 * Math.sqrt(Math.max(0, 1 - Math.pow(x / sw, 2)))]);
    }
    P('gutFill', st, true);
  } else {
    P('gutFill', blob(0, Hg * 0.8, W * 0.38, W * 0.12, 0, vr, 13), true);
  }
  for (const t of [0.22, 0.42, 0.62, 0.8]) {
    const th = t * Math.PI;
    // (Down in the groove, beside the stomach's foot and not under it, where a row of them reads as teeth.)
    P('gutFill', blob(Math.cos(th) * (tall ? Wg * 0.74 : W * 0.5), Hg + notch * (tall ? 0.9 : 0.6) + bow * 0.5 * Math.sin(th), W * (tall ? 0.06 : 0.075), W * (tall ? 0.028 : 0.035), Math.cos(th) * 0.4, vr, 9), true);
  }
  // The margin's thickness: a fine line just inside the lobes, so the rim
  // reads as a jelly's soft edge turned toward us and not a cut.
  const lip: Pt[] = [];
  for (let i = 1; i < n * 4; i++) {
    const x = W - (i / (n * 4)) * 2 * W;
    if (Math.abs(x) > W * 0.93) continue;
    const near = bow * Math.sqrt(Math.max(0, 1 - Math.pow(x / W, 2)));
    const dip = Math.pow(Math.abs(Math.sin((i / 4) * Math.PI)), 0.6) * Math.min(tall ? 5 : 6, ((2 * W) / n) * (tall ? 0.45 : 0.6));
    lip.push([x, Ht + dip * 0.55 + near - Math.min(2.2, W * 0.035)]);
  }
  P('detail', lip);

  // The tentacles, one between each two pedalia, stiff, the near ones over
  // the bell and the far ones behind it.
  const nT = tall ? 12 : 20;
  // Off one side of the disc, never from under its middle, where it would be a stalk.
  const hyper = tall ? -1 : (vr(0, 1) < 0.5 ? Math.floor(nT * 0.02) : Math.floor(nT * 0.48));
  for (let k = 0; k < nT; k++) {
    const th = (k / nT) * Math.PI * 2 + 0.13;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const x0 = c * W * 0.96;
    const y0 = Ht - W * 0.05 + bow * sn;
    if (k === hyper) {
      // Grown far longer and thicker than the rest, trailing.
      // Out from the rim and swept back in a long lazy S, as it trails.
      const len = W * vr(2.3, 2.9);
      const line = hang(x0, y0, len, Math.PI / 2 - Math.sign(c) * vr(0.55, 0.8), { wave: vr(0.18, 0.26), freq: vr(0.025, 0.035), ph: vr(0, TAU), curl: Math.sign(c) * vr(1.2, 2), drift: Math.sign(c) * vr(0.5, 0.8) });
      const left: Pt[] = [];
      const right: Pt[] = [];
      for (let i = 0; i < line.length; i++) {
        const a = line[Math.max(0, i - 1)];
        const b = line[Math.min(line.length - 1, i + 1)];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1;
        const t = i / Math.max(1, line.length - 1);
        const wdt = W * 0.05 * Math.pow(1 - t, 0.75) + 0.35;
        left.push([line[i][0] - (dy / d) * wdt, line[i][1] + (dx / d) * wdt]);
        right.unshift([line[i][0] + (dy / d) * wdt, line[i][1] - (dx / d) * wdt]);
      }
      P('fin', left.concat(right), true);
      marks(line, 7, fine, ([x, y], t) => C('nodes', x, y, 0.3 + 0.7 * (1 - t)), 0.1);
      continue;
    }
    const len = W * (tall ? vr(1.1, 1.6) : vr(0.45, 0.85));
    const out = tall ? 0.9 : 1.15;
    const line = hang(x0, y0, len, Math.PI / 2 - c * out, { wave: vr(0.02, 0.05), freq: vr(0.06, 0.1), ph: vr(0, TAU), curl: tall ? -c * vr(1.6, 2.6) : -c * vr(0, 0.8), drift: -c * (tall ? 0.45 : 0.25) });
    P(sn > 0 ? 'tentF' : 'tentB', line);
    if (g.lit && sn > 0 && vr(0, 1) < 0.35 && line.length) {
      const e = line[line.length - 1];
      C('dotGlow', e[0], e[1], 2.5);
      C('dots', e[0], e[1], 1);
    }
  }
  // Its light: a ring of points round the groove, the deep's alarm.
  if (g.lit) {
    for (let i = 0; i < 10; i++) {
      const th = ((i + 0.5) / 10) * Math.PI;
      const x = Math.cos(th) * Wg * 0.96;
      const y = Hg + notch + bow * 0.75 * Math.sin(th);
      C('dotGlow', x, y, 3);
      C('dots', x, y, 1.1);
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
  // Five at the least, as a sea star has: a four-armed one reads as a cross.
  const n = Math.max(5, g.armsN!);
  // The more arms, the less each may bend: a sunflower star's many arms lie
  // nearly straight out from its broad disc, and a ring of them curling
  // every which way reads as a drawn sun.
  const bend = n > 6 ? 0.4 : 1;
  const W = g.starW!, L = g.starL!;
  const gap = Math.tan((0.7 * Math.PI) / n);
  const R0 = Math.max(W * 1.05, (0.62 * W) / (0.85 * gap));
  const w0 = Math.min(W, 0.85 * R0 * gap);
  const curl = g.curl!;
  const arms = Array.from({ length: n }, (_, i) => ({
    a0: ((i + vr(-0.1, 0.1)) / n) * TAU - Math.PI / 2,
    len: L * vr(0.7, 1.15),
    curl: Math.max(-1, Math.min(1, (vr(0, 1) < 0.5 ? -1 : 1) * Math.abs(curl) * vr(0.25, 1.3) + vr(-0.25, 0.25))) * Math.min(1.1, (0.75 * TAU) / n) * bend,
    wave: vr(-0.3, 0.3) * Math.min(1, 6 / n) * bend,
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
  if (g.plan !== 'fish') return null;
  if (g.form) return g.form === 'angler' || g.form === 'dragon' ? g.form : null;
  if (!g.lure) return null;
  return (g.blunt ?? 1) >= 0.85 ? 'angler' : 'dragon';
}

/** One of the jawed hunters (and the other dark ones of the deep): one dark wash, never see-through. */
export function jawed(g: Genome): boolean {
  return darkHunter(g) || lureKind(g) !== null;
}

/** The forms the plans' own builder draws: a jack, a sardine, and the two hunters it always drew. */
const PLAIN_FORMS: ReadonlySet<string> = new Set(['jack', 'sardine', 'angler', 'dragon']);

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

/**
 * Markings, as an engraver colours them: dabs and bars of wash that follow
 * the body round, stronger on the back than the belly; never a grid. `at`
 * is the body's spine: a point and the body's depth there.
 */
function markings(g: Genome, { P, C, rr, vr }: Kit, at: (t: number) => [number, number, number], A: number, pattern: Genome['pattern'], squid: boolean, eel: boolean) {
  const inside = (t: number, v: number): [number, number, number] => {
    const [x, y, w] = at(t);
    return [x, y + v * w * 0.42, w];
  };
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
  }}

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
  if (fish && !lk && g.dorsal! > 0) {
    // One dorsal fin, low and set well back, as a plate's fish carries it:
    // two tall ones read as ears. The genome's count still rolls (and its
    // dice are still spent, so nothing after moves); a second only makes
    // the one fin longer at its foot. Its front edge stands at least 0.4 of
    // the body back from the snout, and it rises at most 0.35 of the body's
    // depth.
    let jit = 0;
    let span = 0;
    for (let d = 0; d < g.dorsal!; d++) {
      const j = rr(-0.05, 0.05);
      const s = rr(0.12, 0.3);
      if (d === 0) {
        jit = j;
        span = s;
      } else span = Math.min(0.34, span + s * 0.35);
    }
    const depth = Math.max(...spine.map((p) => p[2]));
    {
      // The front edge between 0.52 and 0.6 of the way from the tail.
      const t1 = 0.56 + jit * 0.8;
      const t0 = Math.max(0.2, t1 - span);
      // The tallest point of each shape is brought to `top`.
      const top = depth * (0.2 + 0.15 * Math.min(1, Math.max(0, (g.dorsalH! - 0.3) / 1)));
      const H = g.dorsalShape === 'sail' ? top / 1.3 : g.dorsalShape === 'tri' ? top : g.dorsalShape === 'spines' ? top / (0.8 * 1.25) : g.dorsalShape === 'frill' ? top / 0.98 : top / 0.8;
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

  // A hunter is one dark wash: markings on it read as a toy's.
  markings(g, kit, at, A, lk ? 'none' : g.pattern, squid, eel);
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

/* ---- The fish forms ---- */

/**
 * A form's body along its spine, from the tail (x = 0) to the snout (x =
 * 100): at each point the line of the back and of the belly. The spine
 * carries the same reading as the plans' (a point and the depth there, the
 * back 0.46 of it above), so the markings, the glass and the hatching read
 * any form the way they read a jack.
 */
interface Frame {
  N: number;
  spine: [number, number, number][];
  top: Pt[];
  bot: Pt[];
  at: (t: number) => [number, number, number];
  /** The back and the belly at t. */
  up: (t: number) => Pt;
  dn: (t: number) => Pt;
  depth: number;
}

function frameOf(edges: (t: number) => [number, number], wave: (t: number) => number, N = 48): Frame {
  const spine: [number, number, number][] = [];
  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * 100;
    const [a, b] = edges(t);
    const y0 = wave(t);
    const w = Math.max(0.3, b - a);
    spine.push([x, y0 + a + 0.46 * w, w]);
    top.push([x, y0 + a]);
    bot.push([x, y0 + a + w]);
  }
  const at = (t: number): [number, number, number] => {
    const u = Math.max(0, Math.min(1, t)) * N;
    const i = Math.min(N - 1, Math.floor(u));
    const f = u - i;
    const p = spine[i];
    const q = spine[i + 1];
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
  };
  return {
    N,
    spine,
    top,
    bot,
    at,
    up: (t) => {
      const [x, y, w] = at(t);
      return [x, y - w * 0.46];
    },
    dn: (t) => {
      const [x, y, w] = at(t);
      return [x, y + w * 0.54];
    },
    depth: Math.max(...spine.map((p) => p[2])),
  };
}

/** A quadratic curve from a through c to b, n steps. */
function quad(a: Pt, c: Pt, b: Pt, n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** A cubic curve from a, pulled toward c1 and c2, to b. */
function cubic(a: Pt, c1: Pt, c2: Pt, b: Pt, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
    ]);
  }
  return out;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The plain fusiform body of the swimmers, its depth at t as a share of the deepest. */
function fusiform(t: number, skew: number, blunt: number): number {
  const u = Math.pow(t, skew);
  let p = Math.pow(Math.max(0.02, Math.sin(Math.PI * (0.05 + 0.9 * u))), blunt);
  if (t > 0.88) p *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.88) / 0.12, 2) * 0.86));
  return Math.min(p, 0.15 + 1.7 * t);
}

/**
 * A fin along the back (side -1) or the belly (side 1) from t1, nearer the
 * head, back to t0: `h` its height at each point, 0 at the front to 1 at the
 * back, raked back by `rake` of it. Its rays run from base to edge.
 */
function finAlong(k: Kit, F: Frame, t0: number, t1: number, side: -1 | 1, h: (q: number) => number, rake = 0.4, rays = 8, layer: LayerName = 'fin', spines = false): Pt[] {
  const base: Pt[] = [];
  const edge: Pt[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const q = i / n;
    const t = t1 + (t0 - t1) * q;
    const [x, y] = side < 0 ? F.up(t) : F.dn(t);
    const hh = h(q);
    base.push([x, y - side]);
    edge.push([x - hh * rake, y + side * hh]);
  }
  k.P(layer, base.concat(edge.slice().reverse()), true);
  if (spines) for (let i = 0; i <= n; i += 2) k.P('finRay', [base[i], [edge[i][0], edge[i][1] - side * 0.6]]);
  else if (rays > 0) pairRays(k.P, base, edge, rays);
  return edge;
}

/** A fin as a paddle from a root: `len` long toward `ang`, `wid` across, rounded at its end. */
function paddle(k: Kit, root: Pt, len: number, wid: number, ang: number, layer: LayerName = 'finF', rays = 7, round = 1): Pt[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const pts: Pt[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (i / n) - Math.PI / 2;
    // From the root out along one edge, round the end, back along the other.
    const u = (Math.cos(a) * 0.5 + 0.5) * len * (round ? 1 : 1 - 0.3 * Math.abs(Math.sin(a)));
    const v = Math.sin(a) * wid * 0.5 * (0.35 + 0.65 * Math.pow(u / len, 0.6));
    pts.push([root[0] + u * c - v * s, root[1] + u * s + v * c]);
  }
  pts.unshift(root);
  k.P(layer, pts, true);
  if (rays) fanRays(k.P, root, pts.slice(2, -1), rays, layer === 'finF' ? 'raysF' : 'rays');
  return pts;
}

/**
 * A wing of a fin, as a flying fish holds its pectoral: narrow at the root,
 * widening to a broad, gently rounded trailing end, its rays fanning out
 * from the root the length of it.
 */
function wing(k: Kit, root: Pt, len: number, wid: number, ang: number, layer: LayerName) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const at = (u: number, v: number): Pt => [root[0] + u * c - v * s, root[1] + u * s + v * c];
  const lead: Pt[] = [];
  const trail: Pt[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * len;
    const q = i / n;
    // The leading edge nearly straight; the trailing one bellies out behind.
    lead.push(at(u, -wid * 0.12 * Math.sin(Math.PI * q * 0.9)));
    trail.push(at(u * 0.96, wid * Math.pow(q, 0.7) * (1 - 0.25 * Math.pow(q, 6))));
  }
  const end = quad(lead[n], at(len * 1.02, wid * 0.55), trail[n], 6).slice(1, -1);
  const pts = [root, ...lead.slice(1), ...end, ...trail.slice(1).reverse()];
  k.P(layer, pts, true);
  const edge = [lead[n], ...end, ...trail.slice(Math.round(n * 0.4)).reverse()];
  fanRays(k.P, root, edge, 12, layer === 'finF' ? 'raysF' : 'rays');
  for (let q = 1; q < 6; q++) {
    const [ex, ey] = along(edge, q / 6);
    k.P('finRay', [root, [root[0] + (ex - root[0]) * 0.9, root[1] + (ey - root[1]) * 0.9]]);
  }
}

/** A needle tooth, from its root toward `ang`, bending back a little along its length. */
function fang(P: PathFn, root: Pt, len: number, ang: number, bend: number, layer: LayerName = 'teeth') {
  const bw = Math.max(0.5, len * 0.12);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const nx = -s;
  const ny = c;
  const pt = (u: number, side: number): Pt => {
    const off = bend * u * u * len;
    const half = bw * (1 - u) * side;
    return [root[0] + c * u * len + nx * (off + half), root[1] + s * u * len + ny * (off + half)];
  };
  P(layer, [pt(0, -1), pt(0.5, -1), pt(1, 0), pt(0.5, 1), pt(0, 1)], true);
}

function eyeAt(C: DiscFn, x: number, y: number, er: number, look: Pt = [0.1, 0]) {
  C('eye', x, y, er);
  C('pupil', x + er * look[0], y + er * look[1], er * 0.55);
}

/** The gill cover's edge, an arc behind the head. */
function gillAt(P: PathFn, F: Frame, t: number, reach = 0.4) {
  const [x, y, w] = F.at(t);
  P('detail', [[x + 0.5, y - w * reach * 0.8], [x - w * 0.07, y + w * 0.04], [x + 0.8, y + w * reach]]);
}

/** A shut mouth: a cleft from the snout's point back to its corner, turned down at the end. */
function cleft(P: PathFn, tip: Pt, corner: Pt, layer: LayerName = 'detail') {
  const mid: Pt = [(tip[0] + corner[0]) / 2, (tip[1] + corner[1]) / 2 - Math.abs(corner[0] - tip[0]) * 0.025];
  P(layer, [tip, mid, corner, [corner[0] - 0.9, corner[1] + Math.max(0.6, Math.abs(corner[0] - tip[0]) * 0.06)]]);
}

/** The lateral line, from t0 to t1, a share `v` down from the back; plain when it is the animal's mark. */
function lateralLine(P: PathFn, F: Frame, t0: number, t1: number, v: number, plain: boolean) {
  const line: Pt[] = [];
  for (let i = Math.round(t0 * F.N); i <= Math.round(t1 * F.N); i++) {
    const [x, y, w] = F.spine[i];
    line.push([x, y - w * 0.46 + w * v]);
  }
  P(plain ? 'detail' : 'lines', line);
  for (let i = 2; i < line.length - 1; i += 3) {
    const [x, y] = line[i];
    P('lines', [[x - 0.25, y - 0.45], [x + 0.25, y + 0.45]]);
  }
}

/** A row of lights from t0 to t1, `v` of the way down from the back (1 the belly's edge, a little inside it). */
function lights(C: DiscFn, F: Frame, t0: number, t1: number, n: number, v: number, r: number) {
  for (let q = 0; q < n; q++) {
    const t = t0 + ((t1 - t0) * (q + 0.5)) / n;
    const [x, y, w] = F.at(t);
    const yy = y - w * 0.46 + w * v;
    C('dotGlow', x, yy, r * 2.5);
    C('dots', x, yy, r);
  }
}

/** Through a glass fish: the backbone, the gut under it, the ribs fine over the belly only. */
function glass(k: Kit, F: Frame, A: number, from = 0.08, to = 0.86) {
  const { P, vr } = k;
  const { spine, N } = F;
  P('guts', spine.slice(Math.round(N * from), Math.round(N * to)).map(([x, y, w]) => [x, y - w * 0.04] as Pt));
  for (let q = Math.round(N * 0.36); q < N * 0.7; q += 2) {
    const [x, y, w] = spine[q];
    P('lines', [[x, y], [x - w * 0.06, y + w * 0.16], [x - w * 0.14, y + w * 0.3]]);
  }
  const [gx, gy, gw] = F.at(0.55);
  P('gutFill', blob(gx, gy + gw * 0.14, Math.min(A * 0.5, 15), gw * 0.14, vr(-0.12, 0.05), vr, 10), true);
}

/** The body itself, its outline (with anything let into it at the snout) and its tube for the wash. */
function hull(k: Kit, F: Frame, snout: Pt[] = []) {
  k.P('body', F.top.concat(snout, F.bot.slice().reverse()), true);
  k.T(F.top, F.bot);
}

/**
 * The fish that are not a jack, a sardine or one of the two old hunters,
 * each drawn as its own family. Returns how many tail rays it put first in
 * `finRay`, as `bilateral` does.
 */
function formed(g: Genome, kit: Kit): number {
  const { P, C, vr } = kit;
  const A = g.A!;
  const form = g.form!;
  const sway = (amp: number, cycles = 1) => (t: number) => Math.sin(t * Math.PI * cycles + g.segs!) * amp;
  let tailRays = 0;
  const tail = (F: Frame, depth: number, Aeff = Math.min(A, 30)) => {
    const [tx, ty] = F.spine[0];
    tailRays = caudal({ ...g, A: Aeff }, kit, tx, ty, depth, false);
  };
  const mark = (F: Frame, pattern = g.pattern) => markings(g, kit, F.at, A, pattern, false, false);
  const see = (F: Frame) => {
    if (g.clear) glass(kit, F, A);
  };

  if (form === 'disc') {
    // A butterflyfish or an angelfish: a tall flat disc, a small mouth, the
    // dorsal and anal fins long and sweeping back past the tail's root.
    const angel = g.blunt! >= 1;
    const tc = angel ? 0.56 : 0.52;
    const rl = angel ? 0.42 : 0.38;
    const F = frameOf((t) => {
      const u = (t - tc) / rl;
      const e = Math.sqrt(Math.max(0, 1 - u * u));
      let up = A * 0.5 * Math.pow(e, 0.85);
      let dn = A * 0.5 * Math.pow(e, 0.95);
      const ped = t < 0.32 ? A * (0.08 + Math.max(0, t - 0.08) * 0.55) : 0;
      up = Math.max(up, ped);
      dn = Math.max(dn, ped);
      if (!angel && t > 0.8) {
        // The butterflyfish's snout: a short tapering tube to the mouth.
        const s = A * (0.1 - 0.07 * smoothstep(0.8, 1, t));
        up = Math.max(up, s + A * 0.03);
        dn = Math.max(dn, s - A * 0.03);
      }
      return [-up, dn];
    }, () => 0);
    const H = A * (angel ? 0.3 : 0.24);
    const trail = angel ? A * 0.36 : A * 0.1;
    for (const side of [-1, 1] as const) {
      // From low behind the head, rising and sweeping back, past the tail's
      // root to a point (an angelfish) or a rounded lobe (a butterflyfish).
      const t1 = side < 0 ? 0.78 : 0.56;
      const t0 = 0.12;
      const base: Pt[] = [];
      const edge: Pt[] = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const q = i / n;
        const [x, y] = side < 0 ? F.up(t1 + (t0 - t1) * q) : F.dn(t1 + (t0 - t1) * q);
        const h = (side < 0 ? H : H * 0.9) * (0.2 + 0.8 * Math.sin((Math.PI / 2) * Math.min(1, q / 0.75)));
        base.push([x, y - side]);
        edge.push([x - h * 0.35 - trail * Math.pow(q, 3), y + side * h * (1 - (angel ? 0 : 0.3 * Math.pow(q, 4)))]);
      }
      const [bx, by] = base[n];
      const close = quad(edge[n], [bx - trail * 0.35, by + side * H * 0.2], [bx, by], 6).slice(1);
      P('fin', base.concat(close.slice().reverse().slice(1), edge.slice().reverse()), true);
      pairRays(P, base, edge, 18);
    }
    tail(F, A * 0.6);
    // The pelvic: a long streamer under the throat on an angelfish, short on a butterflyfish.
    const pv = F.dn(0.68);
    paddle(kit, [pv[0], pv[1] - 1], angel ? A * 0.55 : A * 0.22, A * 0.07, Math.PI * 0.62, 'fin', 4, 0);
    const pc = F.at(0.7);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.08], A * 0.2, A * 0.11, Math.PI * 0.86, 'finF', 6);
    hull(kit, F);
    mark(F);
    if (g.pattern === 'bands' || g.pattern === 'stripes') {
      // The bar through the eye, as so many of them carry.
      const [ex, , ew] = F.at(0.84);
      const left: Pt[] = [];
      const right: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const v = -0.48 + (i / 8) * 0.86;
        const [, y] = F.at(0.84);
        const hw = A * 0.03 * (1 - Math.pow(Math.max(0, v - 0.1) / 0.3, 2) * 0.7);
        left.push([ex - hw - v * A * 0.05, y + v * ew]);
        right.unshift([ex + hw - v * A * 0.05, y + v * ew]);
      }
      P('pat', left.concat(right), true);
    }
    lateralLine(P, F, 0.2, 0.78, 0.18, false);
    gillAt(P, F, 0.72, 0.36);
    const [mx, my] = F.at(1);
    cleft(P, [mx + 0.4, my - A * 0.005], [mx - A * 0.035, my + A * 0.012]);
    see(F);
    const [ex, ey] = F.at(angel ? 0.84 : 0.8);
    eyeAt(C, ex, ey - A * 0.1, A * 0.06);
    return tailRays;
  }

  if (form === 'puffer') {
    // A puffer, round, or a boxfish, a box: tiny fins far back, a small tail
    // on a short stalk, the beak at the front.
    const box = g.blunt! > 1.25;
    const F = frameOf((t) => {
      const u = (t - 0.56) / 0.42;
      const au = Math.abs(u);
      const e = box ? Math.pow(Math.max(0, 1 - Math.pow(au, 4)), 0.25) : Math.sqrt(Math.max(0, 1 - Math.pow(au, u > 0 ? 2.4 : 2)));
      const ped = t < 0.26 ? A * (0.085 + t * 0.06) : 0;
      return [-Math.max(A * (box ? 0.47 : 0.48) * e, ped), Math.max(A * (box ? 0.5 : 0.52) * Math.pow(e, 0.85), ped)];
    }, () => 0);
    finAlong(kit, F, 0.17, 0.29, -1, (q) => A * 0.2 * Math.sin(Math.PI * Math.pow(q, 0.7)), 0.5, 6);
    finAlong(kit, F, 0.16, 0.27, 1, (q) => A * 0.17 * Math.sin(Math.PI * Math.pow(q, 0.7)), 0.5, 6);
    tail(F, A * 0.4, 26);
    hull(kit, F);
    mark(F);
    if (box) {
      // The carapace's ridges, along the back and the belly.
      for (const v of [0.12, 0.88]) {
        const line: Pt[] = [];
        for (let i = 12; i <= 44; i++) {
          const [x, y, w] = F.spine[i];
          line.push([x, y - w * 0.46 + w * v]);
        }
        P('detail', line);
      }
    } else {
      // Prickles over the belly, fine.
      for (let q = 0; q < 26; q++) {
        const t = vr(0.3, 0.86);
        const [x, y, w] = F.at(t);
        const yy = y + w * vr(0.22, 0.5);
        P('lines', [[x, yy], [x - 0.8, yy + 0.5]]);
      }
    }
    const pc = F.at(0.74);
    paddle(kit, [pc[0], pc[1] - pc[2] * 0.04], A * 0.16, A * 0.13, Math.PI * 0.9, 'finF', 6);
    const [gx, gy, gw] = F.at(0.76);
    P('detail', [[gx + 0.3, gy - gw * 0.12], [gx - 0.6, gy], [gx + 0.3, gy + gw * 0.1]]);
    const [sx, sy] = F.at(1);
    // The beak: two plates at the front, the line between them.
    P('detail', [[sx - 2.6, sy - A * 0.05], [sx + 0.9, sy - A * 0.035], [sx + 1.2, sy]]);
    P('detail', [[sx + 1.2, sy], [sx + 0.8, sy + A * 0.035], [sx - 2.4, sy + A * 0.05]]);
    P('detail', [[sx + 1.1, sy], [sx - 2.2, sy + A * 0.004]]);
    const [ex, ey, ew] = F.at(0.82);
    eyeAt(C, ex, ey - ew * 0.2, A * 0.085);
    return tailRays;
  }

  if (form === 'barracuda') {
    // A barracuda: long, the jaw jutting past the snout, two small dorsals
    // set far back, one over the anal fin.
    const F = frameOf((t) => {
      let p = fusiform(t, g.skew!, 0.9);
      if (t < 0.16) p = Math.max(p, 0.3);
      if (t > 0.76) p *= 1 - Math.pow((t - 0.76) / 0.24, 1.5) * 0.86;
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave! * 0.6));
    finAlong(kit, F, 0.49, 0.58, -1, (q) => A * 0.48 * Math.pow(1 - q, 0.6), 0.5, 0, 'fin', true);
    finAlong(kit, F, 0.19, 0.27, -1, (q) => A * 0.36 * Math.sin(Math.PI * Math.pow(1 - q, 0.6)), 0.55, 6);
    finAlong(kit, F, 0.17, 0.26, 1, (q) => A * 0.34 * Math.sin(Math.PI * Math.pow(1 - q, 0.6)), 0.55, 6);
    const pv = F.dn(0.5);
    paddle(kit, [pv[0], pv[1] - 0.5], A * 0.5, A * 0.18, Math.PI * 0.8, 'fin', 4, 0);
    tail(F, F.depth * 1.1, 26);
    const [sx, sy, sw] = F.at(1);
    // The lower jaw, out past the upper and to a point.
    const jaw: Pt = [sx + A * 0.32, sy + sw * 0.3];
    hull(kit, F, [[sx + A * 0.1, sy + sw * 0.05], jaw, [sx - 1, sy + sw * 0.62]]);
    mark(F, g.pattern === 'bands' ? 'bands' : g.pattern);
    lateralLine(P, F, 0.1, 0.8, 0.36, true);
    gillAt(P, F, 0.8, 0.42);
    const [cx, cy, cw] = F.at(0.84);
    cleft(P, [sx + A * 0.1, sy + sw * 0.08], [cx, cy + cw * 0.18]);
    for (let q = 0; q < 4; q++) {
      const [x, y] = along([[sx + A * 0.05, sy + sw * 0.1], [cx, cy + cw * 0.18]], 0.15 + q * 0.2);
      P('detail', [[x, y], [x - 0.2, y + (q % 2 ? 1.1 : -1.1)]]);
    }
    const pc = F.at(0.76);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.25], A * 0.6, A * 0.22, Math.PI * 0.9, 'finF', 5);
    see(F);
    const [ex, ey, ew] = F.at(0.88);
    eyeAt(C, ex, ey - ew * 0.12, ew * 0.24);
    return tailRays;
  }

  if (form === 'sunfish') {
    // A mola: a great disc cut off behind, its dorsal and anal tall blades
    // at the back, and where a tail would be, the clavus: a scalloped frill.
    const F = frameOf((t) => {
      let e = Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.4) / 0.62, 2)));
      if (t > 0.84) e *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.84) / 0.16, 2) * 0.72));
      return [-A * 0.5 * e, A * 0.5 * e];
    }, () => 0);
    for (const side of [-1, 1] as const) {
      const f = side < 0 ? F.up(0.3) : F.dn(0.28);
      const b = side < 0 ? F.up(0.02) : F.dn(0.02);
      const h = A * (side < 0 ? 0.66 : 0.6);
      const tip: Pt = [b[0] + A * 0.04, b[1] + side * h];
      const front = cubic([f[0], f[1] - side], [f[0] - 4, f[1] + side * h * 0.55], [tip[0] + A * 0.14, tip[1] - side * h * 0.15], tip, 12);
      const back = quad(tip, [b[0] + A * 0.07, b[1] + side * h * 0.45], [b[0], b[1] - side], 8).slice(1);
      const base: Pt[] = [];
      for (let i = 0; i <= 8; i++) base.push(side < 0 ? F.up(0.02 + 0.28 * (i / 8)) : F.dn(0.02 + 0.26 * (i / 8)));
      P('fin', front.concat(back, base.map(([x, y]) => [x, y - side] as Pt)), true);
      pairRays(P, base.slice().reverse(), front, 9);
    }
    // The clavus: the frill along the back edge, a lobe to each of its rays.
    const lo = F.up(0);
    const hi = F.dn(0);
    const lobes = 9 + Math.floor(vr(0, 4));
    const frill: Pt[] = [];
    const root: Pt[] = [];
    for (let i = 0; i <= lobes * 4; i++) {
      const s = i / (lobes * 4);
      const y = lo[1] + (hi[1] - lo[1]) * s;
      const bulge = A * 0.13 * Math.pow(Math.sin(Math.PI * s), 0.55);
      const scallop = A * 0.022 * Math.pow(Math.abs(Math.sin(Math.PI * s * lobes)), 0.7);
      frill.push([-bulge - scallop + 0.5, y]);
      root.push([1.5, y]);
    }
    P('fin', root.concat(frill.slice().reverse()), true);
    for (let i = 1; i < lobes; i++) {
      const s = i / lobes;
      const y = lo[1] + (hi[1] - lo[1]) * s;
      const x = -A * 0.13 * Math.pow(Math.sin(Math.PI * s), 0.55) - A * 0.02;
      P('rays', [[1, y], [x * 0.5, y], [x * 0.94, y]]);
      P('finRay', [[0.5, y], [x * 0.85, y]]);
    }
    hull(kit, F);
    mark(F);
    const pc = F.at(0.66);
    paddle(kit, [pc[0], pc[1] - pc[2] * 0.06], A * 0.14, A * 0.1, Math.PI * 0.96, 'finF', 6);
    const [gx, gy] = F.at(0.69);
    P('detail', [[gx + 1, gy - A * 0.07], [gx, gy - A * 0.03], [gx + 0.6, gy + A * 0.01]]);
    // Its mouth: small, at the very front, pursed.
    const [sx, sy] = F.at(1);
    P('detail', [[sx - 1.6, sy - A * 0.022], [sx + 0.4, sy - A * 0.018], [sx + 0.9, sy], [sx + 0.4, sy + A * 0.018], [sx - 1.6, sy + A * 0.022]]);
    lateralLine(P, F, 0.06, 0.62, 0.3, false);
    const [ex, ey] = F.at(0.82);
    eyeAt(C, ex, ey - A * 0.07, A * 0.042);
    return 0;
  }

  if (form === 'lantern') {
    // A lanternfish: small, blunt, the eye huge, rows of lights along the
    // belly and a gland on the tail's stalk.
    const F = frameOf((t) => {
      let p = fusiform(t, g.skew!, g.blunt!);
      if (t < 0.14) p = Math.max(p, 0.32);
      if (t > 0.86) p *= 1 - Math.pow((t - 0.86) / 0.14, 2) * 0.25;
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave! * 0.5));
    finAlong(kit, F, 0.42, 0.56, -1, (q) => A * 0.38 * Math.sin(Math.PI * Math.pow(q, 0.55)), 0.45, 7);
    // The adipose: a small soft fin with no rays, near the tail.
    finAlong(kit, F, 0.12, 0.17, -1, (q) => A * 0.12 * Math.sin(Math.PI * q), 0.4, 0);
    finAlong(kit, F, 0.17, 0.33, 1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 8);
    const pv = F.dn(0.52);
    paddle(kit, [pv[0], pv[1] - 0.5], A * 0.36, A * 0.14, Math.PI * 0.78, 'fin', 4, 0);
    tail(F, F.depth * 1.05);
    hull(kit, F);
    mark(F);
    const [cx, cy, cw] = F.at(0.79);
    const [sx, sy, sw] = F.at(1);
    cleft(P, [sx + 0.2, sy + sw * 0.05], [cx, cy + cw * 0.3]);
    gillAt(P, F, 0.76, 0.42);
    // Its lights: a row along the belly and a short one above it, a pair by
    // the eye, and the gland on top of the tail's stalk.
    lights(C, F, 0.2, 0.74, g.photoN!, 0.9, 1.05);
    lights(C, F, 0.5, 0.72, 4, 0.66, 0.95);
    const [ux, uy] = F.up(0.08);
    C('dotGlow', ux, uy + 0.6, 5);
    C('dots', ux, uy + 0.6, 2.4, 0.8);
    see(F);
    const [ex, ey, ew] = F.at(0.87);
    const er = ew * 0.31;
    eyeAt(C, ex, ey - ew * 0.04, er);
    C('dotGlow', ex + er * 0.7, ey + er * 1.15, 2.4);
    C('dots', ex + er * 0.7, ey + er * 1.15, 0.9);
    return tailRays;
  }

  if (form === 'hatchet') {
    // A hatchetfish: the belly a deep keel, the tail's stalk a thread, the
    // eyes tubes looking up, lights along the keel.
    const F = frameOf((t) => {
      const back = -1.8 - A * 0.2 * smoothstep(0.1, 0.5, t) - A * 0.06 * smoothstep(0.5, 0.86, t) + A * 0.2 * Math.pow(Math.max(0, t - 0.86) / 0.14, 2);
      const step = 1.8 + (A * 0.7 - 1.8) * smoothstep(0.17, 0.33, t);
      const keel = t < 0.42 ? step : A * (0.7 - 0.56 * Math.pow((t - 0.42) / 0.58, 2));
      return [back, Math.max(keel, back + 1)];
    }, () => 0);
    // The dorsal, and in front of it the bony blade.
    finAlong(kit, F, 0.4, 0.5, -1, (q) => A * 0.17 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.4, 6);
    finAlong(kit, F, 0.52, 0.62, -1, (q) => A * 0.06 * Math.pow(q, 0.5) * (1 - q * 0.3), 0.8, 0, 'fin', true);
    // The anal fin, hung from the stalk behind the keel's back edge.
    finAlong(kit, F, 0.1, 0.23, 1, (q) => A * 0.2 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.6, 6);
    tail(F, 10, 22);
    hull(kit, F);
    // Its lights, along the edge of the keel and up its back step, pointing down.
    for (let q = 0; q < g.photoN!; q++) {
      const t = 0.35 + (q / Math.max(1, g.photoN! - 1)) * 0.55;
      const [x, y] = F.dn(t);
      C('dotGlow', x, y - 1.3, 2.6);
      C('dots', x, y - 1.3, 1);
    }
    for (let q = 0; q < 4; q++) {
      const [x, y] = F.dn(0.2 + q * 0.035);
      C('dotGlow', x + 1.2, y - 1.4, 2.2);
      C('dots', x + 1.2, y - 1.4, 0.85);
    }
    gillAt(P, F, 0.78, 0.3);
    // The silver flank: a few fine plates down its side, not a grid.
    for (let q = 0; q < 5; q++) {
      const t = 0.44 + q * 0.07;
      const a = F.up(t);
      const b = F.dn(t);
      P('lines', [[a[0], a[1] + (b[1] - a[1]) * 0.25], [a[0] - 1.5, a[1] + (b[1] - a[1]) * 0.6], [a[0] - 0.5, a[1] + (b[1] - a[1]) * 0.85]]);
    }
    const [sx, sy] = F.up(1);
    P('detail', [[sx + 0.4, sy + 0.8], [sx - 0.8, sy + A * 0.09], [sx - 2.6, sy + A * 0.13]]);
    // The eye: a tube up through the top of the head, its lens looking up.
    const [ex] = F.at(0.86);
    const [, top] = F.up(0.86);
    const er = A * 0.075;
    const ey = top + er * 0.9;
    P('detail', [[ex - er, ey + er * 1.4], [ex - er * 0.98, ey - er * 0.2]]);
    P('detail', [[ex + er, ey + er * 1.4], [ex + er * 0.98, ey - er * 0.2]]);
    eyeAt(C, ex, ey, er, [0, -0.35]);
    return tailRays;
  }

  if (form === 'barreleye') {
    // A barreleye: a clear dome over the head with the eyes inside it, green
    // tubes looking up; big flat fins, held out.
    const F = frameOf((t) => {
      const p = fusiform(t, g.skew!, g.blunt!);
      return [-A * 0.42 * p, A * 0.58 * p];
    }, sway(g.wave! * 0.4));
    finAlong(kit, F, 0.4, 0.5, -1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.4, 6);
    finAlong(kit, F, 0.12, 0.17, -1, (q) => A * 0.12 * Math.sin(Math.PI * q), 0.4, 0);
    finAlong(kit, F, 0.14, 0.26, 1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 6);
    tail(F, F.depth * 1.05);
    hull(kit, F);
    mark(F);
    gillAt(P, F, 0.66, 0.4);
    // The big fins, spread flat: the pectoral low behind the head, the pelvic under the belly.
    const pc = F.at(0.64);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.25], A * 0.95, A * 0.6, Math.PI * 0.86, 'finF', 10);
    const pv = F.dn(0.44);
    paddle(kit, [pv[0], pv[1] - 1.5], A * 0.85, A * 0.5, Math.PI * 0.72, 'finF', 9);
    // The dome: glass over the head, from the nape to the snout.
    const a = F.up(0.68);
    const b = F.up(0.97);
    const hdome = A * 0.9;
    const dome = cubic(b, [b[0] - 2, b[1] - hdome * 1.05], [a[0] + 6, a[1] - hdome * 1.25], a, 18);
    const back: Pt[] = [];
    for (let i = 0; i <= 10; i++) back.push(F.up(0.68 + 0.29 * (i / 10)));
    P('dome', dome.concat(back.slice(1, -1)), true);
    // The eyes inside it: two barrels from the head up under the dome's
    // top, a green lens on each; the far one a little ahead.
    for (const [t, k] of [[0.83, 0.85], [0.79, 1]] as const) {
      const [x, y] = F.up(t);
      const wdt = A * 0.17 * k;
      const h = hdome * 0.78 * k;
      const top = y - h;
      const barrel: Pt[] = [[x - wdt / 2, y + 1], ...quad([x - wdt / 2, y + 1], [x - wdt * 0.62, y - h * 0.5], [x - wdt * 0.42, top], 6).slice(1), ...quad([x + wdt * 0.42, top], [x + wdt * 0.62, y - h * 0.5], [x + wdt / 2, y + 1], 6)];
      P('lens', barrel, true);
      C('eye', x, top + wdt * 0.12, wdt * 0.4, wdt * 0.28);
    }
    // In front of the dome, the two nostrils that look like eyes.
    const [nx, ny, nw] = F.at(0.95);
    C('gape', nx, ny - nw * 0.2, A * 0.035);
    C('gape', nx + 1.6, ny - nw * 0.16, A * 0.03);
    const [sx, sy, sw] = F.at(1);
    cleft(P, [sx + 0.2, sy + sw * 0.1], [sx - A * 0.12, sy + sw * 0.3]);
    see(F);
    return tailRays;
  }

  if (form === 'bristlemouth') {
    // A bristlemouth: small and slim, the jaw running far back past the
    // eye, fine teeth along it, a row of lights down the belly.
    const F = frameOf((t) => {
      let p = fusiform(t, g.skew!, g.blunt!);
      if (t < 0.14) p = Math.max(p, 0.3);
      if (t > 0.8) p *= 1 - Math.pow((t - 0.8) / 0.2, 1.6) * 0.6;
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave! * 0.6));
    finAlong(kit, F, 0.38, 0.47, -1, (q) => A * 0.36 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 6);
    finAlong(kit, F, 0.12, 0.36, 1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.5)), 0.45, 10);
    tail(F, F.depth * 1.1);
    hull(kit, F);
    mark(F);
    const [sx, sy, sw] = F.at(1);
    const [cx, cy, cw] = F.at(0.72);
    cleft(P, [sx + 0.2, sy + sw * 0.15], [cx, cy + cw * 0.22]);
    for (let q = 0; q < 12; q++) {
      const [x, y] = along([[sx, sy + sw * 0.15], [cx, cy + cw * 0.22]], 0.06 + q * 0.075);
      P('lines', [[x, y], [x - 0.1, y - 0.9]]);
    }
    gillAt(P, F, 0.7, 0.42);
    lights(C, F, 0.16, 0.8, g.photoN!, 0.92, 0.8);
    lights(C, F, 0.42, 0.7, 5, 0.7, 0.7);
    see(F);
    const [ex, ey, ew] = F.at(0.9);
    eyeAt(C, ex, ey - ew * 0.12, ew * 0.18);
    return tailRays;
  }

  if (form === 'viper') {
    // A viperfish: long, the fangs too long for the mouth to close on, the
    // first ray of its dorsal grown long and lit at the tip.
    const F = frameOf((t) => {
      let p = fusiform(t, 0.8, 0.8);
      if (t < 0.12) p = Math.max(p, 0.26);
      if (t > 0.9) p *= 1 - Math.pow((t - 0.9) / 0.1, 2) * 0.3;
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave! * 0.6));
    finAlong(kit, F, 0.72, 0.79, -1, (q) => A * 0.4 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.4, 5);
    finAlong(kit, F, 0.08, 0.13, -1, (q) => A * 0.16 * Math.sin(Math.PI * q), 0.4, 0);
    finAlong(kit, F, 0.06, 0.14, 1, (q) => A * 0.36 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 6);
    const pv = F.dn(0.45);
    paddle(kit, [pv[0], pv[1] - 0.5], A * 0.5, A * 0.14, Math.PI * 0.8, 'fin', 4, 0);
    tail(F, F.depth * 1.2, 24);
    const [sx, sy, sw] = F.at(1);
    // The lower jaw a little past the upper.
    hull(kit, F, [[sx + 1.6, sy + sw * 0.32], [sx - 0.5, sy + sw * 0.55]]);
    const [cx, cy, cw] = F.at(0.8);
    cleft(P, [sx + 1.2, sy + sw * 0.28], [cx, cy + cw * 0.2]);
    gillAt(P, F, 0.77, 0.42);
    // The fangs: two from the lower jaw's tip, up past the snout and the
    // eye; two from the upper, down outside the lower jaw.
    const jaw: Pt = [sx + 1, sy + sw * 0.32];
    fang(P, [jaw[0] - 0.4, jaw[1] - 0.4], A * vr(0.9, 1.1), -Math.PI * 0.42, -0.32);
    fang(P, [jaw[0] - 2.6, jaw[1] - 0.3], A * vr(0.65, 0.8), -Math.PI * 0.46, -0.3);
    fang(P, [sx - 1.5, sy + sw * 0.1], A * vr(0.6, 0.75), Math.PI * 0.38, 0.28);
    fang(P, [sx - 4.5, sy + sw * 0.15], A * vr(0.4, 0.5), Math.PI * 0.42, 0.25);
    for (let q = 0; q < 4; q++) fang(P, [sx - 7 - q * 2.2, sy + sw * (0.2 + q * 0.01)], A * vr(0.12, 0.2), Math.PI * 0.5, 0.05);
    // The long first ray, arched up and forward over the head, its tip lit.
    const [rx, ry] = F.up(0.79);
    const len = 30 + vr(0, 12);
    const ray = hang(rx, ry, len, -Math.PI * 0.36, { wave: 0.03, freq: 0.1, ph: vr(0, TAU), curl: 0, drift: 0.9 }, 1.5);
    P('lure', ray);
    const e = ray[ray.length - 1];
    C('dotGlow', e[0], e[1], 4.5);
    C('dots', e[0], e[1], 1.4);
    lights(C, F, 0.12, 0.86, g.photoN!, 0.9, 0.85);
    lights(C, F, 0.3, 0.82, Math.round(g.photoN! * 0.6), 0.64, 0.7);
    const [ex, ey, ew] = F.at(0.91);
    eyeAt(C, ex, ey - ew * 0.15, ew * 0.18);
    return tailRays;
  }

  if (form === 'fangtooth') {
    // A fangtooth: short and heavy, the head most of it, the teeth huge.
    const F = frameOf((t) => {
      const p = 0.26 + 0.74 * smoothstep(0.04, 0.5, t);
      // A steep brow down to a short snout, and the deep jaw slung under it.
      const up = A * 0.5 * p * (t > 0.7 ? 1 - Math.pow((t - 0.7) / 0.3, 1.6) * 0.82 : 1);
      const dn = A * 0.5 * p * (t > 0.8 ? 1 - Math.pow((t - 0.8) / 0.2, 1.7) * 0.8 : 1);
      return [-up, dn];
    }, () => 0);
    finAlong(kit, F, 0.26, 0.56, -1, (q) => A * 0.18 * Math.sin(Math.PI * Math.pow(q, 0.7)), 0.4, 10);
    finAlong(kit, F, 0.16, 0.3, 1, (q) => A * 0.2 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 6);
    tail(F, F.depth * 0.9, 28);
    hull(kit, F);
    const [sx, sy, sw] = F.at(1);
    const [cx, cy, cw] = F.at(0.72);
    // The mouth: a great upturned gape, shut, from high on the snout back
    // and down under the eye.
    const tip: Pt = [sx + 0.3, sy - sw * 0.05];
    const corner: Pt = [cx, cy + cw * 0.16];
    const mouth = quad(tip, [cx + (sx - cx) * 0.4, cy + cw * 0.2], corner, 8);
    P('detail', mouth.concat([[corner[0] - 1.2, corner[1] + 1.2]]));
    // The two great fangs of the lower jaw, up over the upper lip in front of
    // the eye; the upper ones down over the lower.
    for (const [u, k] of [[0.12, 1], [0.34, 0.82]] as const) {
      const [x, y] = along(mouth, u);
      fang(P, [x, y + 1.2], A * k * vr(0.36, 0.44), -Math.PI * 0.55, -0.08);
    }
    for (let q = 0; q < 4; q++) {
      const [x, y] = along(mouth, 0.06 + q * 0.13);
      fang(P, [x, y - 0.8], A * vr(0.09, 0.16) * (q === 1 ? 1.7 : 1), Math.PI * 0.48, 0.06);
    }
    // The pits and channels of its head.
    for (let q = 0; q < 3; q++) {
      const [x, y, w] = F.at(0.78 + q * 0.04);
      P('detail', [[x, y - w * 0.32], [x - 1.2, y - w * 0.2], [x - 0.6, y - w * 0.08]]);
    }
    gillAt(P, F, 0.66, 0.44);
    const pc = F.at(0.62);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.08], A * 0.32, A * 0.14, Math.PI * 0.88, 'finF', 6);
    const [ex, ey, ew] = F.at(0.86);
    eyeAt(C, ex, ey - ew * 0.3, A * 0.05);
    return tailRays;
  }

  if (form === 'gulper') {
    // A gulper eel: a mouth on a whip. The jaws are most of its length
    // forward, the lower a loose pouch; the tail ends in a light.
    const hinge = 0.68;
    const J = 18 + A * 1.2;
    const F = frameOf((t) => {
      if (t >= hinge) {
        const s = (t - hinge) / (1 - hinge);
        return [-A * 0.55 * (1 - s * 0.6), A * 0.45 + J * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(s, 0.8) * 1.04)), 0.7)];
      }
      const p = Math.max(0.03, Math.pow(t / hinge, 1.4));
      return [-A * 0.46 * p, A * 0.54 * p];
    }, (t) => Math.sin(t * Math.PI * 2.4 + g.segs!) * g.wave! * Math.max(0, 1 - t / hinge) * 0.8);
    // Low fins along the back half.
    const [, , hw] = F.at(hinge);
    finAlong(kit, F, 0.02, 0.5, -1, (q) => Math.max(0.6, hw * 0.25 * Math.sin(Math.PI * q)), 0.2, 12);
    finAlong(kit, F, 0.02, 0.4, 1, (q) => Math.max(0.5, hw * 0.2 * Math.sin(Math.PI * q)), 0.2, 10);
    hull(kit, F);
    // The gape, open a little at the front: dark between the jaws.
    const [sx, sy] = F.up(1);
    const [hx, hy] = F.up(hinge);
    const g1 = quad([sx - 0.5, sy + 1], [(sx + hx) / 2, sy + 1.2], [hx + 2, hy + A * 0.9], 8);
    const g2 = quad([hx + 2, hy + A * 0.9], [(sx + hx) / 2, sy + J * 0.35], [sx - 1, sy + J * 0.22], 8);
    P('gape', g1.concat(g2.slice(1)), true);
    P('detail', quad([hx, hy + A * 0.6], [hx + 6, hy + A * 0.9], [hx + 14, hy + J * 0.9], 6));
    // The tail's tip: its light, and the frill it hangs from.
    const [tx, ty] = F.spine[0];
    for (let q = 0; q < 3; q++) P('lure', [[tx, ty], [tx - 2 - q, ty + (q - 1) * 1.5], [tx - 4 - q * 1.5, ty + (q - 1) * 2.6]]);
    C('dotGlow', tx - 1.5, ty, 5);
    C('dots', tx - 1.5, ty, 1.3);
    const [ex, ey] = F.up(0.95);
    eyeAt(C, ex, ey + 1.2, 0.85);
    return 0;
  }

  if (form === 'grenadier') {
    // A grenadier, a rattail: a big head on a body that tapers to a point,
    // no tail fin; a tall first dorsal and the second and the anal fin
    // running out to the tip.
    const F = frameOf((t) => {
      let p = 0.015 + 0.985 * Math.pow(Math.min(1, t / 0.7), 1.25);
      let up = A * 0.42 * p;
      let dn = A * 0.58 * p;
      if (t > 0.78) up *= 1 - Math.pow((t - 0.78) / 0.22, 2) * 0.82;
      if (t > 0.84) dn *= 1 - Math.pow((t - 0.84) / 0.16, 1.4) * 0.98;
      p = 0;
      return [-up, Math.max(dn, -up + 1 + p)];
    }, sway(g.wave! * 0.7, 1.4));
    finAlong(kit, F, 0.68, 0.75, -1, (q) => A * 0.56 * Math.pow(1 - q, 0.5) * Math.min(1, q * 6 + 0.2), 0.3, 6);
    const [r0x, r0y] = F.up(0.745);
    P('finRay', [[r0x, r0y], [r0x - A * 0.18, r0y - A * 0.6]]);
    finAlong(kit, F, 0.0, 0.64, -1, (q) => A * 0.07 * (1 - q * 0.6) * Math.min(1, (1 - q) * 8), 0.3, 22);
    finAlong(kit, F, 0.0, 0.6, 1, (q) => A * 0.13 * (1 - q * 0.75) * Math.min(1, (1 - q) * 6), 0.3, 22);
    hull(kit, F);
    mark(F);
    const pv = F.dn(0.72);
    paddle(kit, [pv[0], pv[1] - 0.5], A * 0.35, A * 0.1, Math.PI * 0.72, 'fin', 3, 0);
    P('barbel', hang(pv[0] - A * 0.2, pv[1] + A * 0.2, A * 0.5, Math.PI * 0.8, { wave: 0.05, freq: 0.2, ph: vr(0, TAU), curl: 0, drift: 0.3 }, 1.2));
    lateralLine(P, F, 0.12, 0.74, 0.32, false);
    gillAt(P, F, 0.74, 0.4);
    const pc = F.at(0.7);
    paddle(kit, [pc[0], pc[1] - pc[2] * 0.05], A * 0.38, A * 0.16, Math.PI * 0.9, 'finF', 6);
    // The mouth under the snout, and the barbel from the chin.
    const [mx, my] = F.dn(0.9);
    P('detail', [[mx + 2.5, my - 0.6], [mx - 1, my - 0.1], [mx - 3.2, my + 0.2], [mx - 3.8, my + 1]]);
    P('barbel', hang(mx - 1.5, my + 0.6, A * vr(0.18, 0.3), Math.PI * 0.55, { wave: 0.1, freq: 0.3, ph: vr(0, TAU), curl: 0.6, drift: 0.2 }, 1));
    const [ex, ey] = F.at(0.86);
    eyeAt(C, ex, ey - A * 0.12, A * 0.13);
    return 0;
  }

  if (form === 'tripod') {
    // A tripod fish: slim, standing on the floor on two rays of its pelvic
    // fins and one of its tail, its pectoral rays held up over its head.
    const F = frameOf((t) => {
      let p = fusiform(t, 1, 0.8);
      if (t < 0.14) p = Math.max(p, 0.3);
      let up = A * 0.46 * p;
      if (t > 0.78) up *= 1 - (t - 0.78) * 1.4;
      return [-up, A * 0.54 * p];
    }, () => 0);
    finAlong(kit, F, 0.42, 0.56, -1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.4, 6);
    finAlong(kit, F, 0.14, 0.34, 1, (q) => A * 0.28 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 8);
    tail(F, F.depth * 1.1, 24);
    // The stilts: long stiff rays, broad at the root and fine at the foot.
    const floorY = F.dn(0.6)[1] + 72;
    const stilt = (root: Pt, foot: Pt, w0: number) => {
      const dx = foot[0] - root[0];
      const dy = foot[1] - root[1];
      const d = Math.hypot(dx, dy);
      const nx = -dy / d;
      const ny = dx / d;
      const a: Pt[] = [];
      const b: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const s = i / 10;
        const w = w0 * (1 - s * 0.82);
        const bow = Math.sin(Math.PI * s) * d * 0.03;
        const x = root[0] + dx * s + nx * bow;
        const y = root[1] + dy * s + ny * bow;
        a.push([x + nx * w, y + ny * w]);
        b.unshift([x - nx * w, y - ny * w]);
      }
      P('fin', a.concat(b), true);
    };
    const pv = F.dn(0.6);
    stilt([pv[0] + 2, pv[1] - 1], [pv[0] + 14, floorY], 1.1);
    stilt([pv[0] - 1, pv[1] - 1], [pv[0] + 3, floorY - 1.5], 0.9);
    const [tx, ty, tw] = F.at(0);
    stilt([tx - 4, ty + tw * 0.4 + 2], [tx - 22, floorY - 0.5], 0.9);
    hull(kit, F);
    gillAt(P, F, 0.78, 0.4);
    // The pectoral rays, held up and forward like feelers.
    const [px, py, pw] = F.at(0.74);
    for (let q = 0; q < 6; q++) {
      const ang = -Math.PI * (0.22 + q * 0.035) + vr(-0.02, 0.02);
      P('barbel', hang(px, py - pw * 0.1, 26 + q * 3 + vr(-2, 2), ang, { wave: 0.02, freq: 0.1, ph: vr(0, TAU), curl: 0, drift: 0.25 }, 1.5));
    }
    const [sx, sy, sw] = F.at(1);
    cleft(P, [sx + 0.2, sy + sw * 0.15], [sx - A * 0.45, sy + sw * 0.3]);
    lateralLine(P, F, 0.1, 0.76, 0.36, false);
    see(F);
    const [ex, ey, ew] = F.at(0.9);
    eyeAt(C, ex, ey - ew * 0.2, Math.max(0.8, ew * 0.08));
    return tailRays;
  }

  if (form === 'grouper') {
    // A grouper: heavy, the head big and the mouth bigger, the lower jaw
    // past the upper; a long dorsal, spines in front and soft behind.
    const F = frameOf((t) => {
      let p = fusiform(t, g.skew!, g.blunt!);
      if (t < 0.16) p = Math.max(p, 0.36);
      if (t > 0.84) p *= 1 - Math.pow((t - 0.84) / 0.16, 1.6) * 0.4;
      return [-A * 0.44 * p, A * 0.56 * p];
    }, sway(g.wave! * 0.5));
    // The spiny part notched between its spines, the soft part rounded.
    finAlong(kit, F, 0.4, 0.74, -1, (q) => A * 0.2 * Math.min(1, 0.4 + q * 3) * (0.8 + 0.2 * Math.cos(q * 14 * Math.PI)), 0.3, 0, 'fin', true);
    finAlong(kit, F, 0.17, 0.41, -1, (q) => A * 0.27 * Math.sin(Math.PI * (0.25 + 0.75 * Math.pow(q, 0.8))), 0.45, 9);
    finAlong(kit, F, 0.17, 0.33, 1, (q) => A * 0.27 * Math.sin(Math.PI * (0.15 + 0.85 * Math.pow(q, 0.7))), 0.45, 7);
    const pv = F.dn(0.68);
    paddle(kit, [pv[0], pv[1] - 0.8], A * 0.42, A * 0.2, Math.PI * 0.72, 'fin', 5);
    tail(F, F.depth * 0.95);
    const [sx, sy, sw] = F.at(1);
    // The lower jaw out past the upper.
    hull(kit, F, [[sx + 1.8, sy + sw * 0.24], [sx - 0.5, sy + sw * 0.48]]);
    mark(F);
    lateralLine(P, F, 0.12, 0.74, 0.24, false);
    // The gill cover with its spines, and the edge of the cheek in front.
    gillAt(P, F, 0.72, 0.42);
    const [gx, gy, gw] = F.at(0.72);
    for (let q = 0; q < 3; q++) P('detail', [[gx + 1, gy - gw * (0.08 - q * 0.08)], [gx - 2.2, gy - gw * (0.06 - q * 0.08)]]);
    const [kx, ky, kw] = F.at(0.79);
    P('detail', quad([kx + 2, ky - kw * 0.12], [kx - 1.5, ky + kw * 0.1], [kx + 3, ky + kw * 0.34], 6));
    const [cx, cy, cw] = F.at(0.84);
    cleft(P, [sx + 1.4, sy + sw * 0.22], [cx, cy + cw * 0.2]);
    const pc = F.at(0.7);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.12], A * 0.5, A * 0.34, Math.PI * 0.9, 'finF', 9);
    see(F);
    const [ex, ey, ew] = F.at(0.88);
    eyeAt(C, ex, ey - ew * 0.24, ew * 0.11);
    return tailRays;
  }

  if (form === 'trigger') {
    // A triggerfish: a rhombus, the deep head running straight down to a
    // small mouth, the eye far back up it; the trigger, and behind it the
    // second dorsal and the anal fin mirrored.
    const F = frameOf((t) => {
      const ped = t < 0.16 ? A * (0.07 + 0.3 * t) : 0;
      const up = t < 0.6 ? Math.pow(smoothstep(0.06, 0.6, t), 0.8) : 1 - ((t - 0.6) / 0.4) * 0.86;
      const dn = t < 0.54 ? Math.pow(smoothstep(0.08, 0.54, t), 0.8) : 1 - ((t - 0.54) / 0.46) * 0.84;
      return [-Math.max(A * 0.5 * up, ped), Math.max(A * 0.5 * dn, ped)];
    }, () => 0);
    // The trigger: a stout spine and two short ones behind it, a web between.
    finAlong(kit, F, 0.56, 0.64, -1, (q) => A * 0.3 * Math.pow(1 - q, 0.9) + 0.6, 0.55, 0, 'fin', true);
    const [s0x, s0y] = F.up(0.64);
    P('finRay', [[s0x, s0y], [s0x - A * 0.16, s0y - A * 0.3]]);
    finAlong(kit, F, 0.14, 0.46, -1, (q) => A * 0.19 * Math.sin(Math.PI * (0.3 + 0.7 * Math.pow(q, 0.8))), 0.6, 12);
    finAlong(kit, F, 0.14, 0.44, 1, (q) => A * 0.18 * Math.sin(Math.PI * (0.3 + 0.7 * Math.pow(q, 0.8))), 0.6, 12);
    tail(F, A * 0.42, 28);
    hull(kit, F);
    mark(F);
    // The pelvic is only a knob of spines at the back of the belly's keel.
    const [kx, ky] = F.dn(0.52);
    P('detail', [[kx + 2, ky - 0.5], [kx - 1, ky + 2], [kx - 3, ky + 0.5]]);
    const pc = F.at(0.66);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.02], A * 0.16, A * 0.1, Math.PI * 0.92, 'finF', 6);
    const [gx, gy, gw] = F.at(0.69);
    P('detail', [[gx + 0.5, gy - gw * 0.12], [gx - 0.4, gy + gw * 0.02]]);
    const [sx, sy] = F.at(1);
    const [ex] = F.at(0.75);
    const [, ty] = F.up(0.75);
    const ey = ty + A * 0.14;
    // The groove from the eye down toward the mouth.
    P('detail', quad([ex + A * 0.05, ey + A * 0.04], [ex + A * 0.18, ey + A * 0.12], [sx - A * 0.06, sy - A * 0.02], 6));
    // A small mouth, the front teeth showing between the lips.
    P('detail', [[sx + 0.5, sy - A * 0.012], [sx - 2.2, sy + A * 0.006], [sx - 3, sy + A * 0.02]]);
    fang(P, [sx - 0.3, sy - A * 0.006], A * 0.035, Math.PI * 0.5, 0);
    fang(P, [sx - 0.3, sy + A * 0.01], A * 0.03, -Math.PI * 0.5, 0);
    eyeAt(C, ex, ey, A * 0.05);
    return tailRays;
  }

  if (form === 'flying') {
    // A flying fish: slim and silver, the pectorals two long wings and the
    // pelvics a second pair, the tail's lower lobe the longer.
    const F = frameOf((t) => {
      let p = fusiform(t, g.skew!, g.blunt!);
      if (t < 0.14) p = Math.max(p, 0.3);
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave! * 0.4));
    // The far wing, behind the body.
    const [px, py, pw] = F.at(0.76);
    const root: Pt = [px, py - pw * 0.18];
    wing(kit, [root[0] + 2, root[1] - 1], 48, 15, Math.PI * 1.1, 'fin');
    finAlong(kit, F, 0.17, 0.3, -1, (q) => A * 0.5 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.5, 7);
    finAlong(kit, F, 0.15, 0.27, 1, (q) => A * 0.45 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.5, 6);
    const pv = F.dn(0.46);
    paddle(kit, [pv[0], pv[1] - 0.5], 26, 9, Math.PI * 0.94, 'fin', 6);
    // The tail, forked, the lower lobe reaching on past the upper.
    const [tx, ty] = F.spine[0];
    const H = Math.max(9, A * 0.9);
    const tf: Pt[] = [[tx + 2, ty - 1.2], [tx - 9, ty - H * 0.55], [tx - 23, ty - H], [tx - 16, ty - H * 0.45], [tx - 11, ty + H * 0.05], [tx - 21, ty + H * 0.6], [tx - 34, ty + H * 1.2], [tx - 12, ty + H * 0.55], [tx + 2, ty + 1.2]];
    P('fin', tf, true);
    fanRays(P, [tx + 1, ty], tf.slice(2, 7), 14);
    for (let q = -3; q <= 3; q++) P('finRay', [[tx, ty], [tx - 16, ty + q * H * 0.22 + (q > 0 ? q * 1.2 : 0)]]);
    tailRays = 7;
    hull(kit, F);
    mark(F);
    lateralLine(P, F, 0.1, 0.78, 0.86, false);
    gillAt(P, F, 0.8, 0.42);
    const [sx, sy, sw] = F.at(1);
    const [cx, cy, cw] = F.at(0.92);
    cleft(P, [sx + 0.2, sy - sw * 0.05], [cx, cy + cw * 0.05]);
    // The near wing, spread out over the flank.
    wing(kit, root, 54, 14, Math.PI * 1.03, 'finF');
    see(F);
    const [ex, ey, ew] = F.at(0.88);
    eyeAt(C, ex, ey - ew * 0.06, ew * 0.22);
    return tailRays;
  }

  if (form === 'trumpet') {
    // A trumpetfish: a stick of a fish, the snout a long tube flaring at the
    // mouth, a row of free spines down its back and the soft fins far back.
    const F = frameOf((t) => {
      let p = 0.3 + 0.7 * smoothstep(0, 0.5, t);
      if (t > 0.62) p *= 1 - 0.5 * smoothstep(0.62, 0.8, t);
      if (t > 0.96) p *= 1 + 0.35 * smoothstep(0.96, 1, t);
      return [-A * 0.5 * p, A * 0.5 * p];
    }, sway(g.wave! * 0.5, 1.4));
    finAlong(kit, F, 0.12, 0.24, -1, (q) => A * 1.5 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.5, 7);
    finAlong(kit, F, 0.12, 0.23, 1, (q) => A * 1.4 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.5, 7);
    for (let q = 0; q < 9; q++) {
      const [x, y] = F.up(0.32 + q * 0.03);
      P('finRay', [[x, y + 0.3], [x - 0.9, y - A * 0.42]]);
    }
    const pv = F.dn(0.42);
    paddle(kit, [pv[0], pv[1] - 0.3], A * 0.9, A * 0.35, Math.PI * 0.85, 'fin', 3, 0);
    tail(F, A * 1.3, 22);
    hull(kit, F);
    mark(F);
    gillAt(P, F, 0.6, 0.4);
    const pc = F.at(0.58);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.1], A * 0.9, A * 0.5, Math.PI * 0.9, 'finF', 5);
    const [sx, sy, sw] = F.at(1);
    P('detail', [[sx + 0.4, sy - sw * 0.1], [sx - 2.2, sy + sw * 0.2], [sx - 3, sy + sw * 0.32]]);
    const [bx, by] = F.dn(0.97);
    P('barbel', hang(bx, by - 0.2, A * 0.55, Math.PI * 0.55, { wave: 0.05, freq: 0.3, ph: vr(0, TAU), curl: 0.4, drift: 0.2 }, 0.8));
    see(F);
    const [ex, ey, ew] = F.at(0.64);
    eyeAt(C, ex, ey - ew * 0.12, ew * 0.24);
    return tailRays;
  }

  if (form === 'swordfish') {
    // A swordfish: the bill a flat blade a third of its length again, a tall
    // sickle of a dorsal, long sickle pectorals, a great crescent tail on a
    // keeled stalk; no pelvic fins and no scales to speak of.
    const F = frameOf((t) => {
      let p = fusiform(t, g.skew!, g.blunt!);
      if (t < 0.12) p = Math.max(p, 0.22);
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave! * 0.3));
    const sickle = (side: -1 | 1, tf: number, tb: number, h: number) => {
      const f = side < 0 ? F.up(tf) : F.dn(tf);
      const b = side < 0 ? F.up(tb) : F.dn(tb);
      const tip: Pt = [b[0] - h * 0.18, f[1] + side * h];
      const front = cubic([f[0], f[1] - side], [f[0] - 1, f[1] + side * h * 0.55], [tip[0] + h * 0.3, tip[1] - side * h * 0.08], tip, 12);
      const back = quad(tip, [b[0] + h * 0.12, b[1] + side * h * 0.3], [b[0], b[1] - side], 8).slice(1);
      const base: Pt[] = [];
      for (let i = 0; i <= 8; i++) base.push(side < 0 ? F.up(tb + (tf - tb) * (i / 8)) : F.dn(tb + (tf - tb) * (i / 8)));
      P('fin', front.concat(back, base.map(([x, y]) => [x, y - side] as Pt)), true);
      pairRays(P, base.slice().reverse(), front, 7);
    };
    sickle(-1, 0.74, 0.62, A * 1.15);
    sickle(1, 0.42, 0.34, A * 0.5);
    finAlong(kit, F, 0.11, 0.15, -1, (q) => A * 0.22 * Math.sin(Math.PI * q), 0.5, 0);
    finAlong(kit, F, 0.11, 0.15, 1, (q) => A * 0.2 * Math.sin(Math.PI * q), 0.5, 0);
    tail(F, A * 1.6, 34);
    const [sx, sy, sw] = F.at(1);
    // The bill: a flat blade from the upper jaw, out to a point.
    const L = 30 + vr(0, 8);
    const bw = Math.max(sw, A * 0.2);
    hull(kit, F, [[sx - 0.5, sy - bw * 0.4], [sx + L * 0.4, sy - bw * 0.22], [sx + L, sy - bw * 0.04], [sx + L * 0.4, sy + bw * 0.06], [sx - 0.2, sy + bw * 0.2]]);
    P('detail', [[sx + 1, sy - bw * 0.1], [sx + L * 0.8, sy - bw * 0.06]]);
    // The keel along the tail's stalk.
    const [k0x, k0y] = F.at(0.02);
    const [k1x, k1y] = F.at(0.13);
    P('detail', [[k0x, k0y - 0.3], [k1x, k1y]]);
    const [cx, cy, cw] = F.at(0.9);
    cleft(P, [sx - 0.5, sy + sw * 0.2], [cx, cy + cw * 0.25]);
    gillAt(P, F, 0.8, 0.44);
    const pc = F.at(0.77);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.3], A * 1.7, A * 0.32, Math.PI * 0.8, 'finF', 6, 0);
    see(F);
    const [ex, ey, ew] = F.at(0.93);
    eyeAt(C, ex, ey - ew * 0.08, ew * 0.22);
    return tailRays;
  }

  if (form === 'swallower') {
    // A black swallower: slim and black, long jaws full of needles, and now
    // and then the sac of its belly stretched round a fish bigger than it.
    const F = frameOf((t) => {
      let p = fusiform(t, 0.9, 0.85);
      if (t < 0.12) p = Math.max(p, 0.28);
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave! * 0.6));
    finAlong(kit, F, 0.56, 0.64, -1, (q) => A * 0.4 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.4, 0, 'fin', true);
    finAlong(kit, F, 0.16, 0.5, -1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.4)), 0.4, 14);
    finAlong(kit, F, 0.15, 0.46, 1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.4)), 0.4, 14);
    tail(F, F.depth * 1.1, 24);
    const [sx, sy, sw] = F.at(1);
    hull(kit, F, [[sx + 1.4, sy + sw * 0.3], [sx - 0.6, sy + sw * 0.56]]);
    const [cx, cy, cw] = F.at(0.78);
    cleft(P, [sx + 1, sy + sw * 0.26], [cx, cy + cw * 0.2]);
    for (let q = 0; q < 6; q++) {
      const [x, y] = along([[sx, sy + sw * 0.26], [cx, cy + cw * 0.2]], 0.08 + q * 0.14);
      fang(P, [x, y - 0.4], A * vr(0.1, 0.22) * (q === 0 ? 1.8 : 1), Math.PI * 0.5, 0.05);
      fang(P, [x - 1, y + 0.4], A * vr(0.08, 0.16), -Math.PI * 0.5, -0.05);
    }
    gillAt(P, F, 0.74, 0.42);
    const pc = F.at(0.7);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.15], A * 0.6, A * 0.24, Math.PI * 0.88, 'finF', 6);
    if (g.segs! % 3 !== 0) {
      // The sac: the belly stretched thin and pale, hung under the body, and
      // in it the swallowed fish, curled round on itself.
      const a = F.dn(0.68);
      const b = F.dn(0.3);
      const deep = A * 1.6;
      const sac = cubic(a, [a[0] + 2, a[1] + deep * 1.1], [b[0] - 4, b[1] + deep * 1.1], b, 18);
      const belly: Pt[] = [];
      for (let i = 1; i < 10; i++) belly.push(F.dn(0.3 + 0.38 * (i / 10)));
      P('dome', sac.concat(belly), true);
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2 + deep * 0.5;
      const rad = Math.min((a[0] - b[0]) * 0.32, deep * 0.32);
      const outer: Pt[] = [];
      const inner: Pt[] = [];
      const turn = vr(0, 0.6);
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        const ang = Math.PI * (0.1 + turn) + u * Math.PI * 1.5;
        const w = rad * 0.34 * Math.sin(Math.PI * (0.08 + 0.84 * Math.pow(u, 0.8)));
        outer.push([mx + Math.cos(ang) * (rad + w), my + Math.sin(ang) * (rad + w) * 0.8]);
        inner.push([mx + Math.cos(ang) * (rad - w), my + Math.sin(ang) * (rad - w) * 0.8]);
      }
      P('guts', outer.concat(inner.slice().reverse()), true);
      // Its tail at the one end, its eye at the other.
      const [t0x, t0y] = outer[0];
      const [t1x, t1y] = inner[0];
      const tm: Pt = [(t0x + t1x) / 2, (t0y + t1y) / 2];
      const back = Math.PI * (0.1 + turn) - Math.PI / 2;
      P('guts', [[tm[0], tm[1]], [tm[0] + Math.cos(back - 0.4) * rad * 0.4, tm[1] + Math.sin(back - 0.4) * rad * 0.32], [tm[0] + Math.cos(back) * rad * 0.25, tm[1] + Math.sin(back) * rad * 0.2], [tm[0] + Math.cos(back + 0.4) * rad * 0.4, tm[1] + Math.sin(back + 0.4) * rad * 0.32], [tm[0], tm[1]]], true);
      const [h0x, h0y] = outer[15];
      const [h1x, h1y] = inner[15];
      C('detail', h0x * 0.55 + h1x * 0.45, h0y * 0.55 + h1y * 0.45, Math.max(0.5, rad * 0.06));
    }
    const [ex, ey, ew] = F.at(0.9);
    eyeAt(C, ex, ey - ew * 0.16, ew * 0.15);
    return tailRays;
  }

  if (form === 'snipe' || form === 'cutthroat') {
    // The eel forms on a plain eel's body. A snipe eel: a thread of a body,
    // the jaws a bird's bill flaring apart at the tips, the eye big. A
    // cutthroat eel: plain and pale, its gill slits low under the throat.
    const snipe = form === 'snipe';
    const F = frameOf((t) => {
      let p = snipe ? 0.02 + 0.98 * Math.pow(t, 0.45) : t < 0.7 ? 0.02 + 0.98 * Math.pow(t / 0.7, 0.55) : 1;
      if (t > 0.9) p *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.9) / 0.1, 2) * (snipe ? 0.5 : 0.75)));
      return [-A * 0.48 * p, A * 0.52 * p];
    }, (t) => Math.sin(t * Math.PI * (snipe ? 3.4 : 2.6) + g.segs!) * g.wave! * Math.pow(1 - t, 1.2) * 0.8);
    // The fin: along the back, round the point and forward under the belly.
    const n0 = Math.round(F.N * (snipe ? 0.86 : 0.7));
    const v0 = Math.round(F.N * (snipe ? 0.8 : 0.6));
    const H = A * (snipe ? 0.55 : 0.45);
    const outer: Pt[] = [];
    const baseTop: Pt[] = [];
    const baseBot: Pt[] = [];
    for (let i = n0; i >= 0; i--) {
      const [x, y, w] = F.spine[i];
      outer.push([x, y - w * 0.46 - H * Math.min(1, (n0 - i) / 4)]);
      baseTop.push([x, y - w * 0.46 + 0.3]);
    }
    const [tx, ty] = F.spine[0];
    outer.push([tx - H * 1.4, ty]);
    for (let i = 0; i <= v0; i++) {
      const [x, y, w] = F.spine[i];
      outer.push([x, y + w * 0.54 + H * 0.9 * Math.min(1, (v0 - i) / 4)]);
      baseBot.push([x, y + w * 0.54 - 0.3]);
    }
    P('fin', outer.concat(baseBot.slice().reverse(), baseTop.slice().reverse()), true);
    pairRays(P, baseTop, outer.slice(0, baseTop.length), Math.round(baseTop.length * 0.6));
    pairRays(P, baseBot, outer.slice(baseTop.length + 1), Math.round(baseBot.length * 0.6));
    const [sx, sy, sw] = F.at(1);
    if (snipe) {
      // The bill: the two jaws long and thin, apart at the root and curving
      // away from each other at the tips, the upper up and the lower down.
      const L = 18 + vr(0, 5);
      hull(kit, F, [
        [sx, sy - sw * 0.34],
        [sx + L * 0.5, sy - sw * 0.42],
        [sx + L * 0.9, sy - sw * 0.5 - 1.6],
        [sx + L, sy - sw * 0.5 - 3.2],
        [sx + L * 0.88, sy - sw * 0.2 - 1.5],
        [sx + L * 0.45, sy - sw * 0.12],
        [sx + 0.8, sy + sw * 0.02],
        [sx + L * 0.45, sy + sw * 0.18 + 0.6],
        [sx + L * 0.86, sy + sw * 0.3 + 2.4],
        [sx + L * 0.96, sy + sw * 0.42 + 4],
        [sx + L * 0.8, sy + sw * 0.56 + 2.4],
        [sx + L * 0.4, sy + sw * 0.6],
        [sx - 0.5, sy + sw * 0.56],
      ]);
      const [ex, ey, ew] = F.at(0.975);
      eyeAt(C, ex, ey - ew * 0.04, ew * 0.36);
      return 0;
    }
    hull(kit, F);
    lateralLine(P, F, 0.04, 0.86, 0.38, false);
    // The cut throat: the gill slit low on the belly, under the pectoral.
    const [ax, ay] = F.dn(0.82);
    const [bx2, by2, bw2] = F.at(0.86);
    P('detail', [[ax, ay - 0.6], [bx2, by2 + bw2 * 0.3]]);
    const pc = F.at(0.87);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.05], A * 1.2, A * 0.8, Math.PI * 0.88, 'finF', 6);
    const [cx, cy, cw] = F.at(0.94);
    cleft(P, [sx + 0.3, sy + sw * 0.1], [cx, cy + cw * 0.2]);
    const [ex, ey, ew] = F.at(0.955);
    eyeAt(C, ex, ey - ew * 0.2, ew * 0.17);
    return 0;
  }

  if (form === 'whalefish') {
    // A whalefish: a whale's shape, the mouth running back most of the head,
    // the eye a speck, the lateral line a row of great hollow pores; the
    // dorsal and the anal set opposite each other far back.
    const F = frameOf((t) => {
      // Deep to the head, then round at the front: a whale's blunt snout.
      const head = fusiform(0.78, g.skew!, g.blunt!);
      let p = t < 0.78 ? fusiform(t, g.skew!, g.blunt!) : head * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.78) / 0.22, 2) * 0.96));
      if (t < 0.14) p = Math.max(p, 0.3);
      return [-A * 0.44 * p, A * 0.56 * p];
    }, sway(g.wave! * 0.5));
    finAlong(kit, F, 0.14, 0.3, -1, (q) => A * 0.32 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 8);
    finAlong(kit, F, 0.14, 0.3, 1, (q) => A * 0.3 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 8);
    tail(F, F.depth * 0.9);
    hull(kit, F);
    mark(F);
    // The great pores along the lateral line, hollow and dark inside.
    const pores: Pt[] = [];
    for (let i = Math.round(F.N * 0.1); i <= Math.round(F.N * 0.76); i++) {
      const [x, y, w] = F.spine[i];
      pores.push([x, y - w * 0.46 + w * 0.32]);
    }
    P('detail', pores);
    for (let q = 0; q < 8; q++) {
      const [x, y] = along(pores, 0.06 + q * 0.125);
      C('detail', x, y, A * 0.045, A * 0.032);
      C('gape', x, y + 0.2, A * 0.025, A * 0.016);
    }
    const [sx, sy, sw] = F.at(1);
    const [cx, cy, cw] = F.at(0.7);
    // The mouth: from the snout back past the speck of an eye, in a long bow.
    const mouth = quad([sx + 0.4, sy + sw * 0.02], [cx + (sx - cx) * 0.5, cy + cw * 0.22], [cx, cy + cw * 0.12], 10);
    P('detail', mouth.concat([[cx - 1.2, cy + cw * 0.18]]));
    gillAt(P, F, 0.66, 0.44);
    const pc = F.at(0.64);
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.2], A * 0.32, A * 0.16, Math.PI * 0.86, 'finF', 6);
    const [ex, ey, ew] = F.at(0.86);
    eyeAt(C, ex, ey - ew * 0.26, Math.max(0.6, A * 0.022));
    return tailRays;
  }

  if (form === 'chimaera') {
    // A chimaera, a ratfish: a big blunt head with a big eye, wings for
    // pectorals, a tall first dorsal with a spine before it, and the body
    // running out to a whip with a low fin over and under it.
    const F = frameOf((t) => {
      const p = 0.012 + 0.988 * Math.pow(Math.min(1, t / 0.66), 1.4);
      let up = A * 0.44 * p;
      let dn = A * 0.56 * p;
      if (t > 0.84) up *= 1 - Math.pow((t - 0.84) / 0.16, 2) * 0.62;
      if (t > 0.8) dn *= 1 - Math.pow((t - 0.8) / 0.2, 1.5) * 0.7;
      return [-up, Math.max(dn, -up + 1)];
    }, sway(g.wave! * 0.6, 1.4));
    // The far pectoral, behind.
    const pc = F.at(0.7);
    paddle(kit, [pc[0] + 2, pc[1] + pc[2] * 0.1], A * 1.4, A * 0.9, Math.PI * 0.86, 'fin', 10);
    finAlong(kit, F, 0.6, 0.7, -1, (q) => A * 0.72 * Math.pow(1 - q, 0.6) * Math.min(1, q * 10 + 0.4), 0.45, 7);
    const [spx, spy] = F.up(0.7);
    fang(P, [spx, spy + 0.5], A * 0.8, -Math.PI * 0.62, -0.08, 'fin');
    finAlong(kit, F, 0.1, 0.57, -1, (q) => A * 0.14 * Math.min(1, q * 8 + 0.2) * Math.min(1, (1 - q) * 6), 0.25, 20);
    finAlong(kit, F, 0.02, 0.24, 1, (q) => A * 0.12 * Math.min(1, q * 6 + 0.3) * Math.min(1, (1 - q) * 5), 0.25, 10);
    const pv = F.dn(0.5);
    paddle(kit, [pv[0], pv[1] - 1], A * 0.6, A * 0.36, Math.PI * 0.82, 'fin', 6);
    hull(kit, F);
    mark(F);
    // The whip.
    const [tx, ty] = F.spine[0];
    const ph = vr(0, TAU);
    const whip: Pt[] = [];
    for (let s = 0; s <= 30; s += 2) whip.push([tx - s, ty + Math.sin(s / 9 + ph) * 2 * Math.min(1, s / 10)]);
    P('tentF', whip);
    // Its lateral line wavering down the side, and the canals of the head.
    const ll: Pt[] = [];
    for (let i = Math.round(F.N * 0.06); i <= Math.round(F.N * 0.82); i++) {
      const [x, y, w] = F.spine[i];
      ll.push([x, y - w * 0.46 + w * 0.36 + Math.sin(i * 1.3) * w * 0.025]);
    }
    P('detail', ll);
    const [hx, hy, hw] = F.at(0.9);
    P('detail', quad([hx - 6, hy + hw * 0.1], [hx + 2, hy + hw * 0.32], [hx + 7, hy + hw * 0.05], 8));
    P('detail', quad([hx - 3, hy - hw * 0.34], [hx + 4, hy - hw * 0.44], [hx + 7.5, hy - hw * 0.12], 8));
    gillAt(P, F, 0.76, 0.3);
    // The near pectoral, a wing spread over the flank.
    paddle(kit, [pc[0], pc[1] + pc[2] * 0.22], A * 1.6, A * 1, Math.PI * 0.8, 'finF', 12);
    // The small mouth under the snout, a rabbit's two plates in front.
    const [mx, my] = F.dn(0.95);
    P('detail', [[mx + 2, my - 0.4], [mx - 0.5, my + 0.2], [mx - 2.5, my - 0.2]]);
    fang(P, [mx + 1.4, my - 0.2], A * 0.05, Math.PI * 0.5, 0);
    const [ex, ey] = F.at(0.86);
    eyeAt(C, ex, ey - A * 0.07, A * 0.12);
    return 0;
  }

  if (form === 'lizard') {
    // A deep-sea lizardfish lying on the ooze: long and round, the head
    // flat as a crocodile's and its jaw full of needles, propped on its
    // pelvic fins.
    const F = frameOf((t) => {
      let up = 0.38 + 0.62 * smoothstep(0, 0.42, t);
      let dn = up;
      if (t > 0.62) up *= 1 - smoothstep(0.62, 1, t) * 0.72;
      if (t > 0.8) dn *= 1 - smoothstep(0.8, 1, t) * 0.4;
      return [-A * 0.5 * up, A * 0.5 * dn];
    }, () => 0);
    finAlong(kit, F, 0.48, 0.6, -1, (q) => A * 0.65 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.4, 8);
    finAlong(kit, F, 0.14, 0.19, -1, (q) => A * 0.22 * Math.sin(Math.PI * q), 0.4, 0);
    finAlong(kit, F, 0.16, 0.3, 1, (q) => A * 0.4 * Math.sin(Math.PI * Math.pow(q, 0.6)), 0.45, 7);
    tail(F, F.depth * 1.1, 24);
    hull(kit, F);
    mark(F);
    lateralLine(P, F, 0.08, 0.76, 0.42, false);
    gillAt(P, F, 0.74, 0.42);
    const [sx, sy, sw] = F.at(1);
    const [cx, cy, cw] = F.at(0.76);
    cleft(P, [sx + 0.3, sy + sw * 0.1], [cx, cy + cw * 0.22]);
    for (let q = 0; q < 9; q++) {
      const [x, y] = along([[sx, sy + sw * 0.1], [cx, cy + cw * 0.22]], 0.05 + q * 0.1);
      fang(P, [x, y - 0.3], A * vr(0.1, 0.18), Math.PI * 0.5, 0.06);
    }
    // The pelvic fins, under it and down to the floor: what it rests on.
    const pv = F.dn(0.6);
    paddle(kit, [pv[0], pv[1] - 0.6], A * 0.85, A * 0.3, Math.PI * 0.62, 'finF', 6, 0);
    const pc = F.at(0.72);
    paddle(kit, [pc[0], pc[1] - pc[2] * 0.1], A * 0.7, A * 0.26, Math.PI * 1.06, 'finF', 6);
    const [ex, ey, ew] = F.at(0.88);
    eyeAt(C, ex, ey - ew * 0.22, ew * 0.13);
    return tailRays;
  }

  if (form === 'cusk' || form === 'snailfish' || form === 'eelpout' || form === 'ethereal') {
    // The soft ones whose fins run round the back end: a cusk-eel, long and
    // tapering; a snailfish, a tadpole of glass (the ethereal one with wings
    // of free rays trailing from its pectorals); an eelpout, thick, lipped.
    const cusk = form === 'cusk';
    const ether = form === 'ethereal';
    const snail = form === 'snailfish' || ether;
    const F = frameOf((t) => {
      let p: number;
      if (snail) {
        p = t < 0.76 ? Math.min(1, 0.03 + 0.97 * Math.pow(t / 0.66, 0.72)) : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.76) / 0.26, 2)));
        return [-A * 0.44 * p, A * 0.56 * p];
      }
      p = Math.max(0.02, Math.min(1, Math.pow(t / (cusk ? 0.55 : 0.42), cusk ? 0.6 : 0.5)));
      if (t > 0.88) p *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.88) / 0.12, 2) * (cusk ? 0.8 : 0.7)));
      return [-A * 0.46 * p, A * 0.54 * p];
    }, sway(g.wave!, snail ? 0.8 : 1.6));
    // The fin: along the back, round the point and forward under the belly.
    const dorsal0 = snail ? 0.6 : cusk ? 0.66 : 0.74;
    const anal0 = snail ? 0.5 : cusk ? 0.52 : 0.56;
    const H = snail ? A * 0.13 : A * 0.26;
    const n0 = Math.round(F.N * dorsal0);
    const v0 = Math.round(F.N * anal0);
    const outer: Pt[] = [];
    const baseTop: Pt[] = [];
    const baseBot: Pt[] = [];
    const ph = vr(0, TAU);
    const hAt = (i: number, from: number) => {
      const rise = Math.min(1, (from - i) / 5);
      return H * rise * (0.7 + 0.4 * (1 - i / F.N)) * (1 + (snail ? 0.12 : 0.06) * Math.sin(i * 0.7 + ph));
    };
    for (let i = n0; i >= 0; i--) {
      const [x, y, w] = F.spine[i];
      outer.push([x, y - w * 0.46 - hAt(i, n0)]);
      baseTop.push([x, y - w * 0.46 + 0.5]);
    }
    const [tx, ty] = F.spine[0];
    outer.push([tx - H * (snail ? 0.9 : 1.2), ty + H * 0.05]);
    for (let i = 0; i <= v0; i++) {
      const [x, y, w] = F.spine[i];
      outer.push([x, y + w * 0.54 + hAt(i, v0) * 0.9]);
      baseBot.push([x, y + w * 0.54 - 0.5]);
    }
    // Closed back along its root, so through a glass body no line crosses it.
    P('fin', outer.concat(baseBot.slice().reverse(), baseTop.slice().reverse()), true);
    pairRays(P, baseTop, outer.slice(0, baseTop.length), Math.round(baseTop.length * 0.5));
    pairRays(P, baseBot, outer.slice(baseTop.length + 1), Math.round(baseBot.length * 0.5));
    hull(kit, F);
    if (!snail) mark(F);
    if (ether) {
      // Its pectoral: a wide fan, and from its lower edge the free rays,
      // long, trailing back under it like a gown.
      const pc = F.at(0.68);
      const fan = paddle(kit, [pc[0], pc[1] + pc[2] * 0.1], A * 0.6, A * 0.6, Math.PI * 0.86, 'finF', 10);
      const ph = vr(0, TAU);
      for (let q = 0; q < 9; q++) {
        const [x, y] = fan[Math.min(fan.length - 1, 2 + q)];
        P('barbel', hang(x, y, A * (1.5 + q * 0.1) + vr(-3, 3), Math.PI * (0.9 + q * 0.008), { wave: 0.06, freq: 0.14, ph: ph + q * 0.7, curl: 0.3, drift: 0.12 }, 1.5));
      }
    } else if (snail) {
      // Its pectoral: big and round, notched into two lobes.
      const pc = F.at(0.68);
      paddle(kit, [pc[0], pc[1] + pc[2] * 0.12], A * 0.42, A * 0.36, Math.PI * 0.82, 'finF', 9);
      paddle(kit, [pc[0] - 1, pc[1] + pc[2] * 0.3], A * 0.3, A * 0.2, Math.PI * 0.6, 'finF', 5);
    } else {
      const pc = F.at(0.76);
      paddle(kit, [pc[0], pc[1] + pc[2] * 0.08], A * (cusk ? 0.45 : 0.6), A * (cusk ? 0.3 : 0.45), Math.PI * 0.88, 'finF', 8);
    }
    gillAt(P, F, snail ? 0.72 : 0.78, 0.38);
    const [sx, sy, sw] = F.at(1);
    if (form === 'eelpout') {
      // The lips: thick and fleshy, the upper over the lower.
      const [cx, cy, cw] = F.at(0.9);
      P('finF', [[sx + 0.6, sy + sw * 0.05], [sx - 1, sy - sw * 0.04], [cx, cy + cw * 0.1], [cx - 1, cy + cw * 0.22], [cx + 1, cy + cw * 0.26], [sx - 1, sy + sw * 0.2]], true);
      P('finF', [[sx - 0.4, sy + sw * 0.24], [cx + 1, cy + cw * 0.3], [cx - 0.6, cy + cw * 0.36], [cx + 1, cy + cw * 0.46], [sx - 2, sy + sw * 0.42]], true);
    } else {
      cleft(P, [sx + 0.2, sy + sw * 0.12], F.at(snail ? 0.93 : 0.9).slice(0, 2).map((v, i) => (i ? v + F.at(0.9)[2] * 0.22 : v)) as Pt);
    }
    if (cusk) {
      // Its pelvic fins are two threads under the chin.
      const [bx, by] = F.dn(0.9);
      for (let q = 0; q < 2; q++) P('barbel', hang(bx - q * 1.5, by - 0.5, A * vr(0.7, 1), Math.PI * (0.62 + q * 0.06), { wave: 0.06, freq: 0.25, ph: vr(0, TAU), curl: 0.5, drift: 0.3 }, 1));
    }
    if (!snail) lateralLine(P, F, 0.1, 0.78, 0.3, false);
    see(F);
    const [ex, ey, ew] = F.at(snail ? 0.88 : 0.9);
    eyeAt(C, ex, ey - ew * (form === 'eelpout' ? 0.24 : 0.16), snail ? A * 0.05 : ew * (cusk ? 0.09 : 0.11));
    return 0;
  }

  if (form === 'flatfish') {
    // A flatfish, lying on the floor and seen from above as a plate shows
    // one: an oval with a fringe of fin all round, both eyes on its top side.
    const F = frameOf((t) => {
      let e = Math.pow(Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.52) / 0.46, 2))), 0.85);
      if (t < 0.14) e = Math.max(e, 0.16);
      return [-A * 0.5 * e, A * 0.5 * e];
    }, () => 0);
    finAlong(kit, F, 0.1, 0.95, -1, (q) => A * 0.13 * Math.sin(Math.PI * Math.min(1, q * 1.15)) + 0.6, 0.15, 34);
    finAlong(kit, F, 0.1, 0.8, 1, (q) => A * 0.13 * Math.sin(Math.PI * Math.min(1, q * 1.15)) + 0.6, 0.15, 28);
    tail(F, A * 0.5, 26);
    hull(kit, F);
    mark(F);
    // The lateral line, arched over the pectoral and then straight to the tail.
    const ll: Pt[] = [];
    for (let i = 4; i <= 40; i++) {
      const t = i / F.N;
      const [x, y, w] = F.spine[i];
      ll.push([x, y - w * 0.04 - (t > 0.6 ? Math.sin(((t - 0.6) / 0.25) * Math.PI) * A * 0.08 : 0)]);
    }
    P('detail', ll);
    const pc = F.at(0.74);
    paddle(kit, [pc[0], pc[1] - pc[2] * 0.02], A * 0.22, A * 0.12, Math.PI * 0.82, 'finF', 6);
    const [gx, gy, gw] = F.at(0.76);
    P('detail', [[gx + 1, gy - gw * 0.28], [gx - 2, gy], [gx + 0.5, gy + gw * 0.3]]);
    const [sx, sy, sw] = F.at(0.99);
    P('detail', [[sx + 0.6, sy - sw * 0.05], [sx - 1.2, sy + sw * 0.08], [sx - 3, sy + sw * 0.26]]);
    const er = A * 0.05;
    const [e1x, e1y, e1w] = F.at(0.88);
    eyeAt(C, e1x, e1y - e1w * 0.1, er);
    const [e2x, e2y, e2w] = F.at(0.84);
    eyeAt(C, e2x, e2y - e2w * 0.3, er * 0.92);
    return tailRays;
  }
  return 0;
}

/* ---- The trench's floor plans ---- */

/**
 * An amphipod, as the trench's crowd: a curled, laterally flat body of
 * segments, the tail end bent down and under, the side plates hanging down
 * along the front of the belly like scallops, thin jointed legs under them,
 * two pairs of feelers forward and the forked uropods at the tail.
 */
function amphipod(g: Genome, kit: Kit): number {
  const { P, C, vr } = kit;
  const A = g.A!;
  // The back's arch: the rear third curls down and under.
  const curl = (t: number) => (t < 0.38 ? Math.pow((0.38 - t) / 0.38, 1.8) * A * 1.1 : 0);
  const F = frameOf((t) => {
    let p = 0.32 + 0.68 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + 0.95 * t)), 0.7);
    if (t > 0.9) p *= 1 - Math.pow((t - 0.9) / 0.1, 2) * 0.45;
    return [-A * 0.52 * p, A * 0.48 * p];
  }, curl);
  hull(kit, F);
  // The segments: a seam across the back at each.
  const n = g.segs!;
  for (let q = 1; q < n; q++) {
    const t = 0.04 + (q / n) * 0.84;
    const [x, y, w] = F.at(t);
    P('detail', [[x + 0.6, y - w * 0.46], [x - 0.4, y - w * 0.05], [x + 0.3, y + w * 0.35]]);
  }
  // The side plates: rounded flaps hanging from the front half of the belly.
  const plates = 5;
  for (let q = 0; q < plates; q++) {
    const t = 0.5 + q * 0.085;
    const [x, y, w] = F.at(t);
    const top = y + w * 0.2;
    const h = w * (0.55 + 0.1 * Math.sin(q));
    const pw = 100 * 0.085 * 0.55;
    const plate: Pt[] = [[x + pw, top], ...quad([x + pw, top + h * 0.6], [x, top + h * 1.15], [x - pw, top + h * 0.6], 6), [x - pw, top]];
    P('finF', plate, true);
    // A leg from under each: out, a knee, and down to a fine foot.
    const back = q < 2 ? -1 : 1;
    const knee: Pt = [x + back * A * 0.25 + vr(-1, 1), top + h + A * 0.35];
    const foot: Pt = [knee[0] + back * A * 0.2, knee[1] + A * 0.45 + vr(-1, 1)];
    P('legs', [[x, top + h * 0.8], knee, foot, [foot[0] + back * 1.2, foot[1] + 0.8]]);
  }
  // Two small legs under the curl, and the uropods forked at its tip.
  for (let q = 0; q < 2; q++) {
    const [x, y, w] = F.at(0.3 + q * 0.1);
    P('legs', [[x, y + w * 0.4], [x - A * 0.15, y + w * 0.4 + A * 0.3], [x - A * 0.3, y + w * 0.4 + A * 0.45]]);
  }
  const [ux, uy] = F.spine[0];
  for (const s of [-1, 1]) P('legs', [[ux, uy], [ux - A * 0.3, uy + s * A * 0.12 + A * 0.12], [ux - A * 0.55, uy + s * A * 0.22 + A * 0.2]]);
  // The feelers: an upper pair long and swept back over the head, a lower shorter one forward.
  const [hx, hy, hw] = F.at(0.97);
  const ph = vr(0, TAU);
  P('legs', hang(hx, hy - hw * 0.3, g.antennae!, -Math.PI * 0.18, { wave: 0.05, freq: 0.15, ph, curl: 0.4, drift: -0.5 }, 1.5));
  P('legs', hang(hx, hy - hw * 0.1, g.antennae! * 0.7, -Math.PI * 0.05, { wave: 0.05, freq: 0.15, ph: ph + 1, curl: 0.3, drift: 0.3 }, 1.5));
  if (g.clear) glass(kit, F, A, 0.2, 0.9);
  if (g.eyes) {
    // A kidney of an eye, low on the head.
    const [ex, ey, ew] = F.at(0.9);
    C('eye', ex, ey - ew * 0.05, A * 0.09, A * 0.14);
  }
  return 0;
}

/**
 * A sea cucumber, side on. A sea pig: plump, higher at the front, its stubby
 * tube feet under it in a row and its feelers up off the front of its back.
 * A glassy elpidiid: low, see-through, its gut a dark loop in it, two pairs
 * of small papillae. The swimming one: a soft bag of pink glass with a veil
 * standing up and forward off its front and a brim behind, its gut showing.
 */
function cucumber(g: Genome, kit: Kit): number {
  const { P, vr } = kit;
  const A = g.A!;
  const kind = g.cuke ?? 'pig';
  const veiled = kind === 'veiled';
  const F = frameOf((t) => {
    // Front at t = 1: the pig blunt and high, the others rounder at both ends.
    // Plump all round, a sausage more than a lens; the pig higher at the front.
    // A superellipse along it: round, blunt ends, not a lens's points.
    const e = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(2 * (0.02 + 0.96 * t) - 1), 2.6)));
    const up = Math.pow(e, 0.8) * (kind === 'pig' ? 0.78 + 0.32 * t : 1);
    const dn = Math.pow(e, 0.9) * (kind === 'pig' ? 0.85 : 1);
    return [-A * 0.55 * up, A * 0.45 * dn];
  }, (t) => (veiled ? Math.sin(t * Math.PI + g.segs!) * g.wave! * 0.6 : 0));
  if (veiled) {
    // The veil: a hood of webbed papillae standing up and forward off the
    // front, rays through it; behind, a smaller brim.
    const [fx, fy] = F.up(0.86);
    const [bx, by] = F.up(0.62);
    const H = A * 1.25;
    const tip: Pt = [fx + A * 0.55, fy - H];
    const edge = cubic(tip, [fx + A * 0.9, fy - H * 0.55], [fx + A * 0.6, fy - H * 0.1], [fx + A * 0.3, fy + A * 0.05], 12);
    const back = quad([bx, by], [bx + A * 0.05, by - H * 0.7], tip, 10);
    P('fin', [...back, ...edge.slice(1), [fx, fy]], true);
    fanRays(P, [fx - A * 0.05, fy + A * 0.05], [...back.slice(3), ...edge.slice(1, -2)], 9);
    const [rx, ry] = F.up(0.12);
    const brim = [[rx + A * 0.1, ry], ...quad([rx - A * 0.1, ry - A * 0.6], [rx - A * 0.55, ry - A * 0.4], [rx - A * 0.4, ry + A * 0.25], 8), [rx - A * 0.05, ry + A * 0.3]] as Pt[];
    P('fin', brim, true);
    fanRays(P, [rx, ry + A * 0.1], brim.slice(2, -1), 6);
  }
  hull(kit, F);
  if (kind === 'pig' || kind === 'glassy') {
    // The tube feet: stubby, a row under it, the near ones in front.
    const n = g.legs!;
    for (let q = 0; q < n; q++) {
      const t = 0.12 + (q / Math.max(1, n - 1)) * 0.74;
      const [x, y] = F.dn(t);
      const len = A * (kind === 'pig' ? 0.26 : 0.18) * (0.85 + 0.3 * vr(0, 1));
      const wd = A * (kind === 'pig' ? 0.09 : 0.06);
      const lean = (t - 0.5) * 0.5;
      // A cone, fat at the body and round at the foot.
      const foot: Pt = [x + lean * len, y + len];
      P('limb', [[x - wd, y - wd * 1.5], ...quad([x - wd * 0.8, y + len * 0.5], [foot[0] - wd * 0.6, foot[1] + wd * 0.3], [foot[0] + wd * 0.3, foot[1] + wd * 0.2], 4), [x + wd, y - wd * 1.5]], true);
    }
    // The papillae up off its back: a sea pig's long feelers at the front,
    // an elpidiid's two small pairs.
    const papillae = kind === 'pig' ? g.antennae! : 4;
    for (let q = 0; q < papillae; q++) {
      const t = kind === 'pig' ? 0.7 + q * 0.07 : 0.35 + q * 0.14;
      const [x, y] = F.up(t);
      const len = A * (kind === 'pig' ? 0.5 + 0.2 * vr(0, 1) : 0.2);
      const wd = A * (kind === 'pig' ? 0.07 : 0.04);
      // Up and curving forward, tapering to a soft tip.
      const bend = kind === 'pig' ? 0.35 + q * 0.08 : 0.15;
      const tipP: Pt = [x + bend * len, y - len];
      const ctrl: Pt = [x - wd * 0.5, y - len * 0.7];
      const left = quad([x - wd, y + 1], ctrl, [tipP[0] - wd * 0.15, tipP[1]], 6);
      const right = quad([tipP[0] + wd * 0.25, tipP[1] + wd * 0.3], [ctrl[0] + wd * 1.6, ctrl[1] + wd], [x + wd, y + 1], 6);
      P('fin', [...left, ...right], true);
    }
  }
  // The mouth's ring of tentacles under the front.
  const [mx, my] = F.dn(0.95);
  for (let q = 0; q < 5; q++) P('detail', [[mx - 1, my - 1], [mx + 1 + q * 0.6, my + A * 0.08 + (q % 2) * A * 0.04]]);
  // The gut: a dark loop through the glass ones; the pig's skin has a few wrinkles.
  if (kind === 'pig') {
    for (let q = 0; q < 4; q++) {
      const [x, y, w] = F.at(0.25 + q * 0.15);
      P('detail', [[x + 1.5, y - w * 0.4], [x - 0.5, y - w * 0.2], [x + 0.5, y - w * 0.02]]);
    }
  } else {
    const loop: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const [x, y, w] = F.at(0.15 + 0.7 * u);
      loop.push([x, y + w * (0.05 + 0.18 * Math.sin(u * Math.PI * (veiled ? 3 : 2)))]);
    }
    P('guts', loop);
    const [gx, gy, gw] = F.at(0.5);
    P('gutFill', blob(gx, gy + gw * 0.08, A * 0.7, gw * 0.12, 0, vr, 10), true);
  }
  return 0;
}

/**
 * Outcrops, inked (see `outcrop.ts`).
 *
 * A rock and everything on it is drawn once, to a canvas of its own, and
 * after that only placed: coral doesn't move, so there is nothing to
 * redraw, and a frame pays one image copy per rock (two where it crosses
 * what is written on the page). Each is drawn for the side of the page it
 * comes from, so the light stays on its top left whichever wall it leaves.
 *
 * The rock is drawn as a plate engraver draws stone: boulders washed flat
 * along the light, hatched in short straight strokes all one way (15 to 25°
 * off the vertical, as the light falls), dense where they turn from it and
 * crossed where darkest, two to four broken bedding planes across it, a
 * strip of bare paper inside its lit outline and nothing added for a
 * highlight, and the clefts between them dark. Its foot runs back into the
 * wall and the wash lets go of it, so it hangs off the page edge rather than
 * floating; no rock is a cap on a stem (`MAX_CAP`). The picture's side
 * walls are drawn in the same hand (`inkWall`).
 *
 * The growths are drawn as a natural-history plate would draw them: a wash
 * of colour under a line of ink. Colour goes with the light, as it does in
 * real water, which takes the reds first: full pastels on the sunlit reef,
 * dulled in the twilight, and in the dark only pale ghosts.
 */

import { mixHex } from '../fan';
import { zoneMid } from './depth';
import type { EelPatch, Growth, GrowthKind, Outcrop, outcropsInView } from './outcrop';
import { HUES, IRON_GALL, waterAt, type Water } from './palette';
import { contourHatch, detailFor, grain, hatch, inkLine, LIGHT, mottle, shadeAcross, stipple, tubeWash, washFill } from './pen';
import { chance, hash32, int, mulberry32, range, type Rand } from './random';

/** The light from the top left, and the other way for light ink on dark
    water, which marks where the light falls rather than where it doesn't. */
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];

interface Placed {
  canvas: HTMLCanvasElement;
  /** Where the canvas's left edge sits on the page, in device pixels. */
  left: number;
  /** Where the rock's nominal top sits in the canvas, in device pixels. */
  oy: number;
}

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Only two or three are ever on the page; a few more cover a resize or a turn of the light. */
const KEEP = 8;

export class OutcropCache {
  private map = new Map<string, Placed>();

  get(o: Outcrop, w: number, h: number, dark: boolean, px: number): Placed | null {
    if (typeof document === 'undefined' || w <= 0 || h <= 0) return null;
    const key = `${o.id}|${o.edge}|${w}|${h}|${dark ? 1 : 0}|${px}`;
    const hit = this.map.get(key);
    if (hit) {
      // Most recently used goes to the back of the line.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const made = render(o, w, h, dark, px);
    if (!made) return null;
    this.map.set(key, made);
    while (this.map.size > KEEP) this.map.delete(this.map.keys().next().value as string);
    return made;
  }
}

/**
 * The outcrops on the page, each at its place. Where one crosses a `clear`
 * rect (what is written on the open screen, as shares of the page) it goes
 * faint, as the animals do, so the clock always reads.
 */
export function drawOutcrops(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  inView: ReturnType<typeof outcropsInView>,
  cache: OutcropCache,
  water: Water,
  px: number,
  clear: Rect[] | undefined,
) {
  for (const { outcrop, top } of inView) {
    const s = cache.get(outcrop, w, h, water.dark, px);
    if (!s) continue;
    const cw = s.canvas.width;
    const ch = s.canvas.height;
    const y = top * h - s.oy;
    const left = s.left;
    if (y > h || y + ch < 0) continue;
    const hits = (clear ?? []).filter(
      (r) => r.x * w < left + cw && (r.x + r.w) * w > left && r.y * h < y + ch && (r.y + r.h) * h > y,
    );
    ctx.save();
    ctx.globalAlpha = 1;
    if (!hits.length) {
      ctx.drawImage(s.canvas, left, y);
      ctx.restore();
      continue;
    }
    const outside = new Path2D();
    outside.rect(-w, -h, w * 3, h * 3);
    const inside = new Path2D();
    for (const r of hits) {
      outside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
      inside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
    }
    ctx.clip(outside, 'evenodd');
    ctx.drawImage(s.canvas, left, y);
    ctx.restore();
    ctx.save();
    ctx.clip(inside);
    ctx.globalAlpha = 0.3;
    ctx.drawImage(s.canvas, left, y);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The rock's shape

/** One boulder: a lumpy round form, its outline a ring of points. */
export interface Boulder {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Its lumps, as [amplitude, frequency, phase] triples round the ring. */
  n: number[];
  /** The outline, closed, in the rock's own frame. */
  pts: number[];
  /** Its radius round the ring, LUT steps to a turn: all its lumps, and
      only the coarse ones (what a contour well inside it follows). */
  full: Float32Array;
  coarse: Float32Array;
}

/**
 * A rock in its own frame: `u` runs from its wall (0, a little way inside
 * the page edge) out to its lip (`span`), and `y` down from its nominal top.
 */
export interface RockShape {
  span: number;
  /** How tall it stands before the wash lets go of it. */
  height: number;
  /** Back to front: each one drawn over the last. */
  boulders: Boulder[];
  /** How far it reaches either side, in u. */
  lo: number;
  hi: number;
  /** The highest point of it, as y (negative: above the nominal top). */
  minY: number;
  /** Where the rock's top is at `u`: the crest growths and holdfasts stand on. */
  top: (u: number) => number;
  /** Which of `boulders` is the mass the rest stand in, the wash let go of. */
  foot: number;
  grammar: RockGrammar;
}

/** How square a boulder is (`squareness`): above and below its middle, and
    optionally above it on its lip side, the first then being its wall side's. */
type Squares = [number, number] | [number, number, number];

/** Points round a boulder. */
const BN = 96;

function lumpsOf(n: number[], th: number, upTo = Infinity): number {
  let r = 1;
  for (let i = 0; i < n.length; i += 3) if (n[i + 1] <= upTo) r += n[i] * Math.sin(n[i + 1] * th + n[i + 2]);
  return r;
}

const LUT = 512;

/** A boulder's radius at angle `th`, as a share of its own. Inside it (`s`
    below 1) the fine lumps die away, so a contour line further in follows
    the form and not every knuckle of its outline. Read off its tables. */
function lumps(b: Boulder, th: number, s = 1): number {
  let f = (th / (Math.PI * 2)) * LUT;
  f -= Math.floor(f / LUT) * LUT;
  const i = Math.floor(f) % LUT;
  const j = (i + 1) % LUT;
  const t = f - Math.floor(f);
  const full = b.full[i] + (b.full[j] - b.full[i]) * t;
  if (s >= 1) return full;
  const coarse = b.coarse[i] + (b.coarse[j] - b.coarse[i]) * t;
  const k = s * s;
  return coarse + (full - coarse) * k * k;
}

const shapes = new Map<string, RockShape>();

/**
 * The silhouette a rock is built to, so the rocks of a page are not all one
 * heap of pebbles:
 *
 * - `heap`: two to four rounded boulders out from the wall, the ones by the
 *   wall highest, on a broad foot (every rock before the others existed).
 * - `slab`: two or three flat beds stacked off the wall, each running out
 *   its own way, the bedding lines along them.
 * - `spire`: a pinnacle of stacked blocks narrowing to a blunt point,
 *   standing up off a low shoulder by the wall, taller than the rest.
 * - `overhang`: a broad cap jutting out over open water off a narrower
 *   support set back by the wall, its underside in shadow.
 * - `field`: a spill of five or so separate rounded boulders down a slope,
 *   lower and wider than a heap.
 */
export type RockGrammar = 'heap' | 'slab' | 'spire' | 'overhang' | 'field';
export const ROCK_GRAMMARS: readonly RockGrammar[] = ['heap', 'slab', 'spire', 'overhang', 'field'];

/**
 * A grammar off a seed, by weight (by default a heap or a slab more often
 * than the rest). Pass `allow` to keep to some: a rock with garden eels on
 * its top wants a flat one.
 */
export function rollGrammar(seed: number, allow: readonly RockGrammar[] = ROCK_GRAMMARS): RockGrammar {
  const weight: Record<RockGrammar, number> = { heap: 3, slab: 2.5, overhang: 2, field: 2, spire: 1.2 };
  const pool = allow.length ? allow : ROCK_GRAMMARS;
  const total = pool.reduce((a, g) => a + weight[g], 0);
  let v = mulberry32(seed ^ 0x9e3779b9)() * total;
  for (const g of pool) {
    v -= weight[g];
    if (v <= 0) return g;
  }
  return pool[pool.length - 1];
}

/** The grammar a live outcrop's rock is built to: off its own id, and only
    the flat-topped ones where garden eels live in sand on its top. */
export function outcropGrammar(o: Outcrop): RockGrammar {
  return rollGrammar(hash32(o.id, 'grammar'), o.eels ? ['heap', 'slab'] : ROCK_GRAMMARS);
}

/** A superellipse's radius at angle `th` against a circle's: exponent 2 is
    the ellipse itself, more is squarer, less comes to points. */
function squareness(th: number, p: number): number {
  if (p === 2) return 1;
  return Math.pow(Math.pow(Math.abs(Math.cos(th)), p) + Math.pow(Math.abs(Math.sin(th)), p), -1 / p);
}

/**
 * The rock a seed makes, `span` device px out from its wall and about
 * `thick` deep. It stands between half and a little more than its width
 * tall, a foot that runs back into the wall and two to four boulders out
 * from it to the lip, the ones by the wall highest; the top is their tops,
 * so it rises and dips over them and the clefts between, and the lip
 * boulder's underside curves back in under it. Made once a size.
 */
export function rockShape(seed: number, span: number, thick: number, px: number, grammar: RockGrammar = 'heap'): RockShape {
  const key = `${seed}|${span}|${thick}|${px}|${grammar}`;
  const hit = shapes.get(key);
  if (hit) return hit;
  const r = mulberry32(seed ^ 0x51ab0c);
  const S = Math.max(8 * px, span);
  const Hr = Math.max(0.5 * S, Math.min(1.2 * S, thick));
  const boulders: Boulder[] = [];
  // `sq` is how square it is above and below its middle (`squareness`),
  // and, if given a third, above it on its lip side (the second above is
  // then its wall side's): a pinnacle comes up to a point of its own.
  const add = (cx: number, top: number, rx: number, ry: number, sq: Squares = [2, 2], amp = 1) => {
    // Lumps at a few scales, coarse to fine, so the top breaks into knuckles.
    const n: number[] = [];
    const ks = [2, 3, 5, 7, 11, 17];
    const amps = [0.09, 0.07, 0.045, 0.028, 0.016, 0.009];
    for (let i = 0; i < ks.length; i++) n.push(amps[i] * amp * range(r, 0.5, 1.35), ks[i], range(r, 0, Math.PI * 2));
    const cy = top + ry;
    const sqAt = (th: number) => squareness(th, Math.sin(th) >= 0 ? sq[1] : Math.cos(th) > 0 ? (sq[2] ?? sq[0]) : sq[0]);
    const pts: number[] = [];
    for (let i = 0; i < BN; i++) {
      const th = (i / BN) * Math.PI * 2;
      const rr = lumpsOf(n, th) * sqAt(th);
      pts.push(cx + rx * rr * Math.cos(th), cy + ry * rr * Math.sin(th));
    }
    const full = new Float32Array(LUT);
    const coarse = new Float32Array(LUT);
    for (let i = 0; i < LUT; i++) {
      const th = (i / LUT) * Math.PI * 2;
      const k = sqAt(th);
      full[i] = lumpsOf(n, th) * k;
      coarse[i] = lumpsOf(n, th, 3) * k;
    }
    boulders.push({ cx, cy, rx, ry, n, pts, full, coarse });
  };
  // (A second stream for what came after: every rock rolled before keeps its dice.)
  if (grammar !== 'heap') buildGrammar(grammar, r, mulberry32(seed ^ 0x2f1e9d), S, Hr, add, boulders);
  else {
    // Boulders out from the wall to the lip, each over the last by about a
    // third of itself, so the top is one broken crest; the ones by the wall
    // stand highest. Where the rock is tall for its width they stand taller.
    const tall = Math.max(0.92, Math.min(1.35, Hr / S));
    const ups: [number, number, number, number][] = [];
    let u = 0;
    for (let i = 0; i < 6; i++) {
      const t = Math.min(1, u / S);
      let rx = S * (0.27 - 0.08 * t) * range(r, 0.85, 1.15);
      let cx = u + rx * (i === 0 ? 0.25 : 0.62);
      const last = cx + rx * 1.25 > S;
      if (last) {
        rx = Math.max(rx, (S - u) * 0.6);
        cx = S - rx * 0.98;
      }
      const top = Hr * (-0.12 + 0.2 * t + range(r, -0.06, 0.06));
      const ry = Math.min(rx * range(r, 0.75, 1) * tall, Hr * (0.44 - 0.1 * t) * range(r, 0.88, 1.1));
      ups.push([cx, top, rx, ry]);
      u = cx + rx * 0.62;
      if (last) break;
    }
    for (const [cx, top, rx, ry] of ups) add(cx, top, rx, ry);
    // And in front of their feet, the mass they stand in: broad, back into the
    // wall and down, which the wash lets go of. Its top crosses their lower halves.
    const feet = Math.min(...ups.slice(0, -1).map(([, top, , ry]) => top + ry * 1.25), Hr * 0.4);
    add(0.12 * S, Math.max(Hr * 0.12, feet) * range(r, 0.92, 1.04), 0.66 * S, Math.max(0.42 * Hr, (Hr * 1.05 - feet) / 2));
  }
  noMushroom(boulders, Hr);
  let lo = Infinity;
  let hi = -Infinity;
  let minY = Infinity;
  for (const b of boulders) {
    for (let i = 0; i < b.pts.length; i += 2) {
      lo = Math.min(lo, b.pts[i]);
      hi = Math.max(hi, b.pts[i]);
      minY = Math.min(minY, b.pts[i + 1]);
    }
  }
  // The top, a bin to a CSS pixel: the highest edge of any boulder over it.
  const step = Math.max(0.5, px);
  const nbins = Math.ceil((hi - lo) / step) + 1;
  const tops = new Float32Array(nbins).fill(Infinity);
  for (const b of boulders) {
    const m = b.pts.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const x0 = b.pts[i * 2];
      const y0 = b.pts[i * 2 + 1];
      const x1 = b.pts[j * 2];
      const y1 = b.pts[j * 2 + 1];
      const b0 = Math.ceil((Math.min(x0, x1) - lo) / step);
      const b1 = Math.floor((Math.max(x0, x1) - lo) / step);
      for (let k = Math.max(0, b0); k <= Math.min(nbins - 1, b1); k++) {
        const x = lo + k * step;
        const y = x1 === x0 ? Math.min(y0, y1) : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        if (y < tops[k]) tops[k] = y;
      }
    }
  }
  for (let k = 1; k < nbins; k++) if (!Number.isFinite(tops[k])) tops[k] = tops[k - 1];
  for (let k = nbins - 2; k >= 0; k--) if (!Number.isFinite(tops[k])) tops[k] = tops[k + 1];
  const top = (u: number) => {
    const f = Math.max(0, Math.min(nbins - 1.001, (u - lo) / step));
    const i = Math.floor(f);
    return tops[i] + (tops[i + 1] - tops[i]) * (f - i);
  };
  const made: RockShape = { span: S, height: Hr, boulders, lo, hi, minY, top, foot: grammar === 'heap' ? boulders.length - 1 : 0, grammar };
  shapes.set(key, made);
  if (shapes.size > 24) shapes.delete(shapes.keys().next().value as string);
  return made;
}

/** The widest a rock may be over the narrowest of it below, down to where
    the wash lets go: past this it reads as a cap on a stem, a mushroom. */
export const MAX_CAP = 1.55;

/** Whether a point of the rock's frame is inside a boulder. */
function inBoulder(b: Boulder, u: number, y: number): boolean {
  const ex = (u - b.cx) / b.rx;
  const ey = (y - b.cy) / b.ry;
  const d2 = ex * ex + ey * ey;
  if (d2 > 2.6) return false;
  const th = Math.atan2(ey, ex);
  return Math.sqrt(d2) < lumps(b, th < 0 ? th + Math.PI * 2 : th);
}

/**
 * How mushroomed a rock is: row by row from its top to where the wash lets
 * go, its width out from the wall, and the most any row is wider than the
 * narrowest row under it; and the row that narrowest is.
 */
export function capRatio(boulders: Boulder[], Hr: number, fadeAt = 0.62): { ratio: number; neck: number } {
  let minY = Infinity;
  let hi = 0;
  for (const b of boulders) {
    minY = Math.min(minY, b.cy - b.ry * 1.2);
    hi = Math.max(hi, b.cx + b.rx * 1.2);
  }
  const rows = 48;
  const y1 = fadeAt * Hr;
  const ys: number[] = [];
  const ws: number[] = [];
  const du = Math.max(0.5, hi / 120);
  for (let i = 0; i < rows; i++) {
    const y = minY + ((y1 - minY) * (i + 0.5)) / rows;
    let lo = Infinity;
    let top = -Infinity;
    for (let u = 0; u <= hi; u += du) {
      if (!boulders.some((b) => inBoulder(b, u, y))) continue;
      lo = Math.min(lo, u);
      top = Math.max(top, u);
    }
    if (top > lo) {
      ys.push(y);
      ws.push(top - lo);
    }
  }
  let ratio = 1;
  let neck = NaN;
  let minBelow = Infinity;
  let minAt = NaN;
  for (let i = ws.length - 1; i >= 0; i--) {
    if (Number.isFinite(minBelow) && ws[i] / minBelow > ratio) {
      ratio = ws[i] / minBelow;
      neck = minAt;
    }
    if (ws[i] < minBelow) {
      minBelow = ws[i];
      minAt = ys[i];
    }
  }
  return { ratio, neck };
}

/**
 * No cap on a stem: while the rock is wider above than `MAX_CAP` times its
 * narrowest under it, the boulder that reaches furthest across that neck
 * is broadened out from its wall side, until it holds up what is over it.
 */
function noMushroom(boulders: Boulder[], Hr: number) {
  for (let it = 0; it < 14; it++) {
    const { ratio, neck } = capRatio(boulders, Hr);
    if (ratio <= MAX_CAP || !Number.isFinite(neck)) return;
    let best = -1;
    let reach = -Infinity;
    // Only what runs on down under the neck: broadening the cap would only
    // make it worse.
    boulders.forEach((b, i) => {
      if (Math.abs(neck - b.cy) >= b.ry || b.cy + b.ry < neck + 0.12 * Hr) return;
      const rr = b.cx + b.rx * Math.sqrt(1 - ((neck - b.cy) / b.ry) ** 2);
      if (rr > reach) {
        reach = rr;
        best = i;
      }
    });
    if (best < 0) return;
    const b = boulders[best];
    // Wider by a tenth, its wall side kept where it was.
    const k = 1.1;
    const ncx = b.cx + (k - 1) * b.rx;
    for (let i = 0; i < b.pts.length; i += 2) b.pts[i] = ncx + (b.pts[i] - b.cx) * k;
    b.cx = ncx;
    b.rx *= k;
  }
}

/**
 * The boulders of the grammars past the heap, back to front, in the rock's
 * frame: `u` out from the wall, `y` down from its nominal top. Each one's
 * foot is deep enough that the wash lets go of it before its underside
 * shows, so no rock stands on a hem of its own.
 */
function buildGrammar(
  g: RockGrammar,
  r: Rand,
  r2: Rand,
  S: number,
  Hr: number,
  add: (cx: number, top: number, rx: number, ry: number, sq?: Squares, amp?: number) => void,
  boulders: Boulder[],
) {
  // The mass it all stands in, back into the wall and down past where the wash runs dry.
  const foot = (cx: number, top: number, rx: number) => add(cx, top, rx, Math.max(0.5 * Hr, (Hr * 1.3 - top) / 2), [2.2, 2.6]);
  if (g === 'slab') {
    // Set back a little under the beds and up into them, so they never
    // sit on a neck of it.
    foot(0.06 * S, Hr * 0.2, 0.7 * S);
    // Two beds, never a stack of like ones: a thick lower bed (a merged
    // pair, its bedding line drawn across it) and over it a thinner one
    // stepped back toward the wall by a third or more of its length, so the
    // top of the lower bed shows as a bench. Square-ended and
    // broken off, not rounded: three beds of one length read as pillows.
    const thickLow = Hr * range(r, 0.55, 0.7);
    const thickUp = Hr * range(r, 0.26, 0.36);
    const outLow = S * range(r, 0.86, 1);
    const outUp = outLow * (1 - range(r2, 0.3, 0.45));
    const yUp = -0.08 * Hr;
    const yLow = yUp + thickUp * range(r, 0.55, 0.7);
    const bed = (out: number, top: number, thick: number, sq: Squares) => {
      const rx = out * 0.5 + 0.12 * S;
      const ry = thick / 2;
      // A flat bed's lumps scaled to its thickness, not its length: on a
      // long thin ellipse the full lumps push its end out into a tongue.
      add(out - rx * 0.96, top, rx, ry, sq, Math.max(0.35, Math.min(1, (1.6 * ry) / rx)));
    };
    // (The upper one behind: the lower bed's top edge runs across its foot,
    // so it stands back on the bench and never sits on it as a cushion.)
    bed(outUp, yUp, thickUp, [4.5, 5, 6]);
    bed(outLow, yLow, thickLow, [3.4, 3.2, 6]);
    return;
  }
  if (g === 'spire') {
    foot(0.2 * S, Hr * 0.45, 0.55 * S);
    // A low shoulder by the wall, broad and rounded and well under half the
    // pinnacle's height: two near-equal points read as a castle's turrets.
    r();
    add(0.02 * S, Hr * range(r2, 0.26, 0.36), 0.3 * S, Hr * 0.28, [2.6, 2.4]);
    // A buttress against its outer foot, now and then.
    const at = S * range(r, 0.5, 0.66);
    const rx = S * range(r, 0.17, 0.22);
    if (r() < 0.6) add(at + rx * 0.7, Hr * range(r, 0.25, 0.38), rx * 0.8, Hr * 0.3, [2.3, 2.3]);
    // The pinnacle: one tall column, squared at its foot and narrowing to a
    // broken point, one shoulder of it steeper than the other (a blunt top
    // reads as a tooth): its top tenth under a third of its width.
    const top = -Hr * range(r, 0.4, 0.65);
    const tall = Hr * 0.75 - top;
    const steep = range(r2, 0.82, 0.98);
    const full = range(r2, 1.15, 1.4);
    const flip = r2() < 0.5;
    // Its top broken: a block standing behind one flank a quarter of the
    // way down, so the profile steps out there and the two sides differ.
    const side = flip ? 1 : -1;
    add(at + side * rx * 0.62, top + tall * range(r2, 0.22, 0.32), rx * 0.42, tall * 0.11, [2.6, 2.2]);
    add(at, top, rx, tall / 2, flip ? [steep, 2.7, full] : [full, 2.7, steep]);
    return;
  }
  if (g === 'overhang') {
    foot(0.02 * S, Hr * 0.5, 0.42 * S);
    // The support, set back by the wall and narrower than what it holds up,
    // but not by much: a ledge, never a mushroom (`MAX_CAP`).
    add(0.2 * S, Hr * 0.12, S * range(r, 0.38, 0.44), Hr * 0.46, [2.4, 2.6]);
    // A block on top by the wall, now and then.
    // (Sunk into the support's top, never resting above it on nothing.)
    if (r() < 0.5) add(0.1 * S, -Hr * (0.04 + 0.3 * range(r, 0.2, 0.28)), S * 0.22, Hr * 0.17, [3, 3]);
    // The cap, jutting out over open water, its underside turned from the light.
    const ry = Hr * range(r, 0.2, 0.27);
    add(S * range(r, 0.5, 0.56), -Hr * range(r, 0.02, 0.1), S * range(r, 0.4, 0.46), ry, [2.6, 3.4]);
    return;
  }
  // A field of boulders down a slope: lower and wider than a heap, the far
  // ones (higher up the slope) laid first.
  // The slope they lie on: low and wide, the whole of the rock's reach.
  add(0.38 * S, Hr * 0.48, 0.72 * S, Hr * 0.5, [2.8, 2.6]);
  const stones: [number, number, number, number][] = [];
  let u = -0.06 * S;
  for (let i = 0; i < 9 && u < S * 0.9; i++) {
    const t = Math.max(0, u / S);
    const rx = S * range(r, 0.12, 0.2) * (1.25 - 0.5 * t);
    const ry = rx * range(r, 0.6, 0.85) * Math.max(0.8, Math.min(1.2, Hr / S));
    const cx = Math.min(S - rx * 0.9, u + rx * 0.8);
    // Half sunk in the slope, lower toward the lip.
    const bottom = Hr * (0.62 + 0.18 * t + range(r, -0.05, 0.05));
    stones.push([cx, bottom - 2 * ry * 0.92, rx, ry]);
    u = cx + rx * range(r, 0.5, 0.85);
  }
  stones.sort((a, b) => a[1] + a[3] - (b[1] + b[3]));
  for (const [cx, top, rx, ry] of stones) add(cx, top, rx, ry, [2.1, 2.5]);
  // The slope ends under its outermost stone, its wall end kept where it
  // was: run on past them, cut under its lip it hung there as a tongue.
  const end = Math.max(...stones.map(([cx, , rx]) => cx + rx * 0.1));
  const slope = boulders[0];
  const k = Math.min(1, (end - (slope.cx - slope.rx)) / (2 * slope.rx));
  if (k < 1) {
    const ncx = slope.cx - slope.rx * (1 - k);
    for (let i = 0; i < slope.pts.length; i += 2) slope.pts[i] = ncx + (slope.pts[i] - slope.cx) * k;
    slope.cx = ncx;
    slope.rx *= k;
  }
}

// ---------------------------------------------------------------------------
// The rock, inked

/** How a rock is coloured and how much drawing it carries. */
export interface RockStyle {
  /** The wash. */
  rock: string;
  /** The pen. */
  line: string;
  /** What the wash is lifted toward on its lit side: the paper, or on dark
      water the light ink (a tint in the wash, never a highlight). */
  paper: string;
  dark: boolean;
  /** How much drawing it carries, 0 to 1 (`detailFor`). */
  d: number;
  px: number;
  seed: number;
  /** A few barnacles along its top. */
  barnacles?: boolean;
  /** Where the wash runs dry toward its foot, as shares of its height: from, to. */
  fade?: [number, number];
  /**
   * Far off in the water: the wash taken `mix` of the way to `water`, no
   * shading but the wash's own, and only a broken thread of the pen round
   * it (half its weight at 0.45, broken at least twice a boulder) and three
   * to six strokes of the hatch where it is darkest, so it is a rock in the
   * haze and never a lineless smoke.
   */
  far?: { water: string; mix: number };
}

/** How far down its own frame (y, from its nominal top) a rock drawn in
    `style` is gone into the water altogether: a canvas it is drawn on must
    reach this far, or its foot is cut off square. */
export function rockFoot(shape: RockShape, style?: Pick<RockStyle, 'fade'>): number {
  return shape.height * ((style?.fade ?? FADE)[1] + 0.06);
}

/** Where the wash runs dry by default, as shares of the rock's height. */
const FADE: [number, number] = [0.62, 1.04];

/** Where a rock goes in the context: its wall at `x0`, running `dir` across, its nominal top at `y0`. */
export interface RockPlace {
  x0: number;
  y0: number;
  dir: 1 | -1;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** The strip of bare paper left inside a rock's lit outline, px of pen. */
const PAPER_GAP = 2.5;

/**
 * A rock in pen and wash, into a context of its own (its foot is let go of,
 * and its paper strip left, by erasing, so draw it on a layer and lay that
 * down): each boulder washed along the light from a lifted top left to a
 * deeper bottom right, the cleft behind it darkened, the wash stopped 2.5 px
 * of pen short of its lit outline (bare paper, no white added), the
 * engraver's hatch (`hatchStrokes`: one stroke to 80 px² of pen in shadow,
 * hardly any on the lit face, crossed at 60° in the darkest fifth), a crack
 * or two, and its outline in one pressure line that swells in the shadow
 * and breaks in the light; then two to four broken bedding planes across
 * the rock, each with its ledge's shadow under it. Far off, only the wash,
 * a broken thread of pen and three to six strokes. On dark water the light
 * ink marks where the light falls instead, and is never crossed. Shared by
 * the outcrops, the kelp's ledge and the picture's rocks.
 */
export function inkRock(ctx: CanvasRenderingContext2D, shape: RockShape, at: RockPlace, k: RockStyle): void {
  const { px, d, dark } = k;
  const r = mulberry32(k.seed);
  const X = (u: number) => at.x0 + at.dir * u;
  const Y = (y: number) => at.y0 + y;
  const far = k.far;
  const fine = d > 0.35 && !far;
  const stone = far ? mixHex(k.rock, far.water, far.mix) : k.rock;
  const deep = mixHex(stone, dark ? '#000000' : '#2A2320', (dark ? 0.45 : 0.32) * (far ? 1 - 0.6 * far.mix : 1));
  const lift = mixHex(stone, k.paper, dark ? 0.22 : 0.42);
  const union = new Path2D();
  // The foot let go of. The pen lets go with the wash, along a ragged line:
  // whole down to where the wash starts to run dry, and gone only where
  // the wash is down to a third, so no part of a rock is wash without a
  // line (a lineless lobe reads as glass or smoke, not stone). Its own
  // dice, so the rest roll as before.
  const H = shape.height;
  const [fa, fb] = k.fade ?? FADE;
  const rf = mulberry32(k.seed ^ 0x7f4a7c15);
  const ph1 = rf() * 6.28;
  const ph2 = rf() * 6.28;
  const ragged = (x: number) => {
    const u = (x - at.x0) * at.dir;
    return 0.6 * Math.sin(u / (0.13 * shape.span) + ph1) + 0.4 * Math.sin(u / (0.045 * shape.span) + ph2);
  };
  const penFrom = fa - 0.04;
  const penTo = fa + 0.62 * (fb - fa);
  const lf = (x: number, y: number) => {
    const n0 = ragged(x);
    const a = Y((penFrom + 0.04 * n0) * H);
    const b = Y((penTo + 0.05 * n0) * H);
    if (y <= a) return 1;
    if (y >= b) return 0;
    const t = (y - a) / (b - a);
    return 1 - t * t * (3 - 2 * t);
  };
  // A stroke laid all at once lets go the same way, down a gradient.
  const deepFade = ctx.createLinearGradient(0, Y(penFrom * H), 0, Y(penTo * H));
  deepFade.addColorStop(0, rgba(deep, 1));
  deepFade.addColorStop(1, rgba(deep, 0));
  const [lx, ly] = LIGHT;
  // Toward the light, for a rounded form: from the top left and a little in front.
  const LV = [-0.55, -0.7, 0.36].map((v) => v / Math.hypot(0.55, 0.7, 0.36));
  // Whether a point of the page is inside a boulder, `margin` device px
  // short of its edge.
  const inB = (b: Boulder, x: number, y: number, margin = 0) => {
    const ex = (at.dir * (x - X(b.cx))) / b.rx;
    const ey = (y - Y(b.cy)) / b.ry;
    const th = Math.atan2(ey, ex);
    const rr = lumps(b, th < 0 ? th + Math.PI * 2 : th);
    const s = Math.hypot(ex, ey);
    if (margin <= 0) return s < rr;
    const rad = Math.hypot(b.rx * Math.cos(th), b.ry * Math.sin(th)) * rr;
    return s * rad < rr * (rad - margin);
  };
  // Two to four bedding planes across the rock, near level (within 8°),
  // each broken, with the shadow of its ledge under it: where it runs, at
  // rows down the rock from its top to where it goes into the water.
  const rs = mulberry32(k.seed ^ 0x2545f491);
  const strata: [number, number, number, number][] = [];
  if (!far) {
    const n = 2 + Math.floor(rs() * 3);
    const yTop = shape.minY;
    const yBot = Math.max(yTop + 4 * px, fa * H);
    const step = Math.max(1, 2 * px);
    // Rows tried in turn, more of them than wanted, until two to four hold.
    for (let i = 0; i < n + 6 && strata.length < n; i++) {
      const slot = i < n ? i : (i * 0.618) % n;
      const y = Y(yTop + (yBot - yTop) * (0.14 + (0.78 * (slot + 0.2 + 0.6 * rs())) / n));
      // The longest run across the rock at that row.
      let best: [number, number] = [0, 0];
      let start = NaN;
      for (let u = shape.lo; u <= shape.hi + step; u += step) {
        const x = X(u);
        const isIn = u <= shape.hi && shape.boulders.some((b) => inB(b, x, y, 2 * px));
        if (isIn && !Number.isFinite(start)) start = u;
        if (!isIn && Number.isFinite(start)) {
          if (u - start > best[1] - best[0]) best = [start, u];
          start = NaN;
        }
      }
      const runL = best[1] - best[0];
      if (runL < 0.18 * shape.span) continue;
      const u0 = best[0] + runL * range(rs, 0.04, 0.2);
      const u1 = best[1] - runL * range(rs, 0.06, 0.25);
      const xa = Math.min(X(u0), X(u1));
      const xb = Math.max(X(u0), X(u1));
      const tilt = Math.tan(range(rs, -8, 8) * (Math.PI / 180));
      strata.push([xa, y - (tilt * (xb - xa)) / 2, xb, y + (tilt * (xb - xa)) / 2]);
    }
  }
  const ledgeH = 5 * px;
  const ledge = (x: number, y: number) => {
    let s = 0;
    for (const [xa, ya, xb, yb] of strata) {
      if (x < xa || x > xb) continue;
      const d = y - (ya + ((yb - ya) * (x - xa)) / (xb - xa));
      if (d > 0 && d < ledgeH * 3) s += 0.38 * Math.exp(-d / ledgeH);
      else if (d < 0 && d > -ledgeH) s -= 0.12;
    }
    return s;
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  shape.boulders.forEach((b, bi) => {
    const pts: number[] = [];
    for (let i = 0; i < b.pts.length; i += 2) pts.push(X(b.pts[i]), Y(b.pts[i + 1]));
    const path = new Path2D();
    path.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
    path.closePath();
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      bx0 = Math.min(bx0, pts[i]);
      bx1 = Math.max(bx1, pts[i]);
      by0 = Math.min(by0, pts[i + 1]);
      by1 = Math.max(by1, pts[i + 1]);
    }
    const box = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
    const cx = X(b.cx);
    const cy = Y(b.cy);
    // Each boulder is shaded as the rounded form it is: a point's facing is
    // read off where it sits in the boulder (out at the rim it turns edge-on,
    // in the middle it faces us), against a light from the top left and a
    // little in front. 0 is lit, 1 the darkest shadow.
    const shadeN = (nx: number, ny: number, nz: number) => clamp01(0.5 - 0.62 * (nx * LV[0] + ny * LV[1] + nz * LV[2]) + 0.1 * ny);
    const shadeAt = (th: number, s: number) => {
      const z = Math.sqrt(Math.max(0, 1 - s * s));
      return shadeN(at.dir * s * Math.cos(th), s * Math.sin(th), z);
    };
    // The same for a point of the page, for the stipple: as if the boulder
    // were smooth, which a stipple cannot tell.
    const shadeXY = (x: number, y: number) => {
      const ex = (x - cx) / b.rx;
      const ey = (y - cy) / b.ry;
      const s2 = Math.min(1, ex * ex + ey * ey);
      return shadeN(ex, ey, Math.sqrt(1 - s2));
    };
    // The cleft behind it: the boulders already down darken where this one
    // meets them, the shadow falling away from the light.
    if (bi > 0) {
      ctx.save();
      ctx.clip(union);
      ctx.translate(lx * 0.06 * b.ry, ly * 0.06 * b.ry);
      ctx.strokeStyle = deepFade;
      ctx.globalAlpha = dark ? 0.7 : 0.55;
      ctx.lineWidth = Math.max(2 * px, 0.16 * Math.min(b.rx, b.ry));
      ctx.stroke(path);
      ctx.restore();
    }
    union.addPath(path);
    // The wash, laid along the light: lifted on the side it comes from and
    // deeper on the far side, as flat as stone is. Nothing is added to it
    // for a highlight; the lightest the stone gets is the paper let through.
    const ext = Math.max(b.rx, b.ry);
    const g = ctx.createLinearGradient(cx - lx * ext, cy - ly * ext, cx + lx * ext, cy + ly * ext);
    // The mass the rest stand in is in their shadow, and darker for it: the
    // rock goes down into the water through its deeper tones, never a pale hem.
    const foot = bi === shape.foot;
    const tint = mixHex(mixHex(stone, bi % 2 ? deep : lift, 0.08 + 0.06 * r()), deep, foot ? 0.3 : 0);
    g.addColorStop(0, mixHex(tint, lift, foot ? 0.15 : 0.4));
    g.addColorStop(0.5, tint);
    g.addColorStop(1, mixHex(tint, deep, 0.6));
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fill(path);
    // Where the pigment ran to the edge and dried there: a darker line along
    // it, half under the pen (no clip: it costs more than the line).
    ctx.strokeStyle = deepFade;
    ctx.globalAlpha = (dark ? 0.3 : 0.35) * (far ? 0.6 : 1);
    ctx.lineWidth = Math.max(2 * px, 0.04 * Math.min(b.rx, b.ry));
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    const covered = (x: number, y: number) => shape.boulders.some((e, j) => j < bi && inB(e, x, y, 0.2 * px));
    // Along its lit edge the brush stopped short of the line: a strip of
    // bare paper 2.5 px of pen wide just inside the outline (the wash taken
    // back off, nothing put on), not where it runs in under a boulder
    // already down, and not down where the rock goes into the water.
    if (!foot) {
      const gapRun = new Path2D();
      let on = false;
      for (let i = 0; i <= BN; i++) {
        const q = i % BN;
        const th = (q / BN) * Math.PI * 2;
        const x = pts[q * 2];
        const y = pts[q * 2 + 1];
        const lit = shadeAt(th, 1) < 0.2 && Math.sin(th) < 0.3;
        // The brush skips now and then: a gap, not a gleam.
        const skip = valueNoise(k.seed ^ 0x77 ^ bi, q / 7, 0.5) < 0.3;
        if (!lit || skip || lf(x, y) < 0.6 || covered(x, y)) {
          on = false;
          continue;
        }
        if (on) gapRun.lineTo(x, y);
        else gapRun.moveTo(x, y);
        on = true;
      }
      ctx.save();
      ctx.clip(path);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.globalAlpha = far ? 0.35 : 0.62;
      ctx.lineWidth = 2 * (PAPER_GAP + 0.5) * px;
      ctx.stroke(gapRun);
      ctx.restore();
    }
    if (far) {
      // Far off, only a broken thread of the pen round its silhouette.
      ctx.globalAlpha = 1;
      const m = pts.length / 2;
      let dash: number[] = [];
      let on = rf() < 0.7;
      let left = b.rx * (on ? range(rf, 0.35, 1) : range(rf, 0.08, 0.3));
      const flush = () => {
        if (dash.length >= 6) {
          inkLine(ctx, dash, false, { width: 0.5 * px, color: k.line, alpha: 0.45, swell: 0.3, lost: 0, taper: [0.2, 0.2], raw: true, light: dark ? UNLIGHT : LIGHT, min: 0.25 * px });
        }
        dash = [];
      };
      // At least two gaps in it, wherever the dice fall.
      let gaps = 0;
      for (let q = 0; q <= m; q++) {
        const i = q % m;
        const j = (q + 1) % m;
        const x = pts[i * 2];
        const y = pts[i * 2 + 1];
        if (covered(x, y) || lf(x, y) < 0.15) {
          flush();
          continue;
        }
        if (on) dash.push(x, y);
        left -= Math.hypot(pts[j * 2] - x, pts[j * 2 + 1] - y);
        const forced = !on || gaps >= 2 ? false : q === Math.floor(m / 3) || q === Math.floor((2 * m) / 3);
        if (left <= 0 || forced) {
          if (on) {
            flush();
            gaps++;
          }
          on = !on;
          left = b.rx * (on ? range(rf, 0.35, 1) : range(rf, 0.08, 0.3));
        }
      }
      flush();
      return;
    }
    // The engraver's hatch (`hatchStrokes`): short straight strokes all one
    // way along the light, dense where the boulder turns from it, crossed
    // where it is darkest, hardly any on its lit face; the ledges' shadows
    // under the bedding planes, and a little unevenness so a boulder is a
    // stone and not a ball. On dark water the light ink marks the light
    // instead, and is never crossed.
    // The ball's shade pushed apart (a stone's faces turn more sharply than
    // a ball's): its lit face opens, the far side closes into shadow.
    const sh0 = (x: number, y: number) =>
      clamp01((shadeXY(x, y) - 0.22) / 0.42 + ledge(x, y) + 0.22 * (valueNoise(k.seed ^ bi, x / (13 * px), y / (13 * px)) - 0.5));
    const field: HatchField = {
      // Light ink on dark water: only the faces most in the light.
      shade: dark ? (x, y) => 0.85 * (1 - sh0(x, y)) : sh0,
      inside: (x, y) => inB(b, x, y, (PAPER_GAP + 0.5) * px),
      keep: lf,
      noCross: dark,
    };
    const hp = new Path2D();
    // Long strokes close together (the lanes 80 px² of pen apart, over the
    // stroke and its gap), so the shadow reads as a tone, not a scatter.
    const len = Math.max(10 * px, Math.min(30 * px, 0.55 * Math.min(b.rx, b.ry)));
    // Light ink on dark water is fine and close, and laid evenly it beats
    // into a quilted moiré: there each lane sits its own way off the grid
    // (up to a third of the spacing), each stroke turns up to 6° off the
    // set, and each lane starts its strokes at its own place.
    hatchStrokes(hp, box, field, {
      px,
      seed: (k.seed ^ Math.imul(bi + 1, 0x9e3779b1)) >>> 0,
      len,
      width: (dark ? 0.75 : fine ? 1 : 0.85) * px,
      ...(dark ? { space: 0.35, jitter: 0.105, scatter: true, vary: 0.3 } : {}),
    });
    ctx.fillStyle = k.line;
    ctx.globalAlpha = dark ? 0.38 : 0.85;
    ctx.fill(hp);
    // A crack or two, in from the top and down the face.
    if (d > 0.25 && r() < 0.8) {
      const count = 1 + Math.floor(r() * 2);
      ctx.save();
      ctx.clip(path);
      for (let c = 0; c < count; c++) {
        let th = Math.PI * (1.25 + 0.6 * r());
        let s = 1.02;
        const crack: number[] = [];
        const segs = 4 + Math.floor(r() * 4);
        for (let q = 0; q <= segs; q++) {
          const rr = lumps(b, th) * s;
          crack.push(cx + at.dir * b.rx * rr * Math.cos(th), cy + b.ry * rr * Math.sin(th));
          s -= (0.06 + 0.08 * r()) * (b.ry > b.rx ? 1 : b.rx / b.ry) * 0.7;
          th += (r() - 0.5) * 0.35;
          if (s < 0.35) break;
        }
        for (let q = 0; q < crack.length; q += 2) {
          if (lf(crack[q], crack[q + 1]) < 0.3) {
            crack.length = q;
            break;
          }
        }
        if (crack.length < 6) continue;
        inkLine(ctx, crack, false, { width: 0.8 * px, color: k.line, alpha: dark ? 0.5 : 0.7, taper: [0.05, 0.7], seed: c * 7 + bi, raw: true, min: 0.2 * px });
      }
      ctx.restore();
    }
    // Its outline, heavy where it turns from the light and lost where it is
    // lit. Where it crosses a boulder already down it is a cleft inside the
    // rock, not its edge, and the pen goes lighter there.
    const m = pts.length / 2;
    const flags: boolean[] = [];
    for (let i = 0; i < m; i++) flags.push(covered(pts[i * 2], pts[i * 2 + 1]));
    const pen = (run: number[], cleft: boolean, closed: boolean, a = 1) =>
      inkLine(ctx, run, closed, {
        width: (cleft ? 0.75 : fine ? 1.15 : 1) * px * (0.6 + 0.4 * a),
        color: k.line,
        alpha: (dark ? 0.8 : 0.9) * (cleft ? 0.75 : 1) * a,
        plate: true,
        seed: k.seed ^ (bi * 31 + run.length),
        light: dark ? UNLIGHT : LIGHT,
        min: 0.25 * px,
      });
    // Toward the foot the line goes on down with the wash, at half its
    // weight and strength once the wash is half gone, and is broken off
    // only where the wash has all but gone.
    const fading = (run: number[], cleft: boolean, closed: boolean) => {
      const mm = run.length / 2;
      const lv: number[] = [];
      for (let i = 0; i < mm; i++) {
        const v = lf(run[i * 2], run[i * 2 + 1]);
        lv.push(v < 0.12 ? 0 : v > 0.5 ? 2 : 1);
      }
      if (lv.every((v) => v === 2)) {
        pen(run, cleft, closed);
        return;
      }
      const start = closed ? Math.max(0, lv.findIndex((v, i) => v !== lv[(i - 1 + mm) % mm])) : 0;
      const n = mm + (closed ? 1 : 0);
      const at = (q: number) => (start + q) % mm;
      // Steps of one weight, as [from, to) in q; each drawn a few points
      // into its neighbours (where they are drawn too), so the tapers at
      // its ends lie under the next step's line and it runs on unbroken.
      const steps: [number, number, number][] = [];
      for (let q = 0; q < n; q++) {
        const v = lv[at(q)];
        const last = steps[steps.length - 1];
        if (last && last[2] === v && last[1] === q) last[1] = q + 1;
        else steps.push([q, q + 1, v]);
      }
      const ALPHA = [0, 0.5, 1];
      for (const [q0, q1, v] of steps) {
        if (v === 0) continue;
        let a = q0;
        let b = q1;
        for (let k = 0; k < 3 && a > 0 && lv[at(a - 1)] > 0; k++) a--;
        for (let k = 0; k < 3 && b < n && lv[at(b)] > 0; k++) b++;
        const sub: number[] = [];
        for (let q = a; q < b; q++) sub.push(run[at(q) * 2], run[at(q) * 2 + 1]);
        if (sub.length >= 6) pen(sub, cleft, false, ALPHA[v]);
      }
    };
    if (!flags.some(Boolean)) fading(pts, false, true);
    else {
      // Runs round the ring, starting where one begins so none is cut at the seam.
      const s0 = flags.findIndex((f, i) => f !== flags[(i - 1 + m) % m]);
      let run: number[] = [];
      let kind = flags[s0];
      for (let q = 0; q <= m; q++) {
        const i = (s0 + q) % m;
        if (q === m || flags[i] !== kind) {
          run.push(pts[i * 2], pts[i * 2 + 1]);
          if (run.length >= 6) fading(run, kind, false);
          run = [];
          kind = flags[i];
        }
        run.push(pts[i * 2], pts[i * 2 + 1]);
      }
    }
  });
  // The bedding planes, broken, over the boulders they cross; let go of
  // with the rest of the pen toward the foot.
  if (strata.length) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.clip(union);
    for (const [xa, ya, xb, yb] of strata) {
      for (const piece of strataLine(xa, ya, xb, yb, rs, px)) {
        const mid = piece.length >> 1;
        const a = lf(piece[mid & ~1], piece[(mid & ~1) + 1]);
        if (a < 0.1) continue;
        inkLine(ctx, piece, false, {
          width: (fine ? 0.95 : 0.8) * px,
          color: k.line,
          alpha: (dark ? 0.5 : 0.8) * a,
          swell: 0,
          lost: 0,
          taper: [0.12, 0.2],
          raw: true,
          min: 0.25 * px,
        });
      }
    }
    ctx.restore();
  }
  // Far off, three to six strokes of the hatch where it is darkest (where it
  // is lit, on dark water), so a rock in the haze is still drawn, never smoke.
  if (far) {
    const rh = mulberry32(k.seed ^ 0x68e31da4);
    const want = 3 + Math.floor(rh() * 4);
    const cands: [number, number, number][] = [];
    const yBot = Math.max(shape.minY + 4 * px, (fa + 0.05) * H);
    for (let i = 0; i < 90; i++) {
      const x = X(shape.lo + (shape.hi - shape.lo) * rh());
      const y = Y(shape.minY + (yBot - shape.minY) * rh());
      let front = -1;
      for (let j = shape.boulders.length - 1; j >= 0; j--) {
        if (inB(shape.boulders[j], x, y, 3 * px)) {
          front = j;
          break;
        }
      }
      if (front < 0 || lf(x, y) < 0.4) continue;
      const b = shape.boulders[front];
      const ex = (x - X(b.cx)) / b.rx;
      const ey = (y - Y(b.cy)) / b.ry;
      const s2 = Math.min(1, ex * ex + ey * ey);
      const nz = Math.sqrt(1 - s2);
      const s = clamp01(0.5 - 0.62 * (ex * LV[0] + ey * LV[1] + nz * LV[2]) + 0.1 * ey);
      cands.push([dark ? 1 - s : s, x, y]);
    }
    cands.sort((p, q) => q[0] - p[0]);
    const strokes = new Path2D();
    const picked: [number, number][] = [];
    const len = Math.max(6 * px, Math.min(11 * px, 0.25 * shape.height));
    for (const [, x, y] of cands) {
      if (picked.length >= want) break;
      if (picked.some(([px0, py0]) => Math.hypot(px0 - x, py0 - y) < len * 0.35)) continue;
      picked.push([x, y]);
      const ax = Math.sin(HATCH_LEAN + (rh() - 0.5) * 0.08);
      const ay = Math.cos(HATCH_LEAN + (rh() - 0.5) * 0.08);
      const l = len * range(rh, 0.75, 1.1);
      const wd = 0.5 * px;
      strokes.moveTo(x - (ax * l) / 2, y - (ay * l) / 2);
      strokes.lineTo(x + ay * wd * 0.5, y - ax * wd * 0.5);
      strokes.lineTo(x + (ax * l) / 2, y + (ay * l) / 2);
      strokes.lineTo(x - ay * wd * 0.5, y + ax * wd * 0.5);
      strokes.closePath();
    }
    ctx.fillStyle = k.line;
    ctx.globalAlpha = dark ? 0.35 : 0.42;
    ctx.fill(strokes);
  }
  // Where the pigment settled unevenly over the whole of it (drawn big only:
  // a phone's screen would not show it), and the paper's tooth.
  if (fine && px >= 3) {
    const x0 = Math.min(X(shape.lo), X(shape.hi));
    mottle(ctx, union, { x: x0, y: Y(shape.minY), w: Math.abs(X(shape.hi) - X(shape.lo)), h: shape.height - shape.minY }, deep, lift, dark ? 0.16 : 0.2, k.seed ^ 0x3d);
  }
  if (fine) {
    const gr = grain(ctx);
    if (gr) {
      gr.setTransform?.(new DOMMatrix([px, 0, 0, px, 0, 0]));
      ctx.fillStyle = gr;
      ctx.globalAlpha = dark ? 0.3 : 0.22;
      ctx.fill(union);
    }
  }
  if (k.barnacles && !far && d > 0.3 && r() < 0.7) {
    // A few barnacles on a boulder's top: a low cone, its plates, the slit on top.
    const nb = 2 + Math.floor(r() * 4);
    const u0 = shape.span * (0.25 + 0.4 * r());
    const shell = dark ? mixHex(k.rock, '#E8E0CF', 0.35) : mixHex(k.rock, '#FBF8EF', 0.55);
    for (let q = 0; q < nb; q++) {
      const u = u0 + q * (4 + r() * 6) * px;
      const bw = (2.2 + r() * 1.6) * px;
      const x = X(u);
      const y = Y(shape.top(u)) + (2 + r() * 4) * px;
      const cone = new Path2D();
      cone.moveTo(x - bw, y + bw * 0.35);
      cone.quadraticCurveTo(x - bw * 0.7, y - bw * 0.6, x - bw * 0.3, y - bw * 0.7);
      cone.lineTo(x + bw * 0.3, y - bw * 0.7);
      cone.quadraticCurveTo(x + bw * 0.7, y - bw * 0.6, x + bw, y + bw * 0.35);
      cone.closePath();
      ctx.fillStyle = shell;
      ctx.globalAlpha = 0.9;
      ctx.fill(cone);
      ctx.strokeStyle = k.line;
      ctx.lineWidth = 0.5 * px;
      ctx.globalAlpha = 0.8;
      ctx.stroke(cone);
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.25, y - bw * 0.62);
      ctx.lineTo(x + bw * 0.25, y - bw * 0.62);
      for (const f of [-0.55, 0, 0.55]) {
        ctx.moveTo(x + f * bw * 0.5, y - bw * 0.55);
        ctx.lineTo(x + f * bw, y + bw * 0.25);
      }
      ctx.lineWidth = 0.4 * px;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
    }
  }
  // The foot let go of: the wash running dry down into the water, along a
  // ragged line rather than a level one, laid in narrow columns that meet
  // without overlapping (an overlap would erase twice).
  const fade = ctx.createLinearGradient(0, 0, 0, (fb - fa) * H);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.3, 'rgba(0,0,0,0.22)');
  fade.addColorStop(0.65, 'rgba(0,0,0,0.7)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1;
  ctx.fillStyle = fade;
  const cw = Math.max(2, Math.round(3 * px));
  const xa = Math.floor(Math.min(X(shape.lo), X(shape.hi)) - 6 * px);
  const xb = Math.ceil(Math.max(X(shape.lo), X(shape.hi)) + 6 * px);
  const base = ctx.getTransform();
  for (let x = xa; x < xb; x += cw) {
    ctx.setTransform(base.translate(0, Y((fa + 0.05 * ragged(x + cw / 2)) * H)));
    ctx.fillRect(x, 0, cw, ctx.canvas.height);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The engraver's hatch, shared by the rocks and the walls

/**
 * Stone is hatched the way a plate engraver hatches it: in short, near
 * straight strokes laid all one way, along the light, whatever the shape
 * (a line that wraps round the form reads as a shell). They lean 15 to 25°
 * off the vertical, top left to bottom right, as the light falls; one set
 * on the page, mirrored for no wall.
 */
const HATCH_LEAN = (20 * Math.PI) / 180;

/**
 * How many strokes to an area, by shade: in shadow one to every 80 square
 * px of pen; on the lit face hardly any, one to 600 or so; between, a ramp.
 */
function hatchOdds(s: number): number {
  if (s <= 0.25) return 0.12;
  if (s >= 0.58) return 1;
  const t = (s - 0.25) / 0.33;
  return 0.12 + 0.88 * t * t * (3 - 2 * t);
}

/** Where the cross-hatch starts: the darkest fifth of the shade. */
const CROSS_FROM = 0.84;

/** A quick integer hash of a seed and two lattice indices, 0 to 2^32. */
function ihash(seed: number, i: number, j: number): number {
  let h = (seed ^ Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A smooth noise in 0..1 off a seed: lattice values, eased between. */
function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ex = fx * fx * (3 - 2 * fx);
  const ey = fy * fy * (3 - 2 * fy);
  const v00 = ihash(seed, xi, yi) / 4294967296;
  const v10 = ihash(seed, xi + 1, yi) / 4294967296;
  const v01 = ihash(seed, xi, yi + 1) / 4294967296;
  const v11 = ihash(seed, xi + 1, yi + 1) / 4294967296;
  const top = v00 + (v10 - v00) * ex;
  const bot = v01 + (v11 - v01) * ex;
  return top + (bot - top) * ey;
}

/** How a stroke's roll is made: part smooth noise (so strokes keep or drop
    in blocks), part its own die. */
const rollOf = (n: number, u: number) => 0.5 * n + 0.5 * u;

/** The roll is bunched toward its middle, so odds of `p` keep a stroke
    whose roll falls under the roll's own `p` quantile: a table of them,
    worked out once. */
let quantiles: Float32Array | null = null;
function spread(p: number): number {
  if (p >= 1) return 2;
  if (p <= 0) return -1;
  if (!quantiles) {
    const n = 4096;
    const r = mulberry32(0x6a09e667);
    const v: number[] = [];
    for (let i = 0; i < n; i++) v.push(rollOf(valueNoise(0x5bd1e995, r() * 400, r() * 400), r()));
    v.sort((a, b) => a - b);
    quantiles = new Float32Array(65);
    for (let i = 0; i <= 64; i++) quantiles[i] = v[Math.min(n - 1, Math.round((i / 64) * (n - 1)))];
  }
  const f = p * 64;
  const i = Math.min(63, Math.floor(f));
  return quantiles[i] + (quantiles[i + 1] - quantiles[i]) * (f - i);
}

interface HatchField {
  /** 0 lit to 1 darkest, in the sense the ink marks (light ink: where it is lit). */
  shade: (x: number, y: number) => number;
  /** Whether a point is inside what is hatched (a stroke is trimmed to it). */
  inside?: (x: number, y: number) => boolean;
  /** How much of the hatching is left at a point, 0 to 1 (a foot let go of,
      a wall going down into the water): fewer strokes, and finer. */
  keep?: (x: number, y: number) => number;
  /** No cross-hatch (light ink on dark water: the brightest stays open). */
  noCross?: boolean;
  /** The odds of a stroke by shade, if not the rocks' (`hatchOdds`). */
  odds?: (s: number) => number;
}

/**
 * Directional hatching over a box, into `into` as filled ribbons (the caller
 * fills it once): lanes of strokes along the lean, `area` square device px
 * to a stroke where it is darkest, each stroke kept by the odds of its
 * shade, pointed at both ends and fattest in its middle, a hair bowed (a
 * turn of 0.05 rad over its length at most). Deterministic from `seed` and
 * the box: a box drawn in pieces comes out as one.
 */
function hatchStrokes(
  into: Path2D | ((y: number) => Path2D),
  box: { x: number; y: number; w: number; h: number },
  f: HatchField,
  o: {
    px: number;
    seed: number;
    len: number;
    width: number;
    /** Square px of pen to a stroke where darkest (80). */
    area?: number;
    /** The set's lean off the vertical (`HATCH_LEAN`); the cross 60° round from it. */
    lean?: number;
    /** How far each stroke may turn off its set, radians either way (0.035). */
    jitter?: number;
    /** How much a stroke's length varies, as a share either way (0.14). */
    vary?: number;
    /** Each lane's strokes started at its own place, not near its
        neighbours': no stroke ends lining up into curves across the lanes
        (on a wall, those read as rows of scales). */
    scatter?: boolean;
    /** How fat a stroke is at its ends, against its middle (0.22: a
        graver's point). Fuller reads as a burin line at poster size,
        not a needle. */
    ends?: number;
    /** How far a lane may sit off its place on the grid, as a share of
        the spacing either way (0.11). Fine strokes evenly apart beat
        against each other into a moiré; uneven lanes never do. */
    space?: number;
  },
): void {
  const { px } = o;
  const len = o.len;
  const gap = Math.max(1.5 * px, 0.16 * len);
  // One stroke to 80 square px of pen where it is darkest.
  const lane = Math.max(1.6 * px, ((o.area ?? 80) * px * px) / (len + gap));
  const lean0 = o.lean ?? HATCH_LEAN;
  const jit = 2 * (o.jitter ?? 0.035);
  const vary = 2 * (o.vary ?? 0.14);
  const sets: [number, boolean][] = [[lean0, false]];
  // Crossed only where the lanes are close enough to read as a tone.
  if (!f.noCross && lane <= 4.6 * px) sets.push([lean0 - Math.PI / 3, true]);
  for (const [lean, cross] of sets) {
    // Along the stroke, and across it.
    const ax = Math.sin(lean);
    const ay = Math.cos(lean);
    const nx = ay;
    const ny = -ax;
    // The box's corners in (along, across): the lanes that cross it.
    let a0 = Infinity;
    let a1 = -Infinity;
    let c0 = Infinity;
    let c1 = -Infinity;
    for (const [x, y] of [
      [box.x, box.y],
      [box.x + box.w, box.y],
      [box.x, box.y + box.h],
      [box.x + box.w, box.y + box.h],
    ]) {
      const a = x * ax + y * ay;
      const c = x * nx + y * ny;
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
    }
    // Lanes on a grid fixed to the page, so pieces of one box line up.
    // Neighbouring lanes start their strokes nearly together and keep or
    // drop them nearly together (a smooth noise under the dice), so the
    // strokes gather into the blocks a graver cuts, not a fall of rain.
    const sp = cross ? lane * 1.15 : lane;
    const period = len + gap;
    const salt = o.seed ^ (cross ? 0x2c1b3c6d : 0);
    for (let c = Math.floor(c0 / sp) * sp; c <= c1; c += sp) {
      const li = Math.round(c / sp);
      const lr = mulberry32(ihash(salt, li, 0x3c6ef372));
      const off = c + (lr() - 0.5) * sp * 2 * (o.space ?? 0.11);
      const phase = o.scatter ? period * lr() : period * (1.6 * valueNoise(salt, li * 0.21, 0.5) + (lr() - 0.5) * 0.1);
      for (let ai = Math.floor((a0 - phase) / period); ai * period + phase <= a1; ai++) {
        const a = ai * period + phase;
        // Each stroke its own dice, so a box drawn in pieces comes out the same.
        const sr = mulberry32(ihash(salt ^ 0x9e37, li, ai));
        const l = len * (1 - vary / 2 + vary * sr());
        const am = a + l / 2 + (sr() - 0.5) * gap * 0.3;
        const mx = am * ax + off * nx;
        const my = am * ay + off * ny;
        const roll = rollOf(valueNoise(salt ^ 0x55, am / (period * 1.4), li * 0.23), sr());
        const lean2 = (sr() - 0.5) * jit;
        const bow = (sr() - 0.5) * 0.016 * l;
        if (mx < box.x - len || mx > box.x + box.w + len || my < box.y - len || my > box.y + box.h + len) continue;
        if (f.inside && !f.inside(mx, my)) continue;
        const s = f.shade(mx, my);
        const kp = f.keep ? f.keep(mx, my) : 1;
        if (kp <= 0.02) continue;
        const odds = cross ? clamp01((s - CROSS_FROM) / 0.1) : (f.odds ?? hatchOdds)(s);
        if (roll > spread(odds * kp)) continue;
        // Its own few degrees off the set: 15 to 25° off the vertical in all.
        const ca = Math.cos(lean2);
        const sa = Math.sin(lean2);
        const dx = ax * ca - ay * sa;
        const dy = ax * sa + ay * ca;
        // Trimmed to what it is hatching, from the middle out.
        let t0 = -l / 2;
        let t1 = l / 2;
        if (f.inside) {
          const st = Math.max(1.2 * px, l / 8);
          for (let t = 0; t >= -l / 2; t -= st) {
            if (!f.inside(mx + dx * t, my + dy * t)) break;
            t0 = t;
          }
          for (let t = 0; t <= l / 2; t += st) {
            if (!f.inside(mx + dx * t, my + dy * t)) break;
            t1 = t;
          }
          // No ticks: a stroke cut to a stub is left out, and a crossing
          // one must run most of its length, or it reads as a scribbled x.
          if (t1 - t0 < Math.max(2.5 * px, (cross ? 0.75 : 0.35) * l)) continue;
        }
        const wd = o.width * (0.4 + 0.65 * Math.min(1, s)) * (0.55 + 0.45 * kp) * (cross ? 0.8 : 1);
        // Five points down it, the graver going in and lifting out at its ends.
        const L = t1 - t0;
        const tm = (t0 + t1) / 2;
        const e = o.ends ?? 0.22;
        const w1 = 0.85 + 0.2 * (e - 0.22);
        const W = [e, w1, 1, w1, e];
        const T = [0, 0.25, 0.5, 0.75, 1];
        const side = (k: number, sgn: number): [number, number] => {
          const t = tm + (T[k] - 0.5) * L;
          const b = bow * Math.sin(Math.PI * T[k]);
          const half = (wd * W[k]) / 2;
          return [mx + dx * t - dy * (b + sgn * half), my + dy * t + dx * (b + sgn * half)];
        };
        const path = typeof into === 'function' ? into(my) : into;
        const p0 = side(0, 1);
        path.moveTo(p0[0], p0[1]);
        for (let k = 1; k < 5; k++) {
          const p = side(k, 1);
          path.lineTo(p[0], p[1]);
        }
        for (let k = 4; k >= 0; k--) {
          const p = side(k, -1);
          path.lineTo(p[0], p[1]);
        }
        path.closePath();
      }
    }
  }
}

/** A line broken in two to four, drawn with a little wobble: a bedding plane. */
function strataLine(x0: number, y0: number, x1: number, y1: number, r: Rand, px: number): number[][] {
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 6 * px) return [];
  const pieces: number[][] = [];
  // One to three breaks, fewer on a short line: broken, never a dash rule.
  const nBreak = Math.max(1, Math.min(1 + Math.floor(r() * 3), Math.round(L / (50 * px))));
  const cuts = [0];
  for (let i = 0; i < nBreak; i++) cuts.push(range(r, 0.15, 0.85));
  cuts.push(1);
  cuts.sort((a, b) => a - b);
  const ph = r() * 6.28;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const g = Math.min(0.05, (cuts[i + 1] - cuts[i]) * 0.25, (4 * px) / L) * range(r, 0.6, 1.4);
    const a = cuts[i] + (i > 0 ? g / 2 : 0);
    const b = cuts[i + 1] - (i + 2 < cuts.length ? g / 2 : 0);
    if ((b - a) * L < 4 * px) continue;
    const pts: number[] = [];
    const n = Math.max(3, Math.ceil(((b - a) * L) / (4 * px)));
    for (let k = 0; k <= n; k++) {
      const t = a + ((b - a) * k) / n;
      const wob = Math.sin(ph + t * 11) * 0.5 * px + Math.sin(ph * 2 + t * 29) * 0.3 * px;
      pts.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + wob);
    }
    pieces.push(pts);
  }
  return pieces;
}

/** A smooth step from `a` to `b`. */
function ease(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** A colour's luminance, 0 to 1. */
function lum(hex: string): number {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** How much of a face the hatch covers on the mean at its plain density (measured). */
const HATCH_COVER = 0.25;

/**
 * An engraved ground on paper: the tint it is washed in, and how much more
 * densely than plain it is hatched, so that the hatch (in `ink`) brings the
 * tint down to `stone`'s tone on the mean. The tint is lighter than the
 * stone, toward the paper, and always a clear step above the ink, so the
 * strokes show on it however dark the stone is: a dark stone is a light
 * tint under close, heavy hatching, as an engraver makes a dark.
 */
function engrave(stone: string, paper: string, ink: string, most = 0.6): { tint: string; dense: number } {
  const ls = lum(stone);
  const lp = lum(paper);
  const li = lum(ink);
  // A quarter covered, the plain hatch; but never closer to the ink than this.
  let lw = (ls - HATCH_COVER * li) / (1 - HATCH_COVER);
  lw = Math.min(Math.max(lw, li + 0.22), lp - 0.05, ls + most * (lp - ls));
  if (lw <= ls || lp - ls < 0.02) return { tint: stone, dense: 1 };
  const cover = Math.min(0.55, (lw - ls) / Math.max(0.02, lw - li));
  return { tint: mixHex(stone, paper, clamp01((lw - ls) / (lp - ls))), dense: Math.max(1, cover / HATCH_COVER) };
}

/** A wall's odds of a stroke by shade: one to 80 px² of pen in shadow, one
    to about 280 on its lit faces (the rocks' go barer, to 650). */
function wallOdds(s: number): number {
  return 0.29 + 0.71 * ease(0.2, 0.62, s);
}

/** The same in light ink on dark water, which marks the light: its lit
    faces close, and a stroke here and there in the shadow, so no part of
    a wall is a blank of dark. */
function nightWallOdds(s: number): number {
  return 0.2 + 0.8 * ease(0.15, 0.6, s);
}

/** A scratch context with no transform, to ask a path what is inside it. */
let probe: CanvasRenderingContext2D | null = null;
function probeCtx(): CanvasRenderingContext2D | null {
  if (probe || typeof document === 'undefined') return probe;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  probe = c.getContext('2d');
  return probe;
}

/**
 * A cliff face down a side of the picture, in the rocks' own hand: the
 * rock's wash, the same strokes all one way along the light (dense where
 * the face is in shadow, cross-hatched where darkest, sparse where it is
 * lit), a few broken bedding planes across it with the shadow of the ledge
 * under each, and an ink line down its open side (the side away from the
 * page edge it belongs to), with a strip of bare paper inside it where that
 * side faces the light.
 *
 * `outline` is in the context's own coordinates and `box` is its bounds;
 * `side` is the page edge the wall belongs to (by default whichever edge
 * `box` is nearer, read off the canvas). Below `fadeFrom` its hatching,
 * its line and its wash thin out, to about 0.35 at `fadeTo` (both default
 * to the box's top and bottom).
 *
 * Deterministic from `seed`, `box` and `px`: drawn again, or in strips (one
 * call per strip under a clip), it comes out the same, stroke for stroke.
 * It reads the outline once a 2 px row to find its open edge, so a whole
 * wall costs a few ms; a caller drawing many strips can draw it once to a
 * layer of its own instead.
 */
export function inkWall(
  ctx: CanvasRenderingContext2D,
  outline: Path2D,
  box: { x0: number; y0: number; x1: number; y1: number },
  style: RockStyle,
  px: number,
  seed: number,
  opts?: { side?: 'left' | 'right'; fadeFrom?: number; fadeTo?: number },
): void {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  if (!(bw > 0 && bh > 0)) return;
  const pc = probeCtx();
  const dark = style.dark;
  const side = opts?.side ?? (box.x0 + box.x1 < ctx.canvas.width ? 'left' : 'right');
  // Toward the open water: +1 for a left wall, -1 for a right. A right
  // wall's open edge faces the light, a left wall's turns from it.
  const out = side === 'left' ? 1 : -1;
  const litEdge = out < 0;
  const fy0 = opts?.fadeFrom ?? box.y0;
  const fy1 = Math.max(fy0 + 1, opts?.fadeTo ?? box.y1);
  const keep = (y: number) => {
    const t = clamp01((y - fy0) / (fy1 - fy0));
    return 1 - 0.65 * t * t * (3 - 2 * t);
  };
  const stone = style.rock;
  const nearX = side === 'left' ? box.x0 : box.x1;
  const farX = side === 'left' ? box.x1 : box.x0;

  // The open edge, row by row: the furthest point of the outline out toward
  // the water, bracketed from the row before and then halved down to a
  // fiftieth of a pixel or so.
  const rowStep = Math.max(1, 2 * Math.min(px, 2));
  const rows: number[] = [];
  const edge: number[] = [];
  if (pc) {
    const inside = (x: number, y: number) => pc.isPointInPath(outline, x, y);
    const beyond = (x: number, lim: number) => (x - lim) * out >= 0;
    const coarse = Math.max(2, 3 * px);
    let last = NaN;
    for (let y = box.y0 + rowStep / 2; y < box.y1; y += rowStep) {
      let a: number;
      let b: number;
      if (Number.isFinite(last) && inside(last, y)) {
        a = last;
        b = last + out * coarse;
        while (!beyond(b, farX) && inside(b, y)) {
          a = b;
          b += out * coarse;
        }
      } else {
        a = farX;
        while (!beyond(nearX, a) && !inside(a, y)) a -= out * coarse;
        if (beyond(nearX, a) && !inside(a, y)) {
          last = NaN;
          continue;
        }
        b = a + out * coarse;
      }
      for (let it = 0; it < 6; it++) {
        const m = (a + b) / 2;
        if (inside(m, y)) a = m;
        else b = m;
      }
      rows.push(y);
      edge.push(a);
      last = a;
    }
  }
  const edgeAt = (y: number) => {
    if (!rows.length) return farX;
    const f = Math.max(0, Math.min(rows.length - 1, (y - rows[0]) / rowStep));
    const i = Math.floor(f);
    const j = Math.min(rows.length - 1, i + 1);
    return edge[i] + (edge[j] - edge[i]) * (f - i);
  };

  // Bedding planes across it, near level (±8°), one a 40 to 90 px of pen
  // down, each the lip of a ledge with its shadow under it. A ledge comes
  // and goes along its bed (its shadow deep in places, all but gone in
  // others), so the beds never read as rows.
  const rs = mulberry32(hash32(seed, 'strata'));
  const strata: { y: number; slope: number; x0: number; x1: number; salt: number }[] = [];
  for (let y = box.y0 + range(rs, 14, 44) * px; y < box.y1; y += range(rs, 40, 90) * px) {
    const slope = Math.tan(range(rs, -8, 8) * (Math.PI / 180));
    const e = edgeAt(y);
    const inset = range(rs, 0.05, 0.4) * Math.abs(e - nearX);
    const salt = hash32(seed, 'bed', strata.length);
    if (side === 'left') strata.push({ y, slope, x0: box.x0 - 2 * px, x1: e - inset, salt });
    else strata.push({ y, slope, x0: e + inset, x1: box.x1 + 2 * px, salt });
  }
  const lipAt = (st: (typeof strata)[number], x: number) => st.y + st.slope * (x - box.x0);
  const ledgeShadow = 7 * px;
  const bedAmp = (st: (typeof strata)[number], x: number) => 0.25 + 0.75 * ease(0.3, 0.65, valueNoise(st.salt, x / (55 * px), 0.5));
  const shade = (x: number, y: number) => {
    const e = edgeAt(y);
    // Across the face: deeper back toward the page edge, where the face
    // turns away into the cleft; a left wall's face turned more from the light.
    const toward = clamp01(((e - x) * out) / Math.max(8 * px, bw));
    let s = 0.3 + 0.36 * toward + (litEdge ? -0.06 : 0.04);
    // The stone's faces: blocks of it turned more or less from the light,
    // a joint's width apart, and the roughness on them. Noise, never a
    // period: anything regular across a wall reads as tiles or scales.
    s += 0.56 * (ease(0.36, 0.64, valueNoise(seed, x / (44 * px), y / (31 * px))) - 0.5);
    s += 0.16 * (valueNoise(seed ^ 0x51ed27, x / (15 * px), y / (11 * px)) - 0.5);
    // And the joints between the blocks, wandering, in shadow.
    const jn = Math.abs(valueNoise(seed ^ 0x2f6b1d, x / (70 * px), y / (48 * px)) - 0.5);
    if (jn < 0.05) s += 0.4 * (1 - jn / 0.05);
    // Under each ledge its shadow, dark at the lip and lifting down the
    // face; over it, the ledge's top turned up to the light.
    for (const st of strata) {
      const d = y - lipAt(st, x);
      if (d > ledgeShadow * 4 || d < -2.5 * ledgeShadow) continue;
      const a = bedAmp(st, x);
      if (d > 0) s += 0.5 * a * Math.exp(-d / (1.6 * ledgeShadow));
      else s -= 0.26 * a * (1 + d / (2.5 * ledgeShadow));
    }
    return clamp01(s);
  };
  // Light ink on dark water marks only the faces most in the light.
  const inkShade = dark ? (x: number, y: number) => 0.85 * (1 - shade(x, y)) : shade;
  // On paper the value is the engraver's: the wash a tint, lighter than the
  // stone it stands for, and the hatch (in an ink a step blacker than the
  // line) bringing it down to the stone's tone on the mean, so a wall reads
  // as engraved stone and not a flat grey, however dark the stone it is.
  const ink = dark ? style.line : mixHex(style.line, '#000000', 0.4);
  // (A wall's tint no more than a third of the way to the paper: its lit
  // faces are hatched sparsely, and where the paper is the water's own
  // tone a lighter tint there read as water seen through the stone.)
  const { tint, dense } = dark ? { tint: stone, dense: 1 } : engrave(stone, style.paper, ink, 0.32);
  const deepT = mixHex(tint, dark ? '#000000' : '#2A2320', dark ? 0.45 : 0.32);
  const liftT = mixHex(tint, style.paper, dark ? 0.18 : 0.32);

  ctx.save();
  ctx.clip(outline);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The wash, in bands down the wall so it thins with depth (no layer, no
  // erasing: it may be drawn straight onto the picture), right up to its
  // line: stone is never see-through. Where the open edge faces the light
  // the stone just inside the line is lifted toward the paper, after.
  const g = ctx.createLinearGradient(farX, box.y0, nearX, box.y0 + bw * 0.6);
  g.addColorStop(0, mixHex(tint, liftT, 0.3));
  g.addColorStop(0.55, tint);
  g.addColorStop(1, mixHex(tint, deepT, 0.55));
  ctx.fillStyle = g;
  // Bands on whole device pixels, so they meet without a seam.
  const washBands = 28;
  const bandY = (i: number) => (i <= 0 ? box.y0 - 2 : i >= washBands ? box.y1 + 2 : Math.round(box.y0 + (bh * i) / washBands));
  for (let i = 0; i < washBands; i++) {
    const ya = bandY(i);
    const yb = bandY(i + 1);
    ctx.globalAlpha = keep((ya + yb) / 2);
    ctx.fillRect(Math.floor(box.x0) - 2, ya, bw + 4, yb - ya);
  }
  // Where the pigment settled unevenly, a wall's width at a time down it,
  // and the paper's tooth, both going with the wash.
  const rm = mulberry32(hash32(seed, 'mottle'));
  for (let y = box.y0; y < box.y1; y += bw * 1.4) {
    const hgt = Math.min(bw * 1.8, box.y1 - y);
    mottle(ctx, outline, { x: box.x0, y, w: bw, h: hgt }, deepT, liftT, (dark ? 0.2 : 0.26) * keep(y + hgt / 2), (rm() * 4294967296) >>> 0);
  }
  const gr = grain(ctx);
  if (gr) {
    gr.setTransform?.(new DOMMatrix([px, 0, 0, px, 0, 0]));
    ctx.fillStyle = gr;
    for (let i = 0; i < washBands; i++) {
      const ya = bandY(i);
      const yb = bandY(i + 1);
      ctx.globalAlpha = (dark ? 0.3 : 0.24) * keep((ya + yb) / 2);
      ctx.fillRect(Math.floor(box.x0) - 2, ya, bw + 4, yb - ya);
    }
  }
  // Along an open edge facing the light, the stone lifted toward the paper
  // in a strip 2.5 px of pen wide inside the line: lighter stone, opaque.
  if (litEdge && rows.length > 1) {
    const lip = new Path2D();
    lip.moveTo(edge[0], rows[0]);
    for (let i = 1; i < rows.length; i++) lip.lineTo(edge[i], rows[i]);
    ctx.strokeStyle = liftT;
    ctx.lineWidth = 2 * 2.5 * px;
    ctx.globalAlpha = dark ? 0.45 : 0.6;
    ctx.stroke(lip);
  }
  // Where the pigment ran to the open edge and dried there: darker along it.
  if (rows.length > 1) {
    const pool = new Path2D();
    const inset = (litEdge ? 5 * px : 0) * -out;
    pool.moveTo(edge[0] + inset, rows[0]);
    for (let i = 1; i < rows.length; i++) pool.lineTo(edge[i] + inset, rows[i]);
    ctx.strokeStyle = deepT;
    ctx.lineWidth = 5 * px;
    ctx.globalAlpha = dark ? 0.25 : 0.3;
    ctx.stroke(pool);
  }
  // The shadow under each ledge, in the wash: the ink comes after.
  for (const st of strata) {
    const xa = box.x0 - 4 * px;
    const xb = box.x1 + 4 * px;
    const sg = ctx.createLinearGradient(0, st.y, 0, st.y + ledgeShadow * 1.6);
    sg.addColorStop(0, rgba(deepT, 0.32));
    sg.addColorStop(1, rgba(deepT, 0));
    ctx.fillStyle = sg;
    ctx.globalAlpha = keep(st.y);
    ctx.beginPath();
    ctx.moveTo(xa, lipAt(st, xa));
    ctx.lineTo(xb, lipAt(st, xb));
    ctx.lineTo(xb, lipAt(st, xb) + ledgeShadow * 1.6);
    ctx.lineTo(xa, lipAt(st, xa) + ledgeShadow * 1.6);
    ctx.closePath();
    ctx.fill();
  }
  // The hatching, binned into bands down the wall so its alpha thins with
  // depth. Depth takes the ink's strength more than its strokes: far down
  // a wall is still hatched, only fainter.
  const len = Math.max(20, Math.min(28, bw / (5 * px))) * px;
  const field: HatchField = {
    shade: inkShade,
    keep: (x, y) => (litEdge && Math.abs(x - edgeAt(y)) < 4.5 * px ? 0 : 0.72 + 0.28 * keep(y)),
    noCross: dark,
    odds: dark ? nightWallOdds : wallOdds,
  };
  const bands = 24;
  const bins = Array.from({ length: bands }, () => new Path2D());
  const binOf = (y: number) => bins[Math.max(0, Math.min(bands - 1, Math.floor(((y - box.y0) / bh) * bands)))];
  hatchStrokes(binOf, { x: box.x0, y: box.y0, w: bw, h: bh }, field, {
    px,
    seed: hash32(seed, 'hatch'),
    len,
    // Closer and heavier where the stone is darker than a plain hatch makes it.
    area: 80 / Math.pow(dense, 0.55),
    width: (dark ? 0.8 : 1.05) * px * Math.pow(dense, 0.45),
    scatter: true,
    vary: dark ? 0.4 : 0.24,
    jitter: 0.045,
    ends: 0.6,
  });
  ctx.fillStyle = ink;
  bins.forEach((b, i) => {
    ctx.globalAlpha = (dark ? 0.35 : 0.85) * (0.45 + 0.55 * keep(box.y0 + (bh * (i + 0.5)) / bands));
    ctx.fill(b);
  });
  // The bedding planes, broken, in the pen. Light ink on dark water draws
  // three at most, and faint: more, and the wall is ruled.
  ctx.globalAlpha = 1;
  const drawn = dark ? new Set(strata.map((st, i) => [valueNoise(st.salt, 0.5, 0.5), i]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((v) => v[1])) : null;
  strata.forEach((st, i) => {
    const pieces = strataLine(st.x0, lipAt(st, st.x0), st.x1, lipAt(st, st.x1), rs, px);
    if (drawn && !drawn.has(i)) return;
    for (const piece of pieces) {
      inkLine(ctx, piece, false, {
        width: 1.1 * px,
        color: style.line,
        alpha: (dark ? 0.22 : 0.9) * keep(st.y),
        taper: [0.12, 0.2],
        raw: true,
        swell: 0,
        lost: 0,
        min: 0.25 * px,
      });
    }
  });
  ctx.restore();
  // The open edge in one pressure line: heavy where the face turns from the
  // light (a left wall's), lighter and lifting where it faces it; broken
  // where a row lost the outline. Its alpha follows depth band by band.
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i] - rows[i - 1] > rowStep * 1.5) {
      runs.push(run);
      run = [];
    }
    run.push(edge[i], rows[i]);
  }
  runs.push(run);
  const edgeBands = 12;
  const eY = (i: number) => (i <= 0 ? box.y0 - 8 * px : i >= edgeBands ? box.y1 + 8 * px : Math.round(box.y0 + (bh * i) / edgeBands));
  for (let i = 0; i < edgeBands; i++) {
    const ya = eY(i);
    const yb = eY(i + 1);
    const a = keep((ya + yb) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.floor(box.x0) - 8 * px, ya, bw + 16 * px, yb - ya);
    ctx.clip();
    for (const rn of runs) {
      if (rn.length < 6 || rn[1] > yb + 4 * px || rn[rn.length - 1] < ya - 4 * px) continue;
      inkLine(ctx, rn, false, {
        width: (litEdge ? 0.95 : 1.3) * px * (dark ? 0.8 : 1),
        color: style.line,
        alpha: (dark ? 0.6 : 0.9) * a,
        swell: 0.5,
        lost: litEdge ? 0.45 : 0.12,
        taper: [0.02, 0.02],
        raw: true,
        seed: hash32(seed, 'edge', Math.round(rn[1])),
        light: dark ? UNLIGHT : LIGHT,
        min: 0.25 * px,
      });
    }
    ctx.restore();
  }
}

/**
 * A floor, or any level ground, in the walls' hand: the stone's wash (on
 * paper a tint the hatch brings down to the stone's tone, as `inkWall`'s),
 * its beds in strokes laid level (within a few degrees), sparse under its
 * top and closing up and darkening toward the bottom, a few long broken
 * bedding lines across it (the top ones following the crest's swells, the
 * deeper ones forgetting them), and along its top one ink line, broken
 * about a third of its length, with nothing lighter under it.
 *
 * `outline` is the ground in the context's coordinates and `box` its bounds.
 * `crest`, flat x,y pairs left to right along its top, saves reading the
 * outline for it. `wash: false` draws only the ink, over a ground already
 * laid (it must then be light enough for the ink to show on). Below
 * `fadeFrom` the ink thins to about a third at `fadeTo` (by default it holds
 * all the way down). Deterministic from `seed`, `box` and `px`: drawn again,
 * or in strips under a clip, it comes out the same, stroke for stroke.
 */
export function inkFloor(
  ctx: CanvasRenderingContext2D,
  outline: Path2D,
  box: { x0: number; y0: number; x1: number; y1: number },
  style: RockStyle,
  px: number,
  seed: number,
  opts?: { crest?: number[]; wash?: boolean; fadeFrom?: number; fadeTo?: number },
): void {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  if (!(bw > 0 && bh > 0)) return;
  const dark = style.dark;
  // The crest: given, or read off the outline a column at a time.
  const colStep = Math.max(1, 2 * Math.min(px, 2));
  const cx: number[] = [];
  const cy: number[] = [];
  if (opts?.crest && opts.crest.length >= 4) {
    for (let i = 0; i < opts.crest.length; i += 2) {
      cx.push(opts.crest[i]);
      cy.push(opts.crest[i + 1]);
    }
  } else {
    const pc = probeCtx();
    if (pc) {
      const coarse = Math.max(2, 3 * px);
      for (let x = box.x0 + colStep / 2; x < box.x1; x += colStep) {
        let y = box.y0;
        while (y < box.y1 && !pc.isPointInPath(outline, x, y)) y += coarse;
        if (y >= box.y1) continue;
        let a = Math.max(box.y0, y - coarse);
        let b = y;
        for (let it = 0; it < 6; it++) {
          const m = (a + b) / 2;
          if (pc.isPointInPath(outline, x, m)) b = m;
          else a = m;
        }
        cx.push(x);
        cy.push(b);
      }
    }
  }
  if (cx.length < 2) return;
  const crestAt = (x: number) => {
    if (x <= cx[0]) return cy[0];
    if (x >= cx[cx.length - 1]) return cy[cy.length - 1];
    let lo = 0;
    let hi = cx.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cx[m] <= x) lo = m;
      else hi = m;
    }
    const t = (x - cx[lo]) / Math.max(1e-6, cx[hi] - cx[lo]);
    return cy[lo] + (cy[hi] - cy[lo]) * t;
  };
  let top = Infinity;
  for (const v of cy) top = Math.min(top, v);
  const fy0 = opts?.fadeFrom ?? box.y1;
  const fy1 = Math.max(fy0 + 1, opts?.fadeTo ?? box.y1 + 1);
  const keep = (y: number) => 1 - 0.65 * ease(0, 1, (y - fy0) / (fy1 - fy0));
  // How far down the ground a point is, 0 at its crest to 1 at the bottom.
  const down = (x: number, y: number) => clamp01((y - crestAt(x)) / Math.max(8 * px, box.y1 - top));

  const stone = style.rock;
  const ink = dark ? style.line : mixHex(style.line, '#000000', 0.4);
  const { tint, dense } = dark ? { tint: stone, dense: 1 } : engrave(stone, style.paper, ink);
  const deepT = mixHex(tint, dark ? '#000000' : '#2A2320', dark ? 0.45 : 0.32);
  const liftT = mixHex(tint, style.paper, dark ? 0.15 : 0.25);

  // The beds: a long broken line every 30 to 70 px of pen down, the upper
  // ones following the crest's swells, the deeper ones level.
  const rs = mulberry32(hash32(seed, 'floor-beds'));
  const beds: { y: number; tilt: number; follow: number }[] = [];
  for (let y = top + range(rs, 10, 26) * px; y < box.y1; y += range(rs, 30, 70) * px) {
    const k = clamp01((y - top) / Math.max(1, bh));
    beds.push({ y, tilt: Math.tan(range(rs, -3, 3) * (Math.PI / 180)), follow: (1 - k) * (1 - k) * range(rs, 0.7, 1) });
  }
  const bedAt = (b: (typeof beds)[number], x: number) => b.y + b.follow * (crestAt(x) - top) + b.tilt * (x - box.x0);

  ctx.save();
  ctx.clip(outline);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opts?.wash !== false) {
    const g = ctx.createLinearGradient(0, top, 0, box.y1);
    g.addColorStop(0, mixHex(tint, liftT, 0.5));
    g.addColorStop(0.35, tint);
    g.addColorStop(1, mixHex(tint, deepT, 0.6));
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fillRect(box.x0 - 2, box.y0 - 2, bw + 4, bh + 4);
    const rm = mulberry32(hash32(seed, 'floor-mottle'));
    const span = Math.max(bh, 40 * px) * 1.6;
    for (let x = box.x0; x < box.x1; x += span) {
      mottle(ctx, outline, { x, y: top, w: Math.min(span * 1.2, box.x1 - x), h: box.y1 - top }, deepT, liftT, dark ? 0.18 : 0.22, (rm() * 4294967296) >>> 0);
    }
    const gr = grain(ctx);
    if (gr) {
      gr.setTransform?.(new DOMMatrix([px, 0, 0, px, 0, 0]));
      ctx.fillStyle = gr;
      ctx.globalAlpha = dark ? 0.3 : 0.24;
      ctx.fillRect(box.x0 - 2, box.y0 - 2, bw + 4, bh + 4);
    }
  }
  // The strata, in level strokes: few under the crest, closing up and
  // darker toward the bottom, in long lenses (a smooth noise drawn out
  // along the beds) so they never read as ruled.
  const shade = (x: number, y: number) => {
    let s = 0.2 + 0.6 * down(x, y);
    s += 0.36 * (ease(0.3, 0.7, valueNoise(seed, x / (90 * px), y / (16 * px))) - 0.5);
    s += 0.14 * (valueNoise(seed ^ 0x3b9a, x / (30 * px), y / (7 * px)) - 0.5);
    for (const b of beds) {
      const d = y - bedAt(b, x);
      if (d > 0 && d < 12 * px) s += 0.22 * Math.exp(-d / (4 * px));
    }
    return clamp01(s);
  };
  const field: HatchField = {
    shade: dark ? (x, y) => 0.85 * (1 - 0.6 * shade(x, y)) * (0.4 + 0.6 * (1 - down(x, y))) : shade,
    inside: (x, y) => y > crestAt(x) + 2.5 * px,
    keep: (x, y) => 0.72 + 0.28 * keep(y),
    noCross: true,
    odds: (s) => 0.12 + 0.88 * ease(0.15, 0.75, s),
  };
  const bands = 16;
  const bins = Array.from({ length: bands }, () => new Path2D());
  const binOf = (y: number) => bins[Math.max(0, Math.min(bands - 1, Math.floor(((y - box.y0) / bh) * bands)))];
  hatchStrokes(binOf, { x: box.x0, y: Math.max(box.y0, top - 2 * px), w: bw, h: box.y1 - Math.max(box.y0, top - 2 * px) }, field, {
    px,
    seed: hash32(seed, 'floor-hatch'),
    len: 26 * px,
    // One stroke to 110 px² of pen at the darkest: about 150 on the mean.
    area: 110 / Math.pow(dense, 0.55),
    width: (dark ? 0.75 : 0.95) * px * Math.pow(dense, 0.45),
    lean: Math.PI / 2 + range(mulberry32(hash32(seed, 'floor-lean')), -0.04, 0.04),
    jitter: 0.07,
    vary: 0.5,
    scatter: true,
    ends: 0.5,
  });
  ctx.fillStyle = ink;
  bins.forEach((b, i) => {
    ctx.globalAlpha = (dark ? 0.3 : 0.8) * (0.45 + 0.55 * keep(box.y0 + (bh * (i + 0.5)) / bands));
    ctx.fill(b);
  });
  // The bedding lines, broken; light ink draws three at most, and faint.
  const drawn = dark ? new Set(beds.map((b, i) => [valueNoise(seed ^ i, 0.5, 0.5), i]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((v) => v[1])) : null;
  beds.forEach((b, i) => {
    const pts: number[] = [];
    const n = Math.max(4, Math.ceil(bw / (6 * px)));
    for (let q = 0; q <= n; q++) {
      const x = box.x0 + (bw * q) / n;
      pts.push(x, bedAt(b, x));
    }
    const rb = mulberry32(hash32(seed, 'bed-line', i));
    // Runs of it, each 60 to 220 px of pen, a gap between: most of it gone.
    let u = rb() * 80 * px;
    while (u < bw) {
      const on = range(rb, 60, 220) * px;
      const a = Math.floor((u / bw) * n);
      const z = Math.min(n, Math.ceil(((u + on) / bw) * n));
      if (z - a >= 2 && (!drawn || drawn.has(i))) {
        const run = pts.slice(a * 2, z * 2 + 2);
        const kd = down(run[0], run[1]);
        inkLine(ctx, run, false, {
          width: 0.9 * px,
          color: style.line,
          alpha: (dark ? 0.22 : 0.35 + 0.4 * kd) * keep(run[1]),
          taper: [0.15, 0.2],
          raw: true,
          swell: 0,
          lost: 0,
          min: 0.25 * px,
        });
      }
      u += on + range(rb, 40, 160) * px;
    }
  });
  ctx.restore();
  // Its top: one ink line, a third of it broken out in gaps, and nothing
  // lighter under it.
  const rc = mulberry32(hash32(seed, 'floor-crest'));
  let run: number[] = [];
  let on = rc() < 0.75;
  let left = (on ? range(rc, 50, 160) : range(rc, 20, 70)) * px;
  const flush = () => {
    if (run.length >= 6) {
      inkLine(ctx, run, false, {
        width: 0.6 * px,
        color: style.line,
        alpha: dark ? 0.7 : 0.9,
        swell: 0.6,
        lost: 0,
        taper: [0.08, 0.12],
        raw: true,
        seed: hash32(seed, 'crest', Math.round(run[0])),
        light: dark ? UNLIGHT : LIGHT,
        min: 0.3 * px,
      });
    }
    run = [];
  };
  for (let i = 0; i < cx.length; i++) {
    if (on) run.push(cx[i], cy[i]);
    if (i + 1 < cx.length) left -= Math.hypot(cx[i + 1] - cx[i], cy[i + 1] - cy[i]);
    if (left <= 0) {
      if (on) flush();
      on = !on;
      left = (on ? range(rc, 50, 160) : range(rc, 20, 70)) * px;
    }
  }
  flush();
}

/** `#rrggbb` as rgba() at `a`. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** The colours a rock is washed and lined in at a depth: the zone's water,
    browned toward stone on light water and darkened on dark. */
export function rockStyle(zoneWater: Water, dark: boolean, px: number, d: number, seed: number): RockStyle {
  return {
    rock: dark ? mixHex(zoneWater.bottom, '#000000', 0.22) : mixHex(zoneWater.bottom, '#7D6E5A', 0.5),
    line: dark ? IRON_GALL.dark : IRON_GALL.light,
    paper: dark ? mixHex(zoneWater.top, IRON_GALL.dark, 0.35) : mixHex(zoneWater.top, '#FBF8EF', 0.7),
    dark,
    d,
    px,
    seed,
  };
}

// ---------------------------------------------------------------------------
// The sprite

function render(o: Outcrop, w: number, h: number, dark: boolean, px: number): Placed | null {
  const span = (o.reach + 0.03) * w;
  const shape = rockShape(hash32(o.id, 'rock'), span, o.thick * h, px, outcropGrammar(o));
  const tallest = Math.max(0, ...o.growths.map((g) => g.size)) * px;
  // Room out past the lip for what grows there, a fan being wider than tall.
  const padIn = Math.max(24 * px, tallest * 0.95);
  const padT = Math.ceil(tallest * 1.15 + 16 * px - Math.min(0, shape.minY));
  const uLo = -2 * px;
  const cw = Math.min(4096, Math.ceil(Math.max(shape.hi, span) - uLo + padIn));
  const ch = Math.min(4096, Math.ceil(padT + rockFoot(shape) + 8 * px));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Drawn for its own wall, so the light stays top left either way.
  const dir: 1 | -1 = o.edge < 0 ? 1 : -1;
  const x0 = dir > 0 ? -uLo : cw + uLo;
  const X = (u: number) => x0 + dir * u;
  const oy = padT;
  const zw = waterAt(zoneMid(o.zone), dark ? 'night' : 'paper', '#A8BCC9');
  // Fainter as the light goes, but never lost: in the dark the rock is
  // what the growths stand on, and it is mostly its ink that shows.
  const alpha = 0.92 * (0.65 + 0.35 * zw.light);
  // The rock straight onto the sprite, then thinned to its alpha all at
  // once (the growths come after, at their own).
  inkRock(ctx, shape, { x0, y0: oy, dir }, {
    ...rockStyle(zw, dark, px, detailFor(Math.min(span, shape.height * 2.5)), hash32(o.id, 'rock')),
    barnacles: o.zone < 2,
  });
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1 - alpha;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
  const crestY = (f: number) => oy + shape.top(f * span);
  // Under the growths, so a coral at its edge stands on the sand.
  if (o.eels) drawSand(ctx, o, o.eels, (f) => X(f * span), crestY, dark, px);
  for (const g of o.growths) {
    const u = 0.03 * w + g.at * o.reach * w;
    ctx.save();
    // Sunk a little into the rock, so it stands on it rather than floats.
    ctx.translate(X(u), crestY(u / span) + 2 * px);
    drawGrowth(ctx, g, o.zone, dark, px);
    ctx.restore();
  }
  // Where the canvas's left edge falls on the page: the wall is 3% of the page off it.
  const left = dir > 0 ? uLo - 0.03 * w : w + 0.03 * w - cw - uLo;
  return { canvas, left, oy };
}

/** Where a point `f` (0..1 along the rock top from its own edge) sits on the page, in device px, for a rock in view: the top of the rock at f. */
export function rockTopAt(o: Outcrop, top: number, f: number, w: number, h: number, px: number): { x: number; y: number } {
  const span = (o.reach + 0.03) * w;
  const shape = rockShape(hash32(o.id, 'rock'), span, o.thick * h, px, outcropGrammar(o));
  // The rock's wall is 3% of the page out past the edge.
  const x = span * f - 0.03 * w;
  return { x: o.edge < 0 ? x : w - x, y: top * h + shape.top(f * span) };
}

/** How high the sand stands over the crest at `f`, in CSS pixels: a low
    mound, highest in the middle and running out to nothing at its ends. */
export function sandLift(p: EelPatch, f: number): number {
  const u = (f - p.at) / (p.width / 2);
  return Math.abs(u) >= 1 ? 0 : 3.5 * (0.5 + 0.5 * Math.cos(Math.PI * u));
}

/** The burrows in a patch, one per eel, each with `f` along the rock top and
    how high the sand lifts it over the crest, in CSS pixels. Evenly spread
    over the middle of the mound and nudged, the way a colony keeps its
    distance. */
export function eelHoles(p: EelPatch): { f: number; lift: number }[] {
  const r = mulberry32(p.seed);
  const spread = p.width * 0.78;
  const step = spread / p.count;
  return Array.from({ length: p.count }, (_, i) => {
    const f = p.at - spread / 2 + step * (i + 0.5) + range(r, -0.22, 0.22) * step;
    return { f, lift: sandLift(p, f) };
  });
}

/** A garden eels' patch: a low mound of pale sand on the rock's top, in the
    rock's pen: a crest line that breaks in the light, a wash, stipple
    gathered toward its shaded foot, and a burrow for each eel. The eels are
    drawn live by `garden-eels.ts`. */
function drawSand(
  ctx: CanvasRenderingContext2D,
  o: Outcrop,
  p: EelPatch,
  X: (f: number) => number,
  crestY: (f: number) => number,
  dark: boolean,
  px: number,
) {
  const zw = waterAt(zoneMid(o.zone), dark ? 'night' : 'paper', '#A8BCC9');
  const sand = dark ? mixHex(zw.bottom, '#D8CCB0', 0.42) : mixHex('#E9DFC6', zw.bottom, 0.22);
  const line = dark ? IRON_GALL.dark : IRON_GALL.light;
  const hole = dark ? '#0B0A09' : mixHex(zw.bottom, '#1A1714', 0.75);
  const alpha = 0.92 * (0.65 + 0.35 * zw.light);
  const f0 = p.at - p.width / 2;
  const top = (f: number) => crestY(f) - sandLift(p, f) * px;
  const crest: number[] = [];
  for (let k = 0; k <= 24; k++) crest.push(X(f0 + (p.width * k) / 24), top(f0 + (p.width * k) / 24));
  // Down into the rock a little, so the sand sits in it rather than on it.
  const mound = new Path2D();
  mound.moveTo(crest[0], crest[1]);
  for (let i = 2; i < crest.length; i += 2) mound.lineTo(crest[i], crest[i + 1]);
  for (let k = 24; k >= 0; k--) mound.lineTo(X(f0 + (p.width * k) / 24), crestY(f0 + (p.width * k) / 24) + 2 * px);
  mound.closePath();
  ctx.save();
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = sand;
  ctx.fill(mound);
  // Stipple, thicker toward the foot of the mound, where it is in shadow.
  const r = mulberry32(p.seed ^ 0x5a17);
  ctx.fillStyle = line;
  const dots = new Path2D();
  for (let i = 0; i < 40; i++) {
    const f = f0 + p.width * (0.04 + 0.92 * r());
    const lift = sandLift(p, f);
    const down = Math.pow(r(), 0.6);
    if (lift < 0.4) continue;
    const x = X(f);
    const y = crestY(f) - lift * px * (1 - down) + 1.2 * px;
    const rad = range(r, 0.3, 0.5) * px;
    dots.moveTo(x + rad, y);
    dots.arc(x, y, rad, 0, Math.PI * 2);
  }
  ctx.globalAlpha = alpha * (dark ? 0.4 : 0.5);
  ctx.fill(dots);
  ctx.restore();
  inkLine(ctx, crest, false, {
    width: 0.8 * px,
    color: line,
    alpha: alpha * 0.75,
    swell: 0.8,
    lost: 0.5,
    taper: [0.15, 0.15],
    seed: p.seed,
    light: dark ? UNLIGHT : LIGHT,
    raw: true,
    min: 0.2 * px,
  });
  // The burrows: small dark mouths, seen a little from above, each with a lit lip.
  ctx.save();
  for (const b of eelHoles(p)) {
    const x = X(b.f);
    const y = crestY(b.f) - b.lift * px + 0.5 * px;
    ctx.fillStyle = hole;
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.9 * px, 0.75 * px, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.4 * px;
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.ellipse(x, y + 0.2 * px, 2.1 * px, 0.9 * px, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  ctx.restore();
}

/** A cubic's points, appended to `out` (not its start). */
function cubicPts(out: number[], p: number[], n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
      u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
    );
  }
}

// ---------------------------------------------------------------------------
// The growths. Each is drawn at its base, standing up (-y), `H` device pixels tall.
//
// Every one is in the same pen as the rock and the animals: a wash of its
// colour (watercolour, pooled at the edge with the paper left bare, when the
// drawing is big enough to show it), shading laid in ink on its shadow side,
// and its own anatomy finer the bigger it is drawn: polyps on the coral,
// grooves in the brain, a lattice in the fan, pores in the sponge. Each
// shape keeps the dice it was always rolled with; what the detail needs
// comes off a second stream, so nothing that stood on a rock moves.

interface Ink {
  /** The pen: every line, in the one ink. */
  ink: string;
  body: string;
  /** The wash on its shadow side. */
  deep: string;
  /** The wash where the light lands: toward the paper, or a faint lift on dark water. */
  lit: string;
  /** The dark of an opening: a sponge's mouth. */
  hollow: string;
  /** A sea pen's light, in the dark. */
  glow: string | null;
}

/** The animals' rule, with the colour drained toward grey and then pale with
    depth; the lines all in the one ink. */
function inkFor(g: Growth, zone: number, dark: boolean): Ink {
  let c = HUES[Math.max(0, Math.min(HUES.length - 1, Math.round(g.hue)))];
  // A sponge keeps more of its colour than the rest: it is never grey.
  const keep = g.kind === 'tube' ? 0.5 : 1;
  if (zone === 1) c = mixHex(c, '#9AA3AB', 0.35 * keep);
  else if (zone >= 2) c = mixHex(c, '#EFE9DC', 0.75);
  const water = dark ? '#1A1815' : '#FBF8EF';
  const body = dark ? mixHex(c, water, 0.45 * keep + 0.1) : mixHex(c, water, 0.2);
  return {
    ink: dark ? IRON_GALL.dark : IRON_GALL.light,
    body,
    deep: dark ? mixHex(body, '#000000', 0.32) : mixHex(body, '#3A2E26', 0.25),
    lit: dark ? mixHex(body, IRON_GALL.dark, 0.35) : mixHex(body, '#FBF8EF', 0.6),
    hollow: dark ? '#0B0A09' : mixHex(c, '#1A1714', 0.75),
    glow: dark && zone >= 2 ? mixHex(c, '#FFFFFF', 0.55) : null,
  };
}

/** How a growth is being drawn. */
interface GPen {
  /** How much drawing it carries, 0 to 1. */
  d: number;
  dark: boolean;
  /** The light as the pen takes it: reversed on dark water, where the light ink marks the light. */
  light: [number, number];
  /** A second stream of dice for the detail, so the shape keeps its own. */
  r2: Rand;
  px: number;
  seed: number;
}

/** One growth, drawn at the context's origin standing up (-y), `g.size`
    CSS px tall, in the pen and colours of its zone. Exported so a picture
    can stand the live sea's coral on its own rocks. */
export function drawGrowth(ctx: CanvasRenderingContext2D, g: Growth, zone: number, dark: boolean, px: number) {
  const r = mulberry32(g.seed);
  const ink = inkFor(g, zone, dark);
  const H = g.size * px;
  ctx.globalAlpha = zone === 0 ? 0.95 : zone === 1 ? 0.85 : 0.6;
  ctx.fillStyle = ink.body;
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 0.9 * px;
  // A growth is small on its rock, so it is judged at three times its height:
  // a reef seen on a wallpaper is near enough to show its polyps.
  const pen: GPen = { d: detailFor(H * 3), dark, light: dark ? UNLIGHT : LIGHT, r2: mulberry32(g.seed ^ 0x6d2b79f5), px, seed: g.seed };
  DRAW[g.kind](ctx, H, ink, r, px, pen);
}

type Drawer = (ctx: CanvasRenderingContext2D, H: number, ink: Ink, r: Rand, px: number, pen: GPen) => void;

/** Stroke at a fraction of the current alpha, then put it back. */
function faint(ctx: CanvasRenderingContext2D, k: number, draw: () => void) {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * k;
  draw();
  ctx.globalAlpha = a;
}

/** A quadratic's points, appended to `out` (not its start). */
function quadPts(out: number[], x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
  }
}

/** An elliptical arc's points from angle a0 to a1, appended to `out`. */
function arcPts(out: number[], cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
}

function boxOf(pts: number[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

function pathOf(pts: number[], closed = true): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  if (closed) p.closePath();
  return p;
}

/** A wash in a shape: watercolour when the drawing is big enough to show it, else flat. */
function wash(ctx: CanvasRenderingContext2D, path: Path2D, box: { x: number; y: number; w: number; h: number }, color: string, pen: GPen, k = 1) {
  const a = ctx.globalAlpha;
  if (pen.d > 0.3) {
    ctx.globalAlpha = 1;
    washFill(ctx, path, box, {
      color,
      alpha: a * k,
      edge: 0.3,
      paper: pen.dark ? null : '#FBF8EF',
      highlight: 0.4,
      granulate: 0.3,
      px: pen.px,
    });
    ctx.globalAlpha = a;
  } else {
    ctx.globalAlpha = a * k;
    ctx.fillStyle = color;
    ctx.fill(path);
    ctx.globalAlpha = a;
  }
}

/** Engraved shading on a shape's shadow side (its lit side, on dark water). */
function shadeIn(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  box: { x: number; y: number; w: number; h: number },
  ink: Ink,
  pen: GPen,
  o: { angle?: number; spacing?: number; from?: number; cross?: number | null; bow?: number; k?: number; dots?: boolean } = {},
) {
  if (pen.d <= 0.4) return;
  const shade = shadeAcross(box, pen.light);
  if (o.dots) {
    stipple(ctx, path, box, {
      spacing: (o.spacing ?? 1.6) * pen.px,
      radius: 0.33 * pen.px,
      shade,
      from: o.from ?? 0.45,
      color: ink.ink,
      alpha: o.k ?? 0.6,
      seed: pen.seed ^ 0x51,
    });
    return;
  }
  hatch(ctx, path, box, {
    spacing: (o.spacing ?? 1.9) * pen.px,
    angle: o.angle ?? 0.9,
    shade,
    from: o.from ?? (pen.dark ? 0.6 : 0.5),
    cross: pen.dark || o.cross === null ? undefined : (o.cross ?? 0.84),
    color: ink.ink,
    width: 0.42 * pen.px,
    alpha: o.k ?? 0.55,
    bow: o.bow ?? 0.4,
    seed: pen.seed ^ 0x77,
  });
}

/** The pen's line round a shape, or along it: the plate's law, as the rock's. */
function outline(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean, ink: Ink, pen: GPen, width = 0.8, taper?: [number, number]) {
  inkLine(ctx, pts, closed, {
    width: width * 0.9 * pen.px,
    color: ink.ink,
    plate: true,
    taper,
    seed: pen.seed,
    light: pen.light,
    min: 0.25 * pen.px,
  });
}

// ---------------------------------------------------------------------------
// The growths' shapes, shared by their drawers and `growthExtent`: each
// rolls its dice in the order its drawer always has, so a shape built for
// its extent is the shape that is drawn.

/** A growth's box about its base, in the px it is drawn at: y up is negative. */
export interface GrowthBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Room for every point of `pts` (flat x, y) and `pad` round it. */
function take(b: GrowthBox, pts: number[], pad = 0) {
  for (let i = 0; i < pts.length; i += 2) {
    b.x0 = Math.min(b.x0, pts[i] - pad);
    b.x1 = Math.max(b.x1, pts[i] + pad);
    b.y0 = Math.min(b.y0, pts[i + 1] - pad);
    b.y1 = Math.max(b.y1, pts[i + 1] + pad);
  }
}

/** Antler coral's branches: [x, y, cx, cy, x1, y1, width] each, a quadratic. */
function branchSegs(H: number, r: Rand, px: number): number[][] {
  const segs: number[][] = [];
  const grow = (x: number, y: number, a: number, len: number, wd: number, lvl: number) => {
    const x1 = x + Math.sin(a) * len;
    const y1 = y - Math.cos(a) * len;
    const bend = range(r, -0.3, 0.3) * len;
    segs.push([x, y, (x + x1) / 2 + Math.cos(a) * bend, (y + y1) / 2 + Math.sin(a) * bend, x1, y1, wd]);
    if (lvl === 0) return;
    const k = chance(r, 0.3) ? 3 : 2;
    for (let i = 0; i < k; i++) {
      const turn = k === 2 ? (i ? 1 : -1) * range(r, 0.3, 0.55) : (i - 1) * range(r, 0.4, 0.6);
      const na = Math.max(-1.2, Math.min(1.2, a + turn + range(r, -0.1, 0.1)));
      grow(x1, y1, na, len * range(r, 0.66, 0.8), wd * 0.74, lvl - 1);
    }
  };
  grow(0, 0, range(r, -0.12, 0.12), H * 0.34, Math.max(1.8 * px, H * 0.1), H > 44 * px ? 3 : 2);
  return segs;
}

/** An anemone's tentacles, each its centre line from the disc to its curled tip. */
function anemoneTents(H: number, r: Rand, r2: Rand): number[][] {
  const tw = H * 0.38;
  const chh = H * 0.36;
  const n = int(r, 14, 20);
  const tents: number[][] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const bx = (u - 0.5) * tw * 0.95;
    const by = -chh;
    const a = (u - 0.5) * 2.4 + range(r, -0.15, 0.15);
    const len = H * range(r, 0.42, 0.6);
    const cx = bx + Math.sin(a) * len * 0.5;
    const cy = by - Math.cos(a) * len * 0.5;
    const a2 = a * 1.5 + range(r, -0.3, 0.3);
    const ex = cx + Math.sin(a2) * len * 0.5;
    const ey = cy - Math.cos(a2) * len * 0.5;
    const pts: number[] = [bx, by];
    quadPts(pts, bx, by, cx, cy, ex, ey, 10);
    // The last of it curls over, outward, the way a tentacle hangs in a current.
    let px0 = ex;
    let py0 = ey;
    let ca = a2;
    const curl = (a >= 0 ? 1 : -1) * range(r2, 0.25, 0.45);
    for (let k = 0; k < 4; k++) {
      ca += curl;
      px0 += Math.sin(ca) * len * 0.07;
      py0 -= Math.cos(ca) * len * 0.07;
      pts.push(px0, py0);
    }
    tents.push(pts);
  }
  return tents;
}

/**
 * A clump of tube sponges: two to four tubes grown up out of one crust,
 * each its own height and girth, leaning out from the clump and bending a
 * little as it goes, its wall swelling and narrowing unevenly (never in
 * steps, which read as a stack of rings) and opening at the top in a thick
 * rolled rim round its dark mouth. The ones behind first.
 */
function tubeCluster(H: number, r: Rand) {
  const n = int(r, 2, 4);
  const tall = int(r, 0, n - 1);
  const tubes = Array.from({ length: n }, (_, i) => {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5;
    const main = i === tall;
    const th = H * (main ? range(r, 0.85, 1) : range(r, 0.45, 0.8));
    // (Close at the foot, so the tubes are fused there into one clump.)
    const x0 = u * H * (0.08 + 0.05 * n) + range(r, -0.02, 0.02) * H;
    const lean = u * range(r, 0.25, 0.5) + range(r, -0.08, 0.08);
    const bend = range(r, -0.35, 0.35);
    const rad0 = H * range(r, 0.075, 0.105) * (main ? 1.12 : 1);
    const flare = range(r, 1.05, 1.35);
    const ph = [range(r, 0, 6.28), range(r, 0, 6.28), range(r, 0, 6.28), range(r, 0, 6.28)];
    const z = main ? 0.5 + range(r, 0, 0.3) : range(r, 0, 1);
    // The spine, stepped up from the foot, turning as it bends.
    const N = 16;
    const sp: number[] = [x0, 0];
    const ang: number[] = [lean];
    for (let k = 1; k <= N; k++) {
      const t = (k - 0.5) / N;
      const a = lean + bend * t * t;
      sp.push(sp[(k - 1) * 2] + (Math.sin(a) * th) / N, sp[(k - 1) * 2 + 1] - (Math.cos(a) * th) / N);
      ang.push(lean + bend * (k / N) * (k / N));
    }
    // Each side lumpy in its own way: a soft swelling and a pinch, never a pipe.
    const side = (t: number, s: number) =>
      rad0 * (1 + (flare - 1) * t * t) * (1 + 0.14 * Math.sin(t * 3.3 + ph[s]) + 0.06 * Math.sin(t * 7.9 + ph[s + 1])) * (1 + 0.35 * Math.pow(1 - t, 6));
    const rad = (t: number) => (side(t, 0) + side(t, 2)) / 2;
    const a: number[] = [];
    const bb: number[] = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const nx = Math.cos(ang[k]);
      const ny = Math.sin(ang[k]);
      // (Toward the rim, both sides meet the rim's own width.)
      const m = Math.pow(t, 6);
      const wl = side(t, 0) * (1 - m) + rad(1) * m;
      const wr = side(t, 2) * (1 - m) + rad(1) * m;
      a.push(sp[k * 2] - nx * wl, sp[k * 2 + 1] - ny * wl);
      bb.push(sp[k * 2] + nx * wr, sp[k * 2 + 1] + ny * wr);
    }
    // The rim: the mouth seen a little from above, across the tube's top.
    const top = { x: sp[N * 2], y: sp[N * 2 + 1], rx: rad(1) * 1.06, ry: rad(1) * 0.38, ang: ang[N] };
    const pts: number[] = [...a];
    // Over the back of the rim, from the left edge to the right.
    for (let k = 1; k < 12; k++) {
      const q = Math.PI + (Math.PI * k) / 12;
      const ex = Math.cos(q) * top.rx;
      const ey = Math.sin(q) * top.ry;
      pts.push(top.x + ex * Math.cos(top.ang) - ey * Math.sin(top.ang), top.y + ex * Math.sin(top.ang) + ey * Math.cos(top.ang));
    }
    for (let k = N; k >= 0; k--) pts.push(bb[k * 2], bb[k * 2 + 1]);
    const rim: number[] = [];
    for (let k = 0; k < 24; k++) {
      const q = (Math.PI * 2 * k) / 24;
      const ex = Math.cos(q) * top.rx;
      const ey = Math.sin(q) * top.ry;
      rim.push(top.x + ex * Math.cos(top.ang) - ey * Math.sin(top.ang), top.y + ex * Math.sin(top.ang) + ey * Math.cos(top.ang));
    }
    return { th, z, sp, ang, rad, a, b: bb, top, pts, rim };
  });
  tubes.sort((p, q) => p.z - q.z);
  // The crust they grow from, a low mound round their feet.
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of tubes) {
    lo = Math.min(lo, t.a[0], t.b[0]);
    hi = Math.max(hi, t.a[0], t.b[0]);
  }
  const crust: number[] = [];
  const cw = (hi - lo) / 2 + H * 0.03;
  const cx = (hi + lo) / 2;
  for (let k = 0; k <= 16; k++) {
    const q = Math.PI + (Math.PI * k) / 16;
    crust.push(cx + Math.cos(q) * cw, Math.sin(q) * H * 0.05);
  }
  return { tubes, crust };
}

/** Black coral's whips, each its line from the foot to the tip. */
function whipLines(H: number, r: Rand): number[][] {
  const n = int(r, 2, 4);
  const whips: number[][] = [];
  for (let i = 0; i < n; i++) {
    const lean = range(r, -0.35, 0.35);
    const len = H * range(r, 0.75, 1.05);
    const amp = H * range(r, 0.03, 0.07);
    const freq = range(r, 1.5, 2.5);
    const ph = range(r, 0, Math.PI * 2);
    const bx = range(r, -0.08, 0.08) * H;
    const pts: number[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const wave = Math.sin(t * freq * Math.PI * 2 + ph) * amp * t;
      pts.push(bx + Math.sin(lean) * len * t + Math.cos(lean) * wave, -Math.cos(lean) * len * t + Math.sin(lean) * wave);
    }
    whips.push(pts);
  }
  return whips;
}

/** A glass sponge's outline, and the size of its mouth. */
function glassShape(H: number, r: Rand) {
  const b = H * 0.06;
  const tw = H * range(r, 0.17, 0.22);
  const lean = range(r, -0.05, 0.05) * H;
  const pts: number[] = [-b, 0];
  cubicPts(pts, [-b, 0, -H * 0.2, -H * 0.35, -tw * 0.6 + lean, -H * 0.75, -tw + lean, -H], 14);
  arcPts(pts, lean, -H, tw, tw * 0.25, Math.PI, Math.PI * 2, 14);
  cubicPts(pts, [tw + lean, -H, tw * 0.6 + lean, -H * 0.75, H * 0.2, -H * 0.35, b, 0], 14);
  return { b, tw, lean, pts };
}

/**
 * Plate coral, a rosette of thin plates grown out of one place on the
 * rock, each a fan seen nearly edge-on: narrow where it is grown on,
 * flaring out to a wavy margin that curls down a little, the near edge
 * showing its thickness. The low plates lie out flat either side, the
 * higher ones stand up more steeply between them, all from the one root,
 * so there is no stalk anywhere (a shelf on a stalk reads as a cake stand)
 * and no plate stands off on its own. The steepest first.
 */
function plateWhorl(H: number, r: Rand) {
  const n = int(r, 3, 4);
  const s0 = chance(r, 0.5) ? 1 : -1;
  const root = { x: range(r, -0.04, 0.04) * H, y: -H * 0.07 };
  const plates = Array.from({ length: n }, (_, k) => {
    const side = k % 2 ? -s0 : s0;
    const up = k / (n - 1);
    const L = H * range(r, 0.5, 0.64) * (1 - 0.3 * up);
    const tilt = 0.12 + 0.6 * up + range(r, -0.08, 0.08);
    // (Each grown from a little across the middle, so the plates overlap at their root.)
    const bx = root.x - side * H * 0.035;
    const by = root.y - H * 0.06 * up;
    const w = range(r, 0.85, 1.1);
    const f = range(r, 0.24, 0.34);
    const droop = range(r, 0.05, 0.12) * (1 - 0.5 * up);
    const ph = [range(r, 0, 6.28), range(r, 0, 6.28)];
    const dx = side * Math.cos(tilt);
    const dy = -Math.sin(tilt);
    // Across the plate's spread: toward the viewer, and so down the page.
    const qx = side * Math.sin(tilt) * 0.5;
    const qy = Math.cos(tilt);
    const rim = (a: number) => L * (0.88 + 0.12 * Math.cos((a / w) * (Math.PI / 2))) * (1 + 0.035 * Math.sin(a * 7 + ph[0]) + 0.015 * Math.sin(a * 17 + ph[1]));
    /** A point of the plate, `rho` out along it at `a` across it. */
    const at = (rho: number, a: number): [number, number] => {
      const u = rho * Math.cos(a);
      const v = rho * Math.sin(a) * f * 2.2 + (rho * rho * droop) / L;
      return [bx + dx * u + qx * v, by + dy * u + qy * v];
    };
    // Narrow where it is grown on: the spread opens out over its first half.
    const spread = (rho: number) => w * (0.4 + 0.6 * Math.sqrt(Math.min(1, rho / (0.45 * L))));
    // (Few points: the pen smooths a curve through them.)
    const pts: number[] = [];
    const M = 6;
    for (let i = 0; i <= M; i++) {
      const rho = (L * 0.9 * i) / M;
      pts.push(...at(rho, -spread(rho)));
    }
    for (let i = 1; i < 24; i++) {
      const a = -w + (2 * w * i) / 24;
      pts.push(...at(rim(a), a));
    }
    for (let i = M; i >= 0; i--) {
      const rho = (L * 0.9 * i) / M;
      pts.push(...at(rho, spread(rho)));
    }
    return { L, w, rim, at, spread, pts, lip: H * 0.03, up };
  });
  return plates.sort((a, b) => b.up - a.up);
}

/**
 * A sea pen, as a plate draws Pennatula: a swollen foot rooted in the
 * ground, widest where it goes in; a fleshy stem bending a little in the
 * current; and up it the polyp leaves in two ranks, broad fleshy crescents
 * set close and overlapping, the longest a third of the way up, so the
 * whole is one feather with a scalloped edge.
 */
function seapenShape(H: number, r: Rand) {
  const lean = range(r, -0.15, 0.15) * H;
  const bow = range(r, -0.06, 0.06) * H;
  const sy = -0.15 * H;
  const at = (t: number): [number, number] => {
    const u = 1 - t;
    return [2 * u * t * (lean * 0.2 + bow) + t * t * lean, u * u * sy + 2 * u * t * (sy - 0.4 * H) + t * t * -H];
  };
  const m = int(r, 14, 18);
  const leaves: { x: number; y: number; side: number; pl: number; ang: number; pts: number[]; edge: number[] }[] = [];
  for (let i = 0; i < m; i++) {
    for (const side of [-1, 1]) {
      // The two ranks alternate up the stem.
      const t = 0.03 + (0.86 * (i + (side > 0 ? 0.5 : 0))) / m;
      const [x, y] = at(t);
      const [x2, y2] = at(Math.min(1, t + 0.02));
      const ta = Math.atan2(x2 - x, -(y2 - y));
      const pl = H * 0.15 * Math.pow(Math.sin(Math.PI * (0.08 + 0.86 * Math.pow(t, 0.75))), 0.8) * range(r, 0.9, 1.06);
      // Swept up from square to the stem by 35 to 45 degrees.
      const ang = ta + side * (Math.PI / 2 - range(r, 0.6, 0.78));
      const ex = x + Math.sin(ang) * pl;
      const ey = y - Math.cos(ang) * pl;
      const wd = Math.max(1, pl * 0.7);
      // Its outer (lower) edge full and bearing the polyps, its inner (upper) edge a shallow curve.
      const nx = -Math.cos(ang) * side;
      const ny = -Math.sin(ang) * side;
      const pts: number[] = [x, y - wd * 0.2];
      quadPts(pts, x, y - wd * 0.2, x + Math.sin(ang) * pl * 0.5 - nx * wd * 0.2, y - Math.cos(ang) * pl * 0.5 - ny * wd * 0.2, ex, ey, 8);
      const edge: number[] = [ex, ey];
      quadPts(edge, ex, ey, x + Math.sin(ang) * pl * 0.6 + nx * wd, y - Math.cos(ang) * pl * 0.6 + ny * wd, x, y + wd * 0.4, 10);
      pts.push(...edge.slice(2));
      leaves.push({ x, y, side, pl, ang, pts, edge });
    }
  }
  // The foot: the stem flaring a little as it goes into the ground, the swelling of it under the ground.
  const foot: number[] = [];
  const fw = H * 0.036;
  const stemW = H * 0.022;
  const prof = (t: number) => stemW + (fw - stemW) * (1 - t) * (1 - t);
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    foot.push(-prof(t), H * 0.03 + (sy - H * 0.03) * t);
  }
  for (let k = 10; k >= 0; k--) {
    const t = k / 10;
    foot.push(prof(t), H * 0.03 + (sy - H * 0.03) * t);
  }
  return { at, sy, leaves, foot, stemW };
}

/**
 * A stalked crinoid, a sea lily: a long jointed stalk with whorls of
 * hooked cirri at its nodes and a few roots at its foot, and at its top a
 * small cup with ten feathered arms rising from it as a lily's petals do,
 * in toward each other and then flaring out at their tips, the whole crown
 * nodding a little into the current. Taller than it is wide, and open at
 * the top: never a ball on a stick, nor a palm.
 */
function crinoidShape(H: number, r: Rand) {
  const c = chance(r, 0.5) ? 1 : -1;
  const Ls = H * range(r, 0.58, 0.66);
  const sx = c * range(r, -0.03, 0.08) * H;
  const bow = range(r, -0.06, 0.06) * H;
  const stalk: number[] = [0, 0];
  quadPts(stalk, 0, 0, sx * 0.3 + bow, -Ls * 0.5, sx, -Ls, 20);
  const tip = (k: number): [number, number, number] => {
    const i = Math.max(0, Math.min(stalk.length / 2 - 2, k));
    const x = stalk[i * 2];
    const y = stalk[i * 2 + 1];
    return [x, y, Math.atan2(stalk[i * 2 + 2] - x, -(stalk[i * 2 + 3] - y))];
  };
  // Whorls of cirri at nodes up the stalk: hooks out and down, curling.
  const cirri: number[][] = [];
  const nodes = int(r, 4, 6);
  for (let q = 0; q < nodes; q++) {
    const [x, y, a] = tip(Math.round(3 + (15 * q) / Math.max(1, nodes - 1)));
    const len = H * range(r, 0.06, 0.09) * (1 - 0.3 * (q / nodes));
    for (const side of [-1, 1, -1, 1]) {
      let h = a + side * range(r, 1.3, 2);
      let px0 = x;
      let py0 = y;
      const pts = [x, y];
      for (let k = 0; k < 6; k++) {
        px0 += (Math.sin(h) * len) / 6;
        py0 -= (Math.cos(h) * len) / 6;
        pts.push(px0, py0);
        h += side * 0.3;
      }
      cirri.push(pts);
    }
  }
  // Roots: a few short fingers spread along the ground.
  const roots: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const d = (k < 2 ? -1 : 1) * H * range(r, 0.05, 0.1);
    roots.push([0, -H * 0.01, d * 0.5, H * 0.005, d, H * range(r, 0.005, 0.02)]);
  }
  // The crown, nodding into the current.
  const [cx, cy, ca] = tip(stalk.length / 2 - 2);
  const axis = ca + c * range(r, 0.15, 0.4);
  const arms: number[][] = [];
  const nArm = 10;
  for (let i = 0; i < nArm; i++) {
    const u = i / (nArm - 1) - 0.5 + range(r, -0.04, 0.04);
    const La = H * range(r, 0.3, 0.42) * (1 - 0.25 * Math.abs(u));
    const open = range(r, 0.8, 1.15);
    // Most tips flare out; now and then one coils back in.
    const flare = range(r, 0.5, 1.3) * (chance(r, 0.25) ? -1.6 : 1);
    let x = cx + Math.sin(axis) * H * 0.025;
    let y = cy - Math.cos(axis) * H * 0.025;
    const pts = [x, y];
    const N = 16;
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N;
      // Out from the cup, in toward the middle, and out again at the tip.
      const h = axis + u * open * (2.2 - 1.3 * Math.sin(Math.PI * Math.min(1, t * 1.1))) + Math.sign(u || c) * flare * Math.max(0, t - 0.7) * 3;
      x += (Math.sin(h) * La) / N;
      y -= (Math.cos(h) * La) / N;
      pts.push(x, y);
    }
    arms.push(pts);
  }
  return { c, stalk, cirri, roots, arms, cup: { x: cx, y: cy, a: ca }, axis };
}

/**
 * A brittle star on the rock, seen low from the side: a small five-rayed
 * disc and five long arms snaking over the rock, banded with their plates
 * and bristling with fine spines; the far ones lying back over the rock,
 * the near ones hanging over its edge, and one or two raised and curling
 * into the water, as they feed. `H` is about how far its arms reach either side.
 */
function brittleShape(H: number, r: Rand) {
  const rd = H * 0.1;
  const disc = { x: 0, y: -rd * 0.5, rx: rd, ry: rd * 0.55 };
  const psi0 = range(r, 0, Math.PI * 2);
  const raised = int(r, 1, 2);
  const arms: { pts: number[]; back: boolean }[] = [];
  // The arms by how far back each lies: the furthest raised.
  const psis = Array.from({ length: 5 }, (_, k) => psi0 + (k * Math.PI * 2) / 5 + range(r, -0.2, 0.2));
  const backness = psis.map((p) => Math.sin(p));
  const rank = psis.map((_, i) => i).sort((a, b) => backness[b] - backness[a]);
  psis.forEach((psi, k) => {
    const La = H * range(r, 0.5, 0.62);
    const up = rank.indexOf(k) < raised;
    const amp = range(r, 0.7, 1.1) * (chance(r, 0.5) ? 1 : -1);
    const fr = range(r, 1.6, 2.6);
    const ph = range(r, 0, 6.28);
    let gx = Math.cos(psi) * rd * 0.9;
    let gz = Math.sin(psi) * rd * 0.9;
    let lift = 0;
    const rise = up ? range(r, 0.2, 0.32) : 0;
    const pts: number[] = [gx, disc.y - gz * 0.3];
    const N = 24;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      // Snaking: its heading swinging one way and the other down its length.
      const h = psi + amp * Math.sin(t * fr * Math.PI + ph) * (0.35 + 0.65 * t);
      const step = La / N;
      if (up) {
        // Raised: climbing off the rock, then the tip curled over.
        const climb = Math.sin(Math.PI * Math.min(1, t * 1.2)) * (t < 0.7 ? 1 : -1);
        lift += step * (rise / 0.3) * Math.max(-0.6, climb) * 0.9;
        gx += Math.cos(h) * step * 0.6;
        gz += Math.sin(h) * step * 0.6;
      } else {
        gx += Math.cos(h) * step;
        gz += Math.sin(h) * step;
      }
      // Near ones hang over the edge a little.
      const hang = !up && gz < 0 ? H * 0.08 * t * t : 0;
      pts.push(gx, disc.y - gz * 0.3 - lift + hang);
    }
    arms.push({ pts, back: Math.sin(psi) > 0 || up });
  });
  return { disc, arms, rd };
}

/** A growth's ink, in a few shared marks: a ribbon tapering from `w0` to `w1` along a line. */
function ribbon(pts: number[], w0: number, w1: number): number[] {
  const m = pts.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let j = 0; j < m; j++) {
    const a = Math.max(0, j - 1);
    const b = Math.min(m - 1, j + 1);
    const tx = pts[b * 2] - pts[a * 2];
    const ty = pts[b * 2 + 1] - pts[a * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    const hw = (w0 + (w1 - w0) * (j / Math.max(1, m - 1))) / 2;
    left.push(pts[j * 2] - (ty / tl) * hw, pts[j * 2 + 1] + (tx / tl) * hw);
    right.push(pts[j * 2] + (ty / tl) * hw, pts[j * 2 + 1] - (tx / tl) * hw);
  }
  for (let j = m - 1; j >= 0; j--) left.push(right[j * 2], right[j * 2 + 1]);
  return left;
}

/** The kinds that grow in the deep, below the light: what a long sitting's walls and floor gather. */
export const DEEP_GROWTHS: readonly GrowthKind[] = ['seapen', 'crinoid', 'brittlestar', 'glass', 'whip', 'anemone'];

/**
 * Where a growth's ink reaches about its base (the point `drawGrowth`
 * stands it on), in the same px as `g.size`: multiply by the px it is drawn
 * at. y is negative upward; a brittle star's near arms and a sea pen's foot
 * reach a little below its base (y1 > 0). The same dice as the drawing, so
 * it is its box and not a guess; a sea pen's glow in the dark is counted.
 */
export function growthExtent(g: Pick<Growth, 'kind' | 'size' | 'seed'>, zone = 2, dark = false): GrowthBox {
  const H = g.size;
  const r = mulberry32(g.seed);
  const r2 = mulberry32(g.seed ^ 0x6d2b79f5);
  const b: GrowthBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
  // The pen's own width, and its taper's overshoot.
  const pen = 1.2;
  switch (g.kind) {
    case 'branch':
      for (const [x, y, cx, cy, x1, y1, wd] of branchSegs(H, r, 1)) take(b, [x, y, cx, cy, x1, y1], wd / 2 + 0.9);
      break;
    case 'brain':
      // (The pen round its foot's corners overshoots them a little.)
      take(b, [-H * 0.93, -H * 0.57, H * 0.93, 0], pen);
      break;
    case 'fan': {
      const stem = H * range(r, 0.1, 0.15);
      const R = H - stem;
      const half = range(r, 1.1, 1.3);
      const lean = range(r, -0.12, 0.12);
      const pad = Math.max(1.2, H * 0.035) / 2 + 0.9;
      take(b, [0, 0, lean * stem, -stem], Math.max(1.4, H * 0.05) / 2 + pen);
      for (let i = 0; i <= 32; i++) {
        const a = lean - half + (2 * half * i) / 32;
        const rr = R * 0.99 * (1 - 0.12 * Math.abs((a - lean) / half) ** 3);
        take(b, [lean * stem + Math.sin(a) * rr, -stem - Math.cos(a) * rr], pad);
      }
      break;
    }
    case 'anemone': {
      const base = Math.max(1.4, H * 0.045);
      for (const t of anemoneTents(H, r, r2)) take(b, t, base / 2 + 0.4);
      take(b, [-H * 0.19, -H * 0.41, H * 0.19, 0], pen);
      break;
    }
    case 'tube': {
      const c = tubeCluster(H, r);
      for (const t of c.tubes) take(b, [...t.pts, ...t.rim], pen);
      take(b, c.crust, pen);
      take(b, [0, 0], 0);
      break;
    }
    case 'urchin': {
      const R = H * 0.2;
      take(b, [-R, -2 * R, R, 0], pen);
      const n = int(r, 26, 34);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + range(r, -0.08, 0.08);
        if (Math.sin(a) > 0.2) continue;
        const len = H * range(r, 0.3, 0.45);
        take(b, [Math.cos(a) * (R + len), -R + Math.sin(a) * (R + len)], 0.5);
      }
      break;
    }
    case 'plate':
      for (const p of plateWhorl(H, r)) take(b, [...p.pts, ...p.pts.map((v, i) => (i % 2 ? v + p.lip : v))], 2);
      take(b, [0, 0], 0);
      break;
    case 'whip':
      for (const w of whipLines(H, r)) take(b, w, 1.6 + 0.6);
      take(b, [-H * 0.07, -3, H * 0.07, 1], pen);
      break;
    case 'glass': {
      const s = glassShape(H, r);
      take(b, s.pts, pen);
      // Its roots, a tuft of spicules into the ground.
      take(b, [-H * 0.15, 0, H * 0.15, H * 0.035], 0.5);
      break;
    }
    case 'seapen': {
      const s = seapenShape(H, r);
      for (const l of s.leaves) take(b, l.pts, pen);
      take(b, s.foot, pen);
      take(b, s.foot.map((v, i) => (i % 2 ? Math.min(v, 0) : v)), pen);
      for (let k = 0; k <= 16; k++) take(b, s.at(k / 16), s.stemW + pen);
      if (dark && zone >= 2) for (const l of s.leaves) take(b, [l.edge[0], l.edge[1]], 4);
      break;
    }
    case 'crinoid': {
      const s = crinoidShape(H, r);
      take(b, s.stalk, Math.max(1.2, H * 0.024) / 2 + pen);
      for (const c of [...s.cirri, ...s.roots]) take(b, c, pen);
      // Each arm's pinnules stand out from it, a little more than a twentieth of the height.
      for (const a of s.arms) take(b, a, H * 0.05 + pen);
      break;
    }
    case 'brittlestar': {
      const s = brittleShape(H, r);
      const d = s.disc;
      take(b, [d.x - d.rx, d.y - d.ry, d.x + d.rx, d.y + d.ry], pen);
      for (const a of s.arms) take(b, a.pts, Math.max(1.2, H * 0.045) / 2 + H * 0.02 + pen);
      break;
    }
  }
  return b;
}

const DRAW: Record<Growth['kind'], Drawer> = {
  // Antler coral: forking three or four times, each branch a tube outlined
  // in ink, shaded down its far side and lifted down its near one, and
  // studded with polyp cups when drawn big.
  branch(ctx, H, ink, r, px, pen) {
    const segs = branchSegs(H, r, px);
    const stroke = (color: string, width: (wd: number) => number, off: number) => {
      ctx.strokeStyle = color;
      for (const [x, y, cx, cy, x1, y1, wd] of segs) {
        // Across the branch, toward its shadow side.
        const l = Math.hypot(x1 - x, y1 - y) || 1;
        let nx = -(y1 - y) / l;
        let ny = (x1 - x) / l;
        if (nx * LIGHT[0] + ny * LIGHT[1] < 0) {
          nx = -nx;
          ny = -ny;
        }
        const o = off * wd;
        ctx.lineWidth = width(wd);
        ctx.beginPath();
        ctx.moveTo(x + nx * o, y + ny * o);
        ctx.quadraticCurveTo(cx + nx * o, cy + ny * o, x1 + nx * o, y1 + ny * o);
        ctx.stroke();
      }
    };
    stroke(ink.ink, (wd) => wd + 0.9 * px, 0);
    stroke(ink.body, (wd) => wd, 0);
    // The far side in shadow, the near side catching the light.
    faint(ctx, 0.7, () => stroke(ink.deep, (wd) => wd * 0.38, 0.24));
    faint(ctx, 0.6, () => stroke(ink.lit, (wd) => wd * 0.2, -0.22));
    if (pen.d > 0.3) {
      // Polyps: small cups along every branch, set either side, the way
      // antler coral is pitted all over.
      const cups = new Path2D();
      for (const [x, y, cx, cy, x1, y1, wd] of segs) {
        const l = Math.hypot(x1 - x, y1 - y);
        const steps = Math.max(2, Math.floor(l / (2.6 * px)));
        for (let s = 1; s < steps; s++) {
          const t = (s + (pen.r2() - 0.5) * 0.5) / steps;
          const u = 1 - t;
          const px0 = u * u * x + 2 * u * t * cx + t * t * x1;
          const py0 = u * u * y + 2 * u * t * cy + t * t * y1;
          const tx = 2 * u * (cx - x) + 2 * t * (x1 - cx);
          const ty = 2 * u * (cy - y) + 2 * t * (y1 - cy);
          const tl = Math.hypot(tx, ty) || 1;
          const side = (s % 2 ? 1 : -1) * wd * (0.18 + 0.12 * pen.r2());
          const qx = px0 - (ty / tl) * side;
          const qy = py0 + (tx / tl) * side;
          const cr = Math.max(0.35 * px, wd * 0.11);
          cups.moveTo(qx + cr, qy);
          cups.arc(qx, qy, cr, 0, Math.PI * 2);
        }
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.55, () => ctx.stroke(cups));
    }
  },

  // Brain coral: a low dome washed in its colour and shaded on its far side,
  // its meandering grooves following the curve, each one a dark valley with a
  // lit ridge beside it, finer and more of them the bigger it is drawn.
  brain(ctx, H, ink, r, px, pen) {
    const rx = H * 0.8;
    const ry = H * 0.55;
    const pts: number[] = [];
    arcPts(pts, 0, 0, rx, ry, Math.PI, Math.PI * 2, 40);
    const dome = pathOf(pts);
    const box = { x: -rx, y: -ry, w: rx * 2, h: ry };
    wash(ctx, dome, box, ink.body, pen);
    shadeIn(ctx, dome, box, ink, pen, { angle: 1.2, bow: 0.9 });
    ctx.save();
    ctx.clip(dome);
    const rings: { rk: number; freq: number; ph: number }[] = [];
    for (let k = 1; k <= 5; k++) rings.push({ rk: k / 6, freq: int(r, 7, 12), ph: range(r, 0, Math.PI * 2) });
    if (pen.d > 0.3) {
      for (let k = 0; k < 5; k++) rings.push({ rk: (k + 1.5) / 6, freq: int(pen.r2, 9, 15), ph: range(pen.r2, 0, Math.PI * 2) });
    }
    const groove = (rk: number, freq: number, ph: number, dx: number, dy: number) => {
      for (let s = 0; s <= 48; s++) {
        const t = Math.PI + (Math.PI * s) / 48;
        const rad = rk + 0.06 * Math.sin(t * freq + ph) + 0.03 * Math.sin(t * freq * 2.3 + ph * 1.7);
        const x = Math.cos(t) * rx * rad + dx;
        const y = Math.sin(t) * ry * rad + dy;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };
    if (pen.d > 0.3) {
      // The ridges, lifted toward the light beside each valley.
      ctx.beginPath();
      for (const g of rings) groove(g.rk, g.freq, g.ph, -0.7 * px, -0.7 * px);
      ctx.strokeStyle = ink.lit;
      ctx.lineWidth = 0.7 * px;
      faint(ctx, 0.7, () => ctx.stroke());
    }
    ctx.beginPath();
    for (const g of rings) groove(g.rk, g.freq, g.ph, 0, 0);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.55 : 0.8) * px;
    faint(ctx, 0.6, () => ctx.stroke());
    ctx.restore();
    outline(ctx, pts, true, ink, pen);
  },

  // Sea fan: a gorgonian, grown in one plane across the current, so it is
  // wider than it is tall. A short stout stem opens into ribs that run out
  // from it like a hand fan's, forking as they spread so they stay about as
  // close together all the way out, joined to their neighbours by fine
  // cross-links into a net. No wash behind it: the colour is in the
  // branches, and the water shows through the mesh.
  fan(ctx, H, ink, r, px, pen) {
    const stem = H * range(r, 0.1, 0.15);
    const R = H - stem;
    const half = range(r, 1.1, 1.3);
    const lean = range(r, -0.12, 0.12);
    const big = pen.d > 0.3;
    const sx = lean * stem;
    const sy = -stem;
    // The rim of the fan, a little scalloped.
    const ph = [range(r, 0, 6.28), range(r, 0, 6.28)];
    const rim = (a: number) => R * (0.94 + 0.05 * Math.sin(a * 5 + ph[0]) + 0.03 * Math.sin(a * 11 + ph[1])) * (1 - 0.12 * Math.abs(a / half) ** 3);
    const gapPx = Math.max(2.4 * px, H * (big ? 0.055 : 0.09));
    const rings = big ? 9 : 6;
    type Rib = { a: number; x: number; y: number; wd: number };
    let ribs: Rib[] = [];
    const n0 = int(r, 3, 5);
    for (let i = 0; i < n0; i++) ribs.push({ a: lean + (i / (n0 - 1) - 0.5) * 2 * half * 0.55, x: sx, y: sy, wd: Math.max(1.2 * px, H * 0.035) });
    const segs: number[][] = [];
    const net = new Path2D();
    for (let k = 1; k <= rings; k++) {
      const rad = (R * k) / rings;
      const next: Rib[] = [];
      ribs.forEach((rb, i) => {
        // Its share of the fan, out to the neighbours either side.
        const left = i > 0 ? (ribs[i - 1].a + rb.a) / 2 : rb.a - (half - Math.abs(rb.a - lean)) * 0.5;
        const right = i < ribs.length - 1 ? (ribs[i + 1].a + rb.a) / 2 : rb.a + (half - Math.abs(rb.a - lean)) * 0.5;
        const share = (right - left) * rad;
        const kids = share > gapPx * 2.1 && k < rings ? [rb.a - (right - left) * 0.22, rb.a + (right - left) * 0.22] : [rb.a];
        for (const a0 of kids) {
          const a = Math.max(lean - half, Math.min(lean + half, a0 + range(r, -0.04, 0.04)));
          const reach = Math.min(rad, rim(a - lean));
          const x = sx + Math.sin(a) * reach;
          const y = sy - Math.cos(a) * reach;
          if (Math.hypot(x - rb.x, y - rb.y) < 0.5 * px) continue;
          segs.push([rb.x, rb.y, (rb.x + x) / 2 + range(r, -0.3, 0.3) * gapPx * 0.3, (rb.y + y) / 2, x, y, rb.wd]);
          next.push({ a, x, y, wd: Math.max(0.35 * px, rb.wd * (kids.length > 1 ? 0.72 : 0.86)) });
        }
      });
      next.sort((p, q) => p.a - q.a);
      // Cross-links between neighbours at this ring, the mesh.
      if (k > 1 && k < rings + 1) {
        for (let i = 0; i < next.length - 1; i++) {
          if (r() < (big ? 0.25 : 0.55)) continue;
          const p = next[i];
          const q = next[i + 1];
          const back = range(r, 0.2, 0.7);
          const ax = p.x + (sx - p.x) * back * (1 / rings);
          const ay = p.y + (sy - p.y) * back * (1 / rings);
          const bx = q.x + (sx - q.x) * (back + range(r, -0.15, 0.15)) * (1 / rings);
          const by = q.y + (sy - q.y) * (back + range(r, -0.15, 0.15)) * (1 / rings);
          net.moveTo(ax, ay);
          net.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - gapPx * 0.12, bx, by);
        }
      }
      ribs = next;
    }
    const segPath = (sg: number[]) => {
      const p = new Path2D();
      p.moveTo(sg[0], sg[1]);
      p.quadraticCurveTo(sg[2], sg[3], sg[4], sg[5]);
      return p;
    };
    const trunk = [0, 0, sx * 0.5, sy * 0.55, sx, sy];
    // Colour first, the net and the branches, then the pen over them.
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = (big ? 1.2 : 1) * px;
    faint(ctx, 0.85, () => ctx.stroke(net));
    for (const sg of segs) {
      ctx.lineWidth = sg[6] + 0.9 * px;
      ctx.stroke(segPath(sg));
    }
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.35 * px;
    faint(ctx, 0.75, () => ctx.stroke(net));
    for (const sg of segs) {
      ctx.lineWidth = Math.max(0.35 * px, sg[6] * 0.4);
      faint(ctx, 0.85, () => ctx.stroke(segPath(sg)));
    }
    outline(ctx, trunk, false, ink, pen, Math.max(1.4, (H * 0.05) / px), [0, 0.3]);
  },

  // Anemone: a short column, its disc crowned with curving tentacles, each
  // tapering from the disc to a fine point that curls over at its end.
  anemone(ctx, H, ink, r, px, pen) {
    const cw = H * 0.3;
    const tw = H * 0.38;
    const chh = H * 0.36;
    const tents = anemoneTents(H, r, pen.r2);
    // Each tentacle a ribbon, full at the disc and fine at the tip.
    const base = Math.max(1.4 * px, H * 0.045);
    const tentPath = new Path2D();
    const tips: [number, number][] = [];
    for (const pts of tents) {
      const m = pts.length / 2;
      const left: number[] = [];
      const right: number[] = [];
      for (let j = 0; j < m; j++) {
        const a0 = Math.max(0, j - 1);
        const a1 = Math.min(m - 1, j + 1);
        const tx = pts[a1 * 2] - pts[a0 * 2];
        const ty = pts[a1 * 2 + 1] - pts[a0 * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        const hw = Math.max(0.12 * px, (base / 2) * (1 - 0.94 * (j / (m - 1))) ** 1.2);
        left.push(pts[j * 2] - (ty / tl) * hw, pts[j * 2 + 1] + (tx / tl) * hw);
        right.push(pts[j * 2] + (ty / tl) * hw, pts[j * 2 + 1] - (tx / tl) * hw);
      }
      tentPath.moveTo(left[0], left[1]);
      for (let j = 2; j < left.length; j += 2) tentPath.lineTo(left[j], left[j + 1]);
      for (let j = right.length - 2; j >= 0; j -= 2) tentPath.lineTo(right[j], right[j + 1]);
      tentPath.closePath();
      tips.push([pts[pts.length - 2], pts[pts.length - 1]]);
    }
    ctx.fillStyle = ink.body;
    ctx.fill(tentPath);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.5 : 0.7) * px;
    ctx.stroke(tentPath);
    if (pen.d > 0.3) {
      // A shadow down the far side of each.
      ctx.save();
      ctx.clip(tentPath);
      ctx.translate(base * 0.35, base * 0.2);
      ctx.strokeStyle = ink.deep;
      ctx.lineWidth = base * 0.35;
      faint(ctx, 0.6, () => {
        ctx.beginPath();
        for (const pts of tents) {
          ctx.moveTo(pts[0], pts[1]);
          for (let j = 2; j < pts.length - 4; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
        }
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.fillStyle = ink.body;
    // The column, washed and shaded, striped down its length.
    const col: number[] = [-cw / 2, 0];
    quadPts(col, -cw / 2, 0, -cw * 0.42, -chh * 0.6, -tw / 2, -chh, 10);
    arcPts(col, 0, -chh, tw / 2, H * 0.05, Math.PI, 0, 16);
    quadPts(col, tw / 2, -chh, cw * 0.42, -chh * 0.6, cw / 2, 0, 10);
    const colPath = pathOf(col);
    const box = boxOf(col);
    wash(ctx, colPath, box, ink.body, pen);
    shadeIn(ctx, colPath, box, ink, pen, { angle: Math.PI / 2 - 0.15, bow: 0, from: 0.55 });
    ctx.beginPath();
    const stripes = pen.d > 0.3 ? [-0.36, -0.22, -0.08, 0.08, 0.22, 0.36] : [-0.22, 0, 0.22];
    for (const f of stripes) {
      ctx.moveTo(f * cw, -2 * px);
      ctx.lineTo(f * tw, -chh + 3 * px);
    }
    ctx.lineWidth = 0.5 * px;
    faint(ctx, 0.4, () => ctx.stroke());
    outline(ctx, col, true, ink, pen, 0.85);
  },

  // Tube sponges (`tubeCluster`): the crust, then each tube from the back,
  // washed graded across its round, its shadow side worked in lines that
  // run up the tube with it (never round it), pitted with pores, and its
  // mouth a dark hollow inside a thick rolled rim. In the reef's colours,
  // never grey.
  tube(ctx, H, ink, r, px, pen) {
    const { tubes, crust } = tubeCluster(H, r);
    const cp = pathOf(crust);
    wash(ctx, cp, boxOf(crust), ink.deep, pen, 0.9);
    if (pen.d > 0.3) outline(ctx, crust, false, ink, pen, 0.7, [0.2, 0.2]);
    for (const t of tubes) {
      const body = pathOf(t.pts);
      const box = boxOf(t.pts);
      // The ones behind a little in shadow.
      const tone = t.z < 0.35 ? mixHex(ink.body, ink.deep, 0.35) : ink.body;
      if (pen.d > 0.45) {
        const a = ctx.globalAlpha;
        ctx.globalAlpha = 1;
        tubeWash(ctx, body, [{ a: t.a, b: t.b }], box, {
          stops: [
            [0, pen.dark ? mixHex(tone, ink.lit, 0.5) : mixHex(tone, '#FBF8EF', 0.45)],
            [0.4, tone],
            [1, ink.deep],
          ],
          alpha: a,
        });
        ctx.globalAlpha = a;
      } else wash(ctx, body, box, tone, pen);
      if (pen.d > 0.5) {
        // Lines up the tube on its shadow side (its lit side, on dark water).
        const shade = shadeAcross(box, pen.light);
        contourHatch(ctx, body, [{ a: t.a, b: t.b }], {
          spacing: 1.5 * px,
          shade,
          reach: 0.42,
          width: 0.55 * px,
          k: 0.75,
          color: ink.ink,
          alpha: pen.dark ? 0.45 : 0.6,
          light: pen.light,
          seed: pen.seed ^ 0x2c1,
        });
      }
      if (pen.d > 0.3) {
        // Pores: small dark openings scattered over the near face, each with a lit lower lip.
        const pores = new Path2D();
        const lips = new Path2D();
        const count = Math.round(2 + 10 * (pen.d - 0.2) * (t.th / H));
        for (let k = 0; k < count; k++) {
          const tt = 0.14 + 0.7 * pen.r2();
          const v = (pen.r2() - 0.5) * 1.3;
          const i = Math.round(tt * 16);
          const nx = Math.cos(t.ang[i]);
          const ny = Math.sin(t.ang[i]);
          const w = t.rad(tt);
          const prx = Math.max(0.35 * px, w * (0.12 + 0.08 * pen.r2())) * (1 - Math.abs(v) * 0.5);
          const qx = t.sp[i * 2] + nx * v * w * 0.85;
          const qy = t.sp[i * 2 + 1] + ny * v * w * 0.85;
          pores.moveTo(qx + prx, qy);
          pores.ellipse(qx, qy, prx * (1 - Math.abs(v) * 0.4), prx * 0.75, t.ang[i], 0, Math.PI * 2);
          lips.moveTo(qx + prx, qy + 0.3 * px);
          lips.ellipse(qx, qy + 0.3 * px, prx, prx * 0.7, t.ang[i], 0.2, Math.PI - 0.2);
        }
        ctx.fillStyle = ink.hollow;
        faint(ctx, 0.6, () => ctx.fill(pores));
        ctx.strokeStyle = ink.lit;
        ctx.lineWidth = 0.4 * px;
        faint(ctx, 0.7, () => ctx.stroke(lips));
      }
      outline(ctx, t.pts, true, ink, pen, 0.9);
      // The mouth: a dark hollow inside the rim's thickness, its far inside wall catching the light.
      const { x, y, rx, ry, ang } = t.top;
      const mouth = new Path2D();
      mouth.ellipse(x, y, rx * 0.72, ry * 0.62, ang, 0, Math.PI * 2);
      const lip = new Path2D();
      lip.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
      ctx.fillStyle = pen.dark ? mixHex(tone, ink.lit, 0.3) : mixHex(tone, '#FBF8EF', 0.3);
      ctx.fill(lip);
      ctx.fillStyle = ink.hollow;
      faint(ctx, 0.85, () => ctx.fill(mouth));
      const wall = new Path2D();
      wall.ellipse(x, y, rx * 0.72, ry * 0.62, ang, Math.PI, Math.PI * 2);
      wall.ellipse(x, y + ry * 0.3, rx * 0.62, ry * 0.36, ang, Math.PI * 2, Math.PI, true);
      ctx.fillStyle = ink.deep;
      faint(ctx, 0.55, () => ctx.fill(wall));
      ctx.strokeStyle = ink.ink;
      if (pen.d > 0.45) outline(ctx, t.rim, true, ink, pen, 0.75);
      else {
        // (Small, the rim is one plain line: the pen's pressure would not show.)
        ctx.lineWidth = 0.7 * px;
        ctx.stroke(lip);
      }
      ctx.lineWidth = 0.45 * px;
      faint(ctx, 0.7, () => ctx.stroke(mouth));
    }
    ctx.fillStyle = ink.body;
  },

  // Urchin: a round test bristling with fine tapering spines, none into the
  // rock, its tubercles in rows when drawn big.
  urchin(ctx, H, ink, r, px, pen) {
    const R = H * 0.2;
    const cy = -R;
    const spines = new Path2D();
    const n = int(r, 26, 34);
    const sw = 0.32 * px;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + range(r, -0.08, 0.08);
      if (Math.sin(a) > 0.2) continue;
      const len = H * range(r, 0.3, 0.45);
      const c = Math.cos(a);
      const s = Math.sin(a);
      // A long thin wedge: wide at the test, a point at the tip.
      spines.moveTo(c * R * 0.8 - s * sw, cy + s * R * 0.8 + c * sw);
      spines.lineTo(c * (R + len), cy + s * (R + len));
      spines.lineTo(c * R * 0.8 + s * sw, cy + s * R * 0.8 - c * sw);
      spines.closePath();
    }
    ctx.fillStyle = mixHex(ink.ink, ink.body, 0.25);
    faint(ctx, 0.85, () => ctx.fill(spines));
    const test: number[] = [];
    arcPts(test, 0, cy, R, R, 0, Math.PI * 2, 32);
    const testPath = pathOf(test);
    const box = { x: -R, y: cy - R, w: R * 2, h: R * 2 };
    wash(ctx, testPath, box, ink.body, pen);
    shadeIn(ctx, testPath, box, ink, pen, { dots: true, spacing: 1.3, from: 0.45 });
    outline(ctx, test, true, ink, pen, 0.9);
    ctx.fillStyle = ink.ink;
    faint(ctx, 0.5, () => {
      for (let i = 0; i < 9; i++) {
        const a = range(r, 0, Math.PI * 2);
        const d = R * range(r, 0.2, 0.7);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, (pen.d > 0.3 ? 0.5 : 0.8) * px, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pen.d > 0.3) {
        // The tubercles, in rows from crown to rim like a globe's meridians.
        const dots = new Path2D();
        for (let m = 0; m < 10; m++) {
          const lon = -1.35 + (2.7 * m) / 9;
          for (let k = 1; k < 7; k++) {
            const lat = -1.3 + (2.6 * k) / 7;
            const x = Math.sin(lon) * Math.cos(lat) * R * 0.92;
            const y = cy + Math.sin(lat) * R * 0.92;
            const dr = 0.35 * px * (0.6 + 0.4 * Math.cos(lon) * Math.cos(lat));
            dots.moveTo(x + dr, y);
            dots.arc(x, y, dr, 0, Math.PI * 2);
          }
        }
        ctx.fill(dots);
      }
    });
    ctx.fillStyle = ink.body;
  },

  // Plate coral: a whorl of thin plates in tiers (`plateWhorl`), the top
  // one first, so each lower one lies over where the one above is grown
  // on. Each is its underside in shadow slid out from under it by its
  // thickness, then its top washed and shaded, ringed with its growth
  // following the wavy margin and ribbed from where it is grown on.
  plate(ctx, H, ink, r, px, pen) {
    const plates = plateWhorl(H, r);
    const n = plates.length;
    plates.forEach((p, k) => {
      const under = p.pts.map((v, i) => (i % 2 ? v + p.lip : v));
      const underPath = pathOf(under);
      ctx.fillStyle = ink.deep;
      ctx.fill(underPath);
      const front = k >= n - 2;
      if (front && pen.d > 0.4 && !pen.dark) {
        hatch(ctx, underPath, boxOf(under), { spacing: 1.7 * px, angle: 1.3, shade: () => 0.8, from: 0.5, color: ink.ink, width: 0.4 * px, alpha: 0.5, seed: pen.seed + k });
      }
      // (Its underside mostly under its top: a plain line serves.)
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 0.75 * px;
      ctx.stroke(underPath);
      const top = pathOf(p.pts);
      const tb = boxOf(p.pts);
      // (Washed and ringed, no hatch on its face: its ribs are its shading.
      // The ones behind, mostly hidden, take the colour flat.)
      if (front) wash(ctx, top, tb, ink.body, pen);
      else {
        ctx.fillStyle = ink.body;
        ctx.fill(top);
      }
      ctx.save();
      ctx.clip(top);
      const ringPath = new Path2D();
      const rings = pen.d > 0.3 ? [0.42, 0.66, 0.86] : [0.5, 0.82];
      for (const q of rings) {
        for (let i = 0; i <= 24; i++) {
          const a0 = -p.w + (2 * p.w * i) / 24;
          const rho = q * p.rim(a0);
          const [x, y] = p.at(rho, a0 * Math.min(1, p.spread(rho) / p.w));
          if (i) ringPath.lineTo(x, y);
          else ringPath.moveTo(x, y);
        }
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = (pen.d > 0.3 ? 0.4 : 0.55) * px;
      faint(ctx, pen.dark ? 0.3 : 0.45, () => ctx.stroke(ringPath));
      if (pen.d > 0.4) {
        // Fine ribs from where it is grown on out to the margin.
        const ribs = new Path2D();
        for (let a = -p.w * 0.92; a <= p.w * 0.92; a += 0.11 + 0.05 * Math.sin(a * 13 + k)) {
          const [x0, y0] = p.at(p.L * 0.15, a * (p.spread(p.L * 0.15) / p.w));
          const [x1, y1] = p.at(p.rim(a) * 0.97, a);
          ribs.moveTo(x0, y0);
          ribs.lineTo(x1, y1);
        }
        ctx.lineWidth = 0.3 * px;
        faint(ctx, pen.dark ? 0.18 : 0.28, () => ctx.stroke(ribs));
      }
      ctx.restore();
      if (front) outline(ctx, p.pts, true, ink, pen, 0.85);
      else {
        ctx.strokeStyle = ink.ink;
        ctx.lineWidth = 0.75 * px;
        ctx.stroke(top);
      }
    });
    ctx.fillStyle = ink.body;
  },

  // Black coral: a few long whips, waving gently, each a pen line that
  // tapers to its tip over a thin wash, set with polyps when drawn big.
  whip(ctx, H, ink, r, px, pen) {
    const whips = whipLines(H, r);
    const p = new Path2D();
    for (const pts of whips) {
      p.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) p.lineTo(pts[k], pts[k + 1]);
    }
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = 2.2 * px;
    faint(ctx, 0.6, () => ctx.stroke(p));
    for (const pts of whips) outline(ctx, pts, false, ink, pen, 1, [0, 0.45]);
    if (pen.d > 0.3) {
      const polyps = new Path2D();
      for (const pts of whips) {
        for (let k = 3; k < 23; k += 2) {
          const x = pts[k * 2];
          const y = pts[k * 2 + 1];
          const tx = pts[k * 2 + 2] - pts[k * 2 - 2];
          const ty = pts[k * 2 + 3] - pts[k * 2 - 1];
          const tl = Math.hypot(tx, ty) || 1;
          const side = k % 4 === 1 ? 1 : -1;
          const ex = x - (ty / tl) * side * 1.6 * px;
          const ey = y + (tx / tl) * side * 1.6 * px;
          polyps.moveTo(x, y);
          polyps.lineTo(ex, ey);
          polyps.moveTo(ex + 0.45 * px, ey);
          polyps.arc(ex, ey, 0.45 * px, 0, Math.PI * 2);
        }
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.6, () => ctx.stroke(polyps));
    }
    ctx.beginPath();
    ctx.ellipse(0, -1 * px, H * 0.07, 2 * px, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink.body;
    ctx.fill();
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
  },

  // Glass sponge: a tall pale vase of crossed lattice, barely there,
  // Venus's flower basket: its lattice woven in rings when drawn big, a
  // few oblique ridges winding up it, and its tuft of rooting spicules.
  glass(ctx, H, ink, r, px, pen) {
    const { b, tw, lean, pts } = glassShape(H, r);
    const vase = pathOf(pts);
    // The roots first, fine and pale, fanning down into the ground.
    const roots = new Path2D();
    for (let i = 0; i < 7; i++) {
      const u = i / 6 - 0.5;
      roots.moveTo(u * b, -H * 0.02);
      roots.quadraticCurveTo(u * H * 0.12, -H * 0.005, u * H * 0.27 + range(pen.r2, -0.01, 0.01) * H, H * range(pen.r2, 0.005, 0.03));
    }
    ctx.lineWidth = 0.4 * px;
    faint(ctx, 0.5, () => ctx.stroke(roots));
    // Pale glass, not a hole in the water: an ivory wash, let go toward the
    // paper on its lit side and turned on its far side by a few lines.
    const vb = boxOf(pts);
    wash(ctx, vase, vb, ink.body, pen, pen.dark ? 0.35 : 0.62);
    shadeIn(ctx, vase, vb, ink, pen, { angle: Math.PI / 2 - 0.1, bow: 0, from: 0.6, cross: null, k: 0.4 });
    ctx.save();
    ctx.clip(vase);
    ctx.beginPath();
    const step = Math.max((pen.d > 0.3 ? 2.2 : 3) * px, H * (pen.d > 0.3 ? 0.045 : 0.07));
    for (let c = -1.3 * H; c <= 0.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c + H, -H);
    }
    for (let c = -0.3 * H; c <= 1.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c - H, -H);
    }
    if (pen.d > 0.3) {
      // And the horizontal rings of the lattice, the way a Venus's flower basket is woven.
      for (let y = -step; y > -H; y -= step * 1.4) {
        ctx.moveTo(-H, y);
        ctx.lineTo(H, y);
      }
    }
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.35 : 0.5) * px;
    faint(ctx, 0.4, () => ctx.stroke());
    if (pen.d > 0.3) {
      // Its ridges, winding up it.
      const ridges = new Path2D();
      const ph = range(pen.r2, 0, 1);
      for (let k = 0; k < 3; k++) {
        const y0 = -H * (0.3 + 0.22 * (k + ph));
        ridges.moveTo(-H * 0.3, y0 + H * 0.05);
        ridges.quadraticCurveTo(lean * 0.5, y0 - H * 0.02, H * 0.3, y0 - H * 0.12);
      }
      ctx.lineWidth = 0.6 * px;
      faint(ctx, 0.45, () => ctx.stroke(ridges));
    }
    ctx.restore();
    faint(ctx, 0.85, () => outline(ctx, pts, true, ink, pen, 0.8));
    ctx.beginPath();
    ctx.ellipse(lean, -H, tw * 0.85, tw * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink.hollow;
    faint(ctx, 0.45, () => ctx.fill());
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.7 * px;
    faint(ctx, 0.8, () => ctx.stroke());
    ctx.fillStyle = ink.body;
  },

  // Sea pen (`seapenShape`): the swollen foot washed and shaded, the stem
  // up through the leaves, and the leaves in two ranks, each crescent
  // washed and edged in the pen with its vein, its outer edge dotted with
  // polyps when drawn big; in the dark a few of its polyps glow.
  seapen(ctx, H, ink, r, px, pen) {
    const s = seapenShape(H, r);
    // (The foot is small: flat colour and a plain line.)
    const footPath = pathOf(s.foot);
    ctx.fillStyle = mixHex(ink.body, ink.deep, 0.25);
    ctx.fill(footPath);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.7 * px;
    ctx.stroke(footPath);
    const line: number[] = [];
    for (let k = 0; k <= 20; k++) line.push(...s.at(k / 20));
    const stem = ribbon(line, s.stemW * 2, s.stemW * 0.6);
    ctx.fillStyle = mixHex(ink.body, ink.deep, 0.3);
    ctx.fill(pathOf(stem));
    // The leaves from the top down, so each lies over the barb above it.
    const leaves = s.leaves.slice().sort((a, b) => a.y - b.y);
    const veins = new Path2D();
    const dots = new Path2D();
    // A rank at a time, each laid as one path, top leaf first (later
    // leaves of a path lie over earlier ones where they overlap).
    const shaded = mixHex(ink.body, ink.deep, 0.35);
    for (const side of [-1, 1]) {
      const rank = new Path2D();
      for (const l of leaves) if (l.side === side) rank.addPath(pathOf(l.pts));
      ctx.fillStyle = side > 0 === pen.dark ? ink.body : shaded;
      ctx.fill(rank);
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = (pen.d > 0.3 ? 0.45 : 0.55) * px;
      ctx.stroke(rank);
    }
    for (const l of leaves) {
      veins.moveTo(l.x, l.y);
      veins.lineTo(l.x + Math.sin(l.ang) * l.pl * 0.85, l.y - Math.cos(l.ang) * l.pl * 0.85);
      if (pen.d > 0.3) {
        for (let i = 2; i < l.edge.length - 4; i += 4) {
          dots.moveTo(l.edge[i] + 0.4 * px, l.edge[i + 1]);
          dots.arc(l.edge[i], l.edge[i + 1], 0.4 * px, 0, Math.PI * 2);
        }
      }
    }
    if (pen.d > 0.3) {
      ctx.lineWidth = 0.3 * px;
      faint(ctx, 0.45, () => ctx.stroke(veins));
      ctx.fillStyle = ink.ink;
      faint(ctx, 0.55, () => ctx.fill(dots));
    }
    // The stem's line over the leaves' roots, fading out toward the tip.
    outline(ctx, line, false, ink, pen, 1, [0, 0.5]);
    ctx.fillStyle = ink.body;
    if (!ink.glow) return;
    // A soft light at a few of the polyps: small, and no brighter than the snow.
    const a = ctx.globalAlpha;
    // (One leaf in five: more, and the pen reads as a string of lamps.)
    for (let i = 2; i < s.leaves.length; i += 5) {
      const x = s.leaves[i].edge[0];
      const y = s.leaves[i].edge[1];
      const rad = 4 * px;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, ink.glow);
      g.addColorStop(1, `${ink.glow}00`);
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = ink.glow;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 * px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = ink.body;
  },

  // Stalked crinoid (`crinoidShape`): roots and stalk in the pen, the stalk
  // washed and ringed with its joints, its cirri fine hooks; the cup, and
  // the arms fanned into the current, each a tapering line feathered with
  // pinnules either side, the far arms first.
  crinoid(ctx, H, ink, r, px, pen) {
    const s = crinoidShape(H, r);
    for (const rt of s.roots) outline(ctx, rt, false, ink, pen, 0.7, [0, 0.6]);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.4 : 0.55) * px;
    const hooks = new Path2D();
    for (const c of s.cirri) {
      hooks.moveTo(c[0], c[1]);
      for (let i = 2; i < c.length; i += 2) hooks.lineTo(c[i], c[i + 1]);
    }
    faint(ctx, 0.8, () => ctx.stroke(hooks));
    const w0 = Math.max(1.2 * px, H * 0.026);
    const w1 = Math.max(0.9 * px, H * 0.016);
    const stalk = ribbon(s.stalk, w0, w1);
    const sp = pathOf(stalk);
    const sb = boxOf(stalk);
    wash(ctx, sp, sb, ink.body, pen);
    if (pen.d > 0.3) {
      // The joints of the stalk, ring on ring.
      const rings = new Path2D();
      const m = s.stalk.length / 2;
      let acc = 0;
      const step = Math.max(1.5 * px, H * 0.016);
      for (let i = 1; i < m - 1; i++) {
        const x = s.stalk[i * 2];
        const y = s.stalk[i * 2 + 1];
        const tx = s.stalk[i * 2 + 2] - s.stalk[i * 2 - 2];
        const ty = s.stalk[i * 2 + 3] - s.stalk[i * 2 - 1];
        const tl = Math.hypot(tx, ty) || 1;
        acc += tl / 2;
        for (; acc > step; acc -= step) {
          const hw = (w0 + (w1 - w0) * (i / m)) / 2;
          rings.moveTo(x - (ty / tl) * hw, y + (tx / tl) * hw);
          rings.lineTo(x + (ty / tl) * hw, y - (tx / tl) * hw);
        }
      }
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.55, () => ctx.stroke(rings));
    }
    outline(ctx, stalk, true, ink, pen, 0.75);
    // The cup the arms rise from.
    const { x, y, a } = s.cup;
    const cw = H * 0.035;
    const ch = H * 0.045;
    const cup: number[] = [];
    const P = (u: number, v: number) => cup.push(x + Math.cos(a) * u + Math.sin(a) * v, y + Math.sin(a) * u - Math.cos(a) * v);
    P(-cw * 0.45, 0);
    P(-cw, ch * 0.7);
    P(-cw * 0.7, ch);
    P(cw * 0.7, ch);
    P(cw, ch * 0.7);
    P(cw * 0.45, 0);
    // The arms: the ones bent furthest back behind.
    const order = s.arms.map((_, i) => i).sort((p, q) => Math.abs(q - 4.5) - Math.abs(p - 4.5));
    const fringe = new Path2D();
    const under = new Path2D();
    for (const i of order) {
      const arm = s.arms[i];
      const m = arm.length / 2;
      for (let k = 1; k < m - 1; k++) {
        const t = k / (m - 1);
        const ax = arm[k * 2];
        const ay = arm[k * 2 + 1];
        const hx = arm[k * 2 + 2] - arm[k * 2 - 2];
        const hy = arm[k * 2 + 3] - arm[k * 2 - 1];
        const h = Math.atan2(hx, -hy);
        const len = H * 0.045 * (1 - 0.55 * t);
        for (const side of [-1, 1]) {
          const pa = h + side * 0.6;
          const ex = ax + Math.sin(pa) * len;
          const ey = ay - Math.cos(pa) * len;
          fringe.moveTo(ax, ay);
          fringe.quadraticCurveTo(ax + Math.sin(h + side * 0.9) * len * 0.5, ay - Math.cos(h + side * 0.9) * len * 0.5, ex, ey);
          under.moveTo(ax, ay);
          under.lineTo(ex, ey);
        }
      }
    }
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = Math.max(1 * px, H * 0.012);
    faint(ctx, 0.6, () => ctx.stroke(under));
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.32 : 0.45) * px;
    faint(ctx, 0.7, () => ctx.stroke(fringe));
    for (const i of order) {
      const rib = ribbon(s.arms[i], Math.max(1 * px, H * 0.02), Math.max(0.4 * px, H * 0.005));
      ctx.fillStyle = ink.body;
      ctx.fill(pathOf(rib));
      outline(ctx, s.arms[i], false, ink, pen, 0.75, [0, 0.4]);
    }
    const cupPath = pathOf(cup);
    const cb = boxOf(cup);
    wash(ctx, cupPath, cb, ink.body, pen);
    shadeIn(ctx, cupPath, cb, ink, pen, { angle: 0.4, cross: null, from: 0.4 });
    outline(ctx, cup, true, ink, pen, 0.8);
    ctx.fillStyle = ink.body;
  },

  // Brittle star (`brittleShape`): the far arms, then the disc washed and
  // stippled with its five radial shields, then the near arms; each arm a
  // ribbon tapering to a thread, banded with its plates and set with
  // spines either side when drawn big.
  brittlestar(ctx, H, ink, r, px, pen) {
    const s = brittleShape(H, r);
    const w0 = Math.max(1.2 * px, H * 0.045);
    const arm = (pts: number[]) => {
      const rib = ribbon(pts, w0, Math.max(0.35 * px, w0 * 0.12));
      const path = pathOf(rib);
      const b = boxOf(rib);
      wash(ctx, path, b, ink.body, pen);
      shadeIn(ctx, path, b, ink, pen, { dots: true, spacing: 1.4, from: 0.5, k: 0.45 });
      const bands = new Path2D();
      const spines = new Path2D();
      const m = pts.length / 2;
      for (let k = 1; k < m - 1; k++) {
        const x = pts[k * 2];
        const y = pts[k * 2 + 1];
        const tx = pts[k * 2 + 2] - pts[k * 2 - 2];
        const ty = pts[k * 2 + 3] - pts[k * 2 - 1];
        const tl = Math.hypot(tx, ty) || 1;
        const hw = (w0 + (w0 * 0.12 - w0) * (k / (m - 1))) / 2;
        const nx = -ty / tl;
        const ny = tx / tl;
        bands.moveTo(x - nx * hw, y - ny * hw);
        bands.lineTo(x + nx * hw, y + ny * hw);
        if (pen.d > 0.3) {
          const sl = hw + H * 0.02 * (1 - 0.6 * (k / m));
          for (const sd of [-1, 1]) {
            spines.moveTo(x + sd * nx * hw, y + sd * ny * hw);
            spines.lineTo(x + sd * nx * sl + (tx / tl) * sl * 0.35, y + sd * ny * sl + (ty / tl) * sl * 0.35);
          }
        }
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.5, () => ctx.stroke(bands));
      faint(ctx, 0.65, () => ctx.stroke(spines));
      outline(ctx, rib, true, ink, pen, 0.7);
    };
    for (const a of s.arms) if (a.back) arm(a.pts);
    const d = s.disc;
    const disc: number[] = [];
    arcPts(disc, d.x, d.y, d.rx, d.ry, 0, Math.PI * 2, 28);
    const dp = pathOf(disc);
    const db = boxOf(disc);
    wash(ctx, dp, db, ink.body, pen);
    shadeIn(ctx, dp, db, ink, pen, { dots: true, spacing: 1.2, from: 0.4 });
    ctx.beginPath();
    for (const a of s.arms) {
      const ex = a.pts[0];
      const ey = a.pts[1];
      ctx.moveTo(d.x + (ex - d.x) * 0.25, d.y + (ey - d.y) * 0.25);
      ctx.lineTo(d.x + (ex - d.x) * 0.8, d.y + (ey - d.y) * 0.8);
    }
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.4 * px;
    faint(ctx, 0.5, () => ctx.stroke());
    outline(ctx, disc, true, ink, pen, 0.8);
    for (const a of s.arms) if (!a.back) arm(a.pts);
    ctx.fillStyle = ink.body;
  },
};

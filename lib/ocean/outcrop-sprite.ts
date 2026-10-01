/**
 * Outcrops, inked (see `outcrop.ts`).
 *
 * A rock and everything on it is drawn once, to a canvas of its own, and
 * after that only placed: coral doesn't move, so there is nothing to
 * redraw, and a frame pays one image copy per rock (two where it crosses
 * what is written on the page). Each is drawn for the side of the page it
 * comes from, so the light stays on its top left whichever wall it leaves.
 *
 * The rock is drawn as an engraver draws one: a heap of boulders, each its
 * own rounded form with a broken top, shaded in contour lines that curve
 * with it and close up into its shadow, a stipple gathering where it turns
 * away, a strip of bare paper along its lit top, and the clefts between
 * them dark. Its foot runs back into the wall and the wash lets go of it,
 * so it hangs off the page edge rather than floating.
 *
 * The growths are drawn as a natural-history plate would draw them: a wash
 * of colour under a line of ink. Colour goes with the light, as it does in
 * real water, which takes the reds first: full pastels on the sunlit reef,
 * dulled in the twilight, and in the dark only pale ghosts.
 */

import { mixHex } from '../fan';
import { zoneMid } from './depth';
import type { EelPatch, Growth, Outcrop, outcropsInView } from './outcrop';
import { HUES, IRON_GALL, waterAt, type Water } from './palette';
import { detailFor, grain, hatch, inkLine, LIGHT, mottle, shadeAcross, stipple, washFill } from './pen';
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
}

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
 * The rock a seed makes, `span` device px out from its wall and about
 * `thick` deep. It stands between half and a little more than its width
 * tall, a foot that runs back into the wall and two to four boulders out
 * from it to the lip, the ones by the wall highest; the top is their tops,
 * so it rises and dips over them and the clefts between, and the lip
 * boulder's underside curves back in under it. Made once a size.
 */
export function rockShape(seed: number, span: number, thick: number, px: number): RockShape {
  const key = `${seed}|${span}|${thick}|${px}`;
  const hit = shapes.get(key);
  if (hit) return hit;
  const r = mulberry32(seed ^ 0x51ab0c);
  const S = Math.max(8 * px, span);
  const Hr = Math.max(0.5 * S, Math.min(1.2 * S, thick));
  const boulders: Boulder[] = [];
  const add = (cx: number, top: number, rx: number, ry: number) => {
    // Lumps at a few scales, coarse to fine, so the top breaks into knuckles.
    const n: number[] = [];
    const ks = [2, 3, 5, 7, 11, 17];
    const amps = [0.09, 0.07, 0.045, 0.028, 0.016, 0.009];
    for (let i = 0; i < ks.length; i++) n.push(amps[i] * range(r, 0.5, 1.35), ks[i], range(r, 0, Math.PI * 2));
    const cy = top + ry;
    const pts: number[] = [];
    for (let i = 0; i < BN; i++) {
      const th = (i / BN) * Math.PI * 2;
      const rr = lumpsOf(n, th);
      pts.push(cx + rx * rr * Math.cos(th), cy + ry * rr * Math.sin(th));
    }
    const full = new Float32Array(LUT);
    const coarse = new Float32Array(LUT);
    for (let i = 0; i < LUT; i++) {
      const th = (i / LUT) * Math.PI * 2;
      full[i] = lumpsOf(n, th);
      coarse[i] = lumpsOf(n, th, 3);
    }
    boulders.push({ cx, cy, rx, ry, n, pts, full, coarse });
  };
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
  const made: RockShape = { span: S, height: Hr, boulders, lo, hi, minY, top };
  shapes.set(key, made);
  if (shapes.size > 24) shapes.delete(shapes.keys().next().value as string);
  return made;
}

// ---------------------------------------------------------------------------
// The rock, inked

/** How a rock is coloured and how much drawing it carries. */
export interface RockStyle {
  /** The wash. */
  rock: string;
  /** The pen. */
  line: string;
  /** What the lit top is lifted toward: the bare paper, or on dark water a glint. */
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
}

/** Where a rock goes in the context: its wall at `x0`, running `dir` across, its nominal top at `y0`. */
export interface RockPlace {
  x0: number;
  y0: number;
  dir: 1 | -1;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * A rock in pen and wash, into a context of its own (its foot is let go of
 * by erasing, so draw it on a layer and lay that down): each boulder washed
 * from a lifted top left to a deeper bottom right, the cleft behind it
 * darkened, a strip of bare paper along its lit top, contour lines that
 * follow its form and close up into the shadow (crossed only where it is
 * darkest), a stipple gathering into the shadow, a crack or two, and its
 * outline in one pressure line that swells in the shadow and breaks in the
 * light. On dark water the light ink marks where the light falls instead.
 * Shared by the outcrops and the kelp's ledge.
 */
export function inkRock(ctx: CanvasRenderingContext2D, shape: RockShape, at: RockPlace, k: RockStyle): void {
  const { px, d, dark } = k;
  const r = mulberry32(k.seed);
  const X = (u: number) => at.x0 + at.dir * u;
  const Y = (y: number) => at.y0 + y;
  const fine = d > 0.35;
  const deep = mixHex(k.rock, dark ? '#000000' : '#2A2320', dark ? 0.45 : 0.32);
  const lift = mixHex(k.rock, k.paper, dark ? 0.22 : 0.42);
  const union = new Path2D();
  const [lx, ly] = LIGHT;
  // Toward the light, for a rounded form: from the top left and a little in front.
  const LV = [-0.55, -0.7, 0.36].map((v) => v / Math.hypot(0.55, 0.7, 0.36));
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
      ctx.strokeStyle = deep;
      ctx.globalAlpha = dark ? 0.7 : 0.55;
      ctx.lineWidth = Math.max(2 * px, 0.16 * Math.min(b.rx, b.ry));
      ctx.stroke(path);
      ctx.restore();
    }
    union.addPath(path);
    // The wash, lifted where the light lands and deeper where it doesn't.
    const g = ctx.createRadialGradient(
      cx - at.dir * 0.4 * b.rx,
      cy - 0.5 * b.ry,
      0,
      cx - at.dir * 0.4 * b.rx,
      cy - 0.5 * b.ry,
      Math.max(b.rx, b.ry) * 1.9,
    );
    const tint = mixHex(k.rock, bi % 2 ? deep : lift, 0.08 + 0.06 * r());
    g.addColorStop(0, mixHex(tint, lift, 0.6));
    g.addColorStop(0.45, tint);
    g.addColorStop(1, mixHex(tint, deep, 0.7));
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fill(path);
    // Where the pigment ran to the edge and dried there: a darker line along
    // it, half under the pen (no clip: it costs more than the line).
    ctx.strokeStyle = deep;
    ctx.globalAlpha = dark ? 0.3 : 0.35;
    ctx.lineWidth = Math.max(2 * px, 0.04 * Math.min(b.rx, b.ry));
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    // A strip of bare paper along its lit top, where the brush never went;
    // not where its top runs in under a boulder already down.
    const covered = (x: number, y: number) =>
      shape.boulders.some((e, j) => {
        if (j >= bi) return false;
        const ex = (at.dir * (x - X(e.cx))) / e.rx;
        const ey = (y - Y(e.cy)) / e.ry;
        const th = Math.atan2(ey, ex);
        return Math.hypot(ex, ey) < 0.985 * lumps(e, th < 0 ? th + Math.PI * 2 : th);
      });
    const strip = new Path2D();
    let on = false;
    for (let i = 0; i <= BN; i++) {
      const th = ((i % BN) / BN) * Math.PI * 2;
      const lit = shadeAt(th, 1) < 0.22 && Math.sin(th) < 0.35;
      const rr = lumps(b, th) * 0.86;
      const x = cx + at.dir * b.rx * rr * Math.cos(th);
      const y = cy + b.ry * rr * Math.sin(th);
      if (!lit || bi === shape.boulders.length - 1 || covered(x, y)) {
        on = false;
        continue;
      }
      if (on) strip.lineTo(x, y);
      else strip.moveTo(x, y);
      on = true;
    }
    const sw = Math.min(b.rx, b.ry);
    ctx.strokeStyle = k.paper;
    for (const [wd, a] of [
      [0.2, 0.16],
      [0.13, 0.2],
      [0.07, 0.26],
    ]) {
      ctx.globalAlpha = a * (dark ? 0.6 : 1);
      ctx.lineWidth = wd * sw;
      ctx.stroke(strip);
    }
    // Contour hatching, the way an engraver models a round thing: lines
    // that run across the boulder as if wrapped round it, seen a little from
    // above, so they bow as the form does and crowd together where it turns
    // away. Laid only where it is in shadow (in the light, on dark water),
    // each line thickening into the dark; crossed by a second set that runs
    // down the form only where it is darkest.
    // Finer drawn big, where there is the time; a little more open live.
    const sp = (px >= 3 ? 2.4 : fine ? 2.9 : 3.4) * px;
    const from = dark ? 0.6 : 0.3;
    const wmax = (fine ? 1.05 : 0.85) * px;
    // Each line is stroked in pieces by its weight, a few weights to a
    // boulder, which draws far quicker than a ribbon for every line.
    const weights = [0.3, 0.55, 0.8, 1.05].map((f) => f * wmax);
    const lines = weights.map(() => new Path2D());
    const ribbon = (run: number[]) => {
      const m = run.length / 3;
      if (m < 2) return;
      let cur = -1;
      for (let j = 0; j < m; j++) {
        // Each line runs out thin at both ends.
        const wd = run[j * 3 + 2] * Math.min(1, (j + 0.5) / 3, (m - j - 0.5) / 3);
        let k = 0;
        while (k < weights.length - 1 && wd > (weights[k] + weights[k + 1]) / 2) k++;
        if (k !== cur) {
          if (j > 0) lines[k].moveTo(run[j * 3 - 3], run[j * 3 - 2]);
          else lines[k].moveTo(run[0], run[1]);
          cur = k;
        }
        if (j > 0) lines[k].lineTo(run[j * 3], run[j * 3 + 1]);
      }
    };
    // A point on the boulder's surface at latitude (sin sl) and longitude ph
    // round its front, to the page, with its shade; null round the back.
    const tilt = 0.42;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    // Asked for its shade first, which is cheap, and only then where it falls.
    const onForm = (sl: number, cp: number, sp0: number, need: number): [number, number, number] | null => {
      const cl = Math.sqrt(Math.max(0, 1 - sl * sl));
      const x = cl * cp;
      const z0 = cl * sp0;
      const y = sl * ct + z0 * st;
      const z = z0 * ct - sl * st;
      if (z <= 0.02) return null;
      const sh = shadeN(at.dir * x, y, z);
      if ((dark ? 1 - sh : sh) <= need) return [0, 0, sh];
      const s = Math.min(1, Math.hypot(x, y));
      const th = Math.atan2(y, x);
      const rr = lumps(b, th < 0 ? th + Math.PI * 2 : th, s);
      return [cx + at.dir * b.rx * x * rr, cy + b.ry * y * rr, sh];
    };
    const nLat = Math.max(3, Math.round((2 * b.ry) / sp));
    const Q = px >= 3 ? 64 : 40;
    const cosQ = new Float32Array(Q + 1);
    const sinQ = new Float32Array(Q + 1);
    for (let q = 0; q <= Q; q++) {
      cosQ[q] = Math.cos((q / Q) * Math.PI);
      sinQ[q] = Math.sin((q / Q) * Math.PI);
    }
    for (let i = 0; i < nLat; i++) {
      const sl = -1 + (2 * (i + 0.5 + (r() - 0.5) * 0.35)) / nLat;
      const g1 = r() * 6.28;
      const g2 = r() * 6.28;
      let run: number[] = [];
      for (let q = 0; q <= Q; q++) {
        const p = onForm(sl, cosQ[q], sinQ[q], from);
        const want = p ? (dark ? 1 - p[2] : p[2]) : 0;
        // The engraver's line lifts now and then.
        const gap = Math.sin(g1 + q * 0.31) * Math.sin(g2 + q * 0.83);
        if (!p || want <= from || gap > 0.75) {
          ribbon(run);
          run = [];
          continue;
        }
        run.push(p[0], p[1], wmax * Math.min(1.25, 0.15 + ((want - from) / (1 - from)) * 1.2));
      }
      ribbon(run);
    }
    if (fine && !dark) {
      // Down the form, in the deepest shadow only.
      const deepFrom = 0.74;
      const nLon = Math.max(3, Math.round((Math.PI * b.rx) / (sp * 1.5)));
      for (let i = 0; i < nLon; i++) {
        const ph = (Math.PI * (i + 0.5 + (r() - 0.5) * 0.4)) / nLon;
        const cp = Math.cos(ph);
        const sp0 = Math.sin(ph);
        let run: number[] = [];
        for (let q = 0; q <= 30; q++) {
          const sl = -1 + (2 * q) / 30;
          const p = onForm(sl, cp, sp0, deepFrom);
          const want = p ? p[2] : 0;
          if (!p || want <= deepFrom) {
            ribbon(run);
            run = [];
            continue;
          }
          run.push(p[0], p[1], wmax * 0.8 * Math.min(1, (want - deepFrom) / 0.12));
        }
        ribbon(run);
      }
    }
    ctx.strokeStyle = k.line;
    ctx.globalAlpha = dark ? 0.5 : 0.85;
    // Butt-ended and bevelled: at a line this fine nothing else shows, and
    // a round join at every point is most of the cost of drawing it.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'bevel';
    lines.forEach((l, i) => {
      ctx.lineWidth = weights[i];
      ctx.stroke(l);
    });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A stipple gathering into the shadow: round dots drawn big, specks of
    // a device pixel or two (which read the same, and draw far quicker) small.
    if (fine) {
      const dots = new Path2D();
      const step = (px >= 3 ? 2.4 : 3.1) * px;
      const rad = (px >= 3 ? 0.42 : 0.48) * px;
      const round = px >= 3;
      const dFrom = dark ? 0.55 : 0.42;
      for (let y = box.y; y < box.y + box.h; y += step) {
        for (let x = box.x; x < box.x + box.w; x += step) {
          const qx = x + (r() - 0.5) * step * 0.9;
          const qy = y + (r() - 0.5) * step * 0.9;
          // Drawn without a clip, which costs more than the dots: kept a
          // little inside the boulder's own round instead.
          const ex = (qx - cx) / b.rx;
          const ey = (qy - cy) / b.ry;
          if (ex * ex + ey * ey > 0.8) {
            r();
            continue;
          }
          const sh0 = shadeXY(qx, qy);
          const sh = dark ? 1 - sh0 : sh0;
          if (sh <= dFrom || r() > Math.pow((sh - dFrom) / (1 - dFrom), 1.4)) continue;
          const rr = rad * (0.7 + 0.6 * r());
          if (round) {
            dots.moveTo(qx + rr, qy);
            dots.arc(qx, qy, rr, 0, Math.PI * 2);
          } else dots.rect(qx - rr, qy - rr, rr * 2, rr * 2);
        }
      }
      ctx.fillStyle = k.line;
      ctx.globalAlpha = dark ? 0.4 : 0.55;
      ctx.fill(dots);
    }
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
    const pen = (run: number[], cleft: boolean, closed: boolean) =>
      inkLine(ctx, run, closed, {
        width: (cleft ? 0.75 : fine ? 1.15 : 1) * px,
        color: k.line,
        alpha: (dark ? 0.8 : 0.9) * (cleft ? 0.75 : 1),
        plate: true,
        seed: k.seed ^ (bi * 31 + run.length),
        light: dark ? UNLIGHT : LIGHT,
        min: 0.25 * px,
      });
    if (!flags.some(Boolean)) pen(pts, false, true);
    else {
      // Runs round the ring, starting where one begins so none is cut at the seam.
      const s0 = flags.findIndex((f, i) => f !== flags[(i - 1 + m) % m]);
      let run: number[] = [];
      let kind = flags[s0];
      for (let q = 0; q <= m; q++) {
        const i = (s0 + q) % m;
        if (q === m || flags[i] !== kind) {
          run.push(pts[i * 2], pts[i * 2 + 1]);
          if (run.length >= 6) pen(run, kind, false);
          run = [];
          kind = flags[i];
        }
        run.push(pts[i * 2], pts[i * 2 + 1]);
      }
    }
  });
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
  if (k.barnacles && d > 0.3 && r() < 0.7) {
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
  // The foot let go of: the wash running dry down toward the wall.
  const [fa, fb] = k.fade ?? [0.62, 1.04];
  const fy0 = Y(shape.height * fa);
  const fy1 = Y(shape.height * fb);
  const fade = ctx.createLinearGradient(0, fy0, 0, fy1);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.6, 'rgba(0,0,0,0.75)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1;
  ctx.fillStyle = fade;
  ctx.fillRect(Math.min(X(shape.lo), X(shape.hi)) - 4 * px, fy0, Math.abs(X(shape.hi) - X(shape.lo)) + 8 * px, ctx.canvas.height);
  ctx.restore();
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
  const shape = rockShape(hash32(o.id, 'rock'), span, o.thick * h, px);
  const tallest = Math.max(0, ...o.growths.map((g) => g.size)) * px;
  // Room out past the lip for what grows there, a fan being wider than tall.
  const padIn = Math.max(24 * px, tallest * 0.95);
  const padT = Math.ceil(tallest * 1.15 + 16 * px - Math.min(0, shape.minY));
  const uLo = -2 * px;
  const cw = Math.min(4096, Math.ceil(Math.max(shape.hi, span) - uLo + padIn));
  const ch = Math.min(4096, Math.ceil(padT + shape.height * 1.08 + 8 * px));
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
  const shape = rockShape(hash32(o.id, 'rock'), span, o.thick * h, px);
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

const DRAW: Record<Growth['kind'], Drawer> = {
  // Antler coral: forking three or four times, each branch a tube outlined
  // in ink, shaded down its far side and lifted down its near one, and
  // studded with polyp cups when drawn big.
  branch(ctx, H, ink, r, px, pen) {
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
      const curl = (a >= 0 ? 1 : -1) * range(pen.r2, 0.25, 0.45);
      for (let k = 0; k < 4; k++) {
        ca += curl;
        px0 += Math.sin(ca) * len * 0.07;
        py0 -= Math.cos(ca) * len * 0.07;
        pts.push(px0, py0);
      }
      tents.push(pts);
    }
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

  // Vase sponges: one to three irregular vases, narrow at the foot and
  // swelling to a thick rolled lip, each a little lopsided, dark in the
  // mouth, shaded in lines that wrap round the form on its shadow side and
  // pitted with pores when drawn big. In the reef's colours, never grey.
  tube(ctx, H, ink, r, px, pen) {
    const n = int(r, 1, 3);
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
    for (const i of order) {
      const main = i === Math.floor(n / 2);
      const x0 = (i - (n - 1) / 2) * H * 0.26 + range(r, -0.03, 0.03) * H;
      const th = H * (main ? range(r, 0.8, 1) : range(r, 0.5, 0.75));
      const foot = H * range(r, 0.05, 0.08);
      const belly = H * range(r, 0.15, 0.22) * (main ? 1 : 0.85);
      const lip = belly * range(r, 0.9, 1.1);
      const lean = range(r, -0.12, 0.12) + (i - (n - 1) / 2) * 0.1;
      // Two sides of their own, lumpy, so it is never a turned pot.
      const wob = [range(r, 0, 6.28), range(r, 0, 6.28), range(r, 0, 6.28), range(r, 0, 6.28)];
      const half = (t: number, side: number) => {
        const shape = foot + (belly - foot) * Math.pow(Math.sin(Math.min(1, t / 0.75) * (Math.PI / 2)), 1.3) + (lip - belly) * Math.max(0, (t - 0.75) / 0.25);
        const k = side < 0 ? 0 : 2;
        return shape * (1 + 0.13 * Math.sin(t * 6 + wob[k]) + 0.06 * Math.sin(t * 15 + wob[k + 1]));
      };
      const ry = lip * 0.3;
      const spine = (t: number): [number, number] => [x0 + Math.sin(lean) * th * t + Math.sin(t * 3 + wob[0]) * H * 0.015, -th * t];
      const pts: number[] = [];
      const N = 18;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const [sx, sy] = spine(t);
        pts.push(sx - half(t, -1), sy);
      }
      const [tx, ty] = spine(1);
      // Over the back of the lip, then down the other side.
      for (let k = 1; k < 12; k++) {
        const a = Math.PI + (Math.PI * k) / 12;
        pts.push(tx + Math.cos(a) * (half(1, -1) + half(1, 1)) * 0.5 + (half(1, 1) - half(1, -1)) * 0.5, ty + Math.sin(a) * ry);
      }
      for (let k = N; k >= 0; k--) {
        const t = k / N;
        const [sx, sy] = spine(t);
        pts.push(sx + half(t, 1), sy);
      }
      const body = pathOf(pts);
      const box = boxOf(pts);
      wash(ctx, body, box, ink.body, pen);
      // Lines round the form, bowed as a ring is seen from a little above,
      // only on its shadow side and heavier into it.
      ctx.save();
      ctx.clip(body);
      const rings = new Path2D();
      const rows = Math.max(3, Math.round(th / ((pen.d > 0.3 ? 3 : 4) * px)));
      for (let q = 1; q < rows; q++) {
        const t = q / rows;
        const [sx, sy] = spine(t);
        const hl = half(t, -1);
        const hr = half(t, 1);
        const rr = ((hl + hr) / 2) * 0.38;
        // Each ring starts and stops somewhere of its own.
        const stop = 0.5 + 0.12 * Math.sin(q * 2.3 + wob[1]);
        let on = false;
        for (let k = 0; k <= 20; k++) {
          const ph = (Math.PI * k) / 20;
          const c = Math.cos(ph);
          // Facing: the right of the front, away from the light, is the shade.
          const sh = 0.45 + 0.45 * c + 0.12 * (1 - Math.sin(ph));
          const want = pen.dark ? 1 - sh : sh;
          const x = sx + (c >= 0 ? c * hr : c * hl);
          const y = sy + Math.sin(ph) * rr;
          if (want < stop) {
            on = false;
            continue;
          }
          if (on) rings.lineTo(x, y);
          else rings.moveTo(x, y);
          on = true;
        }
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = (pen.d > 0.3 ? 0.45 : 0.55) * px;
      faint(ctx, pen.dark ? 0.35 : 0.55, () => ctx.stroke(rings));
      ctx.restore();
      if (pen.d > 0.3) {
        // Pores: small dark openings over the near face, each with a lit lower lip.
        const pores = new Path2D();
        const lips = new Path2D();
        const count = Math.round(6 + 14 * pen.d * (th / H));
        for (let k = 0; k < count; k++) {
          const t = 0.12 + 0.72 * pen.r2();
          const u = (pen.r2() - 0.5) * 1.3;
          const [sx, sy] = spine(t);
          const hw = u < 0 ? half(t, -1) : half(t, 1);
          const prx = (0.5 + pen.r2() * 0.6) * px * (1 - Math.abs(u) * 0.6);
          const qx = sx + u * hw * 0.85;
          const qy = sy;
          pores.moveTo(qx + prx, qy);
          pores.ellipse(qx, qy, prx, prx * 0.7, 0, 0, Math.PI * 2);
          lips.moveTo(qx + prx, qy + 0.3 * px);
          lips.ellipse(qx, qy + 0.3 * px, prx, prx * 0.7, 0, 0.2, Math.PI - 0.2);
        }
        ctx.fillStyle = ink.hollow;
        faint(ctx, 0.55, () => ctx.fill(pores));
        ctx.strokeStyle = ink.lit;
        ctx.lineWidth = 0.4 * px;
        faint(ctx, 0.7, () => ctx.stroke(lips));
      }
      // The mouth: a rolled lip round a dark hollow, the far inside wall catching the light.
      const lx = tx + (half(1, 1) - half(1, -1)) * 0.5;
      const lw = (half(1, -1) + half(1, 1)) * 0.5;
      const mouth = new Path2D();
      mouth.ellipse(lx, ty + ry * 0.12, lw * 0.8, ry * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.hollow;
      faint(ctx, 0.85, () => ctx.fill(mouth));
      const wall = new Path2D();
      wall.ellipse(lx, ty + ry * 0.12, lw * 0.8, ry * 0.62, 0, Math.PI, Math.PI * 2);
      wall.ellipse(lx, ty + ry * 0.5, lw * 0.7, ry * 0.4, 0, Math.PI * 2, Math.PI, true);
      ctx.fillStyle = ink.deep;
      faint(ctx, 0.6, () => ctx.fill(wall));
      ctx.fillStyle = ink.body;
      outline(ctx, pts, true, ink, pen, 0.9);
      const rim: number[] = [];
      arcPts(rim, lx, ty + ry * 0.12, lw * 0.8, ry * 0.62, 0, Math.PI * 2, 24);
      outline(ctx, rim, true, ink, pen, 0.6);
    }
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

  // Plate coral: shelves stacked up a short stalk, each ringed with its
  // growth, the underside of each in shadow.
  plate(ctx, H, ink, r, px, pen) {
    const n = int(r, 2, 3);
    const shelves = Array.from({ length: n }, (_, k) => {
      const rx = H * range(r, 0.45, 0.62) * (1 - 0.15 * k);
      return { x: (k % 2 ? -1 : 1) * range(r, 0.05, 0.2) * H, y: -H * (0.25 + 0.28 * k), rx, ry: rx * 0.2 };
    });
    const stalk: number[] = [0, 0];
    for (const s of shelves) stalk.push(s.x * 0.3, s.y);
    outline(ctx, stalk, false, ink, pen, 1.1, [0, 0.2]);
    // Top shelf first, so the lower ones lie over its stalk.
    for (let k = n - 1; k >= 0; k--) {
      const s = shelves[k];
      const lip = H * 0.045;
      const under: number[] = [];
      arcPts(under, s.x, s.y + lip, s.rx, s.ry, 0, Math.PI * 2, 36);
      const underPath = pathOf(under);
      const ubox = boxOf(under);
      ctx.fillStyle = ink.deep;
      ctx.fill(underPath);
      if (pen.d > 0.4 && !pen.dark) {
        hatch(ctx, underPath, ubox, {
          spacing: 1.7 * px,
          angle: 1.3,
          shade: () => 0.8,
          from: 0.5,
          color: ink.ink,
          width: 0.4 * px,
          alpha: 0.5,
          seed: pen.seed + k,
        });
      }
      outline(ctx, under, true, ink, pen, 0.8);
      const topPts: number[] = [];
      arcPts(topPts, s.x, s.y, s.rx, s.ry, 0, Math.PI * 2, 36);
      const top = pathOf(topPts);
      wash(ctx, top, boxOf(topPts), ink.body, pen);
      ctx.save();
      ctx.clip(top);
      ctx.beginPath();
      const rings = pen.d > 0.3 ? [0.3, 0.5, 0.66, 0.8, 0.91] : [0.35, 0.6, 0.82];
      for (const f of rings) {
        ctx.moveTo(s.x * 0.3 + s.rx * f + (s.x - s.x * 0.3) * f, s.y);
        ctx.ellipse(s.x * 0.3 + (s.x - s.x * 0.3) * f, s.y, s.rx * f, s.ry * f, 0, 0, Math.PI * 2);
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = (pen.d > 0.3 ? 0.45 : 0.6) * px;
      faint(ctx, pen.dark ? 0.25 : 0.4, () => ctx.stroke());
      if (pen.d > 0.4) {
        // Fine radial ridges from the centre to the rim.
        ctx.beginPath();
        const cx0 = s.x * 0.3 + (s.x - s.x * 0.3) * 0.15;
        for (let a = 0.1; a < Math.PI * 2; a += 0.28 + 0.1 * Math.sin(a * 5)) {
          ctx.moveTo(cx0 + Math.cos(a) * s.rx * 0.18, s.y + Math.sin(a) * s.ry * 0.18);
          ctx.lineTo(s.x + Math.cos(a) * s.rx * 0.97, s.y + Math.sin(a) * s.ry * 0.97);
        }
        ctx.lineWidth = 0.3 * px;
        faint(ctx, pen.dark ? 0.15 : 0.25, () => ctx.stroke());
      }
      ctx.restore();
      outline(ctx, topPts, true, ink, pen, 0.85);
    }
    ctx.fillStyle = ink.body;
  },

  // Black coral: a few long whips, waving gently, each a pen line that
  // tapers to its tip over a thin wash, set with polyps when drawn big.
  whip(ctx, H, ink, r, px, pen) {
    const n = int(r, 2, 4);
    const p = new Path2D();
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
        const x = bx + Math.sin(lean) * len * t + Math.cos(lean) * wave;
        const y = -Math.cos(lean) * len * t + Math.sin(lean) * wave;
        if (k === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
        pts.push(x, y);
      }
      whips.push(pts);
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

  // Glass sponge: a tall pale vase of crossed lattice, barely there.
  glass(ctx, H, ink, r, px, pen) {
    const b = H * 0.06;
    const tw = H * range(r, 0.17, 0.22);
    const lean = range(r, -0.05, 0.05) * H;
    const vase = new Path2D();
    vase.moveTo(-b, 0);
    vase.bezierCurveTo(-H * 0.2, -H * 0.35, -tw * 0.6 + lean, -H * 0.75, -tw + lean, -H);
    vase.ellipse(lean, -H, tw, tw * 0.25, 0, Math.PI, 0);
    vase.bezierCurveTo(tw * 0.6 + lean, -H * 0.75, H * 0.2, -H * 0.35, b, 0);
    vase.closePath();
    const pts: number[] = [-b, 0];
    cubicPts(pts, [-b, 0, -H * 0.2, -H * 0.35, -tw * 0.6 + lean, -H * 0.75, -tw + lean, -H], 14);
    arcPts(pts, lean, -H, tw, tw * 0.25, Math.PI, Math.PI * 2, 14);
    cubicPts(pts, [tw + lean, -H, tw * 0.6 + lean, -H * 0.75, H * 0.2, -H * 0.35, b, 0], 14);
    faint(ctx, 0.3, () => ctx.fill(vase));
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

  // Sea pen: a feather on a short stalk; in the dark a few of its polyps glow.
  seapen(ctx, H, ink, r, px, pen) {
    const lean = range(r, -0.15, 0.15) * H;
    const sy = -0.22 * H;
    const at = (t: number): [number, number] => {
      const u = 1 - t;
      return [2 * u * t * lean * 0.2 + t * t * lean, u * u * sy + 2 * u * t * (sy - 0.4 * H) + t * t * -H];
    };
    const m = int(r, 9, 13);
    const tips: [number, number][] = [];
    const leaves = new Path2D();
    const veins = new Path2D();
    for (let i = 0; i < m; i++) {
      const t = 0.08 + (0.87 * i) / (m - 1);
      const [x, y] = at(t);
      const pl = H * 0.22 * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * t)), 0.8);
      const wd = H * 0.035;
      for (const side of [-1, 1]) {
        const ex = x + side * pl * 0.82;
        const ey = y - pl * 0.57;
        leaves.moveTo(x, y);
        leaves.quadraticCurveTo(x + side * pl * 0.35, y - pl * 0.5 - wd, ex, ey);
        leaves.quadraticCurveTo(x + side * pl * 0.5, y - pl * 0.1 + wd, x, y + wd * 0.5);
        veins.moveTo(x, y);
        veins.quadraticCurveTo(x + side * pl * 0.42, y - pl * 0.3, ex, ey);
        tips.push([ex, ey]);
      }
    }
    ctx.fillStyle = ink.body;
    ctx.fill(leaves);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.55 * px;
    ctx.stroke(leaves);
    if (pen.d > 0.3) {
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.45, () => ctx.stroke(veins));
      // The polyps along each leaf's edge: a row of tiny dots.
      const dots = new Path2D();
      for (const [ex, ey] of tips) {
        for (let k = 0; k < 3; k++) {
          const x = ex - (ex - (tips[0][0] + ex) / 2) * 0.12 * k;
          const y = ey + 0.9 * px * k;
          dots.moveTo(x + 0.35 * px, y);
          dots.arc(x, y, 0.35 * px, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = ink.ink;
      faint(ctx, 0.5, () => ctx.fill(dots));
      ctx.fillStyle = ink.body;
    }
    ctx.beginPath();
    ctx.ellipse(0, sy * 0.4, H * 0.035, -sy * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    const rachis: number[] = [0, 0, 0, sy];
    for (let k = 1; k <= 16; k++) rachis.push(...at(k / 16));
    outline(ctx, rachis, false, ink, pen, 1.2, [0, 0.4]);
    if (!ink.glow) return;
    // A soft light at a few of the polyps: small, and no brighter than the snow.
    const a = ctx.globalAlpha;
    for (let i = 0; i < tips.length; i += 3) {
      const [x, y] = tips[i];
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
};

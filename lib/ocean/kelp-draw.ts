/**
 * The kelp forest, inked (see `kelp.ts`).
 *
 * Drawn as a natural-history plate draws a giant kelp: each stipe a long
 * winding line, washed and edged in the pen; each blade a strap six to ten
 * times as long as it is wide, its margin ruffled 0.03 of its length deep,
 * no midrib, leaving the stipe on a gas bladder 0.13 of its length, streaming away
 * downstream, hanging as it goes, washed from gold where the light comes
 * through to a deeper brown on its shadow half, with its margin crinkled
 * and, drawn big, its surface corrugated across and its edge in a pen line
 * that swells into the shadow and breaks in the light. Where a stalk is
 * longer than the water is deep it bends over at the surface and its top
 * lies along it, in the page, as canopy, its blades hanging down from it.
 * The forest stands at three depths, the far ones smaller, paler and lost
 * in the water's haze. It stands on a ledge of boulders (`inkRock`), its
 * holdfasts gripping their tops.
 *
 * It is drawn every frame, so the slow parts are kept for when the drawing
 * is big (`detailFor`, which a live screen never reaches and a wallpaper
 * always does), and the rock is drawn once and only placed.
 */

import { mixHex } from '../fan';
import { zoneMid } from './depth';
import { KELP_ROCK, KELP_SCALE, KELP_SURFACE, kelpDescent, kelpInView, type Kelp, type KelpLedge, type KelpStalk } from './kelp';
import { inkRock, rockFoot, rockShape, rockStyle, type RockShape } from './outcrop-sprite';
import { waterAt, type Water } from './palette';
import { detailFor, inkLine, LIGHT, stipple } from './pen';

/** The light ink on dark water. */
const INK_DARK = '#E8E0CF';
/** The kelp's own colours: the wash from where the light comes through to
    its shadow, and the ink it is lined in on light water. */
const GOLD = '#B08A3E';
const BROWN = '#8A6A2E';
const KELP_INK = '#5E4520';
/** The light from the top left, and the other way for light ink on dark
    water, which marks where the light falls rather than where it doesn't. */
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];
/** How much of each depth shows: the far ones lost in the haze. */
const ALPHA = [0.5, 0.75, 0.95];
const HAZE = [0.45, 0.22, 0];

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pen {
  /** The line colour. */
  line: string;
  dark: boolean;
  /** How much drawing the size carries, 0 to 1 (`detailFor`). */
  d: number;
  /** The light as the pen should take it: reversed on dark water. */
  light: [number, number];
}

interface Inks {
  gold: string;
  brown: string;
  line: string;
  float: string;
}

export interface KelpOptions {
  /** The height the blades are measured against, in the same units as `h`:
      the whole page's, where the forest is drawn a frame at a time down a
      taller picture. The live screen leaves it out and measures them
      against its own frame. */
  page?: number;
  /** The water the forest's colours are taken toward (the light it is
      drained by, the haze it goes back into, the dark it sinks in at
      night). A picture that draws one forest a frame at a time, each frame
      on its own water, passes one water for them all here, so the blades
      do not change colour where one frame meets the next. By default the
      frame's own `water`. */
  inkWater?: Water;
}

/**
 * The kelp forest at the edges of the sunlit water (see `kelp.ts`): the far
 * stalks, then the ledge, then the nearer stalks standing on it. Each stalk
 * leans a few degrees out from its wall and winds as it goes up, sways on
 * the slow clock, the sway travelling up it and growing toward the top, and
 * where it reaches the surface it bends over and lies along it, sagging a
 * little, its tip trailing down and away past the rest of the clump. Its
 * blades are opaque, laid back to front: those behind the stipe, the stipe,
 * then those in front and the canopy's. `detail` is the governor's say:
 * without it the blades lose their ruffle and the rock its shading.
 * `current` is kept for the callers; at a forest's edge the water runs out
 * from the wall, so the whole clump streams that way.
 */
export function drawKelp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kelp: Kelp,
  focusSeconds: number,
  water: Water,
  ambient: number,
  current: number,
  px: number,
  clear: Rect[] | undefined,
  detail: boolean,
  opts: KelpOptions = {},
) {
  void current;
  if (!kelpInView(focusSeconds)) return;
  const down = kelpDescent(focusSeconds);
  // The surface as the forest knows it: where it was at the start, carried
  // up the page with the forest, so the canopy lies on the same water
  // however far down the page (or down a picture's frames) it is drawn.
  const surface = (KELP_SURFACE - down) * h;
  // The blades are judged at their own size: about a twentieth of the page.
  const page = opts.page ?? h;
  const pen: Pen = {
    line: water.dark ? mixHex(INK_DARK, GOLD, 0.25) : KELP_INK,
    dark: water.dark,
    d: detail ? detailFor(0.055 * page * 1.4) : 0,
    light: water.dark ? UNLIGHT : LIGHT,
  };
  // The light goes, and the colour with it: drained toward the water.
  // (Drawn a frame at a time with no one water given, at night: the
  // night's own at the forest's depth, the same for every frame.)
  const iw = opts.inkWater ?? (opts.page != null && water.dark ? nightWater() : water);
  const fade = 0.45 + 0.55 * iw.light;
  const drain = (1 - iw.light) * 0.45;
  // What is behind the kelp, for laying it opaque: a stalk further back is
  // its colours taken toward the water, never the water seen through it.
  const behind = mixHex(iw.top, iw.bottom, 0.5);
  // At night the blades sink toward one dark, the night's own at the
  // forest's depth (as its ledge's stone is), not the frame's: a forest
  // drawn a frame at a time must not step in colour at a frame's edge.
  const night = water.dark ? nightWater().bottom : null;
  const inksAt = (layer: number): Inks => {
    const thin = 1 - ALPHA[layer] * fade;
    const into = (c: string) => {
      let v = mixHex(c, iw.bottom, drain + HAZE[layer] * 0.6);
      if (night) v = mixHex(v, night, 0.3);
      return mixHex(v, behind, thin);
    };
    return {
      gold: into(GOLD),
      brown: into(BROWN),
      line: mixHex(mixHex(pen.line, iw.bottom, HAZE[layer] * 0.7), behind, thin * 0.8),
      float: into(mixHex(GOLD, '#EAD9A6', 0.3)),
    };
  };
  const rocks = kelp.ledges.map((l) => ledgeRock(l, w, h, px));
  // The side with fewer stalks is a few stragglers back in the haze; its rock is too.
  const count = (e: -1 | 1) => kelp.stalks.filter((s) => (s.x < 0.5 ? -1 : 1) === e).length;
  const main = kelp.ledges.length > 1 ? (count(-1) >= count(1) ? -1 : 1) : kelp.ledges[0]?.edge;
  // Where each side's clump ends toward the open water: its stalks' tops,
  // leaned. The canopies trail on past it.
  const edgeOf = (e: -1 | 1) => {
    let far = 0;
    for (const s of kelp.stalks) {
      if ((s.x < 0.5 ? -1 : 1) !== e || s.layer === 0) continue;
      far = Math.max(far, (e < 0 ? s.x : 1 - s.x) * w + leanOf(s, w, h));
    }
    return e < 0 ? far : w - far;
  };
  const edges = new Map<number, number>([
    [-1, edgeOf(-1)],
    [1, edgeOf(1)],
  ]);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stalkAt = (s: KelpStalk) => {
    const ledge = kelp.ledges.find((l) => (l.edge < 0 ? s.x < 0.5 : s.x >= 0.5)) ?? kelp.ledges[0];
    const rock = rocks[kelp.ledges.indexOf(ledge)];
    // Rooted on the top of the boulder under it, a little into it.
    const u = (ledge.edge < 0 ? s.x : 1 - s.x) * w + 0.03 * w;
    return (ledge.top - down) * h + rock.top(u) + 2 * px;
  };
  const draw = (s: KelpStalk) =>
    drawStalk(ctx, w, h, s, stalkAt(s), surface, inksAt(s.layer), ambient, px, clear, detail, pen, page, edges.get(s.x < 0.5 ? -1 : 1)!);
  for (const s of kelp.stalks) if (s.layer === 0) draw(s);
  kelp.ledges.forEach((l, i) => drawLedge(ctx, w, h, l, rocks[i], down, water, px, (l.edge === main ? 0.92 : 0.55) * fade, detail));
  for (const s of kelp.stalks) if (s.layer > 0) draw(s);
  ctx.restore();
}

/** The night's water at the forest's depth, worked out once. */
let nightAt: Water | null = null;
const nightWater = () => (nightAt ??= waterAt(zoneMid(0), 'night', '#A8BCC9'));

/** A stalk's own dice, off its phase, so the forest's rolls stay as they were. */
const dice = (s: KelpStalk, k: number) => {
  const v = Math.sin(s.phase * 91.7 + k * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

/** How far a stalk leans out from its wall by the time it reaches the
    surface, in device px: 3 to 10 degrees, but never more than about a
    seventh of the frame's width, so a tall phone's forest stays at its wall. */
function leanOf(s: KelpStalk, w: number, h: number): number {
  const rise = Math.max(0, (s.base - KELP_SURFACE - 0.05) * h);
  const reach = Math.min(rise, s.height * h);
  const deg = 3 + 7 * dice(s, 1);
  return Math.min(Math.tan((deg * Math.PI) / 180) * reach, 0.14 * w);
}

/** Where the ledge's wash runs dry, as shares of its height: low, since the forest stands on it. */
const LEDGE_FADE: [number, number] = [0.78, 1.12];

/** The ledge's rock, the same shape however far down the page it is: a
    heap of boulders at least three quarters as tall as it is wide, however
    wide the frame, so it is never a slab. */
function ledgeRock(l: KelpLedge, w: number, h: number, px: number): RockShape {
  const span = (l.reach + 0.03) * w;
  return rockShape(l.seed, span, Math.max(KELP_ROCK * h, 0.75 * span), px);
}

/* The ledge is drawn once to a canvas of its own and only placed after
   that: it is the same rock all the way up the page. */
const ledges = new Map<string, { canvas: HTMLCanvasElement; left: number; oy: number }>();

function drawLedge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ledge: KelpLedge,
  shape: RockShape,
  down: number,
  water: Water,
  px: number,
  alpha: number,
  detail: boolean,
) {
  const top = (ledge.top - down) * h;
  if (top + shape.minY > h * 1.05 || top + shape.height < 0) return;
  if (typeof document === 'undefined') return;
  const d = detail ? detailFor(Math.min(shape.span, shape.height * 2.5)) : 0.2;
  const key = `${ledge.seed}|${ledge.edge}|${w}|${h}|${px}|${water.dark ? 1 : 0}|${d.toFixed(2)}`;
  let s = ledges.get(key);
  if (!s) {
    const pad = 4 * px;
    const cw = Math.min(4096, Math.ceil(shape.hi + pad * 2));
    const ch = Math.min(4096, Math.ceil(rockFoot(shape, { fade: LEDGE_FADE }) - Math.min(0, shape.minY) + pad * 2));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const c = canvas.getContext('2d');
    if (!c) return;
    const dir: 1 | -1 = ledge.edge < 0 ? 1 : -1;
    const oy = pad - Math.min(0, shape.minY);
    const x0 = dir > 0 ? pad : cw - pad;
    const zw = waterAt(zoneMid(0), water.dark ? 'night' : 'paper', '#A8BCC9');
    inkRock(c, shape, { x0, y0: oy, dir }, { ...rockStyle(zw, water.dark, px, d, ledge.seed), barnacles: true, fade: LEDGE_FADE });
    // The rock's wall is 3% of the page out past the edge.
    const left = dir > 0 ? -0.03 * w - pad : w + 0.03 * w + pad - cw;
    s = { canvas, left, oy };
    ledges.set(key, s);
    if (ledges.size > 6) ledges.delete(ledges.keys().next().value as string);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.canvas, s.left, top - s.oy);
  ctx.restore();
}

/*
 * Curves laid as straight steps, fine enough (a tenth of a device px off
 * the curve at most) to read as the curve. A curve left in a path is
 * chopped where a clip crosses it, and Skia flattens the chopped piece in
 * other steps than the whole: a picture printed in strips clips every
 * strip at its edge, so a blade or a root across that edge came out a
 * different shape in each strip from the whole page's, up to 41/255 off.
 * A polygon cut by a clip is the same polygon.
 */
const TOL = 0.1;

/** A quadratic from (ax, ay) through (cx, cy) to (bx, by), the start already in `p`. */
function quadTo(p: Path2D, ax: number, ay: number, cx: number, cy: number, bx: number, by: number) {
  const m = Math.hypot(ax - 2 * cx + bx, ay - 2 * cy + by);
  const n = Math.min(24, Math.max(1, Math.ceil(Math.sqrt(m / (4 * TOL)))));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    p.lineTo(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
  }
}

/** A cubic from (ax, ay) through (c1x, c1y) and (c2x, c2y) to (bx, by), the start already in `p`. */
function cubicTo(p: Path2D, ax: number, ay: number, c1x: number, c1y: number, c2x: number, c2y: number, bx: number, by: number) {
  const m = Math.max(Math.hypot(ax - 2 * c1x + c2x, ay - 2 * c1y + c2y), Math.hypot(c1x - 2 * c2x + bx, c1y - 2 * c2y + by));
  const n = Math.min(32, Math.max(1, Math.ceil(Math.sqrt((0.75 * m) / TOL))));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    p.lineTo(
      u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx,
      u * u * u * ay + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * by,
    );
  }
}

/** An ellipse, rotated by `rot`, as a closed polygon of its own. */
function ellipseOf(p: Path2D, x: number, y: number, rx: number, ry: number, rot: number) {
  const n = Math.min(48, Math.max(8, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - TOL / Math.max(rx, ry, TOL))))));
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    if (i) p.lineTo(x + ex * c - ey * s, y + ex * s + ey * c);
    else p.moveTo(x + ex * c - ey * s, y + ex * s + ey * c);
  }
  p.closePath();
}

/* A stalk's centreline for one frame, reused across stalks and frames. */
let lineX = new Float64Array(0);
let lineY = new Float64Array(0);
let lineS = new Float64Array(0);

function drawStalk(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stalk: KelpStalk,
  foot: number,
  surface: number,
  ink: Inks,
  ambient: number,
  px: number,
  clear: Rect[] | undefined,
  detail: boolean,
  pen: Pen,
  page: number,
  edgeX: number,
) {
  const len = stalk.height * h;
  const scale = KELP_SCALE[stalk.layer];
  const near = stalk.layer === 2;
  const far = stalk.layer === 0;
  // It leans out from its wall, and its canopy and blades stream that way.
  const inward = stalk.x < 0.5 ? 1 : -1;
  const x0 = stalk.x * w;
  const [wa, wf, wp] = stalk.wave;
  // Where it bends over at the surface, and how wide the bend is: never a hook.
  const bendR = Math.max(0.05 * h, 0.035 * page) * (0.75 + 0.7 * dice(stalk, 5));
  const rise = foot - (surface + bendR);
  // Long enough to reach the surface, it lies along it as canopy.
  const canopy = rise > 0 && len > rise;
  const upright = canopy ? rise : len;
  const tanLean = upright > 0 ? (inward * leanOf(stalk, w, h)) / Math.max(1, rise > 0 ? Math.min(rise, len) : len) : 0;
  // The canopy: from the bend out along the surface, sagging as it goes,
  // then trailing down and away past the clump's edge.
  const sag = (0.01 + 0.02 * dice(stalk, 3)) * page;
  const past = (0.05 + 0.07 * dice(stalk, 2)) * w * (far ? 0.6 : 1);
  const dive = Math.tan(((14 + 11 * dice(stalk, 4)) * Math.PI) / 180);
  // Only the stretch of it on the page (and a little over) is worth tracing.
  if (foot < -h * 0.3 || foot - upright - bendR - sag - h * 0.2 > h * 1.06) return;

  /* The centreline, foot to tip, a point every few device px. */
  const step = 3 * px;
  const cap = Math.ceil((upright + bendR * 2 + w) / step) + 8;
  if (lineX.length < cap) {
    lineX = new Float64Array(cap * 2);
    lineY = new Float64Array(cap * 2);
    lineS = new Float64Array(cap * 2);
  }
  // Each point's place along it: up the upright stretch, its height over the
  // holdfast; from the bend on, that plus the way it has come. The same
  // point of the stalk has the same place in every frame it is drawn in,
  // however much of it below is traced, so a blade never jumps at a seam.
  let n = 0;
  const push = (x: number, y: number, at?: number) => {
    if (n >= lineX.length) return;
    lineS[n] = at ?? (n ? lineS[n - 1] + Math.hypot(x - lineX[n - 1], y - lineY[n - 1]) : 0);
    lineX[n] = x;
    lineY[n] = y;
    n++;
  };
  const stemAt = (dd: number) => {
    const d = dd / h;
    const give = Math.min(1, d / 1.1);
    // The stipe winds as it goes up, drifts on a longer swing, and the slow sway runs up it.
    const sway =
      (Math.sin(ambient * 0.42 + stalk.phase - d * 2.4) * 0.02 + Math.sin(ambient * 0.9 + stalk.phase * 1.7 - d * 5) * 0.006) * h * give;
    const wind = wa * h * Math.sin(d * wf + wp) * Math.min(1, d / 0.15);
    const drift = 0.022 * h * Math.sin(d * 1.7 + stalk.phase * 2.3) * Math.min(1, d / 0.3);
    return x0 + sway + wind + drift + tanLean * dd;
  };
  // Below the page it need not be traced point by point.
  const from = Math.max(0, foot - h * 1.1);
  for (let dd = from; dd < upright; dd += step) {
    if (foot - dd < -h * 0.15 && !canopy) break;
    push(stemAt(dd), foot - dd, dd);
  }
  push(stemAt(upright), foot - upright, upright);
  if (canopy) {
    // Over the bend: from going up to going out along the surface.
    const ax = lineX[n - 1];
    const ay = lineY[n - 1];
    const cx = ax + inward * 0.12 * bendR;
    const cy = surface + 0.05 * bendR;
    const bx = ax + inward * bendR;
    const by = surface + 0.15 * sag;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
    }
    // Out to past the clump's edge: floating, then diving.
    const span = Math.max(0.05 * w, inward * (edgeX + inward * past - bx));
    const float = span * (0.6 + 0.15 * dice(stalk, 6));
    const tail = span - float;
    for (let s = step; s <= span; s += step) {
      const x = bx + inward * s;
      const ripple = Math.sin(ambient * 1.3 + s / (0.03 * h) + stalk.phase) * 0.003 * h;
      const y =
        s <= float
          ? by + (sag - 0.15 * sag) * Math.sin((Math.PI / 2) * (s / float)) + ripple * (1 - s / span)
          : by + 0.85 * sag + dive * tail * Math.pow((s - float) / tail, 1.35);
      push(x, y);
    }
  }
  if (n < 2) return;
  const total = lineS[n - 1];
  const s0 = lineS[0];
  /** A point d device px along the centreline, and the way it is going. */
  let hint = 0;
  const at = (d: number) => {
    const s = Math.max(s0, Math.min(total, d));
    if (lineS[hint] > s) hint = 0;
    while (hint < n - 2 && lineS[hint + 1] < s) hint++;
    const seg = lineS[hint + 1] - lineS[hint] || 1;
    const f = (s - lineS[hint]) / seg;
    const tx = lineX[hint + 1] - lineX[hint];
    const ty = lineY[hint + 1] - lineY[hint];
    const tl = Math.hypot(tx, ty) || 1;
    return { x: lineX[hint] + tx * f, y: lineY[hint] + ty * f, ux: tx / tl, uy: ty / tl };
  };
  const big = pen.d > 0.4 && !far;
  const inClear = (x: number, y: number) => {
    if (!clear) return false;
    const u = x / w;
    const v = y / h;
    return clear.some((r) => u > r.x && u < r.x + r.w && v > r.y && v < r.y + r.h);
  };
  const seed = Math.floor(stalk.phase * 1000);

  /* The blades: geometry for one, into the scratch edges. */
  const SEG = big ? 28 : detail ? 10 : 7;
  const edgeA: [number, number][] = [];
  const edgeB: [number, number][] = [];
  const mid: [number, number][] = [];
  for (let k = 0; k <= SEG; k++) {
    edgeA.push([0, 0]);
    edgeB.push([0, 0]);
    mid.push([0, 0]);
  }
  // Measured against the page, a picture drawn a frame at a time has blades
  // bigger against its frame than the live screen's; it draws fewer of them.
  const ratio = page / h;
  const stride = ratio > 1.5 ? 2 * Math.floor(ratio / 2) + 1 : 1;
  const [lx, ly] = LIGHT;
  const flow = inward;
  const shapeOf = (b: KelpStalk['blades'][number], j: number) => {
    // Spread over the whole of it from the holdfast, canopy and all.
    const sAt = b.t * total;
    if (sAt < s0) return null;
    const p = at(sAt);
    const L = b.len * page;
    const W = b.width * page;
    if (p.y < -L * 1.2 || p.y > h + L * 0.7 || p.x < -L * 1.2 || p.x > w + L * 1.2) return null;
    const { ux, uy } = p;
    const onCanopy = canopy && p.y < surface + sag + 0.04 * h && uy > -0.6;
    // Off the stipe at an angle, then taken by the current: streaming away
    // downstream and hanging as it goes. Off the canopy they trail down and away.
    const flutter = Math.sin(ambient * 1.1 + stalk.phase + j * 1.3) * 0.08;
    const off = b.side * b.angle;
    let d0x = ux * Math.cos(off) - uy * Math.sin(off);
    let d0y = ux * Math.sin(off) + uy * Math.cos(off);
    const downstream = b.side * flow > 0 || onCanopy;
    if (onCanopy) {
      d0x = flow * 0.4 + d0x * 0.15;
      d0y = 1;
    } else if (downstream) {
      // Out from the stipe and a little up, leaning already the way it will stream.
      d0x = d0x * 0.9 + flow * 0.15;
      d0y = Math.min(-0.3, d0y * 0.8);
    } else {
      // Upstream, it leaves level and hangs.
      d0x = b.side * 0.85;
      d0y = -0.05 + 0.15 * b.droop;
    }
    const dl = Math.hypot(d0x, d0y) || 1;
    d0x /= dl;
    d0y /= dl;
    let dex = downstream ? flow * (1 - 0.35 * b.droop) + flutter : b.side * 0.22 + flow * 0.2 + flutter;
    let dey = downstream ? 0.1 + 0.45 * b.droop : 0.75 + 0.25 * b.droop;
    if (onCanopy) {
      // Each its own way: some trail out nearly flat, some hang.
      dex = flow * (0.45 + 0.55 * (1 - b.droop) + 0.6 * (b.angle - 0.57)) + flutter * 2;
      dey = 0.35 + 0.6 * b.droop;
    }
    const el = Math.hypot(dex, dey);
    dex /= el;
    dey /= el;
    // The bladder (a pneumatocyst), a plump ellipse along the way the blade
    // leaves: 0.13 of the blade's length, the giant kelp's mark (a willow
    // or a bamboo leaf has none).
    const fr = Math.max(1.1 * px, L * 0.066);
    const fx = p.x + d0x * fr * 0.9;
    const fy = p.y + d0y * fr * 0.9;
    const bx = fx + d0x * fr * 0.95;
    const by = fy + d0y * fr * 0.95;
    // The blade's line: a quadratic out along the first way and round into the second.
    const cx = bx + d0x * L * 0.35;
    const cy = by + d0y * L * 0.35;
    const ex = bx + d0x * L * 0.25 + dex * L * 0.82;
    const ey = by + d0y * L * 0.25 + dey * L * 0.82;
    const curl = b.curl * L;
    for (let k = 0; k <= SEG; k++) {
      const u = k / SEG;
      const v = 1 - u;
      let mx = v * v * bx + 2 * v * u * cx + u * u * ex;
      let my = v * v * by + 2 * v * u * cy + u * u * ey;
      const tx = 2 * v * (cx - bx) + 2 * u * (ex - cx);
      const ty = 2 * v * (cy - by) + 2 * u * (ey - cy);
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl;
      const ny = tx / tl;
      mx += nx * curl * u * u;
      my += ny * curl * u * u;
      // A strap: a short neck off the bladder, out to its width over the
      // first fifth, near enough even down its length (a leaf swells in its
      // middle and comes to a point; a blade does not), and rounded off
      // blunt over its last fifth.
      const body =
        (W / 2) *
        Math.pow(Math.min(1, u / 0.2), 0.75) *
        (u > 0.8 ? Math.pow(Math.cos(((u - 0.8) / 0.2) * (Math.PI / 2)), 0.4) : 1) *
        (0.94 + 0.06 * Math.sin(u * 5 + b.ph));
      let ra = 0;
      let rb = 0;
      if (k > 0 && k < SEG && (big || detail)) {
        // The ruffled margin, 0.03 of the blade's length deep: a quick frill
        // riding a slower one, each edge its own, bunching and spreading
        // along it, never a saw's teeth. It dies away at the neck and tip.
        // Fine frills drawn big (a lobe or two is an oak's leaf), a slow
        // wave small, where the outline has too few points for more.
        const f = u * (big ? 10.5 : 4);
        const g = f + 0.6 * Math.sin(f * 0.9 + b.ph);
        const amp = 0.03 * L * Math.min(1, u / 0.18, (1 - u) / 0.12);
        ra = amp * (0.82 * Math.sin(g * 6.28 + b.ph) + 0.18 * Math.sin(f * 9.1 + b.ph * 1.7));
        rb = amp * (0.82 * Math.sin(g * 5.6 + b.ph + 2.1) + 0.18 * Math.sin(f * 8.3 + b.ph));
      }
      edgeA[k][0] = mx + nx * (body + ra);
      edgeA[k][1] = my + ny * (body + ra);
      edgeB[k][0] = mx - nx * (body + rb);
      edgeB[k][1] = my - ny * (body + rb);
      mid[k][0] = mx;
      mid[k][1] = my;
    }
    // Which half faces away from the light: that half is the shadow.
    const n0x = edgeA[SEG >> 1][0] - mid[SEG >> 1][0];
    const n0y = edgeA[SEG >> 1][1] - mid[SEG >> 1][1];
    return { bx, by, fx, fy, fr, d0x, d0y, aDark: n0x * lx + n0y * ly > 0, faint: inClear(p.x, p.y), front: onCanopy || b.side === inward };
  };
  // The canopy keeps more of its blades than the stipe below: it is a mat.
  const onTop = (b: KelpStalk['blades'][number]) => canopy && b.t * total > upright;
  const topStride = Math.max(1, stride - 1);
  // Each edge smoothed through its points' midpoints, from (sx, sy).
  const trace = (target: Path2D, edge: [number, number][], back: boolean, sx: number, sy: number) => {
    if (!back) {
      for (let k = 1; k <= SEG; k++) {
        const [ax, ay] = edge[k - 1];
        const [qx, qy] = edge[k];
        quadTo(target, sx, sy, ax, ay, (sx = (ax + qx) / 2), (sy = (ay + qy) / 2));
      }
      target.lineTo(edge[SEG][0], edge[SEG][1]);
    } else {
      for (let k = SEG - 1; k >= 0; k--) {
        const [ax, ay] = edge[k + 1];
        const [qx, qy] = edge[k];
        quadTo(target, sx, sy, ax, ay, (sx = (ax + qx) / 2), (sy = (ay + qy) / 2));
      }
    }
  };
  const outlineOf = (g: { bx: number; by: number }, path: Path2D, shadow: Path2D, aDark: boolean) => {
    path.moveTo(g.bx, g.by);
    trace(path, edgeA, false, g.bx, g.by);
    trace(path, edgeB, true, edgeA[SEG][0], edgeA[SEG][1]);
    path.closePath();
    shadow.moveTo(g.bx, g.by);
    trace(shadow, aDark ? edgeA : edgeB, false, g.bx, g.by);
    for (let k = SEG; k >= 0; k--) shadow.lineTo(mid[k][0], mid[k][1]);
    shadow.closePath();
  };

  /* The blade's corrugations: two lines down it either side of its middle,
     each over a stretch of its length of its own, off the scratch edges. */
  const corrugations = (into: Path2D, j: number) => {
    const ph = stalk.blades[j].ph;
    for (const [edge, f, a0, a1] of [
      [edgeA, 0.42, 0.12 + 0.08 * Math.sin(ph), 0.7 + 0.1 * Math.cos(ph)],
      [edgeB, 0.36, 0.2 + 0.06 * Math.cos(ph * 1.3), 0.82 + 0.06 * Math.sin(ph * 2)],
    ] as const) {
      const k0 = Math.max(1, Math.round(a0 * SEG));
      const k1 = Math.min(SEG - 1, Math.round(a1 * SEG));
      if (k1 - k0 < 2) continue;
      for (let k = k0; k <= k1; k++) {
        const x = mid[k][0] + (edge[k][0] - mid[k][0]) * f;
        const y = mid[k][1] + (edge[k][1] - mid[k][1]) * f;
        if (k === k0) into.moveTo(x, y);
        else into.lineTo(x, y);
      }
    }
  };
  /* One blade, finished, over whatever is already down. */
  const finish = (g: NonNullable<ReturnType<typeof shapeOf>>, j: number) => {
    const a = g.faint ? 0.3 : 1;
    const path = new Path2D();
    const shadow = new Path2D();
    outlineOf(g, path, shadow, g.aDark);
    ctx.globalAlpha = a;
    ctx.fillStyle = ink.gold;
    ctx.fill(path);
    ctx.fillStyle = ink.brown;
    ctx.globalAlpha = a * 0.75;
    ctx.fill(shadow);
    if (!big) {
      // Small: its corrugations and one plain line round it.
      const cor = new Path2D();
      corrugations(cor, j);
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = 0.45 * px * scale;
      ctx.globalAlpha = a * 0.45;
      ctx.stroke(cor);
      ctx.lineWidth = (far ? 0.5 : 0.75) * px * scale;
      ctx.globalAlpha = a * (far ? 0.6 : 0.85);
      ctx.stroke(path);
      floatOf(g, a);
      return;
    }
    // The pigment pooled at the margin as the wash dried.
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = ink.brown;
    ctx.globalAlpha = a * 0.5;
    ctx.lineWidth = 2 * px * scale;
    ctx.stroke(path);
    // A stipple in the shadow half, thickest toward the margin.
    let sx0 = Infinity;
    let sy0 = Infinity;
    let sx1 = -Infinity;
    let sy1 = -Infinity;
    for (const [x, y] of g.aDark ? edgeA : edgeB) {
      sx0 = Math.min(sx0, x);
      sy0 = Math.min(sy0, y);
      sx1 = Math.max(sx1, x);
      sy1 = Math.max(sy1, y);
    }
    for (const [x, y] of mid) {
      sx0 = Math.min(sx0, x);
      sy0 = Math.min(sy0, y);
      sx1 = Math.max(sx1, x);
      sy1 = Math.max(sy1, y);
    }
    ctx.restore();
    if (!g.faint && sx1 > sx0 && sy1 > sy0) {
      stipple(ctx, shadow, { x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0 }, {
        spacing: 1.9 * px,
        radius: 0.36 * px,
        shade: () => 0.6,
        color: pen.dark ? mixHex(ink.brown, '#000000', 0.5) : ink.line,
        alpha: pen.dark ? 0.6 : 0.45,
        seed: seed + j * 7,
      });
    }
    // Here and there a short soft crease across it from near its middle,
    // the way a giant kelp's blade is wrinkled, never a row.
    // No midrib (a kelp blade has none; a leaf's is what makes it a leaf):
    // two long corrugations down it instead, broken, off its middle.
    const veins = new Path2D();
    corrugations(veins, j);
    const folds = new Path2D();
    for (let k = 3; k < SEG - 3; k++) {
      const hsh = Math.sin(k * 12.9898 + j * 78.233 + stalk.blades[j].ph) * 43758.5453;
      const v = hsh - Math.floor(hsh);
      if (v > 0.38) continue;
      const edge = v < 0.19 ? edgeA : edgeB;
      const [mx, my] = mid[k];
      const [qx, qy] = edge[Math.min(SEG, k + 1)];
      const f0 = 0.2 + v;
      const fx0 = mx + (qx - mx) * f0;
      const fy0 = my + (qy - my) * f0;
      folds.moveTo(fx0, fy0);
      quadTo(folds, fx0, fy0, mx + (qx - mx) * (f0 + 0.25) + (mid[k + 1][0] - mx) * 0.3, my + (qy - my) * (f0 + 0.25) + (mid[k + 1][1] - my) * 0.3, mx + (qx - mx) * 0.85, my + (qy - my) * 0.85);
    }
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = 0.55 * px * scale;
    ctx.globalAlpha = a * 0.55;
    ctx.stroke(veins);
    ctx.lineWidth = 0.4 * px;
    ctx.globalAlpha = a * 0.3;
    ctx.stroke(folds);
    ctx.globalAlpha = 1;
    const o: number[] = [g.bx, g.by];
    for (const [x, y] of edgeA) o.push(x, y);
    for (let k = SEG - 1; k >= 1; k--) o.push(edgeB[k][0], edgeB[k][1]);
    inkLine(ctx, o, true, {
      width: 0.9 * px * scale,
      color: ink.line,
      alpha: a * 0.95,
      plate: true,
      seed: j + 3 + Math.floor(stalk.phase * 100),
      light: pen.light,
      min: 0.25 * px,
    });
    floatOf(g, a);
  };
  /* Its bladder: a little bead of gas, lit on top. */
  const floatOf = (g: { fx: number; fy: number; fr: number; d0x: number; d0y: number }, a: number) => {
    const bead = new Path2D();
    ellipseOf(bead, g.fx, g.fy, g.fr, g.fr * 0.72, Math.atan2(g.d0y, g.d0x));
    ctx.globalAlpha = a;
    ctx.fillStyle = ink.float;
    ctx.fill(bead);
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = (near ? 0.6 : 0.45) * px;
    ctx.globalAlpha = a * 0.85;
    ctx.stroke(bead);
    ctx.globalAlpha = 1;
  };
  /* Small, a side's blades are laid in one pass each, opaque: the wash,
     the shadow half, then the pen. */
  const batch = (front: boolean) => {
    const plain = new Path2D();
    const faint = new Path2D();
    const shPlain = new Path2D();
    const shFaint = new Path2D();
    const veins = new Path2D();
    const floats = new Path2D();
    let any = false;
    for (let j = 0; j < stalk.blades.length; j++) {
      if (j % (onTop(stalk.blades[j]) ? topStride : stride)) continue;
      const g = shapeOf(stalk.blades[j], j);
      if (!g || g.front !== front) continue;
      any = true;
      outlineOf(g, g.faint ? faint : plain, g.faint ? shFaint : shPlain, g.aDark);
      if (detail) corrugations(veins, j);
      ellipseOf(floats, g.fx, g.fy, g.fr, g.fr * 0.72, Math.atan2(g.d0y, g.d0x));
    }
    if (!any) return;
    for (const [path, shadow, a] of [
      [plain, shPlain, 1],
      [faint, shFaint, 0.3],
    ] as const) {
      ctx.globalAlpha = a;
      ctx.fillStyle = ink.gold;
      ctx.fill(path);
      ctx.fillStyle = ink.brown;
      ctx.globalAlpha = a * 0.75;
      ctx.fill(shadow);
    }
    if (detail) {
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = 0.45 * px * scale;
      ctx.globalAlpha = 0.55;
      ctx.stroke(veins);
    }
    ctx.lineWidth = (far ? 0.5 : 0.75) * px * scale;
    ctx.strokeStyle = ink.line;
    ctx.globalAlpha = far ? 0.6 : 0.85;
    ctx.stroke(plain);
    ctx.globalAlpha = 0.3;
    ctx.stroke(faint);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink.float;
    ctx.fill(floats);
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = (near ? 0.6 : 0.45) * px;
    ctx.globalAlpha = 0.85;
    ctx.stroke(floats);
    ctx.globalAlpha = 1;
  };
  const blades = (front: boolean) => {
    if (!detail) {
      batch(front);
      return;
    }
    // Lowest first, so each hangs over the one below it.
    for (let j = 0; j < stalk.blades.length; j++) {
      if (j % (onTop(stalk.blades[j]) ? topStride : stride)) continue;
      const g = shapeOf(stalk.blades[j], j);
      if (g && g.front === front) finish(g, j);
    }
  };

  /* The holdfast, when the foot of the stalk is on the page: a low cone of
     fine branching roots gripping the boulder's top, spreading over it. */
  if (foot > -0.08 * h && foot < h * 1.08) {
    const fx = stemAt(0);
    const k = scale * Math.max(0.6, page / (900 * px));
    const roots = new Path2D();
    const fine = new Path2D();
    stalk.roots.forEach((a, i) => {
      const spread = (9 + 6 * Math.abs(a)) * k * px;
      const dx = Math.sin(a) * spread;
      const ex = fx + dx;
      const ey = foot + (1 + Math.abs(a) * 2.5) * k * px;
      const sy = foot - (5 + (i % 3) * 1.5) * k * px;
      roots.moveTo(fx + dx * 0.08, sy);
      cubicTo(roots, fx + dx * 0.08, sy, fx + dx * 0.3, sy + 1.5 * k * px, fx + dx * 0.75, foot - 1.5 * k * px, ex, ey);
      // Each root forks twice as it takes hold, the forks finer.
      for (const f of [0.55, 0.8]) {
        const ax = fx + dx * f;
        const ay = foot + (Math.abs(a) * f * 1.6 - 1.2) * k * px;
        const side = (i + (f > 0.6 ? 1 : 0)) % 2 ? 1 : -1;
        fine.moveTo(ax, ay);
        quadTo(fine, ax, ay, ax + dx * 0.15 + side * 2 * k * px, ay + 1.2 * k * px, ax + dx * 0.22 + side * 3 * k * px, ay + (2.5 + (i % 2)) * k * px);
      }
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ink.brown;
    ctx.lineWidth = 1.3 * k * px;
    ctx.stroke(roots);
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = Math.max(0.45 * px, 0.6 * k * px);
    ctx.globalAlpha = 0.9;
    ctx.stroke(roots);
    ctx.lineWidth = Math.max(0.35 * px, 0.4 * k * px);
    ctx.stroke(fine);
    ctx.globalAlpha = 1;
  }

  // Behind the stipe first.
  blades(false);

  // The stipe: a wash under one pen line that swells on its shadow side,
  // stout at the holdfast and running out at the tip. Like the blades, it
  // goes faint where it crosses what is written: each run of it is its own.
  const visible = (y: number) => y > -0.08 * h && y < h * 1.08;
  const runs: { pts: number[]; faint: boolean; from: number; to: number }[] = [];
  let run: { pts: number[]; faint: boolean; from: number; to: number } | null = null;
  for (let i = 1; i < n; i++) {
    const t = lineS[i] / total;
    if (!visible(lineY[i]) && !visible(lineY[i - 1])) {
      run = null;
      continue;
    }
    const inside = inClear((lineX[i] + lineX[i - 1]) / 2, (lineY[i] + lineY[i - 1]) / 2);
    if (!run || run.faint !== inside) {
      run = { pts: [lineX[i - 1], lineY[i - 1]], faint: inside, from: lineS[i - 1] / total, to: t };
      runs.push(run);
    }
    run.pts.push(lineX[i], lineY[i]);
    run.to = t;
  }
  // Stipe width, device px: stout at the foot, thin at the growing tip.
  const stipe = (t: number) => Math.max(0.6 * px, 0.0042 * page * scale * (1 - 0.5 * t));
  for (const rn of runs) {
    const a = rn.faint ? 0.3 : 1;
    const m = rn.pts.length / 2;
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < m; i++) {
      const a0 = Math.max(0, i - 1);
      const a1 = Math.min(m - 1, i + 1);
      let tx = rn.pts[a1 * 2] - rn.pts[a0 * 2];
      let ty = rn.pts[a1 * 2 + 1] - rn.pts[a0 * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const t = rn.from + ((rn.to - rn.from) * i) / Math.max(1, m - 1);
      const hw = stipe(t) * 0.5;
      left.push(rn.pts[i * 2] - ty * hw, rn.pts[i * 2 + 1] + tx * hw);
      right.push(rn.pts[i * 2] + ty * hw, rn.pts[i * 2 + 1] - tx * hw);
    }
    const rib = new Path2D();
    rib.moveTo(left[0], left[1]);
    for (let i = 2; i < left.length; i += 2) rib.lineTo(left[i], left[i + 1]);
    for (let i = right.length - 2; i >= 0; i -= 2) rib.lineTo(right[i], right[i + 1]);
    rib.closePath();
    ctx.globalAlpha = a;
    ctx.fillStyle = ink.brown;
    ctx.fill(rib);
    ctx.globalAlpha = 1;
    const tip: [number, number] = [0, rn.to >= 1 - 1e-6 ? 0.15 : 0];
    if (big) {
      // Big, two pen edges, the one away from the light the heavier.
      inkLine(ctx, left, false, { width: 0.5 * px, color: ink.line, alpha: a * 0.85, taper: tip, seed, raw: true, light: pen.light, min: 0.2 * px });
      inkLine(ctx, right, false, { width: 0.9 * px, color: ink.line, alpha: a * 0.9, taper: tip, seed: seed + 1, raw: true, light: pen.light, min: 0.2 * px });
    } else {
      inkLine(ctx, rn.pts, false, {
        width: (far ? 0.5 : 0.7) * px,
        color: ink.line,
        alpha: a * 0.85,
        swell: 0.6,
        taper: tip,
        lost: 0,
        seed,
        raw: true,
        light: pen.light,
        min: 0.3 * px,
      });
    }
  }

  // Then those in front of it, and the canopy's.
  blades(true);
}

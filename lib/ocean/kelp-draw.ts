/**
 * The kelp forest, inked (see `kelp.ts`).
 *
 * Drawn as a natural-history plate draws a giant kelp: each stipe a long
 * winding line, washed and edged in the pen; each blade a long ruffled
 * frond that leaves the stipe on a little gas bladder and streams away
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
import { inkRock, rockShape, rockStyle, type RockShape } from './outcrop-sprite';
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
}

/**
 * The kelp forest at the edges of the sunlit water (see `kelp.ts`): the far
 * stalks, then the ledge, then the nearer stalks standing on it. Each stalk
 * sways on the slow clock, the sway travelling up it and growing toward the
 * top, and leans with the current; each blade flutters a little on its own.
 * `detail` is the governor's say: without it the blades lose their ruffle
 * and the rock its shading.
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
  const fade = 0.45 + 0.55 * water.light;
  const drain = (1 - water.light) * 0.45;
  const inksAt = (layer: number): Inks => {
    const into = (c: string) => {
      let v = mixHex(c, water.bottom, drain + HAZE[layer] * 0.6);
      if (water.dark) v = mixHex(v, water.bottom, 0.3);
      return v;
    };
    return {
      gold: into(GOLD),
      brown: into(BROWN),
      line: mixHex(pen.line, water.bottom, HAZE[layer] * 0.7),
      float: into(mixHex(GOLD, '#EAD9A6', 0.3)),
    };
  };
  const rocks = kelp.ledges.map((l) => ledgeRock(l, w, h, px));
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
    drawStalk(ctx, w, h, s, stalkAt(s), surface, inksAt(s.layer), ambient, current, px, ALPHA[s.layer] * fade, clear, detail, pen, page);
  for (const s of kelp.stalks) if (s.layer === 0) draw(s);
  kelp.ledges.forEach((l, i) => drawLedge(ctx, w, h, l, rocks[i], down, water, px, 0.92 * fade, detail));
  for (const s of kelp.stalks) if (s.layer > 0) draw(s);
  ctx.restore();
}

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
    const ch = Math.min(4096, Math.ceil(shape.height * 1.15 - Math.min(0, shape.minY) + pad * 2));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const c = canvas.getContext('2d');
    if (!c) return;
    const dir: 1 | -1 = ledge.edge < 0 ? 1 : -1;
    const oy = pad - Math.min(0, shape.minY);
    const x0 = dir > 0 ? pad : cw - pad;
    const zw = waterAt(zoneMid(0), water.dark ? 'night' : 'paper', '#A8BCC9');
    inkRock(c, shape, { x0, y0: oy, dir }, { ...rockStyle(zw, water.dark, px, d, ledge.seed), barnacles: true, fade: [0.78, 1.12] });
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

function drawStalk(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stalk: KelpStalk,
  foot: number,
  surface: number,
  ink: Inks,
  ambient: number,
  current: number,
  px: number,
  alpha: number,
  clear: Rect[] | undefined,
  detail: boolean,
  pen: Pen,
  page: number,
) {
  const len = stalk.height * h;
  // Only the part of the stalk that is on the page.
  if (foot - len > h * 1.06 || foot < -h * 0.3) return;
  const scale = KELP_SCALE[stalk.layer];
  const near = stalk.layer === 2;
  const far = stalk.layer === 0;
  // Its canopy lies along the surface into the page, away from its own wall.
  const inward = stalk.x < 0.5 ? 1 : -1;
  const x0 = stalk.x * w;
  const [wa, wf, wp] = stalk.wave;
  // Where it bends over at the surface, and how tight the bend is.
  const bendR = 0.05 * h;
  const rise = foot - (surface + bendR);
  const arc = (Math.PI / 2) * bendR;
  // The canopy lies a little way along the surface, never across the page.
  const reachOut = Math.min(len, rise < 0 ? len : rise + arc + (0.07 + 0.1 * ((stalk.phase * 7) % 1)) * w * (far ? 0.6 : 1));
  /** A point d device px up the stipe, and the way it is going. */
  const at = (dd: number) => {
    const d = dd / h;
    const give = Math.min(1, d / 1.1);
    // The stipe winds as it goes up, and the slow sway runs up it.
    const sway =
      (Math.sin(ambient * 0.42 + stalk.phase - d * 2.4) * 0.02 + Math.sin(ambient * 0.9 + stalk.phase * 1.7 - d * 5) * 0.006) * h * give;
    const wind = wa * h * Math.sin(d * wf + wp) * Math.min(1, d / 0.15);
    const lean = current * 0.04 * w * give * give;
    if (dd <= rise || rise < 0) {
      const x = x0 + sway + wind + lean;
      return { x, y: foot - dd };
    }
    // Over the bend and out along the surface, the winding dying away into it.
    const keep = Math.max(0, 1 - (dd - rise) / (bendR * 2));
    const bx = x0 + (sway + lean) + wind * keep;
    if (dd <= rise + arc) {
      const phi = (dd - rise) / bendR;
      return { x: bx + inward * bendR * (1 - Math.cos(phi)), y: surface + bendR - bendR * Math.sin(phi) };
    }
    const along = dd - rise - arc;
    return {
      x: bx + inward * (bendR + along),
      y: surface + Math.sin(ambient * 1.3 + along / (0.03 * h) + stalk.phase) * 0.004 * h + Math.min(1, along / (0.1 * h)) * 0.006 * h,
    };
  };
  const big = pen.d > 0.4 && !far;
  const inClear = (x: number, y: number) => {
    if (!clear) return false;
    const u = x / w;
    const v = y / h;
    return clear.some((r) => u > r.x && u < r.x + r.w && v > r.y && v < r.y + r.h);
  };

  // The stipe: a wash under one pen line that swells on its shadow side,
  // stout at the holdfast and running out at the tip. Like the blades, it
  // goes faint where it crosses what is written: each run of it is its own.
  const steps = Math.max(8, Math.ceil(reachOut / (3 * px)));
  const visible = (y: number) => y > -0.08 * h && y < h * 1.08;
  const runs: { pts: number[]; faint: boolean; from: number; to: number }[] = [];
  let run: { pts: number[]; faint: boolean; from: number; to: number } | null = null;
  let prev = at(0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = at(t * reachOut);
    if (!visible(p.y) && !visible(prev.y)) {
      run = null;
      prev = p;
      continue;
    }
    const inside = inClear((p.x + prev.x) / 2, (p.y + prev.y) / 2);
    if (!run || run.faint !== inside) {
      run = { pts: [prev.x, prev.y], faint: inside, from: (i - 1) / steps, to: t };
      runs.push(run);
    }
    run.pts.push(p.x, p.y);
    run.to = t;
    prev = p;
  }
  // Stipe width, device px: stout at the foot, thin at the growing tip.
  const stipe = (t: number) => Math.max(0.6 * px, 0.0042 * page * scale * (1 - 0.5 * t));
  for (const rn of runs) {
    const a = rn.faint ? alpha * 0.3 : alpha;
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
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = ink.brown;
    ctx.fill(rib);
    ctx.globalAlpha = 1;
    const seed = Math.floor(stalk.phase * 1000);
    const tip: [number, number] = [0, rn.to >= 1 - 1e-6 && reachOut >= len ? 0.15 : 0];
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

  // The holdfast, when the foot of the stalk is on the page: a low cone of
  // fine branching roots gripping the boulder's top, spreading over it.
  if (visible(foot)) {
    const fx = at(0).x;
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
      roots.bezierCurveTo(fx + dx * 0.3, sy + 1.5 * k * px, fx + dx * 0.75, foot - 1.5 * k * px, ex, ey);
      // Each root forks twice as it takes hold, the forks finer.
      for (const f of [0.55, 0.8]) {
        const ax = fx + dx * f;
        const ay = foot + (Math.abs(a) * f * 1.6 - 1.2) * k * px;
        const side = (i + (f > 0.6 ? 1 : 0)) % 2 ? 1 : -1;
        fine.moveTo(ax, ay);
        fine.quadraticCurveTo(ax + dx * 0.15 + side * 2 * k * px, ay + 1.2 * k * px, ax + dx * 0.22 + side * 3 * k * px, ay + (2.5 + i % 2) * k * px);
      }
    });
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ink.brown;
    ctx.lineWidth = 1.3 * k * px;
    ctx.stroke(roots);
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = Math.max(0.45 * px, 0.6 * k * px);
    ctx.globalAlpha = alpha * 0.9;
    ctx.stroke(roots);
    ctx.lineWidth = Math.max(0.35 * px, 0.4 * k * px);
    ctx.stroke(fine);
  }

  // The blades, each off its gas bladder, in two batches: plain, and faint
  // where they cross what is written on the page.
  const plain = new Path2D();
  const faint = new Path2D();
  const shadowPlain = new Path2D();
  const shadowFaint = new Path2D();
  const veins = new Path2D();
  const folds = new Path2D();
  const floats = new Path2D();
  const outlines: number[][] = [];
  let sx0 = Infinity;
  let sy0 = Infinity;
  let sx1 = -Infinity;
  let sy1 = -Infinity;
  const SEG = big ? 28 : detail ? 10 : 7;
  const edgeA: [number, number][] = [];
  const edgeB: [number, number][] = [];
  const mid: [number, number][] = [];
  // Measured against the page, a picture drawn a frame at a time has blades
  // bigger against its frame than the live screen's; it draws fewer of them.
  const ratio = page / h;
  const stride = ratio > 1.5 ? 2 * Math.floor(ratio / 2) + 1 : 1;
  const [lx, ly] = LIGHT;
  const flow = current >= 0 ? 1 : -1;
  for (let j = 0; j < stalk.blades.length; j++) {
    if (j % stride) continue;
    const b = stalk.blades[j];
    if (b.t * len > reachOut) continue;
    const p = at(b.t * len);
    const L = b.len * page;
    const W = b.width * page;
    if (p.y < -L * 1.2 || p.y > h + L * 0.7) continue;
    const q = at(Math.min(len, b.t * len + 2 * px));
    let ux = q.x - p.x;
    let uy = q.y - p.y;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    const canopy = p.y < surface + 0.06 * h;
    // Off the stipe at an angle, then taken by the current: streaming away
    // downstream and hanging as it goes. On the canopy they hang straight down.
    const flutter = Math.sin(ambient * 1.1 + stalk.phase + j * 1.3) * 0.08;
    const off = b.side * b.angle;
    let d0x = ux * Math.cos(off) - uy * Math.sin(off);
    let d0y = ux * Math.sin(off) + uy * Math.cos(off);
    const downstream = b.side * flow > 0 || canopy;
    if (canopy) {
      d0x = flow * 0.35 + d0x * 0.2;
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
    // Downstream of the stipe a blade streams out with the current; on the
    // upstream side it hangs down by the stipe, swung a little across.
    let dex = downstream ? flow * (1 - 0.35 * b.droop) + flutter : b.side * 0.22 + flow * 0.2 + flutter;
    let dey = downstream ? 0.1 + 0.45 * b.droop : 0.75 + 0.25 * b.droop;
    if (canopy) {
      dex *= 0.4;
      dey = 1;
    }
    const el = Math.hypot(dex, dey);
    dex /= el;
    dey /= el;
    // The bladder, an ellipse along the way the blade leaves.
    const fr = Math.max(1.1 * px, L * 0.06);
    const fx = p.x + d0x * fr * 0.9;
    const fy = p.y + d0y * fr * 0.9;
    floats.moveTo(fx + d0x * fr, fy + d0y * fr);
    floats.ellipse(fx, fy, fr, fr * 0.6, Math.atan2(d0y, d0x), 0, Math.PI * 2);
    const bx = fx + d0x * fr * 0.95;
    const by = fy + d0y * fr * 0.95;
    // The blade's line: a quadratic out along the first way and round into the second.
    const cx = bx + d0x * L * 0.35;
    const cy = by + d0y * L * 0.35;
    const ex = bx + d0x * L * 0.25 + dex * L * 0.82;
    const ey = by + d0y * L * 0.25 + dey * L * 0.82;
    edgeA.length = 0;
    edgeB.length = 0;
    mid.length = 0;
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
      // A strap: out quickly from the bladder, near enough even down its
      // length, then drawn in to a blunt point over its last third.
      const body = (W / 2) * Math.pow(Math.min(1, u / 0.14), 0.6) * (u > 0.66 ? Math.pow(Math.cos(((u - 0.66) / 0.34) * (Math.PI / 2)), 0.65) : 1) * (0.9 + 0.1 * Math.sin(u * 3));
      let ra = 0;
      let rb = 0;
      if (k > 0 && k < SEG) {
        if (big || detail) {
          // The ruffled margin: a quick frill riding a slower one, each edge its own.
          // Uneven: the frills bunch and spread along it, never a saw's teeth.
          const f = (u * L) / (0.01 * page);
          const g = f + 0.6 * Math.sin(f * 0.9 + b.ph);
          ra = (0.2 * Math.sin(g * 6.28 + b.ph) + 0.08 * Math.sin(f * 11.3 + b.ph * 1.7)) * body;
          rb = (0.17 * Math.sin(g * 5.1 + b.ph + 2.1) + 0.07 * Math.sin(f * 9.7 + b.ph)) * body;
        }
      }
      edgeA.push([mx + nx * (body + ra), my + ny * (body + ra)]);
      edgeB.push([mx - nx * (body + rb), my - ny * (body + rb)]);
      mid.push([mx, my]);
    }
    const isFaint = inClear(p.x, p.y);
    const path = isFaint ? faint : plain;
    // Which half faces away from the light: that half is the shadow.
    const [n0x, n0y] = [edgeA[SEG >> 1][0] - mid[SEG >> 1][0], edgeA[SEG >> 1][1] - mid[SEG >> 1][1]];
    const aDark = n0x * lx + n0y * ly > 0;
    const trace = (target: Path2D, edge: [number, number][], back: boolean) => {
      if (!back) {
        for (let k = 1; k <= SEG; k++) {
          const [ax, ay] = edge[k - 1];
          const [qx, qy] = edge[k];
          target.quadraticCurveTo(ax, ay, (ax + qx) / 2, (ay + qy) / 2);
        }
        target.lineTo(edge[SEG][0], edge[SEG][1]);
      } else {
        for (let k = SEG - 1; k >= 0; k--) {
          const [ax, ay] = edge[k + 1];
          const [qx, qy] = edge[k];
          target.quadraticCurveTo(ax, ay, (ax + qx) / 2, (ay + qy) / 2);
        }
      }
    };
    path.moveTo(bx, by);
    trace(path, edgeA, false);
    trace(path, edgeB, true);
    path.closePath();
    const sh = isFaint ? shadowFaint : shadowPlain;
    sh.moveTo(bx, by);
    trace(sh, aDark ? edgeA : edgeB, false);
    for (let k = SEG; k >= 0; k--) sh.lineTo(mid[k][0], mid[k][1]);
    sh.closePath();
    if (detail || big) {
      veins.moveTo(bx, by);
      for (let k = 1; k < SEG; k++) veins.lineTo(mid[k][0], mid[k][1]);
    }
    if (big && !isFaint) {
      for (const [x, y] of aDark ? edgeA : edgeB) {
        sx0 = Math.min(sx0, Math.max(0, x));
        sy0 = Math.min(sy0, Math.max(0, y));
        sx1 = Math.max(sx1, Math.min(w, x));
        sy1 = Math.max(sy1, Math.min(h, y));
      }
      // Puckered: here and there a short soft crease across it from near
      // the midrib, the way a giant kelp's blade is wrinkled, never a row.
      for (let k = 3; k < SEG - 3; k++) {
        const hsh = Math.sin(k * 12.9898 + j * 78.233 + b.ph) * 43758.5453;
        const v = hsh - Math.floor(hsh);
        if (v > 0.38) continue;
        const edge = v < 0.19 ? edgeA : edgeB;
        const [mx, my] = mid[k];
        const [qx, qy] = edge[Math.min(SEG, k + 1)];
        const f0 = 0.2 + v;
        folds.moveTo(mx + (qx - mx) * f0, my + (qy - my) * f0);
        folds.quadraticCurveTo(mx + (qx - mx) * (f0 + 0.25) + (mid[k + 1][0] - mx) * 0.3, my + (qy - my) * (f0 + 0.25) + (mid[k + 1][1] - my) * 0.3, mx + (qx - mx) * 0.85, my + (qy - my) * 0.85);
      }
      const o: number[] = [bx, by];
      for (const [x, y] of edgeA) o.push(x, y);
      for (let k = SEG - 1; k >= 1; k--) o.push(edgeB[k][0], edgeB[k][1]);
      outlines.push(o);
    }
  }
  for (const [path, shadow, k] of [
    [plain, shadowPlain, 1],
    [faint, shadowFaint, 0.3],
  ] as const) {
    // Gold where the light comes through, deeper on the half away from it.
    ctx.fillStyle = ink.gold;
    ctx.globalAlpha = alpha * 0.9 * k;
    ctx.fill(path);
    ctx.fillStyle = ink.brown;
    ctx.globalAlpha = alpha * 0.75 * k;
    ctx.fill(shadow);
    if (detail || big) {
      // The pigment pooled at the margin as the wash dried.
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = ink.brown;
      ctx.globalAlpha = alpha * 0.5 * k;
      ctx.lineWidth = 2 * px * scale;
      ctx.stroke(path);
      ctx.restore();
    }
  }
  // Big, a stipple in the shadow halves, thickest toward the margin.
  if (big && sx1 > sx0 && sy1 > sy0) {
    stipple(ctx, shadowPlain, { x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0 }, {
      spacing: 1.9 * px,
      radius: 0.36 * px,
      shade: () => 0.6,
      color: pen.dark ? mixHex(ink.brown, '#000000', 0.5) : ink.line,
      alpha: alpha * (pen.dark ? 0.6 : 0.45),
      seed: Math.floor(stalk.phase * 997),
    });
  }
  if (detail || big) {
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = (big ? 0.55 : 0.45) * px * scale;
    ctx.globalAlpha = alpha * 0.55;
    ctx.stroke(veins);
  }
  if (big) {
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = 0.4 * px;
    ctx.globalAlpha = alpha * 0.3;
    ctx.stroke(folds);
    ctx.globalAlpha = 1;
    outlines.forEach((o, i) =>
      inkLine(ctx, o, true, {
        width: 0.9 * px * scale,
        color: ink.line,
        alpha: alpha * 0.95,
        plate: true,
        seed: i + 3 + Math.floor(stalk.phase * 100),
        light: pen.light,
        min: 0.25 * px,
      }),
    );
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = 0.6 * px * scale;
    ctx.globalAlpha = alpha * 0.3;
    ctx.stroke(faint);
  } else {
    ctx.lineWidth = (far ? 0.5 : 0.75) * px * scale;
    ctx.strokeStyle = ink.line;
    ctx.globalAlpha = alpha * (far ? 0.6 : 0.85);
    ctx.stroke(plain);
    ctx.globalAlpha = alpha * 0.3;
    ctx.stroke(faint);
  }
  // The bladders: a little bead of gas, lit on top.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ink.float;
  ctx.fill(floats);
  ctx.strokeStyle = ink.line;
  ctx.lineWidth = (near ? 0.6 : 0.45) * px;
  ctx.globalAlpha = alpha * 0.85;
  ctx.stroke(floats);
}

/**
 * Painting the sea: the water, the light coming down into it, the snow
 * drifting up through it, the floor, and the animals in it.
 *
 * Everything here draws into a context the caller owns, in device pixels,
 * and reads time only from the arguments it is given.
 */

import { mixHex } from '../fan';
import type { Env } from './biome';
import type { Depth } from './depth';
import { KELP_ROCK, kelpDescent, kelpInView, type Kelp, type KelpLedge, type KelpStalk } from './kelp';
import { IRON_GALL, kelpInk, type KelpInk, type Water } from './palette';
import { detailFor, grain, hatch, inkLine, LIGHT, mottle, shadeAcross, smooth, smoothPath, stipple, washFill } from './pen';
import { hash32, mulberry32 } from './random';
import type { Visitor } from './schedule';
import type { Sprite } from './sprites';

/** The water itself: a wash, lighter above. */
export function drawWater(ctx: CanvasRenderingContext2D, w: number, h: number, water: Water) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, water.top);
  g.addColorStop(1, water.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A scratch canvas, or null where there is no document. */
function scratch(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** One shaft: where it enters at the top, how it leans and widens, and how bright it is. */
interface Ray {
  x: number;
  top: number;
  bottom: number;
  reach: number;
  lean: number;
  bright: number;
}

/** The shafts' layers are drawn at a quarter of the canvas's size: they are soft, and that is a sixteenth of the pixels. */
const SHAFT_SCALE = 1 / 4;

interface ShaftSet {
  key: string;
  rays: Ray[];
  sheet: HTMLCanvasElement;
  sh: number;
}

let shaftSets: ShaftSet[] = [];

/** What the last shafts drawn were, so the snow drawn after them can catch their light. */
let shaftsNow: { w: number; h: number; rays: Ray[]; sway: number; skew: number; alpha: number } | null = null;

/**
 * The shafts for a sitting at a size: in sheaves, as many as the sitting
 * rolled, each a broad soft ray with thinner ones about it, uneven in width
 * and brightness and broken along their length. Painted once, into one
 * soft sheet at a quarter of the size.
 */
function shaftSet(w: number, h: number, env: Env): ShaftSet | null {
  const key = `${w}|${h}|${env.shafts}|${env.shaftTilt}`;
  const hit = shaftSets.find((s) => s.key === key);
  if (hit) return hit;
  const rays: Ray[] = [];
  for (let i = 0; i < env.shafts; i++) {
    const r = mulberry32(hash32('shaft', i, env.shafts));
    const cx = w * ((i + 0.3 + r() * 0.4) / env.shafts);
    const strands = 3 + Math.floor(r() * 3);
    for (let k = 0; k < strands; k++) {
      const main = k === 0;
      const top = (main ? 18 + r() * 40 : 3 + r() * 12) * (w / 1000);
      const reach = h * (main ? 0.55 + r() * 0.4 : 0.35 + r() * 0.55);
      rays.push({
        x: cx + (main ? 0 : (r() - 0.5) * w * 0.12),
        top,
        bottom: top * (main ? 2.6 + r() * 1.6 : 2 + r() * 2.5),
        reach,
        lean: env.shaftTilt + (r() - 0.5) * 0.06,
        bright: main ? 0.7 + 0.3 * r() : 0.35 + 0.65 * r() * r(),
      });
    }
  }
  const q = SHAFT_SCALE;
  const reachMax = rays.reduce((m, ray) => Math.max(m, ray.reach), 0);
  const sh = Math.min(h, reachMax);
  const sheet = scratch(w * q, sh * q);
  const g = sheet?.getContext('2d');
  if (!sheet || !g) return null;
  {
    g.scale(q, q);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i];
      const r = mulberry32(hash32('shaft-strand', i, env.shafts));
      const lean = ray.lean * ray.reach;
      const grad = g.createLinearGradient(0, 0, 0, ray.reach);
      // Uneven down its length: it thins and gathers again before it goes.
      const stops = [0, 0.15 + r() * 0.15, 0.4 + r() * 0.2, 0.7 + r() * 0.1, 1];
      const level = [1, 0.6 + 0.4 * r(), 0.35 + 0.45 * r(), 0.15 + 0.15 * r(), 0];
      for (let s = 0; s < stops.length; s++) grad.addColorStop(stops[s], `rgba(255, 252, 240, ${(0.14 * ray.bright * level[s]).toFixed(4)})`);
      g.fillStyle = grad;
      // Nested, so the ray is soft across as well as along.
      for (const k of [1.6, 1, 0.5]) {
        g.globalAlpha = k > 1 ? 0.35 : 0.45;
        g.beginPath();
        g.moveTo(ray.x - (ray.top * k) / 2, 0);
        g.lineTo(ray.x + (ray.top * k) / 2, 0);
        g.lineTo(ray.x + lean + (ray.bottom * k) / 2, ray.reach);
        g.lineTo(ray.x + lean - (ray.bottom * k) / 2, ray.reach);
        g.closePath();
        g.fill();
      }
    }
  }
  const set: ShaftSet = { key, rays, sheet, sh };
  shaftSets = [set, ...shaftSets].slice(0, 2);
  return set;
}

/**
 * Light coming down from the surface in slanting shafts, swaying a little.
 * Only in the sunlit water; they thin out and are gone by the twilight.
 * The shafts are painted once for the sitting and the size; a frame places
 * them, swaying (the foot further than the top, as the surface rocks) and
 * breathing, and notes where they are so the snow drawn next can catch the
 * light.
 */
export function drawShafts(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  env: Env,
  water: Water,
  ambient: number,
) {
  shaftsNow = null;
  if (water.light <= 0.02) return;
  const set = shaftSet(w, h, env);
  if (!set) return;
  const sway = Math.sin(ambient / 9) * w * 0.01;
  const skew = Math.sin(ambient / 7.3 + 2.1) * 0.018;
  // Pale water has little room above it for light to show in, so the
  // shafts are laid on heavier there.
  const top = parseInt(water.top.replace('#', '').slice(0, 6), 16);
  const lum = Number.isFinite(top) ? (0.3 * ((top >> 16) & 255) + 0.59 * ((top >> 8) & 255) + 0.11 * (top & 255)) / 255 : 0.5;
  const k = water.light * (0.75 + 1.2 * lum * lum);
  const alpha = k * (0.85 + 0.1 * Math.sin(ambient * 0.31) + 0.05 * Math.sin(ambient * 0.83 + 1.7));
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.transform(1, 0, skew, 1, sway, 0);
  ctx.drawImage(set.sheet, 0, 0, w, set.sh);
  ctx.restore();
  shaftsNow = { w, h, rays: set.rays, sway, skew, alpha };
}

/** How much shaft light there is at a point, 0 to about 1, from the shafts drawn last at this size. */
function shaftLight(w: number, h: number, x: number, y: number): number {
  const s = shaftsNow;
  if (!s || s.w !== w || s.h !== h) return 0;
  let lit = 0;
  for (const ray of s.rays) {
    if (y < 0 || y > ray.reach) continue;
    const t = y / ray.reach;
    const cx = ray.x + ray.lean * y + s.sway + s.skew * y;
    const half = (ray.top + (ray.bottom - ray.top) * t) * 0.6;
    const d = Math.abs(x - cx);
    if (d < half) lit += ray.bright * (1 - d / half) * (1 - t) * s.alpha;
  }
  return Math.min(1, lit);
}

export interface Speck {
  x: number;
  y: number;
  s: number;
  o: number;
  v: number;
}

export function rollSnow(key: string, n: number): Speck[] {
  const r = mulberry32(hash32(key, 'snow'));
  return Array.from({ length: n }, () => ({ x: r(), y: r(), s: 1 + r() * 1.8, o: 0.12 + r() * 0.35, v: 0.5 + r() * 0.9 }));
}

/** A soft disc of snow out of focus, made once a colour: the near tier is placed, not drawn. */
const blurs = new Map<string, HTMLCanvasElement | null>();

function blurDisc(color: string): HTMLCanvasElement | null {
  if (blurs.has(color)) return blurs.get(color) ?? null;
  const size = 64;
  const c = scratch(size, size);
  const g = c?.getContext('2d');
  if (c && g) {
    const n = parseInt(color.replace('#', '').slice(0, 6), 16);
    const rgb = Number.isFinite(n) ? `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}` : '255, 255, 255';
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb}, 0.75)`);
    grad.addColorStop(0.7, `rgba(${rgb}, 0.9)`);
    grad.addColorStop(0.86, `rgba(${rgb}, 1)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  blurs.set(color, c);
  return c;
}

/**
 * Marine snow: specks drifting slowly up, and a little along with the
 * current. They never stop entirely, even on a break; a paused clock holds
 * them, since `ambient` stands still with it.
 *
 * Three distances, by a speck's size: the smallest are far, fine and faint;
 * the middle are crisp; the largest are near, soft discs out of focus. A
 * speck in a shaft of light catches it and comes up brighter.
 */
export function drawSnow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  specks: Speck[],
  color: string,
  ambient: number,
  current: number,
  px: number,
  scale = 1,
) {
  ctx.fillStyle = color;
  const disc = blurDisc(color);
  for (const s of specks) {
    const rise = (s.y - ambient * 0.004 * s.v) % 1;
    const y = (rise < 0 ? rise + 1 : rise) * h;
    const drift = (s.x + ambient * 0.0015 * s.v * current) % 1;
    const x = (drift < 0 ? drift + 1 : drift) * w + Math.sin(ambient / 5 + s.x * 20) * 4 * px;
    const edge = Math.min(1, (y / h) * 6, ((h - y) / h) * 6);
    const caught = 1 + 1.8 * shaftLight(w, h, x, y);
    const rad = s.s * px * 0.5 * scale;
    if (s.s > 2.55 && disc) {
      // Near: big and soft, as the eye would see it.
      const big = rad * 3.6;
      ctx.globalAlpha = Math.min(1, s.o * 0.32 * edge * caught);
      ctx.drawImage(disc, x - big, y - big, big * 2, big * 2);
      continue;
    }
    const far = s.s < 1.55;
    ctx.globalAlpha = Math.min(1, s.o * edge * caught * (far ? 0.6 : 1));
    ctx.beginPath();
    ctx.arc(x, y, far ? rad * 0.6 : rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Where the floor's silt line sits, in device pixels: rising into view over
    the first minutes of the abyss, then staying. Below the page before then. */
export function floorLine(depth: Depth, focusSeconds: number, h: number): number {
  if (depth.zone < 3) return h * 1.04;
  const into = depth.zone === 3 ? Math.min(1, (focusSeconds / 60 - 110) / 6) : 1;
  const ease = 1 - (1 - into) * (1 - into);
  return h * (1.04 - 0.1 * ease);
}

/** The floor's front edge, relative to its line, as flat [x, y] points: the same low swell every frame. */
function floorEdge(w: number, env: Env, px: number): number[] {
  const r = mulberry32(hash32('floor-edge', env.shafts, env.shaftTilt));
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const pts: number[] = [];
  for (let i = 0; i <= 32; i++) {
    const u = i / 32;
    // A long low swell, a smaller roll on it, and the lumps of the silt.
    const y = Math.sin(u * 4.1 + ph[0]) * 7 * px + Math.sin(u * 11.3 + ph[1]) * 2.5 * px + Math.sin(u * 29 + ph[2]) * 1 * px + (r() - 0.5) * 1.6 * px;
    pts.push(u * w, y);
  }
  return smooth(pts, false, 5);
}

/** The floor's edge at x, relative to its line. */
function floorEdgeAt(edge: number[], w: number, x: number): number {
  const n = edge.length / 2;
  const i = Math.max(0, Math.min(n - 1, Math.round((x / w) * (n - 1))));
  return edge[i * 2 + 1];
}

/* ---- Vents ---- */

/** A vent's chimney: its outline, where its mouth is, and its ledges. */
interface VentShape {
  outline: number[];
  /** The mouth, relative to the foot: x, y and its half width. */
  mx: number;
  my: number;
  mr: number;
  /** Where the stacked pieces meet, as [y, half width] up the chimney. */
  joins: [number, number, number][];
  height: number;
}

/**
 * A chimney `wid` wide at its foot, rolled from `seed`: three to five
 * pieces stacked a little crooked, each narrower than the one below, some
 * with a lip where one was laid down on the next, and a flared foot in the
 * silt. Relative to the middle of its foot.
 */
function ventShape(wid: number, seed: number, maxHeight: number): VentShape {
  const r = mulberry32(hash32('vent', seed));
  const n = 3 + Math.floor(r() * 3);
  const height = Math.min(maxHeight, wid * (3.4 + r() * 2.2));
  const cuts: number[] = [0];
  for (let i = 1; i < n; i++) cuts.push(cuts[i - 1] + (0.6 + r() * 0.8));
  const total = cuts[n - 1] + 0.6 + r() * 0.8;
  const left: number[] = [];
  const right: number[] = [];
  const joins: [number, number, number][] = [];
  let lean = 0;
  // The foot, spread into the silt.
  left.push(-wid * (0.95 + r() * 0.2), wid * 0.06);
  right.push(wid * (0.95 + r() * 0.2), wid * 0.06);
  left.push(-wid * 0.62, -height * 0.04);
  right.push(wid * 0.6, -height * 0.05);
  for (let i = 0; i < n; i++) {
    const y0 = -height * (cuts[i] / total);
    const y1 = -height * ((i + 1 < n ? cuts[i + 1] : total) / total);
    const hw0 = (wid / 2) * (1 - 0.13 * i) * (0.92 + r() * 0.16);
    const hw1 = hw0 * (0.82 + r() * 0.12);
    lean += (r() - 0.5) * wid * 0.16;
    const lip = i > 0 && r() < 0.6;
    if (lip) {
      // A lip: the edge of the piece below, standing proud of this one.
      left.push(lean - hw0 * 1.22, y0 + wid * 0.04, lean - hw0 * 1.18, y0 - wid * 0.08);
      right.push(lean + hw0 * 1.2, y0 + wid * 0.03, lean + hw0 * 1.16, y0 - wid * 0.07);
    }
    joins.push([y0, lean, hw0 * (lip ? 1.2 : 1)]);
    // Lumps up each side of the piece: mineral grows where it will.
    for (const t of [0.25, 0.55, 0.85]) {
      const y = y0 + (y1 - y0) * (t + (r() - 0.5) * 0.12);
      const hw = (hw0 + (hw1 - hw0) * t) * (0.85 + r() * 0.35);
      left.push(lean - hw * (0.85 + r() * 0.3), y);
      right.push(lean + hw * (0.85 + r() * 0.3), y);
    }
    if (i === n - 1) {
      left.push(lean - hw1, y1);
      right.push(lean + hw1, y1);
    }
  }
  const top = left.length - 2;
  const mx = (left[top] + right[top]) / 2;
  const my = left[top + 1];
  const mr = (right[top] - left[top]) / 2;
  const outline = left.slice();
  for (let i = right.length - 2; i >= 0; i -= 2) outline.push(right[i], right[i + 1]);
  return { outline, mx, my, mr, joins, height };
}

/** The vents' colours: a dark mineral wash, never black, under the one ink. */
const VENT_WASH = '#2E2B29';

/**
 * A hydrothermal vent's chimney standing on the floor at (x, y), its foot
 * `wid` wide: a mineral wash with an ink outline, banded where its pieces
 * meet, shaded in contour lines on the side away from the light, the mouth
 * open at its top. The still part of a vent; `drawPlume` is its breath.
 */
export function drawChimney(ctx: CanvasRenderingContext2D, x: number, y: number, wid: number, px: number, seed: number, dark: boolean, maxHeight = Infinity): VentShape {
  const v = ventShape(wid, seed, maxHeight);
  const pts: number[] = [];
  for (let i = 0; i < v.outline.length; i += 2) pts.push(x + v.outline[i], y + v.outline[i + 1]);
  const path = smoothPath(pts, true, 4);
  const box = { x: x - wid, y: y - v.height, w: wid * 2, h: v.height };
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  const light: [number, number] = dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT;
  const d = detailFor(wid * 6);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  washFill(ctx, path, box, { color: dark ? VENT_WASH : mixHex(VENT_WASH, '#8C8576', 0.25), edge: 0.45, paper: null, granulate: 0.5, px });
  // Shaded down its length on the side away from the light, crossed where
  // it is darkest: a column, engraved.
  const across = shadeAcross(box, light);
  hatch(ctx, path, box, {
    spacing: Math.max(1.4 * px, wid * 0.085),
    angle: Math.PI / 2 - 0.08,
    bow: 0.4,
    shade: across,
    from: 0.48,
    cross: d > 0.4 ? 0.8 : undefined,
    color: ink,
    width: Math.max(0.4 * px, wid * 0.03),
    alpha: dark ? 0.5 : 0.6,
    seed: seed ^ 0x7e47,
  });
  if (d > 0.3) {
    stipple(ctx, path, box, {
      spacing: Math.max(1.3 * px, wid * 0.05),
      radius: Math.max(0.3 * px, wid * 0.01),
      shade: across,
      from: 0.3,
      color: ink,
      alpha: 0.35,
      seed: seed ^ 0x5701,
    });
  }
  // The joins between pieces, each a short line round the front.
  for (const [jy, jx, hw] of v.joins.slice(1)) {
    const seam: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = -1 + (i / 6) * 2;
      seam.push(x + jx + u * hw * 0.95, y + jy + Math.sqrt(1 - u * u * 0.9) * wid * 0.06);
    }
    inkLine(ctx, seam, false, { width: Math.max(0.5 * px, wid * 0.04), color: ink, alpha: 0.55, taper: [0.2, 0.2], seed: hash32(seed, jy), light, plate: true });
  }
  inkLine(ctx, pts, true, { width: Math.max(0.7 * px, wid * 0.06), color: ink, alpha: 0.8, seed, light, min: 0.3 * px, plate: true });
  // The mouth: the dark of the bore, seen a little from above.
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = mixHex(VENT_WASH, '#0B0A09', 0.55);
  ctx.beginPath();
  ctx.ellipse(x + v.mx, y + v.my, v.mr * 0.8, v.mr * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const rim: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rim.push(x + v.mx + Math.cos(a) * v.mr * 0.82, y + v.my + Math.sin(a) * v.mr * 0.3);
  }
  inkLine(ctx, rim, true, { width: Math.max(0.5 * px, wid * 0.04), color: ink, alpha: 0.7, seed: seed ^ 0x3, light, plate: true });
  ctx.restore();
  return v;
}

/**
 * A vent's breath: warm water shimmering up off its mouth at (x, y),
 * billowing out as it rises and leaning with the current, soft and faint
 * (about a fifth, at its thickest), on the slow clock.
 */
export function drawPlume(ctx: CanvasRenderingContext2D, x: number, y: number, wid: number, px: number, ambient: number, seed: number, dark: boolean, lean = 1): void {
  const r = mulberry32(hash32('plume', seed));
  const tall = wid * (7 + r() * 4);
  const dot = softDot(dark ? '200, 196, 186' : '120, 116, 108');
  const n = 14;
  const rate = 0.05 + r() * 0.03;
  const ph = r() * 6.28;
  ctx.save();
  const base = ctx.globalAlpha;
  for (let k = 0; k < n; k++) {
    const t = ((k / n + ambient * rate) % 1 + 1) % 1;
    const rise = t * tall;
    const bx = x + lean * t * t * wid * 2.2 + Math.sin(ambient * 0.4 + k * 1.7 + ph) * wid * 0.25 * t;
    const by = y - rise;
    const rad = wid * (0.35 + t * 1.7);
    // In from nothing at the mouth, out to nothing at the top.
    const a = 0.2 * Math.min(1, t * 6) * (1 - t) * (1 - t) * 0.55;
    if (a <= 0.003) continue;
    ctx.globalAlpha = base * a;
    if (dot) ctx.drawImage(dot, bx - rad * 1.6, by - rad * 1.6, rad * 3.2, rad * 3.2);
  }
  ctx.restore();
}

/** Where a sitting's vents stand on the floor, and how wide each is, as shares of the page. */
function ventsOf(env: Env, w: number): { x: number; wid: number; seed: number }[] {
  if (!env.vents) return [];
  return [0, 1].map((v) => {
    const seed = hash32('floor-vent', v, env.shafts, env.shaftTilt);
    const r = mulberry32(seed);
    return { x: w * (0.22 + v * 0.55), wid: w * (0.012 + 0.008 * r()), seed };
  });
}

interface FloorSprite {
  key: string;
  rgb: [number, number, number];
  canvas: HTMLCanvasElement;
  /** How far above the floor's line the sprite starts. */
  top: number;
  /** The vents' mouths: x, and how far below the floor's line. */
  mouths: { x: number; dy: number; wid: number; seed: number }[];
}

let floorSprites: FloorSprite[] = [];

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

/**
 * The floor, drawn once for the sitting, the size and (near enough) the
 * water's colour: a far bank fading into the water behind, then the near
 * floor under a pen line, ribbed with low silt ripples, stippled more
 * densely toward the viewer, with stones lying about, small far back and
 * larger near, each with its shadow and its line.
 */
function floorSprite(w: number, h: number, env: Env, water: Water, px: number): FloorSprite | null {
  const rgb = rgbOf(water.bottom);
  const key = `${w}|${h}|${px}|${env.shafts}|${env.shaftTilt}|${env.vents ? 1 : 0}`;
  const hit = floorSprites.find((s) => s.key === key && s.rgb.every((v, i) => Math.abs(v - rgb[i]) <= 4));
  if (hit) return hit;
  const top = h * 0.05 + 30 * px;
  const depth = h * 0.12;
  const c = scratch(w, top + depth);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  const r = mulberry32(hash32('floor', env.shafts, env.shaftTilt));
  const ground = mixHex(water.bottom, '#000000', 0.35);
  const silt = mixHex(water.bottom, '#FFFFFF', 0.24);
  const ink = IRON_GALL.dark;
  const edge = floorEdge(w, env, px);
  const yAt = (x: number) => top + floorEdgeAt(edge, w, x);
  const mouths: FloorSprite['mouths'] = [];
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // The far bank, seen through the water: nearer the water's colour than
  // the ground's, and fading up into it, with only a ghost of a line.
  const ph = [r() * 6.28, r() * 6.28];
  const bank: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * w;
    bank.push(x, top - h * 0.022 + Math.sin((x / w) * 7.1 + ph[0]) * h * 0.006 + Math.sin((x / w) * 17.3 + ph[1]) * h * 0.0025);
  }
  const bankPath = new Path2D();
  const bs = smooth(bank, false, 4);
  bankPath.moveTo(bs[0], bs[1]);
  for (let i = 2; i < bs.length; i += 2) bankPath.lineTo(bs[i], bs[i + 1]);
  bankPath.lineTo(w, top + depth);
  bankPath.lineTo(0, top + depth);
  bankPath.closePath();
  const haze = g.createLinearGradient(0, top - h * 0.034, 0, top);
  const far = mixHex(ground, water.bottom, 0.6);
  haze.addColorStop(0, `${far}00`);
  haze.addColorStop(0.45, `${far}CC`);
  haze.addColorStop(1, far);
  g.fillStyle = haze;
  g.fill(bankPath);
  inkLine(g, bs, false, { width: 0.8 * px, color: ink, alpha: 0.16, raw: true, lost: 0.6, seed: 3, min: 0.3 * px });

  // The near floor: lit a little along its top, darker into the foreground.
  const near = new Path2D();
  near.moveTo(edge[0], top + edge[1]);
  for (let i = 2; i < edge.length; i += 2) near.lineTo(edge[i], top + edge[i + 1]);
  near.lineTo(w, top + depth);
  near.lineTo(0, top + depth);
  near.closePath();
  const body = g.createLinearGradient(0, top - 16 * px, 0, top + depth);
  body.addColorStop(0, mixHex(ground, silt, 0.22));
  body.addColorStop(0.35, ground);
  body.addColorStop(1, mixHex(ground, '#000000', 0.2));
  g.fillStyle = body;
  g.fill(near);
  g.save();
  g.clip(near);

  // Silt ripples: low ribs lying along the floor, further apart as they
  // come nearer, each drawn in broken strokes.
  for (let k = 1; k <= 9; k++) {
    const off = Math.pow(k, 1.45) * 4 * px;
    const f = (0.012 + r() * 0.01) / px;
    const p = r() * 6.28;
    const rib = new Path2D();
    let on = false;
    for (let x = 0; x <= w; x += 4 * px) {
      const draw = Math.sin(x * 0.004 / px + k * 2.3 + p) > -0.2;
      const y = yAt(x) + off + Math.sin(x * f + p) * 1.6 * px * (1 + k * 0.15);
      if (draw && !on) rib.moveTo(x, y);
      else if (draw) rib.lineTo(x, y);
      on = draw;
    }
    g.strokeStyle = silt;
    g.globalAlpha = 0.1 + 0.12 * (k / 9);
    g.lineWidth = 0.8 * px;
    g.stroke(rib);
  }
  g.globalAlpha = 1;

  // Stipple: silt grains, sparse, about one to every 600 square px, and
  // gathered toward the lit edge along the top; never a static of dots.
  // (Its own roll, and the floor's roll stepped on as the old, thick
  // stipple stepped it, so the stones still lie where they always have.)
  const dots = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = Math.round((w * depth) / (px * px * 22)); i > 0; i--) {
    r();
    const t = Math.pow(r(), 0.7);
    if (r() > 0.25 + 0.75 * t) continue;
    r();
    r();
  }
  const sr = mulberry32(hash32('floor-silt', env.shafts, env.shaftTilt));
  const count = Math.round((w * depth) / (px * px * 600));
  for (let i = 0; i < count; i++) {
    const x = sr() * w;
    const t = Math.pow(sr(), 1.8);
    const y = yAt(x) + 1 * px + t * depth;
    const rad = (0.35 + 0.45 * sr()) * px * (0.8 + 0.4 * t);
    const d = dots[Math.min(2, Math.floor(sr() * 3))];
    d.moveTo(x + rad, y);
    d.arc(x, y, rad, 0, Math.PI * 2);
  }
  g.fillStyle = silt;
  dots.forEach((d, i) => {
    g.globalAlpha = 0.14 + i * 0.1;
    g.fill(d);
  });
  g.globalAlpha = 1;
  g.restore();

  // The edge, in the pen.
  inkLine(g, edge.map((v, i) => (i % 2 ? v + top : v)), false, { width: 1.3 * px, color: ink, alpha: 0.62, raw: true, lost: 0.3, taper: [0.02, 0.02], seed: 11, min: 0.4 * px });

  // Stones: small ones far back on the floor, larger near.
  const stones = 7 + Math.floor(r() * 6);
  for (let i = 0; i < stones; i++) {
    const x = r() * w;
    const t = Math.pow(r(), 1.3);
    const y = yAt(x) + 3 * px + t * depth * 0.8;
    const rx = (3 + 10 * t) * px * (0.7 + 0.6 * r());
    const ry = rx * (0.45 + 0.2 * r());
    const pts: number[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const j = 0.82 + 0.3 * r();
      // Flat underneath, where it sits in the silt.
      pts.push(x + Math.cos(a) * rx * j, y + Math.min(Math.sin(a) * ry * j, ry * 0.35));
    }
    const stone = smoothPath(pts, true, 4);
    g.fillStyle = '#000000';
    g.globalAlpha = 0.35;
    g.beginPath();
    g.ellipse(x + rx * 0.25, y + ry * 0.45, rx * 1.05, ry * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    const fill = g.createLinearGradient(0, y - ry, 0, y + ry * 0.4);
    fill.addColorStop(0, mixHex(ground, silt, 0.45));
    fill.addColorStop(1, mixHex(ground, '#000000', 0.15));
    g.fillStyle = fill;
    g.fill(stone);
    inkLine(g, pts, true, { width: 0.9 * px, color: ink, alpha: 0.55, lost: 0.5, seed: hash32('stone', i), min: 0.3 * px });
  }
  // The vents' chimneys, if the sitting rolled them: still, so drawn once.
  for (const v of ventsOf(env, w)) {
    const foot = yAt(v.x) + 2 * px;
    const shape = drawChimney(g, v.x, foot, v.wid, px, v.seed, true, top * 0.85);
    mouths.push({ x: v.x + shape.mx, dy: foot - top + shape.my, wid: v.wid, seed: v.seed });
  }
  const sprite: FloorSprite = { key, rgb, canvas: c, top, mouths };
  floorSprites = [sprite, ...floorSprites].slice(0, 2);
  return sprite;
}

/**
 * The floor, once the abyss is reached: it rises into view over the first
 * minutes of the zone and then stays. A far bank fades back into the water,
 * the near floor has a pen line along its edge, silt ripples and stipple,
 * and stones lying about; vents here and there breathe a little. All but the
 * breath is drawn once and placed.
 */
export function drawFloor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  depth: Depth,
  env: Env,
  water: Water,
  focusSeconds: number,
  ambient: number,
  px: number,
) {
  if (depth.zone < 3) return;
  const base = floorLine(depth, focusSeconds, h);
  const sprite = floorSprite(w, h, env, water, px);
  ctx.save();
  if (sprite) {
    ctx.drawImage(sprite.canvas, 0, Math.round(base - sprite.top));
    // Below the sprite, should a tall page show more floor than it holds.
    const under = base - sprite.top + sprite.canvas.height;
    if (under < h) {
      ctx.fillStyle = mixHex(mixHex(water.bottom, '#000000', 0.35), '#000000', 0.2);
      ctx.fillRect(0, under - 1, w, h - under + 1);
    }
  }
  if (sprite) {
    // Only the vents' breath moves.
    for (const m of sprite.mouths) drawPlume(ctx, m.x, Math.round(base - sprite.top) + sprite.top + m.dy, m.wid, px, ambient, m.seed, true, env.current);
  }
  ctx.restore();
}

/**
 * One animal, placed. Swimmers are drawn in vertical strips, each nudged by
 * a wave that grows toward the tail, which is a fish swimming for the price
 * of a few image copies. Bells squeeze with their beat, rays flap, and
 * everything bobs a little. A visitor heading left is the sprite mirrored.
 */
export function drawVisitor(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  v: Visitor,
  px: number,
  ambient: number,
  alpha: number,
  strips: number,
) {
  const g = v.species.genome;
  const bob = Math.sin(ambient * 0.7 + v.phase) * v.len * 0.04 * px;
  if (g.lit) {
    // Its lights, in its own rhythm: a flash that dies away, then the wait.
    const b = ((ambient / v.species.blink + v.phase / (Math.PI * 2)) % 1 + 1) % 1;
    alpha *= 0.62 + 0.38 * Math.exp(-b * 7);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(v.x * px, v.y * px + bob);
  const w = sprite.w;
  const h = sprite.h;
  if (g.radial) {
    // A bell's beat: narrower and taller on the squeeze.
    const beat = Math.max(0, Math.sin(ambient * 1.5 + v.phase));
    const sx = g.plan === 'bell' ? 1 - 0.05 * beat : 1;
    const sy = g.plan === 'bell' ? 1 + 0.04 * beat : 1;
    const tilt = g.plan === 'chain' ? Math.sin(ambient * 0.4 + v.phase) * 0.06 : 0;
    ctx.rotate(tilt);
    ctx.scale(sx, sy);
    ctx.drawImage(sprite.canvas, -w / 2, -h / 2);
  } else {
    ctx.scale(v.face ?? v.dir, 1);
    if (g.plan === 'ray') {
      const flap = 1 + 0.1 * Math.sin(ambient * 2 + v.phase);
      ctx.scale(1, flap);
      ctx.drawImage(sprite.canvas, -w / 2, -h / 2);
    } else if (strips > 1 && !v.species.floor) {
      const n = g.plan === 'eel' ? strips * 2 : strips;
      const sw = w / n;
      const amp = v.len * (g.plan === 'eel' ? 0.07 : 0.035) * px;
      const speed = 3 + 2 * v.species.speed;
      // The wave's offset at each join between strips. Boundary 0 is the
      // tail end, since every sprite faces right.
      const offAt = (b: number) => {
        const tail = 1 - b / n;
        return Math.sin(ambient * speed + v.phase - b * 0.9) * amp * tail * tail;
      };
      // Each strip is sheared, not shifted: its left edge sits at one join's
      // offset and its right edge at the next one's, so neighbouring strips
      // meet exactly and the body bends instead of breaking into stepped
      // segments with daylight between them. Each is clipped to its own
      // column (sheared with it), so no pixel is drawn twice and a
      // see-through body shows no seams. The joins are put on whole device
      // pixels, so the clips meet without an antialiased edge between them;
      // where the page is turned and they cannot be, the clip alone bleeds
      // a fraction of a pixel to close the join.
      const m = ctx.getTransform();
      const square = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && Math.abs(m.a) > 1e-9;
      const join = (i: number) => {
        const x = -w / 2 + i * sw;
        if (i === 0 || i === n || !square) return x;
        return (Math.round(m.a * x + m.e) - m.e) / m.a;
      };
      const bleed = square ? 0 : 0.3;
      let prev = offAt(0);
      let xa = join(0);
      for (let i = 0; i < n; i++) {
        const next = offAt(i + 1);
        const xb = join(i + 1);
        const lo = Math.min(xa, xb);
        const hi = Math.max(xa, xb);
        const k = (next - prev) / (xb - xa || 1);
        const sx = Math.max(0, Math.floor(lo + w / 2) - 1);
        const span = Math.min(w, Math.ceil(hi + w / 2) + 1) - sx;
        ctx.save();
        ctx.transform(1, k, 0, 1, 0, prev - xa * k);
        ctx.beginPath();
        ctx.rect(lo - (i > 0 ? bleed : 0), -h / 2 - 1, hi - lo + (i > 0 ? bleed : 0), h + 2);
        ctx.clip();
        ctx.drawImage(sprite.canvas, sx, 0, span, h, -w / 2 + sx, -h / 2, span, h);
        ctx.restore();
        prev = next;
        xa = xb;
      }
    } else {
      ctx.drawImage(sprite.canvas, -w / 2, -h / 2);
    }
  }
  ctx.restore();
}

/** Where the surface is, as a share of the page's height: near the top at
    the start, and gone up out of view after a minute and a half. */
export function surfaceAt(focusSeconds: number): number {
  const t = Math.max(0, Math.min(1, focusSeconds / 90));
  return 0.08 - 0.3 * t * t * (3 - 2 * t);
}

/**
 * The surface from below, for the first minute and a half, as it looks
 * looking up: overhead the sky comes through in a bright soft window (Snell's
 * window, seen edge-on as an oval lying along the surface), its rim a bright
 * line that ripples and breaks; to either side the underside of the surface
 * is a dimmer mirror. It rises out of view as the sitting goes under. After
 * that the only way to know the surface is there is the light.
 */
export function drawSurface(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  focusSeconds: number,
  ambient: number,
  px: number,
) {
  const t = focusSeconds / 90;
  if (t >= 1) return;
  const ease = t * t * (3 - 2 * t);
  const line = h * surfaceAt(focusSeconds);
  if (line < -h * 0.2) return;
  ctx.save();
  ctx.globalAlpha = 1 - ease;
  const N = 72;
  const waveAt = (i: number) => line + Math.sin(i * 0.9 + ambient * 1.3) * 3 * px + Math.sin(i * 0.37 - ambient * 0.8) * 5 * px;
  // The mirror: the underside of the surface, down to the waves.
  if (line > -10 * px) {
    const m = ctx.createLinearGradient(0, 0, 0, line + 8 * px);
    m.addColorStop(0, 'rgba(255, 252, 240, 0.12)');
    m.addColorStop(1, 'rgba(255, 252, 240, 0.3)');
    ctx.fillStyle = m;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= N; i++) ctx.lineTo((i / N) * w, waveAt(i));
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
  }
  // The light coming down through it.
  const g = ctx.createLinearGradient(0, line - 20 * px, 0, line + 100 * px);
  g.addColorStop(0, 'rgba(255, 252, 240, 0.3)');
  g.addColorStop(0.3, 'rgba(255, 252, 240, 0.14)');
  g.addColorStop(1, 'rgba(255, 252, 240, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, Math.max(0, line + 100 * px));
  // The window, overhead: an oval of sky lying along the surface.
  const cx = w * 0.5 + Math.sin(ambient * 0.05) * w * 0.02;
  const rx = w * 0.36;
  ctx.save();
  ctx.translate(cx, line);
  ctx.scale(rx, 64 * px);
  const win = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  win.addColorStop(0, 'rgba(255, 252, 240, 0.5)');
  win.addColorStop(0.55, 'rgba(255, 252, 240, 0.24)');
  win.addColorStop(1, 'rgba(255, 252, 240, 0)');
  ctx.fillStyle = win;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  // Its rim: the underside of the waves, a bright line that never lies
  // flat, strongest under the window, breaking where a wave turns; then a
  // fainter double just under it, the rim refracted.
  const LEVELS = 3;
  const paths = Array.from({ length: LEVELS }, () => new Path2D());
  const under = new Path2D();
  let prev = -1;
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w;
    const y = waveAt(i);
    const u = (x - cx) / rx;
    const inWin = Math.max(0, 1 - u * u);
    const broken = Math.sin(i * 0.7 + ambient * 0.9) * Math.sin(i * 0.23 - ambient * 0.4) > 0.55;
    const lv = broken ? 0 : Math.min(LEVELS - 1, Math.round(inWin * (LEVELS - 1) + 0.3));
    if (lv !== prev) paths[lv].moveTo(x, y);
    else paths[lv].lineTo(x, y);
    // Continue into the next run from here, so the line never gaps.
    if (lv !== prev && i > 0) paths[lv].lineTo(x, y);
    prev = lv;
    if (i === 0) under.moveTo(x, y + 7 * px);
    else under.lineTo(x, y + 7 * px + Math.sin(i * 1.3 - ambient) * 1.5 * px);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgb(255, 252, 240)';
  const base = 1 - ease;
  for (let k = 0; k < LEVELS; k++) {
    ctx.globalAlpha = base * (0.22 + 0.3 * k);
    ctx.lineWidth = (1.1 + 0.4 * k) * px;
    ctx.stroke(paths[k]);
  }
  ctx.globalAlpha = base * 0.2;
  ctx.lineWidth = 0.9 * px;
  ctx.stroke(under);
  // Glints under the window: the sun caught on the backs of the ripples.
  ctx.fillStyle = 'rgb(255, 252, 240)';
  for (let i = 0; i < 16; i++) {
    const r = mulberry32(hash32('glint', i));
    const gx = cx + (r() - 0.5) * rx * 1.4 + Math.sin(ambient * 0.6 + i) * 6 * px;
    const gy = line + (8 + r() * 40) * px;
    const tw = 0.5 + 0.5 * Math.sin(ambient * (1.5 + r()) + i * 2.4);
    ctx.globalAlpha = base * 0.45 * tw * (1 - Math.abs(gx - cx) / (rx * 0.8));
    if (ctx.globalAlpha <= 0.01) continue;
    ctx.beginPath();
    ctx.ellipse(gx, gy, (3 + r() * 6) * px, 0.7 * px, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The notebook's rules, faintly through the shallow wash; the deep covers them. */
export function drawRules(ctx: CanvasRenderingContext2D, w: number, h: number, z: number, px: number, color: string) {
  const a = Math.max(0, 0.28 - z * 0.8);
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  for (let y = 31 * px; y < h; y += 32 * px) ctx.fillRect(0, Math.round(y), w, Math.max(1, Math.round(px)));
  ctx.restore();
}

/**
 * Crossing into a new zone: a faint shimmer, the thermocline, rising up
 * through the water over a few seconds. `t` is 0 to 1 through it.
 */
export function drawShimmer(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, ambient: number, px: number, color: string) {
  if (t <= 0 || t >= 1) return;
  const y = h * (1.05 - 1.2 * t);
  const a = Math.sin(Math.PI * t) * 0.3;
  ctx.save();
  const g = ctx.createLinearGradient(0, y - 24 * px, 0, y + 24 * px);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, y - 24 * px);
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * w;
    ctx.lineTo(x, y + Math.sin(i * 0.8 + ambient * 2) * 6 * px - 24 * px);
  }
  for (let i = 40; i >= 0; i--) {
    const x = (i / 40) * w;
    ctx.lineTo(x, y + Math.sin(i * 0.8 + ambient * 2) * 6 * px + 24 * px);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---- The rare things. Each takes how far through it is, 0 to 1, and its
   own seed, and is drawn straight in; none of them is a sprite. ---- */

/** In and out softly, so nothing arrives in a flash. */
function envelope(age: number, rise: number, fall: number): number {
  return Math.max(0, Math.min(1, age / rise, (1 - age) / fall));
}

/**
 * A whale's outline, side on, head at +x, in shares of its length about its
 * middle: a rorqual's long body, the head tapering flat to the snout, the
 * throat full under it, a small hooked dorsal fin far back, the tail stock
 * narrowing to the flukes (seen a little from the side, one lobe up and one
 * down), and a long pectoral flipper hanging back from under the chest.
 */
const WHALE_BODY: number[] = [
  // The snout, and the flat head rising from it.
  0.5, 0.014, 0.488, -0.002, 0.455, -0.017, 0.4, -0.033, 0.33, -0.05, 0.24, -0.063, 0.12, -0.071, 0.0, -0.07, -0.11, -0.062, -0.17, -0.055,
  // The dorsal fin, small and hooked back.
  -0.195, -0.064, -0.218, -0.082, -0.232, -0.085, -0.232, -0.068, -0.245, -0.05,
  // The tail stock, deep and narrowing, to the flukes' root.
  -0.3, -0.04, -0.36, -0.03, -0.41, -0.021, -0.44, -0.016,
  // The upper fluke, out and back to its tip; the trailing edge in to the notch.
  -0.462, -0.04, -0.49, -0.075, -0.522, -0.1, -0.545, -0.104, -0.538, -0.075, -0.522, -0.04, -0.508, -0.008, -0.512, 0.002,
  // The lower fluke, the notch out to its tip and back along its leading edge.
  -0.522, 0.03, -0.54, 0.066, -0.556, 0.09, -0.535, 0.088, -0.5, 0.064, -0.468, 0.036, -0.44, 0.016,
  // The belly forward to the throat and the jaw.
  -0.4, 0.022, -0.32, 0.034, -0.2, 0.053, -0.08, 0.068, 0.05, 0.078, 0.17, 0.081, 0.28, 0.074, 0.37, 0.058, 0.44, 0.039, 0.485, 0.025,
];
const WHALE_FLIPPER: number[] = [
  0.29, 0.05, 0.262, 0.096, 0.21, 0.148, 0.14, 0.194, 0.088, 0.22, 0.072, 0.214, 0.112, 0.176, 0.162, 0.13, 0.186, 0.094, 0.18, 0.058,
];
/** How far the outline reaches above and below its middle line, in shares of its length. */
const WHALE_TOP = 0.11;
const WHALE_BOTTOM = 0.228;

/** The whale's shadow, blurred once at a size and placed. */
let whaleShadows: { key: string; canvas: HTMLCanvasElement | null; q: number; x0: number; y0: number }[] = [];

function whaleShadow(len: number, blur: number, color: string): { canvas: HTMLCanvasElement | null; q: number; x0: number; y0: number } {
  const key = `${Math.round(len)}|${Math.round(blur * 10)}|${color}`;
  const hit = whaleShadows.find((s) => s.key === key);
  if (hit) return hit;
  // Softened by drawing it small and letting it be scaled up, rather than
  // by a filter (which not every browser has, and which some scale with
  // the transform): drawn sharp at four pixels to the blur, then averaged
  // down to about one, and scaled up again where it is placed.
  const pad = blur * 3;
  const x0 = -0.57 * len - pad;
  const y0 = -WHALE_TOP * len - pad;
  const bw = 1.09 * len + pad * 2;
  const bh = (WHALE_TOP + WHALE_BOTTOM) * len + pad * 2;
  const q0 = Math.min(1, 4 / Math.max(1, blur));
  const q = Math.min(1, 1.1 / Math.max(1, blur));
  const sharp = scratch(bw * q0, bh * q0);
  const g = sharp?.getContext('2d');
  let c: HTMLCanvasElement | null = null;
  if (sharp && g) {
    g.scale(q0, q0);
    g.translate(-x0, -y0);
    g.scale(len, len);
    // Body and flipper filled apart: wound opposite ways, one path would
    // leave their overlap a hole.
    g.fillStyle = color;
    g.fill(smoothPath(WHALE_BODY, true, 4));
    g.fill(smoothPath(WHALE_FLIPPER, true, 4));
    // Down in two halvings, each averaging, so no edge survives as a step.
    let src: HTMLCanvasElement = sharp;
    let k = q0;
    while (k / 2 >= q * 0.99) {
      const next = scratch(bw * k / 2, bh * k / 2);
      const ng = next?.getContext('2d');
      if (!next || !ng) break;
      ng.imageSmoothingEnabled = true;
      ng.imageSmoothingQuality = 'high';
      ng.drawImage(src, 0, 0, next.width, next.height);
      src = next;
      k /= 2;
    }
    c = src;
    const made = { key, canvas: c, q: c.width / bw, x0, y0 };
    whaleShadows = [made, ...whaleShadows].slice(0, 2);
    return made;
  }
  const made = { key, canvas: null, q: 1, x0, y0 };
  whaleShadows = [made, ...whaleShadows].slice(0, 2);
  return made;
}

/**
 * A whale, far overhead: only its shadow against the light, going the way
 * the water goes, slowly, across the whole page. Always the whole animal,
 * head, flipper and flukes, 0.6 of the region's width long (or 0.62 of its
 * longer side, if that is less), which is about half the page's; soft, its
 * edge blurred a hundredth of the page's short side; and faint, an eighth
 * darker than the paper, or a seventh darker than the night's water.
 *
 * It keeps itself wholly inside the region it is given top to bottom (and
 * draws itself smaller if the region is too short to hold it), so a band
 * the caller hands it is never cut straight across. `page`, the page's
 * short side, sets the blur; without it the region's short side does.
 */
export function drawWhale(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, dir: 1 | -1, px: number, ambient: number, dark: boolean, page?: number) {
  const a = envelope(age, 0.15, 0.15) * (dark ? 0.15 : 0.12);
  if (a <= 0) return;
  const blur = Math.max(1.5 * px, 0.01 * (page ?? Math.min(w, h)));
  const len = Math.max(20 * px, Math.min(w * 0.6, Math.max(w, h) * 0.62, (h - blur * 4) / (WHALE_TOP + WHALE_BOTTOM)));
  const travel = w + len * 2;
  const x = dir > 0 ? -len + age * travel : w + len - age * travel;
  const top = WHALE_TOP * len + blur * 2;
  const bottom = WHALE_BOTTOM * len + blur * 2;
  const want = h * (0.1 + ((seed >>> 8) % 100) / 100 * 0.12);
  const y = h > top + bottom ? Math.max(top, Math.min(h - bottom, want)) : top;
  const shadow = whaleShadow(len, blur, dark ? '#000000' : '#2A3438');
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  // Gliding: the faintest pitch, as it rises and settles.
  ctx.rotate(Math.sin(ambient * 0.21 + (seed % 13)) * 0.012);
  if (shadow.canvas) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(shadow.canvas, shadow.x0, shadow.y0, shadow.canvas.width / shadow.q, shadow.canvas.height / shadow.q);
  } else {
    ctx.scale(len, len);
    ctx.fillStyle = dark ? '#000000' : '#2A3438';
    ctx.fill(smoothPath(WHALE_BODY, true, 4));
    ctx.fill(smoothPath(WHALE_FLIPPER, true, 4));
  }
  ctx.restore();
}

/** A soft round point of light, made once a colour and placed at any size: no hard rim. */
const softDots = new Map<string, HTMLCanvasElement | null>();

function softDot(rgb: string): HTMLCanvasElement | null {
  if (softDots.has(rgb)) return softDots.get(rgb) ?? null;
  const size = 32;
  const c = scratch(size, size);
  const g = c?.getContext('2d');
  if (c && g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb}, 1)`);
    grad.addColorStop(0.18, `rgba(${rgb}, 0.8)`);
    grad.addColorStop(0.45, `rgba(${rgb}, 0.22)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  softDots.set(rgb, c);
  return c;
}

/**
 * The water lighting up: a cloud of tiny animals flashing, slowly spreading
 * out from somewhere to one side. It comes up over seconds, never at once.
 * Each one is a small soft point, cold and pale, never neon; the haze about
 * them is a few soft clouds, each a disc that has faded to nothing at its
 * rim, so it has no edge anywhere.
 */
export function drawStorm(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number) {
  const env = envelope(age, 0.12, 0.3);
  if (env <= 0) return;
  const cx = w * (0.25 + ((seed >>> 4) % 100) / 100 * 0.5);
  const cy = h * (0.35 + ((seed >>> 12) % 100) / 100 * 0.35);
  const spread = Math.max(w, h) * (0.2 + age * 0.35);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const base = ctx.globalAlpha;
  // The haze: uneven, a few overlapping clouds rather than one disc.
  const hz = mulberry32(seed ^ 0x57a2);
  for (let k = 0; k < 5; k++) {
    const hx = cx + (hz() - 0.5) * spread * 0.7;
    const hy = cy + (hz() - 0.5) * spread * 0.45;
    const hr = spread * (0.45 + hz() * 0.4);
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    g.addColorStop(0, 'rgba(132, 186, 178, 1)');
    g.addColorStop(0.5, 'rgba(132, 186, 178, 0.35)');
    g.addColorStop(1, 'rgba(132, 186, 178, 0)');
    ctx.globalAlpha = base * env * (k === 0 ? 0.07 : 0.04);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
  }
  let s = seed || 1;
  const next = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
  const pale = softDot('201, 230, 222');
  const cold = softDot('214, 232, 236');
  for (let i = 0; i < 320; i++) {
    const ang = next() * Math.PI * 2;
    const rad = Math.sqrt(next()) * spread;
    const period = 1.5 + next() * 3;
    const off = next() * period;
    const b = ((ambient + off) % period) / period;
    const flash = Math.exp(-b * 8);
    const x = cx + Math.cos(ang) * rad + Math.sin(ambient * 0.3 + i) * 6 * px;
    const y = cy + Math.sin(ang) * rad * 0.7 + Math.cos(ambient * 0.25 + i) * 6 * px;
    // Small: a grain at rest, a little bloom as it flashes.
    const r = (0.55 + flash * 1.1) * px;
    const a = env * (0.14 + 0.5 * flash);
    const dot = i % 5 === 0 ? cold : pale;
    if (dot) {
      const big = r * 3.2;
      ctx.globalAlpha = base * a;
      ctx.drawImage(dot, x - big, y - big, big * 2, big * 2);
    } else {
      ctx.globalAlpha = base * a * 0.6;
      ctx.fillStyle = 'rgb(201, 230, 222)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Squid skin: on paper a warm buff the depth has drained, laid thin; in the
 * dark a near-neutral grey a shade off the night water, so the flank is
 * known by its line and not by a colour.
 */
const SQUID_SKIN = { light: '#AA9888', dark: '#4A473F' } as const;
/** How thick the skin is laid, so it stays within a few L* of the water. */
const SQUID_WASH = { light: 0.13, dark: 0.2 } as const;
/**
 * Its chromatophores: sacs of red-brown pigment, never a solid fill. In the
 * dark only their darkness is left (chroma under 10), never a red.
 */
const CHROMATOPHORES = { light: ['#7C3E2A', '#6E3826', '#874A33'], dark: ['#2A211C', '#33281F', '#241C17'] } as const;

/** The still parts of an eye, drawn once round its middle and placed each frame. */
interface EyeLayer {
  canvas: HTMLCanvasElement;
  /** Where its top left sits from the eye's middle, and the size it is drawn at. */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EyeLayers {
  key: string;
  skin: EyeLayer | null;
  ball: EyeLayer | null;
}

let eyeLayers: EyeLayers[] = [];

/** A layer `w` by `h` with its origin `x`, `y` from the eye's middle, at `q` of the size, painted by `paint` round (0, 0). */
function eyeLayer(x: number, y: number, w: number, h: number, q: number, paint: (g: CanvasRenderingContext2D) => void): EyeLayer | null {
  const c = scratch(w * q, h * q);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  g.scale(q, q);
  g.translate(-x, -y);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  paint(g);
  return { canvas: c, x, y, w, h };
}

/**
 * The hull the flank of mantle keeps to, in eye radii from the eye's middle:
 * how far it reaches toward the page, and up and down. The picture reserves
 * the same box (EYE_PATCH_* in picture/layout.ts).
 */
const PATCH_IN = 4.3;
const PATCH_UP = 3.35;
const PATCH_DOWN = 3.5;
/** How far the patch keeps its middle from the band's top and foot. */
const PATCH_REACH = 3.52;
/** How far in from the page's edge the eye's middle sits, in eye radii. */
const EYE_INSET = 0.82;
/** The eye's radius as a share of the page's short side: in a picture, and on a screen. */
const EYE_PICTURE = 0.025;
const EYE_LIVE = 0.0375;

/**
 * The flank of the mantle the eye is set in, in eye radii with the eye at
 * (0, 0) and the page's edge at u = -EYE_INSET (u runs into the page, v
 * down): a stretch of one large ellipse, taller than it is deep, whose
 * middle lies 5.2 to 6.2 radii beyond the page's edge (more than 1.5 of the
 * hull's half height), tilted a little by the seed. Its contour runs 2.8 to
 * 3.2 radii in from the eye at its fullest and curves back toward the edge
 * above and below, past the hull's top and foot, where the drawing is let
 * go. Returns the contour top to bottom, and the measure of a point in the
 * ellipse's own frame (1 on its edge).
 */
function mantleFlank(seed: number): { pts: [number, number][]; local: (u: number, v: number) => [number, number] } {
  const q = mulberry32(hash32('squid-mantle', seed));
  const off = 5.2 + q() * 1.0;
  const depth = 2.8 + q() * 0.4;
  const b = 6 + q() * 1.5;
  const rot = (q() - 0.5) * 0.24;
  const cu0 = -EYE_INSET - off;
  const cv0 = 0.075 + (q() - 0.5) * 0.6;
  const a = off + EYE_INSET + depth;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const pts: [number, number][] = [];
  for (let k = 0; k <= 240; k++) {
    const t = -Math.PI / 2 + (k / 240) * Math.PI;
    const x = Math.cos(t) * a;
    const y = Math.sin(t) * b;
    const u = cu0 + x * cr - y * sr;
    const v = cv0 + x * sr + y * cr;
    if (v > -PATCH_UP - 0.1 && v < PATCH_DOWN + 0.1) pts.push([Math.min(u, PATCH_IN - 0.3), v]);
  }
  const local = (u: number, v: number): [number, number] => {
    const x = u - cu0;
    const y = v - cv0;
    return [(x * cr + y * sr) / a, (-x * sr + y * cr) / b];
  };
  return { pts, local };
}

/**
 * The flank round the eye: the side of an animal far bigger than the page,
 * passing its edge. One ink contour runs down the page side of the eye,
 * full where it passes it and curving back toward the edge above and
 * below; between it and the edge the skin is washed thin, darkening a
 * little toward the edge where the body goes on, engraved with a few lines
 * along the contour where it turns from the light. Its chromatophores vary
 * in size and spacing, half opened into ragged stars and half closed to
 * dots, crowded on the back and thinning toward the contour. Above and
 * below the hull the drawing is let go, as a plate leaves off. Then the
 * socket darker round the ball, and the fold of the lid.
 */
function paintEyeSkin(ctx: CanvasRenderingContext2D, re: number, seed: number, px: number, dark: boolean, out: number): void {
  const r = mulberry32(hash32('squid-eye', seed, 'skin'));
  const cx = 0;
  const cy = 0;
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  const light: [number, number] = dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT;
  const skin = dark ? SQUID_SKIN.dark : SQUID_SKIN.light;
  const deep = mixHex(skin, dark ? '#0E0C0A' : '#2A2320', 0.45);
  const lidW = Math.max(0.7 * px, re * 0.035);
  // From the flank's own frame (u into the page, v down) to the layer's.
  const X = (u: number) => -out * u * re;
  const Y = (v: number) => v * re;
  const F = mantleFlank(seed);
  const contour: number[] = [];
  for (const [u, v] of F.pts) contour.push(X(u), Y(v));
  // The skin: the contour closed by a run off the page.
  const body = new Path2D();
  body.moveTo(contour[0], contour[1]);
  for (let i = 2; i < contour.length; i += 2) body.lineTo(contour[i], contour[i + 1]);
  body.lineTo(X(-EYE_INSET - 2), contour[contour.length - 1]);
  body.lineTo(X(-EYE_INSET - 2), contour[1]);
  body.closePath();
  const box = { x: Math.min(X(-EYE_INSET - 0.2), X(PATCH_IN)), y: -(PATCH_UP + 0.1) * re, w: (PATCH_IN + EYE_INSET + 0.2) * re, h: (PATCH_UP + PATCH_DOWN + 0.2) * re };
  // How far a point lies toward the contour: 0 deep in the body, 1 on it.
  const rimAt = (x: number, y: number) => Math.hypot(...F.local((-out * x) / re, y / re));
  // How far toward the page: 0 at the edge, 1 at the contour's fullest.
  const inward = (x: number) => Math.max(0, Math.min(1, ((-out * x) / re + EYE_INSET) / (EYE_INSET + 3)));

  // All of the flank is laid on a sheet of its own, so it can be let go
  // above and below.
  const sheet = scratch(box.w, box.h);
  const sg = sheet?.getContext('2d');
  const g = sg ?? ctx;
  g.save();
  if (sg) sg.translate(-box.x, -box.y);
  g.save();
  g.clip(body);
  // The wash, laid thin.
  g.globalAlpha = dark ? SQUID_WASH.dark : SQUID_WASH.light;
  g.fillStyle = skin;
  g.fill(body);
  // Paper tooth in it.
  const gr = grain(g);
  if (gr) {
    gr.setTransform?.(new DOMMatrix([px, 0, 0, px, 0, 0]));
    g.globalAlpha = dark ? 0.06 : 0.1;
    g.fillStyle = gr;
    g.fillRect(box.x, box.y, box.w, box.h);
  }
  // Darker by about 15% toward the edge, where the body goes on off the page.
  const toward = g.createLinearGradient(X(3), 0, X(-EYE_INSET), 0);
  toward.addColorStop(0, `${deep}00`);
  toward.addColorStop(1, deep);
  g.globalAlpha = dark ? 0.06 : 0.06;
  g.fillStyle = toward;
  g.fillRect(box.x, box.y, box.w, box.h);
  // A little uneven, as skin is.
  g.globalAlpha = 1;
  mottle(g, body, box, deep, mixHex(skin, dark ? '#8E877A' : '#F2EADB', 0.35), dark ? 0.04 : 0.05, seed ^ 0x3077);
  // The socket darker round the ball.
  const sock = g.createRadialGradient(cx, cy, re * 0.95, cx, cy, re * 1.7);
  sock.addColorStop(0, deep);
  sock.addColorStop(1, `${deep}00`);
  g.globalAlpha = dark ? 0.22 : 0.3;
  g.fillStyle = sock;
  g.fillRect(cx - re * 1.8, cy - re * 1.8, re * 3.6, re * 3.6);

  // The turn from the light: a few engraved lines inside the contour along
  // its shadow side, closer together toward it.
  const offs = [0.12, 0.27, 0.45, 0.66];
  offs.forEach((o, k) => {
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 8) inkLine(g, run, false, { width: Math.max(0.35 * px, re * 0.012), color: ink, alpha: (dark ? 0.16 : 0.26) * (1 - k / offs.length), taper: [0.3, 0.3], lost: 0, seed: seed ^ (0x7a0 + k) });
      run = [];
    };
    for (let i = 0; i < F.pts.length; i += 2) {
      const [u, v] = F.pts[i];
      const x = X(u - o);
      const y = Y(v);
      // The outward normal, from how fast the ellipse's measure grows each way.
      const e = 0.01 * re;
      const m0 = rimAt(x, y);
      const nx = rimAt(x + e, y) - m0;
      const ny = rimAt(x, y + e) - m0;
      const nl = Math.hypot(nx, ny) || 1;
      if ((nx * light[0] + ny * light[1]) / nl > 0.1 + k * 0.08) run.push(x, y);
      else flush();
    }
    flush();
  });

  // Chromatophores. Their spacing follows a slow field, crowding on the
  // back (up, and deep in the body toward the edge) and thinning toward
  // the contour; none in the socket.
  const cols = dark ? CHROMATOPHORES.dark : CHROMATOPHORES.light;
  const alphas = [0.35, 0.42, 0.5];
  const dots = cols.map(() => new Path2D());
  const cores = new Path2D();
  const q0 = mulberry32(hash32('squid-skin', seed, 0));
  const ph = [q0() * 6.28, q0() * 6.28, q0() * 6.28];
  const crowd = (x: number, y: number) => 0.5 + 0.3 * Math.sin(x / (re * 0.8) + ph[1]) * Math.sin(y / (re * 0.7) + ph[2]) + 0.2 * Math.sin((x - y) / (re * 0.45) + ph[0]);
  const gap = Math.max(3.2 * px, re * 0.13);
  // Log-normal sizes, 2 to 5 of the page's px across.
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r() * 0.999)) * Math.cos(6.2832 * r());
  for (let y = box.y; y < box.y + box.h; y += gap) {
    for (let x = box.x; x < box.x + box.w; x += gap) {
      const dx = x + (r() - 0.5) * gap * 1.1;
      const dy = y + (r() - 0.5) * gap * 1.1;
      const g0 = gauss();
      const roll = r();
      const open = r() < 0.5;
      const pick = Math.floor(r() * cols.length);
      const spin = r() * 6.28;
      const rim = rimAt(dx, dy);
      if (rim > 0.995 || Math.hypot(dx - cx, dy - cy) < re * 1.25) continue;
      // The back: up the flank, and deep in it toward the edge.
      const back = Math.max(0, Math.min(1, 0.55 - dy / re / 6));
      const keep = (0.1 + 0.9 * back) * (0.35 + 0.65 * (1 - inward(dx))) * Math.min(1, (1 - rim) / 0.03) * Math.max(0, 0.8 * crowd(dx, dy) - 0.04);
      if (roll > keep) continue;
      const d = Math.max(2, Math.min(5, 3 * Math.exp(0.32 * g0))) * px;
      const p = dots[pick];
      if (!open) {
        p.moveTo(dx + d / 2, dy);
        p.ellipse(dx, dy, d / 2, d * 0.42, spin, 0, Math.PI * 2);
        continue;
      }
      // Opened: pigment spread from the sac in a ragged, uneven blot, a few
      // of its arms reaching further than the rest.
      const R = d * 0.9;
      const n = 7 + Math.floor(r() * 4);
      const blot: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = spin + ((i + (r() - 0.5) * 0.6) / n) * Math.PI * 2;
        const reach = r();
        const rr = R * (0.45 + 0.35 * reach + (reach > 0.8 ? 0.35 : 0));
        blot.push(dx + Math.cos(t) * rr, dy + Math.sin(t) * rr);
      }
      p.addPath(smoothPath(blot, true, 8));
      cores.moveTo(dx + d * 0.22, dy);
      cores.arc(dx, dy, d * 0.22, 0, Math.PI * 2);
    }
  }
  dots.forEach((p, i) => {
    g.globalAlpha = alphas[i];
    g.fillStyle = cols[i];
    g.fill(p);
  });
  g.globalAlpha = 0.4;
  g.fillStyle = mixHex(cols[0], '#140E0B', 0.4);
  g.fill(cores);
  g.restore();

  // The contour: one line down the page side.
  g.globalAlpha = 1;
  inkLine(g, contour, false, { width: lidW * 0.85, color: ink, alpha: dark ? 0.42 : 0.72, taper: [0.08, 0.08], lost: 0, swell: 0.5, seed: seed ^ 0xf1a, light });
  g.restore();
  if (sheet && sg) {
    // Let go above and below: a soft run out over the hull's last radius.
    sg.setTransform(1, 0, 0, 1, 0, 0);
    const fade = sg.createLinearGradient(0, 0, 0, box.h);
    const top = (0.1 * re) / box.h;
    const run = (1.15 * re) / box.h;
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(top, 'rgba(0,0,0,0)');
    fade.addColorStop(top + run * 0.5, 'rgba(0,0,0,0.6)');
    fade.addColorStop(top + run, 'rgba(0,0,0,1)');
    fade.addColorStop(1 - top - run, 'rgba(0,0,0,1)');
    fade.addColorStop(1 - top - run * 0.5, 'rgba(0,0,0,0.6)');
    fade.addColorStop(1 - top, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    sg.globalCompositeOperation = 'destination-in';
    sg.fillStyle = fade;
    sg.fillRect(0, 0, box.w, box.h);
    ctx.globalAlpha = 1;
    ctx.drawImage(sheet, box.x, box.y, box.w, box.h);
  }

  // The fold of the lid over the eye: a flatter arc than the ball, a
  // shadow tucked under it and the skin catching the light along its top.
  const fold: number[] = [];
  const foldUnder: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = Math.PI * (1.12 + t * 0.76);
    fold.push(cx + Math.cos(a) * re * 1.62, cy + re * 0.38 + Math.sin(a) * re * 1.4);
  }
  for (let i = 16; i >= 0; i--) {
    const t = i / 16;
    const a = Math.PI * (1.12 + t * 0.76);
    const k = Math.sin(Math.PI * t);
    foldUnder.push(cx + Math.cos(a) * re * (1.62 - 0.2 * k), cy + re * 0.38 + Math.sin(a) * re * (1.4 - 0.26 * k));
  }
  const under = new Path2D();
  under.moveTo(fold[0], fold[1]);
  for (let i = 2; i < fold.length; i += 2) under.lineTo(fold[i], fold[i + 1]);
  for (let i = 0; i < foldUnder.length; i += 2) under.lineTo(foldUnder[i], foldUnder[i + 1]);
  under.closePath();
  ctx.globalAlpha = dark ? 0.25 : 0.3;
  ctx.fillStyle = deep;
  ctx.fill(under);
  if (!dark) {
    const lit: number[] = [];
    for (let i = 0; i < fold.length; i += 2) lit.push(fold[i], fold[i + 1] - re * 0.07);
    inkLine(ctx, lit, false, { width: lidW * 0.9, color: '#E9DFCB', alpha: 0.4, taper: [0.4, 0.4], seed: seed ^ 0xf01c, light, plate: true });
  }
  ctx.globalAlpha = 1;
  inkLine(ctx, fold, false, { width: lidW, color: ink, alpha: dark ? 0.45 : 0.75, taper: [0.3, 0.3], seed: seed ^ 0xf01d, light, plate: true });
  // And the crease under it, fainter and shorter.
  const crease: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.25 + (i / 10) * 0.5);
    crease.push(cx + Math.cos(a) * re * 1.42, cy - re * 0.1 + Math.sin(a) * re * 1.38);
  }
  inkLine(ctx, crease, false, { width: lidW * 0.7, color: ink, alpha: dark ? 0.22 : 0.4, taper: [0.4, 0.4], seed: seed ^ 0xf01e, light, plate: true });
}

/** The ball itself, round and open: the lids are laid over it each frame. */
function paintEyeBall(ctx: CanvasRenderingContext2D, re: number, seed: number, px: number, dark: boolean): void {
  const r = mulberry32(hash32('squid-eye', seed, 'ball'));
  const cx = 0;
  const cy = 0;
  const d = detailFor(re * 5);
  const base = 1;
  const ball = new Path2D();
  ball.arc(cx, cy, re, 0, Math.PI * 2);
  const ballBox = { x: cx - re, y: cy - re, w: re * 2, h: re * 2 };
  // The ball: a silvery iris, pooled darker toward its rim. At night it is
  // held well down, so it is an eye in the dark and not a second moon.
  const iris = dark ? '#6F6B5E' : '#A49E88';
  ctx.globalAlpha = base;
  washFill(ctx, ball, ballBox, { color: iris, edge: 0.5, paper: null, granulate: 0.3, px });
  const limbus = ctx.createRadialGradient(cx, cy, re * 0.42, cx, cy, re);
  limbus.addColorStop(0, 'rgba(26, 23, 20, 0)');
  limbus.addColorStop(0.45, 'rgba(26, 23, 20, 0.14)');
  limbus.addColorStop(0.8, 'rgba(26, 23, 20, 0.42)');
  limbus.addColorStop(1, 'rgba(26, 23, 20, 0.72)');
  ctx.fillStyle = limbus;
  ctx.fill(ball);
  // The pupil: a lens lying level, 0.55 of the iris across and 0.16 of it
  // high, the same above and below its middle and with no bend in it, so it
  // can never be read as a mouth.
  const lensW = re * 0.55;
  const lensH = re * 0.16;
  const lens = (x: number, k: number) => lensH * k * (1 - (x / lensW) * (x / lensW));
  // Radial striations, dark and pale by turns, none quite straight or even,
  // from the collarette round the pupil out toward the rim.
  const nStri = Math.round(40 + 80 * d);
  const darkLines = new Path2D();
  const paleLines = new Path2D();
  for (let k = 0; k < nStri; k++) {
    const a = ((k + r() * 0.6) / nStri) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Out from just past the collarette, which follows the pupil's shape.
    const inner = 1 / Math.hypot(ca / (lensW * 1.32), sa / (lensH * 2.6));
    const r0 = inner * (1.04 + r() * 0.06);
    const r1 = re * (0.8 + r() * 0.15);
    const bend = (r() - 0.5) * 0.12;
    if (r1 - r0 < re * 0.08) continue;
    const path = k % 2 ? paleLines : darkLines;
    path.moveTo(cx + ca * r0, cy + sa * r0);
    path.quadraticCurveTo(cx + Math.cos(a + bend) * (r0 + r1) * 0.5, cy + Math.sin(a + bend) * (r0 + r1) * 0.5, cx + ca * r1, cy + sa * r1);
  }
  ctx.strokeStyle = '#2A2320';
  ctx.globalAlpha = base * 0.38;
  ctx.lineWidth = Math.max(0.4 * px, re * 0.012);
  ctx.stroke(darkLines);
  ctx.strokeStyle = '#EFE8D6';
  ctx.globalAlpha = base * (dark ? 0.2 : 0.3);
  ctx.lineWidth = Math.max(0.35 * px, re * 0.009);
  ctx.stroke(paleLines);
  // The collarette: an uneven ring round the pupil's zone, as wide as it.
  const coll: number[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const j = 1 + (r() - 0.5) * 0.06;
    coll.push(cx + Math.cos(a) * lensW * 1.32 * j, cy + Math.sin(a) * lensH * 2.6 * j);
  }
  inkLine(ctx, coll, true, { width: Math.max(0.5 * px, re * 0.014), color: '#2A2320', alpha: base * 0.4, seed: seed ^ 0xc011, light: LIGHT, plate: true });
  const pupil = new Path2D();
  for (let i = 0; i <= 24; i++) {
    const x = -lensW + (i / 24) * 2 * lensW;
    if (i === 0) pupil.moveTo(cx + x, cy);
    else pupil.lineTo(cx + x, cy - lens(x, 1));
  }
  for (let i = 23; i >= 1; i--) {
    const x = -lensW + (i / 24) * 2 * lensW;
    pupil.lineTo(cx + x, cy + lens(x, 1));
  }
  pupil.closePath();
  ctx.globalAlpha = base * 0.95;
  ctx.fillStyle = '#16120F';
  ctx.fill(pupil);
  // Engraved: the ball's turn from the light in contour lines.
  if (d > 0.15) {
    hatch(ctx, ball, ballBox, {
      spacing: Math.max(1.3 * px, re * 0.05),
      angle: -0.75,
      bow: 1.2,
      shade: shadeAcross(ballBox, LIGHT),
      from: 0.56,
      cross: 0.82,
      color: '#2A2320',
      width: Math.max(0.45 * px, re * 0.014),
      alpha: base * 0.45,
      seed: seed ^ 0xba11,
    });
  }
  // Two small highlights: the window, up on the iris over the pupil, and a
  // fainter one low on the far side.
  ctx.globalAlpha = base * (dark ? 0.7 : 0.85);
  ctx.fillStyle = '#FBF8EF';
  ctx.beginPath();
  ctx.ellipse(cx - re * 0.3, cy - re * 0.34, re * 0.085, re * 0.05, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = base * 0.5;
  ctx.beginPath();
  ctx.ellipse(cx + re * 0.36, cy + re * 0.38, re * 0.04, re * 0.026, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * An eye at the edge of the page, bigger than anything else in the water,
 * that opens, looks, blinks once, and is gone. The rest of the animal is
 * never seen: only the patch of mantle the eye is set in, its skin in
 * stipple and a few chromatophores, fading out into the water.
 *
 * It is drawn as a plate's eye, not a target: a silvery iris struck through
 * with fine radial lines, a crescent of pupil lying on its side, two
 * highlights, contour hatching round the ball where it turns from the light,
 * and the lids a pen line that closes over it for the blink. The eye is
 * about 7.5% of the page's short side, set so the page's edge only just
 * touches its rim (nine tenths of it across is in); the patch of mantle,
 * more than twice its width, runs on off the page. Nothing round it is
 * coloured: no glow, no halo. All but the lids is drawn once and placed.
 *
 * Its patch is kept wholly inside the region it is given top to bottom,
 * so a band no shorter than 5.4 eye radii (a fifth of the page's short
 * side) never cuts it.
 *
 * `page`, the page's short side, sizes it; without it the region is taken
 * to be the page, unless it is a band across it (as the picture gives it,
 * a fifth as tall as it is wide), when its width is.
 */
export function drawEye(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, dark: boolean, page?: number) {
  const env = envelope(age, 0.25, 0.25);
  if (env <= 0) return;
  const left = seed % 2 === 0;
  const unit = Math.min(w, h);
  const short = page ?? (h < w * 0.35 ? w : unit);
  const re = Math.max(4 * px, Math.min(0.2 * unit, short * (page ? EYE_PICTURE : EYE_LIVE)));
  const out = left ? -1 : 1;
  // Nine tenths in: the edge of the page crosses the patch of mantle, and
  // only just touches the rim of the eye.
  const cx = left ? re * EYE_INSET : w - re * EYE_INSET;
  // High on the page, clear of the clock and the controls; and the whole
  // patch inside what it was given, so no edge of it is ever cut straight.
  const reach = re * PATCH_REACH + 2 * px;
  const want = h * (0.18 + ((seed >>> 6) % 100) / 100 * 0.2);
  const cy = h > reach * 2 ? Math.max(reach, Math.min(h - reach, want)) : h / 2;
  // One slow blink, just past the middle.
  const lid = age > 0.55 && age < 0.65 ? Math.sin(((age - 0.55) / 0.1) * Math.PI) : 0;
  const open = 1 - lid * 0.96;
  const d = detailFor(re * 5);
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  const light: [number, number] = dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT;
  const skin = dark ? SQUID_SKIN.dark : SQUID_SKIN.light;
  const sc = mixHex(skin, dark ? '#000000' : '#2A2320', 0.4);

  const key = `${seed}|${Math.round(re * 100)}|${px}|${dark ? 1 : 0}|${out}`;
  let layers = eyeLayers.find((l) => l.key === key);
  if (!layers) {
    layers = {
      key,
      skin: eyeLayer((out > 0 ? -(PATCH_IN + 0.1) : -(EYE_INSET + 0.2)) * re, -(PATCH_UP + 0.1) * re, (PATCH_IN + EYE_INSET + 0.3) * re, (PATCH_UP + PATCH_DOWN + 0.2) * re, 1, (g) => paintEyeSkin(g, re, seed, px, dark, out)),
      ball: eyeLayer(-1.1 * re, -1.1 * re, 2.2 * re, 2.2 * re, 1, (g) => paintEyeBall(g, re, seed, px, dark)),
    };
    eyeLayers = [layers, ...eyeLayers].slice(0, 2);
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const base = ctx.globalAlpha * env;
  ctx.globalAlpha = base;
  const place = (l: EyeLayer | null, fallback: () => void) => {
    if (l) ctx.drawImage(l.canvas, cx + l.x, cy + l.y, l.w, l.h);
    else {
      ctx.save();
      ctx.translate(cx, cy);
      fallback();
      ctx.restore();
    }
  };
  place(layers.skin, () => paintEyeSkin(ctx, re, seed, px, dark, out));

  // The aperture the lids leave: round when open, a slit at the blink.
  const aperture = (k: number) => {
    const top: number[] = [];
    const bottom: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = -1 + (i / 24) * 2;
      const x = cx + u * re * 1.06;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      top.push(x, cy - re * 1.06 * s * k + re * 0.06 * (1 - k) * s);
      bottom.push(x, cy + re * 1.06 * s * k + re * 0.06 * (1 - k) * s);
    }
    return { top, bottom };
  };
  const ap = aperture(open);
  const apPath = new Path2D();
  apPath.moveTo(ap.top[0], ap.top[1]);
  for (let i = 2; i < ap.top.length; i += 2) apPath.lineTo(ap.top[i], ap.top[i + 1]);
  for (let i = ap.bottom.length - 2; i >= 0; i -= 2) apPath.lineTo(ap.bottom[i], ap.bottom[i + 1]);
  apPath.closePath();

  const ball = new Path2D();
  ball.arc(cx, cy, re, 0, Math.PI * 2);
  const ballBox = { x: cx - re, y: cy - re, w: re * 2, h: re * 2 };
  ctx.save();
  ctx.clip(apPath);
  place(layers.ball, () => paintEyeBall(ctx, re, seed, px, dark));
  ctx.restore();

  // The lids: when the eye shuts, the skin comes over it, the socket's own
  // colour, and the ball's bulge still shows under them.
  if (open < 0.999) {
    const shut = 1 - open;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, re * 1.07, 0, Math.PI * 2);
    ctx.clip();
    const cover = new Path2D();
    cover.rect(cx - re * 1.2, cy - re * 1.2, re * 2.4, re * 2.4);
    cover.addPath(apPath);
    const lidTone = ctx.createRadialGradient(cx - re * 0.3, cy - re * 0.35, re * 0.1, cx, cy, re * 1.1);
    lidTone.addColorStop(0, mixHex(skin, dark ? '#E8E0CF' : '#FBF8EF', 0.08));
    lidTone.addColorStop(1, mixHex(sc, skin, 0.4));
    ctx.globalAlpha = base * Math.min(1, shut * 1.4);
    ctx.fillStyle = lidTone;
    ctx.fill(cover, 'evenodd');
    if (d > 0.15) {
      // The lid's skin in contour lines, round the ball under it.
      ctx.clip(cover, 'evenodd');
      hatch(ctx, ball, ballBox, {
        spacing: Math.max(1.4 * px, re * 0.06),
        angle: 0.08,
        bow: 1.6,
        shade: shadeAcross(ballBox, light),
        from: 0.3,
        color: ink,
        width: Math.max(0.4 * px, re * 0.012),
        alpha: base * 0.35 * shut,
        seed: seed ^ 0x11dd,
      });
    }
    ctx.restore();
    const bulge: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (0.05 + (i / 20) * 0.9) + (out < 0 ? Math.PI : 0);
      bulge.push(cx + Math.cos(a) * re, cy + Math.sin(a) * re);
    }
    inkLine(ctx, bulge, false, { width: Math.max(0.5 * px, re * 0.02), color: ink, alpha: base * 0.35 * shut, taper: [0.3, 0.3], seed: seed ^ 0xb0, light, plate: true });
  }
  const lidW = Math.max(0.7 * px, re * 0.035);
  // In the light ink of the dark water, held back: a pale ring all round
  // would make a cartoon's outline of it.
  inkLine(ctx, ap.top, false, { width: lidW * 1.1, color: ink, alpha: base * (dark ? 0.4 : 0.8), taper: [0.14, 0.14], seed: seed ^ 0x11d, light, plate: true });
  inkLine(ctx, ap.bottom, false, { width: lidW * 0.7, color: ink, alpha: base * (dark ? 0.18 : 0.45), taper: [0.32, 0.32], seed: seed ^ 0x11e, light, plate: true });
  ctx.restore();
}

/**
 * Something very large going past behind everything: a long dark flank,
 * lit here and there, that never shows a head or a tail.
 */
export function drawLeviathan(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, dir: 1 | -1, px: number, ambient: number) {
  const env = envelope(age, 0.2, 0.2);
  if (env <= 0) return;
  const y0 = h * (0.55 + ((seed >>> 5) % 100) / 100 * 0.2);
  const thick = h * 0.34;
  const shift = (dir > 0 ? age : 1 - age) * w * 1.6 - w * 0.3;
  ctx.save();
  ctx.globalAlpha = env * 0.55;
  ctx.fillStyle = '#050505';
  ctx.filter = `blur(${4 * px}px)`;
  ctx.beginPath();
  ctx.moveTo(-10, h + 10);
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * (w + 20) - 10;
    const y = y0 - Math.sin((x - shift) / w * Math.PI * 1.3 + ambient * 0.05) * thick * 0.35 - thick * 0.3;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w + 10, h + 10);
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';
  // A row of lights along the flank, moving with it.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const x = ((i / 14) * w * 1.6 + shift) % (w * 1.6) - w * 0.3;
    const y = y0 - Math.sin((x - shift) / w * Math.PI * 1.3 + ambient * 0.05) * thick * 0.35 - thick * 0.1;
    const pulse = 0.5 + 0.5 * Math.sin(ambient * 1.2 + i);
    ctx.globalAlpha = env * 0.8 * pulse;
    ctx.fillStyle = '#9FE6D0';
    ctx.beginPath();
    ctx.arc(x, y, 3.2 * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The picture, painted from its plan.
 *
 * Every drawing here is one the live sea already makes (the wash, the kelp,
 * the animals' sprites, the jellies, the rare things), placed and scaled by
 * the plan rather than by a clock, and the rocks, the floor and the trench,
 * which are the picture's own. Everything is a pure function of the plan and
 * the device scale, so a picture drawn in strips, or twice, comes out the
 * same; what is slow to make (sprites, jellies, rocks, the occluder) is kept
 * on the plan for the next strip.
 *
 * Three planes, as an engraver keeps them: near things in full ink; the
 * middle a step back, taken a little by the water; far things faint and
 * mostly the water's colour, their own pixels mixed toward it (never a disc
 * of haze laid behind them).
 */

import { mixHex } from '../../fan';
import { buildJelly, drawJelly, jellyInk, type JellyShape } from '../../jelly';
import { rollBiome, type Biome, type Species } from '../biome';
import { drawChimney, drawEye, drawLeviathan, drawPlume, drawStorm, drawVisitor, drawWhale } from '../draw';
import { rollKelp, type Kelp } from '../kelp';
import { drawKelp } from '../kelp-draw';
import { drawGodRays, drawSnellWindow, drawSnowDeep, godRayLight, sunFor } from '../light';
import { jellyForBlock } from '../lineage';
import { drained, HUES, waterAt, type Water } from '../palette';
import { inkLine, smoothPath } from '../pen';
import { hash32, mulberry32, type Rand } from '../random';
import type { Visitor } from '../schedule';
import { drawDumbo, drawLure, drawWhaleFall } from '../sightings-deep';
import { drawOarfish, drawSiphonophore, drawTurtle } from '../sightings-shallow';
import { SpriteCache, type Sprite } from '../sprites';
import { Wash } from '../wash';
import { causticsOn } from '../caustics';
import type { Growth, GrowthKind } from '../outcrop';
import { drawGrowth, inkRock, rockShape, rockStyle } from '../outcrop-sprite';
import { floorAt, REF, rockOutline, rockX, type PlacedEvent, type PlacedJelly, type PlacedRock, type Plan } from './layout';

interface Caches {
  biome: Biome;
  kelp: Kelp | null;
  sprites: SpriteCache;
  wash: Wash;
  jellies: Map<string, { canvas: HTMLCanvasElement; ox: number; oy: number }>;
  shapes: Map<number, JellyShape>;
  rocks: Map<string, { canvas: HTMLCanvasElement; x: number; y: number }>;
  events: Map<string, EventLayer | null>;
  hazed: WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>;
  occluder: { key: string; canvas: HTMLCanvasElement } | null;
  rayLight: { key: string; at: (x: number, y: number) => number } | null;
  wash2: { key: string; canvas: HTMLCanvasElement } | null;
  dither: HTMLCanvasElement | null;
  rays: { key: string; canvas: HTMLCanvasElement } | null;
  window: { key: string; canvas: HTMLCanvasElement } | null;
  fall: Fall | null;
  column: string[] | null;
}

/** The plan's own store of what is slow to make, out of sight of a JSON of it. */
function cachesOf(plan: Plan): Caches {
  const holder = plan as Plan & { __cache?: Caches };
  if (!holder.__cache) {
    const biome = rollBiome(plan.key, plan.courseKey);
    Object.defineProperty(holder, '__cache', {
      enumerable: false,
      writable: true,
      value: {
        biome,
        kelp: plan.kelp ? rollKelp(biome.key) : null,
        // Line weights and hatching judged against the page (1000 units to its short side), as for print.
        sprites: new SpriteCache(320e6, { page: 1000, print: true }),
        wash: new Wash(true),
        jellies: new Map(),
        shapes: new Map(),
        rocks: new Map(),
        events: new Map(),
        hazed: new WeakMap(),
        occluder: null,
        rayLight: null,
        wash2: null,
        dither: null,
        rays: null,
        window: null,
        fall: null,
        column: null,
      } satisfies Caches,
    });
  }
  return holder.__cache as Caches;
}

const PAPER = '#FBF8EF';
const NIGHT = '#1A1815';
/** The near plane's ink, on paper and on the night ground. */
const INK = '#2B2620';
const INK_NIGHT = '#E8E0CF';
/** The far plane: faint, and mostly the water. */
const FAR_ALPHA = 0.35;
const FAR_MIX = 0.6;
/** The middle plane: a step back into the water. */
const MID_MIX = 0.3;
/** The bottom of the trench. */
const ABYSS = '#110F0D';

/**
 * The paper's sea: watercolour on cream rag, sea-glass in the light, slate
 * blue through the twilight, and indigo going to ink-blue in the deep. Never
 * black: on paper the darkest wash still lets the paper breathe through.
 */
const PAPER_SEA: [number, string][] = [
  [0, '#EEEFE4'],
  [0.15, '#D9DFD6'],
  [0.3, '#B4C2BE'],
  [0.45, '#8797A2'],
  [0.6, '#5E6E86'],
  [0.75, '#43506F'],
  [0.88, '#333E5E'],
  [1, '#2B3554'],
];

/* ---- Colour ---- */

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexOf(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lumOf(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return (0.3 * r + 0.59 * g + 0.11 * b) / 255;
}

const toLin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const fromLin = (v: number) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);

/** CIE L*a*b* of a colour (D65). */
export function labOf(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map(toLin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function hexOfLab(L: number, A: number, B: number): string {
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = inv(fx) * 0.95047;
  const Y = inv(fy);
  const Z = inv(fz) * 1.08883;
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return hexOf(fromLin(r), fromLin(g), fromLin(b));
}

function zAt(plan: Plan, y: number): number {
  const s = plan.zStops;
  const i = Math.max(0, Math.min(s.length - 2, Math.floor((y / plan.h) * (s.length - 1))));
  const a = s[i];
  const b = s[i + 1];
  return a.z + ((b.z - a.z) * Math.max(0, Math.min(1, (y - a.y) / Math.max(1e-6, b.y - a.y))));
}

/** The water's own colour at a depth, as it is laid in the picture. */
function tone(plan: Plan, z: number): string {
  if (plan.ground === 'paper') {
    let c = PAPER_SEA[PAPER_SEA.length - 1][1];
    for (let i = 1; i < PAPER_SEA.length; i++) {
      if (z <= PAPER_SEA[i][0]) {
        const [z0, a] = PAPER_SEA[i - 1];
        const [z1, b] = PAPER_SEA[i];
        c = mixHex(a, b, (z - z0) / (z1 - z0));
        break;
      }
    }
    // The course tints it while there is light, as the live sea does.
    return mixHex(c, plan.color, 0.14 * (1 - Math.min(1, z / 0.7)));
  }
  const wt = waterAt(z, plan.ground, plan.color);
  return mixHex(mixHex(wt.top, wt.bottom, 0.45), '#141A26', 0.3 * Math.max(0, Math.min(1, (z - 0.2) / 0.5)));
}

/**
 * The page falling away at its foot: every picture's lowest part takes more
 * glazes than its top, to L* 45 or darker on paper, so a short sitting is
 * no pale, dead sheet; and where the sitting ends high on the page the
 * fall starts higher, so the empty water below reads as deep, not unfinished.
 */
interface Fall {
  from: number;
  to: number;
  most: number;
  deep: string;
}

function fallOf(plan: Plan, c: Caches): Fall {
  if (c.fall) return c.fall;
  const paper = plan.ground === 'paper';
  const foot = tone(plan, zAt(plan, plan.h));
  const [, A, B] = labOf(foot);
  // Toward the sea's own deep, a slate indigo, carrying a little of the water's hue.
  const [, A2, B2] = labOf(paper ? '#3A4767' : '#141A26');
  const target = paper ? 41 : 9;
  const deep = hexOfLab(paper ? 32 : 6, A * 0.45 + A2 * 0.55, B * 0.45 + B2 * 0.55);
  // How much of the deep it takes for the foot to come down to the target.
  let most = 0.22;
  for (let lo = 0.22, hi = 1, i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (labOf(mixHex(foot, deep, mid))[0] > target) lo = mid;
    else hi = mid;
    most = hi;
  }
  const settled = plan.floor ? plan.floor.y : plan.contentBottom + plan.h * 0.04;
  const from = Math.max(plan.h * 0.38, Math.min(plan.h * 0.62, settled - plan.h * 0.3));
  c.fall = { from, to: plan.h * 0.95, most: Math.max(0.22, most), deep };
  return c.fall;
}

/** The water at y on the page as the depth dial alone gives it: its depth's colour, and the page's fall at its foot. */
function rawTone(plan: Plan, c: Caches, y: number): string {
  const f = fallOf(plan, c);
  const base = tone(plan, zAt(plan, y));
  const t = Math.max(0, Math.min(1, (y - f.from) / (f.to - f.from)));
  const k = t * t * (3 - 2 * t);
  return k > 0 ? mixHex(base, f.deep, f.most * Math.pow(k, 1.15)) : base;
}

/** Samples down the page of the water as it is laid. */
const COLUMN = 240;
/** The steepest the water may darken in the upper part of the page: L* per hundredth of its height. */
const STEEPEST = 2.2;

/**
 * The water down the page as it is laid: the depth's colour, eased. The
 * dial runs fastest through the twilight, and laid as it comes a long
 * sitting would drop from sea-glass to slate in a few hundredths of the
 * page: a hard band that reads as a sea's surface seen side on, with
 * everything above it floating in the sky. So the colour is blurred down
 * the page (in L*a*b*), wider until nothing in its upper three fifths
 * darkens faster than STEEPEST: the deepening is spread over half the page
 * or more, a smooth fall, and the page still goes as dark as it went.
 */
function columnOf(plan: Plan, c: Caches): string[] {
  if (c.column) return c.column;
  const N = COLUMN;
  const lab = Array.from({ length: N }, (_, i) => labOf(rawTone(plan, c, (plan.h * i) / (N - 1))));
  const blur = (src: [number, number, number][], sigma: number) => {
    const rad = Math.ceil(sigma * 3);
    const wts = Array.from({ length: rad * 2 + 1 }, (_, k) => Math.exp(-(((k - rad) / sigma) ** 2) / 2));
    return src.map((_, i) => {
      const acc: [number, number, number] = [0, 0, 0];
      let wsum = 0;
      for (let k = -rad; k <= rad; k++) {
        const v = src[Math.max(0, Math.min(N - 1, i + k))];
        const wk = wts[k + rad];
        acc[0] += v[0] * wk;
        acc[1] += v[1] * wk;
        acc[2] += v[2] * wk;
        wsum += wk;
      }
      return acc.map((a) => a / wsum) as [number, number, number];
    });
  };
  /** The steepest fall in the upper three fifths, L* per hundredth of the page. */
  const steepest = (col: [number, number, number][]) => {
    let worst = 0;
    for (let i = 1; i < Math.round(N * 0.6); i++) worst = Math.max(worst, col[i - 1][0] - col[i][0]);
    return (worst * (N - 1)) / 100;
  };
  let out = blur(lab, N * 0.05);
  for (let sigma = N * 0.06; sigma <= N * 0.16 + 1e-9 && steepest(out) > STEEPEST; sigma += N * 0.01) out = blur(lab, sigma);
  // The foot keeps the dark it was given: blurring would lift the very
  // bottom toward the water above it.
  for (let i = Math.round(N * 0.8); i < N; i++) {
    const t = (i - N * 0.8) / (N * 0.2);
    const L = out[i][0] + (lab[i][0] - out[i][0]) * t;
    if (L < out[i][0]) out[i] = [L, out[i][1], out[i][2]];
  }
  c.column = out.map(([L, A, B]) => hexOfLab(L, A, B));
  return c.column;
}

/** The water at y on the page, as it is laid. */
function waterTone(plan: Plan, c: Caches, y: number): string {
  const col = columnOf(plan, c);
  const f = Math.max(0, Math.min(COLUMN - 1, (y / plan.h) * (COLUMN - 1)));
  const i = Math.min(COLUMN - 2, Math.floor(f));
  return mixHex(col[i], col[i + 1], f - i);
}

/** The water at a point on the page, as the picture lays it: its colour, and whether ink on it is the light ink. */
function waterAtY(plan: Plan, c: Caches, y: number): Water {
  const z = zAt(plan, y);
  const base = waterAt(z, plan.ground, plan.color);
  const t = waterTone(plan, c, y);
  return { ...base, top: t, bottom: mixHex(t, '#000000', 0.12), dark: plan.ground === 'night' || lumOf(t) < 0.47 };
}

type InSight = (x0: number, y0: number, x1: number, y1: number, pad?: number) => boolean;

/** The part of the picture a strip shows, in the picture's device px. */
interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * What of the picture the canvas can show: the canvas's own rectangle taken
 * back through the transform the caller set. Only ever used to skip what is
 * wholly out of sight, never to change how anything is drawn, so a picture
 * drawn in strips is the picture drawn whole.
 */
function viewOf(ctx: CanvasRenderingContext2D, W: number, H: number): View {
  const all = { x0: 0, y0: 0, x1: W, y1: H };
  try {
    const cw = ctx.canvas?.width;
    const ch = ctx.canvas?.height;
    if (!(cw > 0 && ch > 0)) return all;
    const inv = ctx.getTransform().inverse();
    const pts = [
      inv.transformPoint({ x: 0, y: 0 }),
      inv.transformPoint({ x: cw, y: 0 }),
      inv.transformPoint({ x: 0, y: ch }),
      inv.transformPoint({ x: cw, y: ch }),
    ];
    const x0 = Math.min(...pts.map((p) => p.x));
    const x1 = Math.max(...pts.map((p) => p.x));
    const y0 = Math.min(...pts.map((p) => p.y));
    const y1 = Math.max(...pts.map((p) => p.y));
    if (![x0, x1, y0, y1].every(Number.isFinite)) return all;
    return { x0: Math.max(0, x0 - 2), y0: Math.max(0, y0 - 2), x1: Math.min(W, x1 + 2), y1: Math.min(H, y1 + 2) };
  } catch {
    return all;
  }
}

function sees(v: View, x0: number, y0: number, x1: number, y1: number): boolean {
  return x1 >= v.x0 && x0 <= v.x1 && y1 >= v.y0 && y0 <= v.y1;
}

/**
 * A canvas laid at (dx, dy) device px, only the part of it in sight: a big
 * layer (the hero at print size is millions of pixels) is not copied whole
 * into every strip it touches. Whole pixels either side, so strips join.
 */
function blit(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, dx: number, dy: number, view: View | null): void {
  if (!view) {
    ctx.drawImage(src, dx, dy);
    return;
  }
  const sx0 = Math.max(0, Math.floor(view.x0 - dx) - 1);
  const sy0 = Math.max(0, Math.floor(view.y0 - dy) - 1);
  const sx1 = Math.min(src.width, Math.ceil(view.x1 - dx) + 1);
  const sy1 = Math.min(src.height, Math.ceil(view.y1 - dy) + 1);
  if (sx1 <= sx0 || sy1 <= sy0) return;
  ctx.drawImage(src, sx0, sy0, sx1 - sx0, sy1 - sy0, dx + sx0, dy + sy0, sx1 - sx0, sy1 - sy0);
}

export function paint(ctx: CanvasRenderingContext2D, plan: Plan, px: number, rows?: { top: number; bottom: number }): void {
  const D = px * plan.unit;
  const W = plan.w * D;
  const H = plan.h * D;
  if (!(W > 0 && H > 0)) return;
  const c = cachesOf(plan);
  const ambient = 30 + (plan.seed % 997) / 31;
  const sun = sunFor(plan.hour);
  const night = plan.ground === 'night';
  const view = viewOf(ctx, W, H);
  if (rows && rows.bottom > rows.top) {
    // A pixel's grace either way, so strips join without a seam.
    view.y0 = Math.max(view.y0, rows.top - 2);
    view.y1 = Math.min(view.y1, rows.bottom + 2);
  }
  if (view.x1 <= view.x0 || view.y1 <= view.y0) return;
  /** Whether a box in units, grown by `pad` units, is in sight. */
  const inSight = (x0: number, y0: number, x1: number, y1: number, pad = 0) => sees(view, (x0 - pad) * D, (y0 - pad) * D, (x1 + pad) * D, (y1 + pad) * D);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  // ---- The water: the depth's colour down the page, falling away at its
  // foot, then the paint.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (let i = 0; i <= 48; i++) {
    const y = (plan.h * i) / 48;
    g.addColorStop(i / 48, waterTone(plan, c, y));
  }
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  paintWash(ctx, plan, c, D, W, H, view);
  // ---- The light from above, carved by everything that stands in it: laid
  // once into a layer of its own, after every glaze, and each strip draws
  // its slice.
  const lit = litDepth(plan);
  const rs = Math.max(1, Math.max(W, H) / 2400);
  const occluder = occluderOf(plan, c);
  const rays = {
    source: { x: (plan.window.x * D) / rs, y: (plan.window.y * D) / rs },
    occluder,
    strength: 0.5 + 0.55 * Math.max(0, 1 - plan.zMax / 0.6),
    sun,
    px: D / rs,
    seed: plan.seed,
    // Laid as light on a clear layer: the layer is then screened onto paper.
    dark: true,
  };
  const layer = rayLayer(plan, c, W, H, rs, lit * D, rays);
  if (layer && sees(view, 0, 0, W, lit * D)) {
    ctx.save();
    ctx.globalCompositeOperation = night ? 'lighter' : 'screen';
    ctx.globalAlpha = night ? 0.9 : 1;
    drawSlice(ctx, layer, W, H, view);
    ctx.restore();
  }
  // ---- Far: the big shapes behind everything, the rocks passed, the old
  // jellies far off, the far animals.
  for (const e of plan.events) if (e.far) paintEvent(ctx, plan, c, e, D, ambient, inSight, view);
  for (const r of plan.rocks) if (r.plane === 0 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight, view);
  for (const j of plan.jellies) if (j.far && inSight(j.box.x0, j.box.y0, j.box.x1, j.box.y1, j.r)) paintJelly(ctx, plan, c, j, D, view);
  paintCast(ctx, plan, c, D, ambient, 0, inSight);
  // ---- The hero's light, in the water round it.
  paintPool(ctx, plan, c, D, view);
  // ---- The middle: the kelp, the middle rocks, the floor, the rare things
  // in the water, the middle animals.
  if (c.kelp && plan.kelp) paintKelp(ctx, plan, c.kelp, c, D, ambient, inSight);
  for (const r of plan.rocks) if (r.plane === 1 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight, view);
  if (plan.floor) {
    const top = plan.trench ? plan.trench.top : plan.floor.y;
    if (inSight(0, top - 40, plan.w, plan.h)) paintFloor(ctx, plan, c, D, view);
  }
  for (const e of plan.events) if (!e.far && e.kind !== 'eye') paintEvent(ctx, plan, c, e, D, ambient, inSight, view);
  paintCast(ctx, plan, c, D, ambient, 1, inSight);
  // ---- Near: the rocks of the breaks, the way down (bubbles rising off
  // it, the jellies, the hero last), the near animals, the eye.
  for (const r of plan.rocks) if (r.plane === 2 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight, view);
  paintBubbles(ctx, plan, c, D, inSight);
  for (const j of plan.jellies) if (!j.far && inSight(j.box.x0, j.box.y0, j.box.x1, j.box.y1, j.r)) paintJelly(ctx, plan, c, j, D, view);
  paintCast(ctx, plan, c, D, ambient, 2, inSight);
  for (const e of plan.events) if (e.kind === 'eye') paintEvent(ctx, plan, c, e, D, ambient, inSight, view);
  // ---- The sky, looking up: a small soft window at the top, over
  // everything in the water; nothing crosses it but a few fish, dark
  // against the light, drawn after the moon.
  const win = plan.window;
  const wx0 = win.x - win.r * 3.3;
  const wx1 = win.x + win.r * 3.3;
  const wy1 = win.y + win.r * 1.6;
  if (inSight(wx0, 0, wx1, wy1)) {
    const wl = windowLayer(plan, c, D, sun, night, wx0, wx1, wy1);
    if (wl) ctx.drawImage(wl.canvas, wx0 * D, 0, (wx1 - wx0) * D, wy1 * D);
  }
  // ---- Light: what glows lights what is near it.
  paintLights(ctx, lightsOf(plan, c, D), view);
  // ---- Snow, caught in the light: specks and dust, nothing bigger.
  const rayKey = `${W}|${H}|${D}`;
  if (!c.rayLight || c.rayLight.key !== rayKey) {
    const at = godRayLight(W / rs, H / rs, rays);
    c.rayLight = { key: rayKey, at: (x, y) => at(x / rs, y / rs) };
  }
  const rayAt = c.rayLight.at;
  drawSnowDeep(ctx, W, H, {
    seed: plan.seed,
    density: 0.3 + 0.3 * plan.zMax,
    color: night || plan.zMax > 0.45 ? '#E6DAC2' : '#FFFFFF',
    px: D,
    dark: night || plan.zMax > 0.5,
    litBy: (x, y) => Math.max(rayAt(x, y), jellyLight(plan, x / D, y / D)),
    maxSize: 0.004 * 1000 * D,
    rows: { y0: view.y0, y1: view.y1 },
  });
  // ---- A whisper of noise, so no gradient bands.
  paintDither(ctx, c, plan.seed, view);
  ctx.restore();
}

/* ---- Light and noise, without reading the canvas back ---- */

/** A glow's falloff: a bright core, then a long tail as the water scatters it, to nothing. */
const FALLOFF = [0, 0.04, 0.09, 0.16, 0.26, 0.4, 0.58, 0.78, 1].map((t) => {
  const f = (s: number) => 1 / (1 + (s / 0.13) ** 2);
  return [t, Math.max(0, (f(t) - f(1)) / (1 - f(1)))] as const;
});

interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
  strength: number;
  /** Whether the water round it is dark: the plan knows, so nothing is read back. */
  dark: boolean;
  /** A hot core where the light itself is (a lure); a jelly's own bell is its core. */
  core?: boolean;
}

/**
 * The light pass of light.ts, done the same way, except that whether each
 * light sits in dark water comes from the plan rather than from reading the
 * canvas under it. Each is a radial gradient falling to nothing: no rim.
 */
function paintLights(ctx: CanvasRenderingContext2D, lights: Light[], view: View) {
  ctx.save();
  for (const L of lights) {
    const s = Math.max(0, Math.min(2, L.strength));
    if (s <= 0.005 || !sees(view, L.x - L.r, L.y - L.r, L.x + L.r, L.y + L.r)) continue;
    const [r, g, b] = rgbOf(L.color);
    const rgb = `${r}, ${g}, ${b}`;
    const pool = (alpha: number, reach: number) => {
      const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, reach);
      for (const [t, f] of FALLOFF) gr.addColorStop(t, `rgba(${rgb}, ${Math.min(1, alpha * f).toFixed(4)})`);
      ctx.fillStyle = gr;
      ctx.fillRect(L.x - reach, L.y - reach, reach * 2, reach * 2);
    };
    ctx.globalCompositeOperation = L.dark ? 'lighter' : 'screen';
    pool((L.dark ? 0.5 : 0.35) * s, L.r);
    if (L.core) pool(0.5 * s, L.r * 0.18);
  }
  ctx.restore();
}

/**
 * The hero's light: a soft pool round it, about a third of the page's short
 * side, lifting the water's lightness by 8 (paper) or 12 (night) L* at its
 * heart and fading to nothing. Screened, so the paint's grain stays.
 */
function paintPool(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, view: View) {
  const hero = plan.jellies[plan.jellies.length - 1];
  if (!hero) return;
  const R = 0.35 * Math.min(plan.w, plan.h) * D;
  const cx = hero.x * D;
  const cy = (hero.y + hero.r * 0.7) * D;
  if (!sees(view, cx - R, cy - R, cx + R, cy + R)) return;
  const base = waterTone(plan, c, hero.y + hero.r * 0.7);
  const [L, A, B] = labOf(base);
  const lifted = rgbOf(hexOfLab(L + (plan.ground === 'night' ? 12 : 8), A, B));
  const under = rgbOf(base);
  // The screen colour that takes the water to the lifted colour: res = b + x (1 - b).
  const x = lifted.map((t, i) => Math.max(0, Math.min(255, ((t - under[i]) / Math.max(1, 255 - under[i])) * 255)));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  const stops: [number, number][] = [
    [0, 1],
    [0.2, 0.88],
    [0.42, 0.58],
    [0.64, 0.27],
    [0.82, 0.08],
    [1, 0],
  ];
  for (const [t, a] of stops) g.addColorStop(t, `rgba(${x[0].toFixed(0)}, ${x[1].toFixed(0)}, ${x[2].toFixed(0)}, ${a})`);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
}

const DITHER = 128;

/**
 * Dither without a readback: a fixed tile of faint light and dark specks
 * (a couple of levels either way), laid in the picture's own coordinates so
 * strips join, over the part in sight.
 */
function paintDither(ctx: CanvasRenderingContext2D, c: Caches, seed: number, view: View) {
  if (typeof document === 'undefined') return;
  if (!c.dither) {
    const t = document.createElement('canvas');
    t.width = DITHER;
    t.height = DITHER;
    const o = t.getContext('2d');
    if (!o) return;
    const img = o.createImageData(DITHER, DITHER);
    const r = mulberry32(hash32('picture-dither', seed));
    for (let i = 0; i < DITHER * DITHER; i++) {
      const u = r() + r() - 1;
      const v = u > 0 ? 255 : 0;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = Math.round(Math.abs(u) * 3);
    }
    o.putImageData(img, 0, 0);
    c.dither = t;
  }
  const pattern = ctx.createPattern(c.dither, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = pattern;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.restore();
}

/* ---- The wash ---- */

function paintWash(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, W: number, H: number, view: View) {
  // The wash's paint is neutral and soft, and so are the deep's mottle and
  // the page's darkened corners: all laid once into a canvas of their own,
  // no bigger than a few million pixels, and stretched over the picture. A
  // poster does not need a poster-sized stain, and strips of the picture
  // share it (dozens of page-sized gradients per strip would not).
  const key = `${W}|${H}`;
  if (!c.wash2 || c.wash2.key !== key) {
    c.wash2 = null;
    const k = Math.min(1, Math.sqrt(4e6 / (W * H)));
    const ow = Math.max(1, Math.round(W * k));
    const oh = Math.max(1, Math.round(H * k));
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const o = canvas?.getContext('2d');
    if (canvas && o) {
      canvas.width = ow;
      canvas.height = oh;
      const clear = '#80808000';
      c.wash.draw(o, ow, oh, { top: clear, bottom: clear, dark: false, snow: '#FFFFFF', light: 0 }, D * k, plan.seed);
      const u = (ow / plan.w);
      mottleInto(o, plan, u);
      vignetteInto(o, plan, c, u);
      c.wash2 = { key, canvas };
    }
  }
  if (c.wash2) drawSlice(ctx, c.wash2.canvas, W, H, view);
}

/** Rich darks are never flat: a mottle of deeper pigment where the deep is (u: layer px to a unit). */
function mottleInto(o: CanvasRenderingContext2D, plan: Plan, u: number) {
  if (plan.zMax <= 0.5) return;
  const r = mulberry32(hash32(plan.seed, 'mottle'));
  const yFrom = deepFrom(plan);
  o.save();
  for (let i = 0; i < 26; i++) {
    const x = r() * plan.w;
    const y = yFrom + r() * (plan.h - yFrom);
    const rad = (90 + r() * 260) * u;
    const lift = r() < 0.4;
    const a = (lift ? 0.05 : 0.1) * (0.5 + r() * 0.5);
    const gr = o.createRadialGradient(x * u, y * u, 0, x * u, y * u, rad);
    const col = lift ? (plan.ground === 'night' ? '60, 72, 92' : '226, 224, 214') : plan.ground === 'night' ? '4, 4, 10' : '18, 24, 52';
    gr.addColorStop(0, `rgba(${col}, ${a})`);
    gr.addColorStop(0.5, `rgba(${col}, ${a * 0.5})`);
    gr.addColorStop(1, `rgba(${col}, 0)`);
    o.fillStyle = gr;
    o.fillRect(x * u - rad, y * u - rad, rad * 2, rad * 2);
  }
  o.restore();
}

/** The page's lower corners, darker still: the fall-away, not a lens's vignette (no rim, no circle). */
function vignetteInto(o: CanvasRenderingContext2D, plan: Plan, c: Caches, u: number) {
  const f = fallOf(plan, c);
  const [r, g, b] = rgbOf(f.deep);
  const R = Math.max(plan.w, plan.h) * 0.55 * u;
  o.save();
  for (const sx of [0, plan.w * u]) {
    const cy = plan.h * u * 1.05;
    const gr = o.createRadialGradient(sx, cy, 0, sx, cy, R);
    const a = plan.ground === 'paper' ? 0.32 : 0.4;
    gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a})`);
    gr.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${a * 0.6})`);
    gr.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${a * 0.18})`);
    gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    o.fillStyle = gr;
    o.fillRect(sx - R, cy - R, R * 2, R * 2);
  }
  o.restore();
}

function deepFrom(plan: Plan): number {
  for (const s of plan.zStops) if (s.z >= 0.5) return s.y;
  return plan.h;
}

/* ---- What stands in the light ---- */

/** A soft full-picture layer, drawn back up: only the slice in sight, a pixel wider each way so strips join. */
function drawSlice(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, W: number, H: number, view: View) {
  const kx = layer.width / W;
  const ky = layer.height / H;
  const sx = Math.max(0, Math.floor(view.x0 * kx) - 1);
  const sy = Math.max(0, Math.floor(view.y0 * ky) - 1);
  const sw = Math.min(layer.width, Math.ceil(view.x1 * kx) + 1) - sx;
  const sh = Math.min(layer.height, Math.ceil(view.y1 * ky) + 1) - sy;
  if (sw > 0 && sh > 0) ctx.drawImage(layer, sx, sy, sw, sh, sx / kx, sy / ky, sw / kx, sh / ky);
}

/** The shafts, laid once on a clear layer and faded out below the light. */
function rayLayer(
  plan: Plan,
  c: Caches,
  W: number,
  H: number,
  rs: number,
  litPx: number,
  rays: Parameters<typeof drawGodRays>[3],
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${W}|${H}`;
  if (c.rays?.key === key) return c.rays.canvas;
  const lw = Math.max(1, Math.round(W / rs));
  const lh = Math.max(1, Math.round(H / rs));
  const canvas = document.createElement('canvas');
  canvas.width = lw;
  canvas.height = lh;
  const o = canvas.getContext('2d');
  if (!o) return null;
  drawGodRays(o, W / rs, H / rs, rays);
  if (plan.ground === 'paper') {
    // A pale ray barely shows on pale water: laid on harder, once, here
    // rather than twice a strip.
    o.globalCompositeOperation = 'lighter';
    o.globalAlpha = 0.6;
    o.drawImage(canvas, 0, 0);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }
  // The water swallows the light: gone by the end of the twilight, slowly.
  const fade = o.createLinearGradient(0, 0, 0, litPx / rs);
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.35, 'rgba(0, 0, 0, 0.8)');
  fade.addColorStop(0.7, 'rgba(0, 0, 0, 0.35)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  o.globalCompositeOperation = 'destination-in';
  o.fillStyle = fade;
  o.fillRect(0, 0, lw, lh);
  c.rays = { key, canvas };
  return canvas;
}

/** How far down the page the light from above reaches, in units. */
function litDepth(plan: Plan): number {
  for (const s of plan.zStops) if (s.z >= 0.62) return Math.max(plan.h * 0.4, s.y * 1.2);
  return plan.h;
}

function occluderOf(plan: Plan, c: Caches): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${plan.w}|${plan.h}`;
  if (c.occluder?.key === key) return c.occluder.canvas;
  // Soft shadows want no detail: a mask a few hundred pixels across,
  // stretched over the picture.
  const k = 900 / Math.max(plan.w, plan.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(plan.w * k));
  canvas.height = Math.max(1, Math.round(plan.h * k));
  const o = canvas.getContext('2d');
  if (!o) return null;
  o.scale(k, k);
  o.fillStyle = '#000';
  for (const j of plan.jellies) {
    if (j.far) continue;
    o.globalAlpha = 0.7;
    o.beginPath();
    o.ellipse(j.x, j.y, j.r, j.r * 0.42 * j.aspect, 0, 0, Math.PI * 2);
    o.fill();
    o.globalAlpha = 0.18;
    o.fillRect(j.x - j.r * 0.6, j.y, j.r * 1.2, j.len * 0.8);
  }
  for (const r of plan.rocks) {
    if (r.plane === 0) continue;
    o.globalAlpha = 0.85;
    const pts = rockOutline(r, plan.w);
    o.beginPath();
    o.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) o.lineTo(pts[i], pts[i + 1]);
    o.closePath();
    o.fill();
  }
  if (plan.kelp) {
    for (const r of plan.rocks) {
      if (r.kind !== 'kelp') continue;
      o.globalAlpha = 0.25;
      o.fillRect(r.edge < 0 ? 0 : plan.w * 0.84, 0, plan.w * 0.16, plan.kelp.bottom);
    }
  }
  for (const a of plan.cast) {
    if (a.layer === 0) continue;
    o.globalAlpha = a.layer === 2 ? 0.7 : 0.4;
    const parts = a.members ? a.members.map((m) => ({ x: a.x + m.dx, y: a.y + m.dy, len: m.len })) : [{ x: a.x, y: a.y, len: a.len }];
    for (const p of parts) {
      o.beginPath();
      o.ellipse(p.x, p.y, p.len * 0.42, p.len * 0.16, 0, 0, Math.PI * 2);
      o.fill();
    }
  }
  c.occluder = { key, canvas };
  return canvas;
}

/* ---- The animals ---- */

function speciesOf(c: Caches, zone: number, slot: number): Species | null {
  return c.biome.pools[zone]?.[slot] ?? null;
}

/** A canvas's own pixels mixed toward a colour, kept: how the far plane is taken by the water. */
function hazedCanvas(c: Caches, src: HTMLCanvasElement, color: string, mix: number): HTMLCanvasElement {
  if (typeof document === 'undefined') return src;
  let byColor = c.hazed.get(src);
  if (!byColor) {
    byColor = new Map();
    c.hazed.set(src, byColor);
  }
  const key = `${color}|${mix}`;
  const hit = byColor.get(key);
  if (hit) return hit;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const o = out.getContext('2d');
  if (!o) return src;
  o.drawImage(src, 0, 0);
  o.globalCompositeOperation = 'source-atop';
  o.globalAlpha = mix;
  o.fillStyle = color;
  o.fillRect(0, 0, out.width, out.height);
  byColor.set(key, out);
  return out;
}

function paintCast(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, ambient: number, layer: 0 | 1 | 2, inSight: InSight) {
  for (const a of plan.cast) {
    if (a.layer !== layer) continue;
    if (!inSight(a.box.x0, a.box.y0, a.box.x1, a.box.y1, a.len * 0.6 + 10)) continue;
    const sp = speciesOf(c, a.zone, a.slot);
    if (!sp) continue;
    const water = waterAtY(plan, c, a.y);
    const dark = water.dark;
    const parts = a.members ? a.members.map((m) => ({ x: a.x + m.dx, y: a.y + m.dy, len: m.len, phase: m.phase })) : [{ x: a.x, y: a.y, len: a.len, phase: a.phase }];
    // Far ones keep their full drawing and are taken by the water: their own
    // pixels mixed toward it, then laid faint. No haze disc behind them.
    const haze = layer === 0 ? water.top : null;
    for (const p of parts) {
      const sprite = c.sprites.get(sp, p.len, dark, D, a.rare);
      if (!sprite) continue;
      const use: Sprite = haze ? { canvas: hazedCanvas(c, sprite.canvas, haze, FAR_MIX), w: sprite.w, h: sprite.h } : sprite;
      const v: Visitor = { key: a.id, species: sp, layer: a.layer, x: p.x, y: p.y, len: p.len, dir: a.dir, age: 0.5, alpha: a.alpha, phase: p.phase };
      drawVisitor(ctx, use, v, D, ambient, a.alpha, a.floor ? 1 : 6);
    }
  }
}

/* ---- The jellies ---- */

function paintJelly(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, j: PlacedJelly, D: number, view: View) {
  const key = `${j.block}|${D}`;
  let made = c.jellies.get(key);
  if (!made) {
    const m = renderJelly(plan, c, j, D);
    if (!m) return;
    made = m;
    // Strips of one picture share a scale; a new scale is a new picture.
    for (const k of c.jellies.keys()) if (!k.endsWith(`|${D}`)) c.jellies.delete(k);
    c.jellies.set(key, made);
  }
  ctx.save();
  ctx.globalAlpha = j.alpha;
  blit(ctx, made.canvas, j.x * D - made.ox, j.y * D - made.oy, view);
  ctx.restore();
  // In the sunlit water the light off the surface plays over the bell.
  const strength = 0.55 * Math.max(0, 1 - zAt(plan, j.y) / 0.3) * (j.far ? 0 : 1);
  if (strength > 0.02) {
    const bw = j.r * D;
    const bh = j.r * 0.42 * j.aspect * D;
    const box = { x: j.x * D - bw, y: j.y * D - bh, w: bw * 2, h: bh * 2 };
    const region = new Path2D();
    region.ellipse(j.x * D, j.y * D, bw, bh, 0, Math.PI, Math.PI * 2);
    region.closePath();
    causticsOn(ctx, region, box, strength, D, hash32(plan.seed, 'jelly', j.block));
  }
}

function renderJelly(plan: Plan, c: Caches, j: PlacedJelly, D: number): { canvas: HTMLCanvasElement; ox: number; oy: number } | null {
  if (typeof document === 'undefined') return null;
  const genome = jellyForBlock(plan.key, j.block);
  let shape = c.shapes.get(j.block);
  if (!shape) {
    shape = buildJelly(hash32(plan.key, 'bloom', j.block), j.body);
    c.shapes.set(j.block, shape);
  }
  const R = j.r * D;
  const aspect = shape.aspect;
  const padTop = R * 0.75;
  const bh = 0.8 * R * aspect;
  const L = j.len * D;
  const cw = Math.ceil(R * 4.8);
  const ch = Math.ceil(padTop + bh + L + R * 0.5);
  // The frame is measured so the bell is R and the trails hang L: the floor
  // it would reach at full length is below the canvas.
  const floor = padTop + 5 * R;
  const maxL = floor - (padTop + bh);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const o = canvas.getContext('2d');
  if (!o) return null;
  const water = waterAtY(plan, c, j.y);
  const tint = mixHex(plan.color, HUES[genome.hue] ?? plan.color, genome.hueMix);
  const dark = water.dark;
  const ink = jellyInk(tint, dark ? NIGHT : PAPER, dark);
  drawJelly(o, shape, cw, ch, {
    progress: Math.min(1, Math.max(0.42, L / maxL)),
    // No halo of its own: it would be cut square at the edge of this little
    // canvas. The hero's pool and the light pass light the water instead.
    ink: { ...ink, snow: undefined, glow: undefined },
    padTop,
    widthFill: R / (cw * 0.2),
    baseOffset: ch - floor,
    // The pen's weight: only the hero is drawn at full weight.
    px: D * j.weight,
    pulse: j.hero ? 0.25 : 0.1,
    time: 4000 + (hash32(plan.key, 'jelly-time', j.block) % 20000),
    bubbles: j.hero,
  });
  if (j.far || j.alpha < 0.8) {
    // Older ones are taken by the water: far ones mostly, the others a little.
    o.globalCompositeOperation = 'source-atop';
    o.globalAlpha = j.far ? FAR_MIX : 0.2;
    o.fillStyle = water.top;
    o.fillRect(0, 0, cw, ch);
  }
  return { canvas, ox: cw / 2, oy: padTop + bh / 2 };
}

/** How lit a point (units) is by the jellies, 0 to 1, for the snow. */
function jellyLight(plan: Plan, x: number, y: number): number {
  let best = 0;
  for (const j of plan.jellies) {
    if (j.far) continue;
    const d = Math.hypot(x - j.x, (y - j.y - j.r) / 1.3) / (j.r * 3.2);
    best = Math.max(best, Math.exp(-d * d) * (j.hero ? 1 : 0.5));
  }
  return best;
}

function lightsOf(plan: Plan, c: Caches, D: number): Light[] {
  const lights: Light[] = [];
  const darkAt = (y: number) => plan.ground === 'night' || lumOf(waterTone(plan, c, y)) < 0.45;
  for (const j of plan.jellies) {
    // The hero's light is its pool; the far ones give none.
    if (j.hero || j.far) continue;
    const z = zAt(plan, j.y);
    const body = jellyForBlock(plan.key, j.block);
    const tint = mixHex(plan.color, HUES[body.hue] ?? plan.color, body.hueMix);
    const deep = Math.max(0, Math.min(1, (z - 0.35) / 0.4));
    const s = 0.22 * j.alpha * (plan.ground === 'night' ? 0.5 + 0.5 * deep : deep);
    if (s > 0.02) lights.push({ x: j.x * D, y: (j.y + j.r * 0.4) * D, r: j.r * 3.2 * D, color: mixHex(tint, '#FFFFFF', 0.45), strength: s, dark: darkAt(j.y) });
  }
  let lit = 0;
  for (const a of [...plan.cast].sort((p, q) => q.layer - p.layer || q.len - p.len)) {
    if (lit >= 4) break;
    const sp = speciesOf(c, a.zone, a.slot);
    if (!sp || !sp.genome.lit || a.layer === 0) continue;
    lit++;
    const z = zAt(plan, a.y);
    if (z < 0.45 && plan.ground === 'paper') continue;
    const glow = ['#9FE8FF', '#B8FFD9', '#FFD9A0', '#E3C2FF'][Math.max(0, Math.min(3, Math.round(sp.genome.glow)))];
    lights.push({ x: a.x * D, y: a.y * D, r: a.len * 1.1 * D, color: mixHex(glow, '#F6F0E2', 0.4), strength: 0.22, dark: darkAt(a.y) });
  }
  for (const e of plan.events) {
    if (e.kind === 'lure') lights.push({ x: e.x * D, y: e.y * D, r: 90 * D, color: '#BFF3E6', strength: 0.4, dark: darkAt(e.y), core: true });
    if (e.kind === 'storm') lights.push({ x: e.x * D, y: e.y * D, r: 260 * D, color: '#9FD8C8', strength: 0.06, dark: darkAt(e.y) });
  }
  return lights;
}

/* ---- The bubbles ---- */

function paintBubbles(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, inSight: InSight) {
  ctx.save();
  ctx.lineWidth = Math.max(0.5, 0.45 * D);
  for (const b of plan.bubbles) {
    if (!inSight(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r, 2)) continue;
    const water = waterAtY(plan, c, b.y);
    ctx.beginPath();
    ctx.arc(b.x * D, b.y * D, b.r * D, 0, Math.PI * 2);
    ctx.fillStyle = water.dark ? 'rgba(232, 224, 207, 0.12)' : 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    ctx.strokeStyle = water.dark ? 'rgba(232, 224, 207, 0.55)' : 'rgba(43, 38, 32, 0.45)';
    ctx.stroke();
  }
  ctx.restore();
}

/* ---- The places ---- */

function paintKelp(ctx: CanvasRenderingContext2D, plan: Plan, kelp: Kelp, c: Caches, D: number, ambient: number, inSight: InSight) {
  if (!plan.kelp) return;
  const top = plan.kelp.top;
  const hf = (plan.kelp.bottom - top) / 2.45;
  const keep = new Set(plan.kelp.keep);
  // Each side's forest in a frame as wide as the page's short side, at its
  // own wall: a wide page shows more open water, not wider kelp.
  const fw = Math.min(plan.w, plan.h);
  const sides = kelp.ledges.map((ledge) => ({
    x: ledge.edge < 0 ? 0 : plan.w - fw,
    forest: { stalks: kelp.stalks.filter((st, i) => keep.has(i) && (st.x < 0.5 ? -1 : 1) === ledge.edge), ledges: [ledge] } as Kelp,
  }));
  // The forest is drawn as the live sea draws it, a frame at a time, the
  // frames stacked down the page from a little under its top, so the
  // canopy along the surface is inside the page: three frames from the
  // canopy to the rock its holdfasts grip.
  for (let k = 0; k < 3; k++) {
    if (!inSight(0, k ? top + k * hf : 0, plan.w, k === 2 ? plan.h : top + (k + 1) * hf)) continue;
    const water = waterAtY(plan, c, top + (k + 0.5) * hf);
    const focus = (k * 60) / 0.19;
    ctx.save();
    ctx.beginPath();
    const y0 = (top + k * hf) * D;
    const y1 = k === 2 ? plan.h * D : (top + (k + 1) * hf) * D;
    ctx.rect(-plan.w * D, k ? y0 : 0, plan.w * 3 * D, y1 - (k ? y0 : 0));
    ctx.clip();
    ctx.translate(0, y0);
    for (const side of sides) {
      ctx.save();
      ctx.translate(side.x * D, 0);
      drawKelp(ctx, fw * D, hf * D, side.forest, focus, water, ambient, c.biome.env.current, D, undefined, true, { page: plan.h * D });
      ctx.restore();
    }
    ctx.restore();
  }
}

/** The top of a rock at page x (units), or null. */
function rockTopAt(k: PlacedRock, w: number, x: number): number | null {
  const span = (k.off + k.reach) * w;
  const u = k.edge < 0 ? (x + k.off * w) / span : (w + k.off * w - x) / span;
  if (u < 0 || u > 1) return null;
  const N = k.shape.top.length - 1;
  const f = u * N;
  const i0 = Math.floor(f);
  const i1 = Math.min(N, i0 + 1);
  const t = f - i0;
  return k.y + (k.shape.top[i0] * (1 - t) + k.shape.top[i1] * t) * k.height;
}

/* ---- Rock ---- */

/** What grows on rock at each depth, with the light: the live sea's kits. */
const GROWTH_KITS: GrowthKind[][] = [
  ['branch', 'fan', 'tube', 'brain', 'anemone', 'fan', 'tube'],
  ['plate', 'fan', 'whip', 'tube', 'fan'],
  ['glass', 'seapen', 'whip', 'glass'],
];
/** The course pastels, not the grey. */
const REEF = HUES.map((_, i) => i).filter((i) => HUES[i] !== '#9AA3AB');

/** Room above a rock for what grows on it, in units. */
const GROWTH_ROOM = 70;

function paintRock(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, k: PlacedRock, D: number, inSight: InSight, view: View) {
  if (!inSight(k.box.x0 - 30, k.box.y0 - GROWTH_ROOM, k.box.x1 + 30, k.box.y1, 4)) return;
  const key = `${k.kind}|${k.rest}|${k.slot}|${k.edge}|${D}`;
  let made = c.rocks.get(key);
  if (!made) {
    const m = renderRock(plan, c, k, D);
    if (!m) return;
    made = m;
    for (const kk of c.rocks.keys()) if (!kk.endsWith(`|${D}`)) c.rocks.delete(kk);
    c.rocks.set(key, made);
  }
  ctx.save();
  ctx.globalAlpha = k.plane === 0 ? FAR_ALPHA : 1;
  blit(ctx, made.canvas, made.x, made.y, view);
  ctx.restore();
}

/**
 * A rock from a wall in the shared engine's pen and wash (`inkRock`, as the
 * live sea's outcrops and the kelp's ledge are drawn): the silhouette the
 * plan placed, its foot let go of into the water, what grows at its depth
 * along the top (`drawGrowth`). The middle plane is then taken a little by
 * the water, the far one mostly, by mixing the rock's own pixels toward it.
 * Laid once into a canvas of its own at the picture's scale.
 */
function renderRock(plan: Plan, c: Caches, k: PlacedRock, D: number): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  if (typeof document === 'undefined') return null;
  const w = plan.w;
  const span = (k.off + k.reach) * w;
  const room = k.plane === 0 ? 10 : GROWTH_ROOM;
  const bx0 = Math.max(-10, k.box.x0 - 30);
  const bx1 = Math.min(w + 10, k.box.x1 + 30);
  const by0 = k.box.y0 - room;
  // Room under it for its foot to go on down into the water.
  const by1 = k.box.y1 + Math.max(span * 0.25, plan.h * 0.09);
  const cw = Math.max(1, Math.ceil((bx1 - bx0) * D));
  const chh = Math.max(1, Math.ceil((by1 - by0) * D));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = chh;
  const o = canvas.getContext('2d');
  if (!o) return null;
  const ox = Math.floor(bx0 * D);
  const oy = Math.floor(by0 * D);
  const S = span * D;
  const dir: 1 | -1 = k.edge < 0 ? 1 : -1;
  const night = plan.ground === 'night';
  const water = waterAtY(plan, c, k.y + k.height * 0.5);
  const detail = k.plane === 2 ? 1 : k.plane === 1 ? 0.75 : 0.4;
  const pen = D * (k.plane === 2 ? 1 : k.plane === 1 ? 0.8 : 0.6);
  o.lineCap = 'round';
  o.lineJoin = 'round';
  // Each of its parts in the engine's pen, on a layer of its own (the
  // engine lets each one's foot go by erasing), the back one first.
  const layer = document.createElement('canvas');
  layer.width = cw;
  layer.height = chh;
  const lo = layer.getContext('2d');
  k.shape.parts.forEach((part, i) => {
    const target = i === 0 ? o : lo;
    if (!target) return;
    if (i > 0) target.clearRect(0, 0, cw, chh);
    const ps = part.span * S;
    const shape = rockShape(part.seed, ps, part.thick * ps, D);
    const x0 = rockX(k, w, part.at) * D - ox;
    const y0 = (k.y + (k.shape.lift + part.dy) * span) * D - oy;
    target.lineCap = 'round';
    target.lineJoin = 'round';
    inkRock(target, shape, { x0, y0, dir }, { ...rockStyle(water, night, pen, detail, hash32(k.seed, 'part', i)), barnacles: k.zone < 2 && k.plane === 2 && i === k.shape.parts.length - 1 });
    if (i > 0) o.drawImage(layer, 0, 0);
  });
  const N = k.shape.top.length - 1;
  const crestAt = (u: number) => {
    const f = Math.max(0, Math.min(N, u * N));
    const i0 = Math.floor(f);
    const i1 = Math.min(N, i0 + 1);
    return k.y + (k.shape.top[i0] * (1 - (f - i0)) + k.shape.top[i1] * (f - i0)) * k.height;
  };
  // What grows on it: on the near and middle rocks only, nothing in the haze.
  if (k.plane > 0) {
    const r = mulberry32(hash32(k.seed, 'growths'));
    const zone = Math.min(2, k.zone);
    const kit = GROWTH_KITS[zone];
    const count = (k.plane === 2 ? 2 : 1) + Math.floor(r() * 3);
    const hues = [REEF[Math.floor(r() * REEF.length)], REEF[Math.floor(r() * REEF.length)]];
    const visibleFrom = k.off / (k.off + k.reach) + 0.05;
    const grown: { u: number; g: Growth }[] = [];
    for (let i = 0; i < count; i++) {
      const at = visibleFrom + ((0.86 - visibleFrom) * (i + 0.2 + r() * 0.6)) / count;
      const kind = kit[Math.floor(r() * kit.length)];
      // Sponges a hand's height on the page (0.015 to 0.03 of it); fans and corals a little more.
      const tall = plan.h * (kind === 'tube' ? 0.015 + 0.015 * r() : 0.02 + 0.016 * r()) * (k.plane === 2 ? 1 : 0.8);
      grown.push({ u: at * S, g: { kind, at, size: tall, hue: hues[i % 2], seed: (r() * 4294967296) >>> 0 } });
    }
    // The ones by the wall last, over the smaller ones out on the rock.
    grown.sort((a, b) => b.u - a.u);
    for (const { u, g } of grown) {
      o.save();
      o.translate(rockX(k, w, u / S) * D - ox, crestAt(u / S) * D - oy + 2 * D);
      drawGrowth(o, g, zone, night, D * (k.plane === 2 ? 1 : 0.8));
      o.restore();
    }
  }
  footInto(o, plan, k, D, ox, oy, cw, chh, water, night);
  // The water between: the middle a little taken by it, the far mostly.
  if (k.plane < 2) {
    o.globalCompositeOperation = 'source-atop';
    o.globalAlpha = k.plane === 0 ? FAR_MIX : MID_MIX;
    o.fillStyle = water.top;
    o.fillRect(0, 0, cw, chh);
  }
  if (k.plane === 0) farOutline(o, k, D, cw, chh, night);
  return { canvas, x: ox, y: oy };
}

/**
 * A mask of a rock (its own canvas's pixels): opaque from the canvas's top
 * down to a line along the rock (`line`, a share of its box at each u),
 * then falling off linearly over `fall` units below it. Built from copies
 * of the region slid down, added: no per-column work.
 */
function rockMask(plan: Plan, k: PlacedRock, D: number, ox: number, oy: number, cw: number, chh: number, line: number[], fall: number, from: number[] | null = null): HTMLCanvasElement | null {
  const m = document.createElement('canvas');
  m.width = cw;
  m.height = chh;
  const g = m.getContext('2d');
  if (!g) return null;
  const N = line.length - 1;
  // Past the lip it holds the lowest the rock's last stretch comes, so
  // nothing of it is cut square there.
  let lipLow = 0;
  for (let i = Math.floor(N * 0.75); i <= N; i++) lipLow = Math.max(lipLow, line[i]);
  const ys = (v: number, dy: number) => (k.y + v * k.height + dy) * D - oy;
  const xs = (u: number) => rockX(k, plan.w, u) * D - ox;
  const far = k.edge < 0 ? cw + 4 : -4;
  const near = k.edge < 0 ? -4 : cw + 4;
  const region = (dy: number) => {
    const p = new Path2D();
    if (from) {
      // From the rock's own top (a little inside it), not the canvas's.
      p.moveTo(xs(0), ys(from[0], 0) + 3 * D);
      for (let i = 1; i <= N; i++) p.lineTo(xs(i / N), ys(Math.max(from[i], (from[i] + line[i]) / 2 - 0.02), 0) + 3 * D);
      for (let i = N; i >= 0; i--) p.lineTo(xs(i / N), ys(line[i], dy));
      p.closePath();
      return p;
    }
    p.moveTo(near, -4);
    p.lineTo(far, -4);
    p.lineTo(far, ys(lipLow, dy));
    p.lineTo(xs(1.08), ys(lipLow, dy));
    for (let i = N; i >= 0; i--) p.lineTo(xs(i / N), ys(line[i], dy));
    p.lineTo(near, ys(line[0], dy));
    p.closePath();
    return p;
  };
  g.fillStyle = '#000';
  g.fill(region(0));
  g.globalCompositeOperation = 'lighter';
  const M = 14;
  g.globalAlpha = 1 / M;
  for (let i = 1; i <= M; i++) g.fill(region((fall * i) / M));
  return m;
}

/**
 * The rock's foot, let go of into the water: below where its silhouette
 * stops reading, a wash of its own colour carries it on down a fifteenth of
 * the page, thinning to nothing, so it reads as the top of a wall going
 * down out of sight, never an island nor a skirt with a hard hem; and
 * whatever the pen left lower than that is faded out the same way.
 */
function footInto(o: CanvasRenderingContext2D, plan: Plan, k: PlacedRock, D: number, ox: number, oy: number, cw: number, chh: number, water: Water, night: boolean) {
  const fall = plan.h * 0.065;
  const body = rockMask(plan, k, D, ox, oy, cw, chh, k.shape.solid, fall, k.shape.top);
  const cut = rockMask(plan, k, D, ox, oy, cw, chh, k.shape.under, fall * 0.9);
  if (!body || !cut) return;
  // The wash: the rock's colour through the mask, under what the pen drew.
  const bg = body.getContext('2d');
  if (bg) {
    bg.globalCompositeOperation = 'source-in';
    bg.globalAlpha = 1;
    const style = rockStyle(water, night, D, 0.5, 0);
    bg.fillStyle = mixHex(style.rock, water.top, night ? 0.35 : 0.3);
    bg.fillRect(0, 0, cw, chh);
    // Out toward the lip it thins away sideways too: no edge drops from it.
    const xa = rockX(k, plan.w, 0.55) * D - ox;
    const xb = rockX(k, plan.w, 0.98) * D - ox;
    const side = bg.createLinearGradient(xa, 0, xb, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(1, 'rgba(0,0,0,0)');
    bg.globalCompositeOperation = 'destination-in';
    bg.fillStyle = side;
    bg.fillRect(0, 0, cw, chh);
  }
  o.save();
  o.globalCompositeOperation = 'destination-in';
  o.drawImage(cut, 0, 0);
  o.globalCompositeOperation = 'destination-over';
  o.globalAlpha = 0.5;
  o.drawImage(body, 0, 0);
  o.restore();
}

/**
 * A far rock's edge: a fine broken line (0.4 of the pen) along the top it
 * really drew, so in the haze it is still a rock and never a lineless
 * smoke. Laid strong enough that, the far plane's faintness taken off, it
 * shows at 0.3.
 */
function farOutline(o: CanvasRenderingContext2D, k: PlacedRock, D: number, cw: number, chh: number, night: boolean) {
  let data: Uint8ClampedArray;
  try {
    data = o.getImageData(0, 0, cw, chh).data;
  } catch {
    return;
  }
  const step = Math.max(1, Math.round(2 * D));
  const runs: number[][] = [];
  let run: number[] = [];
  for (let x = 0; x < cw; x += step) {
    let top = -1;
    for (let y = 0; y < chh; y++) {
      if (data[(y * cw + x) * 4 + 3] > 140) {
        top = y;
        break;
      }
    }
    if (top < 0) {
      if (run.length >= 8) runs.push(run);
      run = [];
      continue;
    }
    run.push(x, top + 0.5 * D);
  }
  if (run.length >= 8) runs.push(run);
  runs.forEach((pts, i) => {
    inkLine(o, pts, false, {
      width: 0.4 * D,
      color: night ? INK_NIGHT : INK,
      alpha: Math.min(1, 0.3 / FAR_ALPHA),
      lost: 0.45,
      swell: 0.35,
      taper: [0.06, 0.12],
      seed: hash32(k.seed, 'far-line', i),
    });
  });
}

/* ---- Against the light ---- */

/**
 * The window of sky and the fish against it, laid once into a clear layer
 * of their own at a few thousand pixels at most, and placed per strip. The
 * layer is wide enough that every glow in it has died to nothing before its
 * edge, so it never shows as a seam.
 */
function windowLayer(
  plan: Plan,
  c: Caches,
  D: number,
  sun: ReturnType<typeof sunFor>,
  night: boolean,
  wx0: number,
  wx1: number,
  wy1: number,
): { canvas: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  const key = `${D}`;
  if (c.window?.key === key) return c.window;
  const k = Math.min(1, 2400 / ((wx1 - wx0) * D));
  const lw = Math.max(1, Math.round((wx1 - wx0) * D * k));
  const lh = Math.max(1, Math.round(wy1 * D * k));
  const canvas = document.createElement('canvas');
  canvas.width = lw;
  canvas.height = lh;
  const o = canvas.getContext('2d');
  if (!o) return null;
  o.scale(lw / ((wx1 - wx0) * D), lh / (wy1 * D));
  o.translate(-wx0 * D, 0);
  const win = plan.window;
  const S = Math.min(plan.w, plan.h);
  drawSnellWindow(o, (wx1 - wx0) * D, wy1 * D, {
    cx: win.x * D,
    cy: win.y * D,
    radius: win.r * D,
    sun,
    moon: plan.moon,
    dark: night,
    px: D,
    seed: plan.seed,
    moonRadius: (0.018 + 0.007 * ((plan.seed % 100) / 100)) * S * D,
  });
  paintSilhouettes(o, plan, D);
  c.window = { key, canvas };
  return c.window;
}

/** A few fish overhead, dark against the window of sky, as they are from below: after the moon. */
function paintSilhouettes(ctx: CanvasRenderingContext2D, plan: Plan, D: number) {
  const r = mulberry32(hash32(plan.seed, 'overhead'));
  const win = plan.window;
  const n = 3 + Math.floor(r() * 4);
  const dir = plan.current;
  const cx = win.x + (r() - 0.5) * win.r * 0.6;
  const cy = win.y + win.r * 0.12;
  ctx.save();
  ctx.fillStyle = '#3A4048';
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * win.r * 1.0;
    const y = cy + (r() - 0.5) * win.r * 0.24;
    const len = (8 + r() * 8) * (i === 0 ? 1.35 : 1);
    ctx.save();
    ctx.translate(x * D, y * D);
    ctx.scale(dir * D, D);
    ctx.globalAlpha = 0.5 + r() * 0.15;
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.5, len * 0.14, 0, 0, Math.PI * 2);
    ctx.moveTo(-len * 0.42, 0);
    ctx.lineTo(-len * 0.68, -len * 0.14);
    ctx.lineTo(-len * 0.62, 0);
    ctx.lineTo(-len * 0.68, len * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ---- The floor and the trench ---- */

/**
 * The floor: the bottom tenth or so of the page, its line undulating,
 * receding (lighter and hazier at the back, where it meets the water) and
 * coming forward darker, its stipple thickening toward the front. Past three
 * hours the trench: walls from both edges falling to a cleft under the hero,
 * the cleft darkening to the bottom of the sea.
 */
/** The floor's colours: at the back nearly the water, coming forward darker. */
function siltColors(plan: Plan, c: Caches): { back: string; front: string; top: number } {
  const night = plan.ground === 'night';
  const top = plan.trench ? plan.trench.top : plan.floor ? plan.floor.y : plan.h;
  const water = waterTone(plan, c, top);
  // Lighter and hazier at the back, where it meets the water; darker coming forward.
  const back = night ? mixHex(water, '#9A9282', 0.28) : mixHex(water, '#DCD6C6', 0.38);
  const front = mixHex(waterTone(plan, c, plan.h), night ? '#05060A' : INK, night ? 0.4 : 0.38);
  return { back, front, top };
}

/** The floor's colour at a depth on it, as its gradient lays it. */
function siltAt(plan: Plan, c: Caches, y: number): string {
  const { back, front, top } = siltColors(plan, c);
  const t = Math.max(0, Math.min(1, (y - (top - 6)) / Math.max(1, plan.h - top + 6)));
  return t < 0.3 ? mixHex(back, mixHex(back, front, 0.45), t / 0.3) : mixHex(mixHex(back, front, 0.45), front, (t - 0.3) / 0.7);
}

function paintFloor(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, view: View) {
  if (!plan.floor) return;
  const H = plan.h * D;
  const night = plan.ground === 'night';
  const t = plan.trench;
  const yBack = t ? t.top : plan.floor.y;
  const water = waterTone(plan, c, yBack);
  const r = mulberry32(hash32(plan.seed, 'silt'));
  const ink = night ? INK_NIGHT : INK;
  const lightInk = night ? 'rgba(232, 224, 207, ' : 'rgba(243, 238, 226, ';
  const step = 4;
  const lineAt = (x: number) => Math.min(plan.h + 2, floorAt(plan, x));
  const { back, front } = siltColors(plan, c);

  if (t) {
    // Between the walls the water goes down into the dark, to the bottom of the sea.
    const v = new Path2D();
    const l = t.x - t.gap / 2;
    const rr = t.x + t.gap / 2;
    v.moveTo(-20 * D, t.top * D);
    for (let x = 0; x <= l; x += step) v.lineTo(x * D, lineAt(x) * D);
    v.lineTo(l * D, H + 2);
    v.lineTo(rr * D, H + 2);
    for (let x = rr; x <= plan.w; x += step) v.lineTo(x * D, lineAt(x) * D);
    v.lineTo((plan.w + 20) * D, t.top * D);
    v.closePath();
    const [ar, ag, ab] = rgbOf(ABYSS);
    const gg = ctx.createLinearGradient(0, (t.top + (plan.h - t.top) * 0.15) * D, 0, H);
    gg.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0)`);
    gg.addColorStop(0.4, `rgba(${ar}, ${ag}, ${ab}, 0.35)`);
    gg.addColorStop(0.75, `rgba(${ar}, ${ag}, ${ab}, 0.8)`);
    gg.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 1)`);
    ctx.save();
    ctx.fillStyle = gg;
    ctx.fill(v);
    ctx.restore();
  }

  if (!t) {
    // The floor recedes: two lower ridges behind its line, each higher up
    // the page and hazier the farther back, overlapping where they cross.
    const f = plan.floor;
    for (let ri = 2; ri >= 1; ri--) {
      const lift = plan.h * (ri === 2 ? 0.022 : 0.011);
      const ph = f.phase * (1.7 + ri) + ri * 2.1;
      const amp = f.amp * (0.7 + 0.3 * ri);
      const k = plan.w / 1000;
      const ridge = new Path2D();
      ridge.moveTo(-20 * D, H + 2);
      const crest: number[] = [];
      for (let x = -20; x <= plan.w + 20; x += step) {
        // Each ridge rises and sinks below the one in front along its length.
        const y = plan.floor.y - lift + amp * (0.7 * Math.sin(x / (190 * k) + ph) + 0.3 * Math.sin(x / (61 * k) + ph * 1.3)) + plan.h * 0.012 * Math.sin(x / (430 * k) + ph * 0.7);
        ridge.lineTo(x * D, y * D);
        crest.push(x * D, y * D);
      }
      ridge.lineTo((plan.w + 20) * D, H + 2);
      ridge.closePath();
      ctx.save();
      ctx.fillStyle = mixHex(back, water, ri === 2 ? 0.62 : 0.4);
      ctx.fill(ridge);
      ctx.restore();
      inkLine(ctx, crest, false, { width: 0.6 * D, color: night ? INK_NIGHT : INK, alpha: ri === 2 ? 0.12 : 0.2, lost: 0.6, swell: 0.4, taper: [0.02, 0.05], seed: plan.seed + 31 * ri, raw: true });
    }
  }
  // The ground: one body, or in a trench its two walls, the top the floor's line.
  type Part = { body: Path2D; crest: number[]; side: -1 | 0 | 1 };
  const parts: Part[] = [];
  const spans: [number, number, -1 | 0 | 1][] = t ? [[-20, t.x - t.gap / 2, -1], [t.x + t.gap / 2, plan.w + 20, 1]] : [[-20, plan.w + 20, 0]];
  for (const [from, to, side] of spans) {
    const crest: number[] = [];
    for (let x = from; x < to; x += step) crest.push(x * D, lineAt(x) * D);
    crest.push(to * D, lineAt(side < 0 ? to - 0.01 : side > 0 ? to + 0.01 : to) * D);
    const body = new Path2D();
    body.moveTo(from * D, H + 2);
    for (let i = 0; i < crest.length; i += 2) body.lineTo(crest[i], crest[i + 1]);
    body.lineTo(to * D, H + 2);
    body.closePath();
    parts.push({ body, crest, side });
  }
  const g = ctx.createLinearGradient(0, (yBack - 6) * D, 0, H);
  g.addColorStop(0, back);
  g.addColorStop(0.3, mixHex(back, front, 0.45));
  g.addColorStop(1, front);
  for (let bi = 0; bi < parts.length; bi++) {
    const { body, crest, side } = parts[bi];
    ctx.save();
    ctx.fillStyle = g;
    ctx.fill(body);
    ctx.clip(body);
    const depth = Math.max(1, plan.h - yBack);
    const x0 = t ? (side < 0 ? 0 : t.x + t.gap / 2) : 0;
    const x1 = t ? (side < 0 ? t.x - t.gap / 2 : plan.w) : plan.w;
    if (t) {
      // A trench wall in section: strata following its face down, closer
      // and darker toward the cleft.
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      // Shade across the wall: darker as it turns down into the cleft.
      {
        const xa = (side < 0 ? x0 : x1) * D;
        const xb = (side < 0 ? x1 : x0) * D;
        const sg = ctx.createLinearGradient(xa, 0, xb, 0);
        const [sr, sgc, sb] = rgbOf(ABYSS);
        sg.addColorStop(0, `rgba(${sr}, ${sgc}, ${sb}, 0)`);
        sg.addColorStop(0.6, `rgba(${sr}, ${sgc}, ${sb}, 0.12)`);
        sg.addColorStop(1, `rgba(${sr}, ${sgc}, ${sb}, 0.45)`);
        ctx.fillStyle = sg;
        ctx.fillRect(Math.min(xa, xb), yBack * D, Math.abs(xb - xa), H - yBack * D);
      }
      for (let li = 1; li <= 26; li++) {
        const d = li * 4 + li * li * 0.3;
        ctx.globalAlpha = Math.max(0.1, 0.5 - li * 0.012) * (night ? 0.8 : 1);
        ctx.lineWidth = Math.max(0.3, 0.75 - li * 0.012) * D;
        ctx.beginPath();
        let down = false;
        for (let x = x0; x <= x1; x += step) {
          const k = (x - x0) / Math.max(1, x1 - x0);
          const toCleft = side < 0 ? k : 1 - k;
          const on = Math.sin(x * 0.045 + li * 1.7) + Math.sin(x * 0.013 + li * 0.6) > 0.2 - toCleft * 1.2;
          const y = lineAt(x) + d * (0.4 + 0.6 * toCleft);
          if (on && y < plan.h + 2) {
            if (!down) ctx.moveTo(x * D, y * D);
            else ctx.lineTo(x * D, y * D);
            down = true;
          } else down = false;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Ripples in the silt, the current's marks: small and faint at the back,
    // longer coming forward.
    ctx.lineCap = 'round';
    const ripples = Math.round(((x1 - x0) / 16) * (t ? 0.5 : 1));
    const shadowInk = night ? 'rgba(0, 0, 0, ' : 'rgba(43, 38, 32, ';
    for (let i = 0; i < ripples; i++) {
      const x = x0 + r() * (x1 - x0);
      const k = Math.pow(r(), 0.8);
      const y = lineAt(x) + 4 + k * (plan.h - lineAt(x) - 4);
      if (y > plan.h) continue;
      const len = (10 + 46 * k) * (0.6 + r() * 0.7);
      const lift = (1.2 + 2.8 * k) * D;
      // The lit face of each ripple, and its shadow just under.
      ctx.lineWidth = (0.4 + 0.6 * k) * D;
      ctx.strokeStyle = `${lightInk}${(0.14 + 0.24 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo((x - len / 2) * D, y * D);
      ctx.quadraticCurveTo(x * D, y * D - lift, (x + len / 2) * D, y * D);
      ctx.stroke();
      ctx.strokeStyle = `${shadowInk}${(0.1 + 0.2 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo((x - len * 0.4) * D, (y + 1.2) * D);
      ctx.quadraticCurveTo(x * D, (y + 1.2) * D - lift * 0.6, (x + len * 0.4) * D, (y + 1.2) * D);
      ctx.stroke();
    }
    // Stipple: sparse (no more than a dot to 600 square pixels at 1200
    // across), faint, and gathered toward the lit edge along the crest, the
    // way an engraver stipples a form's turning: never a static of specks.
    {
      const dots = new Path2D();
      const per = 1 / (600 / (1.2 * 1.2));
      const n = Math.round((x1 - x0) * depth * per);
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0);
        const k = r();
        // Thickest just under the crest, thinning down the body.
        if (r() > Math.exp(-k * 3.2) * 0.9 + 0.1) continue;
        const y = lineAt(x) + 2 + k * (plan.h - lineAt(x)) + (r() - 0.5) * 4;
        if (y > plan.h + 1) continue;
        const rad = 0.35 + 0.3 * r();
        dots.moveTo((x + rad) * D, y * D);
        dots.arc(x * D, y * D, rad * D, 0, Math.PI * 2);
      }
      ctx.globalAlpha = night ? 0.28 : 0.35;
      ctx.fillStyle = night ? INK_NIGHT : ink;
      ctx.fill(dots);
      ctx.globalAlpha = 1;
    }
    // Stones half sunk, in a few loose clusters (where the current dropped
    // them), bigger toward the front.
    const clusters = Math.max(1, Math.round((x1 - x0) / (t ? 260 : 190)));
    for (let ci = 0; ci < clusters; ci++) {
      const cx = x0 + (x1 - x0) * ((ci + 0.15 + r() * 0.7) / clusters);
      const ck = r();
      const many = 2 + Math.floor(r() * 6);
      for (let i = 0; i < many; i++) {
        const x = cx + (r() + r() + r() - 1.5) * 26;
        if (x < x0 || x > x1) continue;
        const k = Math.max(0, Math.min(1, ck + (r() - 0.5) * 0.25));
        const y = lineAt(x) + 6 + k * 0.5 * (plan.h - lineAt(x));
        if (y > plan.h) continue;
        const rx = (2 + 8 * k) * (0.5 + r() * 0.8);
        const ry = rx * (0.4 + r() * 0.25);
        const rot = (r() - 0.5) * 0.3;
        ctx.fillStyle = mixHex(front, '#000000', night ? 0.25 : 0.15);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.ellipse(x * D, y * D, rx * D, ry * D, rot, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `${lightInk}0.3)`;
        ctx.lineWidth = 0.5 * D;
        ctx.beginPath();
        ctx.ellipse(x * D, y * D, rx * D, ry * D, rot, Math.PI * 1.1, Math.PI * 1.7);
        ctx.stroke();
      }
    }
    ctx.restore();
    // The crest in one pen line, broken where the light is: lit only on
    // the wall that faces the window of sky (the light comes from it).
    const facing = !t || (plan.window.x < t.x ? side > 0 : side < 0);
    if (facing) inkLine(ctx, crest, false, { width: 0.9 * D, color: night ? '#E8E0CF' : '#F1ECDF', alpha: 0.45, lost: 0.75, swell: 0.4, taper: [0.02, 0.05], seed: plan.seed + bi, raw: true });
    else inkLine(ctx, crest, false, { width: 0.8 * D, color: ink, alpha: 0.4, lost: 0.5, swell: 0.4, taper: [0.02, 0.05], seed: plan.seed + bi, raw: true });
    if (t && side !== 0) ledgeLips(ctx, plan, t, side, D, ink, facing, night);
    if (t) {
      // Where it falls away into the cleft, in ink.
      const n = crest.length / 2;
      const lip = side < 0 ? crest.slice(Math.floor(n * 0.55) * 2) : crest.slice(0, Math.ceil(n * 0.45) * 2);
      inkLine(ctx, lip, false, { width: 0.9 * D, color: ink, alpha: 0.5, lost: 0.35, swell: 0.6, taper: [0.1, 0.3], seed: plan.seed + 7 + bi, raw: true });
    }
  }
  void view;
  // Vents, where the sitting rolled them: chimneys in the live sea's own
  // drawing, breathing a little.
  if (c.biome.env.vents) {
    for (let v = 0; v < 2; v++) {
      let vx = plan.w * (0.2 + v * 0.55 + (r() - 0.5) * 0.08);
      if (t && Math.abs(vx - t.x) < t.gap / 2 + 60) vx = t.x + Math.sign(vx - t.x || 1) * (t.gap / 2 + 80);
      // Never under the hero, where its trails would end on the chimney.
      const hero = plan.jellies[plan.jellies.length - 1];
      const keep = hero ? hero.r * 1.3 + 50 : 0;
      if (hero && Math.abs(vx - hero.x) < keep) {
        const away = vx >= hero.x ? 1 : -1;
        vx = hero.x + away * keep;
        if (vx < plan.w * 0.06 || vx > plan.w * 0.94) vx = hero.x - away * keep;
        if (t && Math.abs(vx - t.x) < t.gap / 2 + 60) continue;
      }
      const vy = lineAt(vx);
      if (vy > plan.h * 0.97) continue;
      const wid = 9 + r() * 4;
      const seed = hash32(plan.seed, 'vent', v);
      ctx.save();
      const shape = drawChimney(ctx, vx * D, (vy + 3) * D, wid * D, D, seed, night, 60 * D);
      drawPlume(ctx, vx * D + shape.mx, (vy + 3) * D + shape.my, shape.mr || wid * 0.4 * D, D, 30 + (plan.seed % 97) / 7, seed, night, plan.current);
      ctx.restore();
    }
  }
}

/**
 * A trench wall's ledges: at the edge of each bench the rock juts a little
 * over the drop below, its lip in ink and a wedge of shadow under it, and
 * the face of the drop hatched down along its strata.
 */
function ledgeLips(ctx: CanvasRenderingContext2D, plan: Plan, t: NonNullable<Plan['trench']>, side: -1 | 1, D: number, ink: string, lit: boolean, night: boolean) {
  const ledges = t.ledges?.[side < 0 ? 0 : 1] ?? [];
  const l = t.x - t.gap / 2;
  const rr = t.x + t.gap / 2;
  const xOf = (sv: number) => (side < 0 ? sv * l : plan.w - sv * (plan.w - rr));
  const r = mulberry32(hash32(plan.seed, 'lips', side));
  const [ar, ag, ab] = rgbOf(ABYSS);
  // Toward the cleft is down the wall.
  const toCleft = side < 0 ? 1 : -1;
  for (const [at, , wd] of ledges) {
    const xe = xOf(Math.max(0, at - wd * 1.1));
    const ye = floorAt(plan, xe);
    const xd = xOf(Math.min(1, at + wd * 1.1));
    const yd = floorAt(plan, xd);
    if (ye > plan.h || yd - ye < 4) continue;
    const jut = (6 + r() * 10) * toCleft;
    const thick = 3 + r() * 4;
    // The shadow under the lip, down the drop's face.
    const sh = new Path2D();
    sh.moveTo((xe + jut) * D, (ye + thick) * D);
    sh.lineTo(xe * D, (ye + thick * 0.6) * D);
    sh.lineTo((xe + (xd - xe) * 0.35) * D, (ye + (yd - ye) * 0.7) * D);
    sh.lineTo((xe + jut * 0.6) * D, (ye + thick + (yd - ye) * 0.35) * D);
    sh.closePath();
    ctx.save();
    ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${night ? 0.4 : 0.32})`;
    ctx.fill(sh);
    // The lip itself, jutting.
    const lip = [xe - 10 * toCleft, ye - 0.5, xe, ye, xe + jut * 0.7, ye + thick * 0.2, xe + jut, ye + thick * 0.55];
    inkLine(
      ctx,
      lip.map((v) => v * D),
      false,
      { width: 0.9 * D, color: lit ? (night ? '#E8E0CF' : '#F1ECDF') : ink, alpha: lit ? 0.4 : 0.5, lost: 0.2, swell: 0.5, taper: [0.1, 0.3], seed: hash32(plan.seed, 'lip', side, at), raw: true },
    );
    // Hatching down the drop's face, close and short.
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.globalAlpha = night ? 0.22 : 0.3;
    ctx.lineWidth = 0.45 * D;
    ctx.beginPath();
    const strokes = Math.max(3, Math.round(Math.abs(xd - xe) / 2.5));
    for (let i = 0; i < strokes; i++) {
      const q = (i + 0.5) / strokes;
      const x = xe + (xd - xe) * q;
      const y0 = floorAt(plan, x) + 2;
      const len = (yd - ye) * (0.15 + 0.25 * r());
      ctx.moveTo(x * D, y0 * D);
      ctx.lineTo((x + toCleft * len * 0.15) * D, (y0 + len) * D);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* ---- The rare things ---- */

/**
 * A rare thing, drawn once into a layer of its own and placed per strip:
 * redrawing a turtle or a whale in pen for every strip it crosses is most of
 * a print's time. Its layer covers only what it really drew (found from a
 * small proof of it first). The storm is drawn as it is (a few points of
 * light).
 */
function paintEvent(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, e: PlacedEvent, D: number, ambient: number, inSight: InSight, view: View) {
  if (e.kind === 'whalefall' ? !(e.box && inSight(e.box.x0, e.box.y0, e.box.x1, e.box.y1, 120)) : !inSight(e.rx, e.ry, e.rx + e.rw, e.ry + e.rh, 40)) return;
  const layer = e.kind === 'storm' ? null : eventLayer(plan, c, e, D, ambient);
  if (!layer) {
    drawEvent(ctx, plan, c, e, D, ambient);
    return;
  }
  if (!sees(view, layer.x, layer.y, layer.x + layer.w, layer.y + layer.h)) return;
  if (layer.k === 1) {
    blit(ctx, layer.canvas, layer.x, layer.y, view);
    return;
  }
  const k = layer.k;
  const sx0 = Math.max(0, Math.floor((view.x0 - layer.x) * k) - 1);
  const sy0 = Math.max(0, Math.floor((view.y0 - layer.y) * k) - 1);
  const sx1 = Math.min(layer.canvas.width, Math.ceil((view.x1 - layer.x) * k) + 1);
  const sy1 = Math.min(layer.canvas.height, Math.ceil((view.y1 - layer.y) * k) + 1);
  if (sx1 <= sx0 || sy1 <= sy0) return;
  ctx.drawImage(layer.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, layer.x + sx0 / k, layer.y + sy0 / k, (sx1 - sx0) / k, (sy1 - sy0) / k);
}

interface EventLayer {
  canvas: HTMLCanvasElement;
  /** Where it lies on the picture, device px, and its resolution against the picture's. */
  x: number;
  y: number;
  w: number;
  h: number;
  k: number;
}

function eventLayer(plan: Plan, c: Caches, e: PlacedEvent, D: number, ambient: number): EventLayer | null {
  if (typeof document === 'undefined') return null;
  const key = `${e.kind}|${D}`;
  const hit = c.events.get(key);
  if (hit !== undefined) return hit;
  for (const k of c.events.keys()) if (!k.endsWith(`|${D}`)) c.events.delete(k);
  // The part of its region on the page, in units.
  const x0 = Math.max(-10, e.rx);
  const x1 = Math.min(plan.w + 10, e.rx + e.rw);
  const y0 = Math.max(-10, e.ry);
  const y1 = Math.min(plan.h + 10, e.ry + e.rh);
  if (x1 <= x0 || y1 <= y0) {
    c.events.set(key, null);
    return null;
  }
  // A small proof first, to find what it really covers.
  const q = 480 / Math.max(x1 - x0, y1 - y0);
  const probe = document.createElement('canvas');
  probe.width = Math.max(1, Math.ceil((x1 - x0) * q));
  probe.height = Math.max(1, Math.ceil((y1 - y0) * q));
  const pc = probe.getContext('2d', { willReadFrequently: true });
  if (!pc) return null;
  pc.scale(q / D, q / D);
  pc.translate(-x0 * D, -y0 * D);
  drawEvent(pc, plan, c, e, D, ambient);
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  try {
    const data = pc.getImageData(0, 0, probe.width, probe.height).data;
    for (let j = 0; j < probe.height; j++) {
      for (let i = 0; i < probe.width; i++) {
        if (data[(j * probe.width + i) * 4 + 3] > 1) {
          if (i < bx0) bx0 = i;
          if (i > bx1) bx1 = i;
          if (j < by0) by0 = j;
          if (j > by1) by1 = j;
        }
      }
    }
  } catch {
    return null;
  }
  if (!Number.isFinite(bx0)) {
    c.events.set(key, null);
    return null;
  }
  // Generous: a proof this small can miss a hair or a speck at the edge.
  const pad = e.kind === 'whale' ? 24 : 12;
  const ux0 = Math.max(x0, x0 + bx0 / q - pad);
  const uy0 = Math.max(y0, y0 + by0 / q - pad);
  const ux1 = Math.min(x1, x0 + (bx1 + 1) / q + pad);
  const uy1 = Math.min(y1, y0 + (by1 + 1) / q + pad);
  // At the picture's own resolution: a drawing's blur is in canvas pixels,
  // so a layer at less would blur it more.
  let k = 1;
  const area = (ux1 - ux0) * (uy1 - uy0) * D * D;
  if (area * k * k > 24e6) k = Math.sqrt(24e6 / area);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((ux1 - ux0) * D * k));
  canvas.height = Math.max(1, Math.ceil((uy1 - uy0) * D * k));
  const o = canvas.getContext('2d');
  if (!o) return null;
  o.scale(k, k);
  o.translate(-ux0 * D, -uy0 * D);
  drawEvent(o, plan, c, e, D, ambient);
  const made: EventLayer = { canvas, x: ux0 * D, y: uy0 * D, w: (ux1 - ux0) * D, h: (uy1 - uy0) * D, k };
  c.events.set(key, made);
  return made;
}

/** The rare thing itself, in the picture's device px. */
function drawEvent(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, e: PlacedEvent, D: number, ambient: number) {
  const water = waterAtY(plan, c, e.y);
  const dark = water.dark;
  const w = e.rw * D;
  const h = e.rh * D;
  ctx.save();
  ctx.translate(e.rx * D, e.ry * D);
  if (e.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  switch (e.kind) {
    case 'whale':
      drawWhale(ctx, w, h, e.age, e.seed, plan.current, D, ambient, dark, Math.min(plan.w, plan.h) * D);
      break;
    case 'leviathan':
      drawLeviathan(ctx, w, h, e.age, e.seed, plan.current, D, ambient);
      break;
    case 'storm':
      // Small points, and fewer of them lit at once: a stir in the water,
      // not a sky of neon.
      ctx.globalAlpha = 0.5;
      drawStorm(ctx, w, h, e.age, e.seed, D * 0.5, ambient);
      break;
    case 'siphonophore':
      drawSiphonophore(ctx, w, h, e.age, e.seed, D, ambient, dark, e.lie);
      break;
    case 'eye':
      // Sized to the page; its own soft vignette is all the dark it needs.
      drawEye(ctx, w, h, e.age, e.seed, D, dark, Math.min(plan.w, plan.h) * D);
      break;
    case 'turtle':
      drawTurtle(ctx, w, h, e.age, e.seed, D, ambient, dark, { x: (e.look?.x ?? e.rw / 2) * D, y: (e.look?.y ?? e.rh / 2) * D });
      break;
    case 'oarfish':
      drawOarfish(ctx, w, h, e.age, e.seed, D, ambient, dark);
      break;
    case 'lure':
      drawLure(ctx, w, h, e.age, e.seed, D, ambient, dark);
      break;
    case 'dumbo':
      drawDumbo(ctx, w, h, e.age, e.seed, D, ambient, dark);
      break;
    case 'whalefall':
      drawWhaleFall(ctx, w, h, 1, e.seed, D, ambient, dark, e.y * D, siltAt(plan, c, e.y));
      break;
  }
  ctx.restore();
}

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
import { drawGodRays, drawSnellWindow, drawSnowDeep, godRayLight, moonLit, sunFor } from '../light';
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
import { drawGrowth, inkRock, rockFoot, rockShape, rockStyle } from '../outcrop-sprite';
import { floorAt, REF, rockOutline, rockX, wallAt, WALL_STEP, WHALE_BLUR, WHALE_PITCH, whaleHull, type PlacedEvent, type PlacedJelly, type PlacedRock, type Plan, type Wall } from './layout';

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
/** The far plane: mostly the water. */
const FAR_MIX = 0.6;
/** The middle plane: a step back into the water. */
const MID_MIX = 0.3;
/** How far the water takes a far rock. */
const FAR_ROCK_MIX = 0.78;
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
const STEEPEST = 1.8;

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
  // Never narrower than a smoothstep across nearly half the page.
  let out = blur(lab, N * 0.1);
  for (let sigma = N * 0.11; sigma <= N * 0.18 + 1e-9 && steepest(out) > STEEPEST; sigma += N * 0.01) out = blur(lab, sigma);
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
  // ---- The window's light in the water under it, long and soft, carried
  // on down to a quarter of the page so the light has no edge.
  paintSkyGlow(ctx, plan, D, view, night, sun);
  // ---- Far: the big shapes behind everything, the rocks passed, the old
  // jellies far off, the far animals.
  for (const e of plan.events) if (e.far) paintEvent(ctx, plan, c, e, D, ambient, inSight, view);
  for (const wl of plan.walls ?? []) if (wl.plane === 0) paintWall(ctx, plan, c, wl, D, view);
  for (const r of plan.rocks) if (r.plane === 0 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight, view);
  for (const j of plan.jellies) if (j.far && inSight(j.box.x0, j.box.y0, j.box.x1, j.box.y1, j.r)) paintJelly(ctx, plan, c, j, D, view);
  paintCast(ctx, plan, c, D, ambient, 0, inSight);
  // ---- The hero's light, in the water round it.
  paintPool(ctx, plan, c, D, view);
  // ---- The middle: the kelp, the middle rocks, the floor, the rare things
  // in the water, the middle animals.
  for (const wl of plan.walls ?? []) if (wl.plane > 0) paintWall(ctx, plan, c, wl, D, view);
  if (c.kelp && plan.kelp) paintKelp(ctx, plan, c.kelp, c, D, ambient, inSight);
  for (const r of plan.rocks) if (r.plane === 1 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight, view);
  if (plan.floor) {
    const top = plan.trench ? plan.trench.top : plan.floor.y;
    if (inSight(0, top - 40, plan.w, plan.h)) paintFloor(ctx, plan, c, D, view);
  }
  for (const e of plan.events) if (!e.far && e.kind !== 'eye') paintEvent(ctx, plan, c, e, D, ambient, inSight, view);
  paintCast(ctx, plan, c, D, ambient, 1, inSight);
  // ---- Light: what glows lights the water round it, laid behind the near
  // plane so the near animals keep their full ink and are never paled by it.
  paintLights(ctx, lightsOf(plan, c, D), view);
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

/**
 * The light from the window of sky spreading through the water under it: an
 * ellipse of soft light from the window down to a quarter of the page and
 * across most of it, falling away to nothing, screened (lit on the night
 * ground) so the paint's grain stays.
 */
function paintSkyGlow(ctx: CanvasRenderingContext2D, plan: Plan, D: number, view: View, night: boolean, sun: ReturnType<typeof sunFor>) {
  const win = plan.window;
  const ry = Math.max(plan.h * 0.25 - win.y, win.r) * 1.15;
  const rx = Math.min(plan.w * 0.45, ry * 1.6);
  const cx = win.x * D;
  const cy = win.y * D;
  if (!sees(view, cx - rx * D, 0, cx + rx * D, cy + ry * D)) return;
  const glow = sun.night ? 0.45 + 0.55 * (plan.moon == null ? 0 : moonLit(plan.moon)) : 0.6 + 0.4 * sun.strength;
  const [r, g, b] = rgbOf(night ? mixHex(sun.warmth, '#8FA3AD', 0.6) : mixHex('#FFFDF6', sun.warmth, 0.15));
  const a = (night ? 0.1 : 0.3) * glow;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx / ry, 1);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, ry * D);
  gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a.toFixed(4)})`);
  gr.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${(a * 0.6).toFixed(4)})`);
  gr.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${(a * 0.22).toFixed(4)})`);
  gr.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${(a * 0.05).toFixed(4)})`);
  gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.globalCompositeOperation = night ? 'lighter' : 'screen';
  ctx.fillStyle = gr;
  ctx.fillRect(-ry * D, -ry * D, ry * 2 * D, ry * 2 * D);
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
      if (!plan.floor) footGlazeInto(o, plan, c, u);
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

/**
 * The last glaze, where no floor closes the page: laid across the foot
 * from a ragged, slightly tilted edge about four fifths down, a little
 * darker at its dried edge, so the lowest fifth is worked water and never
 * blank paper.
 */
function footGlazeInto(o: CanvasRenderingContext2D, plan: Plan, c: Caches, u: number) {
  const f = fallOf(plan, c);
  const [r, g, b] = rgbOf(f.deep);
  const rnd = mulberry32(hash32(plan.seed, 'foot-glaze'));
  const ph = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3];
  const tilt = (rnd() < 0.5 ? -1 : 1) * (0.02 + 0.03 * rnd());
  const top = plan.h * (0.79 + 0.03 * rnd());
  const k = plan.w / 1000;
  const edgeAt = (x: number) =>
    top + tilt * (x - plan.w / 2) + plan.h * (0.018 * Math.sin(x / (170 * k) + ph[0]) + 0.009 * Math.sin(x / (53 * k) + ph[1]) + 0.004 * Math.sin(x / (13 * k) + ph[2]));
  const path = new Path2D();
  const edge: number[] = [];
  path.moveTo(-4, plan.h * u + 4);
  for (let x = -10; x <= plan.w + 10; x += 6) {
    path.lineTo(x * u, edgeAt(x) * u);
    edge.push(x * u, edgeAt(x) * u);
  }
  path.lineTo(plan.w * u + 4, plan.h * u + 4);
  path.closePath();
  const a = plan.ground === 'paper' ? 0.16 : 0.24;
  const gr = o.createLinearGradient(0, (top - plan.h * 0.03) * u, 0, plan.h * u);
  gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a * 0.7})`);
  gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${a})`);
  o.save();
  // Its edge wet, mostly: soft, so it never reads as a far shore.
  o.filter = `blur(${(plan.h * 0.022 * u).toFixed(2)}px)`;
  o.fillStyle = gr;
  o.fill(path);
  o.filter = 'none';
  // Where it dried crisp, for part of its length only, a faint gathered edge.
  const from = rnd() * 0.4;
  const to = from + 0.3 + rnd() * 0.25;
  o.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  o.lineWidth = Math.max(1, 1.6 * u);
  o.lineCap = 'round';
  const n = edge.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const q = i / n;
    if (q < from || q > to || Math.sin(i * 0.37 + ph[0]) + Math.sin(i * 0.11 + ph[1]) < 0.4) continue;
    const fade = Math.min(1, (q - from) / 0.08, (to - q) / 0.08);
    o.globalAlpha = a * 0.5 * fade;
    o.beginPath();
    o.moveTo(edge[i * 2], edge[i * 2 + 1] + 1.5 * u);
    o.lineTo(edge[i * 2 + 2], edge[i * 2 + 3] + 1.5 * u);
    o.stroke();
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

/** How much a kelp forest's shade stops the light at its heart. */
export const KELP_SHADE = 0.25;

/**
 * The kelp forest's shade in the light at a point (units), 0 to KELP_SHADE:
 * whole by its wall and down through its fronds, falling away smoothly
 * across the water and above its rock, to nothing well inside the reach it
 * is measured over. Never a rectangle: any edge in it is carried down the
 * rays as a seam.
 */
export function kelpShadeAt(plan: Pick<Plan, 'w' | 'kelp' | 'rocks'>, x: number, y: number): number {
  if (!plan.kelp) return 0;
  const smooth = (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  };
  const reach = plan.w * 0.16;
  const bottom = plan.kelp.bottom;
  const fy = 1 - smooth((y - bottom * 0.5) / (bottom * 0.5));
  if (fy <= 0) return 0;
  let best = 0;
  for (const r of plan.rocks) {
    if (r.kind !== 'kelp') continue;
    const dx = r.edge < 0 ? x : plan.w - x;
    const fx = 1 - smooth((dx - reach * 0.35) / (reach * 0.9));
    best = Math.max(best, fx);
  }
  return KELP_SHADE * best * fy;
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
    // The forest's shade, feathered to nothing inside its own reach, laid
    // pixel by pixel from the same profile the tests hold to: a square
    // shade cast a square-edged shadow down the rays.
    const kw = canvas.width;
    const kh = Math.min(canvas.height, Math.ceil(plan.kelp.bottom * k) + 1);
    const shade = kw > 0 && kh > 0 ? o.createImageData(kw, kh) : null;
    if (shade) {
      for (let py = 0; py < kh; py++) {
        for (let pxl = 0; pxl < kw; pxl++) {
          const a = kelpShadeAt(plan, (pxl + 0.5) / k, (py + 0.5) / k);
          if (a > 0) shade.data[(py * kw + pxl) * 4 + 3] = Math.round(a * 255);
        }
      }
      const tmp = document.createElement('canvas');
      tmp.width = kw;
      tmp.height = kh;
      tmp.getContext('2d')?.putImageData(shade, 0, 0);
      o.save();
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalAlpha = 1;
      o.drawImage(tmp, 0, 0);
      o.restore();
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
    // What lives on the floor is drawn in its own colour on paper, solid on
    // the dark ground: in the deep's light ink it would read as a ghost of
    // itself.
    const dark = water.dark && !(a.floor && plan.ground === 'paper');
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
  if (j.far) {
    // Far off a jelly is a soft body in the haze, not a bubble's rim: its
    // bell filled with its own tint, a step off the water, and a veil where
    // its trails hang, laid under the drawing.
    const body = mixHex(water.top, tint, 0.35);
    const fill = dark ? mixHex(body, '#FFFFFF', 0.08) : mixHex(body, '#1E2430', 0.1);
    const [fr, fg, fb] = rgbOf(fill);
    const bx = cw / 2;
    const by = padTop + bh / 2;
    o.globalCompositeOperation = 'destination-over';
    o.globalAlpha = 1;
    o.filter = `blur(${Math.max(0.8, R * 0.06).toFixed(2)}px)`;
    o.fillStyle = `rgba(${fr}, ${fg}, ${fb}, 0.55)`;
    o.beginPath();
    o.ellipse(bx, by + bh * 0.25, R * 0.98, bh * 0.75, 0, Math.PI, Math.PI * 2);
    o.quadraticCurveTo(bx, by + bh * 0.42, bx - R * 0.98, by + bh * 0.25);
    o.fill();
    const veil = o.createLinearGradient(0, by + bh * 0.3, 0, by + bh * 0.3 + L * 0.8);
    veil.addColorStop(0, `rgba(${fr}, ${fg}, ${fb}, 0.22)`);
    veil.addColorStop(1, `rgba(${fr}, ${fg}, ${fb}, 0)`);
    o.fillStyle = veil;
    o.beginPath();
    o.moveTo(bx - R * 0.7, by + bh * 0.3);
    o.lineTo(bx + R * 0.7, by + bh * 0.3);
    o.lineTo(bx + R * 0.4, by + bh * 0.3 + L * 0.8);
    o.lineTo(bx - R * 0.4, by + bh * 0.3 + L * 0.8);
    o.closePath();
    o.fill();
    o.filter = 'none';
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
  // (A side the plan left bare, its straggler dropped, keeps no ledge either.)
  const sides = kelp.ledges.filter((ledge) => kelp.stalks.some((st, i) => keep.has(i) && (st.x < 0.5 ? -1 : 1) === ledge.edge)).map((ledge) => ({
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

/* ---- The walls ---- */

/** Short pen strokes gathered by weight and strength, laid in a few draws: thousands of strokes, a handful of strokes of the canvas. */
class Strokes {
  private sets = new Map<number, Path2D>();
  add(x0: number, y0: number, x1: number, y1: number, width: number, alpha: number): void {
    const key = Math.max(1, Math.min(40, Math.round(width * 4))) * 100 + Math.max(0, Math.min(20, Math.round(alpha * 20)));
    let p = this.sets.get(key);
    if (!p) {
      p = new Path2D();
      this.sets.set(key, p);
    }
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
  }
  draw(ctx: CanvasRenderingContext2D, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    const base = ctx.globalAlpha;
    for (const [key, p] of this.sets) {
      const a = (key % 100) / 20;
      if (a <= 0) continue;
      ctx.lineWidth = Math.floor(key / 100) / 4;
      ctx.globalAlpha = base * a;
      ctx.stroke(p);
    }
    ctx.restore();
  }
}

const clampT = (v: number) => Math.max(0, Math.min(1, v));

/** A wall's stone at a depth: the rocks' own wash, taken by the water as its plane is. */
function wallStone(plan: Plan, c: Caches, plane: number, y: number): string {
  const water = waterAtY(plan, c, y);
  const stone = rockStyle(water, plan.ground === 'night', 1, 0.5, 0).rock;
  return plane === 0 ? mixHex(stone, water.top, FAR_ROCK_MIX) : plane === 1 ? mixHex(stone, water.top, MID_MIX) : stone;
}

/**
 * A side wall, the cliff its rocks stand out from: a strip at the page's
 * edge from under its top rock down into the ground, washed in the rocks'
 * stone and hatched in the same hand (short strokes leaning one way with the
 * light, closer toward the page's edge, crossed in the darkest), its beds as
 * broken level lines, a dark shadow under each rock and each ledge going
 * into it, its face in one broken pen line with a hair of bare paper inside
 * it. All of it, wash and hatching, fades with depth from whole to a third,
 * so the rocks read as ledges on a wall going down into the dark.
 */
function paintWall(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, wall: Wall, D: number, view: View) {
  const w = plan.w;
  const n = wall.face.length;
  let most = 0;
  for (const f of wall.face) most = Math.max(most, f);
  const ux0 = wall.edge < 0 ? -8 : w - most - 8;
  const ux1 = wall.edge < 0 ? most + 8 : w + 8;
  if (!sees(view, ux0 * D, (wall.top - 8) * D, ux1 * D, (wall.bottom + 8) * D)) return;
  const night = plan.ground === 'night';
  const X = (d: number) => (wall.edge < 0 ? d : w - d) * D;
  const span = Math.max(1, wall.bottom - wall.top);
  /** How much of it is left at a depth: all at its top, a third at its foot. */
  // (And it comes in softly from its top, so a rock laid a little clear
  // over it never shows a hem across it.)
  let yStart = wall.top;
  const keep = (y: number) => (1 - 0.65 * clampT((y - wall.top) / span)) * (0.15 + 0.85 * clampT((y - yStart) / (plan.h * 0.04)));
  const strength = wall.plane === 2 ? 1 : wall.plane === 1 ? 0.85 : 0.55;
  const faceAt = (y: number) => wallAt(wall, y) ?? 0;
  // The strip: in from off the page, down its face, its top rounded in
  // under its top rock (or its top ledge).
  const region = new Path2D();
  const rocks = plan.rocks.filter((k) => k.edge === wall.edge && k.wall === wall);
  // Under a rock its top runs inside the rock, halfway down its body, so
  // nothing of it shows above the rock's own underside.
  const topRock = rocks.reduce<PlacedRock | null>((a, k) => (!a || k.y + k.height * 0.3 < a.y + a.height * 0.3 ? k : a), null);
  const inside = topRock && topRock.y + topRock.height * 0.6 >= wall.top ? topRock : null;
  let i0 = 1;
  if (inside) {
    const N = inside.shape.top.length - 1;
    const span = (inside.off + inside.reach) * w;
    const midAt = (d: number) => {
      const x = wall.edge < 0 ? d : w - d;
      const u = clampT(inside.edge < 0 ? (x + inside.off * w) / span : (w + inside.off * w - x) / span);
      const i = Math.round(u * N);
      // (The kelp's ledge is laid a little clear: there the wall starts lower in it.)
      const f = inside.kind === 'kelp' ? 0.85 : 0.55;
      return inside.y + (inside.shape.top[i] * (1 - f) + inside.shape.solid[i] * f) * inside.height;
    };
    region.moveTo(X(-8), midAt(-8) * D);
    let d = -8;
    for (; d < wall.face[0]; d += 4) region.lineTo(X(d), Math.max(wall.top, midAt(d)) * D);
    const yf = Math.max(wall.top, midAt(wall.face[0]));
    yStart = Math.max(wall.top, yf - plan.h * 0.01);
    i0 = Math.max(1, Math.ceil((yf - wall.top) / WALL_STEP));
    region.lineTo(X(Math.min(d, wallAt(wall, yf) ?? d)), yf * D);
  } else {
    region.moveTo(X(-8), (wall.top - 2) * D);
    region.lineTo(X(wall.face[0] * 0.55), wall.top * D);
  }
  for (let i = i0; i < n; i++) region.lineTo(X(wall.face[i]), (wall.top + i * WALL_STEP) * D);
  region.lineTo(X(-8), (wall.bottom + 2) * D);
  region.closePath();
  ctx.save();
  // The wash, fading down.
  {
    const g = ctx.createLinearGradient(0, wall.top * D, 0, wall.bottom * D);
    // (Its last stretch let go of altogether, so it goes down behind the
    // floor's far swells and never ends on a hem.)
    const lost = Math.min(0.5, (plan.h * 0.06) / span);
    const at = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => s / 8);
    for (const q of [0, 0.25, 0.5, 0.75, 1]) at.push(clampT((yStart - wall.top + q * plan.h * 0.04) / span));
    at.sort((a, b) => a - b);
    for (const q of at) {
      const y = wall.top + span * q;
      const [r, gg, b] = rgbOf(wallStone(plan, c, wall.plane, y));
      const end = clampT((1 - q) / lost);
      g.addColorStop(q, `rgba(${r}, ${gg}, ${b}, ${(keep(y) * strength * (night ? 0.9 : 0.85) * end).toFixed(3)})`);
    }
    ctx.fillStyle = g;
    ctx.fill(region);
  }
  ctx.clip(region);
  const vy0 = view.y0 / D - 12;
  const vy1 = view.y1 / D + 12;
  const shadeInk = night ? '#000000' : '#1A1714';
  // The shadow under each rock and each ledge, going into the wall: a soft
  // dark band hung under the underside, laid as copies slid down.
  {
    const bands: { pts: number[]; deep: number }[] = [];
    for (const k of rocks) {
      const pts: number[] = [];
      const N = k.shape.solid.length - 1;
      for (let i = 0; i <= N; i++) pts.push(rockX(k, w, i / N), k.y + k.shape.solid[i] * k.height - plan.h * 0.012);
      bands.push({ pts, deep: plan.h * 0.03 });
    }
    for (const l of wall.ledges) {
      const pts: number[] = [];
      for (let d = -8; d <= (wallAt(wall, l.y + plan.h * 0.004) ?? 0) + 2; d += 4) pts.push(wall.edge < 0 ? d : w - d, l.y + plan.h * 0.004);
      bands.push({ pts, deep: plan.h * 0.012 });
    }
    ctx.fillStyle = shadeInk;
    const M = 6;
    for (const b of bands) {
      let lo = Infinity;
      for (let i = 1; i < b.pts.length; i += 2) lo = Math.min(lo, b.pts[i]);
      if (lo > vy1 || lo + b.deep * 3 < vy0) continue;
      ctx.globalAlpha = ((night ? 0.6 : 0.5) * keep(lo) * strength) / M;
      for (let s = 0; s < M; s++) {
        const dy = (b.deep * s) / M;
        const p = new Path2D();
        p.moveTo(b.pts[0] * D, (b.pts[1] + dy) * D);
        for (let i = 2; i < b.pts.length; i += 2) p.lineTo(b.pts[i] * D, (b.pts[i + 1] + dy) * D);
        for (let i = b.pts.length - 2; i >= 0; i -= 2) p.lineTo(b.pts[i] * D, (b.pts[i + 1] + dy + b.deep * 0.35) * D);
        p.closePath();
        ctx.fill(p);
      }
    }
    ctx.globalAlpha = 1;
  }
  /** How far a point is in the shadow of a rock or ledge above it, 0 to 1. */
  const under = (d: number, y: number) => {
    let s = 0;
    for (const k of rocks) {
      const x = wall.edge < 0 ? d : w - d;
      const N = k.shape.solid.length - 1;
      const u = clampT(k.edge < 0 ? (x + k.off * w) / ((k.off + k.reach) * w) : (w + k.off * w - x) / ((k.off + k.reach) * w));
      const yb = k.y + k.shape.solid[Math.round(u * N)] * k.height;
      const t = (y - yb) / (plan.h * 0.045);
      if (t > -0.3 && t < 1) s = Math.max(s, 1 - Math.max(0, t));
    }
    for (const l of wall.ledges) {
      const t = (y - l.y) / (plan.h * 0.02);
      if (t > 0 && t < 1) s = Math.max(s, 1 - t);
    }
    return s;
  };
  // Course by course: each block of stone hatched across its shadowed part
  // in parallel strokes leaning one way with the light, the part by the face
  // left to the paper; a joint or two through it; crossed where it is
  // darkest or under a rock; its bed a broken line. Sparser going down.
  const pen = new Strokes();
  const lean = 0.36;
  const beds = wall.beds?.length ? wall.beds : [wall.top];
  for (let bi = 0; bi < beds.length; bi++) {
    const ya = Math.max(wall.top + 2, beds[bi]);
    const yb = Math.min(wall.bottom, bi + 1 < beds.length ? beds[bi + 1] : wall.bottom);
    if (yb - ya < 3 || yb < vy0 || ya > vy1) continue;
    const rb = mulberry32(hash32(wall.seed, 'course', bi));
    const ym = (ya + yb) / 2;
    const k = keep(ym) * strength;
    const fm = Math.min(faceAt(ya + 1), faceAt(ym), faceAt(yb - 1));
    const sh = under(fm * 0.5, ya + (yb - ya) * 0.25);
    const dark = clampT(0.3 + 0.42 * rb() + 0.5 * sh);
    const reachIn = fm * (1 - (sh > 0.3 ? 0.08 : 0.2 + 0.32 * rb())) - 3;
    const sp = (5.2 - 2.8 * dark) / (0.4 + 0.6 * k);
    const al = (night ? 0.42 : 0.58) * (0.35 + 0.65 * k);
    const wd = (0.32 + 0.4 * dark) * D;
    const y0 = ya + 0.9;
    const y1 = yb - 0.9;
    const run = y1 - y0;
    // The main set, leaning with the light.
    for (let d = -run * lean - 6 + rb() * sp; d < reachIn; d += sp * (0.8 + 0.4 * rb())) {
      let da = d;
      // Each stroke its own length, off the beds now and then: never a ruled row.
      let ta = y0 + run * 0.12 * rb() * rb();
      let tb = y1 - run * 0.3 * rb() * rb();
      if (da < -6) {
        ta += (-6 - da) / lean;
        da = -6;
      }
      if (d + (tb - y0) * lean > reachIn) tb = y0 + (reachIn - d) / lean;
      if (tb - ta < 1.5) continue;
      da = d + (ta - y0) * lean;
      const db = d + (tb - y0) * lean;
      const q = clampT(1 - Math.max(0, da) / Math.max(1, reachIn));
      pen.add(X(da), ta * D, X(db), tb * D, wd * (0.55 + 0.55 * q), al * (0.45 + 0.55 * q));
    }
    // Crossed in the darkest courses, toward the page's edge.
    if (dark > 0.6) {
      const lim = reachIn * (0.35 + 0.4 * (dark - 0.6) / 0.4);
      for (let d = rb() * sp * 1.2; d < lim + run * 0.7; d += sp * 1.25) {
        let da = d;
        let ta = y0;
        let tb = y1;
        if (da > lim) {
          ta += (da - lim) / 0.7;
          da = lim;
        }
        const end = d - run * 0.7;
        if (end < -6) tb = y0 + (d + 6) / 0.7;
        if (tb - ta < 1.5) continue;
        pen.add(X(da), ta * D, X(d - (tb - y0) * 0.7), tb * D, wd * 0.75, al * 0.7);
      }
    }
    // A joint or two through the course.
    const joints = wall.plane === 0 ? 0 : Math.floor(rb() * 2.6);
    for (let j = 0; j < joints; j++) {
      const d = fm * (0.15 + 0.6 * rb());
      const dm = d + run * lean * 0.3 + (rb() - 0.5) * 2;
      pen.add(X(d), y0 * D, X(dm), (y0 + run * 0.55) * D, 0.5 * D, al * 0.95);
      if (rb() < 0.6) pen.add(X(dm), (y0 + run * 0.62) * D, X(dm + (rb() - 0.3) * 2), y1 * D, 0.45 * D, al * 0.8);
    }
    // The bed above it, from the face part way in, broken, a little tilted.
    {
      const ph = rb() * 6.28;
      const fa = faceAt(ya + 0.5);
      const from = fa * (0.15 + 0.6 * rb());
      const tilt = (rb() - 0.5) * 0.12;
      const yAt = (d: number) => ya + tilt * (fa - d) + 0.3 * Math.sin(d * 0.3 + ph);
      for (let d = from; d < fa - 1; d += 3) {
        if (Math.sin(d / 6.5 + ph) + 0.6 * Math.sin(d / 2.3 + ph * 2) < -0.35) continue;
        const e = Math.min(d + 3, fa - 1);
        pen.add(X(d), yAt(d) * D, X(e), yAt(e) * D, 0.55 * D, al * 0.95);
      }
    }
    // Where the course above stands out over this one: its shadow, close and short.
    const over = faceAt(ya - 1.5) - faceAt(ya + 2);
    if (over > 1.5) {
      const fb = faceAt(ya + 2);
      for (let d = fb * 0.25; d < fb - 2; d += 1.7) pen.add(X(d), (ya + 0.5) * D, X(d + 1.2), (ya + Math.min(run * 0.5, 2.5 + over * 0.5)) * D, 0.4 * D, al);
    }
  }
  pen.draw(ctx, night ? mixHex(wallStone(plan, c, wall.plane, wall.top), '#000000', 0.55) : INK);
  ctx.restore();
  // The face, in one pen line broken along its length, fading as it goes down.
  {
    const ink = night ? INK_NIGHT : INK;
    const runs = 6;
    const per = Math.ceil(n / runs);
    for (let s = 0; s < runs; s++) {
      const i0 = s * per;
      const i1 = Math.min(n - 1, i0 + per + 1);
      if (i1 - i0 < 2) continue;
      const ya = wall.top + i0 * WALL_STEP;
      const yb = wall.top + i1 * WALL_STEP;
      if (yb < vy0 - 10 || ya > vy1 + 10) continue;
      const pts: number[] = [];
      for (let i = i0; i <= i1; i++) pts.push(X(wall.face[i]), (wall.top + i * WALL_STEP) * D);
      const k = keep((ya + yb) / 2) * strength;
      inkLine(ctx, pts, false, { width: 0.75 * D, color: ink, alpha: (night ? 0.42 : 0.62) * (0.3 + 0.7 * k), lost: 0.45, swell: 0.5, taper: [0.04, 0.04], seed: hash32(wall.seed, 'face', s), raw: true });
    }
    // Each ledge's bench, its top caught by the light.
    for (const l of wall.ledges) {
      if (l.y < vy0 - 10 || l.y > vy1 + 10) continue;
      const f = faceAt(l.y + 1);
      const pts = [X(f * 0.35), l.y * D, X(f * 0.7), (l.y - 0.4) * D, X(f), (l.y + 1.2) * D];
      inkLine(ctx, pts, false, { width: 0.8 * D, color: ink, alpha: (night ? 0.45 : 0.65) * keep(l.y) * strength, lost: 0.15, swell: 0.4, taper: [0.2, 0.1], seed: hash32(wall.seed, 'bench', l.rest) });
    }
  }
}

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
  ctx.globalAlpha = 1;
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
  // Each part as the engine builds it, and room under the lowest for its
  // foot to go on down into the water: to where the engine has let go of
  // it, and the foot's wash below that.
  const parts = k.shape.parts.map((part) => {
    const ps = part.span * span;
    const shape = rockShape(part.seed, ps * D, part.thick * ps * D, D, part.grammar ?? 'heap');
    return { part, shape, top: k.y + (k.shape.lift + part.dy) * span };
  });
  let foot = k.box.y1;
  for (const p of parts) foot = Math.max(foot, p.top + rockFoot(p.shape) / D);
  const by1 = Math.max(k.box.y1 + span * 0.25, foot + 4);
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
  parts.forEach(({ part, shape }, i) => {
    const target = i === 0 ? o : lo;
    if (!target) return;
    if (i > 0) target.clearRect(0, 0, cw, chh);
    const x0 = rockX(k, w, part.at) * D - ox;
    const y0 = (k.y + (k.shape.lift + part.dy) * span) * D - oy;
    target.lineCap = 'round';
    target.lineJoin = 'round';
    const style = rockStyle(water, night, pen, detail, hash32(k.seed, 'part', i));
    // Far off: the engine's own haze, a broken thread of pen round it.
    if (k.plane === 0) style.far = { water: water.top, mix: FAR_ROCK_MIX };
    inkRock(target, shape, { x0, y0, dir }, { ...style, barnacles: k.zone < 2 && k.plane === 2 && i === k.shape.parts.length - 1 });
    if (i > 0) o.drawImage(layer, 0, 0);
  });
  const N = k.shape.top.length - 1;
  const crestAt = (u: number) => {
    const f = Math.max(0, Math.min(N, u * N));
    const i0 = Math.floor(f);
    const i1 = Math.min(N, i0 + 1);
    return k.y + (k.shape.top[i0] * (1 - (f - i0)) + k.shape.top[i1] * (f - i0)) * k.height;
  };
  // Far off: never a lineless smoke. A broken thread of pen along its crest
  // and down its lip (three runs, gaps between), and a few strokes of
  // hatching in its shadow, all faint.
  if (k.plane === 0) {
    const ink = night ? INK_NIGHT : INK;
    // Read off what the engine drew, so the pen follows the rock as it is.
    const data = o.getImageData(0, 0, cw, chh).data;
    const step = Math.max(1, Math.round(2 * D));
    // (The haze lays it thin: a quarter of the way to opaque is rock.)
    const solidA = 22;
    const cols: { x: number; top: number; low: number }[] = [];
    for (let x = 0; x < cw; x += step) {
      let top = -1;
      let low = -1;
      for (let y = 0; y < chh; y++) {
        if (data[(y * cw + x) * 4 + 3] > solidA) {
          if (top < 0) top = y;
          low = y;
        }
      }
      if (top >= 0 && x + ox >= 0 && x + ox <= w * D) cols.push({ x, top, low });
    }
    if (cols.length > 4) {
      // From the page's edge along the crest to the lip, then down it.
      if (k.edge > 0) cols.reverse();
      const pts: number[] = [];
      for (const cc of cols) pts.push(cc.x, cc.top);
      const lip = cols[cols.length - 1];
      for (let i = 1; i <= 5; i++) pts.push(lip.x + (k.edge < 0 ? -1 : 1) * D * 1.5 * Math.sin((i / 5) * Math.PI), lip.top + ((lip.low - lip.top) * 0.7 * i) / 5);
      const m = pts.length / 2;
      const rr = mulberry32(hash32(k.seed, 'far-pen'));
      const cuts = [0, Math.floor(m * (0.3 + 0.1 * rr())), Math.floor(m * (0.62 + 0.1 * rr())), m];
      for (let s = 0; s < 3; s++) {
        const a = cuts[s] + (s ? 2 : 0);
        const b = cuts[s + 1] - 1;
        if (b - a < 3) continue;
        inkLine(o, pts.slice(a * 2, b * 2 + 2), false, { width: 0.4 * D, color: ink, alpha: night ? 0.3 : 0.36, swell: 0.3, taper: [0.1, 0.1], seed: hash32(k.seed, 'far', s) });
      }
      // A few strokes of hatching in its shadow, toward the lip and low.
      o.save();
      o.strokeStyle = ink;
      o.lineCap = 'round';
      o.lineWidth = 0.4 * D;
      o.globalAlpha = night ? 0.24 : 0.28;
      o.beginPath();
      const strokes = 3 + Math.floor(rr() * 4);
      for (let i = 0; i < strokes; i++) {
        const cc = cols[Math.min(cols.length - 1, Math.floor(cols.length * (0.5 + 0.42 * ((i + rr() * 0.6) / strokes))))];
        const span2 = Math.min(cc.low - cc.top, 40 * D);
        if (span2 < 6 * D) continue;
        const y0 = cc.top + span2 * (0.3 + 0.2 * rr());
        const len = span2 * (0.25 + 0.15 * rr());
        o.moveTo(cc.x, y0);
        o.lineTo(cc.x + len * 0.36 * (k.edge < 0 ? 1 : -1), y0 + len);
      }
      o.stroke();
      o.restore();
    }
  }
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
  // The water between: the middle a little taken by it (the far is the
  // engine's own haze).
  if (k.plane === 1) {
    o.globalCompositeOperation = 'source-atop';
    o.globalAlpha = MID_MIX;
    o.fillStyle = water.top;
    o.fillRect(0, 0, cw, chh);
  }
  return { canvas, x: ox, y: oy };
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
    print: true,
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
  // Ground is darker than the water over it, on paper as at night: it is
  // where the light ends, never a pale stage.
  const back = night ? mixHex(water, '#9A9282', 0.12) : mixHex(water, '#4A4038', 0.1);
  const front = night ? mixHex(waterTone(plan, c, plan.h), '#05060A', 0.4) : mixHex(water, INK, 0.3);
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
  const vy0 = view.y0 / D - 12;
  const vy1 = view.y1 / D + 12;
  for (let bi = 0; bi < parts.length; bi++) {
    const { body, crest, side } = parts[bi];
    const x0 = t ? (side < 0 ? 0 : t.x + t.gap / 2) : 0;
    const x1 = t ? (side < 0 ? t.x - t.gap / 2 : plan.w) : plan.w;
    // The face toward the window of sky is the one the light finds.
    const facing = !t || (plan.window.x < t.x ? side > 0 : side < 0);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fill(body);
    ctx.clip(body);
    if (t) {
      // Shade across a trench wall: darker as it turns down into the cleft.
      const xa = (side < 0 ? x0 : x1) * D;
      const xb = (side < 0 ? x1 : x0) * D;
      const sg = ctx.createLinearGradient(xa, 0, xb, 0);
      const [sr, sgc, sb] = rgbOf(ABYSS);
      sg.addColorStop(0, `rgba(${sr}, ${sgc}, ${sb}, 0)`);
      sg.addColorStop(0.6, `rgba(${sr}, ${sgc}, ${sb}, ${facing ? 0.1 : 0.18})`);
      sg.addColorStop(1, `rgba(${sr}, ${sgc}, ${sb}, ${facing ? 0.42 : 0.55})`);
      ctx.fillStyle = sg;
      ctx.fillRect(Math.min(xa, xb), yBack * D, Math.abs(xb - xa), H - yBack * D);
    }
    // The lit band under the crest, no deeper than a hundredth of the page:
    // on the floor all along, in a trench only on the wall facing the light.
    if (facing) {
      const deep = plan.h * 0.007;
      const M = 3;
      ctx.fillStyle = night ? '#CFC6B4' : '#F3EEE2';
      for (let s = 1; s <= M; s++) {
        const band = new Path2D();
        band.moveTo(crest[0], crest[1] - D);
        for (let i = 2; i < crest.length; i += 2) band.lineTo(crest[i], crest[i + 1] - D);
        for (let i = crest.length - 2; i >= 0; i -= 2) band.lineTo(crest[i], crest[i + 1] + ((deep * s) / M) * D);
        band.closePath();
        ctx.globalAlpha = (night ? 0.035 : 0.045) * (t ? 1.2 : 1);
        ctx.fill(band);
      }
      ctx.globalAlpha = 1;
    }
    // The beds: level strata cut by the ground, each a run of broken
    // strokes, close at the back and opening out coming forward, heavier
    // toward the foot of the page and away from the window's light: about
    // a stroke to a hundred square units, an engraver's tone, never a fill.
    const pen = new Strokes();
    {
      const top = Math.min(...crest.filter((_, i) => i % 2 === 1)) / D;
      const rs = mulberry32(hash32(plan.seed, 'beds', side));
      const tilt = ((hash32(plan.seed, 'strata') % 100) / 100 - 0.5) * 0.02;
      let y = top + 1.5;
      for (let li = 0; y < plan.h + 4 && li < 3000; li++) {
        const k = clampT((y - yBack) / Math.max(1, plan.h - yBack));
        const gap = (2.6 + 4.6 * k) * (0.8 + 0.4 * rs());
        if (y > vy0 && y < vy1) {
          const rb = mulberry32(hash32(plan.seed, 'bed', side, li));
          let x = x0 - rb() * 24;
          while (x < x1) {
            const len = (6 + 15 * rb()) * (0.7 + 0.6 * k);
            const skip = (2.5 + 9 * rb()) * (1.1 - 0.3 * k);
            const xm = x + len / 2;
            const ya = y + tilt * (x - plan.w / 2) + 0.9 * Math.sin(x * 0.031 + li);
            const yb = ya + tilt * len + (rb() - 0.5) * 0.8;
            if (Math.min(ya, yb) > lineAt(xm) + 1.5) {
              const away = Math.min(1, Math.abs(xm - plan.window.x) / (plan.w * 0.6));
              const dark = clampT(0.15 + 0.55 * k + 0.3 * away + (t && !facing ? 0.15 : 0));
              // (At night the beds are the light ink's, fewer and fainter where it is darker.)
              const al = night ? 0.22 * (1.05 - dark) : 0.6 * (0.3 + 0.7 * dark);
              pen.add(x * D, ya * D, (x + len) * D, yb * D, (0.3 + 0.5 * dark) * D, al);
            }
            x += len + skip;
          }
        }
        y += gap;
      }
    }
    pen.draw(ctx, night ? INK_NIGHT : INK);
    // Pebbles in loose clusters of three to seven where the current dropped
    // them, the clusters spread apart, the stones larger coming forward.
    {
      const rp = mulberry32(hash32(plan.seed, 'pebbles', side));
      const centres: [number, number][] = [];
      const want = Math.max(1, Math.round((x1 - x0) / (t ? 170 : 120)));
      for (let tries = 0; tries < want * 30 && centres.length < want; tries++) {
        const cx = x0 + 20 + rp() * Math.max(1, x1 - x0 - 40);
        const kk = 0.1 + 0.85 * rp();
        if (centres.some(([ax, ak]) => Math.hypot(ax - cx, (ak - kk) * 400) < 90)) continue;
        centres.push([cx, kk]);
      }
      const stone = mixHex(front, '#000000', night ? 0.3 : 0.2);
      const rim = night ? INK_NIGHT : INK;
      for (let ci = 0; ci < centres.length; ci++) {
        const [cx, kk] = centres[ci];
        const rc = mulberry32(hash32(plan.seed, 'cluster', side, ci));
        const many = 3 + Math.floor(rc() * 5);
        for (let i = 0; i < many; i++) {
          const x = cx + (rc() + rc() - 1) * (16 + 22 * kk);
          const k = clampT(kk + (rc() - 0.5) * 0.08);
          const base = lineAt(x);
          const y = base + 5 + k * (plan.h - base - 5);
          const rx = (1.4 + 4.6 * k) * (0.55 + 0.7 * rc());
          const ry = rx * (0.42 + 0.22 * rc());
          const rot = (rc() - 0.5) * 0.25;
          if (x < x0 || x > x1 || y > plan.h || y - ry * 3 > vy1 || y + ry * 3 < vy0) continue;
          // Its shadow, its body, and its outline heavier underneath.
          ctx.globalAlpha = night ? 0.35 : 0.22;
          ctx.fillStyle = night ? '#000000' : INK;
          ctx.beginPath();
          ctx.ellipse((x + rx * 0.35) * D, (y + ry * 0.55) * D, rx * 1.05 * D, ry * 0.5 * D, rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = stone;
          ctx.beginPath();
          ctx.ellipse(x * D, y * D, rx * D, ry * D, rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = night ? 0.35 : 0.55;
          ctx.strokeStyle = rim;
          ctx.lineWidth = (0.35 + 0.25 * k) * D;
          ctx.beginPath();
          ctx.ellipse(x * D, y * D, rx * D, ry * D, rot, Math.PI * 0.05, Math.PI * 0.95);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
    // The crest in one pen line, broken for about a third of its length.
    {
      const ink = night ? INK_NIGHT : INK;
      const rl = hash32(plan.seed, 'crest', bi);
      const ph = (rl % 1000) / 159;
      let run: number[] = [];
      let ri = 0;
      const flush = () => {
        if (run.length >= 8) inkLine(ctx, run, false, { width: 0.6 * D, color: ink, alpha: night ? 0.5 : 0.62, swell: 0.5, taper: [0.08, 0.08], seed: hash32(rl, ri++), raw: true });
        run = [];
      };
      for (let i = 0; i < crest.length; i += 2) {
        const x = crest[i] / D;
        const on = Math.sin(x / 23 + ph) + 0.6 * Math.sin(x / 7.7 + ph * 1.7) > -0.62;
        if (on) run.push(crest[i], crest[i + 1]);
        else flush();
      }
      flush();
    }
    if (t && side !== 0) ledgeLips(ctx, plan, t, side, D, night ? INK_NIGHT : INK, facing, night);
    if (t) {
      // Where it falls away into the cleft, in ink.
      const n = crest.length / 2;
      const lip = side < 0 ? crest.slice(Math.floor(n * 0.55) * 2) : crest.slice(0, Math.ceil(n * 0.45) * 2);
      inkLine(ctx, lip, false, { width: 0.9 * D, color: night ? INK_NIGHT : INK, alpha: night ? 0.4 : 0.55, lost: 0.35, swell: 0.6, taper: [0.1, 0.3], seed: plan.seed + 7 + bi, raw: true });
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
    // The shadow the lip casts, a hundredth of the page deep, under it and
    // on down the drop's face.
    const sh = new Path2D();
    const deep = plan.h * 0.01;
    sh.moveTo((xe + jut) * D, (ye + thick) * D);
    sh.lineTo(xe * D, (ye + thick * 0.6) * D);
    const xm = xe + (xd - xe) * 0.6;
    for (let q = 0; q <= 1.0001; q += 0.1) sh.lineTo((xe + (xm - xe) * q) * D, (floorAt(plan, xe + (xm - xe) * q) + 0.5) * D);
    for (let q = 1; q >= -0.0001; q -= 0.1) sh.lineTo((xe + (xm - xe) * q + jut * (1 - q)) * D, (floorAt(plan, xe + (xm - xe) * q) + thick * (1 - q) + deep) * D);
    sh.closePath();
    ctx.save();
    ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.5)`;
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
  ctx.save();
  // By night a shadow is barely darker than the dark water: a tenth or so.
  if (e.kind === 'whale' && plan.ground === 'night') ctx.globalAlpha *= 0.72;
  if (layer.k === 1) {
    blit(ctx, layer.canvas, layer.x, layer.y, view);
    ctx.restore();
    return;
  }
  const k = layer.k;
  const sx0 = Math.max(0, Math.floor((view.x0 - layer.x) * k) - 1);
  const sy0 = Math.max(0, Math.floor((view.y0 - layer.y) * k) - 1);
  const sx1 = Math.min(layer.canvas.width, Math.ceil((view.x1 - layer.x) * k) + 1);
  const sy1 = Math.min(layer.canvas.height, Math.ceil((view.y1 - layer.y) * k) + 1);
  if (sx1 <= sx0 || sy1 <= sy0) {
    ctx.restore();
    return;
  }
  ctx.drawImage(layer.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, layer.x + sx0 / k, layer.y + sy0 / k, (sx1 - sx0) / k, (sy1 - sy0) / k);
  ctx.restore();
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
  if (e.kind === 'whale') whaleBackInto(o, plan, e, D);
  const made: EventLayer = { canvas, x: ux0 * D, y: uy0 * D, w: (ux1 - ux0) * D, h: (uy1 - uy0) * D, k };
  c.events.set(key, made);
  return made;
}

/**
 * The whale's back lost in the water above it: the shadow comes in from
 * its back over a sixth of its length, so its long top is never a level
 * dark edge across the page (that reads as the sea's surface seen side on,
 * a false horizon). Taken out along the pitched body's own up, on the
 * whale's own layer (the picture's device px).
 */
function whaleBackInto(o: CanvasRenderingContext2D, plan: Plan, e: PlacedEvent, D: number) {
  const at = whaleHull(e, Math.min(plan.w, plan.h));
  // drawEvent's pitch as it shows: mirroring leaves up as up.
  const phi = (e.mirror ? 1 : -1) * -WHALE_PITCH * plan.current;
  const nx = -Math.sin(phi);
  const ny = Math.cos(phi);
  const blur = WHALE_BLUR * Math.min(plan.w, plan.h);
  const from = -0.11 * at.len - blur * 2;
  const to = -0.11 * at.len + 0.17 * at.len;
  const g = o.createLinearGradient((at.cx + nx * from) * D, (at.cy + ny * from) * D, (at.cx + nx * to) * D, (at.cy + ny * to) * D);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
  g.addColorStop(0.35, 'rgba(0, 0, 0, 0.5)');
  g.addColorStop(0.7, 'rgba(0, 0, 0, 0.16)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  o.save();
  o.globalCompositeOperation = 'destination-out';
  o.fillStyle = g;
  const R = at.len * 0.8;
  o.fillRect((at.cx - R) * D, (at.cy - R) * D, R * 2 * D, R * 2 * D);
  o.restore();
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
    case 'whale': {
      // Pitched a little, head up, about the middle of its body, and
      // softer than in the live sea: its back never a level edge across
      // the page (drawWhale blurs it by a hundredth of the page it is given).
      const at = whaleHull(e, Math.min(plan.w, plan.h));
      ctx.translate(w / 2, (at.cy - e.ry) * D);
      ctx.rotate(-WHALE_PITCH * plan.current);
      ctx.translate(-w / 2, -(at.cy - e.ry) * D);
      drawWhale(ctx, w, h, e.age, e.seed, plan.current, D, ambient, dark, (WHALE_BLUR / 0.01) * Math.min(plan.w, plan.h) * D);
      break;
    }
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

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
import { drawEye, drawLeviathan, drawStorm, drawVisitor, drawWhale } from '../draw';
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
import { floorAt, rockOutline, rockX, type PlacedEvent, type PlacedJelly, type PlacedRock, type Plan } from './layout';

interface Caches {
  biome: Biome;
  kelp: Kelp | null;
  sprites: SpriteCache;
  wash: Wash;
  jellies: Map<string, { canvas: HTMLCanvasElement; ox: number; oy: number }>;
  shapes: Map<number, JellyShape>;
  rocks: Map<string, { canvas: HTMLCanvasElement; x: number; y: number }>;
  hazed: WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>;
  occluder: { key: string; canvas: HTMLCanvasElement } | null;
  rayLight: { key: string; at: (x: number, y: number) => number } | null;
  wash2: { key: string; canvas: HTMLCanvasElement } | null;
  dither: HTMLCanvasElement | null;
  rays: { key: string; canvas: HTMLCanvasElement } | null;
  window: { key: string; canvas: HTMLCanvasElement } | null;
  fall: Fall | null;
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
        sprites: new SpriteCache(320e6),
        wash: new Wash(true),
        jellies: new Map(),
        shapes: new Map(),
        rocks: new Map(),
        hazed: new WeakMap(),
        occluder: null,
        rayLight: null,
        wash2: null,
        dither: null,
        rays: null,
        window: null,
        fall: null,
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
  const target = paper ? 41 : 9;
  const deep = hexOfLab(paper ? 33 : 6, A * 1.15, B * 1.15);
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

/** The water at y on the page: its depth's colour, and the page's fall at its foot. */
function waterTone(plan: Plan, c: Caches, y: number): string {
  const f = fallOf(plan, c);
  const base = tone(plan, zAt(plan, y));
  const t = Math.max(0, Math.min(1, (y - f.from) / (f.to - f.from)));
  const k = t * t * (3 - 2 * t);
  return k > 0 ? mixHex(base, f.deep, f.most * Math.pow(k, 1.15)) : base;
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
  paintVignette(ctx, plan, c, D, view);
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
    for (const a of night ? [0.9] : [1, 0.6]) {
      ctx.globalAlpha = a;
      drawSlice(ctx, layer, W, H, view);
    }
    ctx.restore();
  }
  // ---- Far: the big shapes behind everything, the rocks passed, the old
  // jellies far off, the far animals.
  for (const e of plan.events) if (e.far) paintEvent(ctx, plan, c, e, D, ambient, inSight);
  for (const r of plan.rocks) if (r.plane === 0 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight);
  for (const j of plan.jellies) if (j.far && inSight(j.box.x0, j.box.y0, j.box.x1, j.box.y1, j.r)) paintJelly(ctx, plan, c, j, D);
  paintCast(ctx, plan, c, D, ambient, 0, inSight);
  // ---- The hero's light, in the water round it.
  paintPool(ctx, plan, c, D, view);
  // ---- The middle: the kelp, the middle rocks, the floor, the rare things
  // in the water, the middle animals.
  if (c.kelp && plan.kelp) paintKelp(ctx, plan, c.kelp, c, D, ambient, inSight);
  for (const r of plan.rocks) if (r.plane === 1 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight);
  if (plan.floor) {
    const top = plan.trench ? plan.trench.top : plan.floor.y;
    if (inSight(0, top - 40, plan.w, plan.h)) paintFloor(ctx, plan, c, D, view);
  }
  for (const e of plan.events) if (!e.far && e.kind !== 'eye') paintEvent(ctx, plan, c, e, D, ambient, inSight);
  paintCast(ctx, plan, c, D, ambient, 1, inSight);
  // ---- Near: the rocks of the breaks, the way down (bubbles rising off
  // it, the jellies, the hero last), the near animals, the eye.
  for (const r of plan.rocks) if (r.plane === 2 && r.kind !== 'kelp') paintRock(ctx, plan, c, r, D, inSight);
  paintBubbles(ctx, plan, c, D, inSight);
  for (const j of plan.jellies) if (!j.far && inSight(j.box.x0, j.box.y0, j.box.x1, j.box.y1, j.r)) paintJelly(ctx, plan, c, j, D);
  paintCast(ctx, plan, c, D, ambient, 2, inSight);
  for (const e of plan.events) if (e.kind === 'eye') paintEvent(ctx, plan, c, e, D, ambient, inSight);
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
  // The wash's paint is neutral and soft. It is laid once into a canvas of
  // its own, no bigger than a few million pixels, and stretched over the
  // picture: a poster does not need a poster-sized stain, and strips of the
  // picture share it.
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
      c.wash2 = { key, canvas };
    }
  }
  if (c.wash2) drawSlice(ctx, c.wash2.canvas, W, H, view);
  // Rich darks are never flat: a mottle of deeper pigment where the deep is.
  if (plan.zMax > 0.5) {
    const r = mulberry32(hash32(plan.seed, 'mottle'));
    const yFrom = deepFrom(plan);
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const x = r() * plan.w;
      const y = yFrom + r() * (plan.h - yFrom);
      const rad = (90 + r() * 260) * D;
      const lift = r() < 0.4;
      const a = (lift ? 0.05 : 0.1) * (0.5 + r() * 0.5);
      if (!sees(view, x * D - rad, y * D - rad, x * D + rad, y * D + rad)) continue;
      const gr = ctx.createRadialGradient(x * D, y * D, 0, x * D, y * D, rad);
      const col = lift ? (plan.ground === 'night' ? '60, 72, 92' : '226, 224, 214') : plan.ground === 'night' ? '4, 4, 10' : '18, 24, 52';
      gr.addColorStop(0, `rgba(${col}, ${a})`);
      gr.addColorStop(0.5, `rgba(${col}, ${a * 0.5})`);
      gr.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(x * D - rad, y * D - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }
}

/** The page's lower corners, darker still: the fall-away, not a lens's vignette (no rim, no circle). */
function paintVignette(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, view: View) {
  const f = fallOf(plan, c);
  const [r, g, b] = rgbOf(f.deep);
  const R = Math.max(plan.w, plan.h) * 0.55 * D;
  ctx.save();
  for (const sx of [0, plan.w * D]) {
    const cy = plan.h * D * 1.05;
    if (!sees(view, sx - R, cy - R, sx + R, cy + R)) continue;
    const gr = ctx.createRadialGradient(sx, cy, 0, sx, cy, R);
    const a = plan.ground === 'paper' ? 0.32 : 0.4;
    gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a})`);
    gr.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${a * 0.6})`);
    gr.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${a * 0.18})`);
    gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(sx - R, cy - R, R * 2, R * 2);
  }
  ctx.restore();
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
  void plan;
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

function paintJelly(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, j: PlacedJelly, D: number) {
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
  ctx.drawImage(made.canvas, j.x * D - made.ox, j.y * D - made.oy);
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
  const forest: Kelp = { stalks: kelp.stalks.filter((_, i) => keep.has(i)), ledges: kelp.ledges };
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
    drawKelp(ctx, plan.w * D, hf * D, forest, focus, water, ambient, c.biome.env.current, D, undefined, true, { page: plan.h * D });
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

/** What grows on rock at each depth, with the light: reef, then the drained twilight, then the pale deep. */
const GROWTH_KITS = [
  ['fan', 'vase', 'anemone', 'fan', 'vase', 'whip'],
  ['fan', 'whip', 'vase', 'whip'],
  ['glass', 'pen', 'whip', 'glass'],
] as const;
type GrowthShape = (typeof GROWTH_KITS)[number][number];

/** Room above a rock for what grows on it, in units. */
const GROWTH_ROOM = 60;

function paintRock(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, k: PlacedRock, D: number, inSight: InSight) {
  if (!inSight(k.box.x0, k.box.y0 - GROWTH_ROOM, k.box.x1, k.box.y1, 4)) return;
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
  ctx.drawImage(made.canvas, made.x, made.y);
  ctx.restore();
}

/**
 * A rock from a wall, as an engraver draws one: its own silhouette (a shelf,
 * a buttress or a tooth, never a slab with a ruled top), a strip of bare
 * paper along the top where the light falls, contour lines following its
 * form and thickening into the shadow under it, stipple gathering where it
 * turns away, a few cracks, a pen line along its crest broken where the light
 * is, and what grows at its depth along the top. Laid once into a canvas of
 * its own at the picture's scale.
 */
function renderRock(plan: Plan, c: Caches, k: PlacedRock, D: number): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  if (typeof document === 'undefined') return null;
  const w = plan.w;
  const pad = 6;
  const room = k.plane === 0 ? 10 : GROWTH_ROOM;
  const bx0 = Math.max(-pad, k.box.x0 - pad);
  const bx1 = Math.min(w + pad, k.box.x1 + pad);
  const by0 = k.box.y0 - room;
  const by1 = k.box.y1 + pad;
  const cw = Math.max(1, Math.ceil((bx1 - bx0) * D));
  const chh = Math.max(1, Math.ceil((by1 - by0) * D));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = chh;
  const o = canvas.getContext('2d');
  if (!o) return null;
  const ox = Math.floor(bx0 * D);
  const oy = Math.floor(by0 * D);
  o.setTransform(D, 0, 0, D, -ox, -oy);
  o.lineCap = 'round';
  o.lineJoin = 'round';

  const r = mulberry32(hash32(k.seed, 'paint'));
  const N = k.shape.top.length - 1;
  const H = k.height;
  const X = (u: number) => rockX(k, w, u);
  const topY = (u: number) => {
    const f = u * N;
    const i0 = Math.floor(f);
    const i1 = Math.min(N, i0 + 1);
    const t = f - i0;
    return k.y + (k.shape.top[i0] * (1 - t) + k.shape.top[i1] * t) * H;
  };
  const underY = (u: number) => {
    const f = u * N;
    const i0 = Math.floor(f);
    const i1 = Math.min(N, i0 + 1);
    const t = f - i0;
    return k.y + (k.shape.under[i0] * (1 - t) + k.shape.under[i1] * t) * H;
  };
  const outline = rockOutline(k, w);
  const region = smoothPath(outline, true, 3);

  const yMid = k.y + H * 0.5;
  const water = waterTone(plan, c, yMid);
  const night = plan.ground === 'night';
  const deepWater = lumOf(water) < 0.47;
  const weight = k.plane === 2 ? 1 : k.plane === 1 ? 0.75 : 0.5;
  // On paper the pen is always the dark ink: a rock is engraved. By night
  // it is the light ink.
  const ink = night ? INK_NIGHT : INK;
  // The stone: a warm grey a step off the water, darker than pale water
  // and lighter than deep water, so it is a form and never a hole; darker
  // toward its foot.
  const body = night ? mixHex(water, '#5C574E', 0.5) : deepWater ? mixHex(water, '#A09684', 0.55) : mixHex(water, '#70675B', 0.62);
  const foot = night ? mixHex(body, '#000000', 0.35) : mixHex(body, deepWater ? '#3F3A33' : INK, deepWater ? 0.35 : 0.4);
  const lit = night ? mixHex(water, '#D8D0C0', 0.45) : mixHex(PAPER, body, 0.12);
  const g = o.createLinearGradient(0, k.y, 0, k.y + H);
  g.addColorStop(0, body);
  g.addColorStop(0.45, mixHex(body, foot, 0.35));
  g.addColorStop(1, foot);
  o.fillStyle = g;
  o.fill(region);
  o.save();
  o.clip(region);

  // The bare paper along the lit top: the crest's own line, thick and soft,
  // half of it clipped away above, so it follows the rock round.
  const band = Math.max(2.5, H * 0.07);
  const crestPath = new Path2D();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    if (i === 0) crestPath.moveTo(X(u), topY(u));
    else crestPath.lineTo(X(u), topY(u));
  }
  o.strokeStyle = lit;
  for (const [wk, a] of [
    [2.2, 0.35],
    [1.4, 0.45],
    [0.7, 0.6],
  ] as const) {
    o.globalAlpha = a;
    o.lineWidth = band * wk;
    o.stroke(crestPath);
  }
  o.globalAlpha = 1;

  // Contour lines: each a level between the crest and the underside, so they
  // follow the rock round; none in the light along the top, closer and
  // darker toward the shadow beneath, the pen lifting now and then.
  const gap = k.plane === 2 ? 3.4 : k.plane === 1 ? 4.2 : 6;
  const lines = Math.round(Math.max(5, Math.min(48, (H * 0.8) / gap)));
  o.strokeStyle = ink;
  for (let li = 0; li < lines; li++) {
    const t0 = (li + 0.5) / lines;
    const v = 0.2 + 0.78 * Math.pow(t0, 0.75);
    const shade = Math.min(1, Math.max(0, (v - 0.18) / 0.8));
    const steps = 56;
    let down = false;
    let run = 0;
    let len = 4 + r() * 18;
    o.lineWidth = (0.3 + 0.45 * shade) * weight;
    o.globalAlpha = (night ? 0.12 + 0.3 * shade : 0.1 + 0.45 * shade) * (k.plane === 0 ? 0.8 : 1);
    o.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const yt = topY(u);
      const yb = underY(u);
      if (yb - yt < 1.5) {
        down = false;
        continue;
      }
      // Lighter toward the lip, where the light comes round: shorter strokes, longer lifts.
      run++;
      if (run > len) {
        run = 0;
        const lifted: boolean = !down;
        down = lifted ? r() < 0.55 + 0.4 * shade : r() > 0.2 + 0.35 * u * (1 - shade);
        len = down ? 4 + r() * 22 * (0.5 + shade) : 1 + r() * 4;
        if (!down) continue;
        const x = X(u);
        o.moveTo(x, yt + (yb - yt) * v + Math.sin(u * 13 + li * 2.3) * 0.4);
        continue;
      }
      if (!down) continue;
      o.lineTo(X(u), yt + (yb - yt) * v + Math.sin(u * 13 + li * 2.3) * 0.4);
    }
    o.stroke();
  }

  // Stipple: dots gathering where it turns from the light and toward the wall.
  {
    const spacing = k.plane === 0 ? 3.4 : 2.2;
    const span = (k.reach + k.off) * w;
    const n = Math.round((span * H) / (spacing * spacing));
    const dots = new Path2D();
    for (let i = 0; i < n; i++) {
      const u = r();
      const v = r();
      const yt = topY(u);
      const yb = underY(u);
      if (yb - yt < 1) continue;
      const shade = Math.max(0, (v - 0.22) / 0.78) * (0.65 + 0.35 * (1 - u));
      if (r() > Math.pow(shade, 1.6) * 0.95) continue;
      const x = X(u) + (r() - 0.5) * 2;
      const y = yt + (yb - yt) * v;
      const rad = (0.25 + 0.3 * r()) * weight;
      dots.moveTo(x + rad, y);
      dots.arc(x, y, rad, 0, Math.PI * 2);
    }
    o.globalAlpha = night ? 0.4 : 0.6;
    o.fillStyle = ink;
    o.fill(dots);
  }

  // Cracks: a few fissures down the face, the pen pressing and lifting.
  if (k.plane > 0) {
    const cracks = 2 + Math.floor(r() * 3);
    for (let i = 0; i < cracks; i++) {
      const u = 0.15 + r() * 0.7;
      const pts: number[] = [];
      let x = X(u);
      let y = topY(u) + H * (0.1 + r() * 0.15);
      const len = H * (0.18 + r() * 0.35);
      const steps = 6;
      for (let s2 = 0; s2 <= steps; s2++) {
        pts.push(x, y);
        x += (r() - 0.5) * H * 0.08;
        y += len / steps;
      }
      inkLine(o, pts, false, { width: 0.7 * weight, color: ink, alpha: night ? 0.4 : 0.5, lost: 0.4, swell: 0.6, taper: [0.2, 0.5], seed: k.seed + 20 + i, min: 0.15 });
    }
  }
  o.restore();

  // The crest in one pen line, broken where the light is; the underside fainter.
  const crest: number[] = [];
  for (let i = 0; i <= N; i++) crest.push(X(i / N), topY(i / N));
  const lipFace: number[] = [];
  for (let i = Math.round(N * 0.7); i <= N; i++) lipFace.push(X(i / N), topY(i / N));
  for (let i = N; i >= Math.round(N * 0.45); i--) lipFace.push(X(i / N), underY(i / N));
  inkLine(o, crest, false, { width: 1.15 * weight, color: ink, alpha: night ? 0.7 : 0.85, swell: 0.6, lost: 0.4, taper: [0.02, 0.12], seed: k.seed + 2, min: 0.2 });
  inkLine(o, lipFace, false, { width: 0.9 * weight, color: ink, alpha: night ? 0.55 : 0.7, swell: 0.7, lost: 0.25, taper: [0.1, 0.4], seed: k.seed + 3, min: 0.2 });

  // What grows on it: on the near and middle rocks only, nothing in the haze.
  if (k.plane > 0) {
    const tier = Math.min(2, k.zone);
    const kit = GROWTH_KITS[tier];
    const count = (k.plane === 2 ? 2 : 1) + Math.floor(r() * 3);
    const hues = [HUES[Math.floor(r() * HUES.length)], HUES[Math.floor(r() * HUES.length)], HUES[Math.floor(r() * HUES.length)]];
    const z = zAt(plan, k.y);
    const visibleFrom = k.off / (k.off + k.reach) + 0.04;
    for (let i = 0; i < count; i++) {
      const u = visibleFrom + ((0.88 - visibleFrom) * (i + 0.2 + r() * 0.6)) / count;
      const kind = kit[Math.floor(r() * kit.length)];
      const size = plan.h * (0.015 + 0.015 * r()) * (k.plane === 2 ? 1 : 0.8);
      const hue = drained(hues[i % 3], z);
      paintGrowth(o, kind, X(u), topY(u) + 1.2, size, hue, night, tier, mulberry32(k.seed + 10 + i), weight);
    }
  }
  // In the sunlit water, the net of light on its top.
  const zTop = zAt(plan, k.y);
  const caustic = 0.45 * Math.max(0, 1 - zTop / 0.32) * (k.plane === 0 ? 0 : 1);
  if (caustic > 0.02) {
    o.save();
    o.clip(region);
    o.setTransform(1, 0, 0, 1, 0, 0);
    const reg = new Path2D();
    const x0 = Math.min(X(0.2), X(0.95)) * D - ox;
    const x1 = Math.max(X(0.2), X(0.95)) * D - ox;
    const y0 = k.y * D - oy;
    reg.ellipse((x0 + x1) / 2, y0 + band * D, (x1 - x0) / 2, band * 1.8 * D, 0, 0, Math.PI * 2);
    causticsOn(o, reg, { x: x0, y: y0 - band * D, w: x1 - x0, h: band * 4 * D }, caustic, D, k.seed);
    o.restore();
  }
  // The water between: the middle a little taken by it, the far mostly.
  if (k.plane < 2) {
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-atop';
    o.globalAlpha = k.plane === 0 ? FAR_MIX : MID_MIX;
    o.fillStyle = water;
    o.fillRect(0, 0, cw, chh);
  }
  return { canvas, x: ox, y: oy };
}

/** A growth on a rock: sea fans in one plane, wider than tall; sponges as vases with a rim; anemones; whips; in the deep, glass sponges and sea pens. Sizes are its height, in units. */
function paintGrowth(o: CanvasRenderingContext2D, kind: GrowthShape, x: number, y: number, size: number, hue: string, dark: boolean, tier: number, r: Rand, weight: number) {
  const pale = tier === 2 ? mixHex(hue, dark ? '#E9E2D2' : '#F3EEE2', 0.6) : hue;
  const ink = dark ? mixHex(pale, '#FFFFFF', 0.45) : mixHex(pale, INK, 0.62);
  const wash = dark ? mixHex(pale, '#1A1815', 0.3) : mixHex(pale, PAPER, 0.1);
  o.save();
  o.lineCap = 'round';
  o.lineJoin = 'round';
  o.strokeStyle = ink;
  o.fillStyle = wash;
  const lean = (r() - 0.5) * 0.3;
  if (kind === 'fan') {
    // A sea fan: one flat net of branches, spread wide from a short stem.
    const tips: [number, number][] = [];
    const branch = (bx: number, by: number, a: number, len: number, depth: number) => {
      const ex = bx + Math.sin(a) * len;
      const ey = by - Math.cos(a) * len;
      o.lineWidth = Math.max(0.25, (0.2 + depth * 0.22) * weight);
      o.globalAlpha = 0.85;
      o.beginPath();
      o.moveTo(bx, by);
      o.quadraticCurveTo(bx + Math.sin(a) * len * 0.5 + (r() - 0.5) * len * 0.15, by - Math.cos(a) * len * 0.5, ex, ey);
      o.stroke();
      if (depth > 0) {
        const spread = 0.38 + 0.12 * (3 - depth);
        for (const d of [-spread, spread]) branch(ex, ey, a + d + (r() - 0.5) * 0.15, len * 0.72, depth - 1);
      } else tips.push([ex, ey]);
    };
    // Squashed into its plane: about one and a half times as wide as tall.
    o.translate(x, y);
    o.scale(1.3, 0.85);
    o.translate(-x, -y);
    o.lineWidth = 0.9 * weight;
    o.beginPath();
    o.moveTo(x, y);
    o.lineTo(x + Math.sin(lean) * size * 0.12, y - size * 0.12);
    o.stroke();
    for (const a0 of [-0.75, 0, 0.75]) branch(x + Math.sin(lean) * size * 0.12, y - size * 0.12, a0 + lean, size * 0.32, 3);
    // The mesh between the twigs, fine and broken.
    tips.sort((p, q) => Math.atan2(p[0] - x, y - p[1]) - Math.atan2(q[0] - x, y - q[1]));
    o.lineWidth = 0.22 * weight;
    o.globalAlpha = 0.4;
    o.beginPath();
    for (let i = 1; i < tips.length; i++) {
      if (r() < 0.35) continue;
      o.moveTo(tips[i - 1][0], tips[i - 1][1]);
      o.lineTo(tips[i][0], tips[i][1]);
    }
    o.stroke();
  } else if (kind === 'vase' || kind === 'glass') {
    // Sponges: irregular vases, each with its rim, in a little cluster.
    const m = kind === 'glass' ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const vh = size * (0.65 + r() * 0.35) * (i === 0 ? 1 : 0.75);
      const vw = vh * (0.38 + r() * 0.3);
      const vx = x + (i - (m - 1) / 2) * vw * 1.1 + (r() - 0.5) * vw * 0.3;
      const tilt = lean + (r() - 0.5) * 0.25;
      const bulge = 0.8 + r() * 0.5;
      const pinch = 0.25 + r() * 0.2;
      o.save();
      o.translate(vx, y);
      o.rotate(tilt);
      const L = new Path2D();
      L.moveTo(-vw * pinch, 0);
      L.bezierCurveTo(-vw * bulge, -vh * 0.35, -vw * (0.45 + r() * 0.3), -vh * 0.8, -vw * 0.5, -vh);
      L.lineTo(vw * 0.5, -vh * (0.96 + r() * 0.08));
      L.bezierCurveTo(vw * (0.45 + r() * 0.3), -vh * 0.8, vw * bulge, -vh * 0.4, vw * pinch, 0);
      L.closePath();
      o.globalAlpha = kind === 'glass' ? 0.55 : 0.85;
      o.fill(L);
      o.globalAlpha = 0.85;
      o.lineWidth = 0.55 * weight;
      o.stroke(L);
      // The rim and the dark of the opening.
      o.beginPath();
      o.ellipse(0, -vh, vw * 0.5, vw * 0.16, 0, 0, Math.PI * 2);
      o.fillStyle = dark ? mixHex(wash, '#000000', 0.4) : mixHex(wash, INK, 0.45);
      o.globalAlpha = 0.7;
      o.fill();
      o.globalAlpha = 0.85;
      o.stroke();
      // Pores, or the glass sponge's lattice, just seen.
      o.save();
      o.clip(L);
      o.globalAlpha = 0.35;
      o.lineWidth = 0.25 * weight;
      if (kind === 'glass') {
        o.beginPath();
        for (let k2 = -4; k2 <= 4; k2++) {
          o.moveTo(k2 * vw * 0.3 - vh, 0);
          o.lineTo(k2 * vw * 0.3 + vh, -vh * 2);
          o.moveTo(k2 * vw * 0.3 + vh, 0);
          o.lineTo(k2 * vw * 0.3 - vh, -vh * 2);
        }
        o.stroke();
      } else {
        o.fillStyle = o.strokeStyle as string;
        for (let k2 = 0; k2 < 9; k2++) {
          o.beginPath();
          o.arc((r() - 0.5) * vw * 0.8, -vh * (0.15 + r() * 0.7), 0.3 + r() * 0.35, 0, Math.PI * 2);
          o.fill();
        }
      }
      o.restore();
      o.restore();
      o.fillStyle = wash;
    }
  } else if (kind === 'anemone') {
    const s = size * 0.9;
    o.globalAlpha = 0.85;
    o.beginPath();
    o.moveTo(x - s * 0.13, y);
    o.quadraticCurveTo(x - s * 0.16, y - s * 0.2, x - s * 0.1, y - s * 0.35);
    o.lineTo(x + s * 0.1, y - s * 0.35);
    o.quadraticCurveTo(x + s * 0.16, y - s * 0.2, x + s * 0.13, y);
    o.closePath();
    o.fill();
    o.lineWidth = 0.5 * weight;
    o.stroke();
    o.lineWidth = 0.4 * weight;
    for (let i = 0; i < 13; i++) {
      const a = -1.25 + (2.5 * i) / 12 + lean;
      const l = s * (0.3 + r() * 0.2);
      o.beginPath();
      o.moveTo(x + Math.sin(a) * s * 0.08, y - s * 0.35);
      o.quadraticCurveTo(x + Math.sin(a) * l * 0.7, y - s * 0.35 - l * 0.8, x + Math.sin(a * 1.2) * l, y - s * 0.35 - Math.cos(a) * l * 0.9);
      o.stroke();
    }
  } else if (kind === 'whip') {
    o.globalAlpha = 0.8;
    const m = 2 + Math.floor(r() * 2);
    for (let i = 0; i < m; i++) {
      const l = size * (0.9 + r() * 0.6);
      const a = lean + (i - (m - 1) / 2) * 0.3;
      const bend = (r() - 0.5) * l * 0.5;
      o.lineWidth = 0.6 * weight;
      o.beginPath();
      o.moveTo(x, y);
      o.quadraticCurveTo(x + Math.sin(a) * l * 0.5 + bend, y - l * 0.55, x + Math.sin(a) * l + bend * 0.4, y - Math.cos(a) * l);
      o.stroke();
    }
  } else {
    // A sea pen: a stalk with a feather of leaves.
    const l = size * 1.1;
    const ex = x + Math.sin(lean) * l;
    const ey = y - Math.cos(lean) * l;
    o.globalAlpha = 0.85;
    o.lineWidth = 0.6 * weight;
    o.beginPath();
    o.moveTo(x, y);
    o.lineTo(ex, ey);
    o.stroke();
    o.lineWidth = 0.35 * weight;
    for (let i = 0; i < 12; i++) {
      const t = 0.35 + (0.62 * i) / 11;
      const px0 = x + (ex - x) * t;
      const py0 = y + (ey - y) * t;
      const lw = size * 0.22 * Math.sin((Math.PI * (t - 0.3)) / 0.75);
      for (const sd of [-1, 1]) {
        o.beginPath();
        o.moveTo(px0, py0);
        o.quadraticCurveTo(px0 + sd * lw * 0.6, py0 - lw * 0.1, px0 + sd * lw, py0 - lw * 0.45);
        o.stroke();
      }
    }
  }
  o.restore();
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

/** The eye, half in the dark at the edge of the page, where the rest of the animal is. */
function eyeInTheDark(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, e: PlacedEvent, D: number) {
  const rr = 0.2 * Math.min(e.rw, e.rh);
  const left = e.x < plan.w / 2;
  const ex = (left ? 0 : plan.w) * D;
  const ey = e.y * D;
  const reach = rr * 2.6 * D;
  const deep = mixHex(waterTone(plan, c, e.y), '#05060A', 0.45);
  const [r, g, b] = rgbOf(deep);
  const rgb = `${r}, ${g}, ${b}`;
  const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, reach);
  gr.addColorStop(0, `rgba(${rgb}, 0.92)`);
  gr.addColorStop(0.32, `rgba(${rgb}, 0.6)`);
  gr.addColorStop(0.7, `rgba(${rgb}, 0.18)`);
  gr.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.fillStyle = gr;
  ctx.fillRect(ex - reach, ey - reach, reach * 2, reach * 2);
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
  // The silt's colour: at the back nearly the water, coming forward darker.
  const back = night ? mixHex(water, '#8C8576', 0.2) : mixHex(water, '#C9C3B4', 0.25);
  const front = mixHex(waterTone(plan, c, plan.h), night ? '#05060A' : INK, night ? 0.35 : 0.3);

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
      for (let li = 1; li <= 22; li++) {
        const d = li * 4.5 + li * li * 0.35;
        ctx.globalAlpha = Math.max(0.06, 0.32 - li * 0.01);
        ctx.lineWidth = Math.max(0.3, 0.65 - li * 0.012) * D;
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
    const ripples = Math.round(((x1 - x0) / 26) * (t ? 0.5 : 1));
    for (let i = 0; i < ripples; i++) {
      const x = x0 + r() * (x1 - x0);
      const k = Math.pow(r(), 0.9);
      const y = lineAt(x) + 5 + k * Math.min(40, plan.h - lineAt(x) - 4);
      if (y > plan.h) continue;
      const len = (12 + 40 * k) * (0.6 + r() * 0.7);
      ctx.lineWidth = (0.4 + 0.5 * k) * D;
      ctx.strokeStyle = `${lightInk}${(0.08 + 0.18 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo((x - len / 2) * D, y * D);
      ctx.quadraticCurveTo(x * D, (y - (1.5 + 2.5 * k)) * D, (x + len / 2) * D, y * D);
      ctx.stroke();
    }
    // Stipple, thickening toward the front.
    {
      const dots = new Path2D();
      const n = Math.round((x1 - x0) * depth * 0.035);
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0);
        const k = r();
        if (r() > 0.12 + 0.88 * k) continue;
        const y = yBack + k * depth + (r() - 0.5) * 6;
        const rad = (0.3 + 0.35 * r()) * (0.7 + 0.5 * k);
        dots.moveTo((x + rad) * D, y * D);
        dots.arc(x * D, y * D, rad * D, 0, Math.PI * 2);
      }
      ctx.globalAlpha = night ? 0.45 : 0.5;
      ctx.fillStyle = ink;
      ctx.fill(dots);
      ctx.globalAlpha = 1;
    }
    // Stones half sunk, bigger toward the front.
    const stones = Math.round((x1 - x0) / (t ? 110 : 55));
    for (let i = 0; i < stones; i++) {
      const x = x0 + r() * (x1 - x0);
      const k = r();
      const y = lineAt(x) + 6 + k * 0.5 * (plan.h - lineAt(x));
      if (y > plan.h) continue;
      const rx = (2.5 + 9 * k) * (0.7 + r() * 0.6);
      const ry = rx * (0.4 + r() * 0.25);
      const rot = (r() - 0.5) * 0.3;
      ctx.fillStyle = mixHex(front, '#000000', night ? 0.25 : 0.15);
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.ellipse(x * D, y * D, rx * D, ry * D, rot, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `${lightInk}0.35)`;
      ctx.lineWidth = 0.5 * D;
      ctx.beginPath();
      ctx.ellipse(x * D, y * D, rx * D, ry * D, rot, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.restore();
    // The crest in one pen line, broken where the light is.
    inkLine(ctx, crest, false, { width: 0.9 * D, color: night ? '#E8E0CF' : '#F1ECDF', alpha: 0.45, lost: 0.75, swell: 0.4, taper: [0.02, 0.05], seed: plan.seed + bi, raw: true });
    if (t) {
      // Where it falls away into the cleft, in ink.
      const n = crest.length / 2;
      const lip = side < 0 ? crest.slice(Math.floor(n * 0.55) * 2) : crest.slice(0, Math.ceil(n * 0.45) * 2);
      inkLine(ctx, lip, false, { width: 0.9 * D, color: ink, alpha: 0.5, lost: 0.35, swell: 0.6, taper: [0.1, 0.3], seed: plan.seed + 7 + bi, raw: true });
    }
  }
  void view;
  // Vents, where the sitting rolled them: squat chimneys breathing a little.
  if (c.biome.env.vents) {
    const low = front;
    for (let v = 0; v < 2; v++) {
      let vx = plan.w * (0.2 + v * 0.55 + (r() - 0.5) * 0.08);
      if (t && Math.abs(vx - t.x) < t.gap / 2 + 60) vx = t.x + Math.sign(vx - t.x || 1) * (t.gap / 2 + 80);
      const vy = lineAt(vx);
      if (vy > plan.h * 0.97) continue;
      const vh = 22 + r() * 16;
      const chimney = new Path2D();
      chimney.moveTo((vx - 11) * D, (vy + 3) * D);
      chimney.quadraticCurveTo((vx - 6) * D, (vy - vh * 0.5) * D, (vx - 4) * D, (vy - vh) * D);
      chimney.lineTo((vx + 4) * D, (vy - vh) * D);
      chimney.quadraticCurveTo((vx + 7) * D, (vy - vh * 0.5) * D, (vx + 11) * D, (vy + 3) * D);
      chimney.closePath();
      ctx.save();
      ctx.fillStyle = mixHex(low, '#000000', 0.2);
      ctx.fill(chimney);
      ctx.strokeStyle = `${lightInk}0.45)`;
      ctx.lineWidth = 0.8 * D;
      ctx.stroke(chimney);
      for (let k = 0; k < 9; k++) {
        const tt = k / 9;
        ctx.fillStyle = `${lightInk}${(0.25 * (1 - tt)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc((vx + Math.sin(tt * 6 + k) * 5) * D, (vy - vh - tt * 70) * D, Math.min(2, 0.8 + tt * 1.2) * D, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/* ---- The rare things ---- */

function paintEvent(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, e: PlacedEvent, D: number, ambient: number, inSight: InSight) {
  if (e.kind === 'whalefall' ? !(e.box && inSight(e.box.x0, e.box.y0, e.box.x1, e.box.y1, 120)) : !inSight(e.rx, e.ry, e.rx + e.rw, e.ry + e.rh, 40)) return;
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
      drawWhale(ctx, w, h, e.age, e.seed, plan.current, D, ambient, dark);
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
      drawEye(ctx, w, h, e.age, e.seed, D, dark);
      ctx.restore();
      eyeInTheDark(ctx, plan, c, e, D);
      return;
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
      drawWhaleFall(ctx, w, h, 1, e.seed, D, ambient, dark, e.y * D);
      break;
  }
  ctx.restore();
}

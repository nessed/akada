/**
 * The picture, painted from its plan.
 *
 * Every drawing here is one the live sea already makes (the wash, the kelp,
 * the rocks, the animals' sprites, the jellies, the rare things), placed and
 * scaled by the plan rather than by a clock. Everything is a pure function
 * of the plan and the device scale, so a picture drawn in strips, or twice,
 * comes out the same; what is slow to make (sprites, jellies, rocks, the
 * occluder) is kept on the plan for the next strip.
 */

import { mixHex } from '../../fan';
import { buildJelly, drawJelly, jellyInk, type JellyShape } from '../../jelly';
import { rollBiome, type Biome, type Species } from '../biome';
import { depthAt } from '../depth';
import { drawEye, drawLeviathan, drawStorm, drawVisitor, drawWhale } from '../draw';
import { rollKelp, type Kelp } from '../kelp';
import { drawKelp } from '../kelp-draw';
import { drawGodRays, drawSnellWindow, drawSnowDeep, godRayLight, sunFor } from '../light';
import { jellyForBlock } from '../lineage';
import { drained, HUES, waterAt, type Water } from '../palette';
import { hatch, inkLine, smoothPath, stipple } from '../pen';
import { hash32, mulberry32 } from '../random';
import type { Visitor } from '../schedule';
import { drawDumbo, drawLure, drawWhaleFall } from '../sightings-deep';
import { drawOarfish, drawSiphonophore, drawTurtle } from '../sightings-shallow';
import { SpriteCache } from '../sprites';
import { Wash } from '../wash';
import { causticsOn } from '../caustics';
import type { PlacedEvent, PlacedJelly, Plan } from './layout';

interface Caches {
  biome: Biome;
  kelp: Kelp | null;
  sprites: SpriteCache;
  wash: Wash;
  jellies: Map<string, { canvas: HTMLCanvasElement; ox: number; oy: number }>;
  shapes: Map<number, JellyShape>;
  occluder: { key: string; canvas: HTMLCanvasElement } | null;
  rayLight: { key: string; at: (x: number, y: number) => number } | null;
  wash2: { key: string; canvas: HTMLCanvasElement } | null;
  dither: HTMLCanvasElement | null;
  rays: { key: string; canvas: HTMLCanvasElement } | null;
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
        wash: new Wash(),
        jellies: new Map(),
        shapes: new Map(),
        occluder: null,
        rayLight: null,
        wash2: null,
        dither: null,
        rays: null,
      } satisfies Caches,
    });
  }
  return holder.__cache as Caches;
}

const PAPER = '#FBF8EF';
const NIGHT = '#1A1815';
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

function lumOf(hex: string): number {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return 0.5;
  return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
}

function zAt(plan: Plan, y: number): number {
  const s = plan.zStops;
  const i = Math.max(0, Math.min(s.length - 2, Math.floor((y / plan.h) * (s.length - 1))));
  const a = s[i];
  const b = s[i + 1];
  return a.z + ((b.z - a.z) * Math.max(0, Math.min(1, (y - a.y) / Math.max(1e-6, b.y - a.y))));
}

/** The water at a depth on the page, as the picture lays it: its colour, and whether ink on it is the light ink. */
function waterAtY(plan: Plan, y: number): Water {
  const z = zAt(plan, y);
  const base = waterAt(z, plan.ground, plan.color);
  const t = tone(plan, z);
  return { ...base, top: t, bottom: mixHex(t, '#000000', 0.12), dark: plan.ground === 'night' || lumOf(t) < 0.47 };
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

// PROBE
const __P: Record<string, number> = ((globalThis as unknown as { __picT?: Record<string, number> }).__picT ??= {});
let __pl = '';
let __pt = 0;
function __probe(name: string) {
  const now = performance.now();
  if (__pl) __P[__pl] = (__P[__pl] ?? 0) + now - __pt;
  __pl = name === 'end' ? '' : name;
  __pt = now;
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

export function paint(ctx: CanvasRenderingContext2D, plan: Plan, px: number): void {
  __probe('start');
  const D = px * plan.unit;
  const W = plan.w * D;
  const H = plan.h * D;
  if (!(W > 0 && H > 0)) return;
  const c = cachesOf(plan);
  const ambient = 30 + (plan.seed % 997) / 31;
  const sun = sunFor(plan.hour);
  const night = plan.ground === 'night';
  const view = viewOf(ctx, W, H);
  if (view.x1 <= view.x0 || view.y1 <= view.y0) return;
  /** Whether a box in units, grown by `pad` units, is in sight. */
  const inSight = (x0: number, y0: number, x1: number, y1: number, pad = 0) => sees(view, (x0 - pad) * D, (y0 - pad) * D, (x1 + pad) * D, (y1 + pad) * D);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';

  __probe("The water: the depth's c");
  // ---- The water: the depth's colour down the page, then the paint.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const s of plan.zStops) g.addColorStop(s.y / plan.h, tone(plan, s.z));
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  paintWash(ctx, plan, c, D, W, H, view);

  __probe('The light from above, ca');
  // ---- The light from above, carved by everything that stands in it. The
  // shafts are soft, so they are laid once into a layer of their own at no
  // more than a few thousand pixels, faded out by the end of the twilight
  // however far below that the picture goes, and each strip draws its slice.
  const lit = litDepth(plan);
  const rs = Math.max(1, Math.max(W, H) / 2400);
  const occluder = occluderOf(plan, c);
  const rays = {
    source: { x: (plan.window.x * D) / rs, y: (plan.window.y * D) / rs },
    occluder,
    strength: 0.55 + 0.6 * Math.max(0, 1 - plan.zMax / 0.6),
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
    // A pale ray barely shows on pale water: on paper it is laid on harder.
    for (const a of night ? [1] : [1, 0.75]) {
      ctx.globalAlpha = a;
      drawSlice(ctx, layer, W, H, view);
    }
    ctx.restore();
  }

  __probe('Far: the big shapes behi');
  // ---- Far: the big shapes behind everything, then the far animals, hazy.
  for (const e of plan.events) if (e.far) paintEvent(ctx, plan, e, D, ambient, inSight);
  paintCast(ctx, plan, c, D, ambient, 0, inSight);

  __probe('The places passed: kelp,');
  // ---- The places passed: kelp, rocks, the ledges of the breaks, the floor.
  if (c.kelp && plan.kelp) paintKelp(ctx, plan, c.kelp, c, D, ambient, inSight);
  for (const r of plan.rocks) {
    if (!inSight(r.box.x0, r.box.y0, r.box.x1, r.y + r.thick, 90)) continue;
    paintRock(ctx, plan, { edge: r.edge, reach: r.reach, y: r.y, thick: r.thick, zone: r.zone, seed: hash32(plan.seed, 'rock', r.slot) }, D);
  }
  for (const l of plan.ledges) {
    if (!inSight(l.box.x0, l.box.y0, l.box.x1, l.y + l.thick, 90)) continue;
    paintRock(ctx, plan, { edge: l.edge, reach: l.reach, y: l.y, thick: l.thick, zone: l.zone, seed: l.seed }, D);
  }
  if (plan.floor && inSight(0, plan.floor.y - 80, plan.w, plan.h)) paintFloor(ctx, plan, c, D, ambient);

  __probe('Middle: the rare things ');
  // ---- Middle: the rare things in the water, the middle animals.
  for (const e of plan.events) if (!e.far && e.kind !== 'eye') paintEvent(ctx, plan, e, D, ambient, inSight);
  paintCast(ctx, plan, c, D, ambient, 1, inSight);

  __probe('The way down: bubbles ri');
  // ---- The way down: bubbles rising off it, and the jellies, the hero last.
  paintBubbles(ctx, plan, D, inSight);
  for (const j of plan.jellies) if (inSight(j.box.x0, j.box.y0, j.box.x1, j.box.y1, j.r * 1.4)) paintJelly(ctx, plan, c, j, D);

  __probe('Near.');
  // ---- Near.
  paintCast(ctx, plan, c, D, ambient, 2, inSight);
  for (const e of plan.events) if (e.kind === 'eye') paintEvent(ctx, plan, e, D, ambient, inSight);

  __probe('The sky, looking up: a s');
  // ---- The sky, looking up: a small soft window at the very top, over
  // everything in the water; nothing crosses it but a few fish, dark
  // against the light. Soft, so on a poster it is drawn smaller and up.
  const win = plan.window;
  if (inSight(win.x - win.r, 0, win.x + win.r, win.y + win.r, win.r * 1.8)) {
    const k = Math.max(1, W / 3200);
    ctx.save();
    ctx.scale(k, k);
    drawSnellWindow(ctx, W / k, H / k, { cx: (win.x * D) / k, cy: (win.y * D) / k, radius: (win.r * D) / k, sun, moon: plan.moon, dark: night, px: D / k, seed: plan.seed });
    ctx.restore();
    paintSilhouettes(ctx, plan, D);
  }

  __probe('Light: what glows lights');
  // ---- Light: what glows lights what is near it.
  paintLights(ctx, plan, lightsOf(plan, c, D), view);

  __probe('Snow, near to far, caugh');
  // ---- Snow, near to far, caught in the light.
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
  });

  __probe('A whisper of noise, so n');
  // ---- A whisper of noise, so no gradient bands.
  paintDither(ctx, c, plan.seed, view);
  ctx.restore();
  __probe('end');
}

/** The net of light off the surface, on what faces up in the sunlit water. */
function lightOnTop(ctx: CanvasRenderingContext2D, plan: Plan, edge: -1 | 1, reach: number, y: number, D: number) {
  const z = zAt(plan, y);
  const strength = 0.5 * Math.max(0, 1 - z / 0.32);
  if (strength <= 0.02) return;
  const x0 = (edge < 0 ? 0 : plan.w * (1 - reach)) * D;
  const box = { x: x0, y: (y - 14) * D, w: reach * plan.w * D, h: 30 * D };
  const region = new Path2D();
  region.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
  causticsOn(ctx, region, box, strength, D, plan.seed);
}

/* ---- Light and noise, without reading the canvas back ---- */

/** A glow's falloff: a bright core, then a long tail as the water scatters it (as light.ts's). */
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
 * canvas under it: a readback stalls the canvas, and in a strip the pixels
 * under a light may not be there to read.
 */
function paintLights(ctx: CanvasRenderingContext2D, plan: Plan, lights: Light[], view: View) {
  void plan;
  ctx.save();
  for (const L of lights) {
    const s = Math.max(0, Math.min(2, L.strength));
    if (s <= 0.005 || !sees(view, L.x - L.r, L.y - L.r, L.x + L.r, L.y + L.r)) continue;
    const n = parseInt(L.color.replace('#', '').slice(0, 6), 16);
    const rgb = Number.isFinite(n) ? `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}` : '191, 243, 230';
    const pool = (alpha: number, reach: number) => {
      const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, reach);
      for (const [t, f] of FALLOFF) gr.addColorStop(t, `rgba(${rgb}, ${Math.min(1, alpha * f).toFixed(4)})`);
      ctx.fillStyle = gr;
      ctx.fillRect(L.x - reach, L.y - reach, reach * 2, reach * 2);
    };
    ctx.globalCompositeOperation = L.dark ? 'lighter' : 'screen';
    pool((L.dark ? 0.6 : 0.45) * s, L.r);
    ctx.globalCompositeOperation = 'overlay';
    pool((L.dark ? 0.55 : 0.3) * s, L.r * 0.75);
    ctx.globalCompositeOperation = L.dark ? 'lighter' : 'screen';
    if (L.core) pool(0.5 * s, L.r * 0.18);
  }
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
    const k = Math.min(1, Math.sqrt(6e6 / (W * H)));
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
      const a = (lift ? 0.05 : 0.12) * (0.5 + r() * 0.5);
      if (!sees(view, x * D - rad, y * D - rad, x * D + rad, y * D + rad)) continue;
      const gr = ctx.createRadialGradient(x * D, y * D, 0, x * D, y * D, rad);
      const col = lift ? (plan.ground === 'night' ? '60, 72, 92' : '226, 224, 214') : plan.ground === 'night' ? '4, 4, 10' : '18, 24, 52';
      gr.addColorStop(0, `rgba(${col}, ${a})`);
      gr.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(x * D - rad, y * D - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }
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
  // The water swallows the light: gone by the end of the twilight.
  const fade = o.createLinearGradient(0, 0, 0, litPx / rs);
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.55, 'rgba(0, 0, 0, 0.85)');
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
  for (const s of plan.zStops) if (s.z >= 0.62) return Math.max(plan.h * 0.35, s.y * 1.15);
  return plan.h;
}

function occluderOf(plan: Plan, c: Caches): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const lit = plan.h;
  const key = `${plan.w}|${lit}`;
  if (c.occluder?.key === key) return c.occluder.canvas;
  // Soft shadows want no detail: a mask a few hundred pixels across,
  // stretched over the picture (the same canvas every call, which keeps the
  // rays' own cache warm).
  const k = 900 / Math.max(plan.w, lit);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(plan.w * k));
  canvas.height = Math.max(1, Math.round(lit * k));
  const o = canvas.getContext('2d');
  if (!o) return null;
  o.scale(k, k);
  o.fillStyle = '#000';
  for (const j of plan.jellies) {
    o.globalAlpha = 0.7;
    o.beginPath();
    o.ellipse(j.x, j.y, j.r, j.r * 0.42 * j.aspect, 0, 0, Math.PI * 2);
    o.fill();
    o.globalAlpha = 0.18;
    o.fillRect(j.x - j.r * 0.6, j.y, j.r * 1.2, j.len * 0.8);
  }
  for (const b of [...plan.ledges.map((l) => l.box), ...plan.rocks.map((r) => r.box)]) {
    o.globalAlpha = 0.85;
    o.beginPath();
    o.ellipse((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 16, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2.4, 0, 0, Math.PI * 2);
    o.fill();
  }
  if (plan.kelp) {
    for (const edge of [-1, 1]) {
      o.globalAlpha = 0.25;
      o.fillRect(edge < 0 ? 0 : plan.w * 0.86, 0, plan.w * 0.14, plan.kelp.bottom);
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

function paintCast(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, ambient: number, layer: 0 | 1 | 2, inSight: InSight) {
  for (const a of plan.cast) {
    if (a.layer !== layer) continue;
    if (!inSight(a.box.x0, a.box.y0, a.box.x1, a.box.y1, a.len * 0.6 + 10)) continue;
    const sp = speciesOf(c, a.zone, a.slot);
    if (!sp) continue;
    const water = waterAtY(plan, a.y);
    const dark = water.dark;
    const parts = a.members ? a.members.map((m) => ({ x: a.x + m.dx, y: a.y + m.dy, len: m.len, phase: m.phase })) : [{ x: a.x, y: a.y, len: a.len, phase: a.phase }];
    ctx.save();
    // Far ones are inked at under half the resolution and drawn back up:
    // out of focus for the price of a smaller sprite (a blur filter on each
    // would cost seconds on a big picture).
    const soft = layer === 0 ? 0.42 : 1;
    if (soft !== 1) ctx.scale(1 / soft, 1 / soft);
    for (const p of parts) {
      const sprite = c.sprites.get(sp, p.len, dark, D * soft, a.rare);
      if (!sprite) continue;
      const v: Visitor = { key: a.id, species: sp, layer: a.layer, x: p.x, y: p.y, len: p.len, dir: a.dir, age: 0.5, alpha: a.alpha, phase: p.phase };
      drawVisitor(ctx, sprite, v, D * soft, ambient, a.alpha, a.floor ? 1 : 6);
    }
    ctx.restore();
    if (layer === 0) {
      // Haze: the water between, laid back over the far ones.
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = tone(plan, zAt(plan, a.y));
      ctx.beginPath();
      ctx.ellipse(a.x * D, a.y * D, ((a.box.x1 - a.box.x0) / 2) * D * 1.05, ((a.box.y1 - a.box.y0) / 2) * D * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
  ctx.globalAlpha = j.hero ? 1 : 0.92;
  ctx.drawImage(made.canvas, j.x * D - made.ox, j.y * D - made.oy);
  ctx.restore();
  // In the sunlit water the light off the surface plays over the bell.
  const strength = 0.55 * Math.max(0, 1 - zAt(plan, j.y) / 0.3);
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
  const body = jellyForBlock(plan.key, j.block);
  let shape = c.shapes.get(j.block);
  if (!shape) {
    shape = buildJelly(hash32(plan.key, 'bloom', j.block), body);
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
  const water = waterAtY(plan, j.y);
  const tint = mixHex(plan.color, HUES[body.hue] ?? plan.color, body.hueMix);
  const dark = water.dark;
  const ink = jellyInk(tint, dark ? NIGHT : PAPER, dark);
  drawJelly(o, shape, cw, ch, {
    progress: Math.min(1, Math.max(0.42, L / maxL)),
    ink: { ...ink, snow: undefined },
    padTop,
    widthFill: R / (cw * 0.2),
    baseOffset: ch - floor,
    px: D,
    pulse: j.hero ? 0.25 : 0.1,
    time: 4000 + (hash32(plan.key, 'jelly-time', j.block) % 20000),
    bubbles: j.hero,
  });
  return { canvas, ox: cw / 2, oy: padTop + bh / 2 };
}

/** How lit a point (units) is by the jellies, 0 to 1, for the snow. */
function jellyLight(plan: Plan, x: number, y: number): number {
  let best = 0;
  for (const j of plan.jellies) {
    const d = Math.hypot(x - j.x, (y - j.y - j.r) / 1.3) / (j.r * 3.2);
    best = Math.max(best, Math.exp(-d * d) * (j.hero ? 1 : 0.6));
  }
  return best;
}

function lightsOf(plan: Plan, c: Caches, D: number): Light[] {
  const lights: Light[] = [];
  const darkAt = (y: number) => {
    const t = tone(plan, zAt(plan, y));
    const n = parseInt(t.slice(1, 7), 16);
    return plan.ground === 'night' || (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255 < 0.45;
  };
  for (const j of plan.jellies) {
    const z = zAt(plan, j.y);
    const body = jellyForBlock(plan.key, j.block);
    const tint = mixHex(plan.color, HUES[body.hue] ?? plan.color, body.hueMix);
    const deep = Math.max(0, Math.min(1, (z - 0.35) / 0.4));
    // In pale water a faint lift of light round the bell, so the jellies stay the brightest thing.
    const s = (j.hero ? 0.42 : 0.26) * (plan.ground === 'night' ? 0.5 + 0.5 * deep : Math.max(0.45, deep));
    if (s > 0.02) lights.push({ x: j.x * D, y: (j.y + j.r * 0.4) * D, r: j.r * (j.hero ? 5 : 3.6) * D, color: mixHex(tint, '#FFFFFF', 0.35), strength: s, dark: darkAt(j.y) });
  }
  // Each light reads the canvas under it, which costs: the jellies, the
  // rare things, and the few nearest lit animals, no more.
  let lit = 0;
  for (const a of [...plan.cast].sort((p, q) => q.layer - p.layer || q.len - p.len)) {
    if (lit >= 4) break;
    const sp = speciesOf(c, a.zone, a.slot);
    if (!sp || !sp.genome.lit || a.layer === 0) continue;
    lit++;
    const z = zAt(plan, a.y);
    if (z < 0.45 && plan.ground === 'paper') continue;
    const glow = ['#9FE8FF', '#B8FFD9', '#FFD9A0', '#E3C2FF'][Math.max(0, Math.min(3, Math.round(sp.genome.glow)))];
    lights.push({ x: a.x * D, y: a.y * D, r: a.len * 1.1 * D, color: glow, strength: 0.25, dark: darkAt(a.y) });
  }
  for (const e of plan.events) {
    if (e.kind === 'lure') lights.push({ x: e.x * D, y: e.y * D, r: 90 * D, color: '#BFF3E6', strength: 0.4, dark: darkAt(e.y), core: true });
    if (e.kind === 'storm') lights.push({ x: e.x * D, y: e.y * D, r: 260 * D, color: '#9FD8C8', strength: 0.06, dark: darkAt(e.y) });
  }
  return lights;
}

/* ---- The bubbles ---- */

function paintBubbles(ctx: CanvasRenderingContext2D, plan: Plan, D: number, inSight: InSight) {
  ctx.save();
  ctx.lineWidth = Math.max(0.6, 0.7 * D);
  for (const b of plan.bubbles) {
    if (!inSight(b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r, 2)) continue;
    const water = waterAtY(plan, b.y);
    const line = water.dark ? 'rgba(232, 224, 207, ' : 'rgba(42, 35, 32, ';
    const a = water.dark ? 0.55 : 0.4;
    ctx.beginPath();
    ctx.arc(b.x * D, b.y * D, b.r * D, 0, Math.PI * 2);
    ctx.fillStyle = water.dark ? 'rgba(232, 224, 207, 0.08)' : 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.strokeStyle = `${line}${a})`;
    ctx.stroke();
    // The glint, up and to the left where the light comes from.
    if (b.r > 2) {
      ctx.beginPath();
      ctx.arc((b.x - b.r * 0.35) * D, (b.y - b.r * 0.35) * D, b.r * 0.22 * D, 0, Math.PI * 2);
      ctx.fillStyle = water.dark ? 'rgba(255, 252, 240, 0.7)' : 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ---- The places ---- */

function paintKelp(ctx: CanvasRenderingContext2D, plan: Plan, kelp: Kelp, c: Caches, D: number, ambient: number, inSight: InSight) {
  if (!plan.kelp) return;
  // The forest is drawn as the live sea draws it, a frame at a time, the
  // frames stacked down the page: three frames from the canopy to the rock.
  const hf = plan.kelp.bottom / 2.45;
  const s = Math.max(0.45, Math.min(1, hf / 520));
  for (let k = 0; k < 3; k++) {
    if (!inSight(0, k * hf - (k ? 0 : hf), plan.w, k === 2 ? plan.h : (k + 1) * hf)) continue;
    const water = waterAtY(plan, (k + 0.5) * hf);
    const focus = (k * 60) / 0.19;
    ctx.save();
    ctx.beginPath();
    const top = k * hf * D;
    const bottom = k === 2 ? plan.h * D : (k + 1) * hf * D;
    ctx.rect(0, top - (k ? 0 : hf * D), plan.w * D, bottom - top + (k ? 0 : hf * D));
    ctx.clip();
    ctx.translate(0, top);
    ctx.scale(s, s);
    drawKelp(ctx, (plan.w * D) / s, (hf * D) / s, kelp, focus, water, ambient, c.biome.env.current, D, undefined, true);
    ctx.restore();
  }
}

/* ---- Rock ---- */

interface RockSpec {
  edge: -1 | 1;
  /** Share of the width it reaches across, its top and thickness in units. */
  reach: number;
  y: number;
  thick: number;
  zone: number;
  seed: number;
}

/** What grows on rock at each depth, with the light: reef, then the drained twilight, then the pale deep. */
const GROWTH_KITS = [
  ['fan', 'tube', 'anemone', 'fan', 'tube'],
  ['fan', 'whip', 'tube', 'whip'],
  ['glass', 'pen', 'whip', 'glass'],
] as const;
type GrowthShape = (typeof GROWTH_KITS)[number][number];

/**
 * A short outcrop of rock from a wall, painted rather than placed: an
 * irregular boulder-topped shelf whose underside slopes back into the wall
 * and fades into the water like a wash run dry, a pen line along its crest,
 * engraved hatching under it, and what grows at its depth along the top.
 */
function paintRock(ctx: CanvasRenderingContext2D, plan: Plan, k: RockSpec, D: number) {
  const r = mulberry32(k.seed);
  const s = k.edge < 0 ? 1 : -1;
  const x0 = k.edge < 0 ? -12 : plan.w + 12;
  const span = k.reach * plan.w + 12;
  const X = (f: number) => (x0 + s * span * f) * D;
  const T = k.thick;
  // The crest: boulders along it, rising toward the wall, rolling over at the lip.
  const ph = [r() * 6.3, r() * 6.3, r() * 6.3];
  const lump = [0.5 + r() * 0.8, 0.3 + r() * 0.5, 0.15 + r() * 0.2];
  const crestAt = (f: number) =>
    k.y -
    T * (0.18 * (1 - f) * (1 - f) + lump[0] * 0.07 * Math.sin(f * 7 + ph[0]) + lump[1] * 0.06 * Math.sin(f * 15 + ph[1]) + lump[2] * 0.05 * Math.sin(f * 31 + ph[2]));
  const lipF = 0.97;
  const top: number[] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const f = (i / N) * lipF;
    top.push(X(f), crestAt(f) * D);
  }
  // Round the lip, then back along the underside to the wall, sloping down:
  // thin at the lip, deep at the wall, with a bite or two out of it.
  const under: number[] = [];
  const bite = 0.35 + r() * 0.35;
  for (let i = 0; i <= N; i++) {
    const f = lipF * (1 - i / N);
    const depth = T * (0.22 + 0.95 * Math.pow(1 - f / lipF, 1.25)) - T * 0.18 * Math.exp(-(((f - bite) / 0.08) ** 2));
    under.push(X(f), (k.y + depth + T * 0.05 * Math.sin(f * 11 + ph[1])) * D);
  }
  const outline = [...top, X(1), (k.y + T * 0.08) * D, ...under];
  const region = smoothPath(outline, true, 4);
  const box = { x: Math.min(X(0), X(1)), y: (k.y - T * 0.35) * D, w: span * D, h: T * 1.5 * D };

  const z = zAt(plan, k.y);
  const water = tone(plan, z);
  const dark = plan.ground === 'night' || lumOf(water) < 0.47;
  const rockCol = dark ? mixHex(water, '#05060A', 0.5) : mixHex(mixHex(water, '#6B6459', 0.5), '#2A2320', 0.25);
  const lit = dark ? mixHex(water, '#C8C0B0', 0.22) : mixHex(water, '#FBF8EF', 0.35);
  const ink = dark ? '#E8E0CF' : '#2A2320';

  ctx.save();
  // The body: a wash, fading out down toward the wall, where the rock runs
  // on into the dark of the water.
  const g = ctx.createLinearGradient(0, (k.y - T * 0.3) * D, 0, (k.y + T * 1.2) * D);
  g.addColorStop(0, rockCol);
  g.addColorStop(0.45, rockCol);
  g.addColorStop(1, `${rockCol}00`);
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.95;
  ctx.fill(region);
  ctx.clip(region);
  // Light on the top surface, from above.
  const lg = ctx.createLinearGradient(0, (k.y - T * 0.3) * D, 0, (k.y + T * 0.25) * D);
  lg.addColorStop(0, `${lit}`);
  lg.addColorStop(1, `${lit}00`);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = lg;
  ctx.fillRect(box.x, box.y, box.w, T * 0.7 * D);
  // Engraved hatching underneath, thickening into the shadow.
  ctx.globalAlpha = 1;
  const shade = (_x: number, y: number) => {
    const t = (y / D - k.y) / T;
    return Math.max(0, Math.min(1, 0.15 + t * 1.1 - Math.max(0, t - 0.75) * 2.2));
  };
  hatch(ctx, region, box, { spacing: 3.4 * D, angle: s > 0 ? 0.95 : Math.PI - 0.95, shade, from: 0.35, cross: 0.72, color: ink, width: 0.7 * D, alpha: dark ? 0.35 : 0.5, bow: 0.4, seed: k.seed });
  stipple(ctx, region, box, { spacing: 4.5 * D, radius: 0.55 * D, color: ink, alpha: 0.35, seed: k.seed + 1, from: 0.25, shade: (_x, y) => (Math.abs(y / D - k.y) < T * 0.25 ? 0.6 : 0) });
  ctx.restore();

  // The crest in one pen line, and the lip's underside, fainter.
  ctx.save();
  inkLine(ctx, top, false, { width: 1.25 * D, color: ink, alpha: dark ? 0.7 : 0.85, swell: 0.6, lost: 0.3, taper: [0.02, 0.15], seed: k.seed + 2, raw: false });
  inkLine(ctx, under.slice(0, Math.floor(under.length * 0.45)), false, { width: 0.9 * D, color: ink, alpha: 0.4, swell: 0.5, lost: 0.5, taper: [0.1, 0.6], seed: k.seed + 3 });
  ctx.restore();

  // What grows on it.
  const tier = Math.min(2, k.zone);
  const kit = GROWTH_KITS[tier];
  const n = 2 + Math.floor(r() * 3);
  const hues = [HUES[Math.floor(r() * HUES.length)], HUES[Math.floor(r() * HUES.length)]];
  for (let i = 0; i < n; i++) {
    const f = 0.1 + (0.75 * (i + 0.2 + r() * 0.6)) / n;
    const kind = kit[Math.floor(r() * kit.length)];
    const size = (16 + r() * 26) * (1.1 - 0.4 * f);
    const hue = drained(hues[i % 2], z);
    paintGrowth(ctx, kind, X(f), (crestAt(f) + 1.5) * D, size * D, hue, dark, tier, mulberry32(k.seed + 10 + i), D);
  }
  lightOnTop(ctx, plan, k.edge, k.reach, k.y, D);
}

function paintGrowth(ctx: CanvasRenderingContext2D, kind: GrowthShape, x: number, y: number, size: number, hue: string, dark: boolean, tier: number, r: () => number, D: number) {
  const pale = tier === 2 ? (dark ? '#E9E2D2' : '#F3EEE2') : hue;
  const ink = dark ? mixHex(pale, '#FFFFFF', 0.45) : mixHex(pale, '#1A1714', 0.6);
  const wash = dark ? mixHex(pale, '#1A1815', 0.35) : mixHex(pale, '#FBF8EF', 0.15);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.fillStyle = wash;
  const lean = (r() - 0.5) * 0.4;
  if (kind === 'fan') {
    // A sea fan: a flat net of branches from a short stem.
    const branch = (bx: number, by: number, a: number, len: number, depth: number) => {
      const ex = bx + Math.sin(a) * len;
      const ey = by - Math.cos(a) * len;
      ctx.lineWidth = Math.max(0.5 * D, (0.4 + depth * 0.35) * D);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.sin(a) * len * 0.5 + (r() - 0.5) * len * 0.2, by - Math.cos(a) * len * 0.5, ex, ey);
      ctx.stroke();
      if (depth > 0) for (const d of [-0.42, 0.42]) branch(ex, ey, a + d + (r() - 0.5) * 0.2, len * 0.72, depth - 1);
    };
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(x + Math.sin(lean) * size * 0.55, y - size * 0.6, size * 0.55, size * 0.5, lean, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    branch(x, y, lean, size * 0.3, 3);
  } else if (kind === 'tube') {
    const m = 2 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const tw = size * (0.12 + r() * 0.06);
      const th = size * (0.45 + r() * 0.55);
      const tx = x + (i - (m - 1) / 2) * tw * 1.5;
      const tl = lean * 0.5 + (r() - 0.5) * 0.25;
      ctx.save();
      ctx.translate(tx, y);
      ctx.rotate(tl);
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(-tw / 2, 0);
      ctx.lineTo(-tw / 2 * 1.1, -th);
      ctx.lineTo(tw / 2 * 1.1, -th);
      ctx.lineTo(tw / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 0.7 * D;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -th, tw * 0.55, tw * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === 'anemone') {
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, y);
    ctx.lineTo(x - size * 0.1, y - size * 0.35);
    ctx.lineTo(x + size * 0.1, y - size * 0.35);
    ctx.lineTo(x + size * 0.12, y);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.7 * D;
    ctx.stroke();
    ctx.lineWidth = 0.6 * D;
    for (let i = 0; i < 13; i++) {
      const a = -1.25 + (2.5 * i) / 12 + lean;
      const l = size * (0.3 + r() * 0.2);
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(a) * size * 0.08, y - size * 0.35);
      ctx.quadraticCurveTo(x + Math.sin(a) * l * 0.7, y - size * 0.35 - l * 0.8, x + Math.sin(a * 1.2) * l, y - size * 0.35 - Math.cos(a) * l * 0.9);
      ctx.stroke();
    }
  } else if (kind === 'whip') {
    ctx.globalAlpha = 0.8;
    const m = 2 + Math.floor(r() * 2);
    for (let i = 0; i < m; i++) {
      const l = size * (0.9 + r() * 0.8);
      const a = lean + (i - (m - 1) / 2) * 0.25;
      const bend = (r() - 0.5) * l * 0.5;
      ctx.lineWidth = 0.9 * D;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(a) * l * 0.5 + bend, y - l * 0.55, x + Math.sin(a) * l + bend * 0.4, y - Math.cos(a) * l);
      ctx.stroke();
    }
  } else if (kind === 'glass') {
    // A glass sponge: a pale vase, its lattice just seen.
    const vw = size * 0.32;
    const vh = size * 0.9;
    const vase = new Path2D();
    vase.moveTo(x - vw * 0.25, y);
    vase.bezierCurveTo(x - vw * 0.9, y - vh * 0.4, x - vw * 0.7, y - vh * 0.85, x - vw * 0.5, y - vh);
    vase.lineTo(x + vw * 0.5, y - vh);
    vase.bezierCurveTo(x + vw * 0.7, y - vh * 0.85, x + vw * 0.9, y - vh * 0.4, x + vw * 0.25, y);
    vase.closePath();
    ctx.globalAlpha = 0.45;
    ctx.fill(vase);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 0.7 * D;
    ctx.stroke(vase);
    ctx.save();
    ctx.clip(vase);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.45 * D;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * vw * 0.25 - vh, y);
      ctx.lineTo(x + i * vw * 0.25 + vh, y - vh * 2);
      ctx.moveTo(x + i * vw * 0.25 + vh, y);
      ctx.lineTo(x + i * vw * 0.25 - vh, y - vh * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // A sea pen: a stalk with a feather of leaves.
    const l = size * 1.1;
    const ex = x + Math.sin(lean) * l;
    const ey = y - Math.cos(lean) * l;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 0.9 * D;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.lineWidth = 0.55 * D;
    for (let i = 0; i < 12; i++) {
      const t = 0.35 + (0.62 * i) / 11;
      const px0 = x + (ex - x) * t;
      const py0 = y + (ey - y) * t;
      const lw = size * 0.22 * Math.sin(Math.PI * (t - 0.3) / 0.75);
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(px0, py0);
        ctx.quadraticCurveTo(px0 + sd * lw * 0.6, py0 - lw * 0.1, px0 + sd * lw, py0 - lw * 0.45);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/* ---- Against the light ---- */

/** A few fish overhead, dark against the window of sky, as they are from below. */
function paintSilhouettes(ctx: CanvasRenderingContext2D, plan: Plan, D: number) {
  const r = mulberry32(hash32(plan.seed, 'overhead'));
  const win = plan.window;
  const n = 3 + Math.floor(r() * 5);
  const dir = plan.current;
  const cx = win.x + (r() - 0.5) * win.r * 0.6;
  const cy = Math.max(plan.h * 0.02, win.y + win.r * 0.18);
  const col = plan.ground === 'night' ? '8, 10, 14' : '34, 44, 52';
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * win.r * 0.9;
    const y = cy + (r() - 0.5) * win.r * 0.22;
    const len = (9 + r() * 9) * (i === 0 ? 1.4 : 1);
    ctx.save();
    ctx.translate(x * D, y * D);
    ctx.scale(dir * D, D);
    ctx.globalAlpha = 0.45 + r() * 0.3;
    ctx.fillStyle = `rgb(${col})`;
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
function eyeInTheDark(ctx: CanvasRenderingContext2D, plan: Plan, e: PlacedEvent, D: number) {
  const rr = 0.2 * Math.min(e.rw, e.rh);
  const left = e.x < plan.w / 2;
  const ex = (left ? 0 : plan.w) * D;
  const ey = e.y * D;
  const reach = rr * 2.6 * D;
  const deep = mixHex(tone(plan, zAt(plan, e.y)), '#05060A', 0.45);
  const n = parseInt(deep.slice(1, 7), 16);
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, reach);
  g.addColorStop(0, `rgba(${rgb}, 0.92)`);
  g.addColorStop(0.32, `rgba(${rgb}, 0.6)`);
  g.addColorStop(0.7, `rgba(${rgb}, 0.18)`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(ex - reach, ey - reach, reach * 2, reach * 2);
  ctx.restore();
}

function paintFloor(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, ambient: number) {
  if (!plan.floor) return;
  void ambient;
  const H = plan.h * D;
  const W = plan.w * D;
  const yF = plan.floor.y;
  const water = tone(plan, zAt(plan, yF));
  const night = plan.ground === 'night';
  const r = mulberry32(hash32(plan.seed, 'silt'));
  const ph = r() * 6.3;
  // The silt line: long low swells, and smaller ones on them.
  const lineAt = (x: number) => yF + 7 * Math.sin(x / 140 + ph) + 3.5 * Math.sin(x / 37 + ph * 2) + 1.2 * Math.sin(x / 9 + ph);
  const crest: number[] = [];
  for (let x = -20; x <= plan.w + 20; x += 8) crest.push(x * D, lineAt(x) * D);
  const body = new Path2D();
  body.moveTo(-20 * D, H + 2);
  for (let i = 0; i < crest.length; i += 2) body.lineTo(crest[i], crest[i + 1]);
  body.lineTo((plan.w + 20) * D, H + 2);
  body.closePath();
  // Silt catching what light there is at its crest, going down into the dark.
  const top = night ? mixHex(water, '#8C8576', 0.28) : mixHex(water, '#C9C3B4', 0.32);
  const low = mixHex(water, '#05060A', night ? 0.35 : 0.22);
  const g = ctx.createLinearGradient(0, (yF - 10) * D, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(0.25, mixHex(top, low, 0.45));
  g.addColorStop(1, low);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.clip(body);
  const ink = night ? 'rgba(232, 224, 207, ' : 'rgba(232, 228, 216, ';
  // Ripples in the silt, the current's marks, in faint pen.
  ctx.lineWidth = 0.8 * D;
  for (let i = 0; i < Math.round(plan.w / 40); i++) {
    const x = r() * W;
    const y = (yF + 14 + Math.pow(r(), 1.4) * (plan.h - yF - 20)) * D;
    const len = (20 + r() * 50) * D;
    ctx.strokeStyle = `${ink}${(0.1 + r() * 0.2).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.quadraticCurveTo(x, y - (2 + r() * 3) * D, x + len / 2, y);
    ctx.stroke();
  }
  // Sediment, and stones half sunk in it.
  for (let i = 0; i < Math.round(plan.w * 1.1); i++) {
    const x = r() * W;
    const y = (yF + Math.pow(r(), 0.8) * (plan.h - yF)) * D;
    ctx.fillStyle = `${ink}${(0.05 + r() * 0.14).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y + 6 * D, (0.5 + r() * 1.3) * D, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < Math.round(plan.w / 55); i++) {
    const x = r() * W;
    const y = (yF + 8 + r() * 0.6 * (plan.h - yF)) * D;
    const rx = (4 + r() * 10) * D;
    ctx.fillStyle = mixHex(low, '#000000', 0.25);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * (0.4 + r() * 0.25), (r() - 0.5) * 0.3, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `${ink}0.3)`;
    ctx.lineWidth = 0.7 * D;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * (0.4 + r() * 0.25), (r() - 0.5) * 0.3, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.restore();
  // The crest in one pen line, broken where the light is.
  inkLine(ctx, crest, false, { width: 1 * D, color: night ? '#E8E0CF' : '#F1ECDF', alpha: 0.32, lost: 0.85, swell: 0.4, taper: [0.02, 0.02], seed: plan.seed, raw: true });
  // Vents, where the sitting rolled them: squat chimneys breathing a little.
  if (c.biome.env.vents) {
    for (let v = 0; v < 2; v++) {
      const vx = plan.w * (0.2 + v * 0.55 + (r() - 0.5) * 0.08);
      const vy = lineAt(vx);
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
      ctx.strokeStyle = `${ink}0.45)`;
      ctx.lineWidth = 0.8 * D;
      ctx.stroke(chimney);
      for (let k = 0; k < 9; k++) {
        const t = k / 9;
        ctx.fillStyle = `${ink}${(0.25 * (1 - t)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc((vx + Math.sin(t * 6 + k) * 5) * D, (vy - vh - t * 70) * D, (1 + t * 2.5) * D, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/* ---- The rare things ---- */

function paintEvent(ctx: CanvasRenderingContext2D, plan: Plan, e: PlacedEvent, D: number, ambient: number, inSight: InSight) {
  if (e.kind === 'whalefall' ? !(e.box && inSight(e.box.x0, e.box.y0, e.box.x1, e.box.y1, 120)) : !inSight(e.rx, e.ry, e.rx + e.rw, e.ry + e.rh, 40)) return;
  const water = waterAtY(plan, e.y);
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
      eyeInTheDark(ctx, plan, e, D);
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

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
import { drawEye, drawFloor, drawLeviathan, drawStorm, drawVisitor, drawWhale } from '../draw';
import { rollKelp, type Kelp } from '../kelp';
import { drawKelp } from '../kelp-draw';
import { drawGodRays, drawSnellWindow, drawSnowDeep, godRayLight, sunFor } from '../light';
import { jellyForBlock } from '../lineage';
import { outcropAtSlot, type Growth, type GrowthKind, type Outcrop } from '../outcrop';
import { drawOutcrops, OutcropCache } from '../outcrop-sprite';
import { HUES, waterAt, type Water } from '../palette';
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
  rocks: OutcropCache;
  wash: Wash;
  jellies: Map<string, { canvas: HTMLCanvasElement; ox: number; oy: number }>;
  shapes: Map<number, JellyShape>;
  occluder: { key: string; canvas: HTMLCanvasElement } | null;
  rayLight: { key: string; at: (x: number, y: number) => number } | null;
  wash2: { key: string; canvas: HTMLCanvasElement } | null;
  dither: HTMLCanvasElement | null;
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
        rocks: new OutcropCache(),
        wash: new Wash(),
        jellies: new Map(),
        shapes: new Map(),
        occluder: null,
        rayLight: null,
        wash2: null,
        dither: null,
      } satisfies Caches,
    });
  }
  return holder.__cache as Caches;
}

const PAPER = '#FBF8EF';
const NIGHT = '#1A1815';
/** On the paper, the deep is laid in indigo under the black, the way a watercolourist builds a dark. */
const INDIGO = '#1B2033';

function zAt(plan: Plan, y: number): number {
  const s = plan.zStops;
  const i = Math.max(0, Math.min(s.length - 2, Math.floor((y / plan.h) * (s.length - 1))));
  const a = s[i];
  const b = s[i + 1];
  return a.z + ((b.z - a.z) * Math.max(0, Math.min(1, (y - a.y) / Math.max(1e-6, b.y - a.y))));
}

function waterAtY(plan: Plan, y: number): Water {
  return waterAt(zAt(plan, y), plan.ground, plan.color);
}

/** The water's own colour at a depth, as it is laid in the picture. */
function tone(plan: Plan, z: number): string {
  const wt = waterAt(z, plan.ground, plan.color);
  let c = mixHex(wt.top, wt.bottom, 0.45);
  if (plan.ground === 'paper') c = mixHex(c, INDIGO, 0.62 * Math.max(0, Math.min(1, (z - 0.32) / 0.45)));
  else c = mixHex(c, '#141A26', 0.3 * Math.max(0, Math.min(1, (z - 0.2) / 0.5)));
  return c;
}

// TEMP timing
const __T: Record<string, number> = ((globalThis as unknown as { __picT?: Record<string, number> }).__picT ??= {});
let __last = 0;
function __t(name: string) {
  const now = performance.now();
  if (__last) __T[name] = (__T[name] ?? 0) + now - __last;
  __last = now;
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
  __last = performance.now();
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

  // ---- The water: the depth's colour down the page, then the paint.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const s of plan.zStops) g.addColorStop(s.y / plan.h, tone(plan, s.z));
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  paintWash(ctx, plan, c, D, W, H, view);
  __t('water');

  // ---- The light from above, carved by everything that stands in it. The
  // shafts fade out by the end of the twilight, however far below that the
  // picture goes. They are soft, so they are worked out at no more than a
  // few thousand pixels and drawn back up.
  const lit = litDepth(plan);
  const RH = lit * D;
  const rs = Math.max(1, Math.max(W, RH) / 2400);
  const occluder = occluderOf(plan, c, lit);
  const rays = {
    source: { x: (plan.window.x * D) / rs, y: (plan.window.y * D) / rs },
    occluder,
    strength: 0.55 + 0.6 * Math.max(0, 1 - plan.zMax / 0.6),
    sun,
    px: D / rs,
    seed: plan.seed,
    dark: night,
  };
  if (sees(view, 0, 0, W, RH) && (globalThis as unknown as { __skip?: string }).__skip !== 'rays') {
    ctx.save();
    ctx.scale(rs, rs);
    drawGodRays(ctx, W / rs, RH / rs, rays);
    ctx.restore();
  }
  __t('rays');

  // ---- The sky, looking up: after the rays, so their fan does not pile up
  // in it, and before everything in the water, which passes in front of it.
  // Soft too, so on a poster it is drawn at a few thousand pixels and up.
  const win = plan.window;
  if (inSight(win.x - win.r, win.y - win.r, win.x + win.r, win.y + win.r, win.r * 1.7)) {
    const k = Math.max(1, W / 3200);
    ctx.save();
    ctx.scale(k, k);
    drawSnellWindow(ctx, W / k, H / k, { cx: (win.x * D) / k, cy: (win.y * D) / k, radius: (win.r * D) / k, sun, moon: plan.moon, dark: night, px: D / k, seed: plan.seed });
    ctx.restore();
  }
  __t('snell');

  // ---- Far: the big shapes behind everything, then the far animals, hazy.
  for (const e of plan.events) if (e.far) paintEvent(ctx, plan, e, D, ambient, inSight);
  paintCast(ctx, plan, c, D, ambient, 0, inSight);
  __t('far');

  // ---- The places passed: kelp, rocks, the ledges of the breaks, the floor.
  if (c.kelp && plan.kelp) paintKelp(ctx, plan, c.kelp, c, D, ambient, inSight);
  __t('kelp');
  // A rock is inked once to a sprite no wider than 4096 px; on a poster it
  // is inked smaller and drawn back up, so a long ledge is never cut short.
  const rk = Math.max(1, W / 3600);
  const rock = (o: Outcrop, top: number, y: number) => {
    ctx.save();
    ctx.scale(rk, rk);
    drawOutcrops(ctx, W / rk, H / rk, [{ outcrop: o, top }], c.rocks, waterAtY(plan, y), D / rk, undefined);
    ctx.restore();
    lightOnTop(ctx, plan, o.edge, o.reach, y, D);
  };
  for (const r of plan.rocks) {
    if (!inSight(r.box.x0, r.box.y0, r.box.x1, r.y + r.thick, 90)) continue;
    const o = outcropAtSlot(plan.key, r.slot, !!plan.kelp);
    if (o) rock({ ...o, thick: r.thick / plan.h }, r.y / plan.h, r.y);
  }
  for (const l of plan.ledges) {
    if (!inSight(l.box.x0, l.box.y0, l.box.x1, l.y + l.thick, 90)) continue;
    rock(ledgeOutcrop(l, plan.h), l.y / plan.h, l.y);
  }
  __t('rocks');
  if (plan.floor && inSight(0, plan.floor.y - 80, plan.w, plan.h)) paintFloor(ctx, plan, c, D, ambient);
  __t('places');

  // ---- Middle: the rare things in the water, the middle animals.
  for (const e of plan.events) if (!e.far && e.kind !== 'eye') paintEvent(ctx, plan, e, D, ambient, inSight);
  paintCast(ctx, plan, c, D, ambient, 1, inSight);
  __t('middle');

  // ---- The way down: bubbles rising off it, and the jellies, the hero last.
  paintBubbles(ctx, plan, D, inSight);
  for (const j of plan.jellies) if (inSight(j.box.x0, j.box.y0, j.box.x1, j.box.y1, j.r * 1.4)) paintJelly(ctx, plan, c, j, D);
  __t('jellies');

  // ---- Near.
  paintCast(ctx, plan, c, D, ambient, 2, inSight);
  for (const e of plan.events) if (e.kind === 'eye') paintEvent(ctx, plan, e, D, ambient, inSight);
  __t('near');

  // ---- Light: what glows lights what is near it.
  paintLights(ctx, plan, lightsOf(plan, c, D), view);
  __t('lights');

  // ---- Snow, near to far, caught in the light.
  const rayKey = `${W}|${H}|${D}`;
  if (!c.rayLight || c.rayLight.key !== rayKey) {
    const at = godRayLight(W / rs, RH / rs, rays);
    c.rayLight = { key: rayKey, at: (x, y) => at(x / rs, y / rs) };
  }
  const rayAt = c.rayLight.at;
  drawSnowDeep(ctx, W, H, {
    seed: plan.seed,
    density: 0.55 + 0.6 * plan.zMax,
    color: night || plan.zMax > 0.45 ? '#D9D2C2' : '#FFFFFF',
    px: D,
    dark: night || plan.zMax > 0.5,
    litBy: (x, y) => Math.max(rayAt(x, y), jellyLight(plan, x / D, y / D)),
  });
  __t('snow');

  // ---- A whisper of noise, so no gradient bands.
  paintDither(ctx, c, plan.seed, view);
  ctx.restore();
  __t('dither');
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
    pool((L.dark ? 0.75 : 0.4) * s, L.r * 0.75);
    ctx.globalCompositeOperation = L.dark ? 'lighter' : 'screen';
    pool(0.5 * s, L.r * 0.18);
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
  if (c.wash2) {
    // Only the slice in sight, a pixel wider each way so strips join.
    const k = c.wash2.canvas.width / W;
    const sx = Math.max(0, Math.floor(view.x0 * k) - 1);
    const sy = Math.max(0, Math.floor(view.y0 * k) - 1);
    const sw = Math.min(c.wash2.canvas.width, Math.ceil(view.x1 * k) + 1) - sx;
    const sh = Math.min(c.wash2.canvas.height, Math.ceil(view.y1 * k) + 1) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(c.wash2.canvas, sx, sy, sw, sh, sx / k, sy / k, sw / k, sh / k);
  }
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
      const col = lift ? (plan.ground === 'night' ? '60, 72, 92' : '70, 78, 104') : '4, 4, 10';
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

/** How far down the page the light from above reaches, in units. */
function litDepth(plan: Plan): number {
  for (const s of plan.zStops) if (s.z >= 0.62) return Math.max(plan.h * 0.35, s.y * 1.15);
  return plan.h;
}

function occluderOf(plan: Plan, c: Caches, lit: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${plan.w}|${lit}`;
  if (c.occluder?.key === key) return c.occluder.canvas;
  // Soft shadows want no detail: a mask a few hundred pixels across,
  // stretched over the lit part of the page the rays are drawn in.
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
      ctx.globalAlpha = 0.12;
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
    const s = (j.hero ? 0.75 : 0.4) * (plan.ground === 'night' ? 0.5 + 0.5 * deep : deep);
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
    if (e.kind === 'lure') lights.push({ x: e.x * D, y: e.y * D, r: 90 * D, color: '#BFF3E6', strength: 0.45, dark: darkAt(e.y) });
    if (e.kind === 'storm') lights.push({ x: e.x * D, y: e.y * D, r: 300 * D, color: '#8EF0D2', strength: 0.1, dark: darkAt(e.y) });
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

const KITS: GrowthKind[][] = [
  ['branch', 'brain', 'fan', 'anemone', 'tube', 'urchin'],
  ['plate', 'fan', 'whip', 'tube', 'urchin'],
  ['glass', 'seapen', 'whip'],
];
const REEF = HUES.map((_, i) => i).filter((i) => HUES[i] !== '#9AA3AB');

/** A break's ledge, in the rocks' own language: a rock from the edge with what grows at its depth. */
function ledgeOutcrop(l: Plan['ledges'][number], pageH: number): Outcrop {
  const r = mulberry32(l.seed);
  const zone = Math.min(2, l.zone);
  const kit = KITS[zone];
  const n = 2 + Math.floor(r() * 3);
  const hues = [REEF[Math.floor(r() * REEF.length)], REEF[Math.floor(r() * REEF.length)]];
  const growths: Growth[] = [];
  for (let i = 0; i < n; i++) {
    // Out toward the page edge, clear of where the jelly rested.
    const at = 0.04 + (0.42 * (i + 0.2 + r() * 0.6)) / n;
    growths.push({ kind: kit[Math.floor(r() * kit.length)], at, size: Math.max(22, Math.min(58, (28 + r() * 30) * (1.1 - 0.5 * at))), hue: hues[i % 2], seed: (r() * 4294967296) >>> 0 });
  }
  growths.sort((a, b) => b.at - a.at);
  return {
    id: `ledge-${l.seed}`,
    slot: -1,
    edge: l.edge,
    reach: l.reach,
    thick: l.thick / pageH,
    zone: l.zone,
    growths,
    bumps: Array.from({ length: 6 }, () => r() * 2 - 1),
    specks: Array.from({ length: 16 }, () => ({ x: r(), y: r(), r: 0.6 + r() * 0.8 })),
    worldY: 0,
  };
}

function paintFloor(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, ambient: number) {
  if (!plan.floor) return;
  const H = plan.h * D;
  const W = plan.w * D;
  const yF = plan.floor.y * D;
  const water = waterAtY(plan, plan.floor.y);
  const deep = tone(plan, zAt(plan, plan.floor.y));
  const r = mulberry32(hash32(plan.seed, 'silt'));
  // Far ridges first, hazy with the water between: the floor goes on.
  for (let k = 0; k < 1; k++) {
    const base = yF - (30 - k * 16) * D;
    const amp = (26 - k * 8) * D;
    const ph = r() * 10;
    ctx.save();
    // The far ridge hazed toward the water, the nearer one a shade darker.
    ctx.fillStyle = mixHex(deep, '#9A9AA8', 0.2);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= 64; i++) {
      const x = (i / 64) * W;
      const u = (i / 64) * Math.PI * 2;
      const y = base - amp * (0.5 + 0.35 * Math.sin(u * (1.3 + k) + ph) + 0.15 * Math.sin(u * 4.1 + ph * 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // The live floor, lifted to where the picture's is: its silt line falls at
  // 94% of the height it is given, so it is given a taller page, shifted up.
  const hh = (H - yF) / 0.06;
  ctx.save();
  ctx.translate(0, H - hh);
  drawFloor(ctx, W, hh, depthAt(5 * 3600), c.biome.env, water, 5 * 3600, ambient, D);
  ctx.restore();
  // Silt over it: paler where it catches what light there is, at its crest,
  // and going down into the dark at the foot.
  ctx.save();
  const silt = plan.ground === 'night' ? '96, 92, 86' : '104, 104, 120';
  const crest = new Path2D();
  crest.moveTo(0, H);
  for (let i = 0; i <= 48; i++) {
    const x = (i / 48) * W;
    crest.lineTo(x, yF + (3 + 4 * Math.sin(i * 0.9 + plan.seed % 7) + 3 * Math.sin(i * 0.31)) * D);
  }
  crest.lineTo(W, H);
  crest.closePath();
  const g = ctx.createLinearGradient(0, yF, 0, H);
  g.addColorStop(0, `rgba(${silt}, 0.55)`);
  g.addColorStop(0.18, `rgba(${silt}, 0.3)`);
  g.addColorStop(0.6, `rgba(${silt}, 0.1)`);
  g.addColorStop(1, 'rgba(6, 6, 10, 0.25)');
  ctx.fillStyle = g;
  ctx.fill(crest);
  // Ripples in the silt, the current's marks, in faint pen.
  ctx.strokeStyle = `rgba(${silt}, 0.5)`;
  ctx.lineWidth = 0.8 * D;
  for (let i = 0; i < Math.round(plan.w / 45); i++) {
    const x = r() * W;
    const y = yF + (14 + Math.pow(r(), 1.4) * (plan.h - plan.floor.y - 20)) * D;
    const len = (20 + r() * 50) * D;
    ctx.globalAlpha = 0.3 + r() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.quadraticCurveTo(x, y - (2 + r() * 3) * D, x + len / 2, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const pale = 'rgba(206, 198, 182, ';
  const n = Math.round(plan.w * 1.1);
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const y = yF + Math.pow(r(), 0.8) * (H - yF);
    ctx.fillStyle = `${pale}${(0.06 + r() * 0.16).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y + 8 * D, (0.5 + r() * 1.4) * D, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 0.9 * D;
  for (let i = 0; i < Math.round(plan.w / 60); i++) {
    const x = r() * W;
    const y = yF + (8 + r() * 0.6 * (plan.h - plan.floor.y)) * D;
    const rx = (4 + r() * 10) * D;
    ctx.fillStyle = 'rgba(40, 40, 50, 0.55)';
    ctx.strokeStyle = 'rgba(206, 198, 182, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * (0.4 + r() * 0.25), (r() - 0.5) * 0.3, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
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
      drawStorm(ctx, w, h, e.age, e.seed, D, ambient);
      break;
    case 'siphonophore':
      drawSiphonophore(ctx, w, h, e.age, e.seed, D, ambient, dark);
      break;
    case 'eye':
      drawEye(ctx, w, h, e.age, e.seed, D, dark);
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
      drawWhaleFall(ctx, w, h, 1, e.seed, D, ambient, dark, e.y * D);
      break;
  }
  ctx.restore();
}

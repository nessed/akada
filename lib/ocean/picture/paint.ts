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
import { drawGodRays, drawLightPass, drawSnellWindow, drawSnowDeep, dither, godRayLight, sunFor } from '../light';
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

export function paint(ctx: CanvasRenderingContext2D, plan: Plan, px: number): void {
  const D = px * plan.unit;
  const W = plan.w * D;
  const H = plan.h * D;
  if (!(W > 0 && H > 0)) return;
  const c = cachesOf(plan);
  const ambient = 30 + (plan.seed % 997) / 31;
  const sun = sunFor(plan.hour);
  const night = plan.ground === 'night';

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ---- The water: the depth's colour down the page, then the paint.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const s of plan.zStops) g.addColorStop(s.y / plan.h, tone(plan, s.z));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  paintWash(ctx, plan, c, D, W, H);

  // ---- The light from above, carved by everything that stands in it.
  const occluder = occluderOf(plan, c, D);
  const rays = {
    source: { x: plan.window.x * D, y: plan.window.y * D },
    occluder,
    strength: 0.55 + 0.6 * Math.max(0, 1 - plan.zMax / 0.6),
    sun,
    px: D,
    seed: plan.seed,
    dark: night,
  };
  drawGodRays(ctx, W, H, rays);

  // ---- Far: the big shapes behind everything, then the far animals, hazy.
  for (const e of plan.events) if (e.far) paintEvent(ctx, plan, e, D, ambient);
  paintCast(ctx, plan, c, D, ambient, 0);

  // ---- The places passed: kelp, rocks, the ledges of the breaks, the floor.
  if (c.kelp && plan.kelp) paintKelp(ctx, plan, c.kelp, c, D, ambient);
  for (const r of plan.rocks) {
    const o = outcropAtSlot(plan.key, r.slot, !!plan.kelp);
    if (!o) continue;
    drawOutcrops(ctx, W, H, [{ outcrop: { ...o, thick: r.thick / plan.h }, top: r.y / plan.h }], c.rocks, waterAtY(plan, r.y), D, undefined);
  }
  for (const l of plan.ledges) {
    drawOutcrops(ctx, W, H, [{ outcrop: ledgeOutcrop(l, plan.h), top: l.y / plan.h }], c.rocks, waterAtY(plan, l.y), D, undefined);
  }
  if (plan.floor) paintFloor(ctx, plan, c, D, ambient);

  // ---- Middle: the rare things in the water, the middle animals.
  for (const e of plan.events) if (!e.far && e.kind !== 'eye') paintEvent(ctx, plan, e, D, ambient);
  paintCast(ctx, plan, c, D, ambient, 1);

  // ---- The way down: bubbles rising off it, and the jellies, the hero last.
  paintBubbles(ctx, plan, D);
  for (const j of plan.jellies) paintJelly(ctx, plan, c, j, D);

  // ---- Near.
  paintCast(ctx, plan, c, D, ambient, 2);
  for (const e of plan.events) if (e.kind === 'eye') paintEvent(ctx, plan, e, D, ambient);

  // ---- Light: what glows lights what is near it.
  drawLightPass(ctx, W, H, lightsOf(plan, c, D), D);

  // ---- Snow, near to far, caught in the light.
  const rayKey = `${W}|${H}|${D}`;
  if (!c.rayLight || c.rayLight.key !== rayKey) c.rayLight = { key: rayKey, at: godRayLight(W, H, rays) };
  const rayAt = c.rayLight.at;
  drawSnowDeep(ctx, W, H, {
    seed: plan.seed,
    density: 0.55 + 0.6 * plan.zMax,
    color: night || plan.zMax > 0.45 ? '#D9D2C2' : '#FFFFFF',
    px: D,
    dark: night || plan.zMax > 0.5,
    litBy: (x, y) => Math.max(rayAt(x, y), jellyLight(plan, x / D, y / D)),
  });

  // ---- The sky, looking up, and a whisper of noise so nothing bands.
  drawSnellWindow(ctx, W, H, {
    cx: plan.window.x * D,
    cy: plan.window.y * D,
    radius: plan.window.r * D,
    sun,
    moon: plan.moon,
    dark: night,
    px: D,
    seed: plan.seed,
  });
  ctx.restore();
  dither(ctx, W, H, plan.seed);
}

/* ---- The wash ---- */

function paintWash(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, W: number, H: number) {
  // The wash's paint is neutral: it reads the water only for how light it
  // is, so it is laid in bands, each told the lightness of its own water.
  // The colour is already down; the bands carry none of their own.
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = (plan.h * i) / bands;
    const y1 = (plan.h * (i + 1)) / bands;
    const t = tone(plan, zAt(plan, (y0 + y1) / 2));
    const n = parseInt(t.slice(1, 7), 16);
    const lum = Number.isFinite(n) ? (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255 : 0.5;
    const v = Math.round(lum * 255).toString(16).padStart(2, '0');
    const clear = `#${v}${v}${v}00`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0 * D - (i ? 0.5 : 0), W, (y1 - y0) * D + 1);
    ctx.clip();
    c.wash.draw(ctx, W, H, { top: clear, bottom: clear, dark: lum < 0.45, snow: '#FFFFFF', light: 0 }, D, plan.seed);
    ctx.restore();
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
      const gr = ctx.createRadialGradient(x * D, y * D, 0, x * D, y * D, rad);
      const lift = r() < 0.4;
      const col = lift ? (plan.ground === 'night' ? '60, 72, 92' : '70, 78, 104') : '4, 4, 10';
      const a = (lift ? 0.05 : 0.12) * (0.5 + r() * 0.5);
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

function occluderOf(plan: Plan, c: Caches, D: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${plan.w}|${plan.h}`;
  if (c.occluder?.key === key) return c.occluder.canvas;
  // Soft shadows want no detail: a mask a few hundred pixels across, stretched.
  const k = 900 / Math.max(plan.w, plan.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(plan.w * k));
  canvas.height = Math.max(1, Math.round(plan.h * k));
  const o = canvas.getContext('2d');
  if (!o) return null;
  o.scale(k, k);
  o.fillStyle = '#000';
  for (const j of plan.jellies) {
    o.globalAlpha = 0.85;
    o.beginPath();
    o.ellipse(j.x, j.y, j.r, j.r * 0.45 * j.aspect, 0, 0, Math.PI * 2);
    o.fill();
    o.globalAlpha = 0.25;
    o.fillRect(j.x - j.r * 0.7, j.y, j.r * 1.4, j.len * 0.8);
  }
  for (const b of [...plan.ledges.map((l) => l.box), ...plan.rocks.map((r) => r.box)]) {
    o.globalAlpha = 0.9;
    o.beginPath();
    o.ellipse((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 20, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, 0, 0, Math.PI * 2);
    o.fill();
  }
  if (plan.kelp) {
    for (const edge of [-1, 1]) {
      o.globalAlpha = 0.35;
      o.fillRect(edge < 0 ? 0 : plan.w * 0.85, 0, plan.w * 0.15, plan.kelp.bottom);
    }
  }
  for (const a of plan.cast) {
    if (a.layer === 0) continue;
    o.globalAlpha = a.layer === 2 ? 0.8 : 0.5;
    o.beginPath();
    o.ellipse(a.x, a.y, (a.box.x1 - a.box.x0) * 0.45, (a.box.y1 - a.box.y0) * 0.4, 0, 0, Math.PI * 2);
    o.fill();
  }
  if (plan.floor) {
    o.globalAlpha = 1;
    o.fillRect(0, plan.floor.y, plan.w, plan.h - plan.floor.y);
  }
  void D;
  c.occluder = { key, canvas };
  return canvas;
}

/* ---- The animals ---- */

function speciesOf(c: Caches, zone: number, slot: number): Species | null {
  return c.biome.pools[zone]?.[slot] ?? null;
}

function paintCast(ctx: CanvasRenderingContext2D, plan: Plan, c: Caches, D: number, ambient: number, layer: 0 | 1 | 2) {
  for (const a of plan.cast) {
    if (a.layer !== layer) continue;
    const sp = speciesOf(c, a.zone, a.slot);
    if (!sp) continue;
    const water = waterAtY(plan, a.y);
    const dark = water.dark;
    const parts = a.members ? a.members.map((m) => ({ x: a.x + m.dx, y: a.y + m.dy, len: m.len, phase: m.phase })) : [{ x: a.x, y: a.y, len: a.len, phase: a.phase }];
    ctx.save();
    if (layer === 0 && 'filter' in ctx) ctx.filter = `blur(${(0.7 * D).toFixed(2)}px)`;
    for (const p of parts) {
      const sprite = c.sprites.get(sp, p.len, dark, D, a.rare);
      if (!sprite) continue;
      const v: Visitor = { key: a.id, species: sp, layer: a.layer, x: p.x, y: p.y, len: p.len, dir: a.dir, age: 0.5, alpha: a.alpha, phase: p.phase };
      drawVisitor(ctx, sprite, v, D, ambient, a.alpha, a.floor ? 1 : 6);
    }
    ctx.restore();
    if (layer === 0) {
      // Haze: the water between, laid back over the far ones.
      ctx.save();
      ctx.globalAlpha = 0.18;
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

function lightsOf(plan: Plan, c: Caches, D: number) {
  const lights: { x: number; y: number; r: number; color: string; strength: number }[] = [];
  for (const j of plan.jellies) {
    const z = zAt(plan, j.y);
    const body = jellyForBlock(plan.key, j.block);
    const tint = mixHex(plan.color, HUES[body.hue] ?? plan.color, body.hueMix);
    const deep = Math.max(0, Math.min(1, (z - 0.35) / 0.4));
    const s = (j.hero ? 0.75 : 0.4) * (plan.ground === 'night' ? 0.5 + 0.5 * deep : deep);
    if (s > 0.02) lights.push({ x: j.x * D, y: (j.y + j.r * 0.4) * D, r: j.r * (j.hero ? 5 : 3.6) * D, color: mixHex(tint, '#FFFFFF', 0.35), strength: s });
  }
  for (const a of plan.cast) {
    const sp = speciesOf(c, a.zone, a.slot);
    if (!sp || !sp.genome.lit || a.layer === 0) continue;
    const z = zAt(plan, a.y);
    if (z < 0.45 && plan.ground === 'paper') continue;
    const glow = ['#9FE8FF', '#B8FFD9', '#FFD9A0', '#E3C2FF'][Math.max(0, Math.min(3, Math.round(sp.genome.glow)))];
    lights.push({ x: a.x * D, y: a.y * D, r: a.len * 1.1 * D, color: glow, strength: 0.25 });
  }
  for (const e of plan.events) {
    if (e.kind === 'lure') lights.push({ x: e.x * D, y: e.y * D, r: 90 * D, color: '#BFF3E6', strength: 0.45 });
    if (e.kind === 'storm') lights.push({ x: e.x * D, y: e.y * D, r: 260 * D, color: '#8EF0D2', strength: 0.25 });
  }
  return lights;
}

/* ---- The bubbles ---- */

function paintBubbles(ctx: CanvasRenderingContext2D, plan: Plan, D: number) {
  ctx.save();
  ctx.lineWidth = Math.max(0.6, 0.7 * D);
  for (const b of plan.bubbles) {
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

function paintKelp(ctx: CanvasRenderingContext2D, plan: Plan, kelp: Kelp, c: Caches, D: number, ambient: number) {
  if (!plan.kelp) return;
  // The forest is drawn as the live sea draws it, a frame at a time, the
  // frames stacked down the page: three frames from the canopy to the rock.
  const hf = plan.kelp.bottom / 2.45;
  const s = Math.max(0.45, Math.min(1, hf / 520));
  const water = waterAtY(plan, plan.kelp.bottom * 0.4);
  for (let k = 0; k < 3; k++) {
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
  for (let k = 0; k < 2; k++) {
    const base = yF - (34 - k * 16) * D;
    const amp = (26 - k * 8) * D;
    const ph = r() * 10;
    ctx.save();
    ctx.fillStyle = mixHex(deep, '#050508', 0.25 + k * 0.2);
    ctx.globalAlpha = 0.55 + k * 0.2;
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
  // Silt over it: the light it catches at its crest, darker at the foot, and
  // sediment and stones scattered through it.
  ctx.save();
  const g = ctx.createLinearGradient(0, yF - 14 * D, 0, H);
  g.addColorStop(0, 'rgba(120, 124, 140, 0.0)');
  g.addColorStop(0.04, 'rgba(120, 124, 140, 0.16)');
  g.addColorStop(0.25, 'rgba(60, 62, 76, 0.08)');
  g.addColorStop(1, 'rgba(6, 6, 10, 0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(0, yF - 14 * D, W, H - yF + 14 * D);
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

function paintEvent(ctx: CanvasRenderingContext2D, plan: Plan, e: PlacedEvent, D: number, ambient: number) {
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

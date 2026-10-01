/**
 * Light for a still: the effects too slow for the live timer that a picture
 * drawn once can afford. Called by the picture renderer (lib/ocean/picture).
 *
 * Everything here is painted rather than rendered: the window of sky is a
 * wash with a broken pen line round it, the sun in it is a disc torn into
 * slivers by the waves, the shafts are many thin strokes of uneven weight,
 * and the shadows behind things in the water are streaks the light leaves
 * out. On the paper ground the marks that carry the form are slate ink and
 * the light is paper left bare; on the night ground the ink is light and the
 * light is added.
 *
 * Everything is in device px and a pure function of its arguments and seed:
 * the same picture drawn twice comes out the same.
 */

import { mixHex } from '../fan';
import { IRON_GALL } from './palette';
import { inkLine } from './pen';
import { hash32, mulberry32, type Rand } from './random';

/** The sun or moon at the hour a sitting began, as it reaches into water. */
export interface SunLight {
  /** How far the shafts lean from straight down, radians; morning one way, afternoon the other. */
  tilt: number;
  /** The colour of the light. */
  warmth: string;
  /** 0 at night, 1 at noon. */
  strength: number;
  /** True between dusk and dawn: the moon is what is up there. */
  night: boolean;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---- The hour ---- */

/** Sunrise and sunset, local hours; dusk and dawn are the half hour either side. */
const RISE = 6;
const SET = 19;
/** The steepest a shaft leans, at the horizon: short of the 48.6 degrees refraction allows, which reads as a fall. */
const LEAN = 0.62;
/** Moonlight, against the sun at noon. */
const MOONLIGHT = 0.18;

const NOON = '#FFF8EA';
const DAWN = '#F3BC98';
const DUSK = '#EC9F4E';
const MOON = '#C6D3E4';

/**
 * Light for a local hour of day, 0 to 24. The sun climbs from a low, warm,
 * steeply leaning light at dawn (pink-gold), to white and all but straight
 * down at noon, and down the other side to an amber dusk; between 19:30 and
 * 05:30 it is the moon, cool and weak. Everything moves smoothly with the
 * hour, the half hour of dusk and dawn blending one light into the other.
 * Shafts lean down and to the right in the morning (positive tilt) and down
 * and to the left in the afternoon. `strength` is MOONLIGHT (about 0.18) by
 * night rather than 0, so a moonlit picture still has its faint rays.
 */
export function sunFor(hour: number): SunLight {
  const hr = (((Number.isFinite(hour) ? hour : 12) % 24) + 24) % 24;
  // How far through the sun's day, and how high it is.
  const dayT = (hr - RISE) / (SET - RISE);
  const elev = Math.sin(Math.PI * clamp01(dayT));
  // Hours above the horizon (negative below it): the sun's light lasts till
  // the end of dusk, a half hour after it has set.
  const above = Math.min(hr - RISE, SET - hr);
  const up = smoothstep(-0.5, 0.35, above);
  const night = hr >= SET + 0.5 || hr < RISE - 0.5;

  // The sun's lean: steep at either end of the day, near nought round noon.
  const c = Math.cos(Math.PI * clamp01(dayT));
  const sunTilt = Math.sign(c) * Math.pow(Math.abs(c), 1.25) * LEAN;
  // The moon crosses the night sky the same way, less steeply.
  const nightT = ((((hr - (SET + 0.5)) % 24) + 24) % 24) / (24 - (SET - RISE) - 1);
  const moonTilt = Math.cos(Math.PI * clamp01(nightT)) * LEAN * 0.7;

  // Pink-gold low in the morning, amber low in the evening, white high up.
  const low = mixHex(DAWN, DUSK, smoothstep(0.35, 0.65, dayT));
  const sunColor = mixHex(low, NOON, Math.pow(smoothstep(0.02, 0.8, elev), 0.8));
  const sunStrength = 0.32 + 0.68 * Math.pow(elev, 0.6);

  return {
    tilt: moonTilt + (sunTilt - moonTilt) * up,
    warmth: mixHex(MOON, sunColor, up),
    strength: MOONLIGHT + (sunStrength - MOONLIGHT) * up,
    night,
  };
}

/** The moon's phase on a date: 0 new, 0.5 full, back to 1. */
export function moonPhase(date: Date): number {
  const synodic = 29.530588853;
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - known) / 86400000;
  return (((days / synodic) % 1) + 1) % 1;
}

/** How much of the moon's face is lit, 0 new to 1 full. */
export function moonLit(phase: number): number {
  return (1 - Math.cos(TAU * phase)) / 2;
}

/* ---- Scratch canvases ---- */

interface Surface {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

function surface(w: number, h: number): Surface | null {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    return ctx ? { canvas: c, ctx, w: W, h: H } : null;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D | null;
    return ctx ? { canvas: c, ctx, w: W, h: H } : null;
  }
  return null;
}

/**
 * A soft copy of a canvas: halved again and again, then doubled back up, so
 * the blur is smooth rather than blocky. `factor` is about the blur's radius
 * in the source's pixels. Works everywhere canvas does (no ctx.filter).
 */
function soften(src: Surface, factor: number): Surface {
  if (factor < 1.5) return src;
  const levels: Surface[] = [src];
  let cur = src;
  let f = 1;
  while (f * 2 <= factor && cur.w > 4 && cur.h > 4) {
    const next = surface(cur.w / 2, cur.h / 2);
    if (!next) break;
    next.ctx.imageSmoothingEnabled = true;
    next.ctx.imageSmoothingQuality = 'high';
    next.ctx.drawImage(cur.canvas, 0, 0, next.w, next.h);
    levels.push(next);
    cur = next;
    f *= 2;
  }
  for (let i = levels.length - 2; i >= 0; i--) {
    const up = surface(levels[i].w, levels[i].h);
    if (!up) break;
    up.ctx.imageSmoothingEnabled = true;
    up.ctx.imageSmoothingQuality = 'high';
    up.ctx.drawImage(cur.canvas, 0, 0, up.w, up.h);
    cur = up;
  }
  return cur;
}

function rgbOf(hex: string): [number, number, number] {
  const s = hex.trim().replace('#', '');
  const full = s.length === 3 ? s.replace(/./g, (c) => c + c) : s.slice(0, 6);
  const n = parseInt(full, 16);
  if (full.length !== 6 || !Number.isFinite(n)) return [255, 248, 234];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(4)})`;
}

/** A closed loop as a path. */
function loop(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

/* ---- Snell's window ---- */

/** The rim's ripple: a few waves of different lengths round the circle. */
function rimRipple(r: Rand): (a: number) => number {
  const waves = [
    [5, 0.007],
    [9, 0.005],
    [14, 0.0035],
    [23, 0.0022],
    [37, 0.0012],
  ].map(([n, amp]) => [n, amp * (0.6 + 0.8 * r()), r() * TAU] as const);
  return (a) => {
    let s = 1;
    for (const [n, amp, ph] of waves) s += amp * Math.sin(n * a + ph);
    return s;
  };
}

/** Where the sun or moon sits in the window: off centre by how far it leans. */
function bodyAt(cx: number, cy: number, R: number, tilt: number): { x: number; y: number } {
  // A shaft leaning down and to the right comes from up and to the left.
  const off = Math.max(-0.82, Math.min(0.82, Math.sin(tilt) / Math.sin(0.85)));
  return { x: cx - off * R * 0.86, y: cy - R * 0.1 * (1 - Math.abs(off)) - R * 0.04 };
}

/** The lit part of the moon as a path, centred on the origin: the lit limb, then back along the terminator. */
function moonLitPath(rm: number, phase: number): Path2D {
  const p = new Path2D();
  const waning = phase > 0.5;
  const tx = rm * Math.cos(TAU * phase);
  const s = waning ? -1 : 1;
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / N;
    const x = s * rm * Math.cos(a);
    const y = rm * Math.sin(a);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  for (let i = 0; i <= N; i++) {
    const a = Math.PI / 2 - (Math.PI * i) / N;
    p.lineTo(s * tx * Math.cos(a), rm * Math.sin(a));
  }
  p.closePath();
  return p;
}

/**
 * A disc torn into slivers by the waves: cut into bands across, each band
 * pushed sideways by its own swell and some lost altogether, the way the sun
 * looks through a moving surface. Drawn into its own canvas, centred.
 */
function brokenDisc(rd: number, r: Rand, fill: (g: CanvasRenderingContext2D, rd: number) => void, tear: number): Surface | null {
  const pad = rd * 1.6;
  const s = surface(pad * 2, pad * 2);
  const whole = surface(pad * 2, pad * 2);
  if (!s || !whole) return null;
  whole.ctx.translate(pad, pad);
  fill(whole.ctx, rd);
  // Barely torn, it is the whole disc with its bands nudged over it, so the
  // seams between them never show as lines.
  if (tear < 0.3) s.ctx.drawImage(whole.canvas, 0, 0);
  const bands = 6 + Math.floor(r() * 4);
  const step = (rd * 2.2) / bands;
  // The cuts between bands are waves too, not rules: each a sine of its own.
  const cut = (y: number, k: number) => {
    const f = (2 + r() * 3) / rd;
    const ph = r() * TAU;
    const amp = step * (0.12 + 0.2 * r());
    return (x: number) => y + Math.sin(x * f + ph + k) * amp;
  };
  let top = (x: number) => -pad + x * 0;
  const ph = r() * TAU;
  for (let i = 0; i < bands; i++) {
    const yEnd = -rd * 1.1 + step * (i + 1);
    const last = i === bands - 1;
    const bottom = last ? (x: number) => pad + x * 0 : cut(yEnd, i);
    const gap = last ? 0 : step * tear * (0.04 + 0.3 * r() * r());
    // The swell grows toward the disc's edge, where the slope is steepest.
    const mid = yEnd - step / 2;
    const edge = 1 - Math.min(1, Math.abs(mid) / (rd * 1.05));
    const dx = (Math.sin(ph + i * 1.9) * 0.1 + (r() - 0.5) * 0.1) * rd * tear * (1.2 - edge * 0.6);
    const band = new Path2D();
    const N = 24;
    for (let k = 0; k <= N; k++) {
      const x = (k / N) * pad * 2 - pad;
      if (k === 0) band.moveTo(x + pad, top(x) + pad);
      else band.lineTo(x + pad, top(x) + pad);
    }
    for (let k = N; k >= 0; k--) {
      const x = (k / N) * pad * 2 - pad;
      band.lineTo(x + pad, bottom(x) - gap + pad);
    }
    band.closePath();
    s.ctx.save();
    s.ctx.clip(band);
    s.ctx.drawImage(whole.canvas, dx, 0);
    s.ctx.restore();
    top = bottom;
  }
  return s;
}

/**
 * What you see looking up from under the surface: the whole sky squeezed
 * into a bright circle (Snell's window) with a rippling, broken rim, the
 * water outside it darker; inside, the sun as a bright disc torn by the
 * waves, or by night the moon at its real phase; and faint ripple lines
 * across it all. `moon` is the phase from `moonPhase`, or null for none.
 * `dark` is the night ground (light ink on blue-black); otherwise the
 * paper, where the window is paper left bare inside a slate wash and its
 * rim and ripples are drawn in slate ink.
 */
export function drawSnellWindow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: { cx: number; cy: number; radius: number; sun: SunLight; moon: number | null; dark: boolean; px: number; seed: number },
): void {
  const { cx, cy, sun, moon, dark, seed } = o;
  const R = o.radius;
  if (!(R > 2) || w <= 0 || h <= 0) return;
  const px = Math.max(0.5, o.px);
  const r = mulberry32(hash32('snell', seed));
  const ripple = rimRipple(r);
  // Line weights grow with the window, so a poster's rim is not a hair.
  const pen = Math.max(px, R / 420);
  const glow = sun.night ? 0.55 + 0.45 * (moon == null ? 0 : moonLit(moon)) : 1;

  // The colours. On paper: bare paper, warmed by the light, in slate. On the
  // night ground: the light is light, and the ink is pale.
  const sky = sun.night
    ? dark
      ? mixHex('#222B37', sun.warmth, 0.18)
      : mixHex('#F7F5EC', sun.warmth, 0.12)
    : dark
      ? mixHex('#ABA99F', sun.warmth, 0.4)
      : mixHex('#F8F5EA', sun.warmth, 0.3);
  const ink = dark ? mixHex(IRON_GALL.dark, sun.warmth, 0.25) : IRON_GALL.light;
  const shadow = dark ? '#03050A' : '#3F4D4B';
  const lift = dark ? 'lighter' : 'screen';

  const rim: number[] = [];
  const N = 360;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const rr = R * ripple(a);
    rim.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  const windowPath = loop(rim);

  ctx.save();

  // The water beyond the window: the depths reflected back down off the
  // underside of the surface, darkest just past the rim.
  {
    const outer = R * 2.6;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    const at = (k: number) => Math.min(1, (R * k) / outer);
    const top = dark ? 0.55 : 0.2;
    g.addColorStop(0, rgba(shadow, 0));
    g.addColorStop(at(0.95), rgba(shadow, 0));
    g.addColorStop(at(1.03), rgba(shadow, top));
    g.addColorStop(at(1.25), rgba(shadow, top * 0.62));
    g.addColorStop(at(1.7), rgba(shadow, top * 0.25));
    g.addColorStop(1, rgba(shadow, 0));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(cx - outer, cy - outer, outer * 2, outer * 2);
  }

  // The light the window throws into the water round it.
  {
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
    const a = (dark ? (sun.night ? 0.25 : 0.2) : 0.4) * glow;
    g.addColorStop(0, rgba(sky, a));
    g.addColorStop(0.5, rgba(sky, a * 0.55));
    g.addColorStop(1, rgba(sky, 0));
    ctx.globalCompositeOperation = lift;
    ctx.fillStyle = g;
    ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);
  }

  // The window itself: a wash of sky inside the rippled rim, the rim then
  // softened as a wet edge is, brighter toward the rim where the horizon is
  // squeezed in.
  const S = surface(R * 2.5, R * 2.5);
  if (S) {
    const o2 = R * 1.25;
    const g = S.ctx;
    g.translate(o2 - cx, o2 - cy);
    const fill = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.04);
    const a = dark ? (sun.night ? 0.9 * glow : 0.72) : 0.95;
    // By day the horizon squeezed into the rim is a touch brighter; by
    // night it is not, or the window turns into a glass ball.
    const rimLift = sun.night ? 0 : 0.35;
    fill.addColorStop(0, rgba(sky, a * 0.92));
    fill.addColorStop(0.7, rgba(sky, a * 0.86));
    fill.addColorStop(0.92, rgba(mixHex(sky, '#FFFFFF', rimLift), a * (sun.night ? 0.8 : 1)));
    fill.addColorStop(1, rgba(sky, a * 0.7));
    g.fillStyle = fill;
    g.fill(windowPath);
    const soft = soften(S, Math.max(2, R / 70));
    ctx.globalCompositeOperation = dark ? 'source-over' : 'source-over';
    ctx.drawImage(soft.canvas, 0, 0, soft.w, soft.h, cx - o2, cy - o2, S.w, S.h);
  }

  // The sky's own light, gathered round the sun or the moon.
  const body = bodyAt(cx, cy, R, sun.tilt);
  {
    const reach = R * (sun.night ? 0.55 : 0.85);
    const g = ctx.createRadialGradient(body.x, body.y, 0, body.x, body.y, reach);
    const a = sun.night ? (dark ? 0.3 : 0.15) * glow : (dark ? 0.4 : 0.55) * (0.5 + 0.5 * sun.strength);
    g.addColorStop(0, rgba(sun.warmth, a));
    g.addColorStop(0.3, rgba(sun.warmth, a * 0.5));
    g.addColorStop(1, rgba(sun.warmth, 0));
    ctx.save();
    ctx.clip(windowPath);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'multiply';
    // On paper the light is the paper: the sun's colour goes in as a glaze,
    // faint, so the disc itself can stay bare.
    if (!dark) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g;
      ctx.fillRect(body.x - reach, body.y - reach, reach * 2, reach * 2);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = g;
      ctx.fillRect(body.x - reach, body.y - reach, reach * 2, reach * 2);
    }
    ctx.restore();
  }

  // Ripple lines across the window: the backs of the waves overhead, long,
  // roughly parallel, bending as they cross.
  {
    const rr = mulberry32(hash32('snell', seed, 'ripples'));
    const angle = (rr() - 0.5) * 0.7;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const lines = 22 + Math.floor(rr() * 8);
    ctx.save();
    ctx.clip(windowPath);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < lines; i++) {
      const off = (-1 + (2 * (i + 0.5 + (rr() - 0.5) * 0.7)) / lines) * R * 1.05;
      const pts: number[] = [];
      const amp = R * (0.012 + rr() * 0.03);
      const f1 = (2 + rr() * 4) / R;
      const f2 = (7 + rr() * 9) / R;
      const p1 = rr() * TAU;
      const p2 = rr() * TAU;
      const half = Math.sqrt(Math.max(0, R * R * 1.1 - off * off));
      const t0 = -half * (0.6 + 0.4 * rr());
      const t1 = half * (0.6 + 0.4 * rr());
      for (let t = t0; t <= t1; t += R / 40) {
        const n = off + Math.sin(t * f1 + p1) * amp + Math.sin(t * f2 + p2) * amp * 0.35;
        pts.push(cx + dx * t - dy * n, cy + dy * t + dx * n);
      }
      if (pts.length < 6) continue;
      // Light lines on the night ground; on paper, slate lines a pen drew.
      const bright = i % 3 !== 1;
      const col = dark ? (bright ? mixHex(sky, '#FFFFFF', 0.6) : shadow) : bright ? ink : mixHex(ink, sky, 0.4);
      // Each crest drawn in one to three strokes, the pen lifting between.
      const runs = 1 + Math.floor(rr() * 3);
      const n = pts.length / 2;
      let at = 0;
      for (let k = 0; k < runs && at < n - 3; k++) {
        const len = Math.max(4, Math.floor((n / runs) * (0.55 + 0.45 * rr())));
        const piece = pts.slice(at * 2, Math.min(n, at + len) * 2);
        at += len + Math.floor(rr() * 4);
        if (piece.length < 8) continue;
        inkLine(ctx, piece, false, {
          width: pen * (bright ? 1.2 + rr() * 1.6 : 0.8 + rr()),
          color: col,
          alpha: dark ? (bright ? 0.24 : 0.12) * (0.6 + 0.4 * glow) : bright ? 0.12 : 0.07,
          lost: 0.75,
          swell: 0.5,
          taper: [0.3, 0.3],
          seed: hash32('snell', seed, 'line', i, k),
          min: px * 0.4,
        });
      }
    }
    ctx.restore();
  }

  // The sun, torn into slivers by the waves; or the moon, at its phase.
  if (!sun.night && sun.strength > 0.05) {
    const rd = R * 0.09;
    const rs = mulberry32(hash32('snell', seed, 'sun'));
    // Its halo first, the light scattered by the water round it.
    if (dark) {
      const halo = rd * 4.5;
      const g = ctx.createRadialGradient(body.x, body.y, 0, body.x, body.y, halo);
      const core = mixHex(sun.warmth, '#FFFFFF', 0.5);
      const a = 0.6 * sun.strength;
      g.addColorStop(0, rgba(core, a));
      g.addColorStop(0.22, rgba(core, a * 0.55));
      g.addColorStop(0.55, rgba(sun.warmth, a * 0.18));
      g.addColorStop(1, rgba(sun.warmth, 0));
      ctx.globalCompositeOperation = lift;
      ctx.fillStyle = g;
      ctx.fillRect(body.x - halo, body.y - halo, halo * 2, halo * 2);
    } else {
      // On paper the sun is the paper: a warm glaze laid round it, thinning
      // outward, and the disc itself left bare.
      const halo = rd * 5.5;
      const gold = mixHex(sun.warmth, '#E6C27E', 0.55);
      const g = ctx.createRadialGradient(body.x, body.y, rd * 0.8, body.x, body.y, halo);
      g.addColorStop(0, rgba(gold, 0.42));
      g.addColorStop(0.18, rgba(gold, 0.3));
      g.addColorStop(0.5, rgba(gold, 0.1));
      g.addColorStop(1, rgba(gold, 0));
      ctx.save();
      ctx.clip(windowPath);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = g;
      ctx.fillRect(body.x - halo, body.y - halo, halo * 2, halo * 2);
      ctx.restore();
    }
    const disc = brokenDisc(
      rd,
      rs,
      (g, d) => {
        const f = g.createRadialGradient(0, 0, 0, 0, 0, d);
        f.addColorStop(0, '#FFFFFF');
        f.addColorStop(0.6, mixHex('#FFFFFF', sun.warmth, 0.35));
        f.addColorStop(1, mixHex('#FFFFFF', sun.warmth, 0.7));
        g.fillStyle = f;
        g.beginPath();
        g.arc(0, 0, d, 0, TAU);
        g.fill();
      },
      0.9,
    );
    if (disc) {
      const soft = soften(disc, Math.max(1.5, rd / 18));
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.globalAlpha = Math.min(1, 0.6 + 0.5 * sun.strength) * (dark ? 1 : 0.95);
      ctx.drawImage(soft.canvas, 0, 0, soft.w, soft.h, body.x - disc.w / 2, body.y - disc.h / 2, disc.w, disc.h);
      ctx.globalAlpha = 1;
    }
    // Glints: the sun caught again on the faces of the ripples round it,
    // short strokes across, thinning out with distance.
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    ctx.fillStyle = dark ? mixHex(sun.warmth, '#FFFFFF', 0.6) : '#FFFFFF';
    ctx.save();
    ctx.clip(windowPath);
    for (let i = 0; i < 70; i++) {
      const d = rd * (1.2 + 5 * Math.pow(rs(), 1.6));
      const a = rs() * TAU;
      const gx = body.x + Math.cos(a) * d * 1.3;
      const gy = body.y + Math.sin(a) * d * 0.75;
      const len = rd * (0.15 + rs() * 0.5) * (1 - d / (rd * 7));
      ctx.globalAlpha = Math.max(0, (0.65 - d / (rd * 9)) * sun.strength) * (dark ? 1 : 0.85);
      ctx.beginPath();
      ctx.ellipse(gx, gy, Math.max(px * 0.5, len), Math.max(px * 0.35, pen * (0.5 + rs())), 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  } else if (sun.night && moon != null) {
    const rm = R * 0.12;
    const lit = moonLit(moon);
    const rs = mulberry32(hash32('snell', seed, 'moon'));
    const pale = dark ? '#EEF0EA' : '#FBF8EF';
    if (dark) {
      const halo = rm * 6;
      const g = ctx.createRadialGradient(body.x, body.y, rm * 0.6, body.x, body.y, halo);
      g.addColorStop(0, rgba(sun.warmth, 0.35 * (0.2 + 0.8 * lit)));
      g.addColorStop(0.35, rgba(sun.warmth, 0.1 * (0.2 + 0.8 * lit)));
      g.addColorStop(1, rgba(sun.warmth, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(body.x - halo, body.y - halo, halo * 2, halo * 2);
    }
    const disc = brokenDisc(
      rm,
      rs,
      (g, d) => {
        // The dark of the moon, faintly there by earthshine (on paper, a
        // slate wash), then the lit face, a few seas on it.
        g.fillStyle = dark ? 'rgba(200, 210, 225, 0.13)' : 'rgba(63, 77, 75, 0.38)';
        g.beginPath();
        g.arc(0, 0, d, 0, TAU);
        g.fill();
        const face = moonLitPath(d, moon);
        g.save();
        g.clip(face);
        g.fillStyle = pale;
        g.fillRect(-d, -d, d * 2, d * 2);
        // The seas: soft grey blots, run together, more of them up and to
        // one side as on the real face.
        const seas = mulberry32(hash32('moon', 'seas'));
        g.fillStyle = dark ? 'rgba(120, 130, 140, 0.12)' : 'rgba(63, 77, 75, 0.07)';
        for (let i = 0; i < 16; i++) {
          const ang = -2.2 + seas() * 2.6;
          const dist = d * (0.15 + 0.55 * seas());
          g.beginPath();
          g.ellipse(Math.cos(ang) * dist, Math.sin(ang) * dist, d * (0.08 + seas() * 0.16), d * (0.06 + seas() * 0.12), seas() * 3, 0, TAU);
          g.fill();
        }
        g.restore();
        if (!dark) {
          // Drawn round in slate, the pen lifting where the light is.
          const ring: number[] = [];
          for (let i = 0; i < 40; i++) ring.push(Math.cos((i / 40) * TAU) * d, Math.sin((i / 40) * TAU) * d);
          inkLine(g, ring, true, { width: Math.max(px, d / 26), color: IRON_GALL.light, alpha: 0.75, lost: 0.4, seed: 5 });
        }
      },
      0.1,
    );
    if (disc) {
      const soft = soften(disc, Math.max(1, rm / 40));
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(soft.canvas, 0, 0, soft.w, soft.h, body.x - disc.w / 2, body.y - disc.h / 2, disc.w, disc.h);
    }
  }

  // The rim: broken strokes round the edge of the window, light caught on
  // the bend inside it and a darker refracted band just outside, the pen
  // never quite closing the circle.
  {
    const rr = mulberry32(hash32('snell', seed, 'rim'));
    ctx.globalCompositeOperation = 'source-over';
    const strokes = 110;
    for (let i = 0; i < strokes; i++) {
      const inside = rr() < 0.62;
      const a0 = rr() * TAU;
      const span = 0.04 + rr() * 0.26;
      const k = inside ? 0.955 + rr() * 0.04 : 1.004 + rr() * 0.035;
      const pts: number[] = [];
      for (let t = 0; t <= 1.0001; t += 1 / 14) {
        const a = a0 + span * t;
        const rad = R * ripple(a) * (k + Math.sin(t * 5 + i) * 0.003);
        pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      const col = inside ? (dark ? mixHex(sky, '#FFFFFF', 0.7) : ink) : dark ? shadow : ink;
      inkLine(ctx, pts, false, {
        width: pen * (inside ? 1.2 + rr() * 2.2 : 0.8 + rr() * 1.4),
        color: col,
        alpha: inside ? (dark ? 0.5 : 0.42) * (0.4 + 0.6 * rr()) * (0.6 + 0.4 * glow) : (dark ? 0.5 : 0.22) * (0.4 + 0.6 * rr()),
        lost: 0.6,
        swell: 0.6,
        taper: [0.3, 0.3],
        seed: hash32('snell', seed, 'rim', i),
        min: px * 0.4,
      });
    }
  }

  ctx.restore();
}

/* ---- God rays ---- */

interface RayOptions {
  source: { x: number; y: number };
  occluder: CanvasImageSource | null;
  strength: number;
  sun: SunLight;
  px: number;
  seed: number;
  dark: boolean;
}

/** The ray buffer's share of the canvas: the rays are soft, and this is a ninth of the pixels. */
const RAY_SCALE = 1 / 3;

/**
 * The shafts alone, uncut, at a third of the canvas's size: many thin
 * wedges fanning down from the source at the sun's lean, each of its own
 * width and brightness, broken along its length here and there, fading as
 * the water swallows it.
 */
function paintRays(w: number, h: number, o: RayOptions): Surface | null {
  const q = RAY_SCALE;
  const S = surface(w * q, h * q);
  if (!S) return null;
  const g = S.ctx;
  g.scale(q, q);
  g.globalCompositeOperation = 'lighter';
  const r = mulberry32(hash32('rays', o.seed));
  const { x: sx, y: sy } = o.source;
  const size = Math.max(w, h);
  const tilt = o.sun.tilt;
  // A wider fan when the source is close to the top of the picture.
  const spread = 0.42 + 0.25 * clamp01(1 - (sy + size * 0.1) / (size * 0.4));
  const base = w * 0.34;
  const n = 110;
  const col = mixHex(o.sun.warmth, '#FFFFFF', 0.25);
  const [cr, cg, cb] = rgbOf(col);
  for (let i = 0; i < n; i++) {
    // Rays bunch a little, as shafts do: some gaps, some sheaves.
    const u = (i + r() * 0.9) / n;
    const bunch = 0.5 + 0.5 * Math.sin(u * 23 + o.seed * 0.001) * Math.sin(u * 7.3 + 1.1);
    const along = (u - 0.5) * 2;
    const a = tilt + along * spread * 0.5 + (r() - 0.5) * 0.04;
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const x0 = sx + along * base * 0.5 + (r() - 0.5) * base * 0.06;
    const y0 = sy;
    const len = size * (0.55 + 0.75 * r());
    const w0 = size * (0.0015 + 0.009 * r() * r());
    const w1 = w0 * (2.2 + 3.5 * r());
    const bright = (0.18 + 0.82 * Math.pow(r(), 1.8)) * (0.35 + 0.65 * bunch);
    const nx = dy;
    const ny = -dx;
    const ex = x0 + dx * len;
    const ey = y0 + dy * len;
    const grad = g.createLinearGradient(x0, y0, ex, ey);
    // Uneven along its length: a few soft breaks, then the fade.
    const breaks = [0, 0.04, 0.12 + r() * 0.1, 0.3 + r() * 0.15, 0.5 + r() * 0.15, 0.75, 1];
    const level = [0, 1, 0.55 + 0.45 * r(), 0.35 + 0.5 * r(), 0.25 + 0.3 * r(), 0.12 * r() + 0.06, 0];
    for (let k = 0; k < breaks.length; k++) {
      // The water swallows it: light falls off with distance.
      const fade = Math.exp(-breaks[k] * 1.6);
      grad.addColorStop(Math.min(1, breaks[k]), `rgba(${cr}, ${cg}, ${cb}, ${(bright * level[k] * fade * 0.22).toFixed(4)})`);
    }
    g.fillStyle = grad;
    // Twice: a wide faint sheath, then the core.
    for (const [k, alpha] of [
      [2.4, 0.45],
      [1, 1],
    ] as const) {
      g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(x0 - (nx * w0 * k) / 2, y0 - (ny * w0 * k) / 2);
      g.lineTo(x0 + (nx * w0 * k) / 2, y0 + (ny * w0 * k) / 2);
      g.lineTo(ex + (nx * w1 * k) / 2, ey + (ny * w1 * k) / 2);
      g.lineTo(ex - (nx * w1 * k) / 2, ey - (ny * w1 * k) / 2);
      g.closePath();
      g.fill();
    }
  }
  g.globalAlpha = 1;
  // A glow where they all start, under the surface.
  const halo = size * 0.35;
  const hg = g.createRadialGradient(sx, sy, 0, sx, sy, halo);
  hg.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.22)`);
  hg.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  g.fillStyle = hg;
  g.fillRect(sx - halo, sy - halo, halo * 2, halo * 2);
  return soften(S, 1.6);
}

/**
 * The shadow every occluding thing casts down the rays: the mask marched
 * away from the source, drawn again and again a little larger about it and
 * a little fainter each time, so the shadow streams out behind it along the
 * very lines the light travels and thins as the light fills back in.
 */
function marchShadow(w: number, h: number, o: RayOptions, occluder: CanvasImageSource): Surface | null {
  const q = RAY_SCALE;
  const small = surface(w * q, h * q);
  const S = surface(w * q, h * q);
  if (!small || !S) return null;
  small.ctx.imageSmoothingEnabled = true;
  small.ctx.imageSmoothingQuality = 'high';
  small.ctx.drawImage(occluder, 0, 0, small.w, small.h);
  const g = S.ctx;
  const sx = o.source.x * q;
  const sy = o.source.y * q;
  const steps = 44;
  // How far the shadow reaches, as a scale about the source.
  const far = 0.9;
  g.globalCompositeOperation = 'source-over';
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const s = 1 + far * t * t;
    g.setTransform(s, 0, 0, s, sx - sx * s, sy - sy * s);
    g.globalAlpha = 0.16 * Math.pow(1 - t, 1.3) + 0.04;
    g.drawImage(small.canvas, 0, 0);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  // The thing itself stops the light altogether.
  g.drawImage(small.canvas, 0, 0);
  return soften(S, 2);
}

let rayCache: { key: string; occluder: CanvasImageSource | null; rays: Surface; missing: Surface | null } | null = null;

function raysFor(w: number, h: number, o: RayOptions): { rays: Surface; missing: Surface | null } | null {
  const key = [w, h, o.source.x, o.source.y, o.sun.tilt, o.sun.warmth, o.seed, o.dark].join('|');
  if (rayCache && rayCache.key === key && rayCache.occluder === o.occluder) return rayCache;
  const rays = paintRays(w, h, o);
  if (!rays) return null;
  let missing: Surface | null = null;
  if (o.occluder) {
    const shadow = marchShadow(w, h, o, o.occluder);
    if (shadow) {
      // What the shadow took: the light that would have been there.
      missing = surface(rays.w, rays.h);
      if (missing) {
        missing.ctx.drawImage(rays.canvas, 0, 0);
        missing.ctx.globalCompositeOperation = 'destination-in';
        missing.ctx.drawImage(shadow.canvas, 0, 0);
      }
      const cut = surface(rays.w, rays.h);
      if (cut) {
        cut.ctx.drawImage(rays.canvas, 0, 0);
        cut.ctx.globalCompositeOperation = 'destination-out';
        cut.ctx.globalAlpha = 0.92;
        cut.ctx.drawImage(shadow.canvas, 0, 0);
        rayCache = { key, occluder: o.occluder, rays: cut, missing };
        return rayCache;
      }
    }
  }
  rayCache = { key, occluder: o.occluder, rays, missing };
  return rayCache;
}

/**
 * Shafts of light from the surface, darkened behind whatever stands in the
 * water: `occluder` is an alpha mask the size of the canvas, or null.
 *
 * About a hundred thin rays fan down from `source` at the sun's lean,
 * uneven in width and brightness and broken along their length, fading with
 * depth. Behind every shape in the occluder the light is carved away in
 * streaks running along the rays. On the night ground the light is added;
 * on paper it is screened on, and the shadows are laid in as a faint slate
 * glaze too, since a pale ray barely shows on pale water and its absence
 * does. `strength` scales everything (multiplied by the sun's own).
 */
export function drawGodRays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: { source: { x: number; y: number }; occluder: CanvasImageSource | null; strength: number; sun: SunLight; px: number; seed: number; dark: boolean },
): void {
  const k = Math.max(0, o.strength) * Math.max(0.05, o.sun.strength);
  if (k <= 0.01 || w <= 0 || h <= 0) return;
  const got = raysFor(w, h, o);
  if (!got) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = o.dark ? 'lighter' : 'screen';
  // Twice on paper: screen is gentle, and a ray must still read on pale water.
  const passes = o.dark ? Math.min(2, k * 1.4) : Math.min(3, k * 2.4);
  for (let p = passes; p > 0; p -= 1) {
    ctx.globalAlpha = Math.min(1, p);
    ctx.drawImage(got.rays.canvas, 0, 0, got.rays.w, got.rays.h, 0, 0, w, h);
  }
  if (got.missing && !o.dark) {
    // The shadow as a glaze: the light it took, recoloured to slate.
    const tint = surface(got.missing.w, got.missing.h);
    if (tint) {
      tint.ctx.drawImage(got.missing.canvas, 0, 0);
      tint.ctx.globalCompositeOperation = 'source-in';
      tint.ctx.fillStyle = '#3F4D4B';
      tint.ctx.fillRect(0, 0, tint.w, tint.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, 1.6 * k);
      ctx.drawImage(tint.canvas, 0, 0, tint.w, tint.h, 0, 0, w, h);
    }
  }
  ctx.restore();
}

/**
 * How lit a point is by the rays `drawGodRays` would draw with the same
 * options, 0 to about 1: for `drawSnowDeep`'s `litBy`, so the snow catches
 * the light where the shafts are and drops out of it in their shadows.
 */
export function godRayLight(
  w: number,
  h: number,
  o: { source: { x: number; y: number }; occluder: CanvasImageSource | null; strength: number; sun: SunLight; px: number; seed: number; dark: boolean },
): (x: number, y: number) => number {
  const got = raysFor(w, h, o);
  if (!got) return () => 0;
  const { rays } = got;
  let data: Uint8ClampedArray;
  try {
    data = rays.ctx.getImageData(0, 0, rays.w, rays.h).data;
  } catch {
    return () => 0;
  }
  const k = Math.max(0, o.strength) * Math.max(0.05, o.sun.strength);
  return (x, y) => {
    const i = Math.floor(x * RAY_SCALE);
    const j = Math.floor(y * RAY_SCALE);
    if (i < 0 || j < 0 || i >= rays.w || j >= rays.h) return 0;
    const at = (j * rays.w + i) * 4;
    return Math.min(1, ((data[at] + data[at + 1] + data[at + 2]) / (3 * 255)) * 6 * k);
  };
}

/* ---- Lights ---- */

/** The brightness under a point of the canvas, 0 to 1, or null if it cannot be read. */
function lumAt(ctx: CanvasRenderingContext2D, x: number, y: number): number | null {
  try {
    const m = ctx.getTransform();
    const dx = Math.round(m.a * x + m.c * y + m.e);
    const dy = Math.round(m.b * x + m.d * y + m.f);
    const d = ctx.getImageData(dx - 3, dy - 3, 7, 7).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      sum += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      n++;
    }
    return n ? sum / n / 255 : null;
  } catch {
    return null;
  }
}

/** A glow's falloff: a bright core, then a long tail as the water scatters it, nought at the edge. */
const FALLOFF = [0, 0.04, 0.09, 0.16, 0.26, 0.4, 0.58, 0.78, 1].map((t) => {
  const f = (s: number) => 1 / (1 + (s / 0.2) ** 2);
  return [t, Math.max(0, (f(t) - f(1)) / (1 - f(1)))] as const;
});

/**
 * Things that glow, lighting the water and whatever is near them. Drawn
 * after everything they light. Each light lays a soft pool of its colour
 * (`r` is how far it reaches, device px): added on dark water, screened on
 * pale, so it reads as light in water rather than a spot of paint. Then the
 * things inside the pool are brightened by their own colour (an overlay
 * pass), so a fin or a rock near the light comes up lit while the empty
 * water round it stays dark. Whether the water is dark is read off the
 * canvas under each light.
 */
export function drawLightPass(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lights: { x: number; y: number; r: number; color: string; strength: number }[],
  px: number,
): void {
  if (!lights.length || w <= 0 || h <= 0) return;
  ctx.save();
  for (const L of lights) {
    const R = Math.max(2 * px, L.r);
    const s = Math.max(0, Math.min(2, L.strength));
    if (s <= 0.005) continue;
    const lum = lumAt(ctx, L.x, L.y) ?? 0.2;
    const dark = lum < 0.45;
    // Light in water is never the pure colour of its source: the water
    // scatters it toward white and warmth, which also keeps it off neon.
    const [r, g, b] = rgbOf(mixHex(L.color, '#F6F0E2', 0.35));
    const pool = (alpha: number, reach: number) => {
      const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, reach);
      for (const [t, f] of FALLOFF) gr.addColorStop(t, `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * f).toFixed(4)})`);
      ctx.fillStyle = gr;
      ctx.fillRect(L.x - reach, L.y - reach, reach * 2, reach * 2);
    };
    // The light in the water.
    ctx.globalCompositeOperation = dark ? 'lighter' : 'screen';
    pool((dark ? 0.6 : 0.45) * s, R);
    // What it lights: brightened by its own colour, the dark left dark.
    ctx.globalCompositeOperation = 'overlay';
    pool((dark ? 0.75 : 0.4) * s, R * 0.75);
    // And a hot core where the light itself is.
    ctx.globalCompositeOperation = dark ? 'lighter' : 'screen';
    pool(0.5 * s, R * 0.18);
  }
  ctx.restore();
}

/* ---- Marine snow ---- */

/**
 * Marine snow at three distances, for a still: near, a few large soft
 * discs out of focus (bokeh), each with the faint brighter rim a lens gives
 * them; between, crisp specks, each a small ragged flake; far, fine dust.
 * Specks in a light come up brighter: `litBy(x, y)` says how lit a point is,
 * 0 to 1 (`godRayLight`, a glow's falloff, or both), and without it all are
 * as lit as each other. `density` scales the counts (1 is a sitting's
 * usual). On paper the specks get a breath of slate under them, since white
 * on pale water is otherwise lost. Deterministic from `seed`.
 */
export function drawSnowDeep(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: { seed: number; density: number; color: string; px: number; dark: boolean; litBy?: (x: number, y: number) => number },
): void {
  if (w <= 0 || h <= 0 || !(o.density > 0)) return;
  const px = Math.max(0.5, o.px);
  const r = mulberry32(hash32('snow-deep', o.seed));
  const css = (w * h) / (px * px);
  const lit = (x: number, y: number) => (o.litBy ? 0.45 + 1.0 * clamp01(o.litBy(x, y)) : 1);
  const [cr, cg, cb] = rgbOf(o.color);
  const BUCKETS = 10;
  const fillBuckets = (buckets: Path2D[], color: (a: number) => string) => {
    for (let k = 0; k < BUCKETS; k++) {
      ctx.fillStyle = color((k + 0.5) / BUCKETS);
      ctx.fill(buckets[k]);
    }
  };
  const bucketOf = (a: number) => Math.max(0, Math.min(BUCKETS - 1, Math.floor(a * BUCKETS)));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // Far: fine dust, a lot of it, barely there.
  {
    const n = Math.round((css / 380) * o.density);
    const buckets = Array.from({ length: BUCKETS }, () => new Path2D());
    for (let i = 0; i < n; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = px * (0.3 + 0.35 * r());
      const a = Math.min(1, (0.1 + 0.18 * r()) * lit(x, y));
      const p = buckets[bucketOf(a)];
      p.moveTo(x + rad, y);
      p.arc(x, y, rad, 0, TAU);
    }
    fillBuckets(buckets, (a) => (o.dark ? `rgba(${cr}, ${cg}, ${cb}, ${a})` : `rgba(70, 84, 82, ${a * 0.55})`));
  }

  // Between: crisp flakes, ragged, a few with a tail.
  {
    const n = Math.round((css / 2600) * o.density);
    const under = Array.from({ length: BUCKETS }, () => new Path2D());
    const over = Array.from({ length: BUCKETS }, () => new Path2D());
    for (let i = 0; i < n; i++) {
      const x = r() * w;
      const y = r() * h;
      const size = px * (0.6 + 1.6 * Math.pow(r(), 2.2));
      const a = Math.min(1, (0.3 + 0.5 * r()) * lit(x, y));
      const sides = 8 + Math.floor(r() * 3);
      const turn = r() * TAU;
      const stretch = 1 + r() * 0.6;
      const pts: number[] = [];
      for (let k = 0; k < sides; k++) {
        const ang = turn + (k / sides) * TAU;
        const rad = size * (0.75 + 0.35 * r());
        pts.push(x + Math.cos(ang) * rad * stretch, y + Math.sin(ang) * rad);
      }
      const add = (p: Path2D, ox: number, oy: number) => {
        p.moveTo(pts[0] + ox, pts[1] + oy);
        for (let k = 2; k < pts.length; k += 2) p.lineTo(pts[k] + ox, pts[k + 1] + oy);
        p.closePath();
      };
      add(over[bucketOf(a)], 0, 0);
      if (!o.dark) add(under[bucketOf(a)], px * 0.5, px * 0.6);
      if (r() < 0.15) {
        // A trailing wisp: snow is clumped stuff, mucus and all.
        const tail = size * (2 + r() * 3);
        const ang = -Math.PI / 2 + (r() - 0.5) * 1.2;
        const p = over[bucketOf(a * 0.5)];
        p.moveTo(x, y);
        p.lineTo(x + Math.cos(ang) * tail - px * 0.3, y + Math.sin(ang) * tail);
        p.lineTo(x + Math.cos(ang) * tail + px * 0.3, y + Math.sin(ang) * tail);
        p.closePath();
      }
    }
    if (!o.dark) fillBuckets(under, (a) => `rgba(52, 64, 62, ${a * 0.4})`);
    fillBuckets(over, (a) => `rgba(${cr}, ${cg}, ${cb}, ${a})`);
  }

  // Near: a few big soft discs, out of focus, drifting past the lens.
  {
    const n = Math.max(1, Math.round((css / 150000) * o.density * (0.7 + 0.6 * r())));
    for (let i = 0; i < n; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = px * (10 + 34 * Math.pow(r(), 1.5));
      const a = Math.min(0.3, (0.03 + 0.05 * r()) * lit(x, y) * (o.dark ? 1 : 1.5));
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const c = o.dark ? `${cr}, ${cg}, ${cb}` : '255, 255, 252';
      g.addColorStop(0, `rgba(${c}, ${a * 0.75})`);
      g.addColorStop(0.7, `rgba(${c}, ${a * 0.9})`);
      g.addColorStop(0.86, `rgba(${c}, ${a})`);
      g.addColorStop(1, `rgba(${c}, 0)`);
      ctx.fillStyle = g;
      ctx.globalCompositeOperation = o.dark ? 'lighter' : 'screen';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ---- Dither ---- */

/**
 * Banding: a whisper of noise over the whole canvas so dark gradients never
 * step. Each channel moves by up to about 1.5/255 (a triangular spread, so
 * the mean is untouched), keyed on the pixel's place in the picture rather
 * than on the canvas: a picture drawn in strips under a translation comes
 * out the same as one drawn whole. Works in bands of rows to keep memory
 * down on a poster.
 */
export function dither(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  let ox = 0;
  let oy = 0;
  try {
    const m = ctx.getTransform();
    ox = Math.round(m.e);
    oy = Math.round(m.f);
  } catch {
    // No transform to read: the canvas is the picture.
  }
  // The picture's [0, w) x [0, h) on the canvas.
  const x0 = Math.max(0, ox);
  const y0 = Math.max(0, oy);
  const x1 = Math.min(cw, Math.ceil(ox + w));
  const y1 = Math.min(ch, Math.ceil(oy + h));
  if (x1 <= x0 || y1 <= y0) return;
  const s = hash32('dither', seed) | 0;
  const BAND = 256;
  for (let by = y0; by < y1; by += BAND) {
    const bh = Math.min(BAND, y1 - by);
    let img: ImageData;
    try {
      img = ctx.getImageData(x0, by, x1 - x0, bh);
    } catch {
      return;
    }
    const d = img.data;
    const rw = x1 - x0;
    for (let j = 0; j < bh; j++) {
      const py = by + j - oy;
      for (let i = 0; i < rw; i++) {
        const pxl = x0 + i - ox;
        // An integer hash of the picture's pixel: two uniform draws, summed,
        // for a triangular spread about nought.
        let k = Math.imul(pxl, 0x27d4eb2d) ^ Math.imul(py, 0x165667b1) ^ s;
        k ^= k >>> 15;
        k = Math.imul(k, 0x85ebca6b);
        k ^= k >>> 13;
        k = Math.imul(k, 0xc2b2ae35);
        k ^= k >>> 16;
        const a = (k & 255) + ((k >>> 8) & 255);
        const b = ((k >>> 16) & 255) + ((k >>> 24) & 255);
        const n1 = ((a - 255) / 255) * 1.5;
        const n2 = ((b - 255) / 255) * 1.5;
        const at = (j * rw + i) * 4;
        // Light and colour both: one draw for the brightness, a smaller
        // second one apart for the channels, so no hue swims in.
        d[at] += Math.round(n1 + n2 * 0.3);
        d[at + 1] += Math.round(n1);
        d[at + 2] += Math.round(n1 - n2 * 0.3);
      }
    }
    ctx.putImageData(img, x0, by);
  }
}

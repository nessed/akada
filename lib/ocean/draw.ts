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
import type { Water } from './palette';
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

/**
 * Light coming down from the surface in slanting shafts, swaying a little.
 * Only in the sunlit water; they thin out and are gone by the twilight.
 */
export function drawShafts(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  env: Env,
  water: Water,
  ambient: number,
) {
  if (water.light <= 0.02) return;
  ctx.save();
  for (let i = 0; i < env.shafts; i++) {
    const r = mulberry32(hash32('shaft', i, env.shafts));
    const x = w * ((i + 0.3 + r() * 0.4) / env.shafts) + Math.sin(ambient / 9 + i) * w * 0.015;
    const top = (18 + r() * 40) * (w / 1000);
    const bottom = top * (2.6 + r() * 1.6);
    const reach = h * (0.55 + r() * 0.4);
    const lean = env.shaftTilt * reach;
    const g = ctx.createLinearGradient(0, 0, 0, reach);
    const a = 0.1 * water.light * (0.6 + 0.4 * r());
    g.addColorStop(0, `rgba(255, 252, 240, ${a})`);
    g.addColorStop(1, 'rgba(255, 252, 240, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - top / 2, 0);
    ctx.lineTo(x + top / 2, 0);
    ctx.lineTo(x + lean + bottom / 2, reach);
    ctx.lineTo(x + lean - bottom / 2, reach);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
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

/**
 * Marine snow: specks drifting slowly up, and a little along with the
 * current. They never stop entirely, even on a break; a paused clock holds
 * them, since `ambient` stands still with it.
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
  for (const s of specks) {
    const rise = (s.y - ambient * 0.004 * s.v) % 1;
    const y = (rise < 0 ? rise + 1 : rise) * h;
    const drift = (s.x + ambient * 0.0015 * s.v * current) % 1;
    const x = (drift < 0 ? drift + 1 : drift) * w + Math.sin(ambient / 5 + s.x * 20) * 4 * px;
    const edge = Math.min(1, (y / h) * 6, ((h - y) / h) * 6);
    ctx.globalAlpha = s.o * edge;
    ctx.beginPath();
    ctx.arc(x, y, s.s * px * 0.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * The floor, once the abyss is reached: it rises into view over the first
 * minutes of the zone and then stays, a dark line of silt with vents here
 * and there breathing a little.
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
  const into = depth.zone === 3 ? Math.min(1, (focusSeconds / 60 - 110) / 6) : 1;
  const ease = 1 - (1 - into) * (1 - into);
  const base = h * (1.04 - 0.1 * ease);
  const ground = mixHex(water.bottom, '#000000', 0.35);
  const edge = mixHex(water.bottom, '#FFFFFF', 0.12);
  ctx.save();
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * w;
    const y = base + Math.sin(i * 1.7 + env.shafts) * 6 * px + Math.sin(i * 0.6) * 10 * px;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.2 * px;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  if (env.vents) {
    ctx.globalAlpha = 1;
    for (let v = 0; v < 2; v++) {
      const x = w * (0.22 + v * 0.55);
      const y = base + Math.sin(v * 3.1) * 6 * px;
      ctx.fillStyle = ground;
      ctx.beginPath();
      ctx.moveTo(x - 10 * px, y + 4 * px);
      ctx.lineTo(x - 4 * px, y - 26 * px);
      ctx.lineTo(x + 4 * px, y - 26 * px);
      ctx.lineTo(x + 10 * px, y + 4 * px);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.stroke();
      // Its breath: a few specks rising off the top, on the slow clock.
      ctx.fillStyle = edge;
      for (let k = 0; k < 6; k++) {
        const t = ((ambient / 4 + k / 6 + v * 0.3) % 1 + 1) % 1;
        ctx.globalAlpha = 0.35 * (1 - t);
        ctx.beginPath();
        ctx.arc(x + Math.sin(t * 6 + k) * 6 * px, y - 26 * px - t * 60 * px, (1 + t * 2) * px, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
    ctx.scale(v.dir, 1);
    if (g.plan === 'ray') {
      const flap = 1 + 0.1 * Math.sin(ambient * 2 + v.phase);
      ctx.scale(1, flap);
      ctx.drawImage(sprite.canvas, -w / 2, -h / 2);
    } else if (strips > 1 && !v.species.floor) {
      const n = g.plan === 'eel' ? strips * 2 : strips;
      const sw = w / n;
      const amp = v.len * (g.plan === 'eel' ? 0.07 : 0.035) * px;
      const speed = 3 + 2 * v.species.speed;
      for (let i = 0; i < n; i++) {
        // Strip 0 is the tail end, since every sprite faces right.
        const tail = 1 - i / n;
        const off = Math.sin(ambient * speed + v.phase - i * 0.9) * amp * tail * tail;
        ctx.drawImage(sprite.canvas, i * sw, 0, sw + 1, h, -w / 2 + i * sw, -h / 2 + off, sw + 1, h);
      }
    } else {
      ctx.drawImage(sprite.canvas, -w / 2, -h / 2);
    }
  }
  ctx.restore();
}

/**
 * The surface from below, for the first minute and a half: a bright,
 * rippling ceiling at the top of the water that rises out of view as the
 * sitting goes under. After that the only way to know the surface is there
 * is the light.
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
  const line = h * (0.08 - 0.3 * ease);
  if (line < -h * 0.2) return;
  ctx.save();
  ctx.globalAlpha = 1 - ease;
  const g = ctx.createLinearGradient(0, line - 20 * px, 0, line + 90 * px);
  g.addColorStop(0, 'rgba(255, 252, 240, 0.34)');
  g.addColorStop(1, 'rgba(255, 252, 240, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, Math.max(0, line + 90 * px));
  // The underside of the waves: a bright line that never lies flat.
  ctx.strokeStyle = 'rgba(255, 252, 240, 0.55)';
  ctx.lineWidth = 1.4 * px;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * w;
    const y = line + Math.sin(i * 0.9 + ambient * 1.3) * 3 * px + Math.sin(i * 0.37 - ambient * 0.8) * 5 * px;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
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

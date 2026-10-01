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
import { kelpInk, type KelpInk, type Water } from './palette';
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

/** Where the floor's silt line sits, in device pixels: rising into view over
    the first minutes of the abyss, then staying. Below the page before then. */
export function floorLine(depth: Depth, focusSeconds: number, h: number): number {
  if (depth.zone < 3) return h * 1.04;
  const into = depth.zone === 3 ? Math.min(1, (focusSeconds / 60 - 110) / 6) : 1;
  const ease = 1 - (1 - into) * (1 - into);
  return h * (1.04 - 0.1 * ease);
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
  const base = floorLine(depth, focusSeconds, h);
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

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The kelp forest at the edges of the sunlit water (see `kelp.ts`): the
 * ledges, then the stalks standing on them, the ones further back first.
 * Each stalk sways on the slow clock, the sway travelling up it and growing
 * toward the top, and leans with the current; each blade flutters a little
 * on its own. `detail` is the governor's say: without it the blades lose
 * their ruffle and the rock its shading.
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
) {
  if (!kelpInView(focusSeconds)) return;
  const down = kelpDescent(focusSeconds);
  const surface = surfaceAt(focusSeconds) * h;
  const ink = kelpInk(water.dark);
  // The light goes, and the colour with it.
  const fade = 0.45 + 0.55 * water.light;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ledge of kelp.ledges) drawLedge(ctx, w, h, ledge, down, water, px, 0.92 * fade, detail);
  for (const stalk of kelp.stalks) {
    const alpha = (stalk.layer === 1 ? 0.92 : 0.45) * fade;
    drawStalk(ctx, w, h, stalk, down, surface, ink, ambient, current, px, alpha, clear, detail);
  }
  ctx.restore();
}

function drawLedge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ledge: KelpLedge,
  down: number,
  water: Water,
  px: number,
  alpha: number,
  detail: boolean,
) {
  const top = (ledge.top - down) * h;
  const thick = KELP_ROCK * h;
  if (top > h * 1.05 || top + thick < 0) return;
  // Inward from its own edge of the page.
  const s = ledge.edge < 0 ? 1 : -1;
  const x0 = ledge.edge < 0 ? -0.03 * w : 1.03 * w;
  const span = (ledge.reach + 0.03) * w;
  const X = (f: number) => x0 + s * span * f;
  const rock = water.dark ? mixHex(water.bottom, '#000000', 0.28) : mixHex(water.bottom, '#6B6459', 0.42);
  const line = water.dark ? mixHex(water.bottom, '#FFFFFF', 0.16) : mixHex(water.bottom, '#1A1714', 0.55);
  // Boulders along the top: a run of low humps, then the lip rolling over.
  const n = ledge.bumps.length;
  const topAt = (i: number) => top - (0.5 + 0.5 * ledge.bumps[i]) * 7 * px;
  const crest = new Path2D();
  crest.moveTo(X(0), topAt(0));
  for (let i = 0; i < n - 1; i++) {
    const fa = (i / (n - 1)) * 0.88;
    const fb = ((i + 1) / (n - 1)) * 0.88;
    crest.quadraticCurveTo(X((fa + fb) / 2), Math.min(topAt(i), topAt(i + 1)) - 5 * px, X(fb), topAt(i + 1));
  }
  crest.bezierCurveTo(X(0.97), top, X(1.01), top + thick * 0.12, X(0.97), top + thick * 0.3);
  // The rock under it is a wash that bleeds away into the water, the way a
  // brush runs dry: no underside, so the reef has no bottom to draw.
  const body = new Path2D(crest);
  body.bezierCurveTo(X(0.95), top + thick * 0.55, X(0.9), top + thick * 0.8, X(0.86), top + thick);
  body.lineTo(X(0), top + thick);
  body.closePath();
  const g = ctx.createLinearGradient(0, top, 0, top + thick);
  g.addColorStop(0, rock);
  g.addColorStop(0.35, rock);
  g.addColorStop(1, `${rock}00`);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.globalAlpha = alpha * 0.75;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.2 * px;
  ctx.stroke(crest);
  ctx.clip(body);
  if (detail) {
    // Engraved shading down the face of the lip, the way the jelly's bell is shaded.
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const f = 0.9 - i * 0.022;
      ctx.moveTo(X(f), top + thick * (0.12 + i * 0.015));
      ctx.lineTo(X(f - 0.01), top + thick * (0.34 + i * 0.03));
    }
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
  }
  // Stipple near the top, where there is still rock to see.
  ctx.fillStyle = line;
  for (const d of ledge.specks) {
    const depth = 0.04 + d.y * 0.4;
    ctx.globalAlpha = alpha * 0.45 * (1 - depth / 0.5);
    ctx.beginPath();
    ctx.arc(X(d.x * 0.88), top + thick * depth, d.r * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStalk(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stalk: KelpStalk,
  down: number,
  surface: number,
  ink: KelpInk,
  ambient: number,
  current: number,
  px: number,
  alpha: number,
  clear: Rect[] | undefined,
  detail: boolean,
) {
  // Only the part of the stalk that is on the page.
  const t0 = Math.max(0, (stalk.base - down - 1.06) / stalk.height);
  const t1 = Math.min(1, (stalk.base - down + 0.06) / stalk.height);
  if (t0 >= t1) return;
  const at = (t: number) => {
    const d = t * stalk.height;
    const give = Math.min(1, d / 1.1);
    const sway =
      (Math.sin(ambient * 0.42 + stalk.phase - d * 2.4) * 0.026 +
        Math.sin(ambient * 0.9 + stalk.phase * 1.7 - d * 5) * 0.008) *
      h *
      give;
    const x = stalk.x * w + sway + current * 0.05 * w * give * give;
    const y = (stalk.base - d - down) * h;
    // Longer than the water is deep: the rest lies along the surface as
    // canopy, going the way the current does.
    if (y >= surface) return { x, y };
    return { x: x + current * (surface - y), y: surface + 2 * px + Math.sin(ambient * 1.3 + d * 9) * 1.5 * px };
  };
  const near = stalk.layer === 1;
  const scale = near ? 1 : 0.75;

  const inClear = (x: number, y: number) => {
    if (!clear) return false;
    const u = x / w;
    const v = y / h;
    return clear.some((r) => u > r.x && u < r.x + r.w && v > r.y && v < r.y + r.h);
  };

  // The stalk: a wash under a line of ink, and near ones inked twice, the
  // second pass fainter and just off the first, as the jelly's outline is.
  // Like the blades, it goes faint where it crosses what is written.
  const steps = Math.max(2, Math.ceil((t1 - t0) * stalk.height * 40));
  const stem = new Path2D();
  const stemFaint = new Path2D();
  let prev = at(t0);
  let prevInside: boolean | null = null;
  for (let i = 1; i <= steps; i++) {
    const p = at(t0 + ((t1 - t0) * i) / steps);
    const inside = inClear((p.x + prev.x) / 2, (p.y + prev.y) / 2);
    const path = inside ? stemFaint : stem;
    if (inside !== prevInside) path.moveTo(prev.x, prev.y);
    path.lineTo(p.x, p.y);
    prev = p;
    prevInside = inside;
  }
  for (const [path, a] of [[stem, alpha], [stemFaint, alpha * 0.3]] as const) {
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = 3 * px * scale;
    ctx.stroke(path);
    ctx.globalAlpha = a;
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.1 * px * scale;
    ctx.stroke(path);
  }
  if (detail && near) {
    ctx.save();
    ctx.translate(0.9 * px, 0.4 * px);
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(stem);
    ctx.restore();
  }

  // The holdfast, when the foot of the stalk is on the page: roots gripping
  // the top of the ledge.
  if (t0 === 0) {
    const foot = at(0);
    ctx.beginPath();
    for (const a of stalk.roots) {
      const dx = Math.sin(a) * 13 * px * scale;
      ctx.moveTo(foot.x, foot.y - 2 * px);
      ctx.quadraticCurveTo(foot.x + dx * 0.4, foot.y + 1 * px, foot.x + dx, foot.y + (3 + Math.abs(a) * 3) * px);
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1 * px * scale;
    ctx.stroke();
  }

  // The blades, each off a little float, in two batches: plain, and faint
  // where they cross what is written on the page. A blade is a long ribbon,
  // curled along its length, crinkled down its fuller edge when there is the
  // time to draw it.
  const plain = new Path2D();
  const faint = new Path2D();
  const floats = new Path2D();
  const SEG = detail ? 8 : 4;
  const edgeA: [number, number][] = [];
  const edgeB: [number, number][] = [];
  for (let j = 0; j < stalk.blades.length; j++) {
    const b = stalk.blades[j];
    if (b.t < t0 || b.t > t1) continue;
    const p = at(b.t);
    if (p.y < -60 * px || p.y > h + 60 * px) continue;
    const q = at(Math.min(1, b.t + 0.01));
    const up = Math.atan2(q.y - p.y, q.x - p.x);
    const flutter = Math.sin(ambient * 1.1 + stalk.phase + j * 1.3) * 0.1;
    const a = up + b.side * b.angle + current * 0.15 + flutter;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Across the blade, toward its fuller side.
    const nx = -dy * b.side;
    const ny = dx * b.side;
    const len = b.len * px * scale;
    const wid = b.width * px * scale;
    const fx = p.x + dx * 3 * px * scale;
    const fy = p.y + dy * 3 * px * scale;
    const rx = 2.2 * px * scale;
    floats.moveTo(fx + dx * rx, fy + dy * rx);
    floats.ellipse(fx, fy, rx, 1.6 * px * scale, a, 0, Math.PI * 2);
    const bx = p.x + dx * 5 * px * scale;
    const by = p.y + dy * 5 * px * scale;
    const curl = (b.curl + Math.sin(ambient * 0.7 + j) * 0.05) * len;
    edgeA.length = 0;
    edgeB.length = 0;
    for (let k = 0; k <= SEG; k++) {
      const u = k / SEG;
      const cx = bx + dx * len * u + nx * curl * u * u;
      const cy = by + dy * len * u + ny * curl * u * u;
      // Widest a third of the way along, tapering long to the tip.
      const body = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8) * wid;
      const crinkle = detail && k > 0 && k < SEG ? (k % 2 ? 0.3 : -0.12) * body : 0;
      edgeA.push([cx + nx * (body * 1.15 + crinkle), cy + ny * (body * 1.15 + crinkle)]);
      edgeB.push([cx - nx * body * 0.85, cy - ny * body * 0.85]);
    }
    const path = inClear(p.x, p.y) ? faint : plain;
    path.moveTo(bx, by);
    for (let k = 1; k <= SEG; k++) {
      const [ax, ay] = edgeA[k - 1];
      const [cx, cy] = edgeA[k];
      path.quadraticCurveTo(ax, ay, (ax + cx) / 2, (ay + cy) / 2);
    }
    path.lineTo(edgeA[SEG][0], edgeA[SEG][1]);
    for (let k = SEG - 1; k >= 0; k--) {
      const [ax, ay] = edgeB[k + 1];
      const [cx, cy] = edgeB[k];
      path.quadraticCurveTo(ax, ay, (ax + cx) / 2, (ay + cy) / 2);
    }
    path.closePath();
  }
  ctx.lineWidth = 0.9 * px * scale;
  ctx.fillStyle = ink.body;
  ctx.strokeStyle = ink.ink;
  ctx.globalAlpha = alpha * 0.85;
  ctx.fill(plain);
  ctx.globalAlpha = alpha;
  ctx.stroke(plain);
  ctx.globalAlpha = alpha * 0.3;
  ctx.fill(faint);
  ctx.stroke(faint);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ink.float;
  ctx.fill(floats);
  ctx.lineWidth = 0.8 * px * scale;
  ctx.stroke(floats);
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

/** Where the surface is, as a share of the page's height: near the top at
    the start, and gone up out of view after a minute and a half. */
export function surfaceAt(focusSeconds: number): number {
  const t = Math.max(0, Math.min(1, focusSeconds / 90));
  return 0.08 - 0.3 * t * t * (3 - 2 * t);
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
  const line = h * surfaceAt(focusSeconds);
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

/* ---- The rare things. Each takes how far through it is, 0 to 1, and its
   own seed, and is drawn straight in; none of them is a sprite. ---- */

/** In and out softly, so nothing arrives in a flash. */
function envelope(age: number, rise: number, fall: number): number {
  return Math.max(0, Math.min(1, age / rise, (1 - age) / fall));
}

/**
 * A whale, far overhead: only its shadow against the light, going the way
 * the water goes, slowly, across the whole page.
 */
export function drawWhale(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, dir: 1 | -1, px: number, ambient: number, dark: boolean) {
  const len = Math.max(w, h) * 0.62;
  const travel = w + len * 2;
  const x = dir > 0 ? -len + age * travel : w + len - age * travel;
  const y = h * (0.1 + ((seed >>> 8) % 100) / 100 * 0.12);
  const a = envelope(age, 0.15, 0.15) * (dark ? 0.2 : 0.16);
  const fluke = Math.sin(ambient * 0.9) * len * 0.03;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = dark ? '#000000' : '#2A3438';
  ctx.filter = `blur(${3 * px}px)`;
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.beginPath();
  // Head at +x, tail stock tapering to -x, flukes at the end.
  ctx.moveTo(len * 0.5, 0);
  ctx.bezierCurveTo(len * 0.48, -len * 0.09, len * 0.1, -len * 0.11, -len * 0.3, -len * 0.04);
  ctx.quadraticCurveTo(-len * 0.44, -len * 0.01 + fluke * 0.3, -len * 0.48, fluke * 0.5);
  ctx.lineTo(-len * 0.6, -len * 0.07 + fluke);
  ctx.quadraticCurveTo(-len * 0.55, fluke, -len * 0.6, len * 0.07 + fluke);
  ctx.lineTo(-len * 0.48, len * 0.01 + fluke * 0.5);
  ctx.quadraticCurveTo(-len * 0.44, len * 0.02, -len * 0.3, len * 0.05);
  ctx.bezierCurveTo(len * 0.1, len * 0.12, len * 0.46, len * 0.08, len * 0.5, 0);
  ctx.fill();
  // A pectoral fin, hanging down.
  ctx.beginPath();
  ctx.moveTo(len * 0.22, len * 0.07);
  ctx.quadraticCurveTo(len * 0.12, len * 0.22, len * 0.02, len * 0.2);
  ctx.quadraticCurveTo(len * 0.1, len * 0.12, len * 0.14, len * 0.07);
  ctx.fill();
  ctx.restore();
}

/**
 * The water lighting up: a cloud of tiny animals flashing, slowly spreading
 * out from somewhere to one side. It comes up over seconds, never at once.
 */
export function drawStorm(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number) {
  const env = envelope(age, 0.12, 0.3);
  if (env <= 0) return;
  const cx = w * (0.25 + ((seed >>> 4) % 100) / 100 * 0.5);
  const cy = h * (0.35 + ((seed >>> 12) % 100) / 100 * 0.35);
  const spread = Math.max(w, h) * (0.2 + age * 0.35);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A haze first, then the points.
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, spread);
  g.addColorStop(0, `rgba(120, 214, 200, ${0.2 * env})`);
  g.addColorStop(1, 'rgba(120, 214, 200, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  let s = seed || 1;
  const next = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
  for (let i = 0; i < 320; i++) {
    const ang = next() * Math.PI * 2;
    const rad = Math.sqrt(next()) * spread;
    const period = 1.5 + next() * 3;
    const off = next() * period;
    const b = ((ambient + off) % period) / period;
    const flash = Math.exp(-b * 8);
    const x = cx + Math.cos(ang) * rad + Math.sin(ambient * 0.3 + i) * 6 * px;
    const y = cy + Math.sin(ang) * rad * 0.7 + Math.cos(ambient * 0.25 + i) * 6 * px;
    const r = (1.1 + flash * 2.6) * px;
    ctx.globalAlpha = env * (0.3 + 0.7 * flash);
    ctx.fillStyle = i % 5 === 0 ? '#C9F2FF' : '#8EF0D2';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * An eye at the edge of the page, bigger than anything else in the water,
 * that opens, looks, blinks once, and is gone. The rest of the animal is
 * never seen.
 */
export function drawEye(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, dark: boolean) {
  const env = envelope(age, 0.25, 0.25);
  if (env <= 0) return;
  const left = seed % 2 === 0;
  const r = Math.min(w, h) * 0.2;
  const cx = left ? -r * 0.3 : w + r * 0.3;
  // High on the page, clear of the clock and the controls.
  const cy = h * (0.18 + ((seed >>> 6) % 100) / 100 * 0.2);
  // One slow blink, just past the middle.
  const lid = age > 0.55 && age < 0.65 ? Math.sin(((age - 0.55) / 0.1) * Math.PI) : 0;
  const open = 1 - lid * 0.92;
  ctx.save();
  ctx.globalAlpha = env * (dark ? 0.75 : 0.65);
  ctx.translate(cx, cy);
  ctx.scale(1, open);
  // Skin round it, then the eye.
  const skin = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.6);
  skin.addColorStop(0, dark ? 'rgba(90, 40, 36, 0.9)' : 'rgba(120, 70, 60, 0.7)');
  skin.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark ? '#A89F8C' : '#D9D0BB';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3B4A4E';
  ctx.beginPath();
  ctx.arc(left ? r * 0.12 : -r * 0.12, 0, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0B0B0A';
  ctx.beginPath();
  ctx.ellipse(left ? r * 0.16 : -r * 0.16, 0, r * 0.2, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(left ? r * 0.35 : r * 0.1, -r * 0.3, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1A1815';
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
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

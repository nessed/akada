/**
 * Four rare sightings for the trench, each something a lander's camera has
 * really caught down there:
 *
 * - a fish fall: a dead fish sinks to the floor, the amphipods come in from
 *   every side and cover it, the snailfish arrive to pick the amphipods
 *   off, and when they all go there is a skeleton;
 * - a slide of silt: a cloud comes down off the wall and rolls across the
 *   floor, the water goes thick, and it settles again;
 * - a supergiant amphipod, a hand long, walking across the ooze;
 * - a gathering of snailfish, dozens hanging low over one spot.
 *
 * Like the other sightings, each is drawn straight in, in device pixels,
 * from how far through it is, its own seed and the slow clock, and nothing
 * here reads the clock or `Math.random`. The animals in them are the sea's
 * own, rolled from genomes and inked by the same sprites as everything that
 * swims by, so a sighting's snailfish is the trench's snailfish.
 */

import { mixHex } from '../fan';
import { rollGenome, settle, type Genome } from './genome';
import { drained, IRON_GALL } from './palette';
import { inkLine } from './pen';
import type { Species } from './pool';
import { hash32, mulberry32 } from './random';
import { SpriteCache, type Sprite } from './sprites';

function envelope(age: number, rise: number, fall: number): number {
  return Math.max(0, Math.min(1, age / rise, (1 - age) / fall));
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function smooth(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/* ---- The animals in them ---- */

let sprites: SpriteCache | null = null;
const kinds = new Map<string, Species>();

/** A species for a sighting, made once and kept, so its sprite is inked once. */
function speciesFor(tag: string, seed: number, make: (s: number) => Genome): Species {
  const id = `sighting:${tag}:${seed}`;
  let sp = kinds.get(id);
  if (!sp) {
    const s = hash32(tag, seed);
    sp = { id, seed: s, zone: 4, leg: 0, genome: make(s), name: '', abundance: 1, school: 0, curious: false, speed: 1, floor: false, blink: 3, regular: false };
    kinds.set(id, sp);
    if (kinds.size > 24) kinds.delete(kinds.keys().next().value as string);
  }
  return sp;
}

/** An amphipod of the trench: pale, solid enough to read when small. */
function amphipodGenome(s: number, big = false): Genome {
  const g = settle(rollGenome(s, 0.99, 'crawler'), false);
  g.clear = false;
  g.hue = big ? 1 : [3, 8][s % 2];
  return g;
}

function snailGenome(s: number): Genome {
  return rollGenome(s, 0.98, 'fish', 'snailfish');
}

/** The fish that falls: a mackerel's lines, silver, as bait falls. */
function carcassGenome(s: number): Genome {
  const g = rollGenome(s, 0.1, 'fish', 'jack');
  g.hue = 8;
  g.pattern = 'none';
  return g;
}

/** A sprite placed by its middle, facing `dir`, turned by `rot`. */
function put(ctx: CanvasRenderingContext2D, s: Sprite | null, x: number, y: number, dir: number, rot: number, alpha: number) {
  if (!s || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.rotate(rot);
  ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2);
  ctx.restore();
}

function spriteOf(sp: Species, len: number, dark: boolean, px: number): Sprite | null {
  sprites ??= new SpriteCache(12e6);
  return sprites.get(sp, Math.max(6, len / px), dark, px);
}

/** A soft round of silt, made once a colour and only placed. */
const puffs = new Map<string, HTMLCanvasElement>();
function puff(color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let c = puffs.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `${color}CC`);
    gr.addColorStop(0.45, `${color}77`);
    gr.addColorStop(1, `${color}00`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    puffs.set(color, c);
  }
  return c;
}

function siltOf(dark: boolean): string {
  return drained(dark ? '#8A7A64' : '#9C8C74', 0.6);
}

/* ---- A fish fall ---- */

/**
 * A dead fish sinks and lands on its side; over the next minute the
 * amphipods arrive from every side and cover it, the snailfish come in low
 * and pick at them, and as they leave the fish is bones. `floorY` is the
 * floor's line, in device px.
 */
export function drawFishFall(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean, floorY: number): void {
  const env = envelope(age, 0.03, 0.08);
  if (env <= 0) return;
  const r = mulberry32(seed ^ 0xf15f);
  const cx = w * (0.32 + 0.36 * r());
  const dir = r() < 0.5 ? -1 : 1;
  const S = Math.min(w, h) * 0.2;
  const rest = floorY - S * 0.06;
  ctx.save();
  ctx.globalAlpha *= env;

  // The fall, slow, turning onto its side, and the puff where it lands.
  const fall = smooth(age / 0.1);
  const fy = rest - (1 - fall) * h * 0.55;
  const fx = cx + (1 - fall) * dir * S * 0.4;
  const rot = (1 - fall) * 0.5 * Math.sin(ambient * 0.7) + 0.06 * dir;
  const silt = siltOf(dark);
  const land = clamp01((age - 0.09) / 0.12);
  if (land > 0 && land < 1) {
    const p = puff(silt);
    if (p) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 4 - 0.5) * 2.4;
        const rad = S * (0.25 + 0.6 * land);
        ctx.globalAlpha = env * 0.45 * (1 - land);
        ctx.drawImage(p, cx + Math.sin(a) * rad - rad * 0.6, rest - Math.cos(a) * rad * 0.35 - rad * 0.4, rad * 1.2, rad * 0.8);
      }
    }
    ctx.globalAlpha = env;
  }

  // The fish: whole until the amphipods have had it, then less and less of
  // it, and the bones showing through.
  const flesh = 1 - smooth((age - 0.42) / 0.36);
  const bones = smooth((age - 0.4) / 0.35);
  const carcass = speciesFor('fall', seed, carcassGenome);
  put(ctx, spriteOf(carcass, S, dark, px), fx, fy, dir, rot + Math.PI * 0.02, flesh);
  if (bones > 0) {
    const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
    const bone = dark ? '#D8CFBB' : '#E6DDC8';
    const x0 = cx - dir * S * 0.48;
    const x1 = cx + dir * S * 0.36;
    const spine = [x0, rest - S * 0.01, cx, rest - S * 0.035, x1, rest - S * 0.02];
    ctx.globalAlpha = env * bones;
    inkLine(ctx, spine, false, { width: Math.max(1, S * 0.012), color: bone, alpha: 0.9, taper: [0.2, 0.1], seed, min: 0.5 * px });
    // Ribs along the front half of the spine, curving down to the floor.
    for (let q = 0; q < 9; q++) {
      const u = 0.35 + q * 0.06;
      const bx = x0 + (x1 - x0) * u;
      const by = rest - S * 0.03;
      inkLine(ctx, [bx, by, bx - dir * S * 0.02, by + S * 0.04, bx - dir * S * 0.035, by + S * 0.07], false, { width: Math.max(0.6, S * 0.006), color: bone, alpha: 0.85, taper: [0, 0.4], seed: seed + q, min: 0.3 * px });
    }
    // The skull, an outline and its eye socket.
    const skull = [x1, rest - S * 0.07, x1 + dir * S * 0.1, rest - S * 0.04, x1 + dir * S * 0.12, rest, x1, rest + S * 0.02];
    inkLine(ctx, skull, true, { width: Math.max(0.6, S * 0.007), color: bone, alpha: 0.85, seed: seed + 99, min: 0.3 * px });
    ctx.beginPath();
    ctx.arc(x1 + dir * S * 0.07, rest - S * 0.03, S * 0.012, 0, Math.PI * 2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.4, 0.5 * px);
    ctx.globalAlpha = env * bones * 0.6;
    ctx.stroke();
    ctx.globalAlpha = env;
  }

  // The amphipods: in from every side along curving paths, onto the fish,
  // busy there, then off again.
  const amph = speciesFor('fall-amphipod', seed, (s) => amphipodGenome(s));
  const n = 70 + Math.floor(r() * 40);
  const small = spriteOf(amph, S * 0.08, dark, px);
  for (let i = 0; i < n; i++) {
    const ri = mulberry32(hash32(seed, 'amphipod', i));
    const arrive = 0.1 + 0.42 * Math.pow(ri(), 0.8);
    const leave = 0.8 + 0.17 * ri();
    if (age < arrive - 0.12 || age > leave + 0.1) continue;
    // Where on the fish it settles.
    const u = ri() - 0.5;
    const v = ri();
    const sx = cx + dir * u * S * 0.9;
    const sy = rest - S * 0.03 - v * S * 0.08 * (1 - Math.abs(u) * 1.4) * (0.4 + 0.6 * (1 - bones));
    // Where it came from: off along a ray, low over the floor or down from above.
    const a = Math.PI * (1 + ri());
    const far = Math.max(w, h) * (0.3 + 0.3 * ri());
    const ox = sx + Math.cos(a) * far;
    const oy = Math.min(floorY - S * 0.05, sy + Math.sin(a) * far * 0.5);
    let x: number;
    let y: number;
    let rot2 = (ri() - 0.5) * 1.2;
    let alpha = 1;
    const face = ri() < 0.5 ? -1 : 1;
    if (age < arrive) {
      const k = smooth((age - (arrive - 0.12)) / 0.12);
      const bend = Math.sin(k * Math.PI) * S * 0.25 * (ri() - 0.5);
      x = ox + (sx - ox) * k + bend;
      y = oy + (sy - oy) * k - Math.sin(k * Math.PI) * S * 0.1;
      alpha = k;
      rot2 = Math.atan2(sy - oy, (sx - ox) * face) * 0.5;
    } else if (age > leave) {
      const k = smooth((age - leave) / 0.1);
      x = sx + (ox - sx) * k * 0.6;
      y = sy + (oy - sy) * k * 0.6;
      alpha = 1 - k;
    } else {
      // Busy: a twitch about its spot.
      const ph = ri() * 6.28;
      x = sx + Math.sin(ambient * (2 + ri() * 2) + ph) * S * 0.012;
      y = sy + Math.cos(ambient * (2.5 + ri() * 2) + ph) * S * 0.008;
    }
    put(ctx, small, x, y, face, rot2, alpha);
  }

  // The snailfish: in low from the sides, hanging near, lunging at the
  // amphipods now and then.
  const snail = speciesFor('fall-snail', seed, snailGenome);
  const m = 4 + Math.floor(r() * 3);
  for (let i = 0; i < m; i++) {
    const ri = mulberry32(hash32(seed, 'snail', i));
    const arrive = 0.3 + 0.2 * ri();
    const leave = 0.82 + 0.1 * ri();
    if (age < arrive - 0.1 || age > leave + 0.1) continue;
    const side = i % 2 ? -1 : 1;
    const len = S * (0.42 + 0.2 * ri());
    const hx = cx + side * S * (0.55 + 0.5 * ri());
    const hy = rest - S * (0.15 + 0.3 * ri());
    const lunge = Math.max(0, Math.sin(ambient * (0.5 + ri() * 0.4) + ri() * 6.28)) ** 6;
    let x = hx - side * lunge * S * 0.25;
    const y = hy + lunge * S * 0.08 + Math.sin(ambient * 0.6 + i) * S * 0.04;
    let alpha = 1;
    if (age < arrive) {
      const k = smooth((age - (arrive - 0.1)) / 0.1);
      x = hx + side * (1 - k) * w * 0.5;
      alpha = k;
    } else if (age > leave) {
      const k = smooth((age - leave) / 0.1);
      x = hx + side * k * w * 0.5;
      alpha = 1 - k;
    }
    // Facing the fish, except as it goes.
    put(ctx, spriteOf(snail, len, dark, px), x, y, age > leave ? side : -side, 0.08 * lunge, alpha);
  }
  ctx.restore();
}

/* ---- A slide of silt ---- */

/**
 * A slide coming down off the wall: billows of silt pour out from one side
 * low over the floor and roll across it, rising and spreading as they go;
 * the lower water goes thick, then it settles.
 */
export function drawMudslide(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean, floorY: number): void {
  const env = envelope(age, 0.08, 0.3);
  if (env <= 0) return;
  const r = mulberry32(seed ^ 0x51de);
  const from = r() < 0.5 ? -1 : 1;
  const edge = from < 0 ? 0 : w;
  const silt = siltOf(dark);
  const water = dark ? '#1A1815' : '#FBF8EF';
  const p = puff(silt);
  ctx.save();

  // The water thickening over the floor.
  const thick = env * smooth((age - 0.1) / 0.35);
  const gr = ctx.createLinearGradient(0, floorY, 0, floorY - h * 0.6);
  gr.addColorStop(0, mixHex(silt, water, 0.2));
  gr.addColorStop(1, `${mixHex(silt, water, 0.2)}00`);
  ctx.globalAlpha = 0.55 * thick;
  ctx.fillStyle = gr;
  ctx.fillRect(0, floorY - h * 0.6, w, h * 0.6 + 2);

  // The billows: each born at the wall's foot, rolling out and rising.
  const n = 22;
  if (p) {
    for (let i = 0; i < n; i++) {
      const ri = mulberry32(hash32(seed, 'billow', i));
      const born = 0.04 + 0.5 * (i / n) + 0.04 * ri();
      const life = 0.35 + 0.2 * ri();
      const k = (age - born) / life;
      if (k <= 0 || k >= 1) continue;
      const reach = w * (0.35 + 0.45 * ri());
      const x = edge - from * reach * smooth(k) * (0.7 + 0.3 * k);
      const rise = h * (0.04 + 0.3 * ri()) * Math.pow(k, 0.8);
      const y = floorY - rise + Math.sin(ambient * 0.4 + i) * h * 0.01;
      const rad = h * (0.08 + 0.2 * ri()) * (0.5 + k);
      ctx.globalAlpha = env * 0.7 * Math.sin(Math.PI * k) * (0.6 + 0.4 * ri());
      ctx.drawImage(p, x - rad, y - rad * 0.75, rad * 2, rad * 1.5);
    }
  }
  // Grains carried in it, catching the light as specks.
  ctx.fillStyle = mixHex(silt, '#FFFFFF', dark ? 0.3 : 0);
  for (let i = 0; i < 160; i++) {
    const ri = mulberry32(hash32(seed, 'grain', i));
    const born = 0.06 + 0.55 * ri();
    const k = (age - born) / 0.4;
    if (k <= 0 || k >= 1) continue;
    const x = edge - from * w * (0.8 * ri() + 0.1) * smooth(k);
    const y = floorY - h * 0.3 * ri() * k + Math.sin(ambient + i) * 3 * px;
    ctx.globalAlpha = env * 0.5 * Math.sin(Math.PI * k);
    ctx.fillRect(x, y, Math.max(1, px), Math.max(1, px));
  }
  ctx.restore();
}

/* ---- A supergiant amphipod ---- */

/**
 * Alicella gigantea: an amphipod a hand long, pale, walking slowly across
 * the floor from one side to the other, its body bobbing with its steps,
 * kicking up a little silt.
 */
export function drawSupergiant(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean, floorY: number): void {
  const env = envelope(age, 0.1, 0.1);
  if (env <= 0) return;
  const r = mulberry32(seed ^ 0xa11ce);
  const dir = r() < 0.5 ? -1 : 1;
  const L = Math.min(w, h) * 0.3;
  const x0 = w * (0.5 - dir * 0.42);
  const x = x0 + dir * w * 0.84 * age;
  const step = Math.sin(ambient * 2.2 + seed);
  const y = floorY - L * 0.28 - Math.abs(step) * L * 0.015;
  ctx.save();
  ctx.globalAlpha *= env;
  // A little silt where its feet come down.
  const p = puff(siltOf(dark));
  if (p) {
    for (let k = 0; k < 4; k++) {
      const fx = x - dir * L * (0.25 - k * 0.12);
      const lift = Math.max(0, Math.sin(ambient * 2.2 + seed + k * 1.6));
      ctx.globalAlpha = env * 0.18 * lift;
      ctx.drawImage(p, fx - L * 0.06, floorY - L * 0.05, L * 0.12, L * 0.07);
    }
    ctx.globalAlpha = env;
  }
  const giant = speciesFor('giant', seed, (s) => amphipodGenome(s, true));
  put(ctx, spriteOf(giant, L, dark, px), x, y, dir, step * 0.015, 1);
  ctx.restore();
}

/* ---- A gathering of snailfish ---- */

/**
 * Dozens of snailfish come in low and hang over one spot on the floor, the
 * way they gather wherever there is food, milling slowly, two kinds among
 * them; then they drift off.
 */
export function drawSnailfishGathering(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, seed: number, px: number, ambient: number, dark: boolean, floorY: number): void {
  const env = envelope(age, 0.04, 0.06);
  if (env <= 0) return;
  const r = mulberry32(seed ^ 0x5a11);
  const cx = w * (0.3 + 0.4 * r());
  const n = 16 + Math.floor(r() * 12);
  const unit = Math.min(w, h);
  const a = speciesFor('gather-a', seed, snailGenome);
  const b = speciesFor('gather-b', seed, snailGenome);
  ctx.save();
  ctx.globalAlpha *= env;
  // Far ones first, so the near ones lie over them.
  const fish = Array.from({ length: n }, (_, i) => {
    const ri = mulberry32(hash32(seed, 'gather', i));
    return { i, ri, near: ri() };
  }).sort((p, q) => p.near - q.near);
  for (const { i, ri, near } of fish) {
    const arrive = 0.25 * ri();
    const leave = 0.72 + 0.24 * ri();
    if (age < arrive || age > leave + 0.12) continue;
    const len = unit * (0.045 + 0.06 * near);
    // Where it hangs: spread loosely round the spot, thickest over it, the
    // far ones higher up the water and smaller.
    const spread = (ri() + ri() - 1) * 0.5;
    const hx = cx + spread * w * 0.75;
    const hy = floorY - len * 0.7 - (0.03 + (1 - near) * 0.3 * ri()) * h;
    const side = hx < cx ? -1 : 1;
    const mill = ri() * 6.28;
    let x = hx + Math.sin(ambient * 0.18 + mill) * len * 0.6;
    const y = hy + Math.cos(ambient * 0.23 + mill) * len * 0.15;
    // Facing in toward the spot as it hangs, turning as it mills.
    let face = Math.cos(ambient * 0.18 + mill) > 0 ? 1 : -1;
    let alpha = 0.55 + 0.45 * near;
    const come = clamp01((age - arrive) / 0.1);
    if (come < 1) {
      x = hx + side * (1 - smooth(come)) * w * 0.6;
      face = -side;
      alpha *= come;
    } else if (age > leave) {
      const k = smooth((age - leave) / 0.12);
      x = hx + side * k * w * 0.6;
      face = side;
      alpha *= 1 - k;
    }
    put(ctx, spriteOf(i % 3 === 0 ? b : a, len, dark, px), x, y, face, 0, alpha);
  }
  ctx.restore();
}

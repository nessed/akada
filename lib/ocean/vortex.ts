/**
 * The great school of open water.
 *
 * Out where there is no rock, jacks and the like gather in a school of
 * hundreds and turn: a slow cylinder of fish milling round and round on the
 * spot, the near side of the turn going one way and the far side the other.
 * Open water (`Place.vortex`) has one turning in it from start to end, off
 * to one side and a little way off, so the blue is never only blue.
 *
 * Its fish are the place's own (the first schooling fish in the leg's pool,
 * inked by the sea's sprites), each a small sprite placed on the turn: the
 * near ones larger and darker, facing the way the turn carries them, the far
 * ones smaller and fainter, facing back. A pure function of the slow clock
 * and the sitting's key, like everything else; it eases in and out with its
 * leg.
 */

import { rollGenome } from './genome';
import { hash32, mulberry32 } from './random';
import type { Species } from './pool';
import type { Sprite } from './sprites';

/** Fish in the turn, full screen. */
const FISH = 210;
/** Radians a second: once round in a little over a minute. */
const TURN = 0.09;

interface Fish {
  /** Where round the turn, radians. */
  a: number;
  /** How high in the cylinder, -1 to 1. */
  v: number;
  /** A little nearer or further than the rest. */
  r: number;
  /** Its own small wobble. */
  ph: number;
}

const rolled = new Map<string, Fish[]>();

function fishOf(key: string): Fish[] {
  let f = rolled.get(key);
  if (!f) {
    const r = mulberry32(hash32(key, 'vortex'));
    f = Array.from({ length: FISH }, (_, i) => ({ a: i * 2.39996 + r() * 0.3, v: r() * 2 - 1, r: 0.92 + 0.16 * r(), ph: r() * 6.28 }));
    rolled.set(key, f);
    if (rolled.size > 8) rolled.delete(rolled.keys().next().value as string);
  }
  return f;
}

const made = new Map<string, Species>();

/**
 * The schooling fish a leg's turn is made of: the first in its pool, or
 * where the pool has none, jacks of the sitting's own, made once and kept.
 */
export function vortexSpecies(pool: Species[], key: string): Species {
  const own = pool.find((s) => s.school > 0 && s.genome.plan === 'fish');
  if (own) return own;
  let sp = made.get(key);
  if (!sp) {
    const seed = hash32(key, 'vortex-jack');
    sp = { id: `vortex:${seed}`, seed, zone: 0, leg: 0, genome: rollGenome(seed, 0.12, 'fish', 'jack'), name: '', abundance: 1, school: 12, curious: false, speed: 1, floor: false, blink: 3, regular: false };
    made.set(key, sp);
    if (made.size > 8) made.delete(made.keys().next().value as string);
  }
  return sp;
}

/**
 * The turn, drawn into the far water. `amount` is how much of it there is,
 * 0 to 1 (its leg easing in or out); `sprite` gives the school's fish at a
 * length in CSS px.
 */
export function drawVortex(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  key: string,
  amount: number,
  ambient: number,
  px: number,
  sprite: (lenCss: number) => Sprite | null,
) {
  if (amount <= 0.01) return;
  const seed = hash32(key, 'vortex-place');
  const side = seed & 1 ? 1 : -1;
  // Off to one side, a little below the middle, breathing slowly.
  const cx = w * (0.5 + side * (0.16 + ((seed >>> 1) & 255) / 255 / 12)) + Math.sin(ambient * 0.031) * w * 0.02;
  const cy = h * 0.52 + Math.sin(ambient * 0.023 + 1) * h * 0.02;
  // Taller than it is wide, tilted toward the reader so the near side of the
  // turn and the far side part, and the ring of it reads.
  const rx = Math.min(w * 0.14, h * 0.22);
  const hc = rx * 1.05;
  const tilt = rx * 0.32;
  const scale = Math.max(0.6, Math.min(1.3, Math.min(w, h) / (760 * px)));
  const n = Math.round(FISH * Math.max(0.5, Math.min(1, (w * h) / (1280 * 800 * px * px))));
  const placed: { x: number; y: number; z: number; face: number; s: number }[] = [];
  const fish = fishOf(key);
  for (let i = 0; i < n; i++) {
    const f = fish[i];
    const a = f.a + ambient * TURN * (0.9 + 0.2 * f.r);
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Narrower at its top and bottom, as a milling school is.
    const k = (1 - 0.3 * f.v * f.v) * f.r;
    const x = cx + c * rx * k;
    const y = cy + f.v * hc + s * tilt + Math.sin(ambient * 0.8 + f.ph) * 2 * px;
    // Near side (s > 0) carried one way, far side the other.
    placed.push({ x, y, z: s, face: -s >= 0 ? 1 : -1, s: f.r });
  }
  placed.sort((p, q) => p.z - q.z);
  ctx.save();
  for (const p of placed) {
    const near = (p.z + 1) / 2;
    const sp = sprite(Math.round((11 + 7 * near) * scale));
    if (!sp) continue;
    ctx.globalAlpha = amount * (0.22 + 0.4 * near);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.face, 1);
    ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2);
    ctx.restore();
  }
  ctx.restore();
}

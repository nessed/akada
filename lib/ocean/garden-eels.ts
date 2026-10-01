/**
 * Garden eels, standing up out of the sand on a rock (see `outcrop.ts`).
 *
 * The sand and the burrows are inked into the rock's sprite; the eels move,
 * so they are drawn here, every frame, over it. Each one stands up out of
 * its hole in a gentle S with its head bent into the current, as a colony
 * faces the flow to pick plankton out of it, all of them the same way. The
 * current runs left to right on the page (the snow and the kelp go that
 * way), so the heads point left.
 *
 * A tap near them and they are gone into the sand in a quarter of a second;
 * a few seconds later they come back up one at a time, slowly, the way they
 * do once whatever it was has passed. That is the only state here, and it
 * is only the reader's: where the eels are is the rock's, and the rock is a
 * pure function of the sitting.
 */

import { mixHex } from '../fan';
import { zoneMid } from './depth';
import type { Outcrop } from './outcrop';
import { eelHoles, rockTopAt } from './outcrop-sprite';
import { IRON_GALL, waterAt } from './palette';
import { detailFor, inkLine, LIGHT } from './pen';
import { hash32, mulberry32, range } from './random';

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How long an eel takes to vanish into its hole. */
const DROP = 250;
/** How long it takes to come back up. */
const RISE = 1500;
/** How near a tap has to be, in CSS pixels. */
const NEAR = 90;
/** Points along an eel's body. */
const SEGS = 8;

interface Duck {
  /** How far up it was when it was startled, 0 to 1. */
  from: number;
  /** When it was startled, and when it starts back up, ms. */
  at: number;
  up: number;
}

interface Look {
  body: string;
  /** The body on its shadow side. */
  shade: string;
  ink: string;
  spot: string;
  alpha: number;
  dark: boolean;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export class GardenEels {
  private ducks = new Map<string, Duck>();
  /** Where each eel drawn last frame stands, in device px, to answer a tap. */
  private spots: { key: string; x: number; y: number }[] = [];
  private looks = new Map<string, Look>();

  /** A tap at (x, y) device px: eels within about 90 css px duck. `now` ms. */
  duck(x: number, y: number, now: number, px: number): void {
    const near = NEAR * px;
    for (const s of this.spots) {
      // Measured to the middle of a standing eel rather than its hole.
      if (Math.hypot(s.x - x, s.y - 12 * px - y) > near) continue;
      const from = this.level(s.key, now);
      // Each waits its own while before it dares come back, so they rise one by one.
      const r = mulberry32(hash32(s.key, Math.floor(now)));
      this.ducks.set(s.key, { from, at: now, up: now + range(r, 2500, 5000) });
    }
  }

  /** Draw the eels for every rock in view that has a patch. Returns true while any eel is still moving back up, so the caller keeps animating. */
  draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    inView: { outcrop: Outcrop; top: number }[],
    ambient: number,
    now: number,
    px: number,
    dark: boolean,
    clear: Rect[] | undefined,
  ): boolean {
    const live = new Set<string>();
    this.spots = [];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.7 * px;
    for (const { outcrop: o, top } of inView) {
      const p = o.eels;
      if (!p) continue;
      live.add(o.id);
      if (top * h < -8 * px || top * h > h + 40 * px) continue;
      const look = this.look(o.zone, dark);
      eelHoles(p).forEach((b, i) => {
        const at = rockTopAt(o, top, b.f, w, h, px);
        // In the mouth of the burrow the sprite inked, which the sand lifts.
        const x = at.x;
        const y = at.y - b.lift * px + 0.5 * px;
        const key = `${o.id}:${i}`;
        this.spots.push({ key, x, y });
        const r = mulberry32(hash32(p.seed, 'eel', i));
        const len = range(r, 20, 28) * px;
        const shown = len * this.level(key, now);
        if (shown < 1.5 * px) return;
        const phase = range(r, 0, Math.PI * 2);
        const bend = range(r, 1.0, 1.35);
        // The current comes in breaths; each eel gives to it a little out of step.
        const sway = 0.16 * Math.sin(ambient * 0.8 + phase) + 0.05 * Math.sin(ambient * 1.9 + phase * 1.7);
        let alpha = look.alpha;
        if (clear?.some((c) => c.x * w < x + 16 * px && (c.x + c.w) * w > x - 16 * px && c.y * h < y && (c.y + c.h) * h > y - len)) {
          alpha *= 0.3;
        }
        drawEel(ctx, x, y, len, shown, bend, sway, r, look, alpha, px, detailFor(len * 3));
      });
    }
    ctx.restore();
    // Forget the eels of rocks that have gone, and those back up and settled.
    let moving = false;
    for (const [key, d] of this.ducks) {
      if (!live.has(key.slice(0, key.lastIndexOf(':'))) || now >= d.up + RISE) this.ducks.delete(key);
      else moving = true;
    }
    return moving;
  }

  /** How far up an eel stands, 0 (in its hole) to 1. */
  private level(key: string, now: number): number {
    const d = this.ducks.get(key);
    if (!d) return 1;
    if (now < d.up) {
      const t = clamp01((now - d.at) / DROP);
      return d.from * (1 - t) * (1 - t);
    }
    const t = clamp01((now - d.up) / RISE);
    return t * t * (3 - 2 * t);
  }

  /** The ink rule: pale cream with fine dark spots, outlined in the one ink,
      dark on light water and light on dark, a little greyed in the twilight. */
  private look(zone: number, dark: boolean): Look {
    const k = `${zone}|${dark ? 1 : 0}`;
    let l = this.looks.get(k);
    if (!l) {
      const zw = waterAt(zoneMid(zone), dark ? 'night' : 'paper', '#A8BCC9');
      let cream = '#F2EBD8';
      if (zone >= 1) cream = mixHex(cream, '#9AA3AB', 0.3);
      const body = dark ? mixHex(cream, '#1A1815', 0.12) : cream;
      l = {
        body,
        shade: mixHex(body, dark ? '#1A1815' : '#8A7A62', dark ? 0.35 : 0.3),
        ink: dark ? IRON_GALL.dark : IRON_GALL.light,
        spot: '#3A322A',
        alpha: 0.92 * (0.65 + 0.35 * zw.light),
        dark,
      };
      this.looks.set(k, l);
    }
    return l;
  }
}

/**
 * One eel from its hole at (x, y), `len` long standing and `shown` of it out.
 * Its line is fixed along its length, so one going down slides back into the
 * hole along its own body rather than shrinking: the head follows the neck.
 * It is inked in the pen the rest of the sea is: a pressure line round it,
 * its far side washed a shade deeper, and big, a stipple of shadow down that
 * side, the gill slit and the mouth.
 */
function drawEel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  shown: number,
  bend: number,
  sway: number,
  r: () => number,
  look: Look,
  alpha: number,
  px: number,
  d: number,
) {
  // The line, as an angle off upright along the body: a lean downstream at
  // the sand, then the upper part curled back into the current.
  const pts: { x: number; y: number; a: number }[] = [];
  const ds = shown / SEGS;
  let cx = x;
  let cy = y;
  for (let k = 0; k <= SEGS; k++) {
    const u = (k * ds) / len;
    const a = 0.28 - bend * Math.pow(u, 1.6) + sway * u;
    pts.push({ x: cx, y: cy, a });
    cx += Math.sin(a) * ds;
    cy -= Math.cos(a) * ds;
  }
  // Thin all the way, the head a little fuller at the tip.
  const half = (k: number) => {
    const v = (k * ds) / shown;
    return (1.1 + 0.45 * clamp01((v - 0.7) / 0.25)) * px;
  };
  const side = (k: number, s: number) => {
    const p = pts[k];
    return [p.x + Math.cos(p.a) * half(k) * s, p.y + Math.sin(p.a) * half(k) * s] as const;
  };
  // Round it: up one side, over the head, down the other.
  const ring: number[] = [];
  for (let k = 0; k <= SEGS; k++) ring.push(...side(k, -1));
  const tip = pts[SEGS];
  for (let i = 1; i < 6; i++) {
    const a = tip.a + Math.PI + (Math.PI * i) / 6;
    ring.push(tip.x + Math.cos(a) * half(SEGS), tip.y + Math.sin(a) * half(SEGS));
  }
  for (let k = SEGS; k >= 0; k--) ring.push(...side(k, 1));
  const outline = new Path2D();
  outline.moveTo(ring[0], ring[1]);
  for (let i = 2; i < ring.length; i += 2) outline.lineTo(ring[i], ring[i + 1]);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = look.body;
  ctx.fill(outline);
  // Which side of the body is away from the light, at the middle of it.
  const mid = pts[SEGS >> 1];
  const away = Math.cos(mid.a) * LIGHT[0] + Math.sin(mid.a) * LIGHT[1] > 0 ? 1 : -1;
  // The far side a shade deeper: a stroke down the body, inside it.
  ctx.save();
  ctx.clip(outline);
  ctx.beginPath();
  for (let k = 0; k <= SEGS; k++) {
    const p = pts[k];
    const o = half(k) * 0.65 * away;
    if (k) ctx.lineTo(p.x + Math.cos(p.a) * o, p.y + Math.sin(p.a) * o);
    else ctx.moveTo(p.x + Math.cos(p.a) * o, p.y + Math.sin(p.a) * o);
  }
  ctx.strokeStyle = look.shade;
  ctx.lineWidth = 1.1 * px;
  ctx.globalAlpha = alpha * 0.7;
  ctx.stroke();
  if (d > 0.4) {
    // A stipple of shadow down the far side, finer toward the head.
    ctx.fillStyle = look.ink;
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    for (let k = 0; k < SEGS * 3; k++) {
      // Scattered along it, never in step: a hash of the dot for its place.
      const hsh = Math.sin(k * 12.9898 + len) * 43758.5453;
      const jit = hsh - Math.floor(hsh);
      if (jit < 0.35) continue;
      const f = Math.max(0, Math.min(SEGS - 0.01, k / 3 + (jit - 0.5) * 0.6));
      const i = Math.min(SEGS - 1, Math.floor(f));
      const t = f - i;
      const px0 = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
      const py0 = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
      const o = half(i) * (0.45 + 0.45 * ((jit * 7.3) % 1)) * away;
      const sx = px0 + Math.cos(pts[i].a) * o;
      const sy = py0 + Math.sin(pts[i].a) * o;
      ctx.moveTo(sx + 0.22 * px, sy);
      ctx.arc(sx, sy, 0.22 * px, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
  // The pen round it, left open at the sand, so the body runs on down into the hole.
  inkLine(ctx, ring, false, {
    width: (d > 0.4 ? 0.6 : 0.7) * px,
    color: look.ink,
    alpha: alpha * 0.85,
    swell: 0.6,
    taper: [0.04, 0.04],
    lost: 0,
    raw: true,
    light: look.dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT,
    min: 0.2 * px,
  });

  // Spots, counted back from the head, so they go down with the skin.
  ctx.fillStyle = look.spot;
  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath();
  const n = 5;
  for (let i = 0; i < n; i++) {
    // Both rolled before the skip, so the spots keep their places as it rises.
    const back = len * (0.12 + (0.8 * (i + r())) / n);
    const off = (r() - 0.5) * 1.2 * px;
    if (back > shown - 1 * px) continue;
    const at = (shown - back) / ds;
    const k = Math.min(SEGS - 1, Math.floor(at));
    const t = at - k;
    const sx = pts[k].x + (pts[k + 1].x - pts[k].x) * t;
    const sy = pts[k].y + (pts[k + 1].y - pts[k].y) * t;
    ctx.moveTo(sx + Math.cos(pts[k].a) * off + 0.45 * px, sy + Math.sin(pts[k].a) * off);
    ctx.arc(sx + Math.cos(pts[k].a) * off, sy + Math.sin(pts[k].a) * off, 0.45 * px, 0, Math.PI * 2);
  }
  ctx.fill();

  // The eye, just back from the tip on the upper side of the head.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#14120F';
  ctx.beginPath();
  const ex = tip.x - Math.sin(tip.a) * 1.3 * px + Math.cos(tip.a) * 0.45 * half(SEGS);
  const ey = tip.y + Math.cos(tip.a) * 1.3 * px + Math.sin(tip.a) * 0.45 * half(SEGS);
  ctx.arc(ex, ey, 0.5 * px, 0, Math.PI * 2);
  ctx.fill();
  if (d > 0.4 && shown > len * 0.5) {
    // The mouth, and the gill slit behind the eye.
    const h = half(SEGS);
    const back = (k: number, along: number, across: number) => {
      const p = pts[k];
      return [p.x - Math.sin(p.a) * along + Math.cos(p.a) * across, p.y + Math.cos(p.a) * along + Math.sin(p.a) * across] as const;
    };
    ctx.beginPath();
    ctx.moveTo(...back(SEGS, -0.2 * h, -0.55 * h));
    ctx.quadraticCurveTo(...back(SEGS, 0.9 * px, -0.1 * h), ...back(SEGS, 1.6 * px, -0.05 * h));
    ctx.moveTo(...back(SEGS - 1, 0.2 * px, -0.7 * h));
    ctx.quadraticCurveTo(...back(SEGS - 1, -0.3 * px, 0), ...back(SEGS - 1, 0.1 * px, 0.6 * h));
    ctx.strokeStyle = look.ink;
    ctx.lineWidth = 0.35 * px;
    ctx.globalAlpha = alpha * 0.7;
    ctx.stroke();
  }
}

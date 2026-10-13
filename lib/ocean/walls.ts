/**
 * Rock walls down the edges of the page, for the places that have them
 * (`places.ts`): the drop-off and the seamount down one side, and the trench
 * down both, from its first metre to the bottom, closing in as it deepens.
 *
 * A wall is one long cliff the reader sinks along. It slides up the page at
 * the kelp's pace with the rocks, so everything in a place moves as one; it
 * grows in from the page's edge where its place begins and goes back into it
 * where the place ends, unless the next place has a wall on that side too,
 * when it just runs on.
 *
 * It is engraved like every rock in the sea (`inkWall`), and drawn in strips
 * half a page tall, each the first time it comes into view and then only
 * placed. Every strip is drawn in the wall's own coordinates, on one seed,
 * with its edges drawn past the strip and cut away, so the stone's blocks,
 * joints and line run on across the joins and nothing on it ever repeats.
 */

import { depthAt, zoneMid } from './depth';
import { kelpDescent } from './kelp';
import { inkWall, rockStyle } from './outcrop-sprite';
import { waterAt } from './palette';
import { detailFor } from './pen';
import { legAt, type Leg } from './places';
import { hash32 } from './random';

/** Page heights the page slides per minute of focus: the kelp's pace. */
const RATE = kelpDescent(60);
/** How far down the page a place's wall begins as the place does, so it is on the page by the time its name is. */
const LEAD = 0.6;
/** World page heights to a strip. */
const STRIP = 0.5;
/** Page heights over which a wall grows in from the edge, or goes back into it. */
const RAMP = 0.35;

type Rect = { x: number; y: number; w: number; h: number };

/** Where a leg begins, in page heights down the world. */
function worldOf(minutes: number): number {
  return RATE * minutes + LEAD;
}

function smoothstep(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/** Whether a leg has a wall on a side. */
function walled(leg: Leg | undefined, side: -1 | 1): boolean {
  if (!leg) return false;
  return leg.place.walls === 2 || (leg.place.walls === 1 && leg.side === side);
}

/** How far in a leg's wall stands, as a share of the page width, at a depth in metres. */
function reachOf(leg: Leg, metres: number): number {
  if (leg.place.walls === 2) {
    // The trench closes in as it deepens: a tenth of the page each side at
    // its top, a quarter and more at the bottom, the middle always left open.
    return 0.1 + 0.15 * smoothstep((metres - 6000) / 5000);
  }
  return 0.13;
}

/**
 * How far in the wall on a side stands at a point down the world (page
 * heights), as a share of the page width: 0 where there is none.
 */
export function wallReach(route: Leg[], key: string, side: -1 | 1, worldY: number): number {
  const minutes = (worldY - LEAD) / RATE;
  if (minutes < 0) return 0;
  const i = legAt(route, minutes * 60);
  const leg = route[i];
  if (!walled(leg, side)) return 0;
  let k = 1;
  if (!walled(route[i - 1], side)) k = Math.min(k, smoothstep((worldY - worldOf(leg.from)) / RAMP));
  if (Number.isFinite(leg.to) && !walled(route[i + 1], side)) k = Math.min(k, smoothstep((worldOf(leg.to) - worldY) / RAMP));
  if (k <= 0) return 0;
  // The narrows pinch in, eased in and out over the leg's ends so the
  // cliff swings in rather than stepping.
  let reach = reachOf(leg, depthAt(minutes * 60).meters);
  const span = Number.isFinite(leg.to) ? worldOf(leg.to) - worldOf(leg.from) : Infinity;
  const inLeg = Math.min(1, smoothstep((worldY - worldOf(leg.from)) / RAMP), Number.isFinite(span) ? smoothstep((worldOf(leg.to) - worldY) / RAMP) : 1);
  if (leg.place.narrow) reach += leg.place.narrow * inLeg;
  // The overhang: the cliff on the leg's side leans out a long way over the
  // water and is cut back in under it, twice down the leg.
  const lean = leg.place.overhang && side === leg.side ? overhangAt(key, worldY - worldOf(leg.from), span) * inLeg : 0;
  // The cliff's line, in and out: long swells and smaller ones on them, on
  // the wall's own phases, so no two walls and no two stretches of one match.
  const p = hash32(key, 'wall-edge', side);
  const ph = [(p & 1023) / 163, ((p >>> 10) & 1023) / 163, ((p >>> 20) & 1023) / 163];
  const rough = 0.02 * Math.sin(worldY * 4.7 + ph[0]) + 0.009 * Math.sin(worldY * 12.9 + ph[1]) + 0.004 * Math.sin(worldY * 37.3 + ph[2]);
  // Never past a third of the page, ledge and all; an overhang a little
  // further, since the water under it is open.
  return Math.max(0, Math.min(lean > 0 ? 0.4 : 0.33, reach + rough + ledgeAt(key, side, worldY) + lean) * k);
}

/**
 * An overhang's lean at a point `y` page heights into its leg: the cliff
 * runs out over the water, its top a steep step and its underside a long
 * hollow back in to the wall, twice down the leg.
 */
function overhangAt(key: string, y: number, span: number): number {
  const len = Number.isFinite(span) ? span : 1.2;
  const h = hash32(key, 'overhang', Math.round(len * 1000));
  const out = 0.12 + 0.05 * ((h & 255) / 255);
  let lean = 0;
  for (const at of [0.22, 0.64]) {
    // From its top: out in a short sharp step, then back under itself.
    const u = (y - at * len) / Math.min(0.7, 0.16 * len);
    if (u < 0 || u > 1) continue;
    // A lip: out in a few hundredths of a page, then the underside hollowed
    // back in toward the wall, quickly at first.
    lean = Math.max(lean, out * Math.min(1, u / 0.06) * Math.pow(1 - u, 1.8));
  }
  return lean;
}

/** Every fifth of a page or so, a ledge: the cliff steps out sharply at its
    top and leans back in under it, so the line reads as broken rock, never
    as a hem or a curtain. Some cells have none. */
function ledgeAt(key: string, side: -1 | 1, worldY: number): number {
  const CELL = 0.21;
  const cell = Math.floor(worldY / CELL);
  const u = worldY / CELL - cell;
  const h = hash32(key, 'ledge', side, cell);
  if ((h & 3) === 0) return 0;
  const a = 0.012 + 0.04 * (((h >>> 2) & 1023) / 1023);
  // Out over the first sliver of the cell, then back in to nothing by its end.
  return a * Math.min(1, u / 0.07) * Math.pow(1 - u, 1.6);
}

interface Strip {
  canvas: HTMLCanvasElement;
}

/** Strips already drawn, newest last; a few either side of the page is all that is ever needed. */
export class WallCache {
  private map = new Map<string, Strip | null>();

  get(route: Leg[], key: string, side: -1 | 1, k: number, w: number, h: number, dark: boolean, px: number): Strip | null {
    if (typeof document === 'undefined' || w <= 0 || h <= 0) return null;
    const id = `${key}|${side}|${k}|${w}|${h}|${dark ? 1 : 0}|${px}`;
    if (this.map.has(id)) {
      const hit = this.map.get(id) ?? null;
      this.map.delete(id);
      this.map.set(id, hit);
      return hit;
    }
    const made = render(route, key, side, k, w, h, dark, px);
    this.map.set(id, made);
    while (this.map.size > 10) this.map.delete(this.map.keys().next().value as string);
    return made;
  }
}

function render(route: Leg[], key: string, side: -1 | 1, k: number, w: number, h: number, dark: boolean, px: number): Strip | null {
  const y0 = k * STRIP;
  const segH = Math.ceil(STRIP * h) + 1;
  // Drawn past the strip at either end and cut away, so a strip's edges
  // (where the wash and the line begin and end) are never on it.
  const over = Math.max(48 * px, 0.25 * h);
  const step = 3 * px;
  const top = y0 * h - over;
  const bottom = y0 * h + segH + over;
  const xs: number[] = [];
  let widest = 0;
  // A tall narrow page (a phone) keeps more of its width open: the jelly
  // is a bigger share of it.
  const narrow = Math.max(0.65, Math.min(1, w / h / 1.2));
  for (let y = top; y <= bottom + step; y += step) {
    const x = wallReach(route, key, side, y / h) * w * narrow;
    xs.push(x);
    if (y >= y0 * h - step && y <= y0 * h + segH + step) widest = Math.max(widest, x);
  }
  if (widest < 1) return null;
  const cw = Math.ceil(Math.max(...xs) + 6 * px);
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(4096, cw);
  canvas.height = segH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // The world's coordinates on the strip: x from the wall's own page edge
  // (mirrored for a right wall), y down the world in device px.
  ctx.translate(0, -y0 * h);
  const outline = new Path2D();
  const X = (x: number) => (side < 0 ? x : cw - x);
  outline.moveTo(X(-2 * px), top);
  xs.forEach((x, i) => outline.lineTo(X(Math.max(-1, x)), top + i * step));
  outline.lineTo(X(-2 * px), top + (xs.length - 1) * step);
  outline.closePath();
  // The stone of the depth it is at: the strip's middle.
  const zone = depthAt(Math.max(0, ((y0 + STRIP / 2 - LEAD) / RATE) * 60)).zone;
  const water = waterAt(zoneMid(zone), dark ? 'night' : 'paper', '#A8BCC9');
  const seed = hash32(key, 'wall', side);
  inkWall(ctx, outline, { x0: 0, y0: top, x1: cw, y1: bottom }, rockStyle(water, dark, px, detailFor(Math.max(cw, 60 * px)), seed), px, seed, {
    side: side < 0 ? 'left' : 'right',
    // Never fading down the wall: it is stone the whole way.
    fadeFrom: 1e9,
  });
  // Fainter as the light goes, as a rock is, but never lost.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1 - 0.92 * (0.65 + 0.35 * water.light);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas };
}

/**
 * The walls on the page at a moment of focus. Where one crosses a `clear`
 * rect (what is written on the open screen) it goes faint, as a rock does,
 * so the clock always reads.
 */
export function drawWalls(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  route: Leg[],
  key: string,
  focusSeconds: number,
  cache: WallCache,
  dark: boolean,
  px: number,
  clear: Rect[] | undefined,
) {
  const down = kelpDescent(focusSeconds);
  const first = Math.floor(down / STRIP);
  const last = Math.floor((down + 1) / STRIP);
  for (const side of [-1, 1] as const) {
    for (let k = Math.max(0, first); k <= last; k++) {
      const s = cache.get(route, key, side, k, w, h, dark, px);
      if (!s) continue;
      const x = side < 0 ? 0 : w - s.canvas.width;
      const y = Math.round((k * STRIP - down) * h);
      const box = { x0: x, y0: y, x1: x + s.canvas.width, y1: y + s.canvas.height };
      const hits = (clear ?? []).filter((r) => r.x * w < box.x1 && (r.x + r.w) * w > box.x0 && r.y * h < box.y1 && (r.y + r.h) * h > box.y0);
      if (!hits.length) {
        ctx.drawImage(s.canvas, x, y);
        continue;
      }
      const outside = new Path2D();
      outside.rect(-w, -h, w * 3, h * 3);
      const inside = new Path2D();
      for (const r of hits) {
        outside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
        inside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
      }
      ctx.save();
      ctx.clip(outside, 'evenodd');
      ctx.drawImage(s.canvas, x, y);
      ctx.restore();
      ctx.save();
      ctx.clip(inside);
      ctx.globalAlpha *= 0.3;
      ctx.drawImage(s.canvas, x, y);
      ctx.restore();
    }
  }
}

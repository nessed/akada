/**
 * Landmarks, inked (see `landmarks.ts`).
 *
 * Like a rock, a landmark is drawn once to a canvas of its own and after
 * that only placed, in the same hand as the rest of the sea: the stone by
 * `inkRock`, the coral on it by `drawGrowth`, the rest in the pen's own
 * pressure lines, washes, hatching and stipple. Each is drawn for the edge
 * it comes from, so the light stays on its top left.
 *
 * - The wreck: a steel ship lying on the reef's slope, her bow raised, her
 *   stern run into the page edge and her keel banked in sand. Plated and
 *   riveted, a row of portholes, a hole torn in her side, a broken rail, the
 *   stump of a deckhouse and a mast leaning forward with a stay hanging
 *   from it; coral and fans grown up from her deck.
 * - The brine pool: a ledge of the slope with a lake lying in its top, dark
 *   and glossy, its surface sharp; a shore of mussels; and brine spilling
 *   over the lip and running down the face. Its surface glints and the
 *   spill runs, drawn over the sprite every frame (`drawLandmarks`).
 */

import { mixHex } from '../fan';
import { zoneMid } from './depth';
import type { Landmark, landmarksInView } from './landmarks';
import type { Growth, GrowthKind } from './outcrop';
import { drawGrowth, inkRock, rockFoot, rockShape, rockStyle, type RockShape } from './outcrop-sprite';
import { HUES, IRON_GALL, waterAt } from './palette';
import { bounds, detailFor, hatch, inkLine, LIGHT, stipple, washFill } from './pen';
import { hash32, int, mulberry32, range, type Rand } from './random';

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The brine pool's parts that move, in the sprite's own pixels. */
interface BrineGeo {
  /** The surface: its two ends and its level. */
  x0: number;
  x1: number;
  y: number;
  /** How far its far shore stands above the level, and its near shore below. */
  back: number;
  front: number;
  /** The spill down the face, top to bottom, as flat [x, y] points. */
  spill: number[];
}

interface Made {
  canvas: HTMLCanvasElement;
  /** Where the canvas's left edge sits on the page, device px. */
  left: number;
  /** Where the landmark's top sits in the canvas, device px. */
  oy: number;
  brine?: BrineGeo;
}

const KEEP = 4;

export class LandmarkCache {
  private map = new Map<string, Made>();

  get(lm: Landmark, w: number, h: number, dark: boolean, px: number): Made | null {
    if (typeof document === 'undefined' || w <= 0 || h <= 0) return null;
    const key = `${lm.id}|${w}|${h}|${dark ? 1 : 0}|${px}`;
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const made = lm.kind === 'wreck' ? renderWreck(lm, w, h, dark, px) : renderBrine(lm, w, h, dark, px);
    if (!made) return null;
    this.map.set(key, made);
    while (this.map.size > KEEP) this.map.delete(this.map.keys().next().value as string);
    return made;
  }
}

/**
 * The landmarks on the page, each at its place, going faint where one
 * crosses what is written on the open screen, as the rocks do. `alpha`
 * draws them fainter (over the dark, where they stay findable). The brine
 * pool's surface and spill move on the slow clock `ambient`.
 */
export function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  inView: ReturnType<typeof landmarksInView>,
  cache: LandmarkCache,
  dark: boolean,
  px: number,
  clear: Rect[] | undefined,
  ambient: number,
  alpha = 1,
  still = false,
) {
  for (const { landmark, top } of inView) {
    const s = cache.get(landmark, w, h, dark, px);
    if (!s) continue;
    const cw = s.canvas.width;
    const ch = s.canvas.height;
    const y = top * h - s.oy;
    if (y > h || y + ch < 0) continue;
    const hits = (clear ?? []).filter((r) => r.x * w < s.left + cw && (r.x + r.w) * w > s.left && r.y * h < y + ch && (r.y + r.h) * h > y);
    const lay = (k: number) => {
      ctx.globalAlpha = alpha * k;
      ctx.drawImage(s.canvas, s.left, y);
      // Its glints catch the jelly's light, so they show over the dark too.
      if (s.brine && !still) brineMotion(ctx, s.brine, s.left, y, landmark.seed, ambient, dark, px, Math.max(alpha, 0.7) * k);
    };
    ctx.save();
    if (!hits.length) {
      lay(1);
      ctx.restore();
      continue;
    }
    const outside = new Path2D();
    outside.rect(-w, -h, w * 3, h * 3);
    const inside = new Path2D();
    for (const r of hits) {
      outside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
      inside.rect(r.x * w, r.y * h, r.w * w, r.h * h);
    }
    ctx.clip(outside, 'evenodd');
    lay(1);
    ctx.restore();
    ctx.save();
    ctx.clip(inside);
    lay(0.3);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---- Shared ---- */

function newCanvas(cw: number, ch: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(4096, Math.ceil(cw)));
  canvas.height = Math.max(1, Math.min(4096, Math.ceil(ch)));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { canvas, ctx };
}

/** A rock laid on the sprite at its alpha: drawn on its own layer (it erases to let its foot go) and laid down. */
function layRock(ctx: CanvasRenderingContext2D, shape: RockShape, x0: number, y0: number, dir: 1 | -1, zone: number, dark: boolean, px: number, seed: number) {
  const layer = newCanvas(ctx.canvas.width, ctx.canvas.height);
  if (!layer) return;
  const zw = waterAt(zoneMid(zone), dark ? 'night' : 'paper', '#A8BCC9');
  inkRock(layer.ctx, shape, { x0, y0, dir }, { ...rockStyle(zw, dark, px, detailFor(Math.min(shape.span, shape.height * 2.5)), seed), barnacles: zone < 2 });
  ctx.save();
  ctx.globalAlpha = 0.92 * (0.65 + 0.35 * zw.light);
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}

function pathOf(pts: number[], closed = true): Path2D {
  const p = new Path2D();
  for (let i = 0; i < pts.length; i += 2) {
    if (i === 0) p.moveTo(pts[0], pts[1]);
    else p.lineTo(pts[i], pts[i + 1]);
  }
  if (closed) p.closePath();
  return p;
}

/** The outer edge of a rock at a height `y` in its own frame: the furthest `u` any boulder reaches there. */
function outerAt(shape: RockShape, y: number, band: number): number {
  let best = -Infinity;
  for (const b of shape.boulders) {
    for (let i = 0; i < b.pts.length; i += 2) if (Math.abs(b.pts[i + 1] - y) < band && b.pts[i] > best) best = b.pts[i];
  }
  return best;
}

/** The sunlit reef's colours, the course pastels without the grey. */
const REEF = HUES.map((_, i) => i).filter((i) => HUES[i] !== '#9AA3AB');

/* ---- The wreck ---- */

/**
 * How far out from its edge a landmark is drawn, device px: its share of the
 * page, but on a narrow page (a phone held upright) further across, so it
 * is still the size of a ship and not a toy.
 */
function spanOf(lm: Landmark, w: number, px: number): number {
  return Math.max((lm.reach + 0.03) * w, Math.min(0.78 * w, 330 * px));
}

function renderWreck(lm: Landmark, w: number, h: number, dark: boolean, px: number): Made | null {
  const r = mulberry32(hash32(lm.seed, 'wreck'));
  const span = spanOf(lm, w, px);
  const H = lm.height * h;
  // Where her keel lies at the stern, and her depth as she is about to be
  // rolled: the reef and the room over her mast go by her, not the page.
  const keel = H * 0.76;
  const depth = span * 0.21;
  const padT = Math.ceil(Math.max(0.16 * H, depth * 2.8 + span * 0.17 - keel) + 40 * px);
  const padIn = Math.ceil(60 * px);
  // The reef she lies on: a low heap of rock, its foot let go of, its top
  // two thirds of her depth over her keel.
  const reefTop = keel - depth * 0.68;
  const mound = rockShape(hash32(lm.seed, 'mound'), span * 0.84, depth * 1.05, px, 'heap');
  const made = newCanvas(span + padIn, padT + reefTop + rockFoot(mound) + 12 * px);
  if (!made) return null;
  const { canvas, ctx } = made;
  const cw = canvas.width;
  // Drawn for its own edge, so the light stays top left either way.
  const dir: 1 | -1 = lm.edge < 0 ? 1 : -1;
  const x0 = dir > 0 ? 0 : cw;
  const X = (u: number) => x0 + dir * u;
  const Y = (v: number) => padT + v;
  const zw = waterAt(zoneMid(0), dark ? 'night' : 'paper', '#A8BCC9');
  const d = detailFor(span);
  // She is drawn on a layer of her own, so her keel can be let go of into
  // the reef; the reef goes over her keel after, so she lies in it.
  const own = newCanvas(cw, canvas.height);
  if (!own) return null;
  const main = ctx;
  return finishWreck(lm, r, own.ctx, main, canvas, { span, H, keel, padT, dir, X, Y, zw, d, w, px, dark }, () =>
    layRock(main, mound, X(0), Y(reefTop), dir, 0, dark, px, hash32(lm.seed, 'mound-ink')),
  );
}

interface WreckFrame {
  span: number;
  H: number;
  /** Where her keel lies at the stern, px down from the landmark's top. */
  keel: number;
  padT: number;
  dir: 1 | -1;
  X: (u: number) => number;
  Y: (v: number) => number;
  zw: ReturnType<typeof waterAt>;
  d: number;
  w: number;
  px: number;
  dark: boolean;
}

function finishWreck(lm: Landmark, r: Rand, ctx: CanvasRenderingContext2D, main: CanvasRenderingContext2D, canvas: HTMLCanvasElement, f: WreckFrame, reef: () => void): Made {
  const { span, H, keel, padT, dir, X, Y, zw, d, w, px, dark } = f;
  const cw = canvas.width;
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Her lines, in her own frame: `s` from the stern (0, off the page edge)
  // to the bow (1), `t` down from the deck edge. Bow up, lying on the slope.
  const Lh = span * range(r, 0.9, 0.96);
  const D = Math.min(H * 0.4, Lh * range(r, 0.19, 0.23));
  const tilt = range(r, 0.09, 0.17);
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  const Su = -0.05 * span;
  const Sv = keel - D * ca;
  const P = (s: number, t: number): [number, number] => {
    // Along her length rises with the tilt; down her side goes down and a little aft.
    const u = Su + s * Lh * ca + t * sa;
    const v = Sv - s * Lh * sa + t * ca;
    return [X(u), Y(v)];
  };
  const sheer = (s: number) => -D * 0.07 * Math.pow(Math.max(0, s), 3);
  const hullPts: number[] = [];
  const push = (s: number, t: number) => hullPts.push(...P(s, t));
  for (let i = 0; i <= 40; i++) {
    const s = -0.08 + (1.08 * i) / 40;
    push(s, sheer(s));
  }
  // The stem: raked forward at the top, curving under to the forefoot.
  for (let i = 1; i <= 12; i++) {
    const k = i / 12;
    push(1 - 0.09 * k * k, sheer(1) + (D * 0.92 - sheer(1)) * k);
  }
  for (let i = 0; i <= 20; i++) {
    const s = 0.9 - (0.98 * i) / 20;
    push(s, D);
  }
  const hull = pathOf(hullPts);
  const box = bounds(hullPts);
  const plate = dark ? mixHex(zw.bottom, '#000000', 0.18) : mixHex(mixHex(zw.bottom, '#6B5546', 0.55), '#FBF8EF', 0.1);
  const rust = dark ? mixHex(plate, '#8A6A55', 0.25) : mixHex(plate, '#8C5E44', 0.35);
  const hollow = dark ? '#060606' : '#1E1A17';
  ctx.save();
  ctx.globalAlpha = 0.95;
  washFill(ctx, hull, box, { color: plate, edge: 0.35, paper: dark ? null : '#FBF8EF', highlight: 0.25, granulate: 0.4, px });
  // Down her side the light goes: hatched, denser to the keel.
  const shade = (x: number, y: number) => {
    // How far down her side a point is, by its height against her deck and keel at that point.
    const along = Math.max(0, Math.min(1, (dir * (x - X(Su))) / (Lh * ca)));
    const [, top] = P(along, 0);
    const [, bot] = P(along, D);
    return 0.15 + 0.85 * Math.max(0, Math.min(1, (y - top) / Math.max(1, bot - top)));
  };
  hatch(ctx, hull, box, { spacing: 3.2 * px, angle: Math.PI / 2 - 0.35 * dir, shade, from: 0.5, cross: 0.88, color: ink, width: 0.6 * px, alpha: dark ? 0.5 : 0.55, bow: 0.1, seed: hash32(lm.seed, 'hatch') });
  // Rust streaks run down from her rivets and her ports.
  for (let i = 0; i < 9; i++) {
    const s = range(r, 0.1, 0.92);
    const [ax, ay] = P(s, range(r, 0.15, 0.4) * D);
    const len = range(r, 0.2, 0.45) * D;
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = rust;
    ctx.lineWidth = range(r, 1.5, 3) * px;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + dir * sa * len * 0.3, ay + len);
    ctx.stroke();
  }
  // Grown over: a stipple of encrusting life, heavier toward her keel.
  stipple(ctx, hull, box, { spacing: 4.5 * px, shade, from: 0.3, color: ink, radius: 0.55 * px, alpha: 0.35, seed: hash32(lm.seed, 'crust') });
  ctx.restore();

  // Her plates: two strakes along her and the frames across, broken lines.
  const line = (pts: number[], width: number, alpha: number, seed: number) => inkLine(ctx, pts, false, { width: width * px, color: ink, alpha, lost: 0.6, taper: [0.1, 0.1], seed });
  for (const t of [0.36, 0.64]) {
    const pts: number[] = [];
    for (let i = 0; i <= 16; i++) pts.push(...P(-0.05 + (0.93 * i) / 16, t * D));
    line(pts, 0.55, 0.55, hash32(lm.seed, 'strake', t));
  }
  if (d > 0.2) {
    for (let s = 0.04; s < 0.9; s += 0.065) line([...P(s, 0.05 * D), ...P(s, 0.95 * D)], 0.4, 0.3, hash32(lm.seed, 'frame', s));
  }

  // A hole torn in her side, her plates bent in round it.
  const hs = range(r, 0.42, 0.58);
  const hole: number[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const k = 0.7 + 0.45 * r();
    hole.push(...P(hs + Math.cos(a) * 0.075 * k, D * (0.55 + Math.sin(a) * 0.2 * k)));
  }
  ctx.save();
  ctx.fillStyle = hollow;
  ctx.globalAlpha = dark ? 0.85 : 0.8;
  ctx.fill(pathOf(hole));
  ctx.restore();
  inkLine(ctx, hole, true, { width: 0.9 * px, color: ink, swell: 0.6, lost: 0.2, seed: hash32(lm.seed, 'hole') });
  // Bent plate at its lip.
  for (let i = 0; i < 4; i++) {
    const k = i * 9 + int(r, 0, 3);
    const ax = hole[(k * 2) % hole.length];
    const ay = hole[(k * 2 + 1) % hole.length];
    line([ax, ay, ax + dir * range(r, -6, 6) * px, ay + range(r, 3, 8) * px], 0.7, 0.7, hash32(lm.seed, 'bent', i));
  }

  // Her portholes, a row under the deck, some with the glass gone.
  for (let s = range(r, 0.3, 0.34); s < 0.88; s += 0.05) {
    if (Math.abs(s - hs) < 0.1) continue;
    const [cx, cy] = P(s, 0.2 * D);
    const rad = Math.max(1.6 * px, D * 0.042);
    const ring: number[] = [];
    for (let i = 0; i < 14; i++) ring.push(cx + Math.cos((i / 14) * Math.PI * 2) * rad, cy + Math.sin((i / 14) * Math.PI * 2) * rad);
    if (r() < 0.6) {
      ctx.save();
      ctx.fillStyle = hollow;
      ctx.globalAlpha = 0.7;
      ctx.fill(pathOf(ring));
      ctx.restore();
    }
    inkLine(ctx, ring, true, { width: 0.6 * px, color: ink, alpha: 0.8, swell: 0.5, seed: hash32(lm.seed, 'port', s) });
  }

  // The stump of her deckhouse, aft, its corner broken off.
  const d0 = range(r, 0.06, 0.1);
  const d1 = d0 + range(r, 0.16, 0.2);
  const hgt = D * range(r, 0.42, 0.55);
  const house: number[] = [...P(d0, sheer(d0)), ...P(d0, -hgt), ...P(d1 - 0.05, -hgt)];
  for (let i = 1; i <= 4; i++) house.push(...P(d1 - 0.05 + 0.0125 * i, -hgt + (hgt * 0.45 * i) / 4 + (r() - 0.5) * 4 * px));
  house.push(...P(d1, -hgt * 0.4), ...P(d1, sheer(d1)));
  const hp = pathOf(house);
  const hb = bounds(house);
  ctx.save();
  washFill(ctx, hp, hb, { color: mixHex(plate, dark ? '#000000' : '#FBF8EF', 0.12), edge: 0.3, paper: dark ? null : '#FBF8EF', highlight: 0.3, px });
  hatch(ctx, hp, hb, { spacing: 3.4 * px, angle: Math.PI / 2 - 0.35 * dir, shade: (x) => 0.3 + 0.6 * Math.max(0, Math.min(1, (dir * (x - hb.x - (dir > 0 ? 0 : hb.w))) / Math.max(1, hb.w))), from: 0.5, color: ink, width: 0.55 * px, alpha: 0.45, seed: hash32(lm.seed, 'house') });
  ctx.restore();
  inkLine(ctx, house, false, { width: 1 * px, color: ink, swell: 0.6, lost: 0.25, seed: hash32(lm.seed, 'house-line'), taper: [0.05, 0.05] });
  // Its windows, the glass long gone.
  for (let s = d0 + 0.025; s < d1 - 0.07; s += 0.04) {
    const a = P(s, -hgt * 0.72);
    const b = P(s + 0.022, -hgt * 0.72);
    const c = P(s + 0.022, -hgt * 0.45);
    const e = P(s, -hgt * 0.45);
    const win = [...a, ...b, ...c, ...e];
    ctx.save();
    ctx.fillStyle = hollow;
    ctx.globalAlpha = 0.65;
    ctx.fill(pathOf(win));
    ctx.restore();
  }

  // Her rail, broken in places, the posts bent.
  const railFrom = d1 + 0.03;
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 4) line(run, 0.6, 0.75, hash32(lm.seed, 'rail', run[0]));
    run = [];
  };
  for (let s = railFrom; s <= 0.97; s += 0.022) {
    const gone = r() < 0.12;
    if (gone) {
      flush();
      continue;
    }
    const lean = (r() - 0.5) * 0.6;
    const [bx, by] = P(s, sheer(s));
    const [tx, ty] = P(s + lean * 0.02, sheer(s) - D * 0.13);
    line([bx, by, tx, ty], 0.45, 0.7, hash32(lm.seed, 'post', s));
    run.push(tx, ty);
  }
  flush();
  // Her deck edge, over everything, in one pressure line, and her whole outline.
  inkLine(ctx, hullPts, true, { width: 1.25 * px, color: ink, swell: 0.7, lost: 0.35, seed: hash32(lm.seed, 'hull'), light: LIGHT });

  // Her mast, forward, leaning out over the bow, broken off short, with a
  // stay hanging from it to the stem.
  const ms = range(r, 0.6, 0.7);
  const [mx, my] = P(ms, sheer(ms));
  const lean = tilt + range(r, 0.25, 0.45);
  const ml = D * range(r, 1.1, 1.45);
  const tx = mx + dir * Math.sin(lean) * ml;
  const ty = my - Math.cos(lean) * ml;
  inkLine(ctx, [mx, my, (mx + tx) / 2 + dir * px, (my + ty) / 2, tx, ty], false, { width: 2.4 * px, color: ink, swell: 0.6, taper: [0, 0.15], seed: hash32(lm.seed, 'mast') });
  // A yard across it, two thirds up, hanging askew.
  const yx = mx + (tx - mx) * 0.66;
  const yy = my + (ty - my) * 0.66;
  const yl = D * 0.32;
  const ya = range(r, -0.5, 0.2);
  line([yx - Math.cos(ya) * yl, yy - Math.sin(ya) * yl, yx + Math.cos(ya) * yl, yy + Math.sin(ya) * yl], 1.1, 0.85, hash32(lm.seed, 'yard'));
  // The stay, sagging.
  const [sx, sy] = P(1.0, sheer(1) - D * 0.04);
  const stay: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    stay.push(tx + (sx - tx) * k, ty + (sy - ty) * k + Math.sin(Math.PI * k) * D * 0.22);
  }
  line(stay, 0.45, 0.6, hash32(lm.seed, 'stay'));

  // Her keel let go of into the reef, as a rock's foot is: she lies in it, not on it.
  {
    const [ax, ay] = P(0.5, D * 0.72);
    const [bx, by] = P(0.5, D * 1.04);
    const fade = ctx.createLinearGradient(ax, ay, bx, by);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, cw, canvas.height);
    ctx.restore();
  }
  main.drawImage(ctx.canvas, 0, 0);
  reef();

  // Coral and fans grown up from her deck, her deckhouse roof and her rail.
  const kit: [GrowthKind, number][] = [['fan', 3], ['branch', 3], ['brain', 1.5], ['anemone', 2], ['tube', 2]];
  const hues = Array.from({ length: 3 }, () => REEF[int(r, 0, REEF.length - 1)]);
  const spots: [number, number][] = [];
  for (let i = 0; i < 2; i++) spots.push([d0 + 0.03 + i * 0.08, -hgt]);
  const n = int(r, 6, 9);
  for (let i = 0; i < n; i++) {
    const s = railFrom + ((0.95 - railFrom) * (i + 0.2 + 0.6 * r())) / n;
    if (Math.abs(s - ms) < 0.04) continue;
    spots.push([s, sheer(s)]);
  }
  for (const [s, t] of spots) {
    const [gx, gy] = P(s, t);
    const total = kit.reduce((a, [, wt]) => a + wt, 0);
    let v = r() * total;
    let kind: GrowthKind = kit[0][0];
    for (const [k, wt] of kit) {
      v -= wt;
      if (v <= 0) {
        kind = k;
        break;
      }
    }
    const g: Growth = { kind, at: 0, size: range(r, 22, 44), hue: hues[int(r, 0, hues.length - 1)], seed: (r() * 4294967296) >>> 0 };
    main.save();
    main.translate(gx, gy + 2 * px);
    drawGrowth(main, g, 0, dark, px);
    main.restore();
  }
  main.globalAlpha = 1;
  const left = dir > 0 ? -0.03 * w : w + 0.03 * w - cw;
  return { canvas, left, oy: padT };
}

/* ---- The brine pool ---- */

function renderBrine(lm: Landmark, w: number, h: number, dark: boolean, px: number): Made | null {
  const r = mulberry32(hash32(lm.seed, 'brine'));
  const span = spanOf(lm, w, px);
  const H = lm.height * h;
  const padT = Math.ceil(0.12 * H + 30 * px);
  const padIn = Math.ceil(40 * px);
  // The ledge: flat beds of rock stacked off the slope.
  const rockY = H * 0.3;
  const shape = rockShape(hash32(lm.seed, 'ledge'), span, H * 0.62, px, 'slab');
  const made = newCanvas(span + padIn, padT + rockY + rockFoot(shape) + 12 * px);
  if (!made) return null;
  const { canvas, ctx } = made;
  const cw = canvas.width;
  const dir: 1 | -1 = lm.edge < 0 ? 1 : -1;
  const x0 = dir > 0 ? 0 : cw;
  const X = (u: number) => x0 + dir * u;
  const ink = dark ? IRON_GALL.dark : IRON_GALL.light;
  layRock(ctx, shape, X(0), padT + rockY, dir, lm.zone, dark, px, hash32(lm.seed, 'ledge-ink'));

  // The pool lies in a hollow of its top, from a little out from the wall
  // to well short of the lip, filled to the lowest point of its rim, so it
  // lies in the rock and never on the water.
  const u0 = span * range(r, 0.12, 0.17);
  const u1 = span * range(r, 0.62, 0.68);
  let level = -Infinity;
  for (let i = 0; i <= 16; i++) level = Math.max(level, shape.top(u0 + ((u1 - u0) * i) / 16));
  const ys = padT + rockY + level + 3 * px;
  const back = Math.max(8 * px, H * 0.11);
  const front = Math.max(3 * px, H * 0.045);
  const pool: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    pool.push(X(u0 + (u1 - u0) * k), ys - back * Math.sin(Math.PI * k) * (0.85 + 0.15 * Math.sin(k * 9)));
  }
  for (let i = 24; i >= 0; i--) {
    const k = i / 24;
    pool.push(X(u0 + (u1 - u0) * k), ys + front * Math.sin(Math.PI * k));
  }
  const pp = pathOf(pool);
  const pb = bounds(pool);
  const deep = dark ? '#1A2228' : '#3B464E';
  const sheen = dark ? '#5E7280' : '#7E8E98';
  ctx.save();
  const grad = ctx.createLinearGradient(0, pb.y, 0, pb.y + pb.h);
  grad.addColorStop(0, sheen);
  grad.addColorStop(0.4, deep);
  grad.addColorStop(1, mixHex(deep, '#000000', 0.25));
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.92;
  ctx.fill(pp);
  // Its surface is a mirror: long still lines of the light on it.
  ctx.clip(pp);
  ctx.strokeStyle = dark ? '#B8CAD4' : '#E8EEF0';
  for (let i = 0; i < 5; i++) {
    const y = pb.y + pb.h * (0.25 + 0.12 * i);
    const a = pb.x + pb.w * range(r, 0.05, 0.4);
    const b = a + pb.w * range(r, 0.2, 0.5);
    ctx.globalAlpha = 0.28 - i * 0.04;
    ctx.lineWidth = 0.7 * px;
    ctx.beginPath();
    ctx.moveTo(a, y);
    ctx.lineTo(b, y);
    ctx.stroke();
  }
  ctx.restore();
  // Its shore line, sharp: brine and sea do not mix.
  inkLine(ctx, pool, true, { width: 0.9 * px, color: ink, swell: 0.5, lost: 0.15, seed: hash32(lm.seed, 'shore') });
  // A faint haze lying on it, where the two waters meet.
  ctx.save();
  const mc = dark ? '120, 140, 150' : '200, 210, 214';
  ctx.translate((X(u0) + X(u1)) / 2, ys - back * 0.4);
  ctx.scale(Math.abs(X(u1) - X(u0)) / 2, back * 1.6);
  const mist = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  mist.addColorStop(0, `rgba(${mc}, ${dark ? 0.14 : 0.2})`);
  mist.addColorStop(1, `rgba(${mc}, 0)`);
  ctx.fillStyle = mist;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The mussels on its shore, packed thick along the near side and thinner on the far.
  const shell = dark ? '#57535E' : '#2E2B33';
  const shine = dark ? '#A9A4B3' : '#C9C4CF';
  const mussel = (x: number, y: number, s: number, a: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.6 * s * px, 1.4 * s * px, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shine;
    ctx.globalAlpha *= 0.7;
    ctx.lineWidth = 0.5 * px;
    ctx.beginPath();
    ctx.ellipse(-0.4 * s * px, -0.4 * s * px, 1.6 * s * px, 0.6 * s * px, 0, Math.PI, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();
  };
  ctx.save();
  ctx.globalAlpha = dark ? 0.8 : 0.9;
  for (let row = 0; row < 3; row++) {
    const count = Math.round(((u1 - u0) / (5 * px)) * (1 - row * 0.25));
    for (let i = 0; i < count; i++) {
      const k = (i + r()) / count;
      const y = ys + front * Math.sin(Math.PI * k) + (1.5 + row * 2.6) * px + (r() - 0.5) * 1.5 * px;
      mussel(X(u0 + (u1 - u0) * k) + (r() - 0.5) * 3 * px, y, range(r, 0.8, 1.2) * (1 - row * 0.12), range(r, -0.9, 0.9));
    }
  }
  for (let i = 0; i < (u1 - u0) / (9 * px); i++) {
    const k = r();
    mussel(X(u0 + (u1 - u0) * k), ys - back * Math.sin(Math.PI * k) - 1 * px, range(r, 0.55, 0.8), range(r, -0.6, 0.6));
  }
  ctx.restore();

  // The spill: brine out of the pool's lip end, along the top of the rock
  // to its edge, and over, running down the face of the ledge.
  const spill: number[] = [X(u1 - 4 * px), ys];
  const lip = Math.max(u1 + 8 * px, Math.min(span, shape.hi) - 6 * px);
  for (let i = 1; i <= 8; i++) {
    const u = u1 + ((lip - u1) * i) / 8;
    spill.push(X(u), padT + rockY + Math.max(shape.top(u), level) + 1 * px);
  }
  const topY = Math.max(shape.top(lip), level);
  const bottom = shape.height * 0.72;
  for (let i = 1; i <= 14; i++) {
    const y = topY + ((bottom - topY) * i) / 14;
    const edge = Math.max(lip - 4 * px, outerAt(shape, y, 6 * px));
    spill.push(X(edge + 2 * px), padT + rockY + y);
  }
  const ribbon: number[] = [];
  const back2: number[] = [];
  for (let i = 0; i < spill.length; i += 2) {
    const k = i / (spill.length - 2);
    const wd = (8 - 5 * k) * px;
    ribbon.push(spill[i] - dir * wd * 0.2, spill[i + 1]);
    back2.unshift(spill[i] + dir * wd, spill[i + 1]);
  }
  const rib = pathOf([...ribbon, ...back2]);
  ctx.save();
  const rg = ctx.createLinearGradient(0, ys, 0, padT + rockY + bottom);
  rg.addColorStop(0, deep);
  rg.addColorStop(1, mixHex(deep, dark ? '#000000' : '#FBF8EF', 0.5));
  ctx.fillStyle = rg;
  ctx.globalAlpha = 0.75;
  ctx.fill(rib);
  ctx.restore();
  inkLine(ctx, back2, false, { width: 0.6 * px, color: ink, alpha: 0.6, taper: [0.05, 0.5], seed: hash32(lm.seed, 'spill') });
  // The light along it, where it is thickest.
  inkLine(ctx, spill, false, { width: 0.8 * px, color: sheen, alpha: 0.7, taper: [0.1, 0.6], seed: hash32(lm.seed, 'spill-light') });

  const left = dir > 0 ? -0.03 * w : w + 0.03 * w - cw;
  return { canvas, left, oy: padT, brine: { x0: X(u0), x1: X(u1), y: ys, back, front, spill } };
}

/**
 * The brine pool's motion, over its sprite: a glint or two sliding slowly
 * along its still surface, and streaks running down the spill.
 */
function brineMotion(ctx: CanvasRenderingContext2D, g: BrineGeo, left: number, top: number, seed: number, ambient: number, dark: boolean, px: number, alpha: number) {
  const r = mulberry32(hash32(seed, 'brine-motion'));
  const lo = Math.min(g.x0, g.x1);
  const hi = Math.max(g.x0, g.x1);
  ctx.save();
  ctx.translate(left, top);
  ctx.strokeStyle = dark ? '#C8D8E0' : '#F2F5F6';
  ctx.lineWidth = 0.8 * px;
  for (let i = 0; i < 3; i++) {
    const speed = 0.012 + 0.01 * r();
    const u = (r() + ambient * speed) % 1;
    const k = 0.15 + 0.7 * u;
    const x = lo + (hi - lo) * k;
    const y = g.y - g.back * Math.sin(Math.PI * k) * (0.3 + 0.4 * r());
    const len = (12 + 18 * r()) * px;
    // In at one end and out at the other, so it never pops.
    ctx.globalAlpha = alpha * 0.45 * Math.sin(Math.PI * u);
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
  }
  // Streaks down the spill, a few at a time, slow.
  const n = g.spill.length / 2;
  ctx.strokeStyle = dark ? '#8FA3AE' : '#E4EAEC';
  for (let i = 0; i < 4; i++) {
    const at = (r() + ambient * 0.05) % 1;
    const j = Math.min(n - 2, Math.floor(at * (n - 1)));
    const f = at * (n - 1) - j;
    const x = g.spill[j * 2] + (g.spill[j * 2 + 2] - g.spill[j * 2]) * f;
    const y = g.spill[j * 2 + 1] + (g.spill[j * 2 + 3] - g.spill[j * 2 + 1]) * f;
    ctx.globalAlpha = alpha * 0.5 * Math.sin(Math.PI * at);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 6 * px);
    ctx.stroke();
  }
  ctx.restore();
}

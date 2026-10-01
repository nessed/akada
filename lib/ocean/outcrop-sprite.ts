/**
 * Outcrops, inked (see `outcrop.ts`).
 *
 * A rock and everything on it is drawn once, to a canvas of its own, and
 * after that only placed: coral doesn't move, so there is nothing to
 * redraw, and a frame pays one image copy per rock (two where it crosses
 * what is written on the page). It is drawn as if it jutted from the left
 * edge, and mirrored when it comes from the right.
 *
 * The growths are drawn as a natural-history plate would draw them: a wash
 * of colour under a line of ink. Colour goes with the light, as it does in
 * real water, which takes the reds first: full pastels on the sunlit reef,
 * greyed in the twilight, and in the dark only pale ghosts.
 */

import { mixHex } from '../fan';
import { zoneMid } from './depth';
import type { Growth, Outcrop, outcropsInView } from './outcrop';
import { HUES, waterAt, type Water } from './palette';
import { chance, int, mulberry32, range, type Rand } from './random';

interface Placed {
  canvas: HTMLCanvasElement;
  /** Where the rock top's page-edge corner sits in the canvas, in device pixels. */
  ox: number;
  oy: number;
}

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Only two or three are ever on the page; a few more cover a resize or a turn of the light. */
const KEEP = 8;

export class OutcropCache {
  private map = new Map<string, Placed>();

  get(o: Outcrop, w: number, h: number, dark: boolean, px: number): Placed | null {
    if (typeof document === 'undefined' || w <= 0 || h <= 0) return null;
    const key = `${o.id}|${w}|${h}|${dark ? 1 : 0}|${px}`;
    const hit = this.map.get(key);
    if (hit) {
      // Most recently used goes to the back of the line.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const made = render(o, w, h, dark, px);
    if (!made) return null;
    this.map.set(key, made);
    while (this.map.size > KEEP) this.map.delete(this.map.keys().next().value as string);
    return made;
  }
}

/**
 * The outcrops on the page, each at its place. Where one crosses a `clear`
 * rect (what is written on the open screen, as shares of the page) it goes
 * faint, as the animals do, so the clock always reads.
 */
export function drawOutcrops(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  inView: ReturnType<typeof outcropsInView>,
  cache: OutcropCache,
  water: Water,
  px: number,
  clear: Rect[] | undefined,
) {
  for (const { outcrop, top } of inView) {
    const s = cache.get(outcrop, w, h, water.dark, px);
    if (!s) continue;
    const cw = s.canvas.width;
    const ch = s.canvas.height;
    const y = top * h - s.oy;
    const left = outcrop.edge < 0 ? -s.ox : w - (cw - s.ox);
    if (y > h || y + ch < 0) continue;
    const place = () => {
      if (outcrop.edge < 0) {
        ctx.drawImage(s.canvas, -s.ox, y);
      } else {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(s.canvas, -s.ox, y);
      }
    };
    const hits = (clear ?? []).filter(
      (r) => r.x * w < left + cw && (r.x + r.w) * w > left && r.y * h < y + ch && (r.y + r.h) * h > y,
    );
    ctx.save();
    ctx.globalAlpha = 1;
    if (!hits.length) {
      place();
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
    place();
    ctx.restore();
    ctx.save();
    ctx.clip(inside);
    ctx.globalAlpha = 0.3;
    place();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The sprite

function render(o: Outcrop, w: number, h: number, dark: boolean, px: number): Placed | null {
  const span = (o.reach + 0.03) * w;
  const thick = o.thick * h;
  const tallest = Math.max(0, ...o.growths.map((g) => g.size)) * px;
  const padL = 2 * px;
  const padR = Math.max(24, ...o.growths.map((g) => g.size * 0.75)) * px;
  const padT = Math.ceil(tallest * 1.15 + 16 * px);
  const cw = Math.min(4096, Math.ceil(padL + span * 1.03 + padR));
  const ch = Math.min(4096, Math.ceil(padT + thick + 8 * px));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ox = padL + 0.03 * w;
  const oy = padT;
  const crestY = drawRock(ctx, o, span, thick, padL, oy, dark, px);
  for (const g of o.growths) {
    const x = ox + g.at * o.reach * w;
    const f = Math.min(0.88, (x - padL) / span);
    ctx.save();
    // Sunk a little into the rock, so it stands on it rather than floats.
    ctx.translate(x, crestY(f) + 1.5 * px);
    drawGrowth(ctx, g, o.zone, dark, px);
    ctx.restore();
  }
  return { canvas, ox, oy };
}

/** The rock, as the kelp's ledge is drawn: inked along its top and lip, and
    bleeding away underneath toward the page edge it comes out of, so it reads
    as rock jutting from a wall rather than a bowl floating in the water. */
function drawRock(
  ctx: CanvasRenderingContext2D,
  o: Outcrop,
  span: number,
  thick: number,
  x0: number,
  top: number,
  dark: boolean,
  px: number,
): (f: number) => number {
  const X = (f: number) => x0 + span * f;
  // Coloured from its own zone's water, not the live water, so the sprite
  // holds still while the sea darkens around it.
  const zw = waterAt(zoneMid(o.zone), dark ? 'night' : 'paper', '#A8BCC9');
  const rock = dark ? mixHex(zw.bottom, '#000000', 0.28) : mixHex(zw.bottom, '#6B6459', 0.42);
  const line = dark ? mixHex(zw.bottom, '#FFFFFF', 0.22) : mixHex(zw.bottom, '#1A1714', 0.55);
  // Fainter as the light goes, but never lost: in the dark the rock is
  // what the growths stand on, and it is mostly its ink that shows.
  const alpha = 0.92 * (0.65 + 0.35 * zw.light);

  // Boulders along the top: low humps between the bumps, then the lip.
  const n = o.bumps.length;
  const crestY = (f: number) => {
    const u = (Math.max(0, Math.min(0.88, f)) / 0.88) * (n - 1);
    const i = Math.min(n - 2, Math.floor(u));
    const t = u - i;
    const b = o.bumps[i] + (o.bumps[i + 1] - o.bumps[i]) * (1 - Math.cos(Math.PI * t)) * 0.5;
    return top - (0.5 + 0.5 * b) * 7 * px - Math.sin(Math.PI * t) * 4 * px;
  };
  const edge = new Path2D();
  edge.moveTo(X(0), crestY(0));
  for (let k = 1; k <= 48; k++) edge.lineTo(X((k / 48) * 0.88), crestY((k / 48) * 0.88));
  const lipTop = crestY(0.88);
  edge.bezierCurveTo(X(0.96), lipTop, X(1.01), top + thick * 0.12, X(0.97), top + thick * 0.3);
  // The underside runs back to the wall and is never inked: the wash runs dry
  // before it gets there.
  const body = new Path2D(edge);
  body.bezierCurveTo(X(0.8), top + thick * 0.45, X(0.3), top + thick * 0.7, X(0), top + thick);
  body.closePath();

  const g = ctx.createLinearGradient(0, top, 0, top + thick);
  g.addColorStop(0, rock);
  g.addColorStop(0.4, rock);
  g.addColorStop(1, `${rock}00`);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.globalAlpha = alpha * 0.75;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.2 * px;
  ctx.stroke(edge);
  ctx.clip(body);
  // Engraved shading down the face of the lip.
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const f = 0.9 - i * 0.022;
    ctx.moveTo(X(f), top + thick * (0.12 + i * 0.015));
    ctx.lineTo(X(f - 0.01), top + thick * (0.34 + i * 0.03));
  }
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke();
  // Stipple near the top, where the rock catches what light there is.
  ctx.fillStyle = line;
  for (const d of o.specks) {
    const depth = 0.05 + d.y * 0.45;
    ctx.globalAlpha = alpha * 0.45 * (1 - depth / 0.6);
    ctx.beginPath();
    ctx.arc(X(0.03 + d.x * 0.82), top + thick * depth, d.r * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return crestY;
}

// ---------------------------------------------------------------------------
// The growths. Each is drawn at its base, standing up (-y), `H` device pixels tall.

interface Ink {
  ink: string;
  body: string;
  /** The dark of an opening: a sponge's mouth. */
  hollow: string;
  /** A sea pen's light, in the dark. */
  glow: string | null;
}

/** The animals' ink rule, with the colour drained toward grey and then pale with depth. */
function inkFor(g: Growth, zone: number, dark: boolean): Ink {
  let c = HUES[Math.max(0, Math.min(HUES.length - 1, Math.round(g.hue)))];
  if (zone === 1) c = mixHex(c, '#9AA3AB', 0.5);
  else if (zone >= 2) c = mixHex(c, '#EFE9DC', 0.75);
  const water = dark ? '#1A1815' : '#FBF8EF';
  return {
    ink: dark ? mixHex(c, '#FFFFFF', 0.45) : mixHex(c, '#1A1714', 0.6),
    body: dark ? mixHex(c, water, 0.45) : mixHex(c, water, 0.2),
    hollow: dark ? '#0B0A09' : mixHex(c, '#1A1714', 0.75),
    glow: dark && zone >= 2 ? mixHex(c, '#FFFFFF', 0.55) : null,
  };
}

function drawGrowth(ctx: CanvasRenderingContext2D, g: Growth, zone: number, dark: boolean, px: number) {
  const r = mulberry32(g.seed);
  const ink = inkFor(g, zone, dark);
  const H = g.size * px;
  ctx.globalAlpha = zone === 0 ? 0.95 : zone === 1 ? 0.85 : 0.6;
  ctx.fillStyle = ink.body;
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 0.9 * px;
  DRAW[g.kind](ctx, H, ink, r, px);
}

type Drawer = (ctx: CanvasRenderingContext2D, H: number, ink: Ink, r: Rand, px: number) => void;

/** Stroke at a fraction of the current alpha, then put it back. */
function faint(ctx: CanvasRenderingContext2D, k: number, draw: () => void) {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * k;
  draw();
  ctx.globalAlpha = a;
}

const DRAW: Record<Growth['kind'], Drawer> = {
  // Antler coral: forking three or four times, the ink laid wide and the
  // body narrower over it so each branch reads as outlined, ends round.
  branch(ctx, H, ink, r, px) {
    const segs: number[][] = [];
    const grow = (x: number, y: number, a: number, len: number, wd: number, lvl: number) => {
      const x1 = x + Math.sin(a) * len;
      const y1 = y - Math.cos(a) * len;
      const bend = range(r, -0.3, 0.3) * len;
      segs.push([x, y, (x + x1) / 2 + Math.cos(a) * bend, (y + y1) / 2 + Math.sin(a) * bend, x1, y1, wd]);
      if (lvl === 0) return;
      const k = chance(r, 0.3) ? 3 : 2;
      for (let i = 0; i < k; i++) {
        const turn = k === 2 ? (i ? 1 : -1) * range(r, 0.3, 0.55) : (i - 1) * range(r, 0.4, 0.6);
        const na = Math.max(-1.2, Math.min(1.2, a + turn + range(r, -0.1, 0.1)));
        grow(x1, y1, na, len * range(r, 0.66, 0.8), wd * 0.74, lvl - 1);
      }
    };
    grow(0, 0, range(r, -0.12, 0.12), H * 0.34, Math.max(1.8 * px, H * 0.1), H > 44 * px ? 3 : 2);
    for (const [pass, extra, color] of [[0, 1.6, ink.ink], [1, 0, ink.body]] as const) {
      ctx.strokeStyle = color;
      for (const [x, y, cx, cy, x1, y1, wd] of segs) {
        ctx.lineWidth = wd + extra * px;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.stroke();
      }
      if (pass === 1) ctx.strokeStyle = ink.ink;
    }
  },

  // Brain coral: a low dome, its meandering grooves following the curve.
  brain(ctx, H, ink, r, px) {
    const rx = H * 0.8;
    const ry = H * 0.55;
    const dome = new Path2D();
    dome.moveTo(-rx, 0);
    dome.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
    dome.closePath();
    ctx.fill(dome);
    ctx.stroke(dome);
    ctx.save();
    ctx.clip(dome);
    ctx.beginPath();
    for (let k = 1; k <= 5; k++) {
      const rk = k / 6;
      const freq = int(r, 7, 12);
      const ph = range(r, 0, Math.PI * 2);
      for (let s = 0; s <= 40; s++) {
        const t = Math.PI + (Math.PI * s) / 40;
        const rad = rk + 0.06 * Math.sin(t * freq + ph) + 0.03 * Math.sin(t * freq * 2.3 + ph * 1.7);
        const x = Math.cos(t) * rx * rad;
        const y = Math.sin(t) * ry * rad;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.lineWidth = 0.8 * px;
    faint(ctx, 0.6, () => ctx.stroke());
    ctx.restore();
  },

  // Sea fan: a short stem opening into a flat fan of ribs, crossed into a
  // lattice, over a thin wash.
  fan(ctx, H, ink, r, px) {
    const sx = range(r, -0.04, 0.04) * H;
    const oy = -0.16 * H;
    const n = int(r, 7, 10);
    const ribs: [number, number][][] = [];
    for (let i = 0; i < n; i++) {
      const a = -0.95 + (1.9 * i) / (n - 1) + range(r, -0.06, 0.06);
      const len = H * 0.84 * (0.72 + 0.28 * Math.cos(a)) * range(r, 0.92, 1.04);
      const ph = range(r, 0, Math.PI * 2);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const wob = Math.sin(t * 5 + ph) * 0.03 * H * t;
        pts.push([sx + Math.sin(a) * len * t + Math.cos(a) * wob, oy - Math.cos(a) * len * t + Math.sin(a) * wob]);
      }
      ribs.push(pts);
    }
    const wash = new Path2D();
    wash.moveTo(sx, oy);
    for (const pts of ribs) wash.lineTo(pts[6][0], pts[6][1]);
    wash.closePath();
    faint(ctx, 0.3, () => ctx.fill(wash));
    ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sx, oy);
    ctx.stroke();
    ctx.lineWidth = 0.8 * px;
    ctx.beginPath();
    for (const pts of ribs) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      // A fork at the tip.
      const [ex, ey] = pts[6];
      const [px0, py0] = pts[5];
      const dx = (ex - px0) * 0.5;
      const dy = (ey - py0) * 0.5;
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + dx - dy * 0.6, ey + dy + dx * 0.6);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + dx + dy * 0.6, ey + dy - dx * 0.6);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let k = 1; k <= 5; k++) {
      ctx.moveTo(ribs[0][k][0], ribs[0][k][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(ribs[i][k][0], ribs[i][k][1]);
    }
    ctx.lineWidth = 0.5 * px;
    faint(ctx, 0.5, () => ctx.stroke());
  },

  // Anemone: a short column, its disc crowned with curving tentacles, each
  // ending in a little knob.
  anemone(ctx, H, ink, r, px) {
    const cw = H * 0.3;
    const tw = H * 0.38;
    const chh = H * 0.36;
    const n = int(r, 14, 20);
    const tips: [number, number][] = [];
    const tent = new Path2D();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const bx = (u - 0.5) * tw * 0.95;
      const by = -chh;
      const a = (u - 0.5) * 2.4 + range(r, -0.15, 0.15);
      const len = H * range(r, 0.42, 0.6);
      const cx = bx + Math.sin(a) * len * 0.5;
      const cy = by - Math.cos(a) * len * 0.5;
      const a2 = a * 1.5 + range(r, -0.3, 0.3);
      const ex = cx + Math.sin(a2) * len * 0.5;
      const ey = cy - Math.cos(a2) * len * 0.5;
      tent.moveTo(bx, by);
      tent.quadraticCurveTo(cx, cy, ex, ey);
      tips.push([ex, ey]);
    }
    ctx.lineWidth = 2.8 * px;
    ctx.stroke(tent);
    ctx.lineWidth = 1.5 * px;
    ctx.strokeStyle = ink.body;
    ctx.stroke(tent);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.7 * px;
    for (const [x, y] of tips) {
      ctx.beginPath();
      ctx.arc(x, y, 1.7 * px, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const col = new Path2D();
    col.moveTo(-cw / 2, 0);
    col.quadraticCurveTo(-cw * 0.42, -chh * 0.6, -tw / 2, -chh);
    col.ellipse(0, -chh, tw / 2, H * 0.05, 0, Math.PI, 0, true);
    col.quadraticCurveTo(cw * 0.42, -chh * 0.6, cw / 2, 0);
    col.closePath();
    ctx.fill(col);
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(col);
    ctx.beginPath();
    for (const f of [-0.22, 0, 0.22]) {
      ctx.moveTo(f * cw, -2 * px);
      ctx.lineTo(f * tw, -chh + 3 * px);
    }
    ctx.lineWidth = 0.6 * px;
    faint(ctx, 0.4, () => ctx.stroke());
  },

  // Tube sponges: a few upright tubes, round-lipped, dark in the mouth.
  tube(ctx, H, ink, r, px) {
    const n = int(r, 2, 4);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * H * 0.2 + range(r, -0.03, 0.03) * H;
      const tw = H * range(r, 0.16, 0.22);
      const th = H * (i === Math.floor(n / 2) ? range(r, 0.85, 1) : range(r, 0.5, 0.85));
      const ry = tw * 0.22;
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(range(r, -0.12, 0.12) + (i - (n - 1) / 2) * 0.06);
      const p = new Path2D();
      p.moveTo(-tw * 0.4, 0);
      p.quadraticCurveTo(-tw * 0.56, -th * 0.5, -tw / 2, -th);
      p.ellipse(0, -th, tw / 2, ry, 0, Math.PI, 0);
      p.quadraticCurveTo(tw * 0.56, -th * 0.5, tw * 0.4, 0);
      p.closePath();
      ctx.fill(p);
      ctx.stroke(p);
      ctx.beginPath();
      for (const f of [0.3, 0.55, 0.78]) {
        const y = -th * f;
        ctx.moveTo(-tw * 0.48, y);
        ctx.quadraticCurveTo(0, y + ry * 1.4, tw * 0.48, y);
      }
      ctx.lineWidth = 0.6 * px;
      faint(ctx, 0.35, () => ctx.stroke());
      ctx.beginPath();
      ctx.ellipse(0, -th, tw * 0.36, ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.hollow;
      faint(ctx, 0.75, () => ctx.fill());
      ctx.fillStyle = ink.body;
      ctx.lineWidth = 0.9 * px;
      ctx.beginPath();
      ctx.ellipse(0, -th, tw / 2, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  // Urchin: a round test bristling with fine spines, none into the rock.
  urchin(ctx, H, ink, r, px) {
    const R = H * 0.2;
    const cy = -R;
    ctx.beginPath();
    const n = int(r, 26, 34);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + range(r, -0.08, 0.08);
      if (Math.sin(a) > 0.2) continue;
      const len = H * range(r, 0.3, 0.45);
      ctx.moveTo(Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8);
      ctx.lineTo(Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
    }
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.9 * px;
    ctx.stroke();
    ctx.fillStyle = ink.ink;
    faint(ctx, 0.5, () => {
      for (let i = 0; i < 9; i++) {
        const a = range(r, 0, Math.PI * 2);
        const d = R * range(r, 0.2, 0.7);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 0.8 * px, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.fillStyle = ink.body;
  },

  // Plate coral: shelves stacked up a short stalk, each ringed with its growth.
  plate(ctx, H, ink, r, px) {
    const n = int(r, 2, 3);
    const shelves = Array.from({ length: n }, (_, k) => {
      const rx = H * range(r, 0.45, 0.62) * (1 - 0.15 * k);
      return { x: (k % 2 ? -1 : 1) * range(r, 0.05, 0.2) * H, y: -H * (0.25 + 0.28 * k), rx, ry: rx * 0.2 };
    });
    ctx.lineWidth = 1.4 * px;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (const s of shelves) ctx.lineTo(s.x * 0.3, s.y);
    ctx.stroke();
    const under = mixHex(ink.body, ink.ink, 0.25);
    // Top shelf first, so the lower ones lie over its stalk.
    for (let k = n - 1; k >= 0; k--) {
      const s = shelves[k];
      const lip = H * 0.045;
      ctx.lineWidth = 0.9 * px;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + lip, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = under;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.body;
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      for (const f of [0.35, 0.6, 0.82]) {
        ctx.moveTo(s.x * 0.3 + s.rx * f + (s.x - s.x * 0.3) * f, s.y);
        ctx.ellipse(s.x * 0.3 + (s.x - s.x * 0.3) * f, s.y, s.rx * f, s.ry * f, 0, 0, Math.PI * 2);
      }
      ctx.lineWidth = 0.6 * px;
      faint(ctx, 0.4, () => ctx.stroke());
      ctx.restore();
    }
  },

  // Black coral: a few long whips, waving gently, in fine ink.
  whip(ctx, H, ink, r, px) {
    const n = int(r, 2, 4);
    const p = new Path2D();
    for (let i = 0; i < n; i++) {
      const lean = range(r, -0.35, 0.35);
      const len = H * range(r, 0.75, 1.05);
      const amp = H * range(r, 0.03, 0.07);
      const freq = range(r, 1.5, 2.5);
      const ph = range(r, 0, Math.PI * 2);
      const bx = range(r, -0.08, 0.08) * H;
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const wave = Math.sin(t * freq * Math.PI * 2 + ph) * amp * t;
        const x = bx + Math.sin(lean) * len * t + Math.cos(lean) * wave;
        const y = -Math.cos(lean) * len * t + Math.sin(lean) * wave;
        if (k === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
    }
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = 2.2 * px;
    faint(ctx, 0.6, () => ctx.stroke(p));
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.9 * px;
    ctx.stroke(p);
    ctx.beginPath();
    ctx.ellipse(0, -1 * px, H * 0.07, 2 * px, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },

  // Glass sponge: a tall pale vase of crossed lattice, barely there.
  glass(ctx, H, ink, r, px) {
    const b = H * 0.06;
    const tw = H * range(r, 0.17, 0.22);
    const lean = range(r, -0.05, 0.05) * H;
    const vase = new Path2D();
    vase.moveTo(-b, 0);
    vase.bezierCurveTo(-H * 0.2, -H * 0.35, -tw * 0.6 + lean, -H * 0.75, -tw + lean, -H);
    vase.ellipse(lean, -H, tw, tw * 0.25, 0, Math.PI, 0);
    vase.bezierCurveTo(tw * 0.6 + lean, -H * 0.75, H * 0.2, -H * 0.35, b, 0);
    vase.closePath();
    faint(ctx, 0.3, () => ctx.fill(vase));
    ctx.save();
    ctx.clip(vase);
    ctx.beginPath();
    const step = Math.max(3 * px, H * 0.07);
    for (let c = -1.3 * H; c <= 0.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c + H, -H);
    }
    for (let c = -0.3 * H; c <= 1.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c - H, -H);
    }
    ctx.lineWidth = 0.5 * px;
    faint(ctx, 0.4, () => ctx.stroke());
    ctx.restore();
    ctx.lineWidth = 0.8 * px;
    faint(ctx, 0.8, () => ctx.stroke(vase));
    ctx.beginPath();
    ctx.ellipse(lean, -H, tw * 0.85, tw * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink.hollow;
    faint(ctx, 0.45, () => ctx.fill());
    faint(ctx, 0.8, () => ctx.stroke());
    ctx.fillStyle = ink.body;
  },

  // Sea pen: a feather on a short stalk; in the dark a few of its polyps glow.
  seapen(ctx, H, ink, r, px) {
    const lean = range(r, -0.15, 0.15) * H;
    const sy = -0.22 * H;
    const at = (t: number): [number, number] => {
      const u = 1 - t;
      return [2 * u * t * lean * 0.2 + t * t * lean, u * u * sy + 2 * u * t * (sy - 0.4 * H) + t * t * -H];
    };
    const m = int(r, 9, 13);
    const tips: [number, number][] = [];
    const leaves = new Path2D();
    for (let i = 0; i < m; i++) {
      const t = 0.08 + (0.87 * i) / (m - 1);
      const [x, y] = at(t);
      const pl = H * 0.22 * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * t)), 0.8);
      const wd = H * 0.035;
      for (const side of [-1, 1]) {
        const ex = x + side * pl * 0.82;
        const ey = y - pl * 0.57;
        leaves.moveTo(x, y);
        leaves.quadraticCurveTo(x + side * pl * 0.35, y - pl * 0.5 - wd, ex, ey);
        leaves.quadraticCurveTo(x + side * pl * 0.5, y - pl * 0.1 + wd, x, y + wd * 0.5);
        tips.push([ex, ey]);
      }
    }
    ctx.fill(leaves);
    ctx.lineWidth = 0.6 * px;
    ctx.stroke(leaves);
    ctx.beginPath();
    ctx.ellipse(0, sy * 0.4, H * 0.035, -sy * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, sy);
    for (let k = 1; k <= 16; k++) {
      const [x, y] = at(k / 16);
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.2 * px;
    ctx.stroke();
    if (!ink.glow) return;
    // A soft light at a few of the polyps: small, and no brighter than the snow.
    const a = ctx.globalAlpha;
    for (let i = 0; i < tips.length; i += 3) {
      const [x, y] = tips[i];
      const rad = 4 * px;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, ink.glow);
      g.addColorStop(1, `${ink.glow}00`);
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = ink.glow;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 * px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = ink.body;
  },
};

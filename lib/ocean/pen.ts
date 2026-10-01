/**
 * The pen and the brush every drawing in the deep is made with.
 *
 * The animals, the kelp, the rocks and the jelly were each inked their own
 * way: straight segments, one even line, one flat fill. Blown up to a
 * wallpaper or a print that reads as an app, not a plate. These are the
 * marks an engraver and a watercolourist would make instead, shared so that
 * everything in the sea looks drawn by one hand:
 *
 * - `smooth`: a curve through a shape's points, so no corners show big.
 * - `inkLine`: a line that swells on the shadow side, thins on the lit side
 *   (breaking where the light is hardest), and tapers at its ends.
 * - `hatch` and `stipple`: shading in lines and in dots, laid only where the
 *   shape is in shadow, finer and denser as the drawing gets bigger.
 * - `washFill`: colour laid as watercolour: pooled darker at its edge, a
 *   strip of bare paper left as the highlight, grain showing through.
 *
 * Everything is in device pixels and deterministic from its seed, so a
 * picture drawn twice comes out the same. Light comes from the top left
 * unless a caller says otherwise.
 */

import { mixHex } from '../fan';
import { mulberry32 } from './random';

/** The way the light travels: from the top left, down and to the right. */
export const LIGHT: [number, number] = [0.6, 0.8];

/* ---- Curves ---- */

/**
 * A Catmull-Rom curve through flat [x, y, x, y, ...] points, sampled `steps`
 * times a segment. Closed shapes wrap round; open ones keep their ends.
 */
export function smooth(pts: number[], closed: boolean, steps = 6): number[] {
  const n = pts.length / 2;
  if (n < 3) return pts.slice();
  const at = (i: number): [number, number] => {
    const k = closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
    return [pts[k * 2], pts[k * 2 + 1]];
  };
  const out: number[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3),
      );
    }
  }
  if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return out;
}

/** A smoothed shape as a path, for filling, clipping or a plain stroke. */
export function smoothPath(pts: number[], closed: boolean, steps = 6): Path2D {
  const s = smooth(pts, closed, steps);
  const p = new Path2D();
  if (s.length < 4) return p;
  p.moveTo(s[0], s[1]);
  for (let i = 2; i < s.length; i += 2) p.lineTo(s[i], s[i + 1]);
  if (closed) p.closePath();
  return p;
}

/** The box round flat points. */
export function bounds(pts: number[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/* ---- The pen ---- */

export interface InkOptions {
  /** The line's middle width, in device px. */
  width: number;
  color: string;
  alpha?: number;
  /** How much thicker the shadow side gets, 0 to 1. */
  swell?: number;
  /** Shares of the length that taper to a point at the start and the end. */
  taper?: [number, number];
  /** How much the lit side breaks up, 0 (never) to 1 (often). */
  lost?: number;
  seed?: number;
  /** The way the light travels; the default is from the top left. */
  light?: [number, number];
  /** Already smoothed: draw the points as they are. */
  raw?: boolean;
  /** The thinnest the line may get where it is drawn at all, in device px. */
  min?: number;
}

/**
 * A line drawn the way a pen draws it: a filled ribbon whose width follows
 * the light. For a closed shape the outward side is worked out from its
 * winding, so the swell always lands on the side facing away from the light.
 */
export function inkLine(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean, o: InkOptions): void {
  const s = o.raw ? pts : smooth(pts, closed, 5);
  const n = s.length / 2;
  if (n < 2) return;
  const [lx, ly] = o.light ?? LIGHT;
  const swell = o.swell ?? 0.7;
  const lost = o.lost ?? 0.35;
  const [ta, tb] = o.taper ?? (closed ? [0, 0] : [0.12, 0.3]);
  const min = o.min ?? 0.35;
  const r = mulberry32(o.seed ?? 1);
  // Which way is outward: by the sign of the shape's area.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += s[i * 2] * s[j * 2 + 1] - s[j * 2] * s[i * 2 + 1];
  }
  const out = area > 0 ? -1 : 1;
  // Length along the line, for the taper and the breaks.
  const len: number[] = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(s[i * 2] - s[i * 2 - 2], s[i * 2 + 1] - s[i * 2 - 1]));
  const total = len[n - 1] || 1;
  // A slow wobble in the pressure, so no two lines are the same weight.
  const wob = [r() * 6.28, r() * 6.28, 0.02 + r() * 0.03];
  const widths: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    let dx = s[b * 2] - s[a * 2];
    let dy = s[b * 2 + 1] - s[a * 2 + 1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const ex = dy * out;
    const ey = -dx * out;
    nx.push(-dy);
    ny.push(dx);
    // Facing along the light is the shadow side; facing into it, the lit.
    const shade = closed ? 0.5 + 0.5 * (ex * lx + ey * ly) : 0.5 + 0.5 * Math.abs(-dy * lx + dx * ly) * 0.6;
    const t = len[i] / total;
    let w = o.width * (1 - swell * 0.55 + swell * 1.1 * shade);
    w *= 1 + 0.18 * Math.sin(wob[0] + len[i] * wob[2]) + 0.08 * Math.sin(wob[1] + len[i] * wob[2] * 3.1);
    if (ta > 0 && t < ta) w *= Math.sin(((t / ta) * Math.PI) / 2);
    if (tb > 0 && t > 1 - tb) w *= Math.sin((((1 - t) / tb) * Math.PI) / 2);
    // Where the light is hardest, the pen lifts now and then.
    if (lost > 0 && shade < 0.3) {
      const gap = Math.sin(wob[1] * 3 + len[i] * 0.045) * Math.sin(wob[0] * 2 + len[i] * 0.017);
      if (gap > 1 - lost * 0.9) w *= Math.max(0, 1 - (gap - (1 - lost * 0.9)) * 6);
    }
    widths.push(w);
  }
  ctx.save();
  ctx.fillStyle = o.color;
  ctx.globalAlpha *= o.alpha ?? 1;
  const ribbon = new Path2D();
  // Runs of the line wide enough to draw, each its own ribbon.
  let start = -1;
  const flush = (end: number) => {
    if (start < 0 || end - start < 1) return;
    ribbon.moveTo(s[start * 2] + (nx[start] * widths[start]) / 2, s[start * 2 + 1] + (ny[start] * widths[start]) / 2);
    for (let i = start + 1; i <= end; i++) ribbon.lineTo(s[i * 2] + (nx[i] * widths[i]) / 2, s[i * 2 + 1] + (ny[i] * widths[i]) / 2);
    for (let i = end; i >= start; i--) ribbon.lineTo(s[i * 2] - (nx[i] * widths[i]) / 2, s[i * 2 + 1] - (ny[i] * widths[i]) / 2);
    ribbon.closePath();
  };
  const count = closed ? n + 1 : n;
  for (let k = 0; k < count; k++) {
    const i = k % n;
    const ok = widths[i] >= min;
    if (ok && start < 0) start = i;
    if ((!ok || k === count - 1) && start >= 0) {
      flush(ok ? i : Math.max(start, (i - 1 + n) % n));
      start = -1;
    }
  }
  ctx.fill(ribbon);
  ctx.restore();
}

/* ---- Shading ---- */

/**
 * How shaded a point is, 0 lit to 1 dark, across a box: light from the
 * light's side, shadow on the far side, with the far edge darkest.
 */
export function shadeAcross(box: { x: number; y: number; w: number; h: number }, light: [number, number] = LIGHT): (x: number, y: number) => number {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const span = Math.max(1, (Math.abs(light[0]) * box.w + Math.abs(light[1]) * box.h) / 2);
  return (x, y) => Math.max(0, Math.min(1, 0.5 + (((x - cx) * light[0] + (y - cy) * light[1]) / span) * 0.6));
}

export interface HatchOptions {
  /** Device px between lines. */
  spacing: number;
  /** Radians; 0 is horizontal. */
  angle: number;
  /** 0 lit to 1 dark at a point. Lines are drawn only above `from`. */
  shade: (x: number, y: number) => number;
  from?: number;
  /** A second set of lines across the first where it is darker than this. */
  cross?: number;
  color: string;
  width: number;
  alpha?: number;
  /** How far the lines bow, as a share of the spacing, for a rounded form. */
  bow?: number;
  seed?: number;
}

/**
 * Engraved shading: parallel lines across a shape, drawn only where it is in
 * shadow, each line thickening into the dark and thinning out toward the
 * light, so the tone comes from the lines rather than a fill.
 */
export function hatch(ctx: CanvasRenderingContext2D, region: Path2D, box: { x: number; y: number; w: number; h: number }, o: HatchOptions): void {
  if (o.spacing < 0.8) return;
  const r = mulberry32(o.seed ?? 7);
  ctx.save();
  ctx.clip(region);
  ctx.fillStyle = o.color;
  ctx.globalAlpha *= o.alpha ?? 1;
  const sets: [number, number][] = [[o.angle, o.from ?? 0.45]];
  if (o.cross != null) sets.push([o.angle + 1.15, o.cross]);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radius = Math.hypot(box.w, box.h) / 2 + o.spacing;
  const step = Math.max(1, o.spacing * 0.5);
  const path = new Path2D();
  for (const [angle, from] of sets) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let off = -radius; off <= radius; off += o.spacing) {
      const jit = (r() - 0.5) * o.spacing * 0.25;
      let run: number[] = [];
      const flush = () => {
        if (run.length >= 6) {
          // A thin ribbon: the line's width follows the shade along it,
          // offset either side along the line's normal.
          const m = run.length / 3;
          const at = (i: number, side: number) => {
            const w = (run[i * 3 + 2] / 2) * side;
            return [run[i * 3] - dy * w, run[i * 3 + 1] + dx * w] as const;
          };
          const [sx, sy] = at(0, 1);
          path.moveTo(sx, sy);
          for (let i = 1; i < m; i++) path.lineTo(...at(i, 1));
          for (let i = m - 1; i >= 0; i--) path.lineTo(...at(i, -1));
          path.closePath();
        }
        run = [];
      };
      for (let t = -radius; t <= radius; t += step) {
        const bow = Math.sin((t / radius) * Math.PI) * (o.bow ?? 0) * o.spacing;
        const x = cx + dx * t - dy * (off + jit + bow);
        const y = cy + dy * t + dx * (off + jit + bow);
        const sh = o.shade(x, y);
        if (sh > from) {
          const w = o.width * Math.min(1.4, 0.25 + ((sh - from) / Math.max(0.05, 1 - from)) * 1.15);
          run.push(x, y, w);
        } else flush();
      }
      flush();
    }
  }
  ctx.fill(path);
  ctx.restore();
}

export interface StippleOptions {
  /** Device px between dots where it is darkest. */
  spacing: number;
  shade: (x: number, y: number) => number;
  color: string;
  /** Dot radius, device px. */
  radius: number;
  alpha?: number;
  seed?: number;
  /** Below this shade, no dots at all. */
  from?: number;
}

/**
 * Shading in dots, for soft and see-through things: a jittered grid, each
 * dot kept with a chance that rises with the shade, so the tone gathers
 * without the dots ever clumping into a pattern.
 */
export function stipple(ctx: CanvasRenderingContext2D, region: Path2D, box: { x: number; y: number; w: number; h: number }, o: StippleOptions): void {
  if (o.spacing < 1) return;
  const r = mulberry32(o.seed ?? 11);
  const from = o.from ?? 0.2;
  ctx.save();
  ctx.clip(region);
  ctx.fillStyle = o.color;
  ctx.globalAlpha *= o.alpha ?? 1;
  const dots = new Path2D();
  for (let y = box.y; y < box.y + box.h; y += o.spacing) {
    for (let x = box.x; x < box.x + box.w; x += o.spacing) {
      const px = x + (r() - 0.5) * o.spacing * 0.9;
      const py = y + (r() - 0.5) * o.spacing * 0.9;
      const sh = o.shade(px, py);
      if (sh <= from) {
        r();
        continue;
      }
      const keep = Math.pow((sh - from) / (1 - from), 1.4);
      if (r() > keep) continue;
      const rad = o.radius * (0.7 + 0.6 * r());
      dots.moveTo(px + rad, py);
      dots.arc(px, py, rad, 0, Math.PI * 2);
    }
  }
  ctx.fill(dots);
  ctx.restore();
}

/* ---- The brush ---- */

const grains = new WeakMap<object, CanvasPattern | null>();

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

/** Paper tooth: a small tile of noise, darker in its pits, made once. */
export function grain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grains.has(ctx)) return grains.get(ctx) ?? null;
  const size = 96;
  const c = makeCanvas(size, size);
  const g = c?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;
  let pattern: CanvasPattern | null = null;
  if (c && g) {
    const img = g.createImageData(size, size);
    const r = mulberry32(4242);
    // Two octaves of value noise, for pits of more than one size.
    const coarse = Array.from({ length: 24 * 24 }, () => r());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cv = coarse[(Math.floor(y / 4) % 24) * 24 + (Math.floor(x / 4) % 24)];
        const v = 0.55 * r() + 0.45 * cv;
        const k = (y * size + x) * 4;
        img.data[k] = 0;
        img.data[k + 1] = 0;
        img.data[k + 2] = 0;
        img.data[k + 3] = Math.round(Math.max(0, v - 0.45) * 255 * 0.9);
      }
    }
    g.putImageData(img, 0, 0);
    pattern = ctx.createPattern(c as CanvasImageSource, 'repeat');
  }
  grains.set(ctx, pattern);
  return pattern;
}

export interface WashOptions {
  color: string;
  alpha?: number;
  /** How much darker the pooled edge is, 0 to 1. */
  edge?: number;
  /** The colour of the paper, for the highlight left bare; null leaves none. */
  paper?: string | null;
  /** How strong the bare strip is, 0 to 1. */
  highlight?: number;
  /** How much the grain darkens the colour in its pits, 0 to 1. */
  granulate?: number;
  light?: [number, number];
  /** Device px to a CSS px, for the edge's width and the grain's scale. */
  px: number;
}

/**
 * Colour laid as watercolour over a shape: the base, then the pigment that
 * ran to the edge and dried darker there, then the paper left bare where the
 * light falls, then the grain catching pigment in its pits.
 */
export function washFill(ctx: CanvasRenderingContext2D, region: Path2D, box: { x: number; y: number; w: number; h: number }, o: WashOptions): void {
  const [lx, ly] = o.light ?? LIGHT;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = o.color;
  ctx.fill(region);
  ctx.clip(region);
  const edge = o.edge ?? 0.35;
  if (edge > 0) {
    ctx.strokeStyle = mixHex(o.color, '#1A1714', 0.35);
    ctx.globalAlpha = (o.alpha ?? 1) * edge;
    ctx.lineWidth = Math.max(1, 3 * o.px);
    ctx.stroke(region);
    ctx.globalAlpha = (o.alpha ?? 1) * edge * 0.5;
    ctx.lineWidth = Math.max(2, 7 * o.px);
    ctx.stroke(region);
  }
  if (o.paper && (o.highlight ?? 0.5) > 0) {
    // A soft strip near the lit edge, the colour lifted back to paper.
    const cx = box.x + box.w / 2 - lx * box.w * 0.22;
    const cy = box.y + box.h / 2 - ly * box.h * 0.22;
    const rad = Math.max(box.w, box.h) * 0.42;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, o.paper);
    g.addColorStop(1, `${o.paper}00`);
    ctx.globalAlpha = (o.alpha ?? 1) * (o.highlight ?? 0.5) * 0.7;
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.45);
    ctx.translate(-cx, -cy);
    ctx.fillRect(box.x - rad, box.y - rad, box.w + rad * 2, box.h + rad * 2);
    ctx.restore();
  }
  const gr = (o.granulate ?? 0.4) > 0 ? grain(ctx) : null;
  if (gr) {
    gr.setTransform?.(new DOMMatrix([o.px, 0, 0, o.px, 0, 0]));
    ctx.globalAlpha = (o.alpha ?? 1) * (o.granulate ?? 0.4);
    ctx.fillStyle = gr;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  ctx.restore();
}

/** How much drawing a size can carry: 0 for a speck, 1 at a poster's scale. */
export function detailFor(devicePx: number): number {
  return Math.max(0, Math.min(1, (devicePx - 40) / 360));
}

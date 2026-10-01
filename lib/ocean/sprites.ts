/**
 * Creatures, drawn once and then only moved.
 *
 * A crowded sea is sixty animals a frame, and drawing each one's every fin,
 * dot and tentacle sixty times a second is the kind of work that shows up as
 * a stutter on a phone. So each species is inked once, at the size it is
 * needed, onto a small canvas of its own, and the frame only places those:
 * sliced and nudged for a swimming wave, squeezed for a bell's beat. The
 * cache is bounded by memory, oldest out first.
 *
 * Each one is inked the way a natural-history plate is: a pen line that
 * swells on the shadow side and lifts where the light is hardest, colour
 * laid as watercolour with the paper left bare along the back, and, as the
 * drawing gets big enough to carry it, engraved hatching (stipple for the
 * see-through ones), fin rays, scales, a lateral line, a worked eye. Small,
 * for the live clock, it is only the line and the wash, so it stays cheap.
 */

import { mixHex } from '../fan';
import { buildAnatomy, type Anatomy, type LayerName, type Shape } from './anatomy';
import type { Species } from './biome';
import { creatureInk, type CreatureInk } from './palette';
import { bounds, detailFor, grain, hatch, inkLine, LIGHT, smooth, stipple, washFill } from './pen';
import { mulberry32 } from './random';

const anatomies = new WeakMap<Species, Anatomy>();

export function anatomyOf(species: Species): Anatomy {
  let a = anatomies.get(species);
  if (!a) {
    a = buildAnatomy(species.genome, species.seed);
    anatomies.set(species, a);
  }
  return a;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size in device pixels. */
  w: number;
  h: number;
}

/** Sizes step by this ratio, so a creature drawn a little bigger reuses its sprite. */
const STEP = 1.18;
/** The largest a sprite's canvas may be, on a side and in all (the iOS limit). */
const MAX_SIDE = 4096;
const MAX_AREA = 16e6;
/** How far past its disc a glow's light reaches. */
const REACH = 1.5;

export class SpriteCache {
  private map = new Map<string, Sprite>();
  private bytes = 0;

  constructor(private budget = 24e6) {}

  get(species: Species, lenCss: number, dark: boolean, dpr: number, vivid = false): Sprite | null {
    if (typeof document === 'undefined') return null;
    const bucket = Math.round(Math.log(Math.max(8, lenCss)) / Math.log(STEP));
    const key = `${species.id}|${bucket}|${dark ? 1 : 0}|${dpr}|${vivid ? 1 : 0}`;
    const hit = this.map.get(key);
    if (hit) {
      // Most recently used goes to the back of the line.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const sprite = render(species, Math.pow(STEP, bucket), dark, dpr, vivid);
    if (!sprite) return null;
    this.map.set(key, sprite);
    this.bytes += sprite.w * sprite.h * 4;
    for (const [k, s] of this.map) {
      if (this.bytes <= this.budget) break;
      this.map.delete(k);
      this.bytes -= s.w * s.h * 4;
    }
    return sprite;
  }
}

function render(species: Species, lenCss: number, dark: boolean, dpr: number, vivid: boolean): Sprite | null {
  const a = anatomyOf(species);
  const g = species.genome;
  const w = a.maxX - a.minX;
  const h = a.maxY - a.minY;
  const glow = g.lit || dark;
  // The halo is left out of the bounds, so it does not shrink the animal,
  // but it still needs the room: past the body, then its reach, or it is
  // cut square. Evenly on both sides, so the body stays centred.
  let ox = 0;
  let oy = 0;
  for (const s of [...a.layers.glowBack, ...a.layers.dotGlow]) {
    if (s.kind !== 'disc') continue;
    const k = a.layers.dotGlow.includes(s) ? REACH : 1;
    ox = Math.max(ox, a.minX - (s.x - s.rx * k), s.x + s.rx * k - a.maxX);
    oy = Math.max(oy, a.minY - (s.y - s.ry * k), s.y + s.ry * k - a.maxY);
  }
  const size = (sc: number) => {
    const padX = Math.ceil(ox * sc + (6 + (glow ? 22 : 0)) * dpr);
    const padY = Math.ceil(oy * sc + (6 + (glow ? 22 : 0)) * dpr);
    return { padX, padY, cw: Math.ceil(w * sc + padX * 2), ch: Math.ceil(h * sc + padY * 2) };
  };
  let scale = (lenCss * dpr) / Math.max(w, h);
  let box = size(scale);
  // Too big for a canvas: the whole animal a little smaller, never cropped.
  const over = Math.max(box.cw / MAX_SIDE, box.ch / MAX_SIDE, Math.sqrt((box.cw * box.ch) / MAX_AREA));
  if (over > 1) {
    scale /= over * 1.01;
    box = size(scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = box.cw;
  canvas.height = box.ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ink = creatureInk(g, dark, vivid);
  const devicePx = Math.max(w, h) * scale;
  // Line weights in device pixels, heavier on a bigger animal, and more
  // slowly so past the size of the live clock's nearest.
  const css = devicePx / dpr;
  const lw = (css <= 225 ? Math.max(0.6, Math.min(1.5, css / 150)) : 1.5 * Math.pow(css / 225, 0.35)) * dpr;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paint(ctx, a, ink, {
    scale,
    tx: box.padX - a.minX * scale,
    ty: box.padY - a.minY * scale,
    lw,
    dpr,
    detail: detailFor(devicePx),
    dark,
    clear: g.clear || g.plan === 'bell' || g.plan === 'comb' || g.plan === 'chain',
    bands: g.pattern === 'bands',
    plan: g.plan,
    lit: g.lit,
    seed: species.seed,
  });
  return { canvas, w: box.cw, h: box.ch };
}

/* ---- Shapes in device pixels ---- */

type Box = { x: number; y: number; w: number; h: number };

/** A shape moved from the creature's units onto the canvas. */
function place(s: Shape, k: number, tx: number, ty: number): Shape {
  if (s.kind === 'disc') return { kind: 'disc', x: s.x * k + tx, y: s.y * k + ty, rx: s.rx * k, ry: s.ry * k };
  const pts = new Array<number>(s.pts.length);
  for (let i = 0; i < s.pts.length; i += 2) {
    pts[i] = s.pts[i] * k + tx;
    pts[i + 1] = s.pts[i + 1] * k + ty;
  }
  return { kind: 'path', pts, close: s.close };
}

/**
 * A few-cornered outline split into thirds along each side, so the curve
 * through it keeps its points and straight runs instead of ballooning: a
 * forked tail stays forked.
 */
function densify(pts: number[], closed: boolean): number[] {
  const n = pts.length / 2;
  const out: number[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const [x0, y0, x1, y1] = [pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]];
    out.push(x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3);
  }
  if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return out;
}

/** The line a shape is drawn along: smoothed, or an ellipse's polygon. */
function lineOf(s: Shape, steps: number): number[] {
  if (s.kind === 'disc') {
    const n = Math.max(12, Math.min(64, Math.round(Math.max(s.rx, s.ry) * 0.9)));
    const out: number[] = [];
    // Clockwise from the right, as the bodies are wound.
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      out.push(s.x + Math.cos(t) * s.rx, s.y + Math.sin(t) * s.ry);
    }
    return out;
  }
  if (s.pts.length < 6) return s.pts;
  const pts = thin(s.pts, s.close);
  // Only as many steps between two points as there are pixels to show them.
  const n = pts.length / 2;
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.abs(pts[i * 2] - pts[i * 2 - 2]) + Math.abs(pts[i * 2 + 1] - pts[i * 2 - 1]);
  const k = Math.max(1, Math.min(steps, Math.ceil(len / Math.max(1, n - 1) / 3)));
  // Sharp few-cornered shapes (a fin, a gill slit, a leg) keep their corners.
  const corners = s.close ? n < 10 : n < 5;
  return smooth(corners ? densify(pts, s.close) : pts, s.close, corners ? Math.max(2, k) : k);
}

/**
 * Points closer together than a device pixel and a half dropped: a long
 * tentacle drawn small is hundreds of points on top of each other, and
 * the curve through the rest is the same line for a fraction of the work.
 */
function thin(pts: number[], closed: boolean): number[] {
  const n = pts.length / 2;
  if (n < 12) return pts;
  const out = [pts[0], pts[1]];
  let lx = pts[0];
  let ly = pts[1];
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    if ((x - lx) * (x - lx) + (y - ly) * (y - ly) < 2.25) continue;
    out.push(x, y);
    lx = x;
    ly = y;
  }
  out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  // A closed shape keeps at least a few corners, or it is no shape at all.
  return out.length >= (closed ? 8 : 4) ? out : pts;
}

function pathOf(lines: { pts: number[]; close: boolean }[]): Path2D {
  const p = new Path2D();
  for (const { pts, close } of lines) {
    if (pts.length < 4) continue;
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    if (close) p.closePath();
  }
  return p;
}

function boxOf(lines: { pts: number[] }[]): Box {
  const all: number[] = [];
  for (const l of lines) for (const v of l.pts) all.push(v);
  return bounds(all);
}

/* ---- Light across a body ---- */

/**
 * How shaded each point of a shape is, 0 lit to 1 dark, read from the shape
 * itself: for every point, how far it is to the edge going into the light
 * against how far going away from it. A round form in cross-section, so the
 * shadow follows a fish's belly, an eel's bends and a star's every arm, not
 * one straight line across the box. Worked out on a coarse grid and then
 * read smoothly between its cells.
 */
function shadeField(region: Path2D, box: Box, fineness: number): (x: number, y: number) => number {
  // Cells about the size of the gap between two lines: finer is wasted.
  const cell = Math.max(fineness, Math.max(box.w, box.h) / 150);
  const gw = Math.ceil(box.w / cell) + 3;
  const gh = Math.ceil(box.h / cell) + 3;
  const c = document.createElement('canvas');
  c.width = gw;
  c.height = gh;
  const g = c.getContext('2d', { willReadFrequently: true });
  const zero = () => 0;
  if (!g) return zero;
  const x0 = box.x - cell;
  const y0 = box.y - cell;
  g.setTransform(1 / cell, 0, 0, 1 / cell, -x0 / cell, -y0 / cell);
  g.fill(region);
  const alpha = g.getImageData(0, 0, gw, gh).data;
  const inside = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) inside[i] = alpha[i * 4 + 3] > 110 ? 1 : 0;
  const [lx, ly] = LIGHT;
  const march = (x: number, y: number, dx: number, dy: number) => {
    let d = 0;
    let px = x + 0.5;
    let py = y + 0.5;
    for (;;) {
      px += dx;
      py += dy;
      d++;
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= gw || iy >= gh || !inside[iy * gw + ix]) return d;
    }
  };
  const raw = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!inside[y * gw + x]) continue;
      const toLit = march(x, y, -lx, -ly);
      const toDark = march(x, y, lx, ly);
      raw[y * gw + x] = toLit / (toLit + toDark);
    }
  }
  // One soft pass, so the grid's steps never show in a line's width.
  const f = new Float32Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      if (!inside[i]) continue;
      let sum = 0;
      let n = 0;
      for (let k = -1; k <= 1; k++) {
        for (let j = -1; j <= 1; j++) {
          const q = i + k * gw + j;
          if (inside[q]) {
            sum += raw[q];
            n++;
          }
        }
      }
      f[i] = sum / n;
    }
  }
  // The whole animal is darker toward its far side, too.
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const span = Math.max(1, (lx * box.w + ly * box.h) / 2);
  return (x, y) => {
    const u = (x - x0) / cell - 0.5;
    const v = (y - y0) / cell - 0.5;
    const ix = Math.floor(u);
    const iy = Math.floor(v);
    if (ix < 0 || iy < 0 || ix >= gw - 1 || iy >= gh - 1) return 0;
    const fx = u - ix;
    const fy = v - iy;
    const i = iy * gw + ix;
    const s = (f[i] * (1 - fx) + f[i + 1] * fx) * (1 - fy) + (f[i + gw] * (1 - fx) + f[i + gw + 1] * fx) * fy;
    const across = ((x - cx) * lx + (y - cy) * ly) / span;
    return Math.max(0, Math.min(1, s * 0.85 + across * 0.15 + 0.04));
  };
}

/* ---- Painting ---- */

interface Paint {
  scale: number;
  tx: number;
  ty: number;
  /** One line weight, device px. */
  lw: number;
  dpr: number;
  /** 0 a speck, 1 a poster: how much drawing the size carries. */
  detail: number;
  dark: boolean;
  /** See-through: stippled rather than hatched, with a lit rim on dark water. */
  clear: boolean;
  bands: boolean;
  plan: string;
  lit: boolean;
  seed: number;
}

const ramp = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));

function paint(ctx: CanvasRenderingContext2D, a: Anatomy, ink: CreatureInk, o: Paint) {
  const { lw, dpr, detail, dark } = o;
  const steps = detail < 0.15 ? 3 : detail < 0.5 ? 4 : 6;
  const L = {} as Record<LayerName, Shape[]>;
  for (const k of Object.keys(a.layers) as LayerName[]) L[k] = a.layers[k].map((s) => place(s, o.scale, o.tx, o.ty));
  const lines = (k: LayerName) => L[k].map((s) => ({ pts: lineOf(s, steps), close: s.kind === 'disc' || s.close }));
  /** A layer as one path to fill or stroke: discs as true ellipses. */
  const shapes = (k: LayerName) => {
    const p = new Path2D();
    for (const s of L[k]) {
      if (s.kind === 'disc') {
        p.moveTo(s.x + s.rx, s.y);
        p.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      } else {
        const pts = lineOf(s, steps);
        if (pts.length < 4) continue;
        p.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
        if (s.close) p.closePath();
      }
    }
    return p;
  };
  /** How strongly the fine work shows: none small, all of it by poster size. */
  const fine = ramp(detail, 0.45, 0.7);
  // The live clock's animals are mostly below this: only its nearest few,
  // and anything drawn for a picture, carry shading.
  const shaded = detail > 0.58;
  const pen = ink.pen;
  // The wash's pooled edge and bare strip go with the animal's size; its
  // grain with the paper's.
  const edgePx = Math.max(0.5, lw / 1.2);
  const lost = 0.12 + 0.28 * detail;
  // A light line on dark water reads heavier than the same line dark on light.
  const weight = dark ? 0.78 : 1;
  /** Too small for the pen's pressure or the wash's bare strip to show. */
  const tiny = detail < 0.12;
  let seed = o.seed;
  const nextSeed = () => (seed = (seed * 1103515245 + 12345) >>> 0);

  const plain = (k: LayerName, width: number, alpha: number, color = pen) => {
    if (!L[k].length || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.35, width * lw);
    ctx.stroke(shapes(k));
    ctx.restore();
  };
  const grainOver = (region: Path2D, box: Box, amount: number) => {
    if (detail < 0.3 || amount <= 0) return;
    const gr = grain(ctx);
    if (!gr) return;
    gr.setTransform?.(new DOMMatrix([dpr, 0, 0, dpr, 0, 0]));
    ctx.save();
    ctx.clip(region);
    ctx.globalAlpha = amount * ramp(detail, 0.3, 0.6);
    ctx.fillStyle = gr;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
  };
  const glows = (shapes: Shape[], color: string, alpha: number, reach: number) => {
    // Light, not a smudge: bright at its heart and falling away fast, then
    // a long faint reach that ends nowhere in particular.
    // One unit gradient, placed and scaled for each light.
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [t, k] of [[0, 1], [0.15, 0.78], [0.35, 0.5], [0.6, 0.22], [0.82, 0.07], [1, 0]] as const) {
      gr.addColorStop(t, `${color}${Math.round(255 * Math.min(1, alpha * k)).toString(16).padStart(2, '0')}`);
    }
    ctx.save();
    ctx.fillStyle = gr;
    for (const s of shapes) {
      if (s.kind !== 'disc') continue;
      if (Math.max(s.rx, s.ry) * reach < 0.5) continue;
      ctx.setTransform(s.rx * reach, 0, 0, s.ry * reach, s.x, s.y);
      ctx.fillRect(-1, -1, 2, 2);
    }
    ctx.restore();
  };

  // Behind it all, the light it carries.
  if (ink.glow) glows(L.glowBack, ink.glow, o.lit ? 0.4 : 0.22, 1);

  // Tentacles and legs: pen lines that taper to a hair.
  /** The pen round a shape; a speck gets one plain stroke, the same to the eye. */
  const outline = (shapes: { pts: number[]; close: boolean }[], width: number) => {
    if (!shapes.length) return;
    if (tiny) {
      ctx.save();
      ctx.strokeStyle = pen;
      ctx.lineWidth = Math.max(0.35, width * weight * lw * 0.85);
      ctx.stroke(pathOf(shapes));
      ctx.restore();
      return;
    }
    for (const f of shapes) inkLine(ctx, f.pts, true, { width: width * weight * lw, color: pen, swell: 0.7, lost, raw: true, seed: nextSeed() });
  };
  const strand = (k: LayerName, width: number, alpha: number, taper: [number, number]) => {
    if (tiny) {
      // Too small for a taper to show: one plain stroke for all of them.
      plain(k, width * weight * 0.8, alpha);
      return;
    }
    for (const s of L[k]) {
      if (s.kind !== 'path') continue;
      inkLine(ctx, lineOf(s, steps), false, {
        width: width * weight * lw,
        color: pen,
        alpha,
        swell: 0.5,
        taper,
        lost: 0,
        min: 0.25,
        raw: true,
        seed: nextSeed(),
      });
    }
  };
  strand('tentB', o.clear ? 0.85 : 1, dark ? 0.6 : 0.7, [0.03, 0.8]);
  strand('legs', 1.3, 1, [0.04, 0.45]);

  // Fins: a paler wash, the rays and their membrane, then the line.
  const finLines = lines('fin');
  if (finLines.length) {
    const region = pathOf(finLines);
    const box = boxOf(finLines);
    washFill(ctx, region, box, { color: ink.fin, alpha: ink.finAlpha, edge: 0.3, paper: null, granulate: 0, px: edgePx });
    grainOver(region, box, 0.22);
    if (fine > 0 && L.rays.length) {
      ctx.save();
      ctx.clip(region);
      // The membrane between the rays: pigment gathered along each ray.
      plain('rays', 2.2, 0.18 * fine, mixHex(ink.fin, pen, 0.35));
      plain('rays', 0.42, 0.5 * fine);
      ctx.restore();
    }
  }
  // The old straight tail rays give way to the fine ones as they come in.
  if (L.finRay.length) {
    const keep = fine > 0.5 ? L.finRay.slice(a.tailRays) : L.finRay;
    const saved = L.finRay;
    L.finRay = keep;
    plain('finRay', 0.5, 0.5 * (fine > 0.5 ? 1 : 1 - fine * 0.6));
    L.finRay = saved;
  }
  outline(finLines, 0.85);

  // The body: the wash, its markings, the shading, then the line round it.
  const bodyLines = lines('body');
  const body = bodyLines.length ? pathOf(bodyLines) : null;
  const bodyBox = bodyLines.length ? boxOf(bodyLines) : null;
  if (body && bodyBox) {
    washFill(ctx, body, bodyBox, {
      color: ink.body,
      alpha: ink.bodyAlpha,
      edge: o.clear ? 0.45 : 0.35,
      paper: ink.paper,
      highlight: tiny ? 0 : dark ? 0.45 : 0.85,
      granulate: 0,
      px: edgePx,
    });
    grainOver(body, bodyBox, o.clear ? 0.18 : 0.3);
  }
  plain('guts', 0.7, 0.45);
  const inBody = (draw: () => void) => {
    ctx.save();
    if (body) ctx.clip(body);
    draw();
    ctx.restore();
  };
  inBody(() => {
    if (L.gutFill.length) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ink.pat;
      ctx.fill(shapes('gutFill'));
    }
    if (L.pat.length) {
      const p = shapes('pat');
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = ink.pat;
      ctx.fill(p);
      if (detail > 0.3) {
        // Each spot dried with a darker rim, as a dropped wash does.
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = mixHex(ink.pat, '#1A1714', 0.35);
        ctx.lineWidth = Math.max(0.5, 0.5 * lw);
        ctx.stroke(p);
      }
    }
    ctx.globalAlpha = 1;
    plain('patLine', o.bands ? 4 : 1.4, 0.75, ink.pat);
    if (fine > 0 && L.scales.length && bodyBox) {
      // Scales, fading out toward the belly.
      const gr = ctx.createLinearGradient(0, bodyBox.y, 0, bodyBox.y + bodyBox.h);
      gr.addColorStop(0, pen);
      gr.addColorStop(0.55, `${pen}99`);
      gr.addColorStop(0.9, `${pen}00`);
      ctx.save();
      ctx.globalAlpha = 0.42 * fine;
      ctx.strokeStyle = gr;
      ctx.lineWidth = Math.max(0.35, 0.36 * lw);
      ctx.stroke(shapes('scales'));
      ctx.restore();
    }
    if (shaded && body && bodyBox) shade(ctx, body, bodyBox, ink, o);
  });
  plain('lines', 0.45, 0.6 * fine);
  plain('detail', 0.6, 0.55);
  outline(bodyLines, 1.2);
  strand('tentF', 1.3, 1, [0.04, 0.6]);

  // Beads, and the fine nodes: stinging cells, suckers, knobs.
  if (L.beads.length) {
    const p = shapes('beads');
    ctx.fillStyle = ink.pat;
    ctx.fill(p);
    if (detail > 0.3) {
      ctx.strokeStyle = pen;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = Math.max(0.35, 0.4 * lw);
      ctx.stroke(p);
      ctx.globalAlpha = 1;
    }
  }
  if (fine > 0 && L.nodes.length) {
    const p = shapes('nodes');
    ctx.globalAlpha = 0.55 * fine;
    ctx.fillStyle = mixHex(ink.pat, pen, 0.25);
    ctx.fill(p);
    ctx.globalAlpha = 0.6 * fine;
    ctx.strokeStyle = pen;
    ctx.lineWidth = Math.max(0.3, 0.3 * lw);
    ctx.stroke(p);
    ctx.globalAlpha = 1;
  }

  // Its own lights: a glow round each, then the organ itself.
  if (ink.glow) glows(L.dotGlow, ink.glow, dark ? 0.75 : 0.5, REACH);
  if (L.dots.length) {
    const p = shapes('dots');
    ctx.fillStyle = ink.dot;
    ctx.fill(p);
    if (fine > 0 && o.lit) {
      // A photophore, big: a ring of its lens round a bright point.
      ctx.globalAlpha = 0.7 * fine;
      ctx.strokeStyle = mixHex(ink.dot, pen, dark ? 0.2 : 0.55);
      ctx.lineWidth = Math.max(0.35, 0.35 * lw);
      ctx.stroke(p);
      ctx.fillStyle = '#FFFDF6';
      for (const s of L.dots) {
        if (s.kind !== 'disc') continue;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx * 0.35, s.ry * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Eyes, each with its own pupil.
  L.eye.forEach((e, i) => {
    const p = L.pupil[i];
    if (e.kind === 'disc') eye(ctx, e, p && p.kind === 'disc' ? p : null, ink, o, nextSeed());
  });
  strand('lure', 0.9, 1, [0, 0.15]);
  ctx.globalAlpha = 1;
}

/** The engraver's tone: hatching for a solid animal, stipple for a clear one. */
function shade(ctx: CanvasRenderingContext2D, body: Path2D, box: Box, ink: CreatureInk, o: Paint) {
  const { detail, dark, lw } = o;
  const field = shadeField(body, box, (4 - 1.2 * detail) * 0.75);
  const k = ramp(detail, 0.58, 0.75);
  if (o.clear) {
    const spacing = 4.2 - 1.6 * detail;
    stipple(ctx, body, box, {
      spacing,
      shade: field,
      color: dark ? mixHex(ink.body, '#000000', 0.5) : ink.pen,
      radius: Math.max(0.45, spacing * 0.16),
      alpha: (dark ? 0.55 : 0.5) * k,
      from: 0.42,
      seed: o.seed ^ 0x5f3,
    });
    if (dark) {
      // A see-through body in the dark shows as its edges: the rim catches
      // more light than the middle.
      ctx.save();
      ctx.strokeStyle = ink.pen;
      ctx.globalAlpha = 0.1 * k;
      ctx.lineWidth = lw * 7;
      ctx.stroke(body);
      ctx.globalAlpha = 0.16 * k;
      ctx.lineWidth = lw * 3;
      ctx.stroke(body);
      ctx.restore();
    }
    return;
  }
  // Lines along the body for a swimmer, across the arms for a star.
  const angle = o.plan === 'star' ? 0.55 : o.plan === 'ray' ? 0.35 : -0.08;
  const spacing = 4 - 1.2 * detail;
  const bow = (Math.min(box.w, box.h) * 0.12) / spacing;
  if (dark) {
    // On dark water the line is light, so it draws the light as well as
    // the shadow: as on scratchboard, fine light lines along the lit back,
    // and the belly worked darker than the wash.
    hatch(ctx, body, box, {
      spacing,
      angle,
      shade: field,
      from: 0.55,
      cross: 0.85,
      color: mixHex(ink.body, '#000000', 0.65),
      width: spacing * 0.4,
      alpha: 0.7 * k,
      bow,
      seed: o.seed ^ 0x2c1,
    });
    hatch(ctx, body, box, {
      spacing: spacing * 1.3,
      angle,
      shade: (x, y) => 1 - field(x, y),
      from: 0.6,
      color: ink.pen,
      width: spacing * 0.3,
      alpha: 0.4 * k,
      bow,
      seed: o.seed ^ 0x1b7,
    });
    return;
  }
  hatch(ctx, body, box, {
    spacing,
    angle,
    shade: field,
    from: 0.52,
    cross: 0.8,
    color: ink.pen,
    width: spacing * 0.36,
    alpha: 0.62 * k,
    bow,
    seed: o.seed ^ 0x2c1,
  });
}

/**
 * An eye as a plate draws it, when there is room: the iris with fine lines
 * running in to the pupil, a darker ring at its edge, the shadow the top of
 * the socket throws, and two points of light. Small, only the white, the
 * pupil and the ring.
 */
function eye(
  ctx: CanvasRenderingContext2D,
  e: { x: number; y: number; rx: number; ry: number },
  p: { x: number; y: number; rx: number; ry: number } | null,
  ink: CreatureInk,
  o: Paint,
  seed: number,
) {
  const { lw, detail, dark } = o;
  const r = e.rx;
  const ring = Math.max(0.35, 0.8 * lw);
  const disc = (x: number, y: number, rad: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad, 0, 0, Math.PI * 2);
  };
  if (detail < 0.3 || r < 6) {
    disc(e.x, e.y, r);
    ctx.fillStyle = ink.eyeW;
    ctx.fill();
    ctx.strokeStyle = ink.pen;
    ctx.lineWidth = Math.min(ring, r * 0.4);
    ctx.stroke();
    if (p) {
      disc(p.x, p.y, p.rx);
      ctx.fillStyle = ink.pupil;
      ctx.fill();
      if (p.rx > 2.2) {
        disc(p.x - p.rx * 0.3, p.y - p.rx * 0.35, p.rx * 0.28);
        ctx.fillStyle = '#FFFDF6';
        ctx.fill();
      }
    }
    return;
  }
  const px = p?.x ?? e.x;
  const py = p?.y ?? e.y;
  const pr = p?.rx ?? r * 0.5;
  const ir = Math.min(r * 0.9, pr * 1.55);
  ctx.save();
  disc(e.x, e.y, r);
  ctx.fillStyle = ink.eyeW;
  ctx.fill();
  ctx.clip();
  // The iris: lighter in to the pupil, a ring of darker at its rim.
  const iris = dark ? mixHex(ink.eyeW, '#1A1815', 0.35) : mixHex(ink.body, '#B08A3E', 0.45);
  const g = ctx.createRadialGradient(px, py, pr * 0.8, px, py, ir);
  g.addColorStop(0, mixHex(iris, '#FBF8EF', 0.25));
  g.addColorStop(0.75, iris);
  g.addColorStop(1, mixHex(iris, '#1A1714', 0.45));
  disc(px, py, ir);
  ctx.fillStyle = g;
  ctx.fill();
  const rand = mulberry32(seed);
  const n = Math.round(24 + 20 * detail);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + rand() * 0.08;
    const r0 = pr * (1.02 + rand() * 0.1);
    const r1 = ir * (0.82 + rand() * 0.15);
    ctx.moveTo(px + Math.cos(t) * r0, py + Math.sin(t) * r0);
    ctx.lineTo(px + Math.cos(t + 0.06) * r1, py + Math.sin(t + 0.06) * r1);
  }
  ctx.strokeStyle = mixHex(iris, '#1A1714', 0.6);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.3, 0.28 * lw);
  ctx.stroke();
  ctx.globalAlpha = 1;
  disc(px, py, ir);
  ctx.strokeStyle = mixHex(iris, '#1A1714', 0.7);
  ctx.lineWidth = Math.max(0.5, ir * 0.12);
  ctx.stroke();
  disc(px, py, pr);
  ctx.fillStyle = ink.pupil;
  ctx.fill();
  // The shadow under the top of the socket.
  const lid = ctx.createLinearGradient(0, e.y - r, 0, e.y + r * 0.1);
  lid.addColorStop(0, 'rgba(26,23,20,0.45)');
  lid.addColorStop(1, 'rgba(26,23,20,0)');
  ctx.fillStyle = lid;
  ctx.fillRect(e.x - r, e.y - r, r * 2, r * 1.1);
  // Two points of light: the window, and its small echo.
  ctx.fillStyle = '#FFFDF6';
  disc(px - pr * 0.32, py - pr * 0.38, pr * 0.3);
  ctx.globalAlpha = 0.95;
  ctx.fill();
  disc(px + pr * 0.38, py + pr * 0.3, pr * 0.12);
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.restore();
  const circle: number[] = [];
  const m = 36;
  for (let i = 0; i < m; i++) circle.push(e.x + Math.cos((i / m) * Math.PI * 2) * r, e.y + Math.sin((i / m) * Math.PI * 2) * r);
  inkLine(ctx, circle, true, { width: ring, color: ink.pen, swell: 0.6, lost: 0, raw: true, seed });
}

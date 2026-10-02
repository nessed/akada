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
import { buildAnatomy, crownOf, jawed, type Anatomy, type LayerName, type Shape, type Tube } from './anatomy';
import type { Species } from './biome';
import { creatureInk, type CreatureInk } from './palette';
import { bounds, contourHatch, detailFor, grain, hatch, inkLine, LIGHT, mottle, poolEdge, shadeAcross, smooth, stipple, tubeWash, washFill } from './pen';
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

/** How heavy the pen is against the page: a print's line is finer than a screen's. */
export interface PenScale {
  /** The page's short side, in the units `get` is given lengths in (CSS px
      for the live clock, the picture's own units for a picture). Defaults to
      the window's short side. */
  page?: number;
  /** A print: the finer line. */
  print?: boolean;
}

function screenPage(): number {
  if (typeof window === 'undefined' || !(window.innerWidth > 0)) return 800;
  return Math.max(360, Math.min(1400, Math.min(window.innerWidth, window.innerHeight)));
}

export class SpriteCache {
  private map = new Map<string, Sprite>();
  private bytes = 0;
  private pen: { page: number; print: boolean };

  constructor(
    private budget = 24e6,
    pen: PenScale = {},
  ) {
    this.pen = { page: pen.page ?? screenPage(), print: pen.print ?? false };
  }

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
    const sprite = render(species, Math.pow(STEP, bucket), dark, dpr, vivid, this.pen);
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

function render(species: Species, lenCss: number, dark: boolean, dpr: number, vivid: boolean, pen: { page: number; print: boolean }): Sprite | null {
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
  // The pen is the page's, not the animal's: one weight for every animal on
  // a plate, as one burin cut them all. A sprite drawn smaller than asked
  // (the canvas limit) keeps its lines in step with it.
  const shrink = scale / ((lenCss * dpr) / Math.max(w, h));
  const base = Math.max(0.25, (pen.print ? 0.0009 : 0.0012) * pen.page * dpr * shrink);
  const spacing = 0.0025 * pen.page * dpr * shrink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paint(ctx, a, ink, {
    scale,
    tx: box.padX - a.minX * scale,
    ty: box.padY - a.minY * scale,
    base,
    spacing,
    dpr,
    detail: pen.print ? Math.max(detailFor(devicePx), printDetail(devicePx, spacing)) : detailFor(devicePx),
    dark,
    // (A sea star is never glass: it is a solid animal on the ground.)
    clear: (g.clear && !jawed(g) && g.plan !== 'star') || g.plan === 'bell' || g.plan === 'comb' || g.plan === 'chain',
    plan: g.plan,
    crown: crownOf(g, species.seed),
    jawed: jawed(g),
    lit: g.lit,
    seed: species.seed,
  });
  return { canvas, w: box.cw, h: box.ch };
}

/**
 * How much drawing a printed animal carries: judged by how many of the
 * page's hatching lines it spans, not by its raw size. A plate's small fish
 * is engraved with the same burin as its big one, just with fewer strokes, so
 * an animal a print shows twenty lines long already gets its pressure line,
 * its graded wash and its contour hatching, and by thirty its fins' rays and
 * its lateral line. (The live clock keeps `detailFor`, which stays cheap: a
 * sprite there is redrawn whenever a size bucket is first met.)
 */
export function printDetail(devicePx: number, spacing: number): number {
  const lines = devicePx / Math.max(0.5, spacing);
  return Math.max(0, Math.min(1, (lines - 6) / 22));
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
  /** The pen's base weight, device px: the page's, the same for every animal on it. */
  base: number;
  /** Device px between two lines of hatching: the page's, too. */
  spacing: number;
  dpr: number;
  /** 0 a speck, 1 a poster: how much drawing the size carries. */
  detail: number;
  dark: boolean;
  /** See-through: stippled rather than hatched, with a lit rim on dark water. */
  clear: boolean;
  plan: string;
  /** A crown jelly's form, if it is one. */
  crown: 'atolla' | 'periphylla' | null;
  /** One of the jawed hunters (an angler, a dragonfish): one dark wash. */
  jawed: boolean;
  lit: boolean;
  seed: number;
}

const ramp = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));
const PAPER = '#FBF8EF';
const DARK = '#1A1714';
/** The gonads' wash, through a clear bell: a soft rose. */
const GONAD = '#E8C9D4';
/**
 * A crown jelly's stomach and the stain of its pedalia: the deep's wine red,
 * dark on any water (red is the first light the deep takes away).
 */
const CROWN_GUT = { light: '#5B1E2E', dark: '#4A1A2A' } as const;
/** The play of light down a comb row, on dark water. */
const IRIDESCENT = ['#8FE3FF', '#B9F7C4', '#FFE79A', '#FFB0D6', '#BBA6FF', '#8FE3FF'];

function paint(ctx: CanvasRenderingContext2D, a: Anatomy, ink: CreatureInk, o: Paint) {
  const { base, dpr, detail, dark } = o;
  const steps = detail < 0.15 ? 3 : detail < 0.5 ? 4 : 6;
  const L = {} as Record<LayerName, Shape[]>;
  for (const k of Object.keys(a.layers) as LayerName[]) L[k] = a.layers[k].map((s) => place(s, o.scale, o.tx, o.ty));
  const tubes: Tube[] = a.tubes.map((t) => ({ a: t.a.map((v, i) => v * o.scale + (i % 2 ? o.ty : o.tx)), b: t.b.map((v, i) => v * o.scale + (i % 2 ? o.ty : o.tx)) }));
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
  const pen = ink.pen;
  // A light line on dark water reads heavier than the same line dark on light.
  const weight = dark ? 0.85 : 1;
  /** Too small for the pen's pressure or the wash's bare strip to show: plain strokes, and cheap. */
  const tiny = detail < 0.12;
  /** Big enough for the graded wash and the hatching: below this the live clock's sprites stay cheap. */
  const heavy = detail > 0.58;
  let seed = o.seed;
  const nextSeed = () => (seed = (seed * 1103515245 + 12345) >>> 0);

  const plain = (k: LayerName, width: number, alpha: number, color = pen) => {
    if (!L[k].length || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.25, width * base * weight);
    ctx.stroke(shapes(k));
    ctx.restore();
  };
  /** The pen round shapes, or along them: the plate's law, or one plain stroke for a speck. */
  const penLines = (ls: { pts: number[]; close: boolean }[], width: number, alpha = 1, color = pen, taper: [number, number] = [0, 0.12]) => {
    if (!ls.length || alpha <= 0) return;
    if (tiny) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.25, width * weight * base * 0.85);
      ctx.stroke(pathOf(ls));
      ctx.restore();
      return;
    }
    for (const f of ls) {
      if (f.pts.length < 4) continue;
      inkLine(ctx, f.pts, f.close, { width: width * weight * base, color, alpha, taper: f.close ? undefined : taper, raw: true, plate: true, seed: nextSeed() });
    }
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
  /**
   * A watercolour wash: laid, pooled at its edge, uneven, grained. Never a
   * lifted highlight: a soft pale blot on a body reads as gloss on plastic,
   * so the light is left to the bare strip a graded wash keeps and to the
   * thinner line on the lit side.
   */
  const wash = (region: Path2D, box: Box, color: string, alpha: number, edge: number, grainAmt: number) => {
    const cheap = detail < 0.3;
    washFill(ctx, region, box, { color, alpha, edge: cheap ? edge * 0.8 : 0, paper: null, granulate: 0, px: Math.max(0.5, base * 0.5) });
    if (cheap) return;
    const m = Math.min(box.w, box.h);
    poolEdge(ctx, region, mixHex(color, DARK, 0.4), alpha * edge, Math.max(1, Math.min(m * 0.07, base * 6)), base * 0.45);
    if (heavy) mottle(ctx, region, box, mixHex(color, DARK, 0.18), ink.paper ?? PAPER, alpha * 0.16 * ramp(detail, 0.3, 0.55), o.seed ^ 0x6d1);
    grainOver(region, box, grainAmt);
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
  const strand = (k: LayerName, width: number, alpha: number, taper: [number, number]) => {
    const ls = L[k].filter((s) => s.kind === 'path').map((s) => ({ pts: lineOf(s, steps), close: false }));
    penLines(ls, width, alpha, pen, taper);
  };
  strand('tentB', o.clear ? 0.62 : 0.75, dark ? 0.62 : 0.72, [0.03, 0.75]);
  strand('legs', 0.95, 1, [0.04, 0.45]);

  // A squid's arms: the body's wash, under the head.
  const limbLines = lines('limb');
  if (limbLines.length) {
    const region = pathOf(limbLines);
    const box = boxOf(limbLines);
    wash(region, box, mixHex(ink.body, ink.fin, 0.3), ink.bodyAlpha, 0.3, 0.25);
    penLines(limbLines, 0.7);
  }

  // Fins: a paler wash, the rays and their membrane, then the line.
  const finLines = lines('fin');
  if (finLines.length) {
    const region = pathOf(finLines);
    const box = boxOf(finLines);
    wash(region, box, ink.fin, ink.finAlpha, 0.28, 0.22);
    if (fine > 0 && L.rays.length) {
      ctx.save();
      ctx.clip(region);
      // The membrane between the rays: pigment gathered along each ray.
      plain('rays', 2.4, 0.16 * fine, mixHex(ink.fin, pen, 0.35));
      plain('rays', 0.38, 0.55 * fine);
      ctx.restore();
    }
  }
  // The old straight tail rays give way to the fine ones as they come in.
  // They stay inside the tail: a crescent's rays past its edge are whiskers.
  if (L.finRay.length) {
    const saved = L.finRay;
    const alpha = 0.5 * (fine > 0.5 ? 1 : 1 - fine * 0.6);
    const tail = fine > 0.5 ? [] : saved.slice(0, a.tailRays);
    if (tail.length && finLines.length) {
      L.finRay = tail;
      ctx.save();
      ctx.clip(pathOf(finLines));
      plain('finRay', 0.45, alpha);
      ctx.restore();
    }
    L.finRay = saved.slice(a.tailRays);
    plain('finRay', 0.45, alpha);
    L.finRay = saved;
  }
  penLines(finLines, 0.72);

  // The body: the wash, its markings, the shading, then the line round it.
  const bodyLines = lines('body');
  const body = bodyLines.length ? pathOf(bodyLines) : null;
  const bodyBox = bodyLines.length ? boxOf(bodyLines) : null;
  const solidTubes = !o.clear && tubes.length > 0;
  /** A sea star is worked in the pen from a small size, not only a poster's: it lies on the engraved ground. (The live clock's small ones stay cheap.) */
  const starred = o.plan === 'star' && solidTubes && detail >= 0.25;
  if (body && bodyBox) {
    if (starred) {
      starWash(ctx, body, bodyBox, tubes, ink, o);
    } else if (heavy && solidTubes && !tiny) {
      // Graded across the body: for a swimmer, darker along the back, the
      // upper flank let go broadly toward bare paper (broad and soft, never a
      // narrow bright stripe, which reads as a gloss), the belly paler; for a
      // star's arm, lighter on its lit side and down into its shadow.
      const paperTone = ink.paper ?? PAPER;
      const back = o.plan === 'fish' || o.plan === 'eel' || o.plan === 'squid' || o.plan === 'crawler';
      const stops: [number, string][] = o.jawed
        ? [
            // One deep wash, only a little lifted along the flank, so the
            // globe still turns.
            [0, mixHex(ink.body, DARK, 0.25)],
            [0.38, mixHex(ink.body, paperTone, dark ? 0.1 : 0.16)],
            [0.7, ink.body],
            [1, mixHex(ink.body, DARK, 0.2)],
          ]
        : back
        ? [
            [0, mixHex(ink.body, DARK, dark ? 0.3 : 0.24)],
            [0.16, mixHex(ink.body, DARK, 0.06)],
            [0.4, mixHex(ink.body, paperTone, dark ? 0.24 : 0.34)],
            [0.62, mixHex(ink.body, paperTone, dark ? 0.16 : 0.26)],
            [0.86, mixHex(ink.body, paperTone, dark ? 0.08 : 0.14)],
            [1, mixHex(ink.body, DARK, 0.1)],
          ]
        : [
            [0, mixHex(ink.body, paperTone, dark ? 0.2 : 0.4)],
            [0.3, mixHex(ink.body, paperTone, dark ? 0.1 : 0.15)],
            [0.6, ink.body],
            [1, mixHex(ink.body, DARK, 0.18)],
          ];
      tubeWash(ctx, body, tubes, bodyBox, { stops, alpha: ink.bodyAlpha, fade: back ? 0 : 0.35 });
      const m = Math.min(bodyBox.w, bodyBox.h);
      poolEdge(ctx, body, mixHex(ink.body, DARK, 0.4), ink.bodyAlpha * 0.32, Math.max(1, Math.min(m * 0.07, base * 6)), base * 0.45);
      mottle(ctx, body, bodyBox, mixHex(ink.body, DARK, 0.2), paperTone, ink.bodyAlpha * 0.14, o.seed ^ 0x6d1);
      grainOver(body, bodyBox, 0.3);
    } else {
      wash(body, bodyBox, ink.body, ink.bodyAlpha, o.clear ? 0.45 : 0.32, o.clear ? 0.18 : 0.3);
    }
    if (o.plan === 'chain' && !tiny) {
      // A colony's bells and bracts overlap, glass over glass: each laid on
      // its own, so where two cross the water shows through both.
      ctx.save();
      ctx.fillStyle = ink.body;
      ctx.globalAlpha = 0.14;
      for (const l of bodyLines) {
        ctx.fill(pathOf([l]));
      }
      ctx.restore();
    }
  }
  const inBody = (draw: () => void) => {
    ctx.save();
    if (body) ctx.clip(body);
    draw();
    ctx.restore();
  };
  // The gonads: a soft rose wash, with at most a broken line about them.
  if (L.gonad.length) {
    const p = shapes('gonad');
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = GONAD;
    ctx.fill(p);
    ctx.restore();
    // (A colony's small polyps are only the tinge: a line round each is a bead.)
    if (detail >= 0.3 && o.plan !== 'chain') broken(ctx, lines('gonad'), 0.5 * base * weight, pen, 0.55, nextSeed());
  }
  plain('guts', 0.55, 0.45);
  inBody(() => {
    if (o.plan === 'bell') {
      crownGut(ctx, L.pat.length ? shapes('pat') : null, L.pat.length ? boxOf(lines('pat')) : null, lines('gutFill'), ink, o, tiny);
    } else if (L.gutFill.length) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = ink.pat;
      ctx.fill(shapes('gutFill'));
    }
    if (L.pat.length && bodyBox && o.plan !== 'bell') {
      // Markings in wash, stronger on the back than the belly.
      const p = shapes('pat');
      const gr = ctx.createLinearGradient(0, bodyBox.y, 0, bodyBox.y + bodyBox.h);
      gr.addColorStop(0, ink.pat);
      gr.addColorStop(0.5, `${ink.pat.slice(0, 7)}cc`);
      gr.addColorStop(1, `${ink.pat.slice(0, 7)}44`);
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = gr;
      ctx.fill(p);
      if (!tiny) {
        // Each mark dried with a darker rim, as a dropped wash does.
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = mixHex(ink.pat, DARK, 0.35);
        ctx.lineWidth = Math.max(0.25, 0.4 * base);
        ctx.stroke(p);
      }
    }
    ctx.globalAlpha = 1;
    if (L.patLine.length) penLines(lines('patLine'), 0.8, 0.6, ink.pat, [0.15, 0.4]);
    if (body && bodyBox && starred) starShade(ctx, body, bodyBox, tubes, ink, o);
    else if (body && bodyBox && heavy) shade(ctx, body, bodyBox, tubes, ink, o);
  });
  // The fine lines: the lateral line's pores, a gill cover, a ray's radials.
  if (fine > 0 && L.lines.length) {
    const long = L.lines.filter((s) => s.kind === 'path' && s.pts.length >= 8);
    const short = L.lines.filter((s) => !(s.kind === 'path' && s.pts.length >= 8));
    penLines(long.map((s) => ({ pts: lineOf(s, steps), close: false })), 0.42, 0.65 * fine);
    if (short.length) {
      const saved = L.lines;
      L.lines = short;
      plain('lines', 0.32, 0.55 * fine);
      L.lines = saved;
    }
  }
  // Detail: open marks in the pen, small rings as rings.
  // Short ticks, and everything below the size a pen's pressure shows at,
  // go down as one plain stroke.
  const worked = detail >= 0.3;
  const penned = L.detail.filter((s) => worked && s.kind === 'path' && s.pts.length >= 6);
  penLines(penned.map((s) => ({ pts: lineOf(s, steps), close: s.kind === 'path' && s.close })), 0.55, 0.8, pen, [0.05, 0.25]);
  const rest = L.detail.filter((s) => !penned.includes(s));
  if (rest.length) {
    const saved = L.detail;
    L.detail = rest;
    plain('detail', 0.5, 0.75);
    L.detail = saved;
  }
  if (L.gape.length) {
    // The throat, dark in the open mouth.
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#0E0C0A';
    ctx.fill(shapes('gape'));
    ctx.restore();
  }
  penLines(bodyLines, o.plan === 'comb' ? 0.5 : o.plan === 'chain' ? 0.6 : o.clear ? 0.85 : starred ? 1.25 : 1);
  if (L.teeth.length) {
    // Needle teeth: bare paper, the pen round them only when they are big enough to hold it.
    const p = shapes('teeth');
    ctx.save();
    ctx.fillStyle = dark ? '#D2C8B4' : '#E2D9C4';
    ctx.globalAlpha = 0.88;
    ctx.fill(p);
    if (detail >= 0.3) {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = dark ? '#0E0C0A' : pen;
      ctx.lineWidth = Math.max(0.25, 0.3 * base);
      ctx.stroke(p);
    }
    ctx.restore();
  }
  combRows(ctx, L.rowB, L.rowF, o, ink, tiny, steps);
  strand('tentF', 0.95, 1, [0.04, 0.6]);
  strand('barbel', 0.55, 1, [0.02, 0.7]);

  // Beads, and the fine nodes: stinging cells, suckers, knobs.
  if (L.beads.length) {
    const p = shapes('beads');
    ctx.fillStyle = ink.pat;
    ctx.fill(p);
    if (detail > 0.3) {
      ctx.strokeStyle = pen;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = Math.max(0.25, 0.4 * base);
      ctx.stroke(p);
      ctx.globalAlpha = 1;
    }
  }
  // A star's knobs show from a smaller size: they are its texture, not its fine work.
  const knobs = starred ? ramp(detail, 0.2, 0.45) : fine;
  if (knobs > 0 && L.nodes.length) {
    const p = shapes('nodes');
    ctx.globalAlpha = 0.5 * knobs;
    ctx.fillStyle = starred ? (dark ? mixHex(ink.body, pen, 0.45) : mixHex(ink.body, ink.paper ?? PAPER, 0.5)) : mixHex(ink.pat, pen, 0.25);
    ctx.fill(p);
    ctx.globalAlpha = 0.6 * knobs;
    ctx.strokeStyle = pen;
    ctx.lineWidth = Math.max(0.25, 0.3 * base);
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
      ctx.lineWidth = Math.max(0.25, 0.35 * base);
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
  strand('lure', 0.8, 1, [0, 0.15]);
  ctx.globalAlpha = 1;
}

/**
 * A crown jelly's colour, seen through the clear bell: the stomach a soft
 * wine wash, strongest at its tip and fading out toward the groove, worked
 * in fine lines that run down it from the tip (its folds) and gather on its
 * shadow side, with no line round it, so it is an organ seen through glass
 * and never a dark hole; the gonads beside its foot fainter still; and the
 * band of the pedalia stained from the groove and paling toward the rim,
 * hatched down its furrows on its shadow side (on dark water, in the light
 * ink, on the side the light comes from).
 */
function crownGut(ctx: CanvasRenderingContext2D, band: Path2D | null, bandBox: Box | null, gut: { pts: number[]; close: boolean }[], ink: CreatureInk, o: Paint, tiny: boolean) {
  const { dark, base, spacing } = o;
  const deep = dark ? CROWN_GUT.dark : CROWN_GUT.light;
  // Three fifths of its old strength: lifted toward the bell's own wash.
  const wine = mixHex(deep, mixHex(ink.body, dark ? '#B8A8AE' : '#E8DCDC', 0.5), 0.3);
  const rgba = (hex: string, a: number) => `${hex}${Math.round(255 * Math.max(0, Math.min(1, a))).toString(16).padStart(2, '0')}`;
  const light: [number, number] = dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT;
  const lineInk = dark ? mixHex(wine, ink.pen, 0.55) : mixHex(deep, DARK, 0.25);
  ctx.save();
  if (band && bandBox) {
    const gr = ctx.createLinearGradient(0, bandBox.y, 0, bandBox.y + bandBox.h);
    gr.addColorStop(0, rgba(wine, dark ? 0.34 : 0.26));
    gr.addColorStop(1, rgba(wine, dark ? 0.1 : 0.07));
    ctx.fillStyle = gr;
    ctx.fill(band);
    if (!tiny && o.detail >= 0.3) {
      hatch(ctx, band, bandBox, {
        spacing: Math.max(1.2, spacing * 0.6),
        angle: Math.PI / 2,
        shade: shadeAcross(bandBox, light),
        from: 0.5,
        color: lineInk,
        width: Math.max(0.3, base * 0.5),
        alpha: dark ? 0.5 : 0.55,
        bow: 0.3,
        seed: o.seed ^ 0x3a7,
      });
    }
  }
  const [stomach, ...beans] = gut;
  if (stomach && stomach.pts.length >= 6) {
    const sp = pathOf([stomach]);
    const sb = bounds(stomach.pts);
    // The tip: the stomach's highest point (a Periphylla's cone), or its middle (an Atolla's lens).
    let ax = sb.x + sb.w / 2;
    let ay = sb.y;
    for (let i = 1; i < stomach.pts.length; i += 2) {
      if (stomach.pts[i] <= ay + 1e-6) {
        ay = stomach.pts[i];
        ax = stomach.pts[i - 1];
      }
    }
    const cone = o.crown === 'periphylla';
    const gr = cone ? ctx.createLinearGradient(0, sb.y, 0, sb.y + sb.h) : ctx.createRadialGradient(ax, sb.y + sb.h * 0.45, 0, ax, sb.y + sb.h * 0.45, Math.max(sb.w, sb.h) * 0.55);
    gr.addColorStop(0, rgba(wine, dark ? 0.7 : 0.62));
    gr.addColorStop(0.3, rgba(wine, dark ? 0.5 : 0.44));
    gr.addColorStop(0.7, rgba(wine, dark ? 0.2 : 0.16));
    gr.addColorStop(1, rgba(wine, 0));
    ctx.fillStyle = gr;
    ctx.fill(sp);
    if (!tiny && o.detail >= 0.3) {
      // Its folds: fine lines down from the tip, fanning to its foot, heavier on the shadow side and gone before the groove.
      ctx.save();
      ctx.clip(sp);
      const folds = Math.max(5, Math.min(14, Math.round(sb.w / Math.max(2, spacing * 1.1))));
      const r = mulberry32(o.seed ^ 0x9e1);
      for (let k = 0; k <= folds; k++) {
        const u = k / folds - 0.5;
        const side = u * 2 * (light[0] >= 0 ? 1 : -1);
        const w = 0.5 + 0.5 * side;
        if (w < 0.15) continue;
        const ex = ax + u * sb.w * 0.95 + (r() - 0.5) * spacing * 0.4;
        const ey = cone ? sb.y + sb.h * (0.82 + 0.1 * r()) : sb.y + sb.h * (0.95 - 0.5 * Math.abs(u));
        const sx = cone ? ax + u * sb.w * 0.08 : ax + u * sb.w * 0.35;
        const sy = cone ? ay + sb.h * 0.04 : sb.y + sb.h * 0.15;
        const pts: number[] = [];
        for (let q = 0; q <= 8; q++) {
          const t = q / 8;
          // (Bowed out with the cone's swell.)
          pts.push(sx + (ex - sx) * Math.pow(t, 0.8), sy + (ey - sy) * t);
        }
        inkLine(ctx, pts, false, { width: base * (0.3 + 0.35 * w), color: lineInk, alpha: (dark ? 0.55 : 0.6) * (0.4 + 0.6 * w), taper: [0.1, 0.6], plate: true, light, seed: o.seed + k * 7 });
      }
      ctx.restore();
    }
  }
  if (beans.length) {
    ctx.globalAlpha = dark ? 0.32 : 0.26;
    ctx.fillStyle = wine;
    ctx.fill(pathOf(beans));
  }
  ctx.restore();
}

/** A closed outline drawn as a few arcs with the pen lifted between them: never a ring. */
function broken(ctx: CanvasRenderingContext2D, ls: { pts: number[]; close: boolean }[], width: number, color: string, alpha: number, seed: number) {
  const r = mulberry32(seed);
  for (const l of ls) {
    const n = l.pts.length / 2;
    if (n < 6) continue;
    const pieces = 2 + Math.floor(r() * 2);
    let at = Math.floor(r() * n);
    for (let k = 0; k < pieces; k++) {
      const len = Math.max(3, Math.floor((n / pieces) * (0.45 + r() * 0.3)));
      const seg: number[] = [];
      for (let i = 0; i <= len; i++) {
        const j = (at + i) % n;
        seg.push(l.pts[j * 2], l.pts[j * 2 + 1]);
      }
      inkLine(ctx, seg, false, { width, color, alpha, taper: [0.2, 0.2], raw: true, plate: true, seed: seed + k });
      at = (at + Math.floor(n / pieces)) % n;
    }
  }
}

/**
 * A comb jelly's rows: the plates as a dotted line down each, the far rows
 * faint through the body, and on dark water the light they break into
 * colours, a tint along them.
 */
function combRows(ctx: CanvasRenderingContext2D, back: Shape[], front: Shape[], o: Paint, ink: CreatureInk, tiny: boolean, steps: number) {
  if (!back.length && !front.length) return;
  const { base, dark } = o;
  const pen = ink.pen;
  const rows = (list: Shape[]) => list.filter((s) => s.kind === 'path').map((s) => lineOf(s, steps));
  const draw = (ls: number[][], alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = pen;
    ctx.fillStyle = pen;
    if (tiny) {
      ctx.lineWidth = Math.max(0.25, base * 0.45);
      ctx.setLineDash([Math.max(0.6, base * 0.8), Math.max(0.8, base * 1.1)]);
      for (const l of ls) {
        ctx.beginPath();
        ctx.moveTo(l[0], l[1]);
        for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const dots = new Path2D();
    for (const l of ls) {
      let total = 0;
      for (let i = 2; i < l.length; i += 2) total += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
      const gap = Math.max(base * 2.2, total / 28);
      let next = gap * 0.5;
      let run = 0;
      for (let i = 2; i < l.length; i += 2) {
        const d = Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
        while (next <= run + d && d > 0) {
          const t = (next - run) / d;
          const x = l[i - 2] + (l[i] - l[i - 2]) * t;
          const y = l[i - 1] + (l[i + 1] - l[i - 1]) * t;
          // The plates shrink toward each end of the row.
          const k = Math.sin(Math.PI * Math.min(1, next / total)) * 0.6 + 0.4;
          const rad = Math.max(0.3, base * 0.55 * k);
          dots.moveTo(x + rad, y);
          dots.ellipse(x, y, rad, rad * 0.75, 0, 0, Math.PI * 2);
          next += gap;
        }
        run += d;
      }
      // The canal under the plates, a hair.
      ctx.lineWidth = Math.max(0.25, base * 0.3);
      ctx.globalAlpha = alpha * 0.5;
      ctx.beginPath();
      ctx.moveTo(l[0], l[1]);
      for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    ctx.fill(dots);
    ctx.restore();
  };
  const b = rows(back);
  const f = rows(front);
  if (dark) {
    // The combs break the light into colour as they beat.
    const all = [...b, ...f];
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const l of all) for (let i = 1; i < l.length; i += 2) {
      y0 = Math.min(y0, l[i]);
      y1 = Math.max(y1, l[i]);
    }
    if (Number.isFinite(y0) && y1 > y0) {
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      IRIDESCENT.forEach((c, i) => gr.addColorStop(i / (IRIDESCENT.length - 1), c));
      ctx.save();
      ctx.strokeStyle = gr;
      ctx.lineWidth = Math.max(0.8, base * 3.2);
      for (const [ls, k] of [[b, 0.4], [f, 1]] as const) {
        ctx.globalAlpha = 0.3 * k;
        for (const l of ls) {
          ctx.beginPath();
          ctx.moveTo(l[0], l[1]);
          for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  draw(b, 0.32);
  draw(f, 0.9);
}

/**
 * The engraver's tone: contour hatching along a solid body's spine, in its
 * shadowed lower part only, crossed only in the darkest; stipple for a clear
 * one.
 */
function shade(ctx: CanvasRenderingContext2D, body: Path2D, box: Box, tubes: Tube[], ink: CreatureInk, o: Paint) {
  const { detail, dark, base, spacing } = o;
  const k = ramp(detail, 0.55, 0.72);
  if (k <= 0) return;
  if (o.clear) {
    const sp = Math.max(1.6, spacing * 0.85);
    if (Math.min(box.w, box.h) < sp * 6) return;
    const field = shadeField(body, box, sp * 0.75);
    stipple(ctx, body, box, {
      spacing: sp,
      shade: field,
      color: dark ? mixHex(ink.body, '#000000', 0.5) : ink.pen,
      radius: Math.max(0.3, Math.min(sp * 0.16, base * 0.4)),
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
      ctx.lineWidth = base * 7;
      ctx.stroke(body);
      ctx.globalAlpha = 0.16 * k;
      ctx.lineWidth = base * 3;
      ctx.stroke(body);
      ctx.restore();
    }
    return;
  }
  if (!tubes.length || spacing < 1.4) return;
  // Room for a few lines across the body's shadowed part, or none at all.
  let thick = 0;
  for (const t of tubes) for (let i = 0; i < t.a.length; i += 2) thick = Math.max(thick, Math.hypot(t.b[i] - t.a[i], t.b[i + 1] - t.a[i + 1]));
  if (thick * 0.45 < spacing * 2) return;
  const field = shadeField(body, box, spacing * 0.6);
  contourHatch(ctx, body, tubes, {
    spacing,
    shade: field,
    reach: 0.45,
    width: base,
    k: 0.62,
    // On dark water the pen is light: the shadow is worked in the wash's own dark instead.
    color: dark ? mixHex(ink.body, '#000000', 0.62) : ink.pen,
    alpha: (dark ? 0.75 : 0.7) * k,
    cross: 0.75,
    crossAngle: (35 * Math.PI) / 180,
    seed: o.seed ^ 0x2c1,
  });
}

/**
 * A sea star's wash: graded across each arm, the lit side let go toward
 * the paper and the far side deepened, so every arm is round and the disc
 * between them sits up off the ground. On dark water the body is kept low,
 * near the water's own dark, so the light pen carries it as it carries the
 * rock and the growths round it.
 */
function starWash(ctx: CanvasRenderingContext2D, body: Path2D, box: Box, tubes: Tube[], ink: CreatureInk, o: Paint) {
  const paper = ink.paper ?? PAPER;
  const base = o.dark ? mixHex(ink.body, '#141210', 0.68) : ink.body;
  const stops: [number, string][] = o.dark
    ? [
        [0, mixHex(base, ink.pen, 0.16)],
        [0.4, base],
        [1, mixHex(base, '#000000', 0.4)],
      ]
    : [
        [0, mixHex(base, paper, 0.62)],
        [0.3, mixHex(base, paper, 0.25)],
        [0.62, base],
        [1, mixHex(base, DARK, 0.45)],
      ];
  tubeWash(ctx, body, tubes, box, { stops, alpha: ink.bodyAlpha, fade: 0.3 });
  const m = Math.min(box.w, box.h);
  poolEdge(ctx, body, mixHex(base, DARK, 0.4), ink.bodyAlpha * 0.3, Math.max(1, Math.min(m * 0.06, o.base * 5)), o.base * 0.4);
  if (o.detail >= 0.3) {
    mottle(ctx, body, box, mixHex(base, DARK, 0.2), paper, ink.bodyAlpha * 0.12, o.seed ^ 0x6d1);
    const gr = grain(ctx);
    if (gr) {
      gr.setTransform?.(new DOMMatrix([o.dpr, 0, 0, o.dpr, 0, 0]));
      ctx.save();
      ctx.clip(body);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = gr;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.restore();
    }
  }
}

/**
 * A sea star in the pen: its shadow side stippled (a star's skin is a
 * mosaic of small plates, so its tone is in dots, not lines), contour
 * lines down each arm's shadowed edge where the arm is broad enough to
 * hold them, and the ridge of plates along the middle of every arm. On
 * dark water the same work is laid in the light ink on the side the light
 * comes from, as everything else on the night ground is.
 */
function starShade(ctx: CanvasRenderingContext2D, body: Path2D, box: Box, tubes: Tube[], ink: CreatureInk, o: Paint) {
  const { base, spacing, dark } = o;
  const sp = Math.max(1.1, spacing * 0.4);
  const field = shadeField(body, box, sp);
  // Each arm round across itself, and the whole star a low dome, its far side in shadow.
  const dome = shadeAcross(box);
  // (Stretched, so the far side of the disc gathers its dots too.)
  const mixed = (x: number, y: number) => Math.max(0, Math.min(1, (0.62 * field(x, y) + 0.38 * dome(x, y) - 0.25) / 0.6));
  const shade = dark ? (x: number, y: number) => 1 - mixed(x, y) : mixed;
  const light: [number, number] = dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT;
  stipple(ctx, body, box, {
    spacing: sp,
    shade,
    color: ink.pen,
    radius: Math.max(0.3, Math.min(sp * 0.26, base * 0.4)),
    alpha: (dark ? 0.7 : 0.8) * (0.6 + 0.4 * ramp(o.detail, 0.3, 0.6)),
    from: 0.35,
    seed: o.seed ^ 0x5f3,
  });
  // Lines down the shadowed edge of each arm, closer than a body's: an arm is narrow.
  const cs = Math.max(1.2, spacing * 0.6);
  let thick = 0;
  for (const t of tubes) for (let i = 0; i < t.a.length; i += 2) thick = Math.max(thick, Math.hypot(t.b[i] - t.a[i], t.b[i + 1] - t.a[i + 1]));
  if (thick * 0.42 >= cs * 1.2) {
    contourHatch(ctx, body, tubes, {
      spacing: cs,
      shade,
      reach: 0.42,
      width: base,
      k: 0.5,
      color: ink.pen,
      alpha: dark ? 0.6 : 0.65,
      light,
      seed: o.seed ^ 0x2c1,
    });
  }
  // The ridge down each arm: the middle row of plates, a fine broken line.
  for (let k = 0; k < tubes.length; k++) {
    const t = tubes[k];
    const n = Math.min(t.a.length, t.b.length) / 2;
    if (n < 5) continue;
    const mid: number[] = [];
    for (let i = 1; i < n - 1; i++) mid.push((t.a[i * 2] + t.b[i * 2]) / 2, (t.a[i * 2 + 1] + t.b[i * 2 + 1]) / 2);
    inkLine(ctx, mid, false, { width: base * 0.45, color: ink.pen, alpha: dark ? 0.45 : 0.5, taper: [0.15, 0.5], raw: false, plate: true, light, seed: o.seed + k * 13 });
  }
}

/**
 * An eye as a plate draws it: set in the head, the iris filling it (no
 * white to it, which is what makes an eye a cartoon's), fine lines running
 * in to the pupil, a darker ring at its rim, the shadow the top of the
 * socket throws, one point of light and its small echo. Small, only the
 * iris, the pupil and a fine ring.
 */
function eye(
  ctx: CanvasRenderingContext2D,
  e: { x: number; y: number; rx: number; ry: number },
  p: { x: number; y: number; rx: number; ry: number } | null,
  ink: CreatureInk,
  o: Paint,
  seed: number,
) {
  const { base, detail, dark } = o;
  const r = e.rx;
  const disc = (x: number, y: number, rad: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad, 0, 0, Math.PI * 2);
  };
  const iris = dark ? mixHex(ink.eyeW, '#1A1815', 0.45) : mixHex(mixHex(ink.body, '#B08A3E', 0.5), '#6B5A3A', 0.25);
  if (detail < 0.3 || r < 5) {
    disc(e.x, e.y, r);
    ctx.fillStyle = iris;
    ctx.fill();
    ctx.strokeStyle = ink.pen;
    ctx.lineWidth = Math.min(Math.max(0.25, base * 0.55), r * 0.35);
    ctx.stroke();
    if (p) {
      disc(p.x, p.y, p.rx);
      ctx.fillStyle = ink.pupil;
      ctx.fill();
      if (p.rx > 2.2) {
        disc(p.x - p.rx * 0.3, p.y - p.rx * 0.35, p.rx * 0.24);
        ctx.fillStyle = '#FFFDF6';
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    return;
  }
  const px = p?.x ?? e.x;
  const py = p?.y ?? e.y;
  const pr = p?.rx ?? r * 0.5;
  ctx.save();
  disc(e.x, e.y, r);
  ctx.clip();
  const g = ctx.createRadialGradient(px, py, pr * 0.8, e.x, e.y, r);
  g.addColorStop(0, mixHex(iris, '#FBF8EF', 0.22));
  g.addColorStop(0.7, iris);
  g.addColorStop(1, mixHex(iris, '#1A1714', 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
  const rand = mulberry32(seed);
  const n = Math.round(22 + 18 * detail);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + rand() * 0.08;
    const r0 = pr * (1.02 + rand() * 0.1);
    const r1 = r * (0.8 + rand() * 0.15);
    ctx.moveTo(px + Math.cos(t) * r0, py + Math.sin(t) * r0);
    ctx.lineTo(e.x + Math.cos(t + 0.06) * r1, e.y + Math.sin(t + 0.06) * r1);
  }
  ctx.strokeStyle = mixHex(iris, '#1A1714', 0.6);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(0.25, 0.25 * base);
  ctx.stroke();
  ctx.globalAlpha = 1;
  disc(px, py, pr);
  ctx.fillStyle = ink.pupil;
  ctx.fill();
  // The shadow under the top of the socket.
  const lid = ctx.createLinearGradient(0, e.y - r, 0, e.y + r * 0.1);
  lid.addColorStop(0, 'rgba(26,23,20,0.5)');
  lid.addColorStop(1, 'rgba(26,23,20,0)');
  ctx.fillStyle = lid;
  ctx.fillRect(e.x - r, e.y - r, r * 2, r * 1.1);
  // The window's light, small, and its echo.
  ctx.fillStyle = '#FFFDF6';
  disc(px - pr * 0.34, py - pr * 0.36, pr * 0.22);
  ctx.globalAlpha = 0.9;
  ctx.fill();
  disc(px + pr * 0.4, py + pr * 0.3, pr * 0.09);
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.restore();
  const circle: number[] = [];
  const m = 40;
  for (let i = 0; i < m; i++) circle.push(e.x + Math.cos((i / m) * Math.PI * 2) * r, e.y + Math.sin((i / m) * Math.PI * 2) * r);
  inkLine(ctx, circle, true, { width: base * 0.6, color: ink.pen, raw: true, plate: true, seed });
  // The socket: a fine arc above and behind, the head's bone round the eye.
  if (detail > 0.5) {
    const arc: number[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = Math.PI * (0.95 + (i / 14) * 0.85);
      arc.push(e.x + Math.cos(t) * r * 1.45, e.y + Math.sin(t) * r * 1.35);
    }
    inkLine(ctx, arc, false, { width: base * 0.45, color: ink.pen, alpha: 0.7, taper: [0.3, 0.3], raw: true, plate: true, seed: seed + 1 });
  }
}

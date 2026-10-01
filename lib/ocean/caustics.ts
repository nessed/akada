/**
 * Caustics: the net of light the waves throw over everything in the
 * shallows, the way it wobbles across the floor of a pool.
 *
 * The net is worked out once, to a small tile that repeats, and after that
 * only placed: two copies of it, drifting at different sizes, speeds and
 * angles, which is all it takes for the cells to seem to shimmer and
 * re-form. It is laid on the front canvas, over the jelly and the clock, so
 * it is only ever a breath of light, strongest under the surface and gone
 * by the time the sunlit water is.
 */

import { hash32, mulberry32 } from './random';

/** The tile, in its own pixels, and how many cells it holds each way. */
const TILE = 256;
const CELLS = 5;
/** A cell on the page, in CSS pixels: about a hand's width, as on a pool floor. */
const CELL_CSS = 120;
/** The net is put together at a third of the page's density and drawn back
    up: it is meant to be soft, and that is a ninth of the pixels. */
const SHRINK = 1 / 3;
/** How far down the page it reaches before it has faded out. */
const REACH = 0.72;
const TAU = Math.PI * 2;

function canvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * The net itself: the edges between wobbly cells, a bright thin core with a
 * little glow round it. Cells are a Voronoi of jittered points on a wrapped
 * grid, and the page is bent by whole-number sines before they are looked
 * up, so the edges curve and the tile still meets itself all round.
 */
function buildTile(): HTMLCanvasElement | null {
  const c = canvas(TILE, TILE);
  const t = c?.getContext('2d');
  if (!c || !t) return null;
  const r = mulberry32(hash32('caustics'));
  const pts = new Float32Array(CELLS * CELLS * 2);
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) {
      pts[(j * CELLS + i) * 2] = (i + 0.12 + 0.76 * r()) / CELLS;
      pts[(j * CELLS + i) * 2 + 1] = (j + 0.12 + 0.76 * r()) / CELLS;
    }
  }
  const ph = [r(), r(), r(), r(), r(), r()].map((p) => p * TAU);
  const img = t.createImageData(TILE, TILE);
  const d = img.data;
  for (let y = 0; y < TILE; y++) {
    const v = y / TILE;
    for (let x = 0; x < TILE; x++) {
      const u = x / TILE;
      const wu = u + 0.05 * Math.sin(TAU * (2 * v) + ph[0]) + 0.025 * Math.sin(TAU * (3 * u + 2 * v) + ph[1]);
      const wv = v + 0.05 * Math.sin(TAU * (2 * u) + ph[2]) + 0.025 * Math.sin(TAU * (2 * u - 3 * v) + ph[3]);
      const cx = Math.floor(wu * CELLS);
      const cy = Math.floor(wv * CELLS);
      let f1 = 9;
      let f2 = 9;
      for (let dy = -1; dy <= 1; dy++) {
        const gy = cy + dy;
        const iy = ((gy % CELLS) + CELLS) % CELLS;
        for (let dx = -1; dx <= 1; dx++) {
          const gx = cx + dx;
          const ix = ((gx % CELLS) + CELLS) % CELLS;
          const k = (iy * CELLS + ix) * 2;
          const ex = wu - (pts[k] + (gx - ix) / CELLS);
          const ey = wv - (pts[k + 1] + (gy - iy) / CELLS);
          const dist = ex * ex + ey * ey;
          if (dist < f1) {
            f2 = f1;
            f1 = dist;
          } else if (dist < f2) f2 = dist;
        }
      }
      // How far from an edge, in cell widths: nought on it.
      const e = (Math.sqrt(f2) - Math.sqrt(f1)) * CELLS;
      // Real nets are uneven: some strands thick and bright, some all but gone.
      const m = 0.5 + 0.5 * Math.sin(TAU * (u + 2 * v) + ph[4]) * Math.sin(TAU * (2 * u - v) + ph[5]);
      const width = 0.03 + 0.04 * m;
      const core = Math.max(0, 1 - e / width);
      const glow = Math.max(0, 1 - e / (width * 3.5));
      const a = Math.min(1, core * core * (0.55 + 0.45 * m) + glow * glow * 0.22);
      const o = (y * TILE + x) * 4;
      d[o] = 255;
      d[o + 1] = 252;
      d[o + 2] = 240;
      d[o + 3] = Math.round(a * 255);
    }
  }
  t.putImageData(img, 0, 0);
  return c;
}

export class Caustics {
  private tile: HTMLCanvasElement | null = null;
  private scratch: HTMLCanvasElement | null = null;
  private sctx: CanvasRenderingContext2D | null = null;
  private pattern: CanvasPattern | null = null;
  private mask: { h: number; g: CanvasGradient } | null = null;
  private failed = false;

  /** strength 0..1 (the caller passes how much light there is: 1 at the surface, 0 by about 15 minutes in). Draws onto the FRONT canvas, over the jelly and everything, so it must be faint and must not hide anything. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, ambient: number, strength: number, px: number, dark: boolean): void {
    if (strength <= 0.01 || w <= 0 || h <= 0 || this.failed) return;
    const sw = Math.max(1, Math.ceil(w * SHRINK));
    const sh = Math.max(1, Math.ceil(h * REACH * SHRINK));
    if (!this.ready(sw, sh)) return;
    const s = this.sctx!;
    const pattern = this.pattern!;

    // The two nets, summed, in the scratch canvas. Different sizes, angles
    // and drifts, and each breathing a little in scale, so where they cross
    // the light gathers and moves on.
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.globalAlpha = 1;
    s.clearRect(0, 0, sw, sh);
    s.globalCompositeOperation = 'lighter';
    const base = (CELL_CSS * px * SHRINK * CELLS) / TILE;
    const layers = [
      { k: 1, turn: 0, vx: 7, vy: 4, breathe: 0.45, alpha: 0.62 },
      { k: 0.71, turn: 0.55, vx: -5, vy: 6.5, breathe: 0.31, alpha: 0.38 },
    ];
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      const k = base * L.k * (1 + 0.05 * Math.sin(ambient * L.breathe + i * 2));
      const cos = Math.cos(L.turn) * k;
      const sin = Math.sin(L.turn) * k;
      // Kept within one tile of the origin, so the numbers never grow.
      const span = TILE * k;
      const ox = ((ambient * L.vx * px * SHRINK) % span + span) % span;
      const oy = ((ambient * L.vy * px * SHRINK) % span + span) % span;
      pattern.setTransform(new DOMMatrix([cos, sin, -sin, cos, ox, oy]));
      s.fillStyle = pattern;
      s.globalAlpha = L.alpha;
      s.fillRect(0, 0, sw, sh);
    }

    // Brightest just under the surface, gone a little below the middle.
    if (!this.mask || this.mask.h !== sh) {
      const g = s.createLinearGradient(0, 0, 0, sh);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.35, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      this.mask = { h: sh, g };
    }
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'destination-in';
    s.fillStyle = this.mask.g;
    s.fillRect(0, 0, sw, sh);
    s.globalCompositeOperation = 'source-over';

    // Onto the page. The front canvas is mostly empty, so on dark water
    // 'lighter' reads much as plain paint does, but it brightens rather than
    // covers the snow and the near animals drawn there. Pale water needs a
    // touch more to show at all; neither is enough to trouble the clock.
    ctx.save();
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    ctx.globalAlpha = Math.min(1, strength) * (dark ? 0.17 : 0.5);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.scratch!, 0, 0, sw, sh, 0, 0, w, h * REACH);
    ctx.restore();
  }

  /** The tile once, and a scratch canvas the size of the page's top. */
  private ready(sw: number, sh: number): boolean {
    if (!this.tile) {
      this.tile = buildTile();
      if (!this.tile) {
        this.failed = true;
        return false;
      }
    }
    if (!this.scratch) {
      this.scratch = canvas(sw, sh);
      this.sctx = this.scratch?.getContext('2d') ?? null;
      this.pattern = this.sctx?.createPattern(this.tile, 'repeat') ?? null;
      if (!this.sctx || !this.pattern) {
        this.failed = true;
        return false;
      }
    }
    if (this.scratch.width !== sw || this.scratch.height !== sh) {
      this.scratch.width = sw;
      this.scratch.height = sh;
    }
    return true;
  }
}

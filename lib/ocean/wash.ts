/**
 * The water, painted: the depth's gradient laid as a watercolour wash.
 *
 * A flat gradient reads as a screen. A wash on paper has three things a
 * gradient doesn't: the paper's tooth showing through, pigment that settled
 * unevenly as it dried (soft pools, and lighter blooms where water crept
 * back in, each with a faint crinkled tide line at its rim), and a little
 * more colour at the edges where the wet pigment ran to. From a step back it
 * is still the same smooth water; close up it should look laid by hand.
 *
 * Both layers are neutral, only black and white at low alpha, so they sit
 * over any depth's colour without being redrawn: on pale water the darker
 * pools show and on dark water the lighter blooms do, which is how a real
 * wash behaves too. They are worked out once for the sitting and the page's
 * size; a frame pays a gradient, one image copy and one pattern fill.
 */

import type { Water } from './palette';
import { hash32, mulberry32 } from './random';

/** The paper's tooth: a tile of grain, one of its pixels to a CSS pixel. */
const GRAIN = 160;
/** How many samples the pigment layer gets at most: it is soft, and drawn back up. */
const STAIN_SAMPLES = 150_000;
/** A resize smaller than this (a share of either side) stretches the old layer rather than redoing it. */
const SLACK = 0.06;

function canvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Value noise on a wrapped 256 lattice, smoothed: cheap, and soft enough for pigment. */
function lattice(seed: number): Float32Array {
  const r = mulberry32(seed);
  const l = new Float32Array(256 * 256);
  for (let i = 0; i < l.length; i++) l[i] = r();
  return l;
}

function noise(l: Float32Array, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = xi & 255;
  const x1 = (xi + 1) & 255;
  const y0 = (yi & 255) << 8;
  const y1 = ((yi + 1) & 255) << 8;
  const a = l[y0 + x0] + (l[y0 + x1] - l[y0 + x0]) * fx;
  const b = l[y1 + x0] + (l[y1 + x1] - l[y1 + x0]) * fx;
  return a + (b - a) * fy;
}

/** Octaves of noise, 0 to 1 about a middle of a half. */
function fbm(l: Float32Array, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    // Each octave shifted, so they don't all agree at the origin.
    sum += noise(l, x + o * 37.1, y + o * 19.7) * amp;
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Signed shade to pixels: darker as black, lighter as white, both by alpha. */
function put(d: Uint8ClampedArray, o: number, s: number) {
  const v = s > 0 ? 0 : 255;
  d[o] = v;
  d[o + 1] = v;
  d[o + 2] = v;
  d[o + 3] = Math.min(255, Math.round(Math.abs(s) * 255));
}

/**
 * Grain: white noise with some of it smudged into its neighbours, so it
 * has tooth rather than fizz. It wraps, since it is laid as a pattern.
 */
function buildGrain(): HTMLCanvasElement | null {
  const c = canvas(GRAIN, GRAIN);
  const t = c?.getContext('2d');
  if (!c || !t) return null;
  const r = mulberry32(hash32('wash', 'grain'));
  const n = GRAIN * GRAIN;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = r() - 0.5;
  const img = t.createImageData(GRAIN, GRAIN);
  for (let y = 0; y < GRAIN; y++) {
    for (let x = 0; x < GRAIN; x++) {
      let blur = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const row = ((y + dy + GRAIN) % GRAIN) * GRAIN;
        // Wider than tall: paper's fibres lie a little one way.
        for (let dx = -2; dx <= 2; dx++) blur += raw[row + ((x + dx + GRAIN) % GRAIN)];
      }
      const s = raw[y * GRAIN + x] * 0.45 + (blur / 15) * 2.2;
      put(img.data, (y * GRAIN + x) * 4, Math.sign(s) * Math.pow(Math.abs(s), 1.1) * 0.9);
    }
  }
  t.putImageData(img, 0, 0);
  return c;
}

/**
 * Where the pigment settled, over the page's CSS size. Positive is more
 * pigment (drawn black), negative less (white).
 */
function buildStain(cssW: number, cssH: number, seed: number): HTMLCanvasElement | null {
  const step = Math.max(1.5, Math.sqrt((cssW * cssH) / STAIN_SAMPLES));
  const sw = Math.max(1, Math.ceil(cssW / step));
  const sh = Math.max(1, Math.ceil(cssH / step));
  const c = canvas(sw, sh);
  const t = c?.getContext('2d');
  if (!c || !t) return null;
  const pool = lattice(hash32('wash', seed, 'pool'));
  const bloom = lattice(hash32('wash', seed, 'bloom'));
  const r = mulberry32(hash32('wash', seed, 'lay'));
  const ox = r() * 256;
  const oy = r() * 256;
  // Pigment runs to the foot of a tilted page: a little more pools there.
  const foot = 0.6 + r() * 0.5;
  const img = t.createImageData(sw, sh);
  const d = img.data;
  for (let j = 0; j < sh; j++) {
    const Y = (j + 0.5) * step;
    for (let i = 0; i < sw; i++) {
      const X = (i + 0.5) * step;
      // Broad unevenness: soft pools a few hundred pixels across.
      const p = fbm(pool, ox + X / 420, oy + Y / 420, 3) - 0.5;
      // Mottling, smaller, where the brush went over twice.
      const m = fbm(pool, ox + 90 + X / 110, oy + Y / 110, 2) - 0.5;
      // Blooms: where the field rises past a level, water crept back and
      // pushed the pigment out to a crinkled rim. The fine octaves are the
      // cauliflower in the edge.
      const b = fbm(bloom, X / 170, Y / 170, 6);
      const lift = smooth(0.63, 0.65, b);
      const rim = Math.exp(-(((b - 0.633) / 0.009) ** 2));
      // More at the page's edges, and most at its foot.
      const edge = Math.min(X, cssW - X, Y);
      const run = Math.pow(1 - smooth(0, 120, edge), 2) * 0.07 + Math.pow(1 - smooth(0, 170, cssH - Y), 2) * 0.07 * foot;
      const s = p * 0.2 + m * 0.06 - lift * 0.035 + rim * 0.07 + run;
      put(d, (j * sw + i) * 4, s);
    }
  }
  t.putImageData(img, 0, 0);
  return c;
}

/** 0 for black to 1 for white, near enough for choosing a strength. */
function tone(hex: string): number {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return 0.5;
  return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
}

export class Wash {
  private grain: HTMLCanvasElement | null = null;
  private grainFor: { ctx: CanvasRenderingContext2D; pattern: CanvasPattern } | null = null;
  private stain: { canvas: HTMLCanvasElement; seed: number; w: number; h: number } | null = null;

  /** Replaces drawWater: fill the whole back canvas with the water for this depth, painted. `seed` is a per-sitting number for where the pigment pooled. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, water: Water, px: number, seed: number): void {
    // The colour, as it always was: lighter above.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, water.top);
    g.addColorStop(1, water.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (w <= 0 || h <= 0) return;

    // Black shows best on pale water and white on dark, so each layer is
    // eased to keep the same weight as the water darkens, with no step
    // where it turns.
    const lum = (tone(water.top) + tone(water.bottom)) / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    const stain = this.stainFor(w / px, h / px, seed);
    if (stain) {
      ctx.globalAlpha = 0.3 + 0.7 * lum;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(stain, 0, 0, w, h);
    }

    const pattern = this.grainPattern(ctx);
    if (pattern) {
      pattern.setTransform(new DOMMatrix([px, 0, 0, px, 0, 0]));
      ctx.globalAlpha = 0.05 + 0.07 * lum;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  private stainFor(cssW: number, cssH: number, seed: number): HTMLCanvasElement | null {
    const s = this.stain;
    if (s && s.seed === seed && Math.abs(s.w - cssW) <= s.w * SLACK && Math.abs(s.h - cssH) <= s.h * SLACK) return s.canvas;
    const canvas = buildStain(cssW, cssH, seed);
    this.stain = canvas ? { canvas, seed, w: cssW, h: cssH } : null;
    return canvas;
  }

  private grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.grainFor?.ctx === ctx) return this.grainFor.pattern;
    this.grain ??= buildGrain();
    const pattern = this.grain ? ctx.createPattern(this.grain, 'repeat') : null;
    this.grainFor = pattern ? { ctx, pattern } : null;
    return pattern;
  }
}

/**
 * The water, painted: the depth's gradient laid as a watercolour wash.
 *
 * A flat gradient reads as a screen. A wash on paper has things a gradient
 * doesn't: it is laid in glazes, each band of sea a wash over the last, so
 * the water deepens in soft steps with an irregular, slightly darker edge
 * where each glaze dried; the paper's tooth shows through; pigment settled
 * unevenly as it dried (soft pools, and lighter blooms where water crept
 * back in, each with a faint crinkled tide line at its rim); the brush left
 * long faint strokes across; and a little more colour sits at the edges
 * where the wet pigment ran to. From a step back it is still the same water
 * at the same depth; close up it should look laid by hand.
 *
 * All of that is neutral, only black and white at low alpha, so it sits over
 * any depth's colour without being redrawn: on pale water the darker pools
 * and glaze edges show and on dark water the lighter blooms and the lifted
 * tops of the glazes do, which is how a real wash behaves too. It is worked
 * out once for the sitting and the page's size and baked, with the grain,
 * into one texture at the canvas's own size; a frame pays a gradient and one
 * image copy.
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

/** The glazes: how many bands of sea, and where each one's top edge lies across the page. */
interface Glazes {
  n: number;
  /** The top edge of glaze k (1 to n - 1), CSS px down the page at CSS px X across it. */
  at: (k: number, X: number) => number;
}

function glazesFor(cssW: number, cssH: number, seed: number): Glazes {
  const n = Math.max(3, Math.min(7, Math.round(cssH / 230)));
  const l = lattice(hash32('wash', seed, 'glaze'));
  const r = mulberry32(hash32('wash', seed, 'glazes'));
  const band = cssH / n;
  const base = [0];
  for (let k = 1; k < n; k++) base.push(band * (k + (r() - 0.5) * 0.4));
  // Each edge laid a little aslant, as a brush crosses a page, wandering
  // and ragged rather than rolling: a wash's edge, not a horizon.
  const slant = Array.from({ length: n }, () => (r() - 0.5) * 0.14);
  return {
    n,
    at: (k, X) =>
      base[k] +
      slant[k] * (X - cssW / 2) +
      (fbm(l, X / 260 + k * 17.3, k * 5.1, 4) - 0.5) * band * 0.5 +
      (fbm(l, X / 45 + k * 31, k * 9.7, 2) - 0.5) * 10 +
      (noise(l, X / 9 + k * 7, k * 3.3) - 0.5) * 2.5,
  };
}

/**
 * Where the pigment settled, over the page's CSS size. Positive is more
 * pigment (drawn black), negative less (white).
 *
 * The glazes are a staircase laid over the gradient's ramp, so that summed
 * with the gradient underneath, the water deepens in steps: inside a band
 * the colour holds, and drops at the next band's soft edge. Taking the ramp
 * off keeps the average where the depth's colours put it.
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
  const glazes = glazesFor(cssW, cssH, seed);
  const n = glazes.n;
  // The glaze edges are a function of X alone: worked out a column at a time.
  const edges = new Float32Array(sw * n);
  for (let i = 0; i < sw; i++) {
    const X = (i + 0.5) * step;
    for (let k = 1; k < n; k++) edges[i * n + k] = glazes.at(k, X);
  }
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
      // The brush's strokes: long, faint, across the page.
      const stroke = fbm(bloom, ox + X / 520, oy + Y / 11, 2) - 0.5;
      // Blooms: where the field rises past a level, water crept back and
      // pushed the pigment out to a crinkled rim. The fine octaves are the
      // cauliflower in the edge.
      const b = fbm(bloom, X / 170, Y / 170, 6);
      const lift = smooth(0.63, 0.65, b);
      const rim = Math.exp(-(((b - 0.633) / 0.009) ** 2));
      // More at the page's edges, and most at its foot.
      const edge = Math.min(X, cssW - X, Y);
      const run = Math.pow(1 - smooth(0, 120, edge), 2) * 0.07 + Math.pow(1 - smooth(0, 170, cssH - Y), 2) * 0.07 * foot;
      // The glazes: how many lie over this point (soft-edged), less the ramp.
      let laid = 0;
      let pooled = 0;
      for (let k = 1; k < n; k++) {
        const e = edges[i * n + k];
        laid += smooth(e - 9, e + 9, Y);
        // Pigment gathered just inside each glaze's edge as it dried.
        const below = Y - e;
        if (below > -10 && below < 60) pooled += Math.exp(-(((below - 6) / 16) ** 2));
      }
      const stair = (laid + 0.5) / n - Y / cssH;
      const s = stair * 0.55 + pooled * 0.035 + p * 0.17 + m * 0.05 + stroke * 0.05 - lift * 0.035 + rim * 0.03 + run;
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

interface Stain {
  canvas: HTMLCanvasElement;
  seed: number;
  w: number;
  h: number;
}

interface Baked {
  canvas: HTMLCanvasElement;
  stain: Stain;
  w: number;
  h: number;
  px: number;
}

/** How much the grain weighs against the pigment in the baked texture. */
const GRAIN_SHARE = 0.21;

export class Wash {
  private grain: HTMLCanvasElement | null = null;
  /** The last two of each, so a wallpaper drawn at another size and then
      put back does not rebuild the page's on the way out. */
  private stains: Stain[] = [];
  private baked: Baked[] = [];

  /** Replaces drawWater: fill the whole back canvas with the water for this depth, painted. `seed` is a per-sitting number for where the pigment pooled. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, water: Water, px: number, seed: number): void {
    // The colour, as it always was: lighter above.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, water.top);
    g.addColorStop(1, water.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (w <= 0 || h <= 0) return;

    const tex = this.texture(Math.round(w), Math.round(h), px, seed);
    if (!tex) return;
    // Black shows best on pale water and white on dark, so the texture is
    // eased to keep the same weight as the water darkens, with no step
    // where it turns; held back on pale water, where a stain shows more
    // than it should.
    const lum = (tone(water.top) + tone(water.bottom)) / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    // The darkest water gets more, so it stays a wash and never goes flat:
    // there only the lifts show, and they need the weight.
    ctx.globalAlpha = 0.27 + 0.28 * lum + 0.25 * (1 - smooth(0.04, 0.3, lum));
    ctx.drawImage(tex, 0, 0, w, h);
    ctx.restore();
  }

  /** The glazes, the pigment, their edges and the grain, baked at the canvas's size. */
  private texture(w: number, h: number, px: number, seed: number): HTMLCanvasElement | null {
    const stain = this.stainFor(w / px, h / px, seed);
    if (!stain) return null;
    const hit = this.baked.find((b) => b.w === w && b.h === h && b.px === px && b.stain === stain);
    if (hit) return hit.canvas;
    const c = canvas(w, h);
    const t = c?.getContext('2d');
    if (!c || !t) return null;
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = 'high';
    t.drawImage(stain.canvas, 0, 0, w, h);
    this.tideLines(t, w, h, px, stain);
    this.grain ??= buildGrain();
    const pattern = this.grain ? t.createPattern(this.grain, 'repeat') : null;
    if (pattern) {
      pattern.setTransform(new DOMMatrix([px, 0, 0, px, 0, 0]));
      t.globalAlpha = GRAIN_SHARE;
      t.fillStyle = pattern;
      t.fillRect(0, 0, w, h);
      t.globalAlpha = 1;
    }
    this.baked = [{ canvas: c, stain, w, h, px }, ...this.baked].slice(0, 2);
    return c;
  }

  /**
   * The edge each glaze dried to: a thin, broken, darker line just inside
   * it, and a breath of white just above where the pigment pulled away.
   * Drawn as lines at the canvas's own size, since the stain is too soft to
   * carry anything this fine.
   */
  private tideLines(t: CanvasRenderingContext2D, w: number, h: number, px: number, stain: Stain): void {
    const glazes = glazesFor(stain.w, stain.h, stain.seed);
    const sx = w / stain.w;
    const sy = h / stain.h;
    const l = lattice(hash32('wash', stain.seed, 'tide'));
    const LEVELS = 4;
    const dark = Array.from({ length: LEVELS }, () => new Path2D());
    const light = new Path2D();
    const stepX = 5;
    for (let k = 1; k < glazes.n; k++) {
      let level = -1;
      for (let X = -stepX; X <= stain.w + stepX; X += stepX) {
        const y = glazes.at(k, X);
        // The line comes and goes along its length, as a dried edge does.
        const v = noise(l, X / 90 + k * 13, k * 7.3);
        // Mostly gone: a dried edge shows in short broken runs, never a rule.
        const lv = v < 0.56 ? -1 : Math.min(LEVELS - 1, Math.floor(((v - 0.56) / 0.44) * LEVELS));
        const x = X * sx;
        const yy = (y + 1.5) * sy;
        if (lv !== level) {
          if (lv >= 0) dark[lv].moveTo(x, yy);
          level = lv;
        } else if (lv >= 0) dark[lv].lineTo(x, yy);
        if (X === -stepX) light.moveTo(x, (y - 5) * sy);
        else light.lineTo(x, (y - 5) * sy);
      }
    }
    t.save();
    t.lineCap = 'round';
    t.lineJoin = 'round';
    t.strokeStyle = '#000000';
    for (let i = 0; i < LEVELS; i++) {
      const a = (i + 1) / LEVELS;
      t.globalAlpha = 0.07 * a;
      t.lineWidth = 4.5 * px;
      t.stroke(dark[i]);
      t.globalAlpha = 0.13 * a;
      t.lineWidth = Math.max(1, 0.8 * px);
      t.stroke(dark[i]);
    }
    t.strokeStyle = '#FFFFFF';
    t.globalAlpha = 0.035;
    t.lineWidth = 9 * px;
    t.stroke(light);
    t.restore();
  }

  private stainFor(cssW: number, cssH: number, seed: number): Stain | null {
    const s = this.stains.find((s) => s.seed === seed && Math.abs(s.w - cssW) <= s.w * SLACK && Math.abs(s.h - cssH) <= s.h * SLACK);
    if (s) return s;
    const c = buildStain(cssW, cssH, seed);
    if (!c) return null;
    const made = { canvas: c, seed, w: cssW, h: cssH };
    this.stains = [made, ...this.stains].slice(0, 2);
    return made;
  }
}

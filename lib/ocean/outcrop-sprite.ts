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
import type { EelPatch, Growth, Outcrop, outcropsInView } from './outcrop';
import { HUES, IRON_GALL, waterAt, type Water } from './palette';
import { detailFor, grain, hatch, inkLine, LIGHT, shadeAcross, stipple, washFill } from './pen';
import { chance, hash32, int, mulberry32, range, type Rand } from './random';

/** The light from the top left, and the other way for light ink on dark
    water, which marks where the light falls rather than where it doesn't. */
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];

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
  // Under the growths, so a coral at its edge stands on the sand.
  if (o.eels) drawSand(ctx, o, o.eels, (f) => padL + span * f, crestY, dark, px);
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

/** How far the crest stands above the rock's top at `f` (0 to 1 along it from
    its own edge), in device pixels: low boulders between the bumps, then the
    lip. Shared by the sprite and `rockTopAt`, so what stands on the rock
    from outside the sprite lands where the ink is. */
function crestRise(o: Outcrop, f: number, px: number): number {
  const n = o.bumps.length;
  const u = (Math.max(0, Math.min(0.88, f)) / 0.88) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  const t = u - i;
  const b = o.bumps[i] + (o.bumps[i + 1] - o.bumps[i]) * (1 - Math.cos(Math.PI * t)) * 0.5;
  return (0.5 + 0.5 * b) * 7 * px + Math.sin(Math.PI * t) * 4 * px;
}

/** Where a point `f` (0..1 along the rock top from its own edge) sits on the page, in device px, for a rock in view: the top of the crest at f. */
export function rockTopAt(o: Outcrop, top: number, f: number, w: number, h: number, px: number): { x: number; y: number } {
  // The sprite's rock starts `padL` in and is placed `ox = padL + 0.03 w`
  // back off the page, so the pad cancels out.
  const x = (o.reach + 0.03) * w * f - 0.03 * w;
  return { x: o.edge < 0 ? x : w - x, y: top * h - crestRise(o, f, px) };
}

/** How high the sand stands over the crest at `f`, in CSS pixels: a low
    mound, highest in the middle and running out to nothing at its ends. */
export function sandLift(p: EelPatch, f: number): number {
  const u = (f - p.at) / (p.width / 2);
  return Math.abs(u) >= 1 ? 0 : 3.5 * (0.5 + 0.5 * Math.cos(Math.PI * u));
}

/** The burrows in a patch, one per eel, each with `f` along the rock top and
    how high the sand lifts it over the crest, in CSS pixels. Evenly spread
    over the middle of the mound and nudged, the way a colony keeps its
    distance. */
export function eelHoles(p: EelPatch): { f: number; lift: number }[] {
  const r = mulberry32(p.seed);
  const spread = p.width * 0.78;
  const step = spread / p.count;
  return Array.from({ length: p.count }, (_, i) => {
    const f = p.at - spread / 2 + step * (i + 0.5) + range(r, -0.22, 0.22) * step;
    return { f, lift: sandLift(p, f) };
  });
}

/** A garden eels' patch: a low mound of pale sand on the rock's top, stippled,
    with a burrow for each eel. The eels are drawn live by `garden-eels.ts`. */
function drawSand(
  ctx: CanvasRenderingContext2D,
  o: Outcrop,
  p: EelPatch,
  X: (f: number) => number,
  crestY: (f: number) => number,
  dark: boolean,
  px: number,
) {
  const zw = waterAt(zoneMid(o.zone), dark ? 'night' : 'paper', '#A8BCC9');
  const sand = dark ? mixHex(zw.bottom, '#D8CCB0', 0.42) : mixHex('#E9DFC6', zw.bottom, 0.22);
  const line = dark ? mixHex(zw.bottom, '#FFFFFF', 0.3) : mixHex(zw.bottom, '#1A1714', 0.55);
  const hole = dark ? '#0B0A09' : mixHex(zw.bottom, '#1A1714', 0.75);
  const alpha = 0.92 * (0.65 + 0.35 * zw.light);
  const f0 = p.at - p.width / 2;
  const top = (f: number) => crestY(f) - sandLift(p, f) * px;
  const crest = new Path2D();
  crest.moveTo(X(f0), top(f0));
  for (let k = 1; k <= 16; k++) crest.lineTo(X(f0 + (p.width * k) / 16), top(f0 + (p.width * k) / 16));
  // Down into the rock a little, so the sand sits in it rather than on it.
  const mound = new Path2D(crest);
  for (let k = 16; k >= 0; k--) mound.lineTo(X(f0 + (p.width * k) / 16), crestY(f0 + (p.width * k) / 16) + 1.5 * px);
  mound.closePath();
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = sand;
  ctx.fill(mound);
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.8 * px;
  ctx.stroke(crest);
  // Stipple, thicker toward the crest of the mound where the grains pile.
  const r = mulberry32(p.seed ^ 0x5a17);
  ctx.fillStyle = line;
  for (let i = 0; i < 22; i++) {
    const f = f0 + p.width * (0.08 + 0.84 * r());
    const lift = sandLift(p, f);
    if (lift < 0.6) continue;
    ctx.globalAlpha = alpha * range(r, 0.25, 0.5);
    ctx.beginPath();
    ctx.arc(X(f), crestY(f) - lift * px * r() * 0.85 + 0.6 * px, range(r, 0.35, 0.6) * px, 0, Math.PI * 2);
    ctx.fill();
  }
  // The burrows: small dark mouths, seen a little from above.
  ctx.fillStyle = hole;
  ctx.globalAlpha = alpha * 0.85;
  for (const b of eelHoles(p)) {
    ctx.beginPath();
    ctx.ellipse(X(b.f), crestY(b.f) - b.lift * px + 0.5 * px, 1.9 * px, 0.75 * px, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Soft blotches, 0 to 1, for where crust gathers on rock: no grid shows. */
function blotch(x: number, y: number, k: number): number {
  return (
    0.5 +
    0.28 * Math.sin(x * 0.021 * k + 1.3) * Math.sin(y * 0.027 * k + 0.4) +
    0.22 * Math.sin((x + y) * 0.047 * k + 2.1) * Math.sin((x - y) * 0.039 * k + 0.7)
  );
}

/** What `inkRock` needs to know about a rock: its crest, its body, and how
    its faces turn to the light. */
export interface RockInk {
  /** Points along the crest from the wall to the lip and a little way down it. */
  crest: number[];
  /** The rock's region: the wash is already laid in it. */
  body: Path2D;
  box: { x: number; y: number; w: number; h: number };
  /** How far down the rock a point is, 0 at the crest to 1 at its foot. */
  v: (x: number, y: number) => number;
  /** How much a point is on the face of the lip, 0 to 1. */
  lip: (x: number) => number;
  /** 1 when the lip faces away from the light (into shadow), -1 toward it. */
  away: number;
  /** Which way the rock runs from the wall, across the page: 1 right, -1 left. */
  dir: 1 | -1;
  /** Where the wash runs dry, so the marks thin out with it: 1 full to 0 gone. */
  fade: (y: number) => number;
  line: string;
  rock: string;
  dark: boolean;
  alpha: number;
  px: number;
  /** How much drawing the rock carries, 0 to 1. */
  d: number;
  seed: number;
  /** A few barnacles on its face. */
  barnacles?: boolean;
  /** Points along the underside, from the lip back to the wall, where it has one. */
  under?: number[];
}

/**
 * A rock in pen and wash, over a wash already laid: the pigment pooled at
 * the crest, paper grain, contour hatching that follows the crest down the
 * face and thickens into the shadow, strokes down the lip, cross-hatching
 * where it is darkest, a crust of stipple gathered in blotches, a few
 * cracks and barnacles, and the crest in one pressure line over it all. On
 * dark water the light ink marks where the light falls instead. Shared by
 * the outcrops and the kelp's ledge; small or live it is only the crest and
 * a few contours, which cost a handful of strokes.
 */
export function inkRock(ctx: CanvasRenderingContext2D, k: RockInk): void {
  const { px, alpha, d } = k;
  const r = mulberry32(k.seed);
  ctx.save();
  ctx.clip(k.body);
  // The pigment that ran to the crest and dried darker there.
  const crestPath = new Path2D();
  crestPath.moveTo(k.crest[0], k.crest[1]);
  for (let i = 2; i < k.crest.length; i += 2) crestPath.lineTo(k.crest[i], k.crest[i + 1]);
  ctx.strokeStyle = mixHex(k.rock, k.dark ? '#000000' : '#1A1714', 0.3);
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 6 * px;
  ctx.stroke(crestPath);
  // How much a mark is wanted at a point: shadow on light water, light on dark.
  const shade = k.dark
    ? (x: number, y: number) => (0.95 - 2.2 * k.v(x, y) - 0.45 * k.lip(x) * k.away + 0.12 * (blotch(x / px, y / px, 1) - 0.5)) * k.fade(y)
    : (x: number, y: number) =>
        (0.12 + 1.05 * Math.pow(k.v(x, y), 1.2) + 0.45 * k.lip(x) * k.away + 0.2 * (blotch(x / px, y / px, 1) - 0.5)) *
        (0.4 + 0.6 * k.fade(y));
  if (d > 0.35) {
    // Paper tooth, in bands that thin as the wash runs dry.
    const gr = grain(ctx);
    if (gr) {
      gr.setTransform?.(new DOMMatrix([px, 0, 0, px, 0, 0]));
      ctx.fillStyle = gr;
      const bands = 6;
      for (let b = 0; b < bands; b++) {
        const y = k.box.y + (k.box.h * b) / bands;
        ctx.globalAlpha = alpha * (k.dark ? 0.35 : 0.28) * k.fade(y + k.box.h / bands / 2);
        ctx.fillRect(k.box.x, y, k.box.w, k.box.h / bands + 1);
      }
    }
  }
  // The pen strokes that model it, as wavering ribbons that break now and
  // then the way an engraver's lines do, so no run of them reads as a pattern.
  const strokes = new Path2D();
  const ribbon = (pts: number[], weight: (x: number, y: number, i: number) => number, ph: number) => {
    const run: number[] = [];
    let along = 0;
    const flush = () => {
      const m = run.length / 3;
      if (m >= 3) {
        strokes.moveTo(run[0], run[1] - run[2] / 2);
        for (let j = 1; j < m; j++) strokes.lineTo(run[j * 3], run[j * 3 + 1] - run[j * 3 + 2] / 2);
        for (let j = m - 1; j >= 0; j--) strokes.lineTo(run[j * 3], run[j * 3 + 1] + run[j * 3 + 2] / 2);
        strokes.closePath();
      }
      run.length = 0;
    };
    for (let j = 0; j < pts.length; j += 2) {
      if (j) along += Math.hypot(pts[j] - pts[j - 2], pts[j + 1] - pts[j - 1]);
      const gap = Math.sin(ph + along / (19 * px)) * Math.sin(ph * 1.7 + along / (7.3 * px));
      const wd = weight(pts[j], pts[j + 1], j / 2);
      if (gap < 0.55 && wd > 0.15 * px) run.push(pts[j], pts[j + 1], wd);
      else flush();
    }
    flush();
  };
  const fine = d > 0.35;
  const sp = (fine ? 2.6 : 3.4) * px;
  // Under the crest: the crest again a little way down, its boulders easing
  // out as it goes, so the top reads as rolling over.
  const m = k.crest.length / 2;
  const base: number[] = [];
  for (let j = 0; j < m; j++) {
    let sum = 0;
    let c = 0;
    for (let q = Math.max(0, j - 6); q <= Math.min(m - 1, j + 6); q++, c++) sum += k.crest[q * 2 + 1];
    base.push(sum / c);
  }
  const n1 = fine ? 6 : 3;
  for (let i = 1; i <= n1; i++) {
    const damp = 1 - i / (n1 + 2);
    const pts: number[] = [];
    const ph = r() * 6.28;
    for (let j = 0; j < m; j++) {
      const x = k.crest[j * 2];
      pts.push(x, base[j] + (k.crest[j * 2 + 1] - base[j]) * damp + i * sp + Math.sin(ph + x / (29 * px)) * sp * 0.25);
    }
    const t = i / n1;
    ribbon(
      pts,
      (x, y) =>
        (fine ? 0.6 : 0.5) * px * k.fade(y) * (k.dark ? 1.2 * (1 - 0.7 * t) : 0.45 + 0.9 * t) * (0.55 + 0.9 * (blotch(x / px, y / px, 1) - 0.2)),
      ph,
    );
  }
  // Up from the underside, where the rock turns away into its own shadow:
  // lines that follow it, heaviest at the edge.
  if (k.under && k.under.length >= 4) {
    const n2 = fine ? 9 : 4;
    for (let i = 0; i < n2; i++) {
      const pts: number[] = [];
      const ph = r() * 6.28;
      for (let j = 0; j < k.under.length; j += 2) {
        const x = k.under[j];
        pts.push(x, k.under[j + 1] - (i + 0.6) * sp + Math.sin(ph + x / (31 * px)) * sp * 0.2);
      }
      const t = i / n2;
      ribbon(pts, (x, y) => (k.dark ? 0 : (fine ? 0.75 : 0.55) * px * (1.25 - t) * Math.sqrt(k.fade(y)) * (0.6 + 0.8 * (blotch(x / px, y / px, 1) - 0.2))), ph);
    }
  }
  ctx.fillStyle = k.line;
  ctx.globalAlpha = alpha * (fine ? 0.6 : 0.32);
  ctx.fill(strokes);
  if (fine) {
    // Down the face, near-upright strokes where it is in shadow (or, on dark
    // water, in the light), heaviest on the lip.
    hatch(ctx, k.body, k.box, {
      spacing: 2.6 * px,
      angle: Math.PI / 2 - 0.22 * k.dir,
      shade: (x, y) => (k.dark ? shade(x, y) * (0.5 + 0.6 * k.lip(x)) : shade(x, y) * (0.75 + 0.35 * k.lip(x) * k.away)),
      from: 0.55,
      color: k.line,
      width: 0.5 * px,
      alpha: alpha * 0.5,
      seed: k.seed ^ 5,
    });
    // And across them where it is darkest, a second set.
    if (!k.dark) {
      hatch(ctx, k.body, k.box, {
        spacing: 2.9 * px,
        angle: -0.6 * k.dir,
        shade: (x, y) => shade(x, y),
        from: 0.85,
        color: k.line,
        width: 0.45 * px,
        alpha: alpha * 0.4,
        seed: k.seed ^ 9,
      });
    }
    // A crust of stipple, gathered in blotches, thickest near the crest.
    stipple(ctx, k.body, k.box, {
      spacing: 2.2 * px,
      radius: 0.42 * px,
      shade: (x, y) => (0.2 + 0.8 * blotch(x / px, y / px, 1.7)) * (1 - 0.75 * k.v(x, y)) * k.fade(y),
      from: 0.32,
      color: k.line,
      alpha: alpha * 0.55,
      seed: k.seed ^ 13,
    });
  }
  ctx.restore();
  if (d > 0.25) {
    // Cracks: short jagged lines in from the crest and across the lip,
    // now and then forking.
    const count = 2 + Math.floor(r() * 3);
    for (let c = 0; c < count; c++) {
      const j = 2 * Math.floor((0.15 + r() * 0.75) * (k.crest.length / 2 - 1));
      let cx = k.crest[j];
      let cy = k.crest[j + 1] + (2 + r() * 5) * px;
      let a = Math.PI / 2 + (r() - 0.5) * 0.9;
      const crack: number[] = [cx, cy];
      const segs = 3 + Math.floor(r() * 4);
      for (let s = 0; s < segs; s++) {
        a += (r() - 0.5) * 1.3;
        a = Math.max(0.4, Math.min(Math.PI - 0.4, a));
        const len = (3 + r() * 5) * px;
        cx += Math.cos(a) * len;
        cy += Math.sin(a) * len;
        crack.push(cx, cy);
        if (s === 1 && r() < 0.5) {
          const fa = a + (r() < 0.5 ? 0.8 : -0.8);
          inkLine(ctx, [cx, cy, cx + Math.cos(fa) * 4 * px, cy + Math.sin(fa) * 4 * px, cx + Math.cos(fa + 0.3) * 8 * px, cy + Math.sin(fa + 0.3) * 8 * px], false, {
            width: 0.5 * px,
            color: k.line,
            alpha: alpha * 0.5 * k.fade(cy),
            taper: [0, 0.8],
            seed: c * 7 + 1,
            raw: true,
            min: 0.2 * px,
          });
        }
      }
      inkLine(ctx, crack, false, { width: 0.8 * px, color: k.line, alpha: alpha * 0.7 * k.fade(cy), taper: [0.05, 0.7], seed: c * 7 + 3, raw: true, min: 0.2 * px });
    }
  }
  if (k.barnacles && d > 0.3 && r() < 0.65) {
    // A few barnacles just under the crest: a low cone, its plates, the slit on top.
    const nb = 2 + Math.floor(r() * 4);
    const j0 = 2 * Math.floor((0.2 + r() * 0.5) * (k.crest.length / 2 - 1));
    const shell = k.dark ? mixHex(k.rock, '#E8E0CF', 0.35) : mixHex(k.rock, '#FBF8EF', 0.55);
    for (let b = 0; b < nb; b++) {
      const j = Math.min(k.crest.length - 2, j0 + 2 * Math.floor(b * (1.5 + r() * 2)));
      const bw = (2.2 + r() * 1.6) * px;
      const x = k.crest[j] + (r() - 0.5) * 4 * px;
      const y = k.crest[j + 1] + (2.5 + r() * 6) * px;
      const cone = new Path2D();
      cone.moveTo(x - bw, y + bw * 0.35);
      cone.quadraticCurveTo(x - bw * 0.7, y - bw * 0.6, x - bw * 0.3, y - bw * 0.7);
      cone.lineTo(x + bw * 0.3, y - bw * 0.7);
      cone.quadraticCurveTo(x + bw * 0.7, y - bw * 0.6, x + bw, y + bw * 0.35);
      cone.closePath();
      ctx.fillStyle = shell;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fill(cone);
      ctx.strokeStyle = k.line;
      ctx.lineWidth = 0.5 * px;
      ctx.globalAlpha = alpha * 0.8;
      ctx.stroke(cone);
      ctx.beginPath();
      ctx.moveTo(x - bw * 0.25, y - bw * 0.62);
      ctx.lineTo(x + bw * 0.25, y - bw * 0.62);
      for (const f of [-0.55, 0, 0.55]) {
        ctx.moveTo(x + f * bw * 0.5, y - bw * 0.55);
        ctx.lineTo(x + f * bw, y + bw * 0.25);
      }
      ctx.lineWidth = 0.4 * px;
      ctx.globalAlpha = alpha * 0.6;
      ctx.stroke();
    }
  }
  // The crest, in one pressure line that runs on down the lip and lifts.
  inkLine(ctx, k.crest, false, {
    width: (d > 0.35 ? 1.5 : 1.25) * px,
    color: k.line,
    alpha: alpha * 0.85,
    swell: 0.8,
    taper: [0, 0.16],
    lost: d > 0.35 ? 0.3 : 0.15,
    seed: k.seed ^ 3,
    raw: true,
    light: k.dark ? UNLIGHT : LIGHT,
    min: 0.3 * px,
  });
}

/** A cubic's points, appended to `out` (not its start). */
function cubicPts(out: number[], p: number[], n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
      u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
    );
  }
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
  const line = dark ? IRON_GALL.dark : IRON_GALL.light;
  // Fainter as the light goes, but never lost: in the dark the rock is
  // what the growths stand on, and it is mostly its ink that shows.
  const alpha = 0.92 * (0.65 + 0.35 * zw.light);

  const crestY = (f: number) => top - crestRise(o, f, px);
  const edge = new Path2D();
  const crest: number[] = [X(0), crestY(0)];
  edge.moveTo(X(0), crestY(0));
  for (let k = 1; k <= 48; k++) {
    edge.lineTo(X((k / 48) * 0.88), crestY((k / 48) * 0.88));
    crest.push(X((k / 48) * 0.88), crestY((k / 48) * 0.88));
  }
  const lipTop = crestY(0.88);
  const lip = [X(0.88), lipTop, X(0.96), lipTop, X(1.01), top + thick * 0.12, X(0.97), top + thick * 0.3];
  edge.bezierCurveTo(lip[2], lip[3], lip[4], lip[5], lip[6], lip[7]);
  cubicPts(crest, lip, 10);
  // The underside runs back to the wall and is never inked: the wash runs dry
  // before it gets there.
  const under = [X(0.97), top + thick * 0.3, X(0.8), top + thick * 0.45, X(0.3), top + thick * 0.7, X(0), top + thick];
  const body = new Path2D(edge);
  body.bezierCurveTo(under[2], under[3], under[4], under[5], under[6], under[7]);
  body.closePath();
  // A little way on round the lip, where the pen lifts.
  cubicPts(crest, [under[0], under[1], X(0.93), top + thick * 0.35, X(0.88), top + thick * 0.4, X(0.84), top + thick * 0.42], 4);

  const g = ctx.createLinearGradient(0, top, 0, top + thick);
  g.addColorStop(0, rock);
  g.addColorStop(0.4, rock);
  g.addColorStop(1, `${rock}00`);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = g;
  ctx.fill(body);
  // The underside as a lookup by x, for how far down the rock a point is.
  const ux: number[] = [];
  const uy: number[] = [];
  const tmp: number[] = [under[0], under[1]];
  cubicPts(tmp, under, 24);
  for (let i = 0; i < tmp.length; i += 2) {
    ux.push(tmp[i]);
    uy.push(tmp[i + 1]);
  }
  const underAt = (x: number) => {
    if (x >= ux[0]) return uy[0];
    for (let i = 1; i < ux.length; i++) {
      if (x >= ux[i]) {
        const t = (x - ux[i]) / (ux[i - 1] - ux[i] || 1);
        return uy[i] + (uy[i - 1] - uy[i]) * t;
      }
    }
    return uy[uy.length - 1];
  };
  const f0 = (x: number) => Math.max(0, Math.min(0.88, (x - x0) / span));
  ctx.restore();
  inkRock(ctx, {
    crest,
    body,
    box: { x: x0, y: top - 14 * px, w: span * 1.03, h: thick + 14 * px },
    v: (x, y) => {
      const c = crestY(f0(x));
      return Math.max(0, Math.min(1, (y - c) / Math.max(4 * px, underAt(x) - c)));
    },
    lip: (x) => Math.max(0, 1 - Math.abs(x - X(0.95)) / (0.12 * span)),
    away: 1,
    dir: 1,
    fade: (y) => Math.max(0, Math.min(1, 1.25 - (y - top) / thick)),
    line,
    rock,
    dark,
    alpha,
    px,
    d: detailFor(Math.min(span, thick * 2.5)),
    seed: hash32(o.id, 'rock'),
    barnacles: o.zone < 2,
    under: tmp,
  });
  return crestY;
}

// ---------------------------------------------------------------------------
// The growths. Each is drawn at its base, standing up (-y), `H` device pixels tall.
//
// Every one is in the same pen as the rock and the animals: a wash of its
// colour (watercolour, pooled at the edge with the paper left bare, when the
// drawing is big enough to show it), shading laid in ink on its shadow side,
// and its own anatomy finer the bigger it is drawn: polyps on the coral,
// grooves in the brain, a lattice in the fan, pores in the sponge. Each
// shape keeps the dice it was always rolled with; what the detail needs
// comes off a second stream, so nothing that stood on a rock moves.

interface Ink {
  /** The pen: every line, in the one ink. */
  ink: string;
  body: string;
  /** The wash on its shadow side. */
  deep: string;
  /** The wash where the light lands: toward the paper, or a faint lift on dark water. */
  lit: string;
  /** The dark of an opening: a sponge's mouth. */
  hollow: string;
  /** A sea pen's light, in the dark. */
  glow: string | null;
}

/** The animals' rule, with the colour drained toward grey and then pale with
    depth; the lines all in the one ink. */
function inkFor(g: Growth, zone: number, dark: boolean): Ink {
  let c = HUES[Math.max(0, Math.min(HUES.length - 1, Math.round(g.hue)))];
  if (zone === 1) c = mixHex(c, '#9AA3AB', 0.5);
  else if (zone >= 2) c = mixHex(c, '#EFE9DC', 0.75);
  const water = dark ? '#1A1815' : '#FBF8EF';
  const body = dark ? mixHex(c, water, 0.45) : mixHex(c, water, 0.2);
  return {
    ink: dark ? IRON_GALL.dark : IRON_GALL.light,
    body,
    deep: dark ? mixHex(body, '#000000', 0.32) : mixHex(body, '#3A2E26', 0.25),
    lit: dark ? mixHex(body, IRON_GALL.dark, 0.35) : mixHex(body, '#FBF8EF', 0.6),
    hollow: dark ? '#0B0A09' : mixHex(c, '#1A1714', 0.75),
    glow: dark && zone >= 2 ? mixHex(c, '#FFFFFF', 0.55) : null,
  };
}

/** How a growth is being drawn. */
interface GPen {
  /** How much drawing it carries, 0 to 1. */
  d: number;
  dark: boolean;
  /** The light as the pen takes it: reversed on dark water, where the light ink marks the light. */
  light: [number, number];
  /** A second stream of dice for the detail, so the shape keeps its own. */
  r2: Rand;
  px: number;
  seed: number;
}

function drawGrowth(ctx: CanvasRenderingContext2D, g: Growth, zone: number, dark: boolean, px: number) {
  const r = mulberry32(g.seed);
  const ink = inkFor(g, zone, dark);
  const H = g.size * px;
  ctx.globalAlpha = zone === 0 ? 0.95 : zone === 1 ? 0.85 : 0.6;
  ctx.fillStyle = ink.body;
  ctx.strokeStyle = ink.ink;
  ctx.lineWidth = 0.9 * px;
  // A growth is small on its rock, so it is judged at three times its height:
  // a reef seen on a wallpaper is near enough to show its polyps.
  const pen: GPen = { d: detailFor(H * 3), dark, light: dark ? UNLIGHT : LIGHT, r2: mulberry32(g.seed ^ 0x6d2b79f5), px, seed: g.seed };
  DRAW[g.kind](ctx, H, ink, r, px, pen);
}

type Drawer = (ctx: CanvasRenderingContext2D, H: number, ink: Ink, r: Rand, px: number, pen: GPen) => void;

/** Stroke at a fraction of the current alpha, then put it back. */
function faint(ctx: CanvasRenderingContext2D, k: number, draw: () => void) {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * k;
  draw();
  ctx.globalAlpha = a;
}

/** A quadratic's points, appended to `out` (not its start). */
function quadPts(out: number[], x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
  }
}

/** An elliptical arc's points from angle a0 to a1, appended to `out`. */
function arcPts(out: number[], cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
}

function boxOf(pts: number[]) {
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
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

function pathOf(pts: number[], closed = true): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  if (closed) p.closePath();
  return p;
}

/** A wash in a shape: watercolour when the drawing is big enough to show it, else flat. */
function wash(ctx: CanvasRenderingContext2D, path: Path2D, box: { x: number; y: number; w: number; h: number }, color: string, pen: GPen, k = 1) {
  const a = ctx.globalAlpha;
  if (pen.d > 0.3) {
    ctx.globalAlpha = 1;
    washFill(ctx, path, box, {
      color,
      alpha: a * k,
      edge: 0.3,
      paper: pen.dark ? null : '#FBF8EF',
      highlight: 0.4,
      granulate: 0.3,
      px: pen.px,
    });
    ctx.globalAlpha = a;
  } else {
    ctx.globalAlpha = a * k;
    ctx.fillStyle = color;
    ctx.fill(path);
    ctx.globalAlpha = a;
  }
}

/** Engraved shading on a shape's shadow side (its lit side, on dark water). */
function shadeIn(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  box: { x: number; y: number; w: number; h: number },
  ink: Ink,
  pen: GPen,
  o: { angle?: number; spacing?: number; from?: number; cross?: number | null; bow?: number; k?: number; dots?: boolean } = {},
) {
  if (pen.d <= 0.4) return;
  const shade = shadeAcross(box, pen.light);
  if (o.dots) {
    stipple(ctx, path, box, {
      spacing: (o.spacing ?? 1.6) * pen.px,
      radius: 0.33 * pen.px,
      shade,
      from: o.from ?? 0.45,
      color: ink.ink,
      alpha: o.k ?? 0.6,
      seed: pen.seed ^ 0x51,
    });
    return;
  }
  hatch(ctx, path, box, {
    spacing: (o.spacing ?? 1.9) * pen.px,
    angle: o.angle ?? 0.9,
    shade,
    from: o.from ?? (pen.dark ? 0.6 : 0.5),
    cross: pen.dark || o.cross === null ? undefined : (o.cross ?? 0.84),
    color: ink.ink,
    width: 0.42 * pen.px,
    alpha: o.k ?? 0.55,
    bow: o.bow ?? 0.4,
    seed: pen.seed ^ 0x77,
  });
}

/** The pen's line round a shape, or along it. */
function outline(ctx: CanvasRenderingContext2D, pts: number[], closed: boolean, ink: Ink, pen: GPen, width = 0.8, taper?: [number, number]) {
  inkLine(ctx, pts, closed, {
    width: width * pen.px,
    color: ink.ink,
    swell: 0.8,
    lost: pen.d > 0.4 ? 0.3 : 0.1,
    taper,
    seed: pen.seed,
    light: pen.light,
    min: 0.25 * pen.px,
  });
}

const DRAW: Record<Growth['kind'], Drawer> = {
  // Antler coral: forking three or four times, each branch a tube outlined
  // in ink, shaded down its far side and lifted down its near one, and
  // studded with polyp cups when drawn big.
  branch(ctx, H, ink, r, px, pen) {
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
    const stroke = (color: string, width: (wd: number) => number, off: number) => {
      ctx.strokeStyle = color;
      for (const [x, y, cx, cy, x1, y1, wd] of segs) {
        // Across the branch, toward its shadow side.
        const l = Math.hypot(x1 - x, y1 - y) || 1;
        let nx = -(y1 - y) / l;
        let ny = (x1 - x) / l;
        if (nx * LIGHT[0] + ny * LIGHT[1] < 0) {
          nx = -nx;
          ny = -ny;
        }
        const o = off * wd;
        ctx.lineWidth = width(wd);
        ctx.beginPath();
        ctx.moveTo(x + nx * o, y + ny * o);
        ctx.quadraticCurveTo(cx + nx * o, cy + ny * o, x1 + nx * o, y1 + ny * o);
        ctx.stroke();
      }
    };
    stroke(ink.ink, (wd) => wd + 1.3 * px, 0);
    stroke(ink.body, (wd) => wd, 0);
    // The far side in shadow, the near side catching the light.
    faint(ctx, 0.7, () => stroke(ink.deep, (wd) => wd * 0.38, 0.24));
    faint(ctx, 0.6, () => stroke(ink.lit, (wd) => wd * 0.2, -0.22));
    if (pen.d > 0.3) {
      // Polyps: small cups along every branch, set either side, the way
      // antler coral is pitted all over.
      const cups = new Path2D();
      for (const [x, y, cx, cy, x1, y1, wd] of segs) {
        const l = Math.hypot(x1 - x, y1 - y);
        const steps = Math.max(2, Math.floor(l / (2.6 * px)));
        for (let s = 1; s < steps; s++) {
          const t = (s + (pen.r2() - 0.5) * 0.5) / steps;
          const u = 1 - t;
          const px0 = u * u * x + 2 * u * t * cx + t * t * x1;
          const py0 = u * u * y + 2 * u * t * cy + t * t * y1;
          const tx = 2 * u * (cx - x) + 2 * t * (x1 - cx);
          const ty = 2 * u * (cy - y) + 2 * t * (y1 - cy);
          const tl = Math.hypot(tx, ty) || 1;
          const side = (s % 2 ? 1 : -1) * wd * (0.18 + 0.12 * pen.r2());
          const qx = px0 - (ty / tl) * side;
          const qy = py0 + (tx / tl) * side;
          const cr = Math.max(0.35 * px, wd * 0.11);
          cups.moveTo(qx + cr, qy);
          cups.arc(qx, qy, cr, 0, Math.PI * 2);
        }
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.55, () => ctx.stroke(cups));
    }
  },

  // Brain coral: a low dome washed in its colour and shaded on its far side,
  // its meandering grooves following the curve, each one a dark valley with a
  // lit ridge beside it, finer and more of them the bigger it is drawn.
  brain(ctx, H, ink, r, px, pen) {
    const rx = H * 0.8;
    const ry = H * 0.55;
    const pts: number[] = [];
    arcPts(pts, 0, 0, rx, ry, Math.PI, Math.PI * 2, 40);
    const dome = pathOf(pts);
    const box = { x: -rx, y: -ry, w: rx * 2, h: ry };
    wash(ctx, dome, box, ink.body, pen);
    shadeIn(ctx, dome, box, ink, pen, { angle: 1.2, bow: 0.9 });
    ctx.save();
    ctx.clip(dome);
    const rings: { rk: number; freq: number; ph: number }[] = [];
    for (let k = 1; k <= 5; k++) rings.push({ rk: k / 6, freq: int(r, 7, 12), ph: range(r, 0, Math.PI * 2) });
    if (pen.d > 0.3) {
      for (let k = 0; k < 5; k++) rings.push({ rk: (k + 1.5) / 6, freq: int(pen.r2, 9, 15), ph: range(pen.r2, 0, Math.PI * 2) });
    }
    const groove = (rk: number, freq: number, ph: number, dx: number, dy: number) => {
      for (let s = 0; s <= 48; s++) {
        const t = Math.PI + (Math.PI * s) / 48;
        const rad = rk + 0.06 * Math.sin(t * freq + ph) + 0.03 * Math.sin(t * freq * 2.3 + ph * 1.7);
        const x = Math.cos(t) * rx * rad + dx;
        const y = Math.sin(t) * ry * rad + dy;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };
    if (pen.d > 0.3) {
      // The ridges, lifted toward the light beside each valley.
      ctx.beginPath();
      for (const g of rings) groove(g.rk, g.freq, g.ph, -0.7 * px, -0.7 * px);
      ctx.strokeStyle = ink.lit;
      ctx.lineWidth = 0.7 * px;
      faint(ctx, 0.7, () => ctx.stroke());
    }
    ctx.beginPath();
    for (const g of rings) groove(g.rk, g.freq, g.ph, 0, 0);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.55 : 0.8) * px;
    faint(ctx, 0.6, () => ctx.stroke());
    ctx.restore();
    outline(ctx, pts, true, ink, pen);
  },

  // Sea fan: a short stem opening into a flat fan of ribs, crossed into a
  // lattice, over a thin wash; big, the lattice is a fine mesh and the ribs
  // carry their polyps.
  fan(ctx, H, ink, r, px, pen) {
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
    const hull: number[] = [sx, oy];
    for (const pts of ribs) hull.push(pts[6][0], pts[6][1]);
    const fanPath = pathOf(hull);
    wash(ctx, fanPath, boxOf(hull), ink.body, pen, 0.3);
    // The stem, stout at the holdfast.
    outline(ctx, [0, 0, sx * 0.5, oy * 0.5, sx, oy], false, ink, pen, 1.6, [0, 0.3]);
    // The lattice: rows across the ribs, and big, rows between those and the
    // little cross-links that make a fan a net.
    const at = (i: number, k: number): [number, number] => {
      const k0 = Math.floor(k);
      const f = k - k0;
      const a = ribs[i][Math.min(6, k0)];
      const b = ribs[i][Math.min(6, k0 + 1)];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    ctx.beginPath();
    const rows = pen.d > 0.3 ? [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5] : [1, 2, 3, 4, 5];
    for (const k of rows) {
      ctx.moveTo(...at(0, k));
      for (let i = 1; i < n; i++) ctx.lineTo(...at(i, k));
    }
    if (pen.d > 0.3) {
      for (let i = 0; i < n - 1; i++) {
        for (const k of rows) {
          if (k >= 5.5 || pen.r2() < 0.45) continue;
          const [ax, ay] = at(i, k);
          const [bx, by] = at(i + 1, k + 0.5);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
      }
    }
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.4 : 0.5) * px;
    faint(ctx, 0.5, () => ctx.stroke());
    // The ribs in the pen, each running out to a fork at its tip.
    for (const pts of ribs) {
      const flat: number[] = [];
      for (const [x, y] of pts) flat.push(x, y);
      outline(ctx, flat, false, ink, pen, 0.6, [0, 0.35]);
    }
    ctx.beginPath();
    for (const pts of ribs) {
      const [ex, ey] = pts[6];
      const [px0, py0] = pts[5];
      const dx = (ex - px0) * 0.35;
      const dy = (ey - py0) * 0.35;
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + dx - dy * 0.6, ey + dy + dx * 0.6);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + dx + dy * 0.6, ey + dy - dx * 0.6);
    }
    ctx.lineWidth = 0.45 * px;
    faint(ctx, 0.7, () => ctx.stroke());
    if (pen.d > 0.45) {
      const dots = new Path2D();
      for (const pts of ribs) {
        for (let k = 1.3; k < 6; k += 0.55) {
          const [x, y] = at(ribs.indexOf(pts), k);
          dots.moveTo(x + 0.45 * px, y);
          dots.arc(x, y, 0.45 * px, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = ink.ink;
      faint(ctx, 0.5, () => ctx.fill(dots));
      ctx.fillStyle = ink.body;
    }
  },

  // Anemone: a short column, its disc crowned with curving tentacles that
  // taper to fine tips, each ending in a little knob.
  anemone(ctx, H, ink, r, px, pen) {
    const cw = H * 0.3;
    const tw = H * 0.38;
    const chh = H * 0.36;
    const n = int(r, 14, 20);
    const tents: number[][] = [];
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
      const pts: number[] = [bx, by];
      quadPts(pts, bx, by, cx, cy, ex, ey, 10);
      tents.push(pts);
    }
    // Each tentacle a ribbon, full at the disc and fine at the tip.
    const base = Math.max(1.4 * px, H * 0.045);
    const tentPath = new Path2D();
    const tips: [number, number][] = [];
    for (const pts of tents) {
      const m = pts.length / 2;
      const left: number[] = [];
      const right: number[] = [];
      for (let j = 0; j < m; j++) {
        const a0 = Math.max(0, j - 1);
        const a1 = Math.min(m - 1, j + 1);
        const tx = pts[a1 * 2] - pts[a0 * 2];
        const ty = pts[a1 * 2 + 1] - pts[a0 * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        const hw = (base / 2) * (1 - 0.72 * (j / (m - 1))) ** 1.1;
        left.push(pts[j * 2] - (ty / tl) * hw, pts[j * 2 + 1] + (tx / tl) * hw);
        right.push(pts[j * 2] + (ty / tl) * hw, pts[j * 2 + 1] - (tx / tl) * hw);
      }
      tentPath.moveTo(left[0], left[1]);
      for (let j = 2; j < left.length; j += 2) tentPath.lineTo(left[j], left[j + 1]);
      for (let j = right.length - 2; j >= 0; j -= 2) tentPath.lineTo(right[j], right[j + 1]);
      tentPath.closePath();
      tips.push([pts[pts.length - 2], pts[pts.length - 1]]);
    }
    ctx.fillStyle = ink.body;
    ctx.fill(tentPath);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.5 : 0.7) * px;
    ctx.stroke(tentPath);
    if (pen.d > 0.3) {
      // A shadow down the far side of each.
      ctx.save();
      ctx.clip(tentPath);
      ctx.translate(base * 0.35, base * 0.2);
      ctx.strokeStyle = ink.deep;
      ctx.lineWidth = base * 0.35;
      faint(ctx, 0.6, () => {
        ctx.beginPath();
        for (const pts of tents) {
          ctx.moveTo(pts[0], pts[1]);
          for (let j = 2; j < pts.length - 4; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
        }
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.lineWidth = 0.4 * px;
    ctx.fillStyle = ink.body;
    for (const [x, y] of tips) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7 * px, base * 0.24), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = ink.body;
    // The column, washed and shaded, striped down its length.
    const col: number[] = [-cw / 2, 0];
    quadPts(col, -cw / 2, 0, -cw * 0.42, -chh * 0.6, -tw / 2, -chh, 10);
    arcPts(col, 0, -chh, tw / 2, H * 0.05, Math.PI, 0, 16);
    quadPts(col, tw / 2, -chh, cw * 0.42, -chh * 0.6, cw / 2, 0, 10);
    const colPath = pathOf(col);
    const box = boxOf(col);
    wash(ctx, colPath, box, ink.body, pen);
    shadeIn(ctx, colPath, box, ink, pen, { angle: Math.PI / 2 - 0.15, bow: 0, from: 0.55 });
    ctx.beginPath();
    const stripes = pen.d > 0.3 ? [-0.36, -0.22, -0.08, 0.08, 0.22, 0.36] : [-0.22, 0, 0.22];
    for (const f of stripes) {
      ctx.moveTo(f * cw, -2 * px);
      ctx.lineTo(f * tw, -chh + 3 * px);
    }
    ctx.lineWidth = 0.5 * px;
    faint(ctx, 0.4, () => ctx.stroke());
    outline(ctx, col, true, ink, pen, 0.85);
  },

  // Tube sponges: a few upright tubes, round-lipped, dark in the mouth,
  // shaded down their far side and pitted with pores when drawn big.
  tube(ctx, H, ink, r, px, pen) {
    const n = int(r, 2, 4);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * H * 0.2 + range(r, -0.03, 0.03) * H;
      const tw = H * range(r, 0.16, 0.22);
      const th = H * (i === Math.floor(n / 2) ? range(r, 0.85, 1) : range(r, 0.5, 0.85));
      const ry = tw * 0.22;
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(range(r, -0.12, 0.12) + (i - (n - 1) / 2) * 0.06);
      const pts: number[] = [-tw * 0.4, 0];
      quadPts(pts, -tw * 0.4, 0, -tw * 0.56, -th * 0.5, -tw / 2, -th, 10);
      arcPts(pts, 0, -th, tw / 2, ry, Math.PI, Math.PI * 2, 14);
      quadPts(pts, tw / 2, -th, tw * 0.56, -th * 0.5, tw * 0.4, 0, 10);
      const p = pathOf(pts);
      const box = { x: -tw * 0.56, y: -th - ry, w: tw * 1.12, h: th + ry };
      wash(ctx, p, box, ink.body, pen);
      shadeIn(ctx, p, box, ink, pen, { angle: Math.PI / 2 - 0.05, bow: 0, from: 0.55, cross: 0.9 });
      ctx.beginPath();
      for (const f of [0.3, 0.55, 0.78]) {
        const y = -th * f;
        ctx.moveTo(-tw * 0.48, y);
        ctx.quadraticCurveTo(0, y + ry * 1.4, tw * 0.48, y);
      }
      ctx.lineWidth = 0.55 * px;
      faint(ctx, 0.35, () => ctx.stroke());
      if (pen.d > 0.3) {
        // Pores: small dark openings over the near face, each with a lit lower lip.
        const pores = new Path2D();
        const lips = new Path2D();
        const count = Math.round(5 + 10 * pen.d * (th / H));
        for (let k = 0; k < count; k++) {
          const v = 0.1 + 0.78 * pen.r2();
          const u = (pen.r2() - 0.5) * 0.75;
          const prx = (0.5 + pen.r2() * 0.6) * px * (1 - Math.abs(u));
          const qx = u * tw;
          const qy = -th * v;
          pores.moveTo(qx + prx, qy);
          pores.ellipse(qx, qy, prx, prx * 0.7, 0, 0, Math.PI * 2);
          lips.moveTo(qx + prx, qy + 0.3 * px);
          lips.ellipse(qx, qy + 0.3 * px, prx, prx * 0.7, 0, 0.2, Math.PI - 0.2);
        }
        ctx.fillStyle = ink.hollow;
        faint(ctx, 0.6, () => ctx.fill(pores));
        ctx.strokeStyle = ink.lit;
        ctx.lineWidth = 0.4 * px;
        faint(ctx, 0.7, () => ctx.stroke(lips));
        ctx.strokeStyle = ink.ink;
      }
      ctx.beginPath();
      ctx.ellipse(0, -th, tw * 0.36, ry * 0.65, 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.hollow;
      faint(ctx, 0.75, () => ctx.fill());
      ctx.fillStyle = ink.body;
      outline(ctx, pts, true, ink, pen, 0.9);
      const rim: number[] = [];
      arcPts(rim, 0, -th, tw / 2, ry, 0, Math.PI, 14);
      outline(ctx, rim, false, ink, pen, 0.7, [0.1, 0.1]);
      ctx.restore();
    }
  },

  // Urchin: a round test bristling with fine tapering spines, none into the
  // rock, its tubercles in rows when drawn big.
  urchin(ctx, H, ink, r, px, pen) {
    const R = H * 0.2;
    const cy = -R;
    const spines = new Path2D();
    const n = int(r, 26, 34);
    const sw = 0.32 * px;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + range(r, -0.08, 0.08);
      if (Math.sin(a) > 0.2) continue;
      const len = H * range(r, 0.3, 0.45);
      const c = Math.cos(a);
      const s = Math.sin(a);
      // A long thin wedge: wide at the test, a point at the tip.
      spines.moveTo(c * R * 0.8 - s * sw, cy + s * R * 0.8 + c * sw);
      spines.lineTo(c * (R + len), cy + s * (R + len));
      spines.lineTo(c * R * 0.8 + s * sw, cy + s * R * 0.8 - c * sw);
      spines.closePath();
    }
    ctx.fillStyle = mixHex(ink.ink, ink.body, 0.25);
    faint(ctx, 0.85, () => ctx.fill(spines));
    const test: number[] = [];
    arcPts(test, 0, cy, R, R, 0, Math.PI * 2, 32);
    const testPath = pathOf(test);
    const box = { x: -R, y: cy - R, w: R * 2, h: R * 2 };
    wash(ctx, testPath, box, ink.body, pen);
    shadeIn(ctx, testPath, box, ink, pen, { dots: true, spacing: 1.3, from: 0.45 });
    outline(ctx, test, true, ink, pen, 0.9);
    ctx.fillStyle = ink.ink;
    faint(ctx, 0.5, () => {
      for (let i = 0; i < 9; i++) {
        const a = range(r, 0, Math.PI * 2);
        const d = R * range(r, 0.2, 0.7);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, (pen.d > 0.3 ? 0.5 : 0.8) * px, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pen.d > 0.3) {
        // The tubercles, in rows from crown to rim like a globe's meridians.
        const dots = new Path2D();
        for (let m = 0; m < 10; m++) {
          const lon = -1.35 + (2.7 * m) / 9;
          for (let k = 1; k < 7; k++) {
            const lat = -1.3 + (2.6 * k) / 7;
            const x = Math.sin(lon) * Math.cos(lat) * R * 0.92;
            const y = cy + Math.sin(lat) * R * 0.92;
            const dr = 0.35 * px * (0.6 + 0.4 * Math.cos(lon) * Math.cos(lat));
            dots.moveTo(x + dr, y);
            dots.arc(x, y, dr, 0, Math.PI * 2);
          }
        }
        ctx.fill(dots);
      }
    });
    ctx.fillStyle = ink.body;
  },

  // Plate coral: shelves stacked up a short stalk, each ringed with its
  // growth, the underside of each in shadow.
  plate(ctx, H, ink, r, px, pen) {
    const n = int(r, 2, 3);
    const shelves = Array.from({ length: n }, (_, k) => {
      const rx = H * range(r, 0.45, 0.62) * (1 - 0.15 * k);
      return { x: (k % 2 ? -1 : 1) * range(r, 0.05, 0.2) * H, y: -H * (0.25 + 0.28 * k), rx, ry: rx * 0.2 };
    });
    const stalk: number[] = [0, 0];
    for (const s of shelves) stalk.push(s.x * 0.3, s.y);
    outline(ctx, stalk, false, ink, pen, 1.1, [0, 0.2]);
    // Top shelf first, so the lower ones lie over its stalk.
    for (let k = n - 1; k >= 0; k--) {
      const s = shelves[k];
      const lip = H * 0.045;
      const under: number[] = [];
      arcPts(under, s.x, s.y + lip, s.rx, s.ry, 0, Math.PI * 2, 36);
      const underPath = pathOf(under);
      const ubox = boxOf(under);
      ctx.fillStyle = ink.deep;
      ctx.fill(underPath);
      if (pen.d > 0.4 && !pen.dark) {
        hatch(ctx, underPath, ubox, {
          spacing: 1.7 * px,
          angle: 1.3,
          shade: () => 0.8,
          from: 0.5,
          color: ink.ink,
          width: 0.4 * px,
          alpha: 0.5,
          seed: pen.seed + k,
        });
      }
      outline(ctx, under, true, ink, pen, 0.8);
      const topPts: number[] = [];
      arcPts(topPts, s.x, s.y, s.rx, s.ry, 0, Math.PI * 2, 36);
      const top = pathOf(topPts);
      wash(ctx, top, boxOf(topPts), ink.body, pen);
      ctx.save();
      ctx.clip(top);
      ctx.beginPath();
      const rings = pen.d > 0.3 ? [0.3, 0.5, 0.66, 0.8, 0.91] : [0.35, 0.6, 0.82];
      for (const f of rings) {
        ctx.moveTo(s.x * 0.3 + s.rx * f + (s.x - s.x * 0.3) * f, s.y);
        ctx.ellipse(s.x * 0.3 + (s.x - s.x * 0.3) * f, s.y, s.rx * f, s.ry * f, 0, 0, Math.PI * 2);
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = (pen.d > 0.3 ? 0.45 : 0.6) * px;
      faint(ctx, pen.dark ? 0.25 : 0.4, () => ctx.stroke());
      if (pen.d > 0.4) {
        // Fine radial ridges from the centre to the rim.
        ctx.beginPath();
        const cx0 = s.x * 0.3 + (s.x - s.x * 0.3) * 0.15;
        for (let a = 0.1; a < Math.PI * 2; a += 0.28 + 0.1 * Math.sin(a * 5)) {
          ctx.moveTo(cx0 + Math.cos(a) * s.rx * 0.18, s.y + Math.sin(a) * s.ry * 0.18);
          ctx.lineTo(s.x + Math.cos(a) * s.rx * 0.97, s.y + Math.sin(a) * s.ry * 0.97);
        }
        ctx.lineWidth = 0.3 * px;
        faint(ctx, pen.dark ? 0.15 : 0.25, () => ctx.stroke());
      }
      ctx.restore();
      outline(ctx, topPts, true, ink, pen, 0.85);
    }
    ctx.fillStyle = ink.body;
  },

  // Black coral: a few long whips, waving gently, each a pen line that
  // tapers to its tip over a thin wash, set with polyps when drawn big.
  whip(ctx, H, ink, r, px, pen) {
    const n = int(r, 2, 4);
    const p = new Path2D();
    const whips: number[][] = [];
    for (let i = 0; i < n; i++) {
      const lean = range(r, -0.35, 0.35);
      const len = H * range(r, 0.75, 1.05);
      const amp = H * range(r, 0.03, 0.07);
      const freq = range(r, 1.5, 2.5);
      const ph = range(r, 0, Math.PI * 2);
      const bx = range(r, -0.08, 0.08) * H;
      const pts: number[] = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const wave = Math.sin(t * freq * Math.PI * 2 + ph) * amp * t;
        const x = bx + Math.sin(lean) * len * t + Math.cos(lean) * wave;
        const y = -Math.cos(lean) * len * t + Math.sin(lean) * wave;
        if (k === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
        pts.push(x, y);
      }
      whips.push(pts);
    }
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = 2.2 * px;
    faint(ctx, 0.6, () => ctx.stroke(p));
    for (const pts of whips) outline(ctx, pts, false, ink, pen, 1, [0, 0.45]);
    if (pen.d > 0.3) {
      const polyps = new Path2D();
      for (const pts of whips) {
        for (let k = 3; k < 23; k += 2) {
          const x = pts[k * 2];
          const y = pts[k * 2 + 1];
          const tx = pts[k * 2 + 2] - pts[k * 2 - 2];
          const ty = pts[k * 2 + 3] - pts[k * 2 - 1];
          const tl = Math.hypot(tx, ty) || 1;
          const side = k % 4 === 1 ? 1 : -1;
          const ex = x - (ty / tl) * side * 1.6 * px;
          const ey = y + (tx / tl) * side * 1.6 * px;
          polyps.moveTo(x, y);
          polyps.lineTo(ex, ey);
          polyps.moveTo(ex + 0.45 * px, ey);
          polyps.arc(ex, ey, 0.45 * px, 0, Math.PI * 2);
        }
      }
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.6, () => ctx.stroke(polyps));
    }
    ctx.beginPath();
    ctx.ellipse(0, -1 * px, H * 0.07, 2 * px, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink.body;
    ctx.fill();
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
  },

  // Glass sponge: a tall pale vase of crossed lattice, barely there.
  glass(ctx, H, ink, r, px, pen) {
    const b = H * 0.06;
    const tw = H * range(r, 0.17, 0.22);
    const lean = range(r, -0.05, 0.05) * H;
    const vase = new Path2D();
    vase.moveTo(-b, 0);
    vase.bezierCurveTo(-H * 0.2, -H * 0.35, -tw * 0.6 + lean, -H * 0.75, -tw + lean, -H);
    vase.ellipse(lean, -H, tw, tw * 0.25, 0, Math.PI, 0);
    vase.bezierCurveTo(tw * 0.6 + lean, -H * 0.75, H * 0.2, -H * 0.35, b, 0);
    vase.closePath();
    const pts: number[] = [-b, 0];
    cubicPts(pts, [-b, 0, -H * 0.2, -H * 0.35, -tw * 0.6 + lean, -H * 0.75, -tw + lean, -H], 14);
    arcPts(pts, lean, -H, tw, tw * 0.25, Math.PI, Math.PI * 2, 14);
    cubicPts(pts, [tw + lean, -H, tw * 0.6 + lean, -H * 0.75, H * 0.2, -H * 0.35, b, 0], 14);
    faint(ctx, 0.3, () => ctx.fill(vase));
    ctx.save();
    ctx.clip(vase);
    ctx.beginPath();
    const step = Math.max((pen.d > 0.3 ? 2.2 : 3) * px, H * (pen.d > 0.3 ? 0.045 : 0.07));
    for (let c = -1.3 * H; c <= 0.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c + H, -H);
    }
    for (let c = -0.3 * H; c <= 1.3 * H; c += step) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c - H, -H);
    }
    if (pen.d > 0.3) {
      // And the horizontal rings of the lattice, the way a Venus's flower basket is woven.
      for (let y = -step; y > -H; y -= step * 1.4) {
        ctx.moveTo(-H, y);
        ctx.lineTo(H, y);
      }
    }
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = (pen.d > 0.3 ? 0.35 : 0.5) * px;
    faint(ctx, 0.4, () => ctx.stroke());
    ctx.restore();
    faint(ctx, 0.85, () => outline(ctx, pts, true, ink, pen, 0.8));
    ctx.beginPath();
    ctx.ellipse(lean, -H, tw * 0.85, tw * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink.hollow;
    faint(ctx, 0.45, () => ctx.fill());
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.7 * px;
    faint(ctx, 0.8, () => ctx.stroke());
    ctx.fillStyle = ink.body;
  },

  // Sea pen: a feather on a short stalk; in the dark a few of its polyps glow.
  seapen(ctx, H, ink, r, px, pen) {
    const lean = range(r, -0.15, 0.15) * H;
    const sy = -0.22 * H;
    const at = (t: number): [number, number] => {
      const u = 1 - t;
      return [2 * u * t * lean * 0.2 + t * t * lean, u * u * sy + 2 * u * t * (sy - 0.4 * H) + t * t * -H];
    };
    const m = int(r, 9, 13);
    const tips: [number, number][] = [];
    const leaves = new Path2D();
    const veins = new Path2D();
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
        veins.moveTo(x, y);
        veins.quadraticCurveTo(x + side * pl * 0.42, y - pl * 0.3, ex, ey);
        tips.push([ex, ey]);
      }
    }
    ctx.fillStyle = ink.body;
    ctx.fill(leaves);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 0.55 * px;
    ctx.stroke(leaves);
    if (pen.d > 0.3) {
      ctx.lineWidth = 0.35 * px;
      faint(ctx, 0.45, () => ctx.stroke(veins));
      // The polyps along each leaf's edge: a row of tiny dots.
      const dots = new Path2D();
      for (const [ex, ey] of tips) {
        for (let k = 0; k < 3; k++) {
          const x = ex - (ex - (tips[0][0] + ex) / 2) * 0.12 * k;
          const y = ey + 0.9 * px * k;
          dots.moveTo(x + 0.35 * px, y);
          dots.arc(x, y, 0.35 * px, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = ink.ink;
      faint(ctx, 0.5, () => ctx.fill(dots));
      ctx.fillStyle = ink.body;
    }
    ctx.beginPath();
    ctx.ellipse(0, sy * 0.4, H * 0.035, -sy * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.8 * px;
    ctx.stroke();
    const rachis: number[] = [0, 0, 0, sy];
    for (let k = 1; k <= 16; k++) rachis.push(...at(k / 16));
    outline(ctx, rachis, false, ink, pen, 1.2, [0, 0.4]);
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

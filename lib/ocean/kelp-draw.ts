/**
 * The kelp forest, inked (see `kelp.ts`).
 *
 * Drawn as a natural-history plate draws a seaweed: the stalks in one pen
 * line that swells on its shadow side and runs out to a point, each blade a
 * watercolour wash pooled darker at its edge, with a vein down the middle
 * and, drawn big, a ruffled margin, a little stipple on the side away from
 * the light, and the half that faces it lifted toward gold, the sun coming
 * through the frond. The ledge the forest stands on is a pen-lined crest
 * over a wash that runs dry below it, hatched in its shadow when there is
 * the size for it.
 *
 * It is drawn every frame, so everything slow is kept for when the drawing
 * is big (`detailFor`, which a live screen never reaches and a wallpaper
 * always does): live it costs a few paths a stalk, as it always did.
 */

import { mixHex } from '../fan';
import { surfaceAt } from './draw';
import { KELP_ROCK, kelpDescent, kelpInView, type Kelp, type KelpLedge, type KelpStalk } from './kelp';
import { kelpInk, type KelpInk, type Water } from './palette';
import { inkRock } from './outcrop-sprite';
import { detailFor, grain, inkLine, LIGHT, stipple } from './pen';

/** The one ink everything in the deep is lined in, on light water and on dark. */
const INK_LIGHT = '#2A2320';
const INK_DARK = '#E8E0CF';
/** The light from the top left, and the other way for light ink on dark
    water, which marks where the light falls rather than where it doesn't. */
const UNLIGHT: [number, number] = [-LIGHT[0], -LIGHT[1]];

/** A share of the page, 0 to 1 on each axis. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pen {
  /** The line colour. */
  line: string;
  dark: boolean;
  /** How much drawing the size carries, 0 to 1 (`detailFor`). */
  d: number;
  /** The light as the pen should take it: reversed on dark water. */
  light: [number, number];
}

/**
 * The kelp forest at the edges of the sunlit water (see `kelp.ts`): the
 * ledges, then the stalks standing on them, the ones further back first.
 * Each stalk sways on the slow clock, the sway travelling up it and growing
 * toward the top, and leans with the current; each blade flutters a little
 * on its own. `detail` is the governor's say: without it the blades lose
 * their ruffle and vein and the rock its shading.
 */
export function drawKelp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kelp: Kelp,
  focusSeconds: number,
  water: Water,
  ambient: number,
  current: number,
  px: number,
  clear: Rect[] | undefined,
  detail: boolean,
) {
  if (!kelpInView(focusSeconds)) return;
  const down = kelpDescent(focusSeconds);
  const surface = surfaceAt(focusSeconds) * h;
  const ink = kelpInk(water.dark);
  // A blade is about sixty CSS px long: that is the size the detail is judged at.
  const pen: Pen = {
    line: water.dark ? INK_DARK : INK_LIGHT,
    dark: water.dark,
    d: detail ? detailFor(60 * px) : 0,
    light: water.dark ? UNLIGHT : LIGHT,
  };
  // The light goes, and the colour with it.
  const fade = 0.45 + 0.55 * water.light;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ledge of kelp.ledges) drawLedge(ctx, w, h, ledge, down, water, px, 0.92 * fade, detail, pen);
  for (const stalk of kelp.stalks) {
    const alpha = (stalk.layer === 1 ? 0.92 : 0.45) * fade;
    drawStalk(ctx, w, h, stalk, down, surface, ink, ambient, current, px, alpha, clear, detail, pen);
  }
  ctx.restore();
}

/** A quadratic's points, appended to `out` (not its start). */
function quadPts(out: number[], x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
  }
}

/** A cubic's points, appended to `out` (not its start). */
function cubicPts(out: number[], p: number[], n: number) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push(a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]);
  }
}

function drawLedge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ledge: KelpLedge,
  down: number,
  water: Water,
  px: number,
  alpha: number,
  detail: boolean,
  pen: Pen,
) {
  const top = (ledge.top - down) * h;
  const thick = KELP_ROCK * h;
  if (top > h * 1.05 || top + thick < 0) return;
  // Inward from its own edge of the page.
  const s = ledge.edge < 0 ? 1 : -1;
  const x0 = ledge.edge < 0 ? -0.03 * w : 1.03 * w;
  const span = (ledge.reach + 0.03) * w;
  const X = (f: number) => x0 + s * span * f;
  const rock = water.dark ? mixHex(water.bottom, '#000000', 0.28) : mixHex(water.bottom, '#6B6459', 0.42);
  // Boulders along the top: a run of low humps, then the lip rolling over.
  const n = ledge.bumps.length;
  const topAt = (i: number) => top - (0.5 + 0.5 * ledge.bumps[i]) * 7 * px;
  const crest = new Path2D();
  const pts: number[] = [X(0), topAt(0)];
  crest.moveTo(X(0), topAt(0));
  for (let i = 0; i < n - 1; i++) {
    const fa = (i / (n - 1)) * 0.88;
    const fb = ((i + 1) / (n - 1)) * 0.88;
    const cy = Math.min(topAt(i), topAt(i + 1)) - 5 * px;
    crest.quadraticCurveTo(X((fa + fb) / 2), cy, X(fb), topAt(i + 1));
    quadPts(pts, X(fa), topAt(i), X((fa + fb) / 2), cy, X(fb), topAt(i + 1), 8);
  }
  const lip = [X(0.88), topAt(n - 1), X(0.97), top, X(1.01), top + thick * 0.12, X(0.97), top + thick * 0.3];
  crest.bezierCurveTo(lip[2], lip[3], lip[4], lip[5], lip[6], lip[7]);
  cubicPts(pts, lip, 12);
  // On down the lip a little way, where the pen lifts and the wash runs on.
  const under = [X(0.97), top + thick * 0.3, X(0.95), top + thick * 0.55, X(0.9), top + thick * 0.8, X(0.86), top + thick];
  cubicPts(pts, [...under.slice(0, 6), X(0.93), top + thick * 0.62], 6);
  // The rock under it is a wash that bleeds away into the water, the way a
  // brush runs dry: no underside, so the reef has no bottom to draw.
  const body = new Path2D(crest);
  body.bezierCurveTo(under[2], under[3], under[4], under[5], under[6], under[7]);
  body.lineTo(X(0), top + thick);
  body.closePath();
  const g = ctx.createLinearGradient(0, top, 0, top + thick);
  g.addColorStop(0, rock);
  g.addColorStop(0.35, rock);
  g.addColorStop(1, `${rock}00`);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.restore();
  // The crest and its contours always; the rest when the drawing is big
  // enough to carry it, which a live screen never is.
  const left = Math.min(X(0), X(1.02));
  inkRock(ctx, {
    crest: pts,
    body,
    box: { x: Math.max(0, left), y: Math.max(0, top - 12 * px), w: Math.min(w, left + span * 1.04) - Math.max(0, left), h: Math.min(h, top + thick) - Math.max(0, top - 12 * px) },
    v: (_x, y) => Math.max(0, Math.min(1, (y - top) / (thick * 0.7))),
    lip: (x) => Math.max(0, 1 - Math.abs(x - X(0.95)) / (0.12 * span)),
    away: s > 0 ? 1 : -0.6,
    dir: s > 0 ? 1 : -1,
    fade: (y) => Math.max(0, Math.min(1, 1.2 - (y - top) / thick)),
    line: pen.line,
    rock,
    dark: pen.dark,
    alpha,
    px,
    d: detail ? pen.d : 0,
    seed: Math.floor((ledge.bumps[0] + 2) * 1e6) ^ (ledge.edge > 0 ? 0x5a5a : 0),
  });
  // Stipple near the top, where there is still rock to see.
  ctx.save();
  ctx.fillStyle = pen.line;
  ctx.beginPath();
  for (const d of ledge.specks) {
    const depth = 0.04 + d.y * 0.4;
    const x = X(d.x * 0.88);
    const y = top + thick * depth;
    ctx.moveTo(x + d.r * px * 0.8, y);
    ctx.arc(x, y, d.r * px * 0.8, 0, Math.PI * 2);
  }
  ctx.globalAlpha = alpha * 0.3;
  ctx.fill();
  ctx.restore();
}

function drawStalk(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stalk: KelpStalk,
  down: number,
  surface: number,
  ink: KelpInk,
  ambient: number,
  current: number,
  px: number,
  alpha: number,
  clear: Rect[] | undefined,
  detail: boolean,
  pen: Pen,
) {
  // Only the part of the stalk that is on the page.
  const t0 = Math.max(0, (stalk.base - down - 1.06) / stalk.height);
  const t1 = Math.min(1, (stalk.base - down + 0.06) / stalk.height);
  if (t0 >= t1) return;
  const at = (t: number) => {
    const d = t * stalk.height;
    const give = Math.min(1, d / 1.1);
    const sway =
      (Math.sin(ambient * 0.42 + stalk.phase - d * 2.4) * 0.026 +
        Math.sin(ambient * 0.9 + stalk.phase * 1.7 - d * 5) * 0.008) *
      h *
      give;
    const x = stalk.x * w + sway + current * 0.05 * w * give * give;
    const y = (stalk.base - d - down) * h;
    // Longer than the water is deep: the rest lies along the surface as
    // canopy, going the way the current does.
    if (y >= surface) return { x, y };
    return { x: x + current * (surface - y), y: surface + 2 * px + Math.sin(ambient * 1.3 + d * 9) * 1.5 * px };
  };
  const near = stalk.layer === 1;
  const scale = near ? 1 : 0.75;
  const big = pen.d > 0.4;
  // Toward the light, for which side of a stalk is lit.
  const lxs = -LIGHT[0];
  const lys = -LIGHT[1];

  const inClear = (x: number, y: number) => {
    if (!clear) return false;
    const u = x / w;
    const v = y / h;
    return clear.some((r) => u > r.x && u < r.x + r.w && v > r.y && v < r.y + r.h);
  };

  // The stalk: a wash under one pen line, thickest at the holdfast and
  // running out to a point at the tip. Like the blades, it goes faint where
  // it crosses what is written: each run of it is its own line.
  const steps = Math.max(2, Math.ceil((t1 - t0) * stalk.height * 40));
  const runs: { pts: number[]; faint: boolean; from: number; to: number }[] = [];
  let prev = at(t0);
  let run: { pts: number[]; faint: boolean; from: number; to: number } | null = null;
  for (let i = 1; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const p = at(t);
    const inside = inClear((p.x + prev.x) / 2, (p.y + prev.y) / 2);
    if (!run || run.faint !== inside) {
      run = { pts: [prev.x, prev.y], faint: inside, from: t - (t1 - t0) / steps, to: t };
      runs.push(run);
    }
    run.pts.push(p.x, p.y);
    run.to = t;
    prev = p;
  }
  // Stipe width, CSS px: stout at the foot, thin at the growing tip.
  const stipe = (t: number) => (near ? 2.4 : 1.6) * (1 - 0.55 * t);
  for (const rn of runs) {
    const a = rn.faint ? alpha * 0.3 : alpha;
    if (big) {
      // Big, the stipe is a washed cylinder: two pen edges, the one away
      // from the light the heavier.
      const m = rn.pts.length / 2;
      const left: number[] = [];
      const right: number[] = [];
      const rib = new Path2D();
      for (let i = 0; i < m; i++) {
        const a0 = Math.max(0, i - 1);
        const a1 = Math.min(m - 1, i + 1);
        let tx = rn.pts[a1 * 2] - rn.pts[a0 * 2];
        let ty = rn.pts[a1 * 2 + 1] - rn.pts[a0 * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const t = rn.from + ((rn.to - rn.from) * i) / Math.max(1, m - 1);
        const hw = stipe(t) * 0.5 * px * scale * 1.15;
        // The normal that points toward the light's side of the page.
        const sx = ty * lxs < -tx * lys ? -1 : 1;
        left.push(rn.pts[i * 2] - ty * hw * sx, rn.pts[i * 2 + 1] + tx * hw * sx);
        right.push(rn.pts[i * 2] + ty * hw * sx, rn.pts[i * 2 + 1] - tx * hw * sx);
      }
      rib.moveTo(left[0], left[1]);
      for (let i = 2; i < left.length; i += 2) rib.lineTo(left[i], left[i + 1]);
      for (let i = right.length - 2; i >= 0; i -= 2) rib.lineTo(right[i], right[i + 1]);
      rib.closePath();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = ink.body;
      ctx.fill(rib);
      const seed = Math.floor(stalk.phase * 1000);
      const tip: [number, number] = [0, rn.to >= 1 - 1e-6 ? 0.2 : 0];
      inkLine(ctx, left, false, { width: 0.45 * px, color: pen.line, alpha: a * 0.8, swell: 0.3, taper: tip, lost: 0.4, seed, raw: true, min: 0.2 * px });
      inkLine(ctx, right, false, { width: 0.95 * px, color: pen.line, alpha: a * 0.9, swell: 0.3, taper: tip, lost: 0, seed: seed + 1, raw: true, min: 0.2 * px });
      continue;
    }
    const path = new Path2D();
    path.moveTo(rn.pts[0], rn.pts[1]);
    for (let i = 2; i < rn.pts.length; i += 2) path.lineTo(rn.pts[i], rn.pts[i + 1]);
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = ink.body;
    ctx.lineWidth = 3 * px * scale;
    ctx.stroke(path);
    // The pen: the whole stalk's taper, so a run cut by the clock keeps its weight.
    const tm = (rn.from + rn.to) / 2;
    inkLine(ctx, rn.pts, false, {
      width: stipe(tm) * 0.55 * px * (big ? 1.1 : 1),
      color: pen.line,
      alpha: a * (near ? 0.9 : 0.75),
      swell: 0.75,
      taper: [0, rn.to >= 1 - 1e-6 ? 0.25 : 0],
      lost: big ? 0.3 : 0,
      seed: Math.floor(stalk.phase * 1000),
      raw: true,
      light: pen.light,
      min: 0.3 * px,
    });
  }

  // The holdfast, when the foot of the stalk is on the page: roots gripping
  // the top of the ledge.
  if (t0 === 0) {
    const foot = at(0);
    if (big) {
      stalk.roots.forEach((a, k) => {
        const dx = Math.sin(a) * 13 * px * scale;
        const root: number[] = [foot.x, foot.y - 2 * px];
        quadPts(root, foot.x, foot.y - 2 * px, foot.x + dx * 0.4, foot.y + 1 * px, foot.x + dx, foot.y + (3 + Math.abs(a) * 3) * px, 6);
        inkLine(ctx, root, false, { width: 1.3 * px * scale, color: pen.line, alpha, taper: [0, 0.7], seed: k + 11, light: pen.light });
      });
    } else {
      ctx.beginPath();
      for (const a of stalk.roots) {
        const dx = Math.sin(a) * 13 * px * scale;
        ctx.moveTo(foot.x, foot.y - 2 * px);
        ctx.quadraticCurveTo(foot.x + dx * 0.4, foot.y + 1 * px, foot.x + dx, foot.y + (3 + Math.abs(a) * 3) * px);
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = pen.line;
      ctx.lineWidth = 1 * px * scale;
      ctx.stroke();
    }
  }

  // The blades, each off a little float, in two batches: plain, and faint
  // where they cross what is written on the page. A blade is a long ribbon,
  // curled along its length, crinkled down its fuller edge when there is the
  // time to draw it. The half of each blade that faces the light is lifted
  // toward gold, the sun coming through it; the other half is the shadow.
  const plain = new Path2D();
  const faint = new Path2D();
  const litPlain = new Path2D();
  const litFaint = new Path2D();
  const shadow = new Path2D();
  const veins = new Path2D();
  const pleats = new Path2D();
  const floats = new Path2D();
  const outlines: number[][] = [];
  let sx0 = Infinity;
  let sy0 = Infinity;
  let sx1 = -Infinity;
  let sy1 = -Infinity;
  const SEG = big ? 24 : detail ? 8 : 4;
  const edgeA: [number, number][] = [];
  const edgeB: [number, number][] = [];
  const mid: [number, number][] = [];
  const [lx, ly] = LIGHT;
  for (let j = 0; j < stalk.blades.length; j++) {
    const b = stalk.blades[j];
    if (b.t < t0 || b.t > t1) continue;
    const p = at(b.t);
    if (p.y < -60 * px || p.y > h + 60 * px) continue;
    const q = at(Math.min(1, b.t + 0.01));
    const up = Math.atan2(q.y - p.y, q.x - p.x);
    const flutter = Math.sin(ambient * 1.1 + stalk.phase + j * 1.3) * 0.1;
    const a = up + b.side * b.angle + current * 0.15 + flutter;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Across the blade, toward its fuller side.
    const nx = -dy * b.side;
    const ny = dx * b.side;
    const len = b.len * px * scale;
    const wid = b.width * px * scale;
    const fx = p.x + dx * 3 * px * scale;
    const fy = p.y + dy * 3 * px * scale;
    const rx = 2.2 * px * scale;
    floats.moveTo(fx + dx * rx, fy + dy * rx);
    floats.ellipse(fx, fy, rx, 1.6 * px * scale, a, 0, Math.PI * 2);
    const bx = p.x + dx * 5 * px * scale;
    const by = p.y + dy * 5 * px * scale;
    const curl = (b.curl + Math.sin(ambient * 0.7 + j) * 0.05) * len;
    edgeA.length = 0;
    edgeB.length = 0;
    mid.length = 0;
    for (let k = 0; k <= SEG; k++) {
      const u = k / SEG;
      const cx = bx + dx * len * u + nx * curl * u * u;
      const cy = by + dy * len * u + ny * curl * u * u;
      // Widest a third of the way along, tapering long to the tip.
      const body = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8) * wid;
      let crinkle = 0;
      if (big && k > 0 && k < SEG) {
        // A ruffled margin: a quick frill riding a slower one, as a frond's edge does.
        crinkle = (0.14 * Math.sin(k * 1.7 + j) + 0.05 * Math.sin(k * 4.4 + j * 1.7)) * body;
      } else if (detail && k > 0 && k < SEG) crinkle = (k % 2 ? 0.3 : -0.12) * body;
      edgeA.push([cx + nx * (body * 1.15 + crinkle), cy + ny * (body * 1.15 + crinkle)]);
      edgeB.push([cx - nx * body * 0.85, cy - ny * body * 0.85]);
      mid.push([cx + nx * body * 0.12, cy + ny * body * 0.12]);
    }
    const isFaint = inClear(p.x, p.y);
    const path = isFaint ? faint : plain;
    const lit = isFaint ? litFaint : litPlain;
    // Which half faces the light: the fuller edge, or the other.
    const aLit = nx * -lx + ny * -ly > 0;
    const traceEdge = (target: Path2D, edge: [number, number][], back: boolean) => {
      if (!back) {
        for (let k = 1; k <= SEG; k++) {
          const [ax, ay] = edge[k - 1];
          const [cx, cy] = edge[k];
          target.quadraticCurveTo(ax, ay, (ax + cx) / 2, (ay + cy) / 2);
        }
        target.lineTo(edge[SEG][0], edge[SEG][1]);
      } else {
        for (let k = SEG - 1; k >= 0; k--) {
          const [ax, ay] = edge[k + 1];
          const [cx, cy] = edge[k];
          target.quadraticCurveTo(ax, ay, (ax + cx) / 2, (ay + cy) / 2);
        }
      }
    };
    path.moveTo(bx, by);
    traceEdge(path, edgeA, false);
    traceEdge(path, edgeB, true);
    path.closePath();
    // The lit half: from the base up the lit edge and back down the vein.
    if (detail || big) {
      lit.moveTo(bx, by);
      traceEdge(lit, aLit ? edgeA : edgeB, false);
      for (let k = SEG; k >= 0; k--) lit.lineTo(mid[k][0], mid[k][1]);
      lit.closePath();
      veins.moveTo(bx, by);
      for (let k = 1; k < SEG; k++) veins.lineTo(mid[k][0], mid[k][1]);
    }
    if (big && !isFaint) {
      shadow.moveTo(bx, by);
      traceEdge(shadow, aLit ? edgeB : edgeA, false);
      for (let k = SEG; k >= 0; k--) shadow.lineTo(mid[k][0], mid[k][1]);
      shadow.closePath();
      for (const [x, y] of aLit ? edgeB : edgeA) {
        sx0 = Math.min(sx0, x);
        sy0 = Math.min(sy0, y);
        sx1 = Math.max(sx1, x);
        sy1 = Math.max(sy1, y);
      }
      // The blade's surface is wrinkled lengthwise: a few faint lines
      // either side of the vein, following it, each starting and stopping
      // somewhere of its own.
      for (const [edge, f, k0, k1] of [
        [edgeA, 0.5, 2 + (j % 3), SEG - 5],
        [edgeA, 0.78, 4, SEG - 4 - (j % 4)],
        [edgeB, 0.55, 3 + (j % 2), SEG - 6],
      ] as const) {
        pleats.moveTo(mid[k0][0] + (edge[k0][0] - mid[k0][0]) * f, mid[k0][1] + (edge[k0][1] - mid[k0][1]) * f);
        for (let k = k0 + 1; k <= k1; k++) {
          const g = f * (1 + 0.08 * Math.sin(k * 1.9 + j));
          pleats.lineTo(mid[k][0] + (edge[k][0] - mid[k][0]) * g, mid[k][1] + (edge[k][1] - mid[k][1]) * g);
        }
      }
      // The outline for the pen: round the blade from its base.
      const o: number[] = [bx, by];
      for (const [x, y] of edgeA) o.push(x, y);
      for (let k = SEG - 1; k >= 1; k--) o.push(edgeB[k][0], edgeB[k][1]);
      outlines.push(o);
    }
  }
  const glow = mixHex(ink.body, pen.dark ? '#F2DE9C' : '#F6E3A2', pen.dark ? 0.3 : 0.45);
  const pool = mixHex(ink.body, pen.dark ? '#000000' : '#3A3018', 0.3);
  for (const [path, lit, k] of [[plain, litPlain, 1], [faint, litFaint, 0.3]] as const) {
    ctx.fillStyle = ink.body;
    ctx.globalAlpha = alpha * 0.85 * k;
    ctx.fill(path);
    if (detail || big) {
      // The sun through the frond, on the half that faces it.
      ctx.fillStyle = glow;
      ctx.globalAlpha = alpha * 0.55 * k;
      ctx.fill(lit);
      // The pigment pooled at the margin as the wash dried.
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = pool;
      ctx.globalAlpha = alpha * 0.4 * k;
      ctx.lineWidth = 2.2 * px * scale;
      ctx.stroke(path);
      ctx.restore();
    }
  }
  // Only what is on the page: a canopy can run far off the side of it.
  sx0 = Math.max(0, sx0);
  sy0 = Math.max(0, sy0);
  sx1 = Math.min(w, sx1);
  sy1 = Math.min(h, sy1);
  if (big && sx1 > sx0 && sy1 > sy0) {
    const box = { x: sx0, y: sy0, w: sx1 - sx0, h: sy1 - sy0 };
    const gr = grain(ctx);
    if (gr) {
      ctx.save();
      ctx.clip(plain);
      gr.setTransform?.(new DOMMatrix([px, 0, 0, px, 0, 0]));
      ctx.globalAlpha = alpha * 0.3;
      ctx.fillStyle = gr;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.restore();
    }
    stipple(ctx, shadow, box, {
      spacing: 1.9 * px,
      radius: 0.36 * px,
      shade: () => 0.62,
      color: pen.dark ? mixHex(ink.body, '#000000', 0.5) : pen.line,
      alpha: alpha * (pen.dark ? 0.7 : 0.5),
      seed: Math.floor(stalk.phase * 997),
    });
  }
  if (detail || big) {
    ctx.strokeStyle = pen.dark ? mixHex(ink.body, '#FFF4D6', 0.45) : mixHex(ink.body, pen.line, 0.55);
    ctx.lineWidth = (big ? 0.6 : 0.5) * px * scale;
    ctx.globalAlpha = alpha * 0.7;
    ctx.stroke(veins);
  }
  if (big) {
    ctx.strokeStyle = pen.dark ? mixHex(ink.body, '#FFF4D6', 0.3) : mixHex(ink.body, pen.line, 0.45);
    ctx.lineWidth = 0.45 * px;
    ctx.globalAlpha = alpha * 0.45;
    ctx.stroke(pleats);
    outlines.forEach((o, k) =>
      inkLine(ctx, o, true, {
        width: 0.75 * px * scale,
        color: pen.line,
        alpha: alpha * 0.9,
        swell: 0.85,
        lost: 0.4,
        seed: k + 3,
        light: pen.light,
        min: 0.25 * px,
      }),
    );
    ctx.strokeStyle = pen.line;
    ctx.lineWidth = 0.6 * px * scale;
    ctx.globalAlpha = alpha * 0.3;
    ctx.stroke(faint);
  } else {
    ctx.lineWidth = 0.8 * px * scale;
    ctx.strokeStyle = pen.line;
    ctx.globalAlpha = alpha * 0.85;
    ctx.stroke(plain);
    ctx.globalAlpha = alpha * 0.3;
    ctx.stroke(faint);
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ink.float;
  ctx.fill(floats);
  ctx.strokeStyle = pen.line;
  ctx.lineWidth = 0.55 * px * scale;
  ctx.globalAlpha = alpha * 0.7;
  ctx.stroke(floats);
}

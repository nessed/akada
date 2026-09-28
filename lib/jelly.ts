/**
 * The study jellyfish.
 *
 * The other thing the timer can draw, chosen in Settings in place of the fan.
 * A bell grows first, then the tentacles hang out of it and lengthen the
 * longer the reader sits. In a block the longest tentacle touches the frame's
 * floor exactly at the target, which is the same promise the fan makes about
 * the top edge: the drawing reaching the edge is the block done.
 *
 * It shares the fan's rules. It only ever grows, it never runs backwards, and
 * the shape is fixed by its seed, so a restored session hangs the same
 * tentacles it hung before. It is drawn as a moon jelly on an old
 * natural-history plate would be: a bell shaded with engraved hatching and a
 * lick of white, branching canals, the four horseshoes, a fringe of fine
 * hairs at the rim, tapering tentacles strung with stinging cells, and frilled
 * arms that twist as they hang. Never a cartoon.
 *
 * It is alive in a way the fan is not. Given the time, the bell beats, the
 * tentacles carry a slow wave down their length, and a few ink bubbles rise
 * off the bell; on the night paper a little marine snow drifts up the screen.
 *
 * Nothing here touches the DOM; the drawing half takes a 2D context the
 * caller owns. `StudyFan` drives it when its `species` is `jelly`.
 */

import { mixHex, rng } from './fan';

export interface JellyShape {
  /** One per tentacle: its share of the full length, its own wave, and
      whether it is strung with stinging cells. */
  tentacles: { v: number; ph: number; amp: number; sting: boolean }[];
  /** The short fine hairs between the tentacles, as a share of the length. */
  hairs: { v: number; ph: number }[];
  /** The four frilled arms under the bell, each with its own twist. */
  arms: { ph: number; off: number; splay: number; twist: number }[];
  /** Specks of marine snow for the night paper: where each starts, as a
      share of the canvas, how big, how bright, and how fast it rises. */
  snow: { x: number; y: number; s: number; o: number; v: number }[];
}

const TENTACLES = 16;
const ARMS = 4;
const SNOW = 36;

/** Build the jelly's fixed half from its seed. Cheap, and done once. */
export function buildJelly(seed: number): JellyShape {
  const r = rng(seed * 13 + 5);
  const raw = Array.from({ length: TENTACLES }, () => ({
    v: 0.84 + 0.16 * r(),
    ph: r() * Math.PI * 2,
    amp: 4 + r() * 5,
    sting: r() < 0.4,
  }));
  // The longest tentacle is exactly the full length, so the one that touches
  // the floor does so at the target and not a little before or after it.
  const longest = Math.max(...raw.map((t) => t.v));
  const tentacles = raw.map((t) => ({ ...t, v: t.v / longest }));
  const hairs = Array.from({ length: TENTACLES - 1 }, () => ({ v: 0.22 + 0.2 * r(), ph: r() * Math.PI * 2 }));
  const arms = Array.from({ length: ARMS }, (_, i) => ({
    ph: r() * Math.PI * 2,
    off: (i - (ARMS - 1) / 2) * 0.09,
    splay: (i - (ARMS - 1) / 2) * 0.1,
    twist: 22 + r() * 12,
  }));
  const snow = Array.from({ length: SNOW }, () => ({
    x: r(),
    y: r(),
    s: 1 + r() * 1.8,
    o: 0.15 + r() * 0.35,
    v: 0.6 + r() * 0.8,
  }));
  return { tentacles, hairs, arms, snow };
}

/** The inks a jelly is drawn in, mixed once from the course colour. */
export interface JellyInk {
  /** The bell's wash, pale at the crown and deeper at the rim. */
  bellTop: string;
  bellRim: string;
  edge: string;
  rib: string;
  gonad: string;
  tentacle: string;
  sting: string;
  arm: string;
  bloom: string;
  eye: string;
  /** The lick of white on the crown. */
  sheen: string;
  /** Set on the night paper only: the light the bell, the rim and the lit
      tips give off. */
  glow?: string;
  lamp?: string;
  /** Marine snow, night paper only. */
  snow?: string;
}

/**
 * The inks for one course colour on one paper. On the night paper the lines
 * lift toward white and the jelly gives off light; in daylight the lines go
 * toward ink and the bell is the colour washed into the page.
 */
export function jellyInk(color: string, paper: string, light: boolean): JellyInk {
  if (light) {
    return {
      bellTop: mixHex(color, paper, 0.62),
      bellRim: mixHex(color, paper, 0.3),
      edge: mixHex(color, '#FFFFFF', 0.35),
      rib: mixHex(color, '#FFFFFF', 0.25),
      gonad: mixHex(color, '#FFFFFF', 0.45),
      tentacle: mixHex(color, '#FFFFFF', 0.2),
      sting: mixHex(color, '#FFFFFF', 0.6),
      arm: mixHex(color, paper, 0.18),
      bloom: mixHex(color, '#FFFFFF', 0.7),
      eye: mixHex(color, '#FFFFFF', 0.85),
      sheen: mixHex(color, '#FFFFFF', 0.7),
      glow: color,
      lamp: mixHex(color, '#FFFFFF', 0.55),
      snow: '#C8C0B0',
    };
  }
  return {
    bellTop: mixHex(color, paper, 0.8),
    bellRim: mixHex(color, paper, 0.42),
    edge: mixHex(color, '#1A1714', 0.45),
    rib: mixHex(color, '#1A1714', 0.3),
    gonad: mixHex(color, '#1A1714', 0.18),
    tentacle: mixHex(color, '#1A1714', 0.28),
    sting: mixHex(color, '#1A1714', 0.4),
    arm: mixHex(color, paper, 0.3),
    bloom: mixHex(color, paper, 0.15),
    eye: mixHex(color, '#1A1714', 0.5),
    sheen: '#FFFFFF',
  };
}

export interface JellyDrawOptions {
  /** 0 to 1. At 1 the longest tentacle touches the floor. */
  progress: number;
  ink: JellyInk;
  /** Headroom above the bell, in device pixels. */
  padTop?: number;
  /** How much of the frame's width the bell's size is judged against. */
  widthFill?: number;
  /** Where the floor sits, measured up from the bottom edge. */
  baseOffset?: number;
  /** Device pixels to a CSS pixel. */
  px?: number;
  /** How far the bell has closed, 0 open to 1 held. What a paused jelly
      does: the bell narrows and deepens and the trails draw in under it. */
  contract?: number;
  /** Where the bell is in its beat, 0 at rest to 1 fully squeezed. */
  pulse?: number;
  /** Milliseconds, for the things that move on their own: the wave down the
      tentacles, the bubbles, the snow. Leave it out and they stand still. */
  time?: number;
  /** The pull, sampled from the bell (index 0) out to the tips of the
      tentacles, each a few frames behind the one before. In radians, as
      the fan's bends are; the bell moves by the first and the trails lag
      behind it by the rest. */
  drift?: number[];
  /** Length multiplier on the trails, a tenth either side at most. */
  stretch?: number;
  /** The pencil underdrawing of the whole jelly, in this ink. */
  sketch?: string;
  /** A drawn floor line, in this ink. */
  ground?: string;
  /** A few ink bubbles rising off the bell while it swims. */
  bubbles?: boolean;
}

interface Pose {
  r: number;
  rw: number;
  bh: number;
  rimY: number;
  L: number;
  k: number;
  grow: number;
  /** The beat, less whatever the fold has taken out of it. */
  sq: number;
}

/* Scratch for one strip's outline, reused across strips and frames: a
   frame draws a few thousand points and fresh arrays for each would be the
   kind of litter that shows up as a stutter on a phone. */
let stripX = new Float64Array(0);
let stripY = new Float64Array(0);
let stripW = new Float64Array(0);

function room(n: number) {
  if (stripX.length < n) {
    stripX = new Float64Array(n * 2);
    stripY = new Float64Array(n * 2);
    stripW = new Float64Array(n * 2);
  }
}

/**
 * Trace a strip of width `stripW[i]` along the centreline in the scratch
 * arrays as one closed outline, into whatever path is open. `frill` pushes
 * one edge out further, which is what ruffles an arm.
 */
function traceStrip(ctx: CanvasRenderingContext2D, n: number, frill?: (i: number) => number) {
  if (n < 2) return;
  const side = (i: number, sign: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let nx = -(stripY[b] - stripY[a]);
    let ny = stripX[b] - stripX[a];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const hw = stripW[i] / 2 + (sign > 0 && frill ? frill(i) : 0);
    return [stripX[i] + nx * hw * sign, stripY[i] + ny * hw * sign] as const;
  };
  const [sx, sy] = side(0, 1);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < n; i++) {
    const [x, y] = side(i, 1);
    ctx.lineTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) {
    const [x, y] = side(i, -1);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Paint the jelly into a canvas context sized `width` x `height` in device
 * pixels. The frame is measured off the resting shape, so a pulse or a pull
 * never rescales it and "touched the floor" keeps meaning done.
 */
export function drawJelly(
  ctx: CanvasRenderingContext2D,
  shape: JellyShape,
  width: number,
  height: number,
  opts: JellyDrawOptions,
): void {
  const {
    progress,
    ink,
    padTop = 45,
    widthFill = 0.86,
    baseOffset = -2,
    px = 1,
    contract = 0,
    pulse = 0,
    time,
    drift,
    stretch = 0,
    sketch,
    ground,
    bubbles = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);

  const p = Math.min(1, Math.max(0, progress));
  const k = Math.min(1, Math.max(0, contract));
  const tm = time ?? 0;
  const floor = height - baseOffset;
  const avail = floor - padTop;
  if (avail <= 0 || width <= 0) return;

  const R = Math.min(width * widthFill * 0.2, avail * 0.2);
  // Wave sizes and line weights are set for a bell about 76 CSS px across
  // the radius, the block frame's, and follow the bell from there.
  const line = Math.min(2.2, Math.max(0.6, R / (76 * px))) * px;
  const cx = width / 2;
  const y0 = padTop;
  const rimFull = y0 + R * 0.8;
  const maxL = floor - rimFull;
  const ease = (t: number) => 1 - (1 - t) * (1 - t);

  const pull = (t: number) => {
    if (!drift || drift.length === 0) return 0;
    const at = Math.min(drift.length - 1, Math.max(0, t) * (drift.length - 1));
    const lo = Math.floor(at);
    const hi = Math.min(drift.length - 1, lo + 1);
    return drift[lo] + (drift[hi] - drift[lo]) * (at - lo);
  };
  // The bell goes where the hand takes it; everything below trails behind.
  const bellShift = pull(0) * R * 0.6;
  const lag = (st: number) => (pull(st / Math.max(1, maxL)) - pull(0)) * R * 0.6;

  const pose = (pp: number, kk: number, beat: number): Pose => {
    const grow = Math.min(1, pp / 0.4);
    const r = R * (0.42 + 0.58 * ease(grow));
    const sq = beat * (1 - kk);
    const rw = r * (1 - 0.22 * kk) * (1 - 0.06 * sq);
    const bh = r * 0.8 * (1 + 0.2 * kk) * (1 + 0.04 * sq);
    return { r, rw, bh, rimY: y0 + bh, L: maxL * pp * (1 - 0.08 * kk), k: kk, grow, sq };
  };

  const now = pose(p, k, pulse);
  const bx = cx + bellShift;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /* Marine snow, the night paper only: specks drifting slowly up the whole
     screen behind everything else. */
  if (ink.snow) {
    ctx.fillStyle = ink.snow;
    for (const s of shape.snow) {
      const travel = (s.y - (tm / 1000) * 0.012 * s.v) % 1;
      const y = (travel < 0 ? travel + 1 : travel) * height;
      const x = s.x * width + Math.sin(tm / 4000 + s.x * 20) * 4 * px;
      // Fade in off the floor and out toward the top.
      const edge = Math.min(1, (y / height) * 6, ((height - y) / height) * 6);
      ctx.globalAlpha = s.o * edge;
      ctx.beginPath();
      ctx.arc(x, y, s.s * px * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* The glow, under the jelly: the night paper only. */
  if (ink.glow) {
    const gy = y0 + now.bh * 0.55;
    const reach = now.r * 2.3;
    const g = ctx.createRadialGradient(bx, gy, 0, bx, gy, reach);
    g.addColorStop(0, withAlpha(ink.glow, 0.2));
    g.addColorStop(0.5, withAlpha(ink.glow, 0.07));
    g.addColorStop(1, withAlpha(ink.glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(bx - reach, gy - reach, reach * 2, reach * 2);
  }

  /* The floor: one pencil line, not quite level, and a few grains of sand. */
  if (ground) {
    const gl = floor + px;
    ctx.save();
    ctx.strokeStyle = ground;
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath();
    ctx.moveTo(width * 0.14, gl + 1.5 * px);
    ctx.bezierCurveTo(width * 0.3, gl - px, width * 0.42, gl + 2 * px, cx, gl);
    ctx.bezierCurveTo(width * 0.58, gl - 2 * px, width * 0.74, gl + 2.5 * px, width * 0.86, gl);
    ctx.stroke();
    ctx.fillStyle = ground;
    [-0.3, -0.18, 0.12, 0.26].forEach((dx, i) => {
      ctx.beginPath();
      ctx.arc(cx + dx * width, gl - (3 + (i % 2) * 2) * px, 0.9 * px, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  /* The tentacles, as centrelines. `live` bends them with the wave and the
     pull and tapers them; the sketch wants neither. */
  const tentacleLine = (q: Pose, i: number, live: boolean, len: number) => {
    const t = shape.tentacles[i];
    const u = (i + 0.5) / shape.tentacles.length;
    const ox = live ? bx : cx;
    const x0 = ox + (u * 2 - 1) * q.rw * 0.94;
    const yy = q.rimY + 0.5 * px;
    const reach = q.L * t.v * len;
    if (reach < 2 * px) return 0;
    const splay = ((x0 - ox) / Math.max(1, q.rw)) * 0.16 * (1 - 0.7 * q.k);
    const step = 4 * px;
    const n = Math.floor(reach / step) + 1;
    room(n);
    for (let j = 0; j < n; j++) {
      const st = j * step;
      const ramp = Math.pow(Math.min(1, st / (60 * line)), 0.8);
      // The wave travels down the tentacle, not across it.
      const wave = t.amp * line * Math.sin(st / (38 * line) - (live ? tm / 900 : 0) + t.ph) * ramp;
      stripX[j] =
        x0 +
        splay * st +
        wave -
        (x0 - ox) * 0.3 * q.k * (st / reach) +
        (live ? lag(st) - (x0 - ox) * 0.04 * q.sq * ramp : 0);
      stripY[j] = yy + st;
      stripW[j] = Math.max(0.35 * px, 1.9 * line * (1 - 0.85 * (st / Math.max(1, maxL))));
    }
    return n;
  };

  /* The underdrawing: the whole jelly at full length and open, dotted in
     pencil for the ink to fill. It beats with the bell, or the ink would
     slide off its own pencil on every pulse. Gone once the block is done. */
  if (sketch && p < 1) {
    const full = pose(1, 0, pulse * (1 - k));
    ctx.save();
    ctx.strokeStyle = sketch;
    ctx.lineWidth = 0.9 * px;
    ctx.setLineDash([1.5 * px, 3.5 * px]);
    ctx.beginPath();
    for (let i = 0; i < shape.tentacles.length; i++) {
      const n = tentacleLine(full, i, false, 1);
      if (n < 2) continue;
      ctx.moveTo(stripX[0], stripY[0]);
      for (let j = 1; j < n; j++) ctx.lineTo(stripX[j], stripY[j]);
    }
    ctx.stroke();
    ctx.beginPath();
    bellPath(ctx, full, cx, y0, R, line);
    ctx.stroke();
    ctx.restore();
  }

  /* The fine hairs at the rim, short and quick, under the tentacles. */
  if (now.grow > 0.05) {
    ctx.fillStyle = ink.tentacle;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    shape.hairs.forEach((h, i) => {
      const u = (i + 1) / shape.tentacles.length;
      const x0 = bx + (u * 2 - 1) * now.rw * 0.94;
      const reach = Math.min(now.L, maxL) * h.v * now.grow * (1 + stretch);
      if (reach < 3 * px) return;
      const step = 4 * px;
      const n = Math.floor(reach / step) + 1;
      room(n);
      for (let j = 0; j < n; j++) {
        const st = j * step;
        stripX[j] = x0 + 3 * line * Math.sin(st / (18 * line) - tm / 700 + h.ph) * (st / reach) + lag(st);
        stripY[j] = now.rimY + 0.5 * px + st;
        stripW[j] = Math.max(0.3 * px, 0.9 * line * (1 - st / reach));
      }
      traceStrip(ctx, n);
    });
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* The tentacles, tapering from the rim to hairline tips, and the stinging
     cells strung along a few of them. */
  const tips: { x: number; y: number; i: number }[] = [];
  const stings: number[] = [];
  ctx.fillStyle = ink.tentacle;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  for (let i = 0; i < shape.tentacles.length; i++) {
    const n = tentacleLine(now, i, true, 1 + stretch);
    if (n < 2) continue;
    traceStrip(ctx, n);
    tips.push({ x: stripX[n - 1], y: stripY[n - 1], i });
    if (shape.tentacles[i].sting) {
      for (let j = 6; j < n; j += 6) {
        stings.push(stripX[j] + (j % 12 ? 1 : -1) * stripW[j] * 0.9, stripY[j]);
      }
    }
  }
  ctx.fill();
  if (stings.length) {
    ctx.fillStyle = ink.sting;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let j = 0; j < stings.length; j += 2) {
      ctx.moveTo(stings[j] + 0.9 * line, stings[j + 1]);
      ctx.arc(stings[j], stings[j + 1], 0.9 * line, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* The oral arms: four ribbons that pinch and swell as they twist, one
     edge ruffled, a darker rib down the middle, tapering to a point. */
  const armLen = (now.L * 0.5 + now.r * 0.35 * now.grow) * (1 + stretch);
  if (armLen > 4 * px) {
    const step = 3 * px;
    const n = Math.floor(armLen / step) + 1;
    const ribs: number[][] = [];
    ctx.fillStyle = ink.arm;
    ctx.strokeStyle = ink.edge;
    ctx.lineWidth = 0.8 * px;
    for (const a of shape.arms) {
      const sx = bx + a.off * now.r;
      const sy = now.rimY - 2 * px;
      room(n);
      const rib: number[] = [];
      for (let j = 0; j < n; j++) {
        const st = j * step;
        const tt = st / armLen;
        stripX[j] =
          sx +
          a.splay * st * (1 - 0.5 * k) +
          8 * line * Math.sin(st / (30 * line) - tm / 1300 + a.ph) * Math.min(1, st / (40 * line)) +
          lag(st);
        stripY[j] = sy + st;
        const turn = 0.35 + 0.65 * Math.abs(Math.cos(st / (a.twist * line) + a.ph));
        stripW[j] = now.r * 0.16 * Math.pow(1 - tt, 0.9) * turn + 0.4 * px;
        if (j % 2 === 0) rib.push(stripX[j], stripY[j]);
      }
      ribs.push(rib);
      ctx.beginPath();
      traceStrip(ctx, n, (j) => 1.6 * line * (1 - (j * step) / armLen) * (0.5 + 0.5 * Math.sin(j * 1.9 + a.ph)));
      ctx.globalAlpha = 0.86;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
    ctx.strokeStyle = ink.rib;
    ctx.lineWidth = 0.7 * px;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (const rib of ribs) {
      if (rib.length < 4) continue;
      ctx.moveTo(rib[0], rib[1]);
      for (let j = 2; j < rib.length; j += 2) ctx.lineTo(rib[j], rib[j + 1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* A finished block lights every other tip, the jelly's flowers; on the
     night paper they glow. */
  if (p >= 1 && k < 0.5) {
    const bead = 3.2 * line;
    const lit = tips.filter((t) => t.i % 2 === 0);
    if (ink.lamp) {
      ctx.save();
      ctx.fillStyle = ink.lamp;
      ctx.shadowColor = ink.lamp;
      ctx.shadowBlur = 10 * line;
      ctx.globalAlpha = 0.6;
      for (const t of lit) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, bead * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = ink.bloom;
    ctx.strokeStyle = ink.edge;
    ctx.lineWidth = 0.8 * px;
    for (const t of lit) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, bead, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = ink.eye;
    ctx.beginPath();
    for (const t of lit) {
      ctx.moveTo(t.x + bead * 0.34, t.y);
      ctx.arc(t.x, t.y, bead * 0.34, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /* The bell over the tops of the trails. */
  const dome = (a: number, sc: number) =>
    [bx + Math.cos(a) * now.rw * sc, now.rimY - Math.pow(Math.sin(a), 0.85) * now.bh * sc] as const;

  const wash = ctx.createLinearGradient(0, y0, 0, now.rimY);
  wash.addColorStop(0, ink.bellTop);
  wash.addColorStop(1, ink.bellRim);
  ctx.beginPath();
  bellPath(ctx, now, bx, y0, R, line);
  ctx.fillStyle = wash;
  ctx.globalAlpha = 0.95;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Engraved shading down the right of the dome, the side away from the
  // light, in concentric strokes that follow its curve.
  ctx.strokeStyle = ink.rib;
  ctx.lineWidth = 0.6 * px;
  ctx.globalAlpha = 0.38;
  ctx.beginPath();
  for (let j = 0; j < 9; j++) {
    const sc = 0.5 + j * 0.055;
    for (let a = 0.18, first = true; a <= 0.95; a += 0.07, first = false) {
      const [x, y] = dome(a, sc);
      if (first) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // The inner curve of the bell.
  ctx.lineWidth = 0.9 * px;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(bx - now.rw * 0.88, now.rimY - px);
  ctx.bezierCurveTo(
    bx - now.rw * 0.8,
    y0 + now.bh * 0.4,
    bx + now.rw * 0.8,
    y0 + now.bh * 0.4,
    bx + now.rw * 0.88,
    now.rimY - px,
  );
  ctx.stroke();

  // Eight canals from the crown, each forking on its way to the rim.
  ctx.lineWidth = 0.7 * px;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  for (let j = 0; j < 8; j++) {
    const xj = bx + now.rw * 0.84 * ((j / 7) * 2 - 1);
    const mx = bx + (xj - bx) * 0.62;
    const my = y0 + now.bh * 0.46;
    ctx.moveTo(bx + (xj - bx) * 0.06, y0 + now.bh * 0.2);
    ctx.quadraticCurveTo(bx + (xj - bx) * 0.4, y0 + now.bh * 0.28, mx, my);
    for (const side of [-1, 1]) {
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(xj + side * 3 * line, now.rimY - now.bh * 0.25, xj + side * 5 * line, now.rimY - px);
    }
  }
  ctx.stroke();

  // The velum: a fringe of short strokes just inside the rim.
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let j = 1; j < 24; j++) {
    const x = bx - now.rw * 0.86 + (j / 24) * now.rw * 1.72;
    ctx.moveTo(x, now.rimY - 1.5 * line);
    ctx.lineTo(x, now.rimY - 4 * line);
  }
  ctx.stroke();

  // The four horseshoes of a moon jelly, set in a ring like a clover, each
  // a soft wash under an open ring whose gap turns to the middle.
  const gy = y0 + now.bh * 0.55;
  const rg = now.r * 0.1;
  const rings = [0.25, 0.75, 1.25, 1.75].map((q) => {
    const th = q * Math.PI;
    const gx0 = bx + Math.cos(th) * now.rw * 0.3;
    const gy0 = gy + Math.sin(th) * now.bh * 0.19;
    return { gx0, gy0, open: Math.atan2(gy - gy0, bx - gx0) };
  });
  ctx.fillStyle = ink.bellTop;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (const g of rings) {
    ctx.moveTo(g.gx0 + rg, g.gy0);
    ctx.ellipse(g.gx0, g.gy0, rg, rg * 0.72, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.strokeStyle = ink.gonad;
  ctx.lineWidth = 1.4 * line;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (const g of rings) {
    const from = g.open + 0.6;
    const to = g.open + Math.PI * 2 - 0.6;
    ctx.moveTo(g.gx0 + Math.cos(from) * rg, g.gy0 + Math.sin(from) * rg * 0.72);
    for (let a = from + 0.2; a <= to; a += 0.2) {
      ctx.lineTo(g.gx0 + Math.cos(a) * rg, g.gy0 + Math.sin(a) * rg * 0.72);
    }
  }
  ctx.stroke();

  // A lick of white on the crown, where the light catches it.
  ctx.strokeStyle = ink.sheen;
  ctx.lineWidth = 2.2 * line;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  for (let a = 2.35, first = true; a >= 1.85; a -= 0.05, first = false) {
    const [x, y] = dome(a, 0.9);
    if (first) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // The outline, and a fainter second pass just off it, the way a pen
  // drawing goes over its own line.
  ctx.strokeStyle = ink.edge;
  ctx.lineWidth = 1.5 * line;
  ctx.beginPath();
  bellPath(ctx, now, bx, y0, R, line);
  ctx.stroke();
  ctx.save();
  ctx.translate(0.9 * line, 0.7 * line);
  ctx.lineWidth = 0.6 * px;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  bellPath(ctx, now, bx, y0, R, line);
  ctx.stroke();
  ctx.restore();

  // Eight sense organs round the rim; on the night paper they glow.
  const rim: number[] = [];
  for (let j = 0; j < 8; j++) rim.push(bx - now.rw * 0.94 + (j / 7) * now.rw * 1.88, now.rimY + 1.2 * line);
  if (ink.lamp) {
    ctx.save();
    ctx.fillStyle = ink.lamp;
    ctx.shadowColor = ink.lamp;
    ctx.shadowBlur = 6 * line;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let j = 0; j < rim.length; j += 2) {
      ctx.moveTo(rim[j] + 2.4 * line, rim[j + 1]);
      ctx.arc(rim[j], rim[j + 1], 2.4 * line, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = ink.eye;
  ctx.beginPath();
  for (let j = 0; j < rim.length; j += 2) {
    ctx.moveTo(rim[j] + 1.1 * line, rim[j + 1]);
    ctx.arc(rim[j], rim[j + 1], 1.1 * line, 0, Math.PI * 2);
  }
  ctx.fill();

  /* A few ink bubbles rising off the crown while it swims. Four of them,
     each on its own seven-second climb, fading in and out. */
  if (bubbles && time != null && k < 0.5) {
    ctx.strokeStyle = ink.lamp ?? ink.edge;
    ctx.lineWidth = 0.9 * px;
    for (let b = 0; b < 4; b++) {
      const phase = ((tm / 7000 + b * 0.27) % 1 + 1) % 1;
      const size = [2.5, 1.5, 2, 1][b] * line;
      const x = bx + [-8, 12, -20, 4][b] * line + Math.sin(phase * 6 + b) * 3 * line;
      const y = y0 - 6 * line - phase * 150 * px;
      if (y < size) continue;
      ctx.globalAlpha = (1 - k * 2) * Math.min(1, phase * 6) * (1 - phase) * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * The bell's outline into whatever path is open: a dome that flares a
 * little at the rim on the squeeze, and a rim of sixteen shallow scallops.
 */
function bellPath(ctx: CanvasRenderingContext2D, q: Pose, bx: number, y0: number, R: number, line: number) {
  const L = bx - q.rw;
  const Rr = bx + q.rw;
  const flare = q.rw * 0.05 * q.sq;
  ctx.moveTo(L - flare, q.rimY);
  ctx.bezierCurveTo(L, y0 + q.bh * 0.1, bx - q.rw * 0.58, y0, bx, y0);
  ctx.bezierCurveTo(bx + q.rw * 0.58, y0, Rr, y0 + q.bh * 0.1, Rr + flare, q.rimY);
  const n = 16;
  const step = (2 * (q.rw + flare)) / n;
  const dip = 2.6 * line * (q.r / R);
  for (let i = 1; i <= n; i++) {
    const xa = Rr + flare - (i - 1) * step;
    const xb = Rr + flare - i * step;
    ctx.quadraticCurveTo((xa + xb) / 2, q.rimY + dip, xb, q.rimY);
  }
  ctx.closePath();
}

/**
 * Where a bell is in its beat at a given moment: 0 at rest, 1 fully
 * squeezed. The squeeze is quick and the release slow, which is how a jelly
 * swims, on the same 4.2 second cycle the held clock breathes on.
 */
export function jellyBeat(ms: number): number {
  const phase = (ms % 4200) / 4200;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return phase < 0.42 ? smooth(phase / 0.42) : 1 - smooth((phase - 0.42) / 0.58);
}

/** `#rrggbb` to an rgba() string at `alpha`, for the glow's gradient. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(168, 184, 155, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

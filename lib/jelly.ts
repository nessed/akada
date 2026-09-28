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
 * tentacles it hung before. The bell, the four rings in it and the scalloped
 * rim are a moon jelly's, drawn in ink the way an old natural-history plate
 * would, not a cartoon.
 *
 * Nothing here touches the DOM; the drawing half takes a 2D context the
 * caller owns. `StudyFan` drives it when its `species` is `jelly`.
 */

import { mixHex, rng } from './fan';

export interface JellyShape {
  /** One per tentacle: its share of the full length, and its own wave. */
  tentacles: { v: number; ph: number; amp: number }[];
  /** The four frilled arms under the bell. */
  arms: { ph: number; off: number; splay: number }[];
}

const TENTACLES = 16;
const ARMS = 4;

/** Build the jelly's fixed half from its seed. Cheap, and done once. */
export function buildJelly(seed: number): JellyShape {
  const r = rng(seed * 13 + 5);
  const raw = Array.from({ length: TENTACLES }, () => ({
    v: 0.84 + 0.16 * r(),
    ph: r() * Math.PI * 2,
    amp: 4 + r() * 5,
  }));
  // The longest tentacle is exactly the full length, so the one that touches
  // the floor does so at the target and not a little before or after it.
  const longest = Math.max(...raw.map((t) => t.v));
  const tentacles = raw.map((t) => ({ ...t, v: t.v / longest }));
  const arms = Array.from({ length: ARMS }, (_, i) => ({
    ph: r() * Math.PI * 2,
    off: (i - (ARMS - 1) / 2) * 0.09,
    splay: (i - (ARMS - 1) / 2) * 0.1,
  }));
  return { tentacles, arms };
}

/** The inks a jelly is drawn in, mixed once from the course colour. */
export interface JellyInk {
  bell: string;
  edge: string;
  rib: string;
  gonad: string;
  tentacle: string;
  arm: string;
  bloom: string;
  eye: string;
  /** Set on the night paper only: the faint light the bell gives off. */
  glow?: string;
}

/**
 * The inks for one course colour on one paper. On the night paper the lines
 * lift toward white and the bell gives off a little light; in daylight the
 * lines go toward ink and the bell is the colour washed into the page.
 */
export function jellyInk(color: string, paper: string, light: boolean): JellyInk {
  if (light) {
    return {
      bell: mixHex(color, paper, 0.42),
      edge: mixHex(color, '#FFFFFF', 0.3),
      rib: mixHex(color, '#FFFFFF', 0.18),
      gonad: mixHex(color, paper, 0.15),
      tentacle: mixHex(color, '#FFFFFF', 0.12),
      arm: mixHex(color, paper, 0.28),
      bloom: mixHex(color, '#FFFFFF', 0.55),
      eye: paper,
      glow: color,
    };
  }
  return {
    bell: mixHex(color, paper, 0.58),
    edge: mixHex(color, '#000000', 0.34),
    rib: mixHex(color, '#000000', 0.22),
    gonad: mixHex(color, paper, 0.2),
    tentacle: mixHex(color, '#000000', 0.16),
    arm: mixHex(color, paper, 0.32),
    bloom: mixHex(color, paper, 0.2),
    eye: mixHex(color, '#000000', 0.45),
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
}

interface Pose {
  r: number;
  rw: number;
  bh: number;
  rimY: number;
  L: number;
  k: number;
  grow: number;
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
    drift,
    stretch = 0,
    sketch,
    ground,
  } = opts;

  ctx.clearRect(0, 0, width, height);

  const p = Math.min(1, Math.max(0, progress));
  const k = Math.min(1, Math.max(0, contract));
  const floor = height - baseOffset;
  const avail = floor - padTop;
  if (avail <= 0 || width <= 0) return;

  const R = Math.min(width * widthFill * 0.2, avail * 0.2);
  // Wave sizes and line weights are set for a bell about 76 CSS px across
  // the radius, the block frame's, and follow the bell from there.
  const scale = Math.min(2.2, Math.max(0.6, R / (76 * px)));
  const line = scale * px;
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
  const trail = (t: number) => (pull(t) - pull(0)) * R * 0.6 + bellShift;

  const pose = (pp: number, kk: number, beat: number): Pose => {
    const grow = Math.min(1, pp / 0.4);
    const r = R * (0.42 + 0.58 * ease(grow));
    const squeeze = beat * (1 - kk);
    const rw = r * (1 - 0.22 * kk) * (1 - 0.05 * squeeze);
    const bh = r * 0.8 * (1 + 0.2 * kk) * (1 + 0.035 * squeeze);
    return { r, rw, bh, rimY: y0 + bh, L: maxL * pp * (1 - 0.08 * kk), k: kk, grow };
  };

  const tentaclePaths = (q: Pose, shift: boolean, len: number) => {
    const tips: { x: number; y: number; i: number }[] = [];
    const bx = cx + (shift ? bellShift : 0);
    ctx.beginPath();
    shape.tentacles.forEach((t, i) => {
      const u = (i + 0.5) / shape.tentacles.length;
      const x0 = bx + (u * 2 - 1) * q.rw * 0.94;
      const yy = q.rimY + 0.5 * px;
      const reach = q.L * t.v * len;
      if (reach < 2 * px) return;
      const splay = ((x0 - bx) / Math.max(1, q.rw)) * 0.16 * (1 - 0.7 * q.k);
      const step = 5 * px;
      let x = x0;
      let y = yy;
      ctx.moveTo(x0, yy);
      for (let st = step; st <= reach; st += step) {
        const tt = st / reach;
        const drag = shift ? trail(st / Math.max(1, maxL)) - bellShift : 0;
        x =
          x0 +
          splay * st +
          t.amp * line * Math.sin(st / (38 * line) + t.ph) * Math.pow(Math.min(1, st / (60 * line)), 0.8) -
          (x0 - bx) * 0.3 * q.k * tt +
          drag;
        y = yy + st;
        ctx.lineTo(x, y);
      }
      tips.push({ x, y, i });
    });
    return tips;
  };

  const bellPath = (q: Pose, shift: boolean) => {
    const bx = cx + (shift ? bellShift : 0);
    const L = bx - q.rw;
    const Rr = bx + q.rw;
    ctx.beginPath();
    ctx.moveTo(L, q.rimY);
    ctx.bezierCurveTo(L, y0 + q.bh * 0.12, bx - q.rw * 0.56, y0, bx, y0);
    ctx.bezierCurveTo(bx + q.rw * 0.56, y0, Rr, y0 + q.bh * 0.12, Rr, q.rimY);
    // The rim is scalloped, a dozen shallow lobes, which is most of what
    // makes it read as a bell rather than a dome.
    const n = 12;
    const step = (2 * q.rw) / n;
    const dip = 3.2 * line * (q.r / R);
    for (let i = 1; i <= n; i++) {
      const xa = Rr - (i - 1) * step;
      const xb = Rr - i * step;
      ctx.quadraticCurveTo((xa + xb) / 2, q.rimY + dip, xb, q.rimY);
    }
    ctx.closePath();
  };

  const now = pose(p, k, pulse);
  const bx = cx + bellShift;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /* The glow first, under everything: the night paper only. */
  if (ink.glow) {
    const gy = y0 + now.bh * 0.5;
    const g = ctx.createRadialGradient(bx, gy, 0, bx, gy, now.r * 2.2);
    g.addColorStop(0, withAlpha(ink.glow, 0.16));
    g.addColorStop(0.55, withAlpha(ink.glow, 0.06));
    g.addColorStop(1, withAlpha(ink.glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(bx - now.r * 2.2, gy - now.r * 2.2, now.r * 4.4, now.r * 4.4);
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

  /* The underdrawing: the whole jelly at full length and open, dotted in
     pencil for the ink to fill. It beats with the bell, or the ink would
     slide off its own pencil on every pulse. Gone once the block is done. */
  if (sketch && p < 1) {
    const full = pose(1, 0, pulse * (1 - k));
    ctx.save();
    ctx.strokeStyle = sketch;
    ctx.lineWidth = 0.9 * px;
    ctx.setLineDash([1.5 * px, 3.5 * px]);
    tentaclePaths(full, false, 1);
    ctx.stroke();
    bellPath(full, false);
    ctx.stroke();
    ctx.restore();
  }

  /* The trails. One path for all of them: at this width a stroke per
     tentacle costs sixteen times as much and looks the same. */
  ctx.strokeStyle = ink.tentacle;
  ctx.lineWidth = 1.15 * line;
  ctx.globalAlpha = 0.9;
  const tips = tentaclePaths(now, true, 1 + stretch);
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* The oral arms: four frilled ribbons, their width rippling along them. */
  ctx.fillStyle = ink.arm;
  ctx.strokeStyle = ink.edge;
  ctx.lineWidth = 0.8 * px;
  const armLen = (now.L * 0.5 + now.r * 0.35 * now.grow) * (1 + stretch);
  if (armLen > 4 * px) {
    for (const a of shape.arms) {
      const sx = bx + a.off * now.r;
      // Tucked just under the rim: any higher and the tops show through
      // the bell's wash as a pale block.
      const sy = now.rimY - 2 * px;
      const left: number[] = [];
      const right: number[] = [];
      const step = 4 * px;
      for (let st = 0; st <= armLen; st += step) {
        const tt = st / armLen;
        const x =
          sx +
          a.splay * st * (1 - 0.5 * k) +
          8 * line * Math.sin(st / (30 * line) + a.ph) * Math.min(1, st / (40 * line)) +
          trail(st / Math.max(1, maxL)) -
          bellShift;
        const w = now.r * 0.14 * (1 - 0.75 * tt) * (1 + 0.42 * Math.sin(st / (6 * line) + a.ph * 2)) + 0.6 * px;
        left.push(x - w / 2, sy + st);
        right.push(x + w / 2, sy + st);
      }
      if (left.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(left[0], left[1]);
      for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
      for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /* A finished block lights every other tip, the jelly's flowers. */
  if (p >= 1 && k < 0.5) {
    const bead = 3.2 * line;
    ctx.fillStyle = ink.bloom;
    ctx.strokeStyle = ink.edge;
    ctx.lineWidth = 0.8 * px;
    for (const t of tips) {
      if (t.i % 2) continue;
      ctx.beginPath();
      ctx.arc(t.x, t.y, bead, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = ink.eye;
    for (const t of tips) {
      if (t.i % 2) continue;
      ctx.beginPath();
      ctx.arc(t.x, t.y, bead * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* The bell over the tops of the trails: the wash, the inner curve, eight
     canals running out to the rim, the four rings, and then the outline. */
  bellPath(now, true);
  ctx.fillStyle = ink.bell;
  ctx.globalAlpha = 0.94;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = ink.rib;
  ctx.lineWidth = 0.9 * px;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(bx - now.rw * 0.86, now.rimY - px);
  ctx.bezierCurveTo(
    bx - now.rw * 0.78,
    y0 + now.bh * 0.42,
    bx + now.rw * 0.78,
    y0 + now.bh * 0.42,
    bx + now.rw * 0.86,
    now.rimY - px,
  );
  ctx.stroke();

  ctx.lineWidth = 0.75 * px;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let j = 0; j < 8; j++) {
    const xj = bx + now.rw * 0.9 * ((j / 7) * 2 - 1);
    ctx.moveTo(bx + (xj - bx) * 0.08, y0 + now.bh * 0.18);
    ctx.quadraticCurveTo(bx + (xj - bx) * 0.72, y0 + now.bh * 0.3, xj, now.rimY - px);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  const gy = y0 + now.bh * 0.54;
  const rg = now.r * 0.12;
  ctx.fillStyle = ink.gonad;
  ctx.lineWidth = 0.9 * px;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    ctx.beginPath();
    ctx.ellipse(bx + sx * now.rw * 0.2, gy + sy * now.bh * 0.12, rg, rg * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  bellPath(now, true);
  ctx.strokeStyle = ink.edge;
  ctx.lineWidth = 1.5 * line;
  ctx.stroke();
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

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
import { IRON_GALL } from './ocean/palette';
import { detailFor, inkLine, LIGHT } from './ocean/pen';

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
  /** Bell height against width, 1 for the plain jelly. */
  aspect: number;
  /** Lobes on the rim. */
  scallops: number;
  /** The oral arms' length against the plain jelly's, 1 for it. */
  armLength: number;
  /** How deep the rim's lobes are cut against the plain jelly's, 1 for it. */
  lobeDepth: number;
  /** A turn of the colour wheel, in degrees, laid over whatever ink it is drawn in. */
  hueShift: number;
}

/**
 * The counts and proportions a jelly is built to. The plain jellyfish is
 * always `PLAIN_BODY`; the ocean's jellies roll their own (lib/ocean/lineage),
 * so every sitting's jelly is a different animal.
 */
export interface JellyBody {
  tentacles: number;
  hairs: number;
  arms: number;
  aspect: number;
  scallops: number;
  stingP: number;
  /* The traits below are optional, so a lineage's genome is a body as it is:
     left out, each is the plain jelly's. A picture rolls them to make a
     family whose members are visibly different animals. */
  /** The oral arms' length against the plain jelly's: 0.5 short stubs to 2
      long trailing ribbons. Default 1. */
  armLength?: number;
  /** How deep the rim's lobes are cut against the plain jelly's: 0 a clean
      rim, 1 the plain jelly's shallow scallops, 3 or 4 a deeply lobed one.
      Default 1. */
  lobeDepth?: number;
  /** Degrees round the colour wheel the jelly's colours are turned, the
      pen's line and the plate's gonads excepted (a sibling tinted 25
      degrees off its parent, say). Default 0. */
  hueShift?: number;
}

export const PLAIN_BODY: JellyBody = { tentacles: 16, hairs: 15, arms: 4, aspect: 1, scallops: 16, stingP: 0.4 };
const SNOW = 36;

/** Build the jelly's fixed half from its seed. Cheap, and done once. */
export function buildJelly(seed: number, body: JellyBody = PLAIN_BODY): JellyShape {
  const r = rng(seed * 13 + 5);
  const TENTACLES = Math.max(1, Math.round(body.tentacles));
  const ARMS = Math.max(0, Math.round(body.arms));
  const raw = Array.from({ length: TENTACLES }, () => ({
    v: 0.84 + 0.16 * r(),
    ph: r() * Math.PI * 2,
    amp: 4 + r() * 5,
    roll: r(),
  }));
  // About a third of them strung with stinging cells, a few more on a jelly
  // bred to sting: the ones whose roll came lowest, so the dice are the same.
  const stung = Math.max(1, Math.round(TENTACLES * (0.24 + 0.22 * Math.max(0, Math.min(1, body.stingP)))));
  const cut = [...raw.map((t) => t.roll)].sort((a, b) => a - b)[Math.min(TENTACLES, stung) - 1];
  // The longest tentacle is exactly the full length, so the one that touches
  // the floor does so at the target and not a little before or after it.
  const longest = Math.max(...raw.map((t) => t.v));
  const tentacles = raw.map(({ roll, ...t }) => ({ ...t, v: t.v / longest, sting: roll <= cut }));
  const hairs = Array.from({ length: Math.max(0, Math.round(body.hairs)) }, () => ({ v: 0.22 + 0.2 * r(), ph: r() * Math.PI * 2 }));
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
  return {
    tentacles,
    hairs,
    arms,
    snow,
    aspect: body.aspect,
    scallops: Math.max(4, Math.round(body.scallops)),
    armLength: Math.max(0.2, Math.min(3, body.armLength ?? 1)),
    lobeDepth: Math.max(0, Math.min(5, body.lobeDepth ?? 1)),
    hueShift: body.hueShift ?? 0,
  };
}

/** The moon jelly's four gonads: a soft pink, mixed with the course colour. */
const GONAD = '#E8C9D4';
/** The plate's gonads, laid as they are whatever the jelly's colour. */
const PLATE_GONAD = '#D8B9C8';

/** The inks a jelly is drawn in, mixed once from the course colour. */
export interface JellyInk {
  /** The bell's wash, pale at the crown and deeper at the rim. */
  bellTop: string;
  bellRim: string;
  edge: string;
  rib: string;
  /** The gonads' wash, laid at about a third. */
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
  /** Drawn as a natural-history plate draws it (the deep's pen): a dome
      whose sides turn in to the rim, lit by a strip of bare paper rather
      than a gloss, the outline weighted into the shadow and broken twice in
      the light, the gonads soft washes with no line. Left out, it is the
      plain jellyfish drawing as it has always been. */
  plate?: boolean;
  /** The paper it is drawn on: the bare-paper strip is this. */
  paper?: string;
}

/**
 * The inks for one course colour on one paper. On the night paper the lines
 * lift toward white and the jelly gives off light; in daylight the lines go
 * toward ink and the bell is the colour washed into the page.
 */
/* `pen`: the deep's one iron-gall ink for the outline and ribs, so the jelly
   sits with everything else in that sea; the jellyfish drawing on its own
   keeps the edge it has always had, in its own colour. */
export function jellyInk(color: string, paper: string, light: boolean, pen = true): JellyInk {
  if (light) {
    return {
      bellTop: mixHex(color, paper, 0.62),
      bellRim: mixHex(color, paper, 0.3),
      // The pen's own off-white, with a breath of the jelly's colour in it.
      edge: pen ? mixHex(IRON_GALL.dark, color, 0.15) : mixHex(color, '#FFFFFF', 0.35),
      rib: pen ? mixHex(IRON_GALL.dark, color, 0.35) : mixHex(color, '#FFFFFF', 0.25),
      gonad: mixHex(GONAD, color, 0.4),
      tentacle: mixHex(color, '#FFFFFF', 0.2),
      sting: mixHex(color, '#FFFFFF', 0.6),
      arm: mixHex(color, paper, 0.18),
      bloom: mixHex(color, '#FFFFFF', 0.7),
      eye: mixHex(color, '#FFFFFF', 0.85),
      sheen: mixHex(color, '#FFFFFF', 0.7),
      glow: color,
      lamp: mixHex(color, '#FFFFFF', 0.55),
      snow: '#C8C0B0',
      plate: pen,
      paper,
    };
  }
  return {
    // On the plate a little more colour in the wash, so the strip of bare
    // paper left in it reads as the light.
    bellTop: mixHex(color, paper, pen ? 0.7 : 0.8),
    bellRim: mixHex(color, paper, pen ? 0.38 : 0.42),
    // The pen's iron-gall, with a breath of the jelly's colour in it.
    edge: pen ? mixHex(IRON_GALL.light, color, 0.15) : mixHex(color, '#1A1714', 0.45),
    rib: pen ? mixHex(IRON_GALL.light, color, 0.4) : mixHex(color, '#1A1714', 0.3),
    gonad: mixHex(GONAD, color, 0.4),
    tentacle: mixHex(color, '#1A1714', 0.28),
    sting: mixHex(color, '#1A1714', 0.4),
    arm: mixHex(color, paper, 0.3),
    bloom: mixHex(color, paper, 0.15),
    eye: mixHex(color, '#1A1714', 0.5),
    sheen: '#FFFFFF',
    plate: pen,
    paper,
  };
}

/**
 * Where the jelly sits in a frame of `width` x `height`, in whatever unit the
 * frame is measured in. The drawing and the hit-test read the same numbers,
 * so a hand lands on the bell where the bell is drawn.
 */
export function jellyFrame(
  width: number,
  height: number,
  o: { padTop?: number; widthFill?: number; baseOffset?: number; aspect?: number } = {},
) {
  const { padTop = 45, widthFill = 0.86, baseOffset = -2, aspect = 1 } = o;
  const floor = height - baseOffset;
  const avail = floor - padTop;
  const R = Math.min(width * widthFill * 0.2, avail * 0.2);
  const y0 = padTop;
  const rimFull = y0 + R * 0.8 * aspect;
  return { R, cx: width / 2, y0, floor, avail, rimFull, maxL: floor - rimFull };
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
  /** Where the bell has been taken sideways, in CSS pixels, sampled from
      now (index 0) back through the last few frames. The bell sits at the
      first and each trail hangs from the sample its own depth down, so a
      pull leaves the tentacles streaming behind it like a wake. */
  drift?: number[];
  /** How far the bell has been taken down (up is negative), in CSS pixels.
      The trails come with it at the top and stay where they were at the
      tips, so they bunch and stretch rather than the frame moving. */
  rise?: number;
  /** The bell's lean in radians, clockwise positive, about the middle of its
      rim. It leans into a pull and the trails stay behind. */
  tilt?: number;
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
    ink: inkIn,
    padTop = 45,
    widthFill = 0.86,
    baseOffset = -2,
    px = 1,
    contract = 0,
    pulse = 0,
    time,
    drift,
    rise = 0,
    tilt = 0,
    stretch = 0,
    sketch,
    ground,
    bubbles = false,
  } = opts;

  ctx.clearRect(0, 0, width, height);

  const ink = shape.hueShift ? turnedInk(inkIn, shape.hueShift) : inkIn;
  const plate = ink.plate === true;
  const lobe = shape.lobeDepth;
  const p = Math.min(1, Math.max(0, progress));
  const k = Math.min(1, Math.max(0, contract));
  const tm = time ?? 0;
  const { R, cx, y0, floor, avail, rimFull, maxL } = jellyFrame(width, height, {
    padTop,
    widthFill,
    baseOffset,
    aspect: shape.aspect,
  });
  if (avail <= 0 || width <= 0) return;

  // Wave sizes and line weights are set for a bell about 76 CSS px across
  // the radius, the block frame's, and follow the bell from there.
  const line = Math.min(2.2, Math.max(0.6, R / (76 * px))) * px;
  const ease = (t: number) => 1 - (1 - t) * (1 - t);

  const pull = (t: number) => {
    if (!drift || drift.length === 0) return 0;
    const at = Math.min(drift.length - 1, Math.max(0, t) * (drift.length - 1));
    const lo = Math.floor(at);
    const hi = Math.min(drift.length - 1, lo + 1);
    return drift[lo] + (drift[hi] - drift[lo]) * (at - lo);
  };
  // The bell goes where the hand takes it; everything below trails behind.
  // Left alone it is never still: it wanders a little way either side on two
  // slow slides that do not line up, and each depth of the trails reads the
  // slide from a moment earlier, so they drag behind the bell as it goes.
  const alive = time != null;
  const wander = (t: number) =>
    alive ? R * (0.07 * Math.sin(t / 3300) + 0.04 * Math.sin(t / 1700 + 1.3)) * (1 - k) : 0;
  const handShift = pull(0) * px;
  const bellShift = handShift + wander(tm);
  const lag = (st: number) =>
    (pull(st / Math.max(1, maxL)) - pull(0)) * px +
    wander(tm - 900 * Math.min(1, st / Math.max(1, maxL))) -
    wander(tm);
  // Lifted, the bell takes the tops of the trails with it and leaves their
  // tips, so the floor stays the floor and a full jelly still touches it.
  // Each squeeze is a stroke: the bell jets up with it and sinks back as it
  // lets go, and the trails, held at the tips, stretch and slacken behind.
  const handY = Math.max(rise * px, -padTop * 0.85);
  const riseY = Math.max(handY - (alive ? 0.11 * R * pulse * (1 - k) : 0), -padTop * 0.85);
  const hold = (st: number) => riseY * 0.85 * Math.min(1, st / (0.6 * maxL + 30 * px));

  const pose = (pp: number, kk: number, beat: number): Pose => {
    const grow = Math.min(1, pp / 0.4);
    const r = R * (0.42 + 0.58 * ease(grow));
    const sq = beat * (1 - kk);
    const rw = r * (1 - 0.22 * kk) * (1 - 0.06 * sq);
    const bh = r * 0.8 * shape.aspect * (1 + 0.2 * kk) * (1 + 0.04 * sq);
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
    const gy = y0 + now.bh * 0.55 + riseY;
    const reach = now.r * 2.3;
    const g = ctx.createRadialGradient(bx, gy, 0, bx, gy, reach);
    g.addColorStop(0, withAlpha(ink.glow, 0.15 + 0.08 * pulse));
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
      stripY[j] = yy + st - (live ? hold(st) : 0);
      // Full at the rim, running out to a hairline at its own tip.
      stripW[j] = Math.max(0.22 * px, 1.9 * line * Math.pow(Math.max(0, 1 - 0.94 * (st / reach)), 1.15) * (1 - 0.3 * (st / Math.max(1, maxL))));
    }
    return n;
  };

  /* The underdrawing: the whole jelly at full length and open, dotted in
     pencil for the ink to fill. It beats with the bell, or the ink would
     slide off its own pencil on every pulse. Gone once the block is done. */
  if (sketch && p < 1) {
    const full = pose(1, 0, pulse * (1 - k));
    ctx.save();
    // Taken hold of, the jelly takes its pencil with it, and the pencil
    // goes faint, so a dragged bell never leaves a full-size ghost standing
    // where it used to hang.
    ctx.translate(bellShift, riseY);
    ctx.globalAlpha = 1 - 0.7 * Math.min(1, Math.hypot(handShift, handY) / (R * 0.5));
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
    bellPath(ctx, full, cx, y0, R, line, shape.scallops, plate, lobe);
    ctx.stroke();
    ctx.restore();
  }

  // Everything from here is the live jelly, and it goes where the bell does.
  ctx.save();
  ctx.translate(0, riseY);

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
        stripY[j] = now.rimY + 0.5 * px + st - hold(st);
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
    const t = shape.tentacles[i];
    if (t.sting) {
      // Strung along it at its own pace: each tentacle starts its beads at
      // its own place and spaces them a quarter either way of six steps, so
      // no row runs across the trails.
      const base = 6;
      let at = base * (0.3 + 0.7 * frac(t.ph * 0.618));
      for (let k = 0; at < n - 1; k++) {
        const j = Math.floor(at);
        const f = at - j;
        const x = stripX[j] + (stripX[j + 1] - stripX[j]) * f;
        const y = stripY[j] + (stripY[j + 1] - stripY[j]) * f;
        const wd = stripW[j] + (stripW[j + 1] - stripW[j]) * f;
        stings.push(x + (k % 2 ? 1 : -1) * wd * 0.9, y);
        at += base * (1 + 0.25 * (2 * frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) - 1));
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
  const armLen = (now.L * 0.5 + now.r * 0.35 * now.grow) * (1 + stretch) * shape.armLength;
  if (armLen > 4 * px) {
    const step = 3 * px;
    const n = Math.floor(armLen / step) + 1;
    const ribs: number[][] = [];
    // Big, each twist is shaded with a few strokes across the ribbon where it turns edge-on.
    const folds: number[] = [];
    const armDetail = detailFor(R);
    ctx.fillStyle = ink.arm;
    // The pen, softened into the arm's wash: a frill inked hard reads as a scribble.
    ctx.strokeStyle = mixHex(ink.edge, ink.arm, 0.4);
    ctx.lineWidth = 0.8 * px * (1 - 0.3 * armDetail);
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
        stripY[j] = sy + st - hold(st);
        const turn = 0.35 + 0.65 * Math.abs(Math.cos(st / (a.twist * line) + a.ph));
        stripW[j] = now.r * 0.16 * Math.pow(1 - tt, 0.9) * turn + 0.4 * px;
        if (j % 2 === 0) rib.push(stripX[j], stripY[j]);
        if (armDetail > 0.4 && j % 2 === 1 && turn < 0.6 && tt < 0.85) folds.push(stripX[j], stripY[j], stripW[j]);
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
    if (folds.length) {
      ctx.beginPath();
      for (let j = 0; j < folds.length; j += 3) {
        const hw = folds[j + 2] * 0.45;
        ctx.moveTo(folds[j] - hw, folds[j + 1] - hw * 0.25);
        ctx.lineTo(folds[j] + hw, folds[j + 1] + hw * 0.25);
      }
      ctx.lineWidth = 0.4 * px;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
    }
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
  const dome = plate
    ? plateDome(now, bx)
    : (a: number, sc: number) => [bx + Math.cos(a) * now.rw * sc, now.rimY - Math.pow(Math.sin(a), 0.85) * now.bh * sc] as const;

  // The bell leans into a pull about the middle of its rim; the trails do
  // not, they hang from where they were.
  // Leaning a touch into the slide it is on, so it is heading somewhere.
  const lean = tilt + (alive ? 0.045 * Math.cos(tm / 3300) * (1 - k) : 0);
  ctx.save();
  if (lean) {
    ctx.translate(bx, now.rimY);
    ctx.rotate(lean);
    ctx.translate(-bx, -now.rimY);
  }
  const wash = ctx.createLinearGradient(0, y0, 0, now.rimY);
  wash.addColorStop(0, ink.bellTop);
  wash.addColorStop(1, ink.bellRim);
  const bell = new Path2D();
  bellPath(bell, now, bx, y0, R, line, shape.scallops, plate, lobe);
  ctx.fillStyle = wash;
  ctx.globalAlpha = 0.95;
  ctx.fill(bell);
  ctx.globalAlpha = 1;
  if (plate) plateLight(ctx, bell, dome, now, ink, line);

  // How much drawing the bell carries: a wallpaper's jelly is near enough
  // to be stippled; the block frame's is not.
  const detail = detailFor(R);
  const dark = ink.glow != null;

  // Engraved shading down the right of the dome, the side away from the
  // light, in concentric strokes that follow its curve; drawn big, finer,
  // under a stipple that gathers into the shadow.
  ctx.strokeStyle = ink.rib;
  ctx.lineWidth = (detail > 0.4 ? 0.45 : 0.6) * px;
  ctx.globalAlpha = detail > 0.4 ? 0.26 : 0.38;
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
  if (detail > 0.4) {
    // The stipple, laid once in the bell's own frame (see `bellDots`) and
    // only placed here, so a beating bell costs a fill and no dice.
    const dots = bellDots(shape, dark);
    const dr = 0.34 * px;
    ctx.fillStyle = ink.rib;
    ctx.globalAlpha = 0.55 * Math.min(1, (detail - 0.4) / 0.2);
    ctx.beginPath();
    for (let i = 0; i < dots.length; i += 3) {
      const [x, y] = dome(dots[i], dots[i + 1]);
      const rr = dr * dots[i + 2];
      ctx.moveTo(x + rr, y);
      ctx.arc(x, y, rr, 0, Math.PI * 2);
    }
    ctx.fill();
  }

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

  // Eight canals from the crown, each forking on its way to the rim. On the
  // plate they run down the dome as its meridians would, so they say it is
  // round rather than standing like the ribs of a shade.
  ctx.lineWidth = 0.7 * px;
  ctx.globalAlpha = plate ? 0.36 : 0.5;
  ctx.beginPath();
  if (plate) {
    // Each runs down its own meridian: the dome's profile, drawn in toward
    // the middle by how far round the bell it is, from under the crown.
    for (let j = 0; j < 8; j++) {
      const u = 0.94 * Math.cos((Math.PI * (j + 0.5)) / 8);
      let fx = 0;
      let fy = 0;
      for (let q = 0; q <= 12; q++) {
        const [x, y] = dome((Math.PI / 2) * (0.78 - (0.78 * q) / 12), 0.97);
        const mx = bx + (x - bx) * u;
        if (q === 0) ctx.moveTo(mx, y);
        else if (q <= 9) ctx.lineTo(mx, y);
        if (q === 9) [fx, fy] = [mx, y];
      }
      const ex = bx + now.rw * 0.97 * u;
      for (const side of [-1, 1]) {
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(ex + side * 1.5 * line, (fy + now.rimY) / 2, ex + side * 4 * line, now.rimY - px);
      }
    }
  } else for (let j = 0; j < 8; j++) {
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
  // open toward the middle: a soft wash of pink laid on the bell and let
  // spread at its edge, with only a broken thread of the pen along its outer
  // curve, as a plate shows an organ seen through the clear bell.
  const gy = y0 + now.bh * 0.55;
  const rg = now.r * 0.1;
  const horseshoe = (gx0: number, gy0: number, open: number, k: number) => {
    // Nearly a ring, fuller on its far side than at its two ends, its edge
    // a little uneven: a soft organ, not a letter.
    const from = open + 0.5;
    const to = open + Math.PI * 2 - 0.5;
    const p = new Path2D();
    const N = 22;
    const edge = (a: number, q: number) => 1 + 0.06 * Math.sin(a * 3 + q) + 0.04 * Math.sin(a * 7 + q * 2);
    for (let q = 0; q <= N; q++) {
      const a = from + ((to - from) * q) / N;
      const full = 0.5 - 0.5 * Math.cos(a - open);
      const out = rg * (1.12 + 0.28 * full + 0.12 * k) * edge(a, 1);
      const x = gx0 + Math.cos(a) * out;
      const y = gy0 + Math.sin(a) * out * 0.72;
      if (q) p.lineTo(x, y);
      else p.moveTo(x, y);
    }
    for (let q = N; q >= 0; q--) {
      const a = from + ((to - from) * q) / N;
      const full = 0.5 - 0.5 * Math.cos(a - open);
      const inn = rg * (0.72 - 0.22 * full - 0.1 * k) * edge(a, 4);
      p.lineTo(gx0 + Math.cos(a) * inn, gy0 + Math.sin(a) * inn * 0.72);
    }
    p.closePath();
    return p;
  };
  const shoes = [0.25, 0.75, 1.25, 1.75].map((q) => {
    const th = q * Math.PI;
    const gx0 = bx + Math.cos(th) * now.rw * 0.3;
    const gy0 = gy + Math.sin(th) * now.bh * 0.19;
    return { gx0, gy0, open: Math.atan2(gy - gy0, bx - gx0) };
  });
  if (plate) {
    // Four soft washes and no line: an organ seen through the clear bell,
    // each a plump kidney turned to the middle, not a letter.
    ctx.fillStyle = PLATE_GONAD;
    const kidney = (gx0: number, gy0: number, open: number, grow: number) => {
      const p = new Path2D();
      const N = 26;
      for (let q = 0; q <= N; q++) {
        const a = open + (Math.PI * 2 * q) / N;
        const c = Math.cos(a - open);
        // A dent on the side toward the middle, round everywhere else.
        const rr = rg * (1.25 + 0.12 * grow) * (1 - 0.32 * Math.pow(Math.max(0, c), 3)) * (1 + 0.05 * Math.sin(a * 3 + gx0));
        const x = gx0 + Math.cos(a) * rr;
        const y = gy0 + Math.sin(a) * rr * 0.74;
        if (q) p.lineTo(x, y);
        else p.moveTo(x, y);
      }
      p.closePath();
      return p;
    };
    for (const g of shoes) {
      ctx.globalAlpha = 0.09;
      ctx.fill(kidney(g.gx0, g.gy0, g.open, 1.6));
      ctx.globalAlpha = 0.23;
      ctx.fill(kidney(g.gx0, g.gy0, g.open, 0));
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ink.gonad;
  ctx.save();
  ctx.lineJoin = 'round';
  if (!plate) for (const g of shoes) {
    // The wash, and a wider breath of it round its edge, as wet colour spreads.
    const strength = dark ? 0.7 : 1;
    ctx.globalAlpha = 0.1 * strength;
    ctx.strokeStyle = ink.gonad;
    ctx.lineWidth = 2.2 * line;
    ctx.stroke(horseshoe(g.gx0, g.gy0, g.open, 0.4));
    ctx.globalAlpha = 0.35 * strength;
    ctx.fill(horseshoe(g.gx0, g.gy0, g.open, 0));
    ctx.globalAlpha = 0.12 * strength;
    ctx.fill(horseshoe(g.gx0, g.gy0, g.open, 0.7));
  }
  ctx.restore();
  // The pen: a thin thread along each outer curve, lifted more than it is down.
  ctx.strokeStyle = ink.rib;
  ctx.lineWidth = 0.5 * px;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  if (!plate) shoes.forEach((g, gi) => {
    const from = g.open + 1.3;
    const to = g.open + Math.PI * 2 - 1.3;
    const out = rg * 1.36;
    for (let seg = 0; seg < 3; seg++) {
      const a0 = from + ((to - from) * (seg + 0.12 + 0.1 * ((gi + seg) % 2))) / 3;
      const a1 = from + ((to - from) * (seg + 0.62 + 0.08 * ((gi * 3 + seg) % 3))) / 3;
      for (let a = a0, first = true; a <= a1; a += 0.12, first = false) {
        const x = g.gx0 + Math.cos(a) * out;
        const y = g.gy0 + Math.sin(a) * out * 0.72;
        if (first) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
  });
  ctx.stroke();

  // A lick of white on the crown, where the light catches it: the plain
  // jelly's. The plate's light is its strip of bare paper, never a gloss.
  if (!plate) {
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
  }
  ctx.globalAlpha = 1;

  // The outline, and a fainter second pass just off it, the way a pen
  // drawing goes over its own line. The first is a pressure line: heavier
  // on the side away from the light and breaking where the light is
  // hardest, as the bell's clear edge is lost in it. On dark water it is
  // the lit side that carries the weight, over a soft rim of the jelly's
  // own light.
  const outline = bellPts(now, bx, y0, R, line, shape.scallops, plate, lobe);
  if (dark && ink.lamp) {
    ctx.strokeStyle = ink.lamp;
    ctx.lineWidth = 4 * line;
    ctx.globalAlpha = 0.16 + 0.06 * pulse;
    ctx.stroke(bell);
    ctx.globalAlpha = 1;
  }
  if (plate) {
    // One pressure line, 0.4 to 1.2 of its weight from the light round into
    // the shadow, lifted off the paper twice along the lit shoulder.
    ctx.fillStyle = ink.edge;
    ctx.globalAlpha = 0.95;
    pressureOutline(ctx, outline, 1.5 * line * (1 - 0.25 * detail), LIGHT, Math.max(5 * line, 0.07 * now.rw));
    ctx.globalAlpha = 1;
  } else {
  // The weight follows the light: thin on the lit side and breaking where
  // it is hardest, the clear edge lost in it, and heavy where the bell turns
  // away, with a second stroke laid into the shadow along the right of the
  // dome and under the rim.
  const penLight: [number, number] = dark ? [-LIGHT[0], -LIGHT[1]] : LIGHT;
  inkLine(ctx, outline, true, {
    width: 1.35 * line * (1 - 0.3 * detail),
    color: ink.edge,
    swell: 1,
    lost: 0.85,
    seed: 7,
    raw: true,
    light: penLight,
    min: 0.3 * px,
  });
  {
    const m = outline.length / 2;
    let area = 0;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      area += outline[i * 2] * outline[j * 2 + 1] - outline[j * 2] * outline[i * 2 + 1];
    }
    const sgn = area > 0 ? 1 : -1;
    const deep: boolean[] = [];
    const inner: number[] = [];
    for (let i = 0; i < m; i++) {
      const a = (i - 1 + m) % m;
      const b = (i + 1) % m;
      let dx = outline[b * 2] - outline[a * 2];
      let dy = outline[b * 2 + 1] - outline[a * 2 + 1];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      // Outward, then how squarely it faces along the light.
      const ox = dy * sgn;
      const oy = -dx * sgn;
      deep.push(ox * penLight[0] + oy * penLight[1] > 0.3);
      inner.push(outline[i * 2] - ox * 0.45 * line, outline[i * 2 + 1] - oy * 0.45 * line);
    }
    const s0 = deep.findIndex((v, i) => v && !deep[(i - 1 + m) % m]);
    if (s0 >= 0) {
      let run: number[] = [];
      for (let q = 0; q <= m; q++) {
        const i = (s0 + q) % m;
        if (deep[i] && q < m) run.push(inner[i * 2], inner[i * 2 + 1]);
        else {
          if (run.length >= 8) {
            inkLine(ctx, run, false, {
              width: 0.95 * line * (1 - 0.25 * detail),
              color: ink.edge,
              alpha: 0.8,
              swell: 0.3,
              lost: 0,
              taper: [0.25, 0.25],
              seed: 11 + q,
              raw: true,
              light: penLight,
              min: 0.25 * px,
            });
          }
          run = [];
        }
      }
    }
  }
    ctx.strokeStyle = ink.edge;
    ctx.save();
    ctx.translate(0.9 * line, 0.7 * line);
    ctx.lineWidth = 0.6 * px;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    bellPath(ctx, now, bx, y0, R, line, shape.scallops);
    ctx.stroke();
    ctx.restore();
  }

  // Eight sense organs round the rim; on the night paper they glow.
  const rim: number[] = [];
  for (let j = 0; j < 8; j++) rim.push(bx - now.rw * 0.94 + (j / 7) * now.rw * 1.88, now.rimY + 1.2 * line);
  if (ink.lamp) {
    ctx.save();
    ctx.fillStyle = ink.lamp;
    ctx.shadowColor = ink.lamp;
    ctx.shadowBlur = 6 * line;
    // The sense organs flicker, unevenly, the way a lit thing in the dark does.
    ctx.globalAlpha = alive ? 0.62 + 0.2 * Math.sin(tm / 900) + 0.08 * Math.sin(tm / 370) : 0.8;
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
  ctx.restore();

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
  ctx.restore();
}

/**
 * The plate's light on the bell, after its wash: the pigment pooled at the
 * edge where it dried, and a strip of bare paper left along the lit
 * shoulder, a little in from the edge and running out at both ends. On the
 * night paper the strip is the jelly's own light instead.
 */
function plateLight(
  ctx: CanvasRenderingContext2D,
  bell: Path2D,
  dome: (a: number, sc: number) => readonly [number, number],
  q: Pose,
  ink: JellyInk,
  line: number,
) {
  ctx.save();
  ctx.clip(bell);
  ctx.strokeStyle = ink.bellRim;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 3 * line;
  ctx.stroke(bell);
  ctx.restore();
  const bw = 2 * q.rw;
  const sw = 0.06 * bw;
  const N = 28;
  room(N + 1);
  const a0 = 1.62;
  const a1 = 2.86;
  const widths: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 + (a1 - a0) * t;
    const [ex, ey] = dome(a, 1);
    const [ix, iy] = dome(a, 0.9);
    const dl = Math.hypot(ex - ix, ey - iy) || 1;
    const inset = 0.022 * bw + sw / 2;
    stripX[i] = ex + ((ix - ex) / dl) * inset;
    stripY[i] = ey + ((iy - ey) / dl) * inset;
    widths.push(sw * Math.pow(Math.sin(Math.PI * t), 0.6) * (0.85 + 0.15 * Math.sin(t * 9 + 1)));
  }
  const night = ink.glow != null;
  ctx.fillStyle = night ? mixHex(ink.bellTop, ink.lamp ?? ink.bellTop, 0.45) : (ink.paper ?? '#FBF8EF');
  // A wider breath of it first, so its edges are soft, then the strip.
  for (const [grow, a] of [
    [2.2, 0.1],
    [1.5, 0.22],
    [1, night ? 0.35 : 0.85],
  ] as const) {
    for (let i = 0; i <= N; i++) stripW[i] = widths[i] * grow;
    ctx.globalAlpha = a;
    ctx.beginPath();
    traceStrip(ctx, N + 1);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * The plate's bell: a dome with a crown, not a lampshade. Its sides swell
 * out past the rim a little way above it and turn back in to it, as a moon
 * jelly's margin curls under, so no wall of it ever stands upright, and its
 * shoulders fall away from the crown faster than an ellipse's would. A point
 * on it at `a` (0 at the right of the rim, pi at the left, over the crown)
 * and `sc` of the way out from the middle of the rim.
 */
function plateDome(q: Pose, bx: number): (a: number, sc: number) => readonly [number, number] {
  // How far under its widest point the rim is tucked; the squeeze opens it.
  const d = 0.3 * (1 - 0.45 * q.sq);
  const sd = Math.sin(d);
  const A = q.rw / Math.cos(d);
  const B = q.bh / (1 + sd);
  const cy = q.rimY - B * sd;
  const span = (Math.PI + 2 * d) / Math.PI;
  return (a: number, sc: number) => {
    const ph = -d + a * span;
    const s = Math.sin(ph);
    const y = cy - B * (s > 0 ? Math.pow(s, 1.35) : s);
    return [bx + A * Math.cos(ph) * sc, q.rimY - (q.rimY - y) * sc] as const;
  };
}

/**
 * The bell's outline as points, the same curve `bellPath` traces, for the
 * pen's pressure line. `plate` is the plate's dome (`plateDome`), and `lobe`
 * how deep its rim's lobes are cut.
 */
function bellPts(q: Pose, bx: number, y0: number, R: number, line: number, n = 16, plate = false, lobe = 1): number[] {
  if (plate) {
    const dome = plateDome(q, bx);
    const out: number[] = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const [x, y] = dome(Math.PI * (1 - i / N), 1);
      out.push(x, y);
    }
    // The rim, right to left: lobes bulging down between the notches.
    const step = (2 * q.rw) / n;
    const dip = 2.6 * line * (q.r / R) * lobe;
    for (let i = 0; i < n; i++) {
      const xa = q.rw + bx - i * step;
      for (let k = 1; k <= 5; k++) {
        if (i === n - 1 && k === 5) break;
        const t = k / 5;
        out.push(xa - t * step, q.rimY + Math.pow(Math.sin(Math.PI * t), 0.7) * dip);
      }
    }
    return out;
  }
  const L = bx - q.rw;
  const Rr = bx + q.rw;
  const flare = q.rw * 0.05 * q.sq;
  const out: number[] = [L - flare, q.rimY];
  const cubic = (p: number[], k: number) => {
    for (let i = 1; i <= k; i++) {
      const t = i / k;
      const u = 1 - t;
      out.push(
        u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
        u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
      );
    }
  };
  cubic([L - flare, q.rimY, L, y0 + q.bh * 0.1, bx - q.rw * 0.58, y0, bx, y0], 18);
  cubic([bx, y0, bx + q.rw * 0.58, y0, Rr, y0 + q.bh * 0.1, Rr + flare, q.rimY], 18);
  const step = (2 * (q.rw + flare)) / n;
  const dip = 2.6 * line * (q.r / R);
  for (let i = 1; i <= n; i++) {
    const xa = Rr + flare - (i - 1) * step;
    const xb = Rr + flare - i * step;
    const cx = (xa + xb) / 2;
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      const u = 1 - t;
      out.push(u * u * xa + 2 * u * t * cx + t * t * xb, q.rimY + 2 * u * t * dip);
    }
  }
  // Closed: the last point is the first again.
  out.length -= 2;
  return out;
}

/* The bell's stipple, in its own frame: each dot an angle round the dome
   (0 at the right of the rim, pi at the left), how far out from the crown
   toward the rim, and a size, so it beats and leans with the bell for free.
   Rolled once per shape and paper. */
const stipples = new WeakMap<JellyShape, { light?: number[]; dark?: number[] }>();

function bellDots(shape: JellyShape, dark: boolean): number[] {
  let entry = stipples.get(shape);
  if (!entry) {
    entry = {};
    stipples.set(shape, entry);
  }
  const key = dark ? 'dark' : 'light';
  const hit = entry[key];
  if (hit) return hit;
  const r = rng(0x5717);
  const out: number[] = [];
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI;
    // Even over the dome's area, not crowded at the crown.
    const sc = 0.12 + 0.86 * Math.sqrt(r());
    // Away from the light (the right, and down toward the rim) on light
    // water; on dark water the light ink marks the lit left instead.
    const side = dark ? -Math.cos(a) : Math.cos(a);
    const shade = 0.5 + 0.38 * side + 0.3 * (sc - 0.6) + (dark ? 0.1 * (1 - sc) : 0);
    const keep = Math.pow(Math.max(0, (shade - 0.42) / 0.58), 1.5);
    if (r() < keep) out.push(a, sc, 0.7 + 0.6 * r());
    else r();
  }
  entry[key] = out;
  return out;
}

/**
 * The bell's outline into whatever path is open: a dome that flares a
 * little at the rim on the squeeze, and a rim of shallow scallops (sixteen on
 * the plain jelly).
 */
function bellPath(
  ctx: CanvasRenderingContext2D | Path2D,
  q: Pose,
  bx: number,
  y0: number,
  R: number,
  line: number,
  n = 16,
  plate = false,
  lobe = 1,
) {
  if (plate) {
    const pts = bellPts(q, bx, y0, R, line, n, true, lobe);
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    return;
  }
  const L = bx - q.rw;
  const Rr = bx + q.rw;
  const flare = q.rw * 0.05 * q.sq;
  ctx.moveTo(L - flare, q.rimY);
  ctx.bezierCurveTo(L, y0 + q.bh * 0.1, bx - q.rw * 0.58, y0, bx, y0);
  ctx.bezierCurveTo(bx + q.rw * 0.58, y0, Rr, y0 + q.bh * 0.1, Rr + flare, q.rimY);
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

/**
 * How hard a bell is squeezing `ms` after something touched it: a quick
 * clench, then a slow letting go. It is laid over the beat, so a poke is a
 * beat of its own and never a second clock.
 */
export function jellyStartle(ms: number): number {
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (ms < 0) return 0;
  if (ms < 150) return smooth(ms / 150);
  return Math.max(0, 1 - smooth(Math.min(1, (ms - 150) / 1000)));
}

/**
 * The plate's outline: one pressure line round a closed shape, `base` wide
 * on average, from 0.4 of it where the shape faces the light to 1.2 where
 * it turns away, and lifted off the paper twice along the lit side (`gap`
 * long), running out thin into each gap. Filled in the current fill style.
 */
function pressureOutline(ctx: CanvasRenderingContext2D, pts: number[], base: number, light: readonly [number, number], gap: number) {
  const m = pts.length / 2;
  if (m < 4) return;
  let area = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  const sgn = area > 0 ? 1 : -1;
  const ll = Math.hypot(light[0], light[1]) || 1;
  const face = new Float64Array(m);
  const along = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = (i - 1 + m) % m;
    const b = (i + 1) % m;
    const dx = pts[b * 2] - pts[a * 2];
    const dy = pts[b * 2 + 1] - pts[a * 2 + 1];
    const dl = Math.hypot(dx, dy) || 1;
    // Outward, then how squarely it faces along the light: 1 turned away.
    face[i] = (((dy / dl) * light[0] - (dx / dl) * light[1]) * sgn) / ll;
    const j = (i + 1) % m;
    along[i + 1] = along[i] + Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]);
  }
  const total = along[m];
  // The longest run facing the light.
  let from = -1;
  let longest = 0;
  for (let i = 0; i < m; i++) {
    if (face[i] > -0.3 || face[(i - 1 + m) % m] <= -0.3) continue;
    let len = 0;
    for (let k = i; face[k % m] <= -0.3 && len < total; k++) len += along[(k % m) + 1] - along[k % m];
    if (len > longest) {
      longest = len;
      from = i;
    }
  }
  // Two gaps in it, a third and two thirds of the way along: each one's middle round the outline.
  const gaps: number[] = [];
  const half = Math.min(gap, longest * 0.18) / 2;
  if (from >= 0) for (const f of [0.3, 0.72]) gaps.push((along[from] + longest * f) % total);
  const ring = (s: number, c: number) => Math.min(Math.abs(s - c), total - Math.abs(s - c));
  // -1 in a gap; otherwise 0 to 1, how far from a gap's end, for the taper into it.
  const inGap = (s: number) => {
    let t = 1;
    for (const c of gaps) {
      const dc = ring(s, c);
      if (dc < half) return -1;
      t = Math.min(t, (dc - half) / (base * 6));
    }
    return t;
  };
  // The walk starts in a gap (or anywhere, with none), so every run is open.
  let s0 = 0;
  if (gaps.length) {
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      const dc = ring(along[i], gaps[0]);
      if (dc < best) {
        best = dc;
        s0 = i;
      }
    }
  }
  let n = 0;
  const flush = () => {
    if (n >= 2) {
      ctx.beginPath();
      traceStrip(ctx, n);
      ctx.fill();
    }
    n = 0;
  };
  room(m + 2);
  for (let q = 0; q <= m; q++) {
    const i = (s0 + q) % m;
    const t = inGap(along[i]);
    if (t < 0) {
      flush();
      continue;
    }
    stripX[n] = pts[i * 2];
    stripY[n] = pts[i * 2 + 1];
    stripW[n] = base * (0.8 + 0.4 * face[i]) * (0.35 + 0.65 * Math.sqrt(t));
    n++;
  }
  flush();
}

/** `#rrggbb` turned `deg` round the colour wheel, its lightness and saturation kept. */
function turnHue(hex: string, deg: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n) || hex.length < 7) return hex;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return hex;
  const c = d;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v + m0)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

/* An ink turned round the wheel, made once for each ink and turn. The pen's
   lines keep their colour: it is the animal that is tinted. */
const turnedInks = new WeakMap<JellyInk, Map<number, JellyInk>>();

function turnedInk(ink: JellyInk, deg: number): JellyInk {
  let m = turnedInks.get(ink);
  if (!m) {
    m = new Map();
    turnedInks.set(ink, m);
  }
  const hit = m.get(deg);
  if (hit) return hit;
  const t = (c: string) => turnHue(c, deg);
  const made: JellyInk = {
    ...ink,
    bellTop: t(ink.bellTop),
    bellRim: t(ink.bellRim),
    gonad: t(ink.gonad),
    tentacle: t(ink.tentacle),
    sting: t(ink.sting),
    arm: t(ink.arm),
    bloom: t(ink.bloom),
    glow: ink.glow && t(ink.glow),
    lamp: ink.lamp && t(ink.lamp),
  };
  m.set(deg, made);
  return made;
}

/** The fractional part, always 0 to 1. */
function frac(x: number): number {
  return x - Math.floor(x);
}

/** `#rrggbb` to an rgba() string at `alpha`, for the glow's gradient. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(168, 184, 155, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

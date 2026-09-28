/**
 * The study fan.
 *
 * One stem from the bottom edge, splitting into two or three at each step,
 * drawn with round tips. Every segment is born at a depth, and the session's
 * progress unlocks depths, so the fan extends and branches the longer the
 * reader sits. It replaces the countdown ring the timer used to draw.
 *
 * The geometry is deterministic for a given seed, which is what lets a saved
 * session redraw the fan it grew: seed off the session id and the same shape
 * comes back. Nothing here touches the DOM, so it is safe on the server; the
 * drawing half takes a 2D context the caller owns.
 */

export interface FanSegment {
  /** Start point, in the fan's own units: the stem begins at (0, 0). */
  x: number;
  y: number;
  /** End point. y runs negative upward, the way canvas wants it. */
  x1: number;
  y1: number;
  /** Relative thickness, 1 at the stem and shrinking by depth. */
  w: number;
  /** How many splits deep this segment is. Progress unlocks depths in order. */
  d: number;
  /** The segment this one grows out of; -1 for the stem. Always a lower
      index than this segment's own, because the tree is built depth first,
      which is what lets one forward pass bend the whole thing. */
  p: number;
  /** Rest angle, absolute. Bending a branch rotates this and every angle
      hanging off it, which is the difference between a tree leaning and a
      tree shearing. */
  a: number;
  /** Length in the fan's own units. */
  len: number;
  /** How far the branch bows off its straight line, as a share of its
      length, one side or the other. Drawn from its own generator so adding it
      moved no branch: a saved session still grows the shape it always grew. */
  bow: number;
  /** How many branches grow out of this one. None means a tip. */
  kids: number;
}

export interface FanTree {
  segs: FanSegment[];
  minX: number;
  maxX: number;
  minY: number;
  depthMax: number;
}

/**
 * A small LCG rather than Math.random, because the fan has to be reproducible
 * from its seed alone. Same constants as any textbook linear congruential
 * generator; the quality bar here is "looks unplanned", not cryptography.
 */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Turn any string, a session id or a task id, into a seed. The fan only needs
 * the same input to give the same shape, so a cheap hash is enough.
 */
export function seedFrom(value: string | null | undefined, fallback = 19): number {
  if (!value) return fallback;
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 997 || fallback;
}

/**
 * Build the whole fan up front. It is cheap (a few hundred segments at the
 * depths used here) and doing it once means the draw loop is pure arithmetic.
 *
 * @param depthMax how many splits deep to go. 7 for the block frame, 10 for
 *   an open session that has a whole screen to fill.
 * @param tripleP chance a split goes three ways rather than two.
 */
export function buildFan(seed: number, depthMax = 7, tripleP = 0.2): FanTree {
  const r = rng(seed);
  const bow = rng(seed * 7 + 3);
  const segs: FanSegment[] = [];

  const rec = (
    x: number,
    y: number,
    ang: number,
    len: number,
    w: number,
    d: number,
    p: number,
  ) => {
    if (d > depthMax) return;
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    const self = segs.length;
    segs.push({ x, y, x1, y1, w, d, p, a: ang, len, bow: (bow() - 0.5) * 0.22, kids: 0 });
    if (p >= 0) segs[p].kids++;

    const n = d < 1 ? 2 : r() < tripleP ? 3 : 2;
    const spread = 0.5 + r() * 0.35;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spread + (r() - 0.5) * 0.3;
      // Pull each branch a tenth of the way back toward straight up, so the
      // fan keeps reaching for the top of its frame instead of splaying flat.
      const a = (ang + off) * 0.9 + (-Math.PI / 2) * 0.1;
      rec(x1, y1, a, len * (0.7 + r() * 0.12), w * 0.72, d + 1, self);
    }
  };

  rec(0, 0, -Math.PI / 2, 1, 1, 0, -1);

  let minX = 0;
  let maxX = 0;
  let minY = 0;
  for (const s of segs) {
    minX = Math.min(minX, s.x1);
    maxX = Math.max(maxX, s.x1);
    minY = Math.min(minY, s.y1);
  }
  return { segs, minX, maxX, minY, depthMax };
}

export interface FanDrawOptions {
  /** 0 to 1. At 1 every segment is fully drawn and the fan touches the top. */
  progress: number;
  /** Stem, mid and tip colours. Usually the course colour and two shades. */
  colors: [string, string, string];
  /** Thickness of the stem in device pixels; everything else scales off it. */
  trunkWidth?: number;
  /** Headroom above the fan at full progress, in device pixels. */
  padTop?: number;
  /** How much of the frame's width the fan may span. */
  widthFill?: number;
  /** Where the stem's foot sits, measured up from the bottom edge. */
  baseOffset?: number;
  /** Radians added at each depth, indexed by depth. A branch takes its own
      entry plus every entry above it, so the stem leans a little and the
      tips travel a long way, which is how a tree bends. Leave it out and
      the fan is drawn at rest. */
  bends?: number[];
  /** Length multiplier at each depth, indexed the same way. Small numbers:
      a tenth either side is the whole range the pull uses. */
  slack?: number[];
  /** How far each split has closed toward its parent, indexed by depth: 0 is
      open, 1 would lay a branch along the one it grows from. What a paused
      fan does, like a flower at dusk. Only read alongside `bends`. */
  fold?: number[];
  /** Device pixels to a CSS pixel, for the hairlines. */
  px?: number;
  /** Leaf fill and edge. Given, the growing tips carry a leaf each and a
      finished fan flowers at its outermost tips. */
  leaf?: { fill: string; edge: string; bloom: string; eye: string };
  /** The pencil underdrawing: the shape still to come, dotted in this ink.
      Only where a block has a top to reach; an open session has no shape to
      sketch ahead of it. */
  sketch?: string;
  /** A drawn line for the stem to stand on, in this ink. */
  ground?: string;
}

/* Scratch for the bent pose: the end point and absolute angle of every
   segment. Kept between frames because the draw loop runs sixty times a
   second over a few hundred segments, and three fresh arrays a frame is the
   kind of litter that shows up as a stutter on a phone. */
let poseX = new Float64Array(0);
let poseY = new Float64Array(0);
let poseA = new Float64Array(0);

/**
 * Walk the tree once and write the bent pose into the scratch arrays. Parents
 * always come first in `segs`, so a single forward pass is enough: each
 * branch starts where its parent ended and carries its parent's rotation.
 */
function poseFan(tree: FanTree, bends: number[], slack?: number[], fold?: number[]): void {
  const n = tree.segs.length;
  if (poseX.length < n) {
    poseX = new Float64Array(n);
    poseY = new Float64Array(n);
    poseA = new Float64Array(n);
  }
  for (let i = 0; i < n; i++) {
    const s = tree.segs[i];
    const parent = s.p >= 0 ? tree.segs[s.p] : null;
    const open = 1 - (fold?.[s.d] ?? 0);
    const a = (parent ? poseA[s.p] + (s.a - parent.a) * open : s.a) + (bends[s.d] ?? 0);
    const len = s.len * (1 + (slack?.[s.d] ?? 0));
    poseA[i] = a;
    poseX[i] = (parent ? poseX[s.p] : 0) + Math.cos(a) * len;
    poseY[i] = (parent ? poseY[s.p] : 0) + Math.sin(a) * len;
  }
}

/* Branches this wide and up are drawn as a tapering outline, narrowing from
   where they leave their parent to where their own branches leave them.
   Anything thinner is a single stroke, where a taper would not show. */
const TAPER_FROM = 2.6;
const TAPER_STEPS = 7;

/**
 * Paint the fan into a canvas context sized `width` x `height` in device
 * pixels. The tree is scaled so that at progress 1 it exactly fills its
 * frame, which is what makes "touching the top edge" mean "block complete".
 *
 * Each branch is a shallow curve, bowed to one side by its own seed, so the
 * fan reads as drawn in ink rather than ruled. The thick ones taper, and a
 * branch starts exactly as wide as its parent ends, so the joins are
 * seamless.
 */
export function drawFan(
  ctx: CanvasRenderingContext2D,
  tree: FanTree,
  width: number,
  height: number,
  opts: FanDrawOptions,
): void {
  const {
    progress,
    colors,
    trunkWidth = 22,
    padTop = 90,
    widthFill = 0.86,
    baseOffset = -2,
    bends,
    slack,
    fold,
    px = 1,
    leaf,
    sketch,
    ground,
  } = opts;

  ctx.clearRect(0, 0, width, height);

  const spanX = tree.maxX - tree.minX;
  const spanY = -tree.minY;
  if (spanX <= 0 || spanY <= 0) return;

  const sc = Math.min((width * widthFill) / spanX, (height - padTop - Math.max(0, baseOffset)) / spanY);
  const ox = width / 2 - ((tree.minX + tree.maxX) / 2) * sc;
  const oy = height - baseOffset;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const depths = tree.depthMax + 1;
  const p = Math.min(1, Math.max(0, progress));
  const run = p * depths;

  // One colour per depth, run smoothly from the stem's to the tips'.
  const ramp = Array.from({ length: depths }, (_, d) => {
    const t = d / Math.max(1, tree.depthMax);
    return t < 0.5 ? mixHex(colors[0], colors[1], t * 2) : mixHex(colors[1], colors[2], (t - 0.5) * 2);
  });

  /* The frame is measured off the resting shape, on purpose. A fan that
     rescaled as it was pulled would shrink the moment a hand touched it, and
     "the tips reached the top" has to keep meaning the block is done. A
     pulled tree leans past its own margins instead, and the frame clips it. */
  const bent = bends != null;
  if (bent) poseFan(tree, bends, slack, fold);

  const at = (i: number): [number, number, number, number] => {
    const s = tree.segs[i];
    const x0 = bent ? (s.p >= 0 ? poseX[s.p] : 0) : s.x;
    const y0 = bent ? (s.p >= 0 ? poseY[s.p] : 0) : s.y;
    const x1 = bent ? poseX[i] : s.x1;
    const y1 = bent ? poseY[i] : s.y1;
    return [ox + x0 * sc, oy + y0 * sc, ox + x1 * sc, oy + y1 * sc];
  };

  /* The underdrawing first, so the ink goes over it: every branch not yet
     finished, whole, dotted in pencil. The outermost twigs are left off; at
     that density a sketch turns into a grey cloud. */
  if (sketch) {
    ctx.save();
    ctx.strokeStyle = sketch;
    ctx.lineWidth = 0.9 * px;
    ctx.setLineDash([1.5 * px, 3.5 * px]);
    ctx.beginPath();
    for (let i = 0; i < tree.segs.length; i++) {
      const s = tree.segs[i];
      if (s.d > 8 || run - s.d >= 1) continue;
      const [ax, ay, bx, by] = at(i);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const cx = (ax + bx) / 2 - ((by - ay) / len) * s.bow * len;
      const cy = (ay + by) / 2 + ((bx - ax) / len) * s.bow * len;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cx, cy, bx, by);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* The ground: one pencil line, not quite level, and a few strokes of grass
     either side of the stem. */
  if (ground) {
    const gy = oy + px;
    ctx.save();
    ctx.strokeStyle = ground;
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath();
    ctx.moveTo(width * 0.14, gy + 1.5 * px);
    ctx.bezierCurveTo(width * 0.3, gy - px, width * 0.42, gy + 2 * px, ox, gy);
    ctx.bezierCurveTo(ox + (ox - width * 0.42), gy - 2 * px, width * 0.74, gy + 2.5 * px, width * 0.86, gy);
    const tuft = trunkWidth / 11;
    [-58, -41, -22, 19, 37, 63].forEach((dx, k) => {
      const x = ox + dx * tuft;
      const h = (4 + (k % 3) * 2) * px;
      const lean = (k % 2 ? 1.5 : -1.5) * px;
      ctx.moveTo(x, gy);
      ctx.lineTo(x + lean, gy - h);
      ctx.moveTo(x + 3 * px, gy);
      ctx.lineTo(x + 3 * px - lean * 0.7, gy - h + 2 * px);
    });
    ctx.stroke();
    ctx.restore();
  }

  const tips: { x: number; y: number; a: number; grown: number; i: number; done: boolean }[] = [];

  for (let i = 0; i < tree.segs.length; i++) {
    const s = tree.segs[i];
    // Each depth gets an equal slice of the run. A segment is still growing
    // while its slice is open and finished once the next depth starts.
    const grown = Math.min(1, Math.max(0, run - s.d));
    if (grown <= 0) continue;

    const [ax, ay, bx, by] = at(i);
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const cx = (ax + bx) / 2 - ((by - ay) / len) * s.bow * len;
    const cy = (ay + by) / 2 + ((bx - ax) / len) * s.bow * len;

    // The part of the curve grown so far: de Casteljau's split at `grown`.
    const t = grown;
    const qx = ax + (cx - ax) * t;
    const qy = ay + (cy - ay) * t;
    const ex = qx + (cx + (bx - cx) * t - qx) * t;
    const ey = qy + (cy + (by - cy) * t - qy) * t;

    const w0 = Math.max(1.4, s.w * trunkWidth);
    const w1 = Math.max(1.2, s.w * 0.72 * trunkWidth);
    const wE = w0 + (w1 - w0) * t;
    const col = ramp[s.d];
    // The outermost twigs sit back a little so the fan does not read as a
    // solid mass once it is nearly full.
    ctx.globalAlpha = s.d >= 8 ? 0.85 : 1;

    if (w0 >= TAPER_FROM) {
      ctx.fillStyle = col;
      ctx.beginPath();
      const side: number[] = [];
      for (let k = 0; k <= TAPER_STEPS; k++) {
        const u = k / TAPER_STEPS;
        const mx = (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * qx + u * u * ex;
        const my = (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * qy + u * u * ey;
        let tx = 2 * (1 - u) * (qx - ax) + 2 * u * (ex - qx);
        let ty = 2 * (1 - u) * (qy - ay) + 2 * u * (ey - qy);
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const hw = (w0 + (wE - w0) * u) / 2;
        if (k === 0) ctx.moveTo(mx - ty * hw, my + tx * hw);
        else ctx.lineTo(mx - ty * hw, my + tx * hw);
        side.push(mx + ty * hw, my - tx * hw);
      }
      for (let k = side.length - 2; k >= 0; k -= 2) ctx.lineTo(side[k], side[k + 1]);
      ctx.closePath();
      ctx.fill();
      // Round the joins: a disc at each end, the width of the branch there.
      // Not under the stem's foot, which stands flat on the ground.
      ctx.beginPath();
      if (s.p >= 0) {
        ctx.moveTo(ax + w0 / 2, ay);
        ctx.arc(ax, ay, w0 / 2, 0, Math.PI * 2);
      }
      ctx.moveTo(ex + wE / 2, ey);
      ctx.arc(ex, ey, wE / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = w0;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(qx, qy, ex, ey);
      ctx.stroke();
    }

    // A tip that is still the edge of the growth: nothing out past it yet.
    if (leaf && s.d >= 2 && (run <= s.d + 1 || s.kids === 0)) {
      tips.push({ x: ex, y: ey, a: Math.atan2(ey - qy, ex - qx), grown: t, i, done: s.kids === 0 && p >= 1 });
    }
  }
  ctx.globalAlpha = 1;

  /* Leaves on the growing edge, one per tip, turned off the branch to
     alternate sides. They come in small and open as the branch lengthens.
     When the block is done the outermost tips flower instead, one in three,
     which is enough to read as a crown in bloom without speckling it. */
  if (leaf && tips.length) {
    const scale = Math.min(1.4, Math.max(0.8, trunkWidth / (11 * px))) * px;
    ctx.lineWidth = 0.8 * px;
    ctx.strokeStyle = leaf.edge;
    for (const tip of tips) {
      if (tip.done) {
        if (tip.i % 3) continue;
        ctx.fillStyle = leaf.bloom;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 3.4 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = leaf.eye;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 1.1 * scale, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const size = (3 + 4.5 * Math.min(1, tip.grown * 1.4)) * scale;
      const a = tip.a + (tip.i % 2 ? 0.5 : -0.5);
      const lx = tip.x + Math.cos(a) * size * 0.8;
      const ly = tip.y + Math.sin(a) * size * 0.8;
      ctx.fillStyle = leaf.fill;
      ctx.beginPath();
      ctx.ellipse(lx, ly, size, size * 0.42, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Mix two hex colours, `t` of the way from `a` to `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const read = (hex: string) => {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const n = parseInt(full.slice(0, 6), 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [168, 184, 155];
  };
  const A = read(a);
  const B = read(b);
  return (
    '#' +
    A.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (B[i] - v) * t))).toString(16).padStart(2, '0')).join('')
  );
}

/**
 * Three shades from one course colour: a darker stem, the colour itself, and
 * a lighter tip. Hand-mixed against black and white rather than pulled from a
 * colour library, which would be a dependency for four lines of arithmetic.
 */
export function fanShades(hex: string, lighten = false): [string, string, string] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) {
    return lighten ? ['#8FA082', '#A8B89B', '#C4D0B9'] : ['#6F7F63', '#8FA082', '#A8B89B'];
  }
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;

  const mix = (amount: number, toward: number) =>
    '#' +
    [r, g, b]
      .map((c) => Math.round(c + (toward - c) * amount))
      .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
      .join('');

  // On the night paper the fan is the light value, so the ramp runs the other
  // way: the stem is the colour and the tips lift toward white.
  if (lighten) return [mix(0.18, 0), hex, mix(0.34, 255)];
  return [mix(0.34, 0), mix(0.14, 0), hex];
}

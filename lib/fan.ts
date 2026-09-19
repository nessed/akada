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
  const segs: FanSegment[] = [];

  const rec = (x: number, y: number, ang: number, len: number, w: number, d: number) => {
    if (d > depthMax) return;
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    segs.push({ x, y, x1, y1, w, d });

    const n = d < 1 ? 2 : r() < tripleP ? 3 : 2;
    const spread = 0.5 + r() * 0.35;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spread + (r() - 0.5) * 0.3;
      // Pull each branch a tenth of the way back toward straight up, so the
      // fan keeps reaching for the top of its frame instead of splaying flat.
      const a = (ang + off) * 0.9 + (-Math.PI / 2) * 0.1;
      rec(x1, y1, a, len * (0.7 + r() * 0.12), w * 0.72, d + 1);
    }
  };

  rec(0, 0, -Math.PI / 2, 1, 1, 0);

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
}

/**
 * Paint the fan into a canvas context sized `width` x `height` in device
 * pixels. The tree is scaled so that at progress 1 it exactly fills its
 * frame, which is what makes "touching the top edge" mean "block complete".
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
  } = opts;

  ctx.clearRect(0, 0, width, height);

  const spanX = tree.maxX - tree.minX;
  const spanY = -tree.minY;
  if (spanX <= 0 || spanY <= 0) return;

  const sc = Math.min((width * widthFill) / spanX, (height - padTop) / spanY);
  const ox = width / 2 - ((tree.minX + tree.maxX) / 2) * sc;
  const oy = height - baseOffset;

  ctx.lineCap = 'round';
  const depths = tree.depthMax + 1;
  const p = Math.min(1, Math.max(0, progress));

  for (const s of tree.segs) {
    // Each depth gets an equal slice of the run. A segment is still growing
    // while its slice is open and finished once the next depth starts.
    const grown = Math.min(1, Math.max(0, p * depths - s.d));
    if (grown <= 0) continue;

    const x1 = s.x + (s.x1 - s.x) * grown;
    const y1 = s.y + (s.y1 - s.y) * grown;

    ctx.lineWidth = Math.max(1.4, s.w * trunkWidth);
    ctx.strokeStyle = s.d < 2 ? colors[0] : s.d < 5 ? colors[1] : colors[2];
    // The outermost twigs sit back a little so the fan does not read as a
    // solid mass once it is nearly full.
    ctx.globalAlpha = s.d >= 8 ? 0.85 : 1;

    ctx.beginPath();
    ctx.moveTo(ox + s.x * sc, oy + s.y * sc);
    ctx.lineTo(ox + x1 * sc, oy + y1 * sc);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
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

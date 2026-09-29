/**
 * Small geometry for drawing animals and plants as point lists.
 *
 * Everything in the wood is built in its own units first, as plain arrays of
 * points, so it can be tested in node and cached before a canvas is ever
 * involved. draw.ts is the only place that turns these into ink.
 */

export type Pt = [number, number];

/** A run of points, or an ellipse. */
export interface Shape {
  pts?: Pt[];
  close?: boolean;
  /** cx, cy, rx, ry, rotation. */
  c?: [number, number, number, number, number];
}

export const TAU = Math.PI * 2;

export function poly(pts: Pt[], close = false): Shape {
  return { pts, close };
}

export function oval(cx: number, cy: number, rx: number, ry = rx, rot = 0): Shape {
  return { c: [cx, cy, rx, ry, rot] };
}

/**
 * A smooth curve through the given points (centripetal Catmull-Rom), sampled
 * `steps` times per span. Closed, it runs back round to the first point.
 * Every body in the wood is a handful of landmarks put through this, which
 * is what keeps them drawn rather than assembled.
 */
export function spline(points: Pt[], closed: boolean, steps = 6): Pt[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const out: Pt[] = [];
  const get = (i: number): Pt => {
    if (closed) return points[((i % n) + n) % n];
    return points[Math.max(0, Math.min(n - 1, i))];
  };
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const d01 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.5) || 1e-4;
    const d12 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), 0.5) || 1e-4;
    const d23 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), 0.5) || 1e-4;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push(cr(p0, p1, p2, p3, d01, d12, d23, t));
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

function cr(p0: Pt, p1: Pt, p2: Pt, p3: Pt, d01: number, d12: number, d23: number, t: number): Pt {
  // Barry-Goldman's pyramid for centripetal Catmull-Rom.
  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
    const k = (u - ta) / (tb - ta || 1e-4);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

export function rotatePts(pts: Pt[], angle: number, ox = 0, oy = 0): Pt[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
}

export function movePts(pts: Pt[], dx: number, dy: number): Pt[] {
  return pts.map(([x, y]) => [x + dx, y + dy]);
}

export function scalePts(pts: Pt[], sx: number, sy = sx, ox = 0, oy = 0): Pt[] {
  return pts.map(([x, y]) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);
}

/** Apply a transform to every shape in place of the originals. */
export function mapShapes(shapes: Shape[], f: (p: Pt) => Pt, rot = 0, scale = 1): Shape[] {
  return shapes.map((s) => {
    if (s.c) {
      const [cx, cy, rx, ry, r] = s.c;
      const [x, y] = f([cx, cy]);
      return { c: [x, y, rx * scale, ry * scale, r + rot] };
    }
    return { pts: (s.pts ?? []).map(f), close: s.close };
  });
}

/** The box round a set of shapes. */
export function boundsOf(groups: Shape[][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shapes of groups) {
    for (const s of shapes) {
      if (s.c) {
        const [cx, cy, rx, ry] = s.c;
        const r = Math.max(rx, ry);
        minX = Math.min(minX, cx - r);
        maxX = Math.max(maxX, cx + r);
        minY = Math.min(minY, cy - r);
        maxY = Math.max(maxY, cy + r);
      } else if (s.pts) {
        for (const [x, y] of s.pts) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

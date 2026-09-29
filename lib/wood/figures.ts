import type { AnimalGenome } from './fauna';
import { boundsOf, movePts, oval, poly, rotatePts, spline, TAU, type Pt, type Shape } from './shapes';

/**
 * Animals as drawings, in their own units.
 *
 * Each plan is a handful of landmarks put through a spline (a songbird is a
 * forehead, a crown, a nape, a back, a rump and so on) with the genome
 * moving the landmarks, so the outline is one drawn line and not a stack of
 * ovals. The parts land in layers the way the Creature Lab's did: pale body,
 * markings clipped inside it, fine ink, the near wing over the far one, a
 * dark bead of an eye. draw.ts inks the layers in order; nothing here knows
 * what a canvas is.
 *
 * Birds, walkers and the bee face right. Butterflies, moths, dragonflies and
 * fireflies are drawn from above, head up, and turned to their heading when
 * they are drawn. Raptors and bats are seen from below, wings spread.
 */

export type Layer =
  | 'glow'
  | 'wingBack'
  | 'legsBack'
  | 'tail'
  | 'body'
  | 'belly'
  | 'pattern'
  | 'band'
  | 'markLine'
  | 'detail'
  | 'legsFront'
  | 'wingFront'
  | 'wingMark'
  | 'wingLine'
  | 'horn'
  | 'dark'
  | 'eye'
  | 'shine'
  | 'antenna'
  | 'light';

/** The order draw.ts inks them in. */
export const LAYER_ORDER: readonly Layer[] = [
  'glow',
  'wingBack',
  'legsBack',
  'tail',
  'body',
  'belly',
  'pattern',
  'band',
  'markLine',
  'detail',
  'legsFront',
  'wingFront',
  'wingMark',
  'wingLine',
  'horn',
  'dark',
  'eye',
  'shine',
  'antenna',
  'light',
];

export type PoseKind = 'perch' | 'fly' | 'bound' | 'glide' | 'walk' | 'stand' | 'graze' | 'hop';

export interface Pose {
  kind: PoseKind;
  /** Where in its cycle, 0 to 1: a wingbeat, a stride, a hop. */
  t: number;
}

export interface Figure {
  layers: Partial<Record<Layer, Shape[]>>;
  /** What sits on the branch or the ground; the centre of a flier. */
  anchor: Pt;
  /** The length the plan's size is measured against. */
  ref: number;
  bounds: [number, number, number, number];
  /** An owl's eye is lit; everything else has a dark bead. */
  eyeLit?: boolean;
  /** Drawn from above or below: turned to its heading rather than flipped. */
  planform?: boolean;
  /** Wings that are mostly glass: a dragonfly's, a bee's. */
  glass?: boolean;
}

class Sketch {
  layers: Partial<Record<Layer, Shape[]>> = {};
  add(layer: Layer, shape: Shape): void {
    (this.layers[layer] ??= []).push(shape);
  }
  fill(layer: Layer, pts: Pt[]): void {
    this.add(layer, poly(pts, true));
  }
  line(layer: Layer, pts: Pt[]): void {
    this.add(layer, poly(pts, false));
  }
  /** Close off: move so the anchor sits at 0,0, and measure. */
  done(anchor: Pt, ref: number, extra: Partial<Figure> = {}): Figure {
    const [ax, ay] = anchor;
    const layers: Partial<Record<Layer, Shape[]>> = {};
    for (const key of Object.keys(this.layers) as Layer[]) {
      layers[key] = (this.layers[key] ?? []).map((s) =>
        s.c ? { c: [s.c[0] - ax, s.c[1] - ay, s.c[2], s.c[3], s.c[4]] } : { pts: movePts(s.pts ?? [], -ax, -ay), close: s.close },
      );
    }
    return { layers, anchor: [0, 0], ref, bounds: boundsOf(Object.values(layers) as Shape[][]), ...extra };
  }
}

export function buildFigure(g: AnimalGenome, pose: Pose): Figure {
  switch (g.plan) {
    case 'songbird':
      return songbird(g, pose, false);
    case 'owl':
      return pose.kind === 'perch' ? owlPerched(g) : songbird(g, pose, true);
    case 'raptor':
      return raptor(g, pose);
    case 'bat':
      return bat(g, pose);
    case 'butterfly':
      return lepidoptera(g, pose, false);
    case 'moth':
      return lepidoptera(g, pose, true);
    case 'dragonfly':
      return dragonfly(g, pose);
    case 'bee':
      return bee(g, pose);
    case 'firefly':
      return firefly();
    case 'hedgehog':
      return hedgehog(g, pose);
    default:
      return walker(g, pose);
  }
}

/* ------------------------------------------------------------------ birds */

/**
 * A songbird from the side, or an owl in flight, which is a songbird with a
 * big round head, a short tail and broad soft wings.
 */
function songbird(g: AnimalGenome, pose: Pose, owl: boolean): Figure {
  const s = new Sketch();
  const p = owl ? 1.22 : g.plump ?? 1;
  const hs = owl ? 1.25 : g.head ?? 1;
  const crestH = owl ? 0 : g.crest === 'crest' ? 8 : g.crest === 'tuft' ? 3.5 : 0;
  const hx = 20;
  const hy = -8;
  const H = (x: number, y: number): Pt => [hx + (x - hx) * hs, hy + (y - hy) * hs];
  const perched = pose.kind === 'perch';
  const flapping = pose.kind === 'fly';
  const tilt = perched ? -0.42 : -0.06;
  const R = (pts: Pt[]): Pt[] => rotatePts(pts, tilt);
  const Rp = (pt: Pt): Pt => rotatePts([pt], tilt)[0];

  // The outline, forehead round to chin.
  const outline: Pt[] = [
    H(30, -11),
    H(24, -17 - crestH),
    H(15, -15 - crestH * 0.5),
    H(10, -11),
    [-2, -11.5 * p],
    [-15, -8.5 * p],
    [-24, -3 * p],
    [-21, 5 * p],
    [-6, 10.5 * p],
    [9, 10 * p],
    H(23, 1),
    H(29, -5),
  ];
  const body = R(spline(outline, true, 5));

  // The tail, set at the rump and pointing back, down when perched.
  const tailKind = owl ? 'short' : g.tail ?? 'short';
  const tailLen = { short: owl ? 9 : 13, long: 25, fork: 20, cocked: 14, fan: 17 }[tailKind];
  const tailW = { short: 4.5, long: 3.6, fork: 5.5, cocked: 4, fan: 7 }[tailKind];
  const dir = tailKind === 'cocked' ? Math.PI + (perched ? 1.1 : 0.45) : Math.PI + (perched ? 0.22 : 0.04);
  const bt: Pt = [-21, -3 * p];
  const bb: Pt = [-19, 4 * p];
  const tc: Pt = [-20 + Math.cos(dir) * tailLen, 0.5 * p + Math.sin(dir) * tailLen];
  const nx = -Math.sin(dir);
  const ny = Math.cos(dir);
  const corner = (k: number): Pt => [tc[0] + nx * tailW * k, tc[1] + ny * tailW * k];
  let tail: Pt[];
  if (tailKind === 'fork') tail = [bt, corner(-1), [tc[0] - Math.cos(dir) * 6, tc[1] - Math.sin(dir) * 6], corner(1), bb];
  else if (tailKind === 'fan') tail = spline([bt, corner(-1), [tc[0] + Math.cos(dir) * 2.5, tc[1] + Math.sin(dir) * 2.5], corner(1), bb], true, 3);
  else tail = [bt, corner(-1), corner(1), bb];
  s.fill('tail', R(tail));
  // Two lines down the tail, the feathers' edges.
  s.line('wingLine', R([[-21, 0.5 * p], [tc[0] + nx * tailW * 0.3, tc[1] + ny * tailW * 0.3]]));

  s.fill('body', body);

  // The paler underside, and the markings, both clipped to the body.
  s.fill('belly', R(spline([H(28, -4), H(23, 1.5), [9, 10.5 * p], [-6, 11 * p], [-21, 5 * p], [-12, 3.5 * p], [2, 3 * p], H(18, -1)], true, 4)));
  if (owl) {
    const [ex, ey] = H(22, -9.5);
    s.add('belly', oval(...Rp([ex - 1, ey]), 7 * hs * 0.72, 7.5 * hs * 0.72));
  }
  if (!owl) {
    if (g.pattern === 'cap') s.fill('pattern', R(spline([H(31, -12), H(25, -19 - crestH), H(13, -16 - crestH * 0.5), H(8, -11), H(13, -8.5), H(24, -8.5), H(30, -8)], true, 4)));
    if (g.pattern === 'bib') s.fill('pattern', R(spline([H(30, -5), H(24, 2), [12, 9 * p], [6, 3 * p], H(18, -3.5), H(27, -6)], true, 4)));
    if (g.pattern === 'mask') s.fill('pattern', R(spline([H(32, -9.5), H(24, -11.8), H(13, -11), H(12, -7.5), H(22, -7), H(31, -6.5)], true, 4)));
    if (g.pattern === 'streaks') {
      for (let k = 0; k < 9; k++) {
        const x = 12 - k * 3.1;
        const y = (2.5 + (k % 2) * 2.6) * p;
        s.line('markLine', R([[x, y], [x - 1.1, y + 2.8]]));
      }
    }
  }
  // A couple of strokes of plumage on the flank and neck.
  s.line('detail', R([[-3, -2.5 * p], [-10, -0.5 * p], [-16, 2 * p]]));
  s.line('detail', R([H(13, -6), H(11, -2)]));

  // The beak.
  const top = H(30.5, -10.5);
  const gape = H(29, -5.5);
  const midY = (top[1] + gape[1]) / 2;
  const beakKind = owl ? 'hook' : g.beak ?? 'seed';
  let beak: Pt[];
  if (beakKind === 'thin') beak = [H(30.5, -9.8), [top[0] + 10 * hs, midY + 1.2], gape];
  else if (beakKind === 'long') beak = spline([H(30.5, -9.8), [top[0] + 9 * hs, midY - 0.2], [top[0] + 17 * hs, midY + 4], [top[0] + 8 * hs, midY + 1.8], gape], false, 3);
  else if (beakKind === 'hook') beak = spline([H(30.5, -9), [top[0] + 3.6, midY - 0.4], [top[0] + 3, midY + 3.2], gape], false, 3);
  else beak = [top, [top[0] + 4 * hs, top[1] + 0.8], [top[0] + 7.5 * hs, midY + 0.8], [gape[0] + 3.2 * hs, gape[1] - 0.2], gape];
  s.fill('dark', R(beak));

  // The eye: a dark bead with a point of light, or an owl's lit one.
  const eye = Rp(H(22, -9.5));
  const er = (owl ? 3 : 2.2) * hs * (owl ? 0.72 : 1);
  s.add('eye', oval(eye[0], eye[1], er, er));
  if (owl && g.eyeLit) s.add('dark', oval(eye[0] + 0.3, eye[1], er * 0.5, er * 0.5));
  s.add('shine', oval(eye[0] + er * 0.3, eye[1] - er * 0.35, er * 0.28, er * 0.28));

  const wingScale = (g.wing ?? 1) * (owl ? 1.12 : 1);
  if (flapping) {
    // Seen side on, a wing beat is the wing swinging from high over the back
    // to low under the belly, flat to the eye halfway.
    const e = Math.sin(pose.t * TAU) * 0.85 + 0.15;
    const Lw = 30 * wingScale;
    const broad = owl ? 1.35 : 1;
    const shoulder: Pt = [5, -8 * p];
    const shape = (elev: number, dx: number, dy: number): Pt[] => {
      const base: Pt[] = [
        [5 * broad, 1.5],
        [7, -Lw * 0.3],
        [3, -Lw * 0.72],
        [-3, -Lw],
        [-9 * broad, -Lw * 0.86],
        [-12 * broad, -Lw * 0.55],
        [-14 * broad, -Lw * 0.2],
        [-12 * broad, 2],
      ];
      return spline(
        base.map(([x, y]): Pt => [shoulder[0] + dx + x + y * 0.14 * (1 - elev), shoulder[1] + dy + y * elev]),
        true,
        4,
      );
    };
    s.fill('wingBack', R(shape(e * 0.92, 2.5, -1.5)));
    s.fill('wingFront', R(shape(e, 0, 0)));
    for (const k of [0.35, 0.6, 0.85]) {
      const a: Pt = [shoulder[0] - 4 * k, shoulder[1] - Lw * 0.3 * e];
      const b: Pt = [shoulder[0] - 6 - 4 * k + -Lw * 0.9 * 0.14 * (1 - e), shoulder[1] - Lw * (0.55 + 0.4 * k) * e];
      s.line('wingLine', R([a, b]));
    }
  } else {
    // Folded along the side, the long feathers crossing over the rump.
    const ext = (wingScale - 1) * 20;
    s.fill('wingFront', R(spline([[9, -9.5 * p], [-3, -10 * p], [-16, -6 * p], [-29 - ext, -0.5 * p], [-19, 3.5 * p], [-5, 5 * p], [6, 2 * p]], true, 5)));
    s.line('wingLine', R([[-12, -3.5 * p], [-26 - ext, -0.6 * p]]));
    s.line('wingLine', R([[-11, -1 * p], [-24 - ext, 1.4 * p]]));
    s.line('wingLine', R([[5, -3 * p], [-2, -2.2 * p], [-9, 0.5 * p]]));
    if (g.pattern === 'bars' && !owl) {
      s.add('wingMark', oval(...Rp([-3, -2.5 * p]), 1.2, 5.6, tilt + 0.35));
      s.add('wingMark', oval(...Rp([-9, -1.5 * p]), 1.2, 5.2, tilt + 0.35));
    }
  }

  if (perched) {
    // Legs straight down from the belly to the feet, which are the anchor.
    const hips = [Rp([-1, 9 * p]), Rp([3, 9 * p])];
    const footY = Math.max(hips[0][1], hips[1][1]) + 6;
    for (const [x, y] of hips) {
      s.line('legsFront', [[x, y], [x + 0.4, footY]]);
      s.line('legsFront', [[x - 2.4, footY + 0.4], [x + 3.6, footY]]);
    }
    return s.done([(hips[0][0] + hips[1][0]) / 2, footY], 62, { eyeLit: owl && g.eyeLit });
  }
  return s.done([0, 0], 62, { eyeLit: owl && g.eyeLit });
}

/** An owl on a branch, facing out of the page. */
function owlPerched(g: AnimalGenome): Figure {
  const s = new Sketch();
  const tuft = g.tufts ? 7 : 0;
  s.fill(
    'body',
    spline(
      [
        [0, -38],
        [7, -39.5],
        [11, -41 - tuft],
        [14.5, -34],
        [15.5, -24],
        [17, -12],
        [15, -1],
        [8, 7],
        [0, 9],
        [-8, 7],
        [-15, -1],
        [-17, -12],
        [-15.5, -24],
        [-14.5, -34],
        [-11, -41 - tuft],
        [-7, -39.5],
      ],
      true,
      5,
    ),
  );
  // The facial disc, and the paler breast.
  s.add('belly', oval(-6, -29, 7.6, 8.4));
  s.add('belly', oval(6, -29, 7.6, 8.4));
  s.add('belly', oval(0, -5, 10.5, 12));
  // Markings down the breast.
  for (let k = 0; k < 12; k++) {
    const x = -7 + (k % 4) * 4.6 + (Math.floor(k / 4) % 2) * 2.2;
    const y = -12 + Math.floor(k / 4) * 6;
    if (g.pattern === 'streaked') s.line('markLine', [[x, y], [x - 0.3, y + 3.4]]);
    else if (g.pattern === 'barred') s.line('markLine', [[x - 1.6, y + 1], [x + 1.6, y + 1.4]]);
    else if (g.pattern === 'spotted') s.add('pattern', oval(x, y + 1.2, 1.1, 1));
  }
  // Folded wings down either side.
  for (const k of [-1, 1]) {
    s.fill('wingFront', spline([[14.5 * k, -24], [17.5 * k, -12], [15.5 * k, -1], [10 * k, 6], [9.5 * k, -4], [11 * k, -16]], true, 4));
    s.line('wingLine', [[14.8 * k, -15], [11.6 * k, -9]]);
    s.line('wingLine', [[15.2 * k, -7], [11 * k, -1]]);
  }
  // Brows, the disc's rim, the eyes and the hooked beak.
  s.line('detail', [[-12, -35], [-1.5, -31.5]]);
  s.line('detail', [[12, -35], [1.5, -31.5]]);
  s.line('detail', spline([[-13, -27], [-10.5, -21.5], [-3, -22.5]], false, 3));
  s.line('detail', spline([[13, -27], [10.5, -21.5], [3, -22.5]], false, 3));
  for (const k of [-1, 1]) {
    s.add('eye', oval(5.6 * k, -29.5, 2.7, 2.6));
    if (g.eyeLit) s.add('dark', oval(5.6 * k, -29.5, 1.7, 1.7));
    s.add('shine', oval(5.6 * k + 0.7, -30.2, 0.5, 0.5));
  }
  s.fill('dark', [[-1.7, -26.8], [1.7, -26.8], [0, -22.3]]);
  // Talons on the branch.
  for (const x of [-4.5, -2.5, 2.5, 4.5]) s.line('legsFront', [[x, 7.5], [x + (x < 0 ? -0.6 : 0.6), 10.5]]);
  return s.done([0, 10], 50, { eyeLit: g.eyeLit });
}

/** A hawk seen from below, soaring: long broad wings with fingered tips. */
function raptor(g: AnimalGenome, pose: Pose): Figure {
  const s = new Sketch();
  const span = 56 * (g.wing ?? 1);
  const beat = pose.kind === 'fly' ? 0.72 + 0.28 * Math.cos(pose.t * TAU) : 1;
  const flex = 1 + 0.05 * Math.sin(pose.t * TAU);
  s.fill('tail', spline([[-13, -2.8], [-27, -7.5], [-31, -3], [-31.5, 0], [-31, 3], [-27, 7.5], [-13, 2.8]], true, 3));
  for (const k of [-1, 1]) {
    const w = span * beat;
    const f = flex;
    s.fill(
      'wingFront',
      spline(
        [
          [7, 3.5 * k],
          [4, w * 0.42 * k],
          [-1, w * 0.78 * k * f],
          [-3, w * 0.99 * k * f],
          [-6.5, w * 0.9 * k * f],
          [-8, w * 1.0 * k * f],
          [-10.5, w * 0.88 * k * f],
          [-12.5, w * 0.96 * k * f],
          [-14, w * 0.84 * k * f],
          [-16, w * 0.9 * k * f],
          [-17, w * 0.76 * k * f],
          [-18, w * 0.55 * k],
          [-16, w * 0.3 * k],
          [-11, 3.4 * k],
        ],
        true,
        3,
      ),
    );
    if (g.pattern === 'darktips') s.fill('wingMark', [[2, w * 0.74 * k], [-2, w * 1.05 * k], [-19, w * 0.95 * k], [-18, w * 0.7 * k]]);
    if (g.pattern === 'barred') {
      for (const u of [0.35, 0.55, 0.75]) s.line('wingLine', [[-2, w * u * k], [-15, w * (u - 0.02) * k]]);
    } else {
      s.line('wingLine', [[3, w * 0.4 * k], [-15, w * 0.5 * k]]);
    }
  }
  s.fill('body', spline([[16, 0], [13, -3], [4, -4.2], [-8, -3.6], [-15, -2.4], [-15, 2.4], [-8, 3.6], [4, 4.2], [13, 3]], true, 4));
  if (g.pattern === 'pale') s.add('belly', oval(1, 0, 9, 3));
  if (g.pattern === 'barred') for (const x of [-21, -25.5]) s.line('markLine', [[x, -5.5], [x, 5.5]]);
  s.fill('dark', [[16.4, -1], [18.6, 0.2], [16.4, 1.2]]);
  return s.done([0, 0], span * 2, { planform: true });
}

/** A bat against the dusk, wings spread. */
function bat(g: AnimalGenome, pose: Pose): Figure {
  const s = new Sketch();
  const e = Math.sin(pose.t * TAU);
  const ears = g.ears ?? 1;
  for (const k of [-1, 1]) {
    const tipY = -2 - 14 * e;
    const wristY = -5 - 9 * e;
    const wing: Pt[] = [
      [3.5 * k, -3],
      [16 * k, wristY],
      [34 * k, tipY],
      [27 * k, tipY * 0.35 + 7],
      [30 * k, tipY * 0.2 + 12],
      [22 * k, 8.5],
      [21 * k, tipY * 0.1 + 15],
      [12 * k, 9.5],
      [4.5 * k, 8],
    ];
    s.fill('wingFront', spline(wing, true, 3));
    for (const tip of [wing[2], wing[4], wing[6]]) s.line('wingLine', [wing[1], tip]);
    s.fill('body', [[3.2 * k, -8], [4.6 * k, -8 - 6 * ears], [0.8 * k, -9.4]]);
  }
  s.add('body', oval(0, 2, 4.2, 7.5));
  s.add('body', oval(0, -6.5, 3.8, 3.4));
  s.add('shine', oval(-1.4, -7, 0.55, 0.55));
  s.add('shine', oval(1.4, -7, 0.55, 0.55));
  return s.done([0, 0], 68, { planform: true });
}

/* ---------------------------------------------------------------- insects */

/** A butterfly or a moth from above, head up, wings clapping. */
function lepidoptera(g: AnimalGenome, pose: Pose, moth: boolean): Figure {
  const s = new Sketch();
  const fw = g.fore ?? 1;
  const hw = g.hind ?? 1;
  const open = 0.14 + 0.86 * Math.abs(Math.cos(pose.t * Math.PI));
  const X = (pts: Pt[], k: number): Pt[] => pts.map(([x, y]) => [x * open * k, y]);
  const fore: Pt[] = moth
    ? [[1.8, -9], [12, -18], [31 * fw, -21 * fw], [29 * fw, -13], [14, -3], [3, -3]]
    : [[1.5, -9], [8, -19], [22 * fw, -27 * fw], [29 * fw, -24 * fw], [27 * fw, -14], [18, -5], [3, -4]];
  const hind: Pt[] = moth
    ? [[2.5, -3], [14, -1], [21 * hw, 5], [17 * hw, 12 * hw], [8, 11], [2.5, 3]]
    : g.tails
      ? [[2.5, -4], [14, -3], [23 * hw, 3], [22 * hw, 12 * hw], [17 * hw, 17 * hw], [15 * hw, 27 * hw], [12 * hw, 18 * hw], [7, 14], [2.5, 4]]
      : [[2.5, -4], [14, -3], [23 * hw, 3], [22 * hw, 12 * hw], [16 * hw, 18 * hw], [7, 14], [2.5, 4]];
  for (const k of [-1, 1]) s.fill('wingFront', spline(X(hind, k), true, 4));
  for (const k of [-1, 1]) s.fill('wingFront', spline(X(fore, k), true, 4));

  for (const k of [-1, 1]) {
    const M = (pts: Pt[]) => X(pts, k);
    if (g.pattern === 'eyespot') {
      s.add('wingMark', oval(15 * hw * open * k, 8 * hw, 4.2 * Math.max(0.3, open), 4.2));
      s.add('dark', oval(15 * hw * open * k, 8 * hw, 1.8 * Math.max(0.3, open), 1.8));
    }
    if (g.pattern === 'band') {
      s.fill(
        'wingMark',
        M(spline(moth ? [[12, -8], [20 * fw, -14], [26 * fw, -18 * fw], [27 * fw, -15.5 * fw], [20 * fw, -11], [13, -5.8]] : [[9, -11], [25 * fw, -23 * fw], [27.5 * fw, -18 * fw], [12, -6.5]], true, 3)),
      );
    }
    if (g.pattern === 'tip') s.fill('wingMark', M([[18 * fw, -26 * fw], [31 * fw, -26 * fw], [30 * fw, -17 * fw], [21 * fw, -17]]));
    if (g.pattern === 'margin') {
      for (const [x, y] of [[25 * fw, -21], [26 * fw, -16], [22, -10], [20 * hw, 6], [18 * hw, 12], [13 * hw, 15]] as Pt[]) {
        s.add('shine', oval(x * open * k, y, 1.2 * Math.max(0.35, open), 1.2));
      }
    }
    if (g.pattern === 'veins' || moth) {
      for (const [x, y] of [[22 * fw, -23], [26 * fw, -17], [20, -9]] as Pt[]) s.line('wingLine', M([[3, -8], [x, y]]));
      for (const [x, y] of [[20 * hw, 4], [17 * hw, 12]] as Pt[]) s.line('wingLine', M([[3, -2], [x, y]]));
    }
  }

  // The body: slender and dark for a butterfly, thick and furred for a moth.
  const bodyLayer = moth ? 'body' : 'dark';
  s.add(bodyLayer, oval(0, 5.5, moth ? 3.3 : 2, moth ? 10 : 11));
  s.add(bodyLayer, oval(0, -6, moth ? 3.8 : 2.6, 4.6));
  s.add(bodyLayer, oval(0, -11.8, 2.3, 2.1));
  if (moth) for (const y of [0, 4, 8, 12]) s.line('detail', [[-2.6, y], [2.6, y + 0.6]]);
  for (const k of [-1, 1]) {
    if (moth) {
      const a: Pt = [1.2 * k, -13];
      const b: Pt = [9 * k, -23];
      s.line('antenna', [a, b]);
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        s.line('antenna', [[x, y], [x + 2.2 * k, y + 0.8]]);
        s.line('antenna', [[x, y], [x - 0.6 * k, y - 1.8]]);
      }
    } else {
      s.line('antenna', spline([[1 * k, -13.5], [4 * k, -21], [7 * k, -27]], false, 3));
      s.add('dark', oval(7.2 * k, -27.6, 1.2, 1.6));
    }
  }
  return s.done([0, 0], 60, { planform: true });
}

/** A dragonfly from above: four glass wings, a long jointed body. */
function dragonfly(g: AnimalGenome, pose: Pose): Figure {
  const s = new Sketch();
  const flick = Math.sin(pose.t * TAU) * 0.08;
  for (const k of [-1, 1]) {
    const fore = rotatePts(spline([[2, -8], [14, -11.5], [30, -12], [34, -10], [30, -7.5], [14, -6], [2, -5.5]], true, 3), flick * k, 2, -7);
    const hind = rotatePts(spline([[2, -3.5], [14, -5], [29, -3], [32, 0], [28, 2], [14, 0], [2, -1]], true, 3), -flick * k, 2, -2);
    const flip = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x * k, y]);
    s.fill('wingFront', flip(fore));
    s.fill('wingFront', flip(hind));
    s.line('wingLine', flip([[3, -7], [32, -10]]));
    s.line('wingLine', flip([[3, -2.5], [30, -1]]));
    s.add('dark', oval(29.5 * k, -10.6, 1.5, 0.8, 0));
    s.add('dark', oval(28 * k, -2.4, 1.4, 0.8, 0));
  }
  s.fill('body', [[-1.4, -2], [1.4, -2], [1.2, 20], [0.9, 40], [0, 44], [-0.9, 40], [-1.2, 20]]);
  for (let y = 6; y <= 40; y += 5) s.line('detail', [[-1.1, y], [1.1, y]]);
  if (g.pattern === 'banded') for (let y = 8; y <= 38; y += 10) s.add('band', oval(0, y, 1.6, 1.8));
  s.add('body', oval(0, -6, 3.2, 4.8));
  s.add('body', oval(0, -12.5, 4.4, 3.2));
  s.add('eye', oval(-2.4, -12.8, 2.3, 2.4));
  s.add('eye', oval(2.4, -12.8, 2.3, 2.4));
  return s.done([0, 0], 70, { planform: true, glass: true, eyeLit: true });
}

/** A bee, side on. */
function bee(g: AnimalGenome, pose: Pose): Figure {
  const s = new Sketch();
  const flick = Math.sin(pose.t * TAU);
  s.add('wingBack', oval(-0.5, -4.6, 4.4, 1.9, -0.9 + flick * 0.35));
  s.add('body', oval(-4, 0.5, 6.2, 4.8, 0.15));
  for (let k = 0; k < (g.bands ?? 2); k++) s.add('band', oval(-2.5 - k * 2.9, 0.5, 1.1, 5.2, 0.15));
  s.add('body', oval(3.4, -0.6, 3.6, 3.5));
  s.add('dark', oval(7.8, 0.4, 2.3, 2.6));
  for (const x of [1.5, 3.5, 5.5]) s.line('detail', [[x, -3.6], [x + 0.3, -4.6]]);
  s.fill('dark', [[-10, 1], [-11.8, 1.8], [-10, 2.2]]);
  s.add('wingFront', oval(1.5, -5.2, 5, 2.2, -0.45 + flick * 0.35));
  for (const [a, b] of [[[3, 2.6], [2, 6]], [[5, 2.4], [5.6, 5.8]], [[0.5, 3], [-1.5, 6]]] as [Pt, Pt][]) s.line('legsFront', [a, b]);
  s.line('antenna', [[8.8, -1.6], [10, -4.5], [11.6, -5.2]]);
  return s.done([0, 0], 20, { glass: true });
}

/** A firefly: next to nothing, and a light. */
function firefly(): Figure {
  const s = new Sketch();
  s.add('glow', oval(0, 4.5, 11, 11));
  s.add('body', oval(0, 0, 2.3, 5.2));
  s.line('detail', [[0, -3], [0, 4]]);
  s.add('dark', oval(0, -5.8, 1.7, 1.5));
  s.add('light', oval(0, 4, 1.9, 2.1));
  s.line('antenna', [[-0.6, -7], [-2.2, -9.6]]);
  s.line('antenna', [[0.6, -7], [2.2, -9.6]]);
  return s.done([0, 0], 12, { planform: true });
}

/* ---------------------------------------------------------------- walkers */

interface WalkerSpec {
  bodyL: number;
  bodyH: number;
  legL: number;
  legW: number;
  neckL: number;
  /** The neck's heading standing up, radians: negative is up. */
  neckUp: number;
  headL: number;
  headH: number;
  /** 0 a blunt face, 1 a long pointed one. */
  snout: number;
  ear: 'leaf' | 'point' | 'long';
  earL: number;
  tail: 'flag' | 'brush' | 'puff';
  tailL: number;
  stride: number;
}

const WALKERS: Record<'deer' | 'fox' | 'hare', WalkerSpec> = {
  deer: { bodyL: 48, bodyH: 19, legL: 34, legW: 3.2, neckL: 17, neckUp: -1.0, headL: 14, headH: 7.5, snout: 0.55, ear: 'leaf', earL: 8, tail: 'flag', tailL: 7, stride: 0.42 },
  fox: { bodyL: 40, bodyH: 13, legL: 16, legW: 2.8, neckL: 7, neckUp: -0.5, headL: 14, headH: 8, snout: 0.85, ear: 'point', earL: 7.5, tail: 'brush', tailL: 30, stride: 0.5 },
  hare: { bodyL: 26, bodyH: 15, legL: 10, legW: 2.6, neckL: 3, neckUp: -0.8, headL: 10, headH: 8, snout: 0.3, ear: 'long', earL: 17, tail: 'puff', tailL: 4, stride: 0.35 },
};

/**
 * A deer, a fox or a hare, side on. One outline from the chest up the neck,
 * round the head and back along the spine; four legs on a walk that moves
 * one foot at a time; and the body let down until its lowest foot is on the
 * ground, which is the anchor.
 */
function walker(g: AnimalGenome, pose: Pose): Figure {
  const s = new Sketch();
  const spec = WALKERS[g.plan as 'deer' | 'fox' | 'hare'];
  const { bodyL: L, bodyH: B, legL, legW, neckL, headL, headH, snout } = spec;
  const cx = 0;
  const cy = -(legL + B * 0.5);
  const grazing = pose.kind === 'graze';
  const standing = pose.kind === 'stand' || grazing;
  const hopping = pose.kind === 'hop';

  // Neck and head.
  const neckA = grazing ? 0.9 : spec.neckUp;
  const headA = grazing ? 1.45 : spec.neckUp + (g.plan === 'deer' ? 1.35 : g.plan === 'fox' ? 0.75 : 0.95);
  const root: Pt = [cx + L * 0.38, cy - B * 0.2];
  const joint: Pt = [root[0] + Math.cos(neckA) * neckL, root[1] + Math.sin(neckA) * neckL];
  const hp = (x: number, y: number): Pt => {
    const c = Math.cos(headA);
    const sn = Math.sin(headA);
    return [joint[0] + x * c - y * sn, joint[1] + x * sn + y * c];
  };
  const perp: Pt = [-Math.sin(neckA), Math.cos(neckA)];
  const neckW = B * (g.plan === 'deer' ? 0.28 : 0.4);
  const outline: Pt[] = [
    [cx + L * 0.5, cy + B * 0.05],
    [root[0] + Math.cos(neckA) * neckL * 0.55 + perp[0] * neckW, root[1] + Math.sin(neckA) * neckL * 0.55 + perp[1] * neckW],
    hp(-headL * 0.05, headH * 0.38),
    hp(headL * 0.32, headH * 0.52),
    hp(headL * 0.85, headH * 0.34 * (1 - snout * 0.5)),
    hp(headL * 1.06, headH * 0.02 * (1 - snout)),
    hp(headL * 0.98, -headH * 0.42 * (1 - snout * 0.55)),
    hp(headL * 0.4, -headH * 0.56),
    hp(-headL * 0.02, -headH * 0.5),
    [root[0] + Math.cos(neckA) * neckL * 0.5 - perp[0] * neckW, root[1] + Math.sin(neckA) * neckL * 0.5 - perp[1] * neckW],
    [cx + L * 0.24, cy - B * 0.52],
    [cx - L * 0.05, cy - B * 0.45],
    [cx - L * 0.4, cy - B * 0.48],
    [cx - L * 0.52, cy - B * 0.18],
    [cx - L * 0.46, cy + B * 0.3],
    [cx - L * 0.05, cy + B * 0.5],
    [cx + L * 0.3, cy + B * 0.45],
  ];

  // Legs. A walk moves one foot at a time, a quarter of a stride apart.
  type Leg = { hip: Pt; fore: boolean; off: number; near: boolean };
  const legs: Leg[] = [
    { hip: [cx - L * 0.33, cy + B * 0.05], fore: false, off: 0.5, near: false },
    { hip: [cx + L * 0.3, cy + B * 0.1], fore: true, off: 0.75, near: false },
    { hip: [cx - L * 0.33, cy + B * 0.05], fore: false, off: 0, near: true },
    { hip: [cx + L * 0.3, cy + B * 0.1], fore: true, off: 0.25, near: true },
  ];
  const up = legL * 0.52;
  const lo = legL * 0.58;
  const built = legs.map((leg) => {
    const phi = (pose.t + leg.off) * TAU;
    let swing = standing ? 0 : Math.sin(phi) * spec.stride;
    let bend = (leg.fore ? -1 : 1) * (0.28 + (standing ? 0 : 0.55 * Math.max(0, Math.cos(phi))));
    if (hopping) {
      const reach = Math.sin(pose.t * Math.PI);
      swing = leg.fore ? 0.5 * reach : -0.9 * reach + 0.2;
      bend = leg.fore ? -0.2 : 0.9 - 0.7 * reach;
    }
    const a1 = Math.PI / 2 + swing * 0.8;
    const a2 = a1 + bend;
    const hip: Pt = [leg.hip[0] + (leg.near ? 0 : 2.2), leg.hip[1]];
    const knee: Pt = [hip[0] + Math.cos(a1) * up, hip[1] + Math.sin(a1) * up];
    const foot: Pt = [knee[0] + Math.cos(a2) * lo, knee[1] + Math.sin(a2) * lo];
    return { leg, hip, knee, foot, a1, a2 };
  });
  // Let the body down onto its lowest foot.
  const drop = -Math.max(...built.map((b) => b.foot[1]));
  const D = (pt: Pt): Pt => [pt[0], pt[1] + drop];

  for (const b of built) {
    const layer = b.leg.near ? 'legsFront' : 'legsBack';
    const w1 = legW * (b.leg.fore ? 0.8 : 1.05);
    const w2 = legW * 0.42;
    const w3 = legW * 0.3;
    const n1: Pt = [-Math.sin(b.a1), Math.cos(b.a1)];
    const n2: Pt = [-Math.sin(b.a2), Math.cos(b.a2)];
    const shape: Pt[] = [
      [b.hip[0] + n1[0] * w1, b.hip[1] + n1[1] * w1],
      [b.knee[0] + n1[0] * w2, b.knee[1] + n1[1] * w2],
      [b.foot[0] + n2[0] * w3, b.foot[1] + n2[1] * w3],
      [b.foot[0] - n2[0] * w3, b.foot[1] - n2[1] * w3],
      [b.knee[0] - n1[0] * w2, b.knee[1] - n1[1] * w2],
      [b.hip[0] - n1[0] * w1, b.hip[1] - n1[1] * w1],
    ];
    s.fill(layer, spline(shape.map(D), true, 3));
    if (g.plan === 'fox' && g.socks) {
      const mid: Pt = [(b.knee[0] + b.foot[0]) / 2, (b.knee[1] + b.foot[1]) / 2];
      s.fill('dark', ([
        [mid[0] + n2[0] * w2 * 0.8, mid[1] + n2[1] * w2 * 0.8],
        [b.foot[0] + n2[0] * w3, b.foot[1] + n2[1] * w3],
        [b.foot[0] - n2[0] * w3, b.foot[1] - n2[1] * w3],
        [mid[0] - n2[0] * w2 * 0.8, mid[1] - n2[1] * w2 * 0.8],
      ] as Pt[]).map(D));
    } else if (g.plan === 'deer') {
      s.add('dark', oval(...D(b.foot), w3 * 1.1, w3 * 1.3, b.a2));
    }
  }

  // The tail, behind the body.
  const set: Pt = [cx - L * 0.5, cy - B * 0.2];
  if (spec.tail === 'flag') {
    s.fill('tail', spline([set, [set[0] - 3, set[1] - B * 0.42], [set[0] - 6.5, set[1] - B * 0.2], [set[0] - 3, set[1] + B * 0.12]], true, 3).map(D));
  } else if (spec.tail === 'brush') {
    const line: Pt[] = [set, [set[0] - 9, set[1] + B * 0.55], [set[0] - 21, set[1] + B * 0.72], [set[0] - spec.tailL, set[1] + B * 0.35]];
    const widths = [2.6, 5.5, 6, 2];
    const top: Pt[] = [];
    const bottom: Pt[] = [];
    for (let i = 0; i < line.length; i++) {
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      top.push([line[i][0] - Math.sin(ang) * widths[i], line[i][1] + Math.cos(ang) * widths[i]]);
      bottom.unshift([line[i][0] + Math.sin(ang) * widths[i], line[i][1] - Math.cos(ang) * widths[i]]);
    }
    const brush = spline([...top, [line[3][0] - 2, line[3][1] - 0.5], ...bottom], true, 3).map(D);
    s.fill('tail', brush);
    s.add('pattern', oval(...D([set[0] - spec.tailL + 3, set[1] + B * 0.38]), 5, 4.2));
    s.line('detail', line.slice(1).map(D));
  }

  s.fill('body', spline(outline, true, 4).map(D));

  // Ears, set behind the crown.
  const earBase = hp(headL * 0.02, -headH * 0.45);
  if (spec.ear === 'leaf') {
    const ear = spline([earBase, [earBase[0] - 3, earBase[1] - 3.5], [earBase[0] - 9, earBase[1] - 5], [earBase[0] - 4, earBase[1] - 0.5]], true, 3);
    s.fill('body', ear.map(D));
    s.fill('belly', movePts(ear, 0.4, 0.3).map(D));
  } else if (spec.ear === 'point') {
    s.fill('body', ([earBase, [earBase[0] - 0.5, earBase[1] - spec.earL], [earBase[0] + 4.5, earBase[1] - 0.2]] as Pt[]).map(D));
    s.fill('body', ([[earBase[0] - 3, earBase[1] + 0.5], [earBase[0] - 4, earBase[1] - spec.earL + 0.8], [earBase[0] + 1, earBase[1]]] as Pt[]).map(D));
  } else {
    const ears = (g.ears ?? 1) * spec.earL;
    const e1: Pt = [earBase[0] - ears * 0.3, earBase[1] - ears * 0.55];
    s.add('body', oval(...D(e1), 2.6, ears * 0.55, -0.45));
    s.add('body', oval(...D([e1[0] - 2.5, e1[1] + 1]), 2.3, ears * 0.5, -0.65));
    if (g.pattern === 'eartips') {
      const tip: Pt = [earBase[0] - ears * 0.3 - Math.sin(0.45) * ears * 0.45, earBase[1] - ears * 0.55 - Math.cos(0.45) * ears * 0.45];
      s.add('pattern', oval(...D(tip), 2.4, 3, -0.45));
    }
  }

  // Markings.
  if (g.plan === 'deer') {
    s.add('belly', oval(...D([cx - L * 0.47, cy - B * 0.08]), 4.5, 8));
    s.add('belly', oval(...D([cx + L * 0.1, cy + B * 0.45]), L * 0.32, B * 0.18));
    if (g.pattern === 'spots') {
      for (let k = 0; k < 9; k++) s.add('shine', oval(...D([cx - L * 0.32 + k * 4.4, cy - B * 0.28 + (k % 2) * 3.4]), 1, 0.9));
    }
  } else if (g.plan === 'fox') {
    s.fill('belly', spline([hp(headL * 0.5, headH * 0.5), hp(headL * 0.95, headH * 0.2), hp(headL * 0.45, headH * 0.05), [root[0] + 2, root[1] + B * 0.25], [cx + L * 0.48, cy + B * 0.3], [cx + L * 0.3, cy + B * 0.45]], true, 3).map(D));
  } else {
    s.add('belly', oval(...D([cx + L * 0.05, cy + B * 0.32]), L * 0.3, B * 0.22));
    s.add('shine', oval(...D([set[0] - 1, set[1] + 1]), 3.4, 3));
  }
  // A line of fur along the flank, the shoulder, the haunch.
  s.line('detail', spline([[cx + L * 0.2, cy - B * 0.1], [cx + L * 0.26, cy + B * 0.25], [cx + L * 0.2, cy + B * 0.42]], false, 3).map(D));
  s.line('detail', spline([[cx - L * 0.22, cy - B * 0.3], [cx - L * 0.36, cy + B * 0.05], [cx - L * 0.3, cy + B * 0.3]], false, 3).map(D));

  // Antlers: a beam up and back from the crown, a tine for each point.
  if (g.plan === 'deer' && (g.antlers ?? 0) > 0) {
    for (const dx of [0, 2]) {
      const b0 = hp(headL * 0.1 + dx * 0.3, -headH * 0.5);
      const beam: Pt[] = [b0, [b0[0] - 3 + dx, b0[1] - 8], [b0[0] - 1 + dx, b0[1] - 15], [b0[0] + 3 + dx, b0[1] - 19]];
      s.line('horn', spline(beam, false, 3).map(D));
      for (let k = 0; k < (g.antlers ?? 0); k++) {
        const at = beam[Math.min(beam.length - 1, k + 1)];
        s.line('horn', ([at, [at[0] + 4.5, at[1] - 3.2]] as Pt[]).map(D));
      }
    }
  }

  // Eye and nose.
  const eye = hp(headL * 0.42, -headH * 0.14);
  s.add('dark', oval(...D(eye), g.plan === 'deer' ? 1.4 : 1.1, g.plan === 'deer' ? 1.3 : 1));
  s.add('shine', oval(...D([eye[0] + 0.4, eye[1] - 0.4]), 0.35, 0.35));
  s.add('dark', oval(...D(hp(headL * 1.03, -headH * 0.12 * (1 - snout))), 1.3, 1.1));
  return s.done([0, 0], L);
}

/** A hedgehog: a dome of spines on four small feet, snout first. */
function hedgehog(g: AnimalGenome, pose: Pose): Figure {
  const s = new Sketch();
  const shuffle = pose.kind === 'walk' ? Math.sin(pose.t * TAU) : 0;
  const bob = Math.abs(shuffle) * 0.4;
  for (const [x, k] of [[-7, 0], [6, 0.5], [-5, 0.25], [8, 0.75]] as [number, number][]) {
    const swing = pose.kind === 'walk' ? Math.sin((pose.t + k) * TAU) * 1.6 : 0;
    s.line(k === 0 || k === 0.5 ? 'legsBack' : 'legsFront', [[x, -3.2 - bob], [x + swing, 0]]);
  }
  const dome = spline([[-13, -2.5 - bob], [-12, -9 - bob], [-4, -14 - bob], [6, -13 - bob], [12, -7 - bob], [13, -2.5 - bob], [0, -1.2 - bob]], true, 5);
  // The face and snout, pale, under the brim of spines.
  // The face and snout, under the brim of spines: part of the body, so the
  // nose sits on the end of it, with the pale of the face inside.
  s.fill('body', spline([[8, -8 - bob], [15, -5.6 - bob], [19.8, -3.3 - bob], [15.5, -1.4 - bob], [8, -1.8 - bob]], true, 3));
  s.fill('belly', spline([[10, -7 - bob], [15, -5 - bob], [18, -3.4 - bob], [14, -2.2 - bob], [10, -2.6 - bob]], true, 3));
  s.fill('body', dome);
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + (i / 25) * Math.PI;
    const r0 = 6 + (i % 3);
    const x0 = Math.cos(a) * r0 * 1.4;
    const y0 = -7 - bob + Math.sin(a) * r0 * 0.9;
    s.line('detail', [[x0, y0], [x0 + Math.cos(a - 0.35) * 5, y0 + Math.sin(a - 0.35) * 4.2]]);
  }
  s.add('dark', oval(19.4, -3.1 - bob, 1.1, 1));
  s.add('dark', oval(13, -5.6 - bob, 0.9, 0.9));
  s.add('body', oval(10.5, -8.8 - bob, 1.6, 1.4));
  return s.done([0, 0], 26);
}

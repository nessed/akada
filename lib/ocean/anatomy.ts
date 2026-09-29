/**
 * A genome turned into a body, in the creature's own units.
 *
 * Every creature is built as a set of layers of plain shapes (outlines,
 * strokes and discs), each layer drawn later in one style: the body wash,
 * the fins, the tentacles, the pattern, the glowing dots. Bilateral animals
 * are built along a spine from tail (x = 0) to head (x = 100), facing right;
 * radial ones around their own middle. Nothing here knows about pixels or a
 * canvas, so the same body can be drawn at any size, or tested for sense.
 */

import type { Genome } from './genome';
import { mulberry32, range } from './random';

export type LayerName =
  | 'glowBack'
  | 'tentB'
  | 'legs'
  | 'fin'
  | 'finRay'
  | 'body'
  | 'guts'
  | 'gutFill'
  | 'pat'
  | 'patLine'
  | 'detail'
  | 'tentF'
  | 'beads'
  | 'dotGlow'
  | 'dots'
  | 'eye'
  | 'pupil'
  | 'lure';

export const LAYERS: LayerName[] = [
  'glowBack', 'tentB', 'legs', 'fin', 'finRay', 'body', 'guts', 'gutFill', 'pat', 'patLine',
  'detail', 'tentF', 'beads', 'dotGlow', 'dots', 'eye', 'pupil', 'lure',
];

export type Shape =
  | { kind: 'path'; pts: number[]; close: boolean }
  | { kind: 'disc'; x: number; y: number; rx: number; ry: number };

export interface Anatomy {
  layers: Record<LayerName, Shape[]>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function buildAnatomy(g: Genome, seed: number): Anatomy {
  const r = mulberry32(seed * 104729 + 7);
  const rr = (a: number, b: number) => range(r, a, b);
  const layers = Object.fromEntries(LAYERS.map((k) => [k, [] as Shape[]])) as Record<LayerName, Shape[]>;
  const P = (layer: LayerName, pts: [number, number][], close = false) => {
    if (pts.length < 2) return;
    const flat: number[] = [];
    for (const [x, y] of pts) flat.push(x, y);
    layers[layer].push({ kind: 'path', pts: flat, close });
  };
  const C = (layer: LayerName, x: number, y: number, rx: number, ry = rx) =>
    layers[layer].push({ kind: 'disc', x, y, rx, ry });
  const TAU = Math.PI * 2;

  if (g.plan === 'bell') {
    const bw = g.bw!, bh = g.bh!;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI - (i / 40) * Math.PI;
      const x = Math.cos(a) * bw;
      const peak = g.cap && Math.abs(x) < bw * 0.3 ? 1.12 : 1;
      pts.push([x, bh - Math.pow(Math.max(0, Math.sin(a)), g.shape!) * bh * peak]);
    }
    const n = Math.max(1, g.lobes!);
    for (let i = 1; i <= n * 4; i++) {
      const x = bw - (i / (n * 4)) * 2 * bw;
      const dip = g.lobes ? Math.abs(Math.sin((i / 4) * Math.PI)) * Math.min(6, bw * 0.12) : 0;
      pts.push([x, bh + dip]);
    }
    P('body', pts, true);
    C('glowBack', 0, bh * 0.55, bw * 1.3, bh * 1.1);
    for (let i = 0; i < g.canals!; i++) {
      const x = -bw * 0.85 + (i / Math.max(1, g.canals! - 1)) * bw * 1.7;
      P('detail', [[x * 0.08, bh * 0.2], [x * 0.6, bh * 0.45], [x, bh - 1]]);
    }
    P('detail', [[-bw * 0.85, bh], [-bw * 0.5, bh * 0.55], [0, bh * 0.45], [bw * 0.5, bh * 0.55], [bw * 0.85, bh]]);
    for (let i = 0; i < g.rings!; i++) {
      const a = (i / g.rings!) * TAU + 0.4;
      const m = Math.min(bw, bh);
      C('pat', Math.cos(a) * bw * 0.28, bh * 0.62 + Math.sin(a) * bh * 0.14, m * 0.1, m * 0.07);
    }
    for (let i = 0; i < g.tentN!; i++) {
      const x0 = -bw * 0.92 + (i / Math.max(1, g.tentN! - 1)) * bw * 1.84;
      const L = g.tentL! * rr(0.7, 1);
      const ph = rr(0, TAU);
      const line: [number, number][] = [];
      for (let s = 0; s <= L; s += 3) {
        let x = x0 + x0 * 0.12 * (s / L);
        let y = bh + s;
        if (g.tentStyle === 'wavy') x += Math.sin(s / 14 + ph) * 5 * Math.min(1, s / 20);
        if (g.tentStyle === 'coiled') {
          x += Math.cos(s / 4 + ph) * 3 * (s / L);
          y -= Math.sin(s / 4 + ph) * 2 * (s / L);
        }
        line.push([x, y]);
      }
      P('tentB', line);
      if (g.tentStyle === 'beaded') for (let j = 4; j < line.length; j += 5) C('beads', line[j][0], line[j][1], 1.2);
      if (g.lit && i % 2 === 0 && line.length) {
        const e = line[line.length - 1];
        C('dotGlow', e[0], e[1], 3);
        C('dots', e[0], e[1], 1.2);
      }
    }
    for (let i = 0; i < g.arms!; i++) {
      const x0 = (i - (g.arms! - 1) / 2) * bw * 0.12;
      const L = g.tentL! * g.armL!;
      const ph = rr(0, TAU);
      const left: [number, number][] = [];
      const right: [number, number][] = [];
      for (let s = 0; s <= L; s += 3) {
        const x = x0 + Math.sin(s / 20 + ph) * 6 + (x0 * s) / 60;
        const w = bw * 0.12 * (1 - s / L) * (0.4 + 0.6 * Math.abs(Math.cos(s / 12 + ph))) + 0.5;
        left.push([x - w - Math.abs(Math.sin(s / 2.5)) * 1.2, bh - 2 + s]);
        right.unshift([x + w, bh - 2 + s]);
      }
      P('fin', left.concat(right), true);
    }
    if (g.lit) {
      for (let i = 0; i < 10; i++) {
        const x = -bw + (i / 9) * 2 * bw;
        C('dotGlow', x, bh + 1, 3);
        C('dots', x, bh + 1, 1.1);
      }
    }
  } else if (g.plan === 'comb') {
    const ow = g.ow!, oh = g.oh!;
    const pts: [number, number][] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const wob = g.lobed ? 1 + 0.12 * Math.cos(a * 2) : 1;
      pts.push([Math.cos(a) * ow * wob, Math.sin(a) * oh]);
    }
    P('body', pts, true);
    const rows = g.rows!;
    for (let k = 0; k < rows; k++) {
      const u = (k / (rows - 1 || 1)) * 2 - 1;
      const row: [number, number][] = [];
      for (let i = 0; i <= 14; i++) {
        const a = -Math.PI / 2 + (i / 14) * Math.PI;
        const x = u * ow * 0.9 * Math.cos(a);
        const y = Math.sin(a) * oh * 0.92;
        row.push([x, y]);
        if (i % 2 === 0 && i > 0 && i < 14) {
          C('dotGlow', x, y, 2.4);
          C('dots', x, y, 1);
        }
      }
      P('detail', row);
    }
    C('gutFill', 0, oh * 0.1, ow * 0.25, oh * 0.3);
    if (g.feathers) {
      for (const side of [-1, 1]) {
        const line: [number, number][] = [];
        for (let s = 0; s <= g.featherL!; s += 3) {
          const x = side * (ow * 0.5 + s * 0.35) + Math.sin(s / 16) * 5;
          const y = oh * 0.3 + s;
          line.push([x, y]);
          if (s % 9 === 0 && s > 6) P('tentB', [[x, y], [x + side * 7, y + 5]]);
        }
        P('tentB', line);
      }
    }
  } else if (g.plan === 'star') {
    const pts: [number, number][] = [];
    const n = g.armsN!;
    const W = g.starW!, L = g.starL!;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU - Math.PI / 2;
      const side: [number, number][] = [];
      const back: [number, number][] = [];
      for (let s = 0; s <= 1.0001; s += 0.08) {
        const a = a0 + g.curl! * s * s;
        const d = W * 0.9 + s * L;
        const w = W * (1 - s * 0.85);
        const px = Math.cos(a) * d;
        const py = Math.sin(a) * d;
        const nx = Math.cos(a + Math.PI / 2);
        const ny = Math.sin(a + Math.PI / 2);
        side.push([px + nx * w, py + ny * w]);
        back.unshift([px - nx * w, py - ny * w]);
        if (g.feet && s > 0.1 && s < 0.9) C('pat', px, py, 0.9);
        if (g.spines && s > 0.05) P('detail', [[px + nx * w, py + ny * w], [px + nx * (w + 3), py + ny * (w + 3)]]);
      }
      pts.push(...side, ...back);
    }
    P('body', pts, true);
    C('pat', 0, 0, W * 0.5);
  } else if (g.plan === 'chain') {
    let x = 0;
    let y = 0;
    let a = Math.PI / 2 + g.bend! * 0.3;
    const u = g.unit!;
    if (g.float) {
      C('body', 0, -u * 1.2, u * 1.1, u * 0.8);
      C('dotGlow', 0, -u * 1.2, u);
    }
    for (let i = 0; i < g.units!; i++) {
      C('body', x, y, u * 0.8, u * 0.6);
      C('detail', x, y, u * 0.4, u * 0.3);
      const line: [number, number][] = [];
      const len = g.dangle! * rr(0.5, 1);
      for (let s = 0; s <= len; s += 3) line.push([x + Math.sin(s / 10 + i) * 3, y + s]);
      P('tentB', line);
      if (g.lit) {
        C('dotGlow', x, y, 3);
        C('dots', x, y, 1);
      }
      a += g.bend! * 0.18;
      x += Math.cos(a) * u * 1.4;
      y += Math.sin(a) * u * 1.4;
    }
  } else {
    bilateral(g, P, C, rr);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of LAYERS) {
    if (k === 'glowBack' || k === 'dotGlow') continue;
    for (const s of layers[k]) {
      if (s.kind === 'disc') {
        minX = Math.min(minX, s.x - s.rx);
        maxX = Math.max(maxX, s.x + s.rx);
        minY = Math.min(minY, s.y - s.ry);
        maxY = Math.max(maxY, s.y + s.ry);
      } else {
        for (let i = 0; i < s.pts.length; i += 2) {
          minX = Math.min(minX, s.pts[i]);
          maxX = Math.max(maxX, s.pts[i]);
          minY = Math.min(minY, s.pts[i + 1]);
          maxY = Math.max(maxY, s.pts[i + 1]);
        }
      }
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -1;
    minY = -1;
    maxX = 1;
    maxY = 1;
  }
  return { layers, minX, minY, maxX, maxY };
}

type PathFn = (layer: LayerName, pts: [number, number][], close?: boolean) => void;
type DiscFn = (layer: LayerName, x: number, y: number, rx: number, ry?: number) => void;

/** Fish, eels, rays, squid and crawlers: a spine with a width along it. */
function bilateral(g: Genome, P: PathFn, C: DiscFn, rr: (a: number, b: number) => number) {
  const TAU = Math.PI * 2;
  const L = 100;
  const A = g.A!;
  const N = 44;
  const spine: [number, number, number][] = [];
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  const prof = (t: number) => {
    if (g.plan === 'ray') {
      if (t < 0.34) return 0.05;
      const u = (t - 0.34) / 0.66;
      return Math.max(0.05, 1 - Math.pow(Math.abs(2 * Math.pow(u, 0.8) - 1), 1.25)) * (u > 0.92 ? 0.8 : 1);
    }
    if (g.plan === 'eel') return Math.min(1, t * 5) * Math.pow(Math.min(1, (1.02 - t) * 8), 0.5);
    const u = Math.pow(t, g.skew!);
    return Math.pow(Math.max(0.02, Math.sin(Math.PI * (0.05 + 0.9 * u))), g.blunt!);
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * L;
    const y = Math.sin(t * Math.PI * (g.plan === 'eel' ? 2.6 : 1) + g.segs!) * g.wave!;
    let w = A * prof(t);
    if (g.armor) w *= 1 + 0.07 * Math.cos(t * g.segs! * TAU);
    spine.push([x, y, w]);
    top.push([x, y - w * 0.46]);
    bot.unshift([x, y + w * 0.54]);
  }
  P('body', top.concat(bot), true);
  const at = (t: number) => spine[Math.max(0, Math.min(N, Math.round(t * N)))];
  const [tx, ty] = spine[0];
  const T = A * 0.75 * g.tailSize!;
  if (g.tail === 'fork') P('fin', [[tx + 2, ty], [tx - T * 0.95, ty - T], [tx - T * 0.45, ty], [tx - T * 0.95, ty + T]], true);
  if (g.tail === 'round') {
    const f: [number, number][] = [[tx + 2, ty]];
    for (let a = 2.3; a <= 3.99; a += 0.12) f.push([tx + Math.cos(a) * T, ty + Math.sin(a) * T * 0.9]);
    P('fin', f, true);
  }
  if (g.tail === 'lunate') {
    P('fin', [[tx + 2, ty], [tx - T * 0.5, ty - T * 1.05], [tx - T * 0.2, ty - T * 0.3], [tx - T * 0.28, ty], [tx - T * 0.2, ty + T * 0.3], [tx - T * 0.5, ty + T * 1.05]], true);
  }
  if (g.tail === 'filament') {
    const f: [number, number][] = [];
    for (let s = 0; s <= T * 3; s += 3) f.push([tx - s, ty + Math.sin(s / 10) * 3]);
    P('tentF', f);
  }
  if (g.tail === 'fan') {
    for (let k = -2; k <= 2; k++) P('fin', [[tx + 2, ty], [tx - T * 0.8, ty + k * T * 0.28 - T * 0.12], [tx - T * 0.8, ty + k * T * 0.28 + T * 0.12]], true);
  }
  if (g.tail !== 'none' && g.tail !== 'filament') {
    for (let k = -3; k <= 3; k++) P('finRay', [[tx, ty], [tx - T * 0.7, ty + k * T * 0.22]]);
  }
  for (let d = 0; d < g.dorsal!; d++) {
    const t0 = 0.3 + d * 0.28 + rr(-0.05, 0.05);
    const t1 = t0 + rr(0.12, 0.3);
    const H = A * 0.5 * g.dorsalH!;
    const f: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const [x, y, w] = at(t0 + ((t1 - t0) * i) / 10);
      f.push([x, y - w * 0.46 + 1]);
    }
    const back: [number, number][] = [];
    for (let i = 10; i >= 0; i--) {
      const [x, y, w] = at(t0 + ((t1 - t0) * i) / 10);
      const k = i / 10;
      let h =
        g.dorsalShape === 'tri'
          ? H * (1 - k)
          : g.dorsalShape === 'sail'
            ? H * 1.3 * Math.sin(Math.PI * Math.pow(k, 0.7))
            : H * 0.8 * Math.sin(Math.PI * k);
      if (g.dorsalShape === 'frill') h += Math.sin(i * 2.2) * H * 0.18;
      back.push([x - (g.dorsalShape === 'tri' ? H * 0.4 * (1 - k) : 0), y - w * 0.46 - h]);
      if (g.dorsalShape === 'spines') P('finRay', [[x, y - w * 0.46], [x, y - w * 0.46 - h * 1.25]]);
    }
    P('fin', f.concat(back), true);
  }
  if (g.plan === 'eel') {
    for (const sgn of [-1, 1]) {
      const f: [number, number][] = [];
      const b: [number, number][] = [];
      for (let i = 6; i <= N - 8; i++) {
        const [x, y, w] = spine[i];
        f.push([x, y + sgn * w * 0.5]);
        b.unshift([x, y + sgn * (w * 0.5 + 2.5 + Math.sin(i * 1.3) * 0.8)]);
      }
      P('fin', f.concat(b), true);
    }
  }
  if (g.pectoral) {
    const [x, y, w] = at(0.72);
    P('fin', [[x, y + w * 0.1], [x - A * 0.55, y + w * 0.35 + A * 0.25], [x - A * 0.35, y + w * 0.15]], true);
  }
  if (g.anal) {
    const [x, y, w] = at(0.26);
    P('fin', [[x + 6, y + w * 0.54], [x - 6, y + w * 0.54 + A * 0.35], [x - 8, y + w * 0.5]], true);
  }
  if (g.plan === 'squid') {
    const [x, y, w] = at(0.12);
    P('fin', [[x + 10, y - w * 0.4], [x - 6, y - w * 1.3], [x - 4, y - w * 0.3]], true);
    P('fin', [[x + 10, y + w * 0.4], [x - 6, y + w * 1.3], [x - 4, y + w * 0.3]], true);
    const [hx, hy, hw] = spine[N];
    for (let k = 0; k < g.headArms!; k++) {
      const v = (k / Math.max(1, g.headArms! - 1)) * 2 - 1;
      const len = g.armLen! * (k === 0 || k === g.headArms! - 1 ? 1.5 : rr(0.6, 1));
      const line: [number, number][] = [];
      for (let s = 0; s <= len; s += 3) line.push([hx + s, hy + v * hw * 0.35 + v * s * 0.25 + Math.sin(s / 12 + k) * 3]);
      P('tentF', line);
    }
  }
  if (g.legs) {
    for (let k = 0; k < g.legs; k++) {
      const [x, y, w] = at(0.25 + (k / Math.max(1, g.legs - 1)) * 0.5);
      const kneeX = x + rr(-6, 6);
      const kneeY = y + w * 0.54 + A * 0.5;
      P('legs', [[x, y + w * 0.4], [kneeX + 6, kneeY - 4], [kneeX + 2, y + w * 0.54 + A * 1.1]]);
    }
    const [hx, hy] = spine[N];
    for (const sgn of [-1, 1]) {
      const line: [number, number][] = [];
      for (let s = 0; s <= g.antennae!; s += 3) line.push([hx + s * 0.9, hy - 2 + sgn * s * 0.35 - s * 0.2 + Math.sin(s / 10) * 2]);
      P('legs', line);
    }
  }
  if (g.armor) {
    for (let k = 1; k < g.segs!; k++) {
      const [x, y, w] = at(0.1 + (k / g.segs!) * 0.8);
      P('detail', [[x, y - w * 0.44], [x - 2, y], [x, y + w * 0.52]]);
    }
  }
  if (g.plan === 'fish') {
    const [x, y, w] = at(0.8);
    P('detail', [[x, y - w * 0.35], [x - 3, y], [x, y + w * 0.4]]);
  }
  if (g.lateral && g.plan !== 'ray') P('detail', spine.slice(4, N - 5).map(([x, y]) => [x, y - 1] as [number, number]));
  if (g.plan === 'ray') {
    const [x, y, w] = at(0.66);
    P('detail', [[x, y - w * 0.2], [x + 8, y], [x, y + w * 0.2]]);
  }
  const inside = (t: number, v: number): [number, number] => {
    const [x, y, w] = at(t);
    return [x, y + v * w * 0.4];
  };
  if (g.pattern === 'spots') {
    for (let k = 0; k < g.patN! + 4; k++) {
      const [x, y] = inside(rr(0.15, 0.85), rr(-0.8, 0.8));
      C('pat', x, y, A * rr(0.035, 0.07));
    }
  }
  if (g.pattern === 'stripes' || g.pattern === 'bands') {
    const n = Math.min(9, g.patN!);
    for (let k = 0; k < n; k++) {
      const [x, y, w] = at(0.18 + (k / n) * 0.62);
      P('patLine', [[x, y - w * 0.4], [x - 2, y + w * 0.46]]);
    }
  }
  if (g.pattern === 'reticulate') {
    for (let k = 0; k < g.patN! * 2; k++) {
      const [x, y] = inside(rr(0.12, 0.88), rr(-0.8, 0.8));
      P('detail', [[x - 2, y], [x, y - 2], [x + 2, y], [x, y + 2], [x - 2, y]]);
    }
  }
  if (g.clear) {
    P('guts', spine.slice(3, N - 3).map(([x, y]) => [x, y] as [number, number]));
    for (let k = 3; k < N - 5; k += 3) {
      const [x, y, w] = spine[k];
      P('guts', [[x, y - w * 0.3], [x, y + w * 0.3]]);
    }
    const [gx, gy, gw] = at(0.55);
    C('gutFill', gx, gy + gw * 0.08, A * 0.18, gw * 0.18);
  }
  if (g.photo) {
    for (let k = 0; k < g.photoN!; k++) {
      const [x, y, w] = at(0.18 + (k / g.photoN!) * 0.72);
      C('dotGlow', x, y + w * 0.42, 2.8);
      C('dots', x, y + w * 0.42, 1.1);
    }
  }
  const eyes = g.eyes!;
  for (let e = 0; e < eyes; e++) {
    const [x, y, w] = at(eyes > 1 ? 0.8 + (e / eyes) * 0.14 : 0.87);
    const er = (eyes > 1 ? 0.07 : g.eyeBig ? 0.2 : 0.11) * A * (g.plan === 'eel' ? 2.2 : 1);
    const ey = y - w * 0.12 - (eyes > 1 ? (e % 2) * w * 0.15 : 0);
    C('eye', x, ey, er);
    C('pupil', x + er * 0.2, ey, er * 0.55);
  }
  if (g.teeth) {
    const [x, y, w] = spine[N];
    const tt: [number, number][] = [];
    for (let k = 0; k < 7; k++) tt.push([x - k * 2.2, y + w * 0.1 + (k % 2 ? 3 : 0)]);
    P('detail', tt);
  }
  if (g.barbels) {
    const [x, y, w] = at(0.96);
    for (let k = 0; k < g.barbels; k++) {
      const line: [number, number][] = [];
      for (let s = 0; s < 18 + k * 6; s += 2) line.push([x - s * 0.3, y + w * 0.4 + s + Math.sin(s / 4) * 1.5]);
      P('tentF', line);
    }
  }
  if (g.lure) {
    const [x, y, w] = at(0.9);
    const tip: [number, number] = [x + A * 0.9, y - w * 0.46 - A * 0.55];
    P('lure', [[x, y - w * 0.46], [x + A * 0.3, y - w * 0.46 - A * 0.8], tip]);
    C('dotGlow', tip[0], tip[1], A * 0.2);
    C('dots', tip[0], tip[1], A * 0.07);
  }
}

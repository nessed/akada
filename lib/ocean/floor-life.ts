/**
 * What lies on a place's floor besides silt and stones (`Place.floor`).
 *
 * A cold seep: mats of bacteria, white and ochre, on the sediment where the
 * methane comes through, clam beds along their edges, and clumps of thin
 * tube worms. A nodule field: manganese nodules, black lumps half sunk in
 * the ooze, thick toward the viewer. A xenophyophore field: single cells the
 * size of a fist, crumpled lace of their own grains, a few grown as plates.
 * The sea cucumber flats: sea pigs and the small glassy hadal ones lying
 * about, and their tracks across the ooze, with a coil left here and there.
 *
 * All of it is still, so it is drawn once with the floor and only placed.
 * It is drawn on its own layer so it can be laid over the dark the way a
 * whale fall is: what lies on the floor stays findable.
 */

import { mixHex } from '../fan';
import type { FloorDress } from './places';
import { inkLine, smooth, smoothPath } from './pen';
import { mulberry32, type Rand } from './random';

export interface FloorGround {
  g: CanvasRenderingContext2D;
  w: number;
  /** The floor's front edge at x, in the sprite's own px. */
  yAt: (x: number) => number;
  /** How deep the floor's band is below its edge. */
  depth: number;
  px: number;
  /** The ooze, and the paler silt on it. */
  ground: string;
  silt: string;
  /** The one pen. */
  ink: string;
  seed: number;
}

/** Somewhere on the floor: far back is near the edge and small, near is low and large. */
function spot(f: FloorGround, r: Rand, bias = 1.3): { x: number; y: number; k: number } {
  const x = r() * f.w;
  const t = Math.pow(r(), bias);
  return { x, y: f.yAt(x) + 3 * f.px + t * f.depth * 0.82, k: 0.45 + 0.9 * t };
}

/** An uneven flat patch lying on the floor, seen from low across it. */
function patch(x: number, y: number, rx: number, ry: number, r: Rand, n = 14): number[] {
  const pts: number[] = [];
  const ph = r() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 0.78 + 0.22 * Math.sin(a * 3 + ph) + 0.18 * r();
    pts.push(x + Math.cos(a) * rx * j, y + Math.sin(a) * ry * j);
  }
  return pts;
}

const MAT_WHITE = '#E8E1CC';
const MAT_OCHRE = '#C9A46A';
const SHELL = '#D9D0BA';
const TUBE = '#E4DCC8';
const NODULE = '#211D19';
const LACE = '#D6CDB6';
const CUCUMBER = '#D7B0A8';
const GLASSY = '#C9C2CF';

function seep(f: FloorGround, r: Rand) {
  const { g, px } = f;
  const mats = 2 + Math.floor(r() * 3);
  for (let m = 0; m < mats; m++) {
    const { x, y, k } = spot(f, r, 1.1);
    const rx = (70 + 110 * r()) * px * k;
    const ry = rx * (0.13 + 0.06 * r());
    // The mat: a white wash with ochre through it, blotched, its edge soft.
    for (let b = 0; b < 4; b++) {
      const pts = patch(x + (r() - 0.5) * rx * 0.5, y + (r() - 0.5) * ry * 0.4, rx * (0.55 + 0.45 * r()), ry * (0.6 + 0.4 * r()), r);
      // Mostly white, the ochre only in one or two of the blotches.
      g.globalAlpha = b === 1 ? 0.12 + 0.08 * r() : 0.24 + 0.14 * r();
      g.fillStyle = b === 1 ? MAT_OCHRE : MAT_WHITE;
      g.fill(smoothPath(pts, true, 4));
    }
    g.globalAlpha = 1;
    const edge = patch(x, y, rx, ry, r, 18);
    inkLine(g, edge, true, { width: 0.6 * px, color: f.ink, alpha: 0.32, lost: 0.7, seed: (f.seed + m * 31) >>> 0, min: 0.25 * px });
    // Clams along its edge, half sunk: a shell's back and its hinge.
    const clams = 10 + Math.floor(r() * 14);
    for (let c = 0; c < clams; c++) {
      const a = r() * Math.PI * 2;
      const cx = x + Math.cos(a) * rx * (0.85 + 0.25 * r());
      const cy = y + Math.sin(a) * ry * (0.85 + 0.25 * r());
      const s = (3.2 + 3 * r()) * px * k;
      const tilt = (r() - 0.5) * 0.8;
      g.save();
      g.translate(cx, cy);
      g.rotate(tilt);
      g.beginPath();
      g.ellipse(0, 0, s, s * 0.55, 0, Math.PI, Math.PI * 2);
      g.closePath();
      g.globalAlpha = 0.85;
      g.fillStyle = SHELL;
      g.fill();
      g.globalAlpha = 0.6;
      g.strokeStyle = f.ink;
      g.lineWidth = 0.5 * px;
      g.stroke();
      // Its growth lines, two arcs inside the shell.
      if (s > 2.6 * px) {
        g.globalAlpha = 0.3;
        g.beginPath();
        g.ellipse(0, 0, s * 0.62, s * 0.32, 0, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
      g.restore();
    }
    // Tube worms: a clump or two of thin pale tubes standing out of the mat.
    const clumps = r() < 0.7 ? 1 + Math.floor(r() * 2) : 0;
    for (let c = 0; c < clumps; c++) {
      const bx = x + (r() - 0.5) * rx;
      const by = y + (r() - 0.5) * ry * 0.6;
      const n = 6 + Math.floor(r() * 9);
      for (let i = 0; i < n; i++) {
        const fx = bx + (r() - 0.5) * 14 * px * k;
        const len = (20 + 28 * r()) * px * k;
        const lean = (r() - 0.5) * 0.7;
        const curl = (r() - 0.5) * 0.6;
        const pts: number[] = [];
        for (let s = 0; s <= 6; s++) {
          const u = s / 6;
          const a = -Math.PI / 2 + lean * u + curl * u * u;
          pts.push(fx + Math.cos(a) * len * u, by + Math.sin(a) * len * u);
        }
        inkLine(g, pts, false, { width: 1.2 * px * k, color: TUBE, alpha: 0.8, taper: [0, 0.15], seed: (f.seed + c * 97 + i) >>> 0, min: 0.4 * px });
        inkLine(g, pts, false, { width: 0.35 * px, color: f.ink, alpha: 0.45, lost: 0.5, seed: (f.seed + c * 97 + i + 7) >>> 0, min: 0.2 * px });
      }
    }
  }
}

function nodules(f: FloorGround, r: Rand) {
  const { g, px } = f;
  const n = Math.round((f.w / px) * (0.18 + 0.08 * r()));
  const dark = mixHex(NODULE, f.ground, 0.25);
  for (let i = 0; i < n; i++) {
    const { x, y, k } = spot(f, r, 1.05);
    const rx = (2.2 + 5 * r()) * px * k;
    const ry = rx * (0.55 + 0.25 * r());
    const pts: number[] = [];
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2;
      const j = 0.8 + 0.35 * r();
      // Sunk in the ooze: flat where it meets it.
      pts.push(x + Math.cos(a) * rx * j, y + Math.min(Math.sin(a) * ry * j, ry * 0.25));
    }
    g.globalAlpha = 0.3;
    g.fillStyle = '#000000';
    g.beginPath();
    g.ellipse(x + rx * 0.3, y + ry * 0.35, rx * 1.1, ry * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.95;
    g.fillStyle = dark;
    g.fill(smoothPath(pts, true, 3));
    // A rim of silt on the bigger ones, and the pen round them.
    if (rx > 3 * px) {
      g.globalAlpha = 0.35;
      g.strokeStyle = f.silt;
      g.lineWidth = 0.6 * px;
      g.beginPath();
      g.ellipse(x, y - ry * 0.35, rx * 0.7, ry * 0.45, 0, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      inkLine(g, pts, true, { width: 0.55 * px, color: f.ink, alpha: 0.5, lost: 0.5, seed: (f.seed + i) >>> 0, min: 0.25 * px });
    }
  }
  g.globalAlpha = 1;
}

function xeno(f: FloorGround, r: Rand, few = false) {
  const { g, px } = f;
  const n = few ? 3 + Math.floor(r() * 4) : 9 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    const { x, y, k } = spot(f, r, 1.2);
    const s = (10 + 16 * r()) * px * k;
    const seed = (f.seed + i * 131) >>> 0;
    const lr = mulberry32(seed);
    let pts: number[];
    if (lr() < 0.3) {
      // A plate, standing on its edge: a curved fan of lace.
      const wdt = s * (1.2 + 0.6 * lr());
      const hgt = s * (1 + 0.5 * lr());
      const bend = (lr() - 0.5) * 0.5;
      pts = [];
      for (let q = 0; q <= 10; q++) {
        const u = q / 10;
        pts.push(x - wdt / 2 + wdt * u, y - hgt * Math.sin(Math.PI * (0.08 + 0.84 * u)) * (0.85 + 0.25 * lr()) + bend * hgt * (u - 0.5));
      }
      pts.push(x + wdt * 0.25, y + 1 * px, x - wdt * 0.25, y + 1 * px);
    } else {
      // A ball of crumpled lace, sat on the ooze.
      pts = [];
      const m = 12;
      for (let q = 0; q < m; q++) {
        const a = (q / m) * Math.PI * 2;
        const j = 0.75 + 0.35 * lr();
        pts.push(x + Math.cos(a) * s * 0.75 * j, y - s * 0.55 + Math.min(Math.sin(a) * s * 0.6 * j, s * 0.5));
      }
    }
    const body = smoothPath(pts, true, 4);
    g.globalAlpha = 0.55;
    g.fillStyle = LACE;
    g.fill(body);
    // The lace: short crumpled strokes inside it, and a few holes.
    g.save();
    g.clip(body);
    g.globalAlpha = 0.4;
    g.strokeStyle = mixHex(LACE, f.ink, 0.55);
    g.lineWidth = 0.45 * px;
    const strokes = Math.round(10 + s / px);
    for (let q = 0; q < strokes; q++) {
      const cx = x + (lr() - 0.5) * s * 1.6;
      const cy = y - s * 0.55 + (lr() - 0.5) * s * 1.2;
      const a = lr() * Math.PI;
      const l = (1.5 + 2.5 * lr()) * px * k;
      g.beginPath();
      g.moveTo(cx - Math.cos(a) * l, cy - Math.sin(a) * l);
      g.quadraticCurveTo(cx + (lr() - 0.5) * l, cy + (lr() - 0.5) * l, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      g.stroke();
    }
    g.globalAlpha = 0.5;
    g.fillStyle = f.ground;
    for (let q = 0; q < 3; q++) {
      g.beginPath();
      g.ellipse(x + (lr() - 0.5) * s, y - s * 0.55 + (lr() - 0.5) * s * 0.7, s * 0.08, s * 0.06, lr() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    inkLine(g, pts, true, { width: 0.7 * px, color: f.ink, alpha: 0.6, lost: 0.55, seed, min: 0.25 * px });
  }
}

/** A sea cucumber lying on the ooze: a sea pig, plump, legs under it and feelers up; or a small glassy one. */
function cucumber(f: FloorGround, x: number, y: number, k: number, dir: number, r: Rand, seed: number) {
  const { g, px } = f;
  const pig = r() < 0.6;
  const L = (pig ? 36 + 16 * r() : 22 + 10 * r()) * px * k;
  const H = L * (pig ? 0.27 : 0.2);
  const top: number[] = [];
  const bot: number[] = [];
  for (let q = 0; q <= 12; q++) {
    const u = q / 12;
    const xx = x + dir * (u - 0.5) * L;
    // Plump, the front end higher and blunter than the back.
    const bulge = Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * u)), 0.6) * (0.72 + 0.4 * u);
    top.push(xx, y - H * bulge * (0.94 + 0.06 * Math.sin(u * 9)));
    bot.push(xx, y + H * 0.1 * Math.sin(Math.PI * u));
  }
  const pts = top.slice();
  for (let i = bot.length - 2; i >= 0; i -= 2) pts.push(bot[i], bot[i + 1]);
  const body = smoothPath(pts, true, 3);
  g.globalAlpha = 0.25;
  g.fillStyle = '#000000';
  g.beginPath();
  g.ellipse(x, y + H * 0.2, L * 0.55, H * 0.22, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = pig ? 0.82 : 0.5;
  g.fillStyle = pig ? CUCUMBER : GLASSY;
  g.fill(body);
  g.globalAlpha = 1;
  // Legs under it: stubby tube feet in a row.
  const legs = pig ? 5 : 4;
  for (let q = 0; q < legs; q++) {
    const lx = x + dir * ((q + 0.5) / legs - 0.5) * L * 0.8;
    const foot = [lx, y, lx - dir * 0.6 * px * k, y + H * 0.42];
    inkLine(g, foot, false, { width: 2.2 * px * k, color: pig ? CUCUMBER : GLASSY, alpha: 0.95, seed: seed + q, min: 0.4 * px });
    inkLine(g, foot.map((v, i) => (i % 2 ? v : v + dir * 0.9 * px * k)), false, { width: 0.4 * px, color: f.ink, alpha: 0.45, seed: seed + 40 + q, min: 0.2 * px });
  }
  // Feelers up off its back, toward the front: a sea pig's papillae.
  const feelers = pig ? 2 + Math.floor(r() * 3) : 0;
  for (let q = 0; q < feelers; q++) {
    const u = 0.66 + q * 0.08;
    const fx = x + dir * (u - 0.5) * L;
    const fy = y - H * Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * u)), 0.6) * (0.72 + 0.4 * u) * 0.9;
    const len = H * (1 + 0.6 * r());
    const pts = [fx, fy, fx + dir * len * 0.15, fy - len * 0.6, fx + dir * len * 0.4, fy - len];
    inkLine(g, pts, false, { width: 1.8 * px * k, color: CUCUMBER, alpha: 0.9, taper: [0, 0.5], seed: seed + 11 + q, min: 0.3 * px });
    inkLine(g, pts, false, { width: 0.4 * px, color: f.ink, alpha: 0.5, taper: [0, 0.4], seed: seed + 21 + q, min: 0.2 * px });
  }
  inkLine(g, pts, true, { width: 0.7 * px, color: f.ink, alpha: pig ? 0.6 : 0.45, lost: 0.5, seed, min: 0.25 * px });
}

function flats(f: FloorGround, r: Rand, few = false) {
  const { g, px } = f;
  const tracks = few ? 2 + Math.floor(r() * 2) : 4 + Math.floor(r() * 4);
  for (let t = 0; t < tracks; t++) {
    // A track: a furrow wandering across the ooze, nearer as it goes.
    const { x, y, k } = spot(f, r, 0.9);
    const dir = r() < 0.5 ? -1 : 1;
    const len = (90 + 160 * r()) * px * k;
    const ph = r() * 6.28;
    const line: number[] = [];
    // Keeping its depth below the floor's line as it goes, so on a slope it
    // runs along the slope and never across it.
    const below = y - f.yAt(x);
    for (let q = 0; q <= 24; q++) {
      const u = q / 24;
      const xx = x + dir * u * len;
      line.push(xx, f.yAt(Math.max(0, Math.min(f.w, xx))) + below + Math.sin(u * 5 + ph) * 4 * px * k + u * f.depth * 0.08);
    }
    const s = smooth(line, false, 3);
    g.globalAlpha = 0.3;
    g.strokeStyle = f.silt;
    g.lineWidth = 3.4 * px * k;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(s[0], s[1]);
    for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]);
    g.stroke();
    g.globalAlpha = 1;
    inkLine(g, s.map((v, i) => (i % 2 ? v + 1.6 * px * k : v)), false, { width: 0.5 * px, color: f.ink, alpha: 0.4, raw: true, lost: 0.7, seed: (f.seed + t * 17) >>> 0, min: 0.2 * px });
    // The coils it leaves behind it, now and then.
    for (let c = 0; c < 3; c++) {
      if (r() < 0.4) continue;
      const u = 0.15 + 0.6 * r();
      const i = Math.round(u * 24) * 2;
      const cx = line[i];
      const cy = line[i + 1] - 1 * px;
      const pts: number[] = [];
      for (let a = 0; a < Math.PI * 4; a += 0.5) {
        const rr = (0.6 + a * 0.35) * px * k;
        pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.45);
      }
      inkLine(g, pts, false, { width: 0.6 * px, color: f.silt, alpha: 0.55, seed: (f.seed + t * 17 + c) >>> 0, min: 0.25 * px });
    }
    // Most tracks still have their maker at the head of them.
    if (r() < 0.75) cucumber(f, line[48], line[49], k, dir, r, (f.seed + t * 53) >>> 0);
  }
  // And a few lying about with no track to speak of.
  const more = few ? 1 : 2 + Math.floor(r() * 4);
  for (let q = 0; q < more; q++) {
    const { x, y, k } = spot(f, r, 0.8);
    cucumber(f, x, y, k, r() < 0.5 ? -1 : 1, r, (f.seed + 900 + q) >>> 0);
  }
}

/**
 * The bottom of the sea: soft pale ooze, a few xenophyophores, a sea
 * cucumber or two and their tracks, and the amphipods in little crowds
 * picking over it, each a pale curl.
 */
function bottom(f: FloorGround, r: Rand) {
  const { g, px } = f;
  xeno(f, r, true);
  flats(f, r, true);
  const crowds = 3 + Math.floor(r() * 3);
  for (let c = 0; c < crowds; c++) {
    const { x, y, k } = spot(f, r, 1);
    const n = 8 + Math.floor(r() * 14);
    for (let i = 0; i < n; i++) {
      const ax = x + (r() - 0.5) * 40 * px * k;
      const ay = y + (r() - 0.5) * 6 * px * k;
      const s = (2.2 + 1.6 * r()) * px * k;
      const turn = r() < 0.5 ? -1 : 1;
      // A curl: the back's arch, the tail tucked under.
      const pts: number[] = [];
      for (let q = 0; q <= 6; q++) {
        const a = Math.PI * (0.15 + 0.9 * (q / 6));
        pts.push(ax + turn * Math.cos(a) * s, ay - Math.sin(a) * s * 0.7);
      }
      inkLine(g, pts, false, { width: 1.1 * px * k, color: MAT_WHITE, alpha: 0.75, taper: [0.1, 0.4], seed: (f.seed + c * 131 + i) >>> 0, min: 0.3 * px });
    }
  }
}

/** Draw what lies on a place's floor into the floor's own layer. */
export function drawFloorLife(f: FloorGround, dress: FloorDress) {
  const r = mulberry32(f.seed);
  f.g.save();
  f.g.lineCap = 'round';
  f.g.lineJoin = 'round';
  if (dress === 'seep') seep(f, r);
  else if (dress === 'nodules') nodules(f, r);
  else if (dress === 'xeno') xeno(f, r);
  else if (dress === 'flats') flats(f, r);
  else if (dress === 'bottom') bottom(f, r);
  f.g.restore();
}

/**
 * Who is in the water at a given moment.
 *
 * There is no simulation. The ocean's time is focus time, cut into
 * one-second slots, and each slot is rolled from the sitting's key: whether
 * something set off across the water in that second, what it was, which way
 * it went, how near. Where an animal is now is a pure function of how long
 * ago its slot was. So the same sitting always has the same animals in the
 * same places, a reload puts them all back, and a pause freezes them
 * mid-stroke. A break brings nobody new, since arrivals are focus seconds,
 * but whoever was in the water swims on through it on the scene clock (a
 * third of the pace, `lib/wood/clock`) and leaves, the way the wood's do.
 *
 * The water fills as the sitting goes on: a handful at the start, a crowd by
 * the second hour, capped so the page never stops being a page.
 */

import { sceneAtFocus } from '../wood/clock';
import type { Biome, Species } from './biome';
import { depthAt } from './depth';
import { hash32, mulberry32, pickIndex, range } from './random';

export interface View {
  width: number;
  height: number;
}

export type Layer = 0 | 1 | 2;

/**
 * The clock the water moves on, when it is not plain focus time: focus at
 * full speed, breaks at a crawl. Something arrives on a focus second and
 * moves on this, so a break carries everyone on without adding anyone.
 */
export interface Swim {
  scene: number;
  segments: Parameters<typeof sceneAtFocus>[0];
}

/** How far into its life something that arrived at focus second `at` is. */
export function swimAge(t: number, at: number, swim?: Swim): number {
  return swim ? swim.scene - sceneAtFocus(swim.segments, at) : t - at;
}

export interface Visitor {
  key: string;
  species: Species;
  /** 0 far, 1 middle, 2 near. */
  layer: Layer;
  /** Centre, in CSS pixels. */
  x: number;
  y: number;
  /** Longest dimension, in CSS pixels. */
  len: number;
  /** Which way it is heading. */
  dir: 1 | -1;
  /** 0 to 1 through its crossing. */
  age: number;
  alpha: number;
  /** Its own offset for bobbing, undulating and blinking. */
  phase: number;
  /** Which way it faces, -1 to 1, when that is not `dir`: 0 is edge-on, mid-turn. */
  face?: number;
}

/** Seconds of focus a crossing takes, far to near: far things are slow. */
const LIFE: [number, number, number] = [92, 56, 30];
const LIFE_MAX = 110;
const LAYER_ODDS = [0.55, 0.3, 0.15];
const LAYER_ALPHA: [number, number, number] = [0.4, 0.74, 1];
const NEAR_CAP = 4;
/* The floor is a strip; a handful on it reads as a floor, more as a pile. */
const FLOOR_CAP = 5;
const REF_AREA = 1280 * 800;

/** How many animals the water is aiming for at a given minute, full screen. */
export function populationAt(minutes: number): number {
  return Math.min(60, 6 + minutes * 0.42);
}

/** An area's share of a full screen, bounded so a phone still has a sea. */
export function areaScale(view: View): number {
  return Math.max(0.35, Math.min(1.25, (view.width * view.height) / REF_AREA));
}

/**
 * The chance a given second sets something off, chosen so that on average
 * the population sits near its target. It depends on the slot alone, never
 * on the moment it is read from, or the past would change as time went on.
 */
function rateAt(slot: number, scale: number, members: number): number {
  const target = populationAt(slot / 60) * scale;
  // Mean crossing time across the layers, and how many animals a set-off
  // brings on average in this zone (a school is one set-off, many fish).
  const meanLife = LIFE[0] * LAYER_ODDS[0] + LIFE[1] * LAYER_ODDS[1] + LIFE[2] * LAYER_ODDS[2];
  return Math.min(0.9, target / (meanLife * members * 1.25));
}

/* Per pool: the animals one set-off brings on average, abundance-weighted. */
const membersCache = new WeakMap<Species[], number>();
function membersPerSpawn(pool: Species[]): number {
  let m = membersCache.get(pool);
  if (m == null) {
    let w = 0;
    let n = 0;
    for (const s of pool) {
      w += s.abundance;
      n += s.abundance * Math.max(1, s.school);
    }
    m = w > 0 ? n / w : 1;
    membersCache.set(pool, m);
  }
  return m;
}

/**
 * Which species a given second set off, if any, in a full-screen sea. Uses
 * the same first two rolls as `visitorsAt`, so it names exactly who swam by;
 * the recap reads this, so it is the same on a phone and a monitor.
 */
export function spawnAt(biome: Biome, slot: number): Species | null {
  const r = mulberry32(hash32(biome.key, 'slot', slot));
  const zone = depthAt(slot).zone;
  const pool = biome.pools[zone];
  if (r() >= rateAt(slot, 1, membersPerSpawn(pool))) return null;
  return pool[pickIndex(r, pool.map((s) => s.abundance))];
}

/**
 * Everyone in the water at `t` seconds of focus, in a view of the given
 * size. `quality` below 1 thins the far layer, for a device that is
 * struggling; it never removes anything near.
 */
export function visitorsAt(biome: Biome, t: number, view: View, quality = 1, swim?: Swim): Visitor[] {
  const out: Visitor[] = [];
  if (view.width <= 0 || view.height <= 0) return out;
  const scale = areaScale(view);
  const sizeScale = Math.max(0.55, Math.min(1.3, Math.min(view.width, view.height) / 760));
  const now = Math.max(0, t);
  const first = Math.max(0, Math.floor(now - LIFE_MAX));
  let near = 0;
  let floorCount = 0;
  for (let slot = first; slot <= Math.floor(now); slot++) {
    const r = mulberry32(hash32(biome.key, 'slot', slot));
    const zone = depthAt(slot).zone;
    const pool = biome.pools[zone];
    if (r() >= rateAt(slot, scale, membersPerSpawn(pool))) continue;
    const species = pool[pickIndex(r, pool.map((s) => s.abundance))];
    let layer = (species.floor ? 1 : pickIndex(r, LAYER_ODDS)) as Layer;
    if (layer === 0 && r() > quality) continue;
    if (species.school && layer === 2) layer = 1;
    const slow = 1.3 - 0.3 * Math.min(1.5, species.speed);
    const life = Math.min(LIFE_MAX, (species.floor ? 100 : LIFE[layer] * slow) * range(r, 0.9, 1.1));
    const age = swimAge(now, slot, swim) / life;
    if (age < 0 || age >= 1) continue;
    if (species.floor && floorCount >= FLOOR_CAP) continue;
    if (species.floor) floorCount++;
    if (layer === 2 && near >= NEAR_CAP) layer = 1;
    if (layer === 2) near++;

    const dir: 1 | -1 = r() < 0.78 ? biome.env.current : biome.env.current === 1 ? -1 : 1;
    const base = [range(r, 46, 80), range(r, 88, 140), range(r, 170, 250)][layer];
    // Things on the floor are seen from across it, and kept small.
    const len = (species.floor ? range(r, 34, 60) : base) * Math.sqrt(species.genome.size) * sizeScale;
    const phase = r() * Math.PI * 2;
    let x: number;
    let y: number;
    let alpha = LAYER_ALPHA[layer];
    let face: number | undefined;
    if (species.floor) {
      // Floor-dwellers keep to the bottom and only shuffle along it,
      // fading in and out rather than crossing the whole page.
      const x0 = range(r, 0.1, 0.9) * view.width;
      x = x0 + dir * age * view.width * 0.18;
      y = view.height * range(r, 0.9, 0.96);
      alpha *= Math.min(1, age / 0.08, (1 - age) / 0.08);
    } else if (species.curious && layer > 0) {
      // Curious: comes in from its side, circles the jelly once or twice,
      // and goes out the other way. Never over the bell: the circle is wide.
      const cx = view.width / 2;
      const cy = view.height * 0.3;
      const rad = Math.min(view.width, view.height) * range(r, 0.24, 0.32);
      const laps = range(r, 1, 2);
      const from = dir > 0 ? -len : view.width + len;
      const to = dir > 0 ? view.width + len : -len;
      const start = dir > 0 ? Math.PI : 0;
      const orbit = (a: number) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.6] as const;
      const arrive = orbit(start);
      const leaveAt = start + dir * laps * Math.PI * 2;
      const leave = orbit(leaveAt);
      if (age < 0.25) {
        const k = age / 0.25;
        x = from + (arrive[0] - from) * k;
        y = arrive[1] + (1 - k) * view.height * 0.1;
      } else if (age < 0.8) {
        const k = (age - 0.25) / 0.55;
        const a = start + dir * laps * Math.PI * 2 * k;
        [x, y] = orbit(a);
        // Facing the way it is going round, and turning rather than flipping.
        const f = -Math.sin(a) * dir * 1.6;
        face = Math.sign(f || 1) * Math.max(0.2, Math.min(1, Math.abs(f)));
      } else {
        const k = (age - 0.8) / 0.2;
        x = leave[0] + (to - leave[0]) * k;
        y = leave[1];
      }
    } else {
      const margin = len * 0.9;
      const travel = view.width + margin * 2;
      x = dir > 0 ? -margin + age * travel : view.width + margin - age * travel;
      const y0 = range(r, 0.06, 0.9) * view.height;
      y = y0 + Math.sin(age * Math.PI * range(r, 1, 3) + phase) * view.height * 0.03;
    }
    const key = `${slot}`;
    if (species.school) {
      for (let m = 0; m < species.school; m++) {
        const rm = mulberry32(hash32(biome.key, 'slot', slot, 'm', m));
        const mlen = len * range(rm, 0.55, 0.75);
        out.push({
          key: `${key}.${m}`,
          species,
          layer,
          x: x + (rm() - 0.5) * mlen * 5 - dir * m * mlen * 0.2,
          y: y + (rm() - 0.5) * mlen * 1.8,
          len: mlen,
          dir,
          age,
          alpha,
          phase: phase + m * 0.7,
          face,
        });
      }
    } else {
      out.push({ key, species, layer, x, y, len, dir, age, alpha, phase, face });
    }
  }
  // Far first, near last, which is the order they are drawn in.
  out.sort((a, b) => a.layer - b.layer);
  return out;
}

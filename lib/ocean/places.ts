/**
 * Where the dive goes: the places it passes on the way down.
 *
 * The zones say how deep the water is; a place says what this stretch of it
 * is like. The dive is cut into legs at round depths (the long zones cut
 * again, the trench every 500 m), and each leg is one place: a real piece of
 * the deep sea with its own name in the margin, its own walls or floor, what
 * grows on its rocks, the haze and snow in its water, and its own animals.
 * So a long night keeps arriving somewhere it has not been yet, instead of
 * spending six hours in one trench.
 *
 * A sitting rolls its own route: each leg picks a place from the ones that
 * live at that depth, never the one it just left. Like the rest of the ocean
 * it is a pure function of the sitting's key, so a reload or a dive again
 * passes the same places. The zones are untouched: a place sits inside one.
 */

import { ZONES } from './depth';
import type { GrowthKind } from './outcrop';
import { hash32, mulberry32, pickIndex } from './random';

export type PlaceId =
  | 'kelp'
  | 'reef'
  | 'blue'
  | 'twilight'
  | 'dropoff'
  | 'midnight'
  | 'mounds'
  | 'seamount'
  | 'plain'
  | 'vents'
  | 'wall'
  | 'rubble'
  | 'hadal'
  | 'deep';

export interface Place {
  id: PlaceId;
  /** What the margin calls it. A zone's own open water is called by the zone. */
  name: string;
  zone: number;
  /** The depths it lives between, in metres: a leg only rolls a place whose band holds its start. */
  m0: number;
  m1: number;
  /** How likely a leg that can roll it is to. */
  weight: number;
  /** Rock walls down the page: none, one side, or both (the trench). */
  walls: 0 | 1 | 2;
  /** Whether rocks jut in from the edges here. Open water has none. */
  rocks: boolean;
  /** What grows on its rocks, with how common each is; the zone's own kit if not given. */
  kit?: [GrowthKind, number][];
  /** Vents on the floor: forced on with a count, or left to the sitting's roll. */
  vents?: number;
  /** A colour its water leans toward, and how far (kept small: the deep stays dark). */
  haze?: [string, number];
  /** Marine snow against the usual. */
  snow: number;
  /**
   * The kinds of fish that belong here, for the pool that fills it. Plain
   * ids; what each is, and drawing it, is the fish's own business.
   */
  fishForms: string[];
}

export const PLACES: Record<PlaceId, Place> = {
  // The sunlit water: kelp where the sitting rolled it, otherwise a reef, or
  // now and then open blue with no rock in it at all.
  kelp: { id: 'kelp', name: 'the kelp forest', zone: 0, m0: 0, m1: 200, weight: 0, walls: 0, rocks: true, snow: 1, fishForms: ['jack', 'sardine', 'barracuda'] },
  reef: { id: 'reef', name: 'the reef', zone: 0, m0: 0, m1: 200, weight: 3, walls: 0, rocks: true, snow: 1, fishForms: ['disc', 'puffer', 'jack', 'flatfish'] },
  blue: { id: 'blue', name: 'open water', zone: 0, m0: 0, m1: 200, weight: 1.2, walls: 0, rocks: false, snow: 0.7, fishForms: ['sardine', 'jack', 'sunfish', 'barracuda'] },

  twilight: { id: 'twilight', name: 'twilight', zone: 1, m0: 200, m1: 1000, weight: 2, walls: 0, rocks: true, snow: 1, fishForms: ['lantern', 'hatchet', 'bristlemouth'] },
  // A wall down one side that the reader sinks along, the reef's slope going
  // over the edge into the dark: fans and whips, the colour leaving them.
  dropoff: {
    id: 'dropoff', name: 'the drop-off', zone: 1, m0: 200, m1: 1000, weight: 1.6, walls: 1, rocks: true,
    kit: [['plate', 3], ['fan', 3], ['whip', 2]],
    snow: 1.1, fishForms: ['hatchet', 'barreleye', 'lantern'],
  },

  midnight: { id: 'midnight', name: 'midnight', zone: 2, m0: 1000, m1: 4000, weight: 2, walls: 0, rocks: true, snow: 1, fishForms: ['viper', 'lantern', 'bristlemouth', 'angler'] },
  // Cold-water coral: heaps of white branching coral (Lophelia, Desmophyllum)
  // with sponges and lilies among them, real down to about 3,000 m.
  mounds: {
    id: 'mounds', name: 'the coral mounds', zone: 2, m0: 1000, m1: 3000, weight: 1.6, walls: 0, rocks: true,
    kit: [['branch', 4], ['glass', 2], ['crinoid', 1.5], ['brittlestar', 1]],
    snow: 1.2, fishForms: ['grenadier', 'fangtooth', 'viper'],
  },
  // A seamount's flank down one side: sponge gardens and sea lilies.
  seamount: {
    id: 'seamount', name: 'the seamount', zone: 2, m0: 1000, m1: 4000, weight: 1.4, walls: 1, rocks: true,
    kit: [['glass', 3], ['crinoid', 2.5], ['seapen', 1.5], ['whip', 1.5]],
    snow: 1.1, fishForms: ['grenadier', 'gulper', 'angler'],
  },

  // The abyssal plain: open ooze to the edge of sight, silt in the water.
  plain: {
    id: 'plain', name: 'the abyssal plain', zone: 3, m0: 4000, m1: 6000, weight: 2, walls: 0, rocks: true,
    haze: ['#3A3833', 0.1], snow: 1.4, fishForms: ['tripod', 'grenadier', 'cusk'],
  },
  // A field of black smokers, more of them than a sitting's vents, and the
  // water over them a little murky and warm.
  vents: {
    id: 'vents', name: 'the vent field', zone: 3, m0: 4000, m1: 6000, weight: 1.5, walls: 0, rocks: true, vents: 4,
    haze: ['#3B2E25', 0.14], snow: 1.2, fishForms: ['eelpout', 'cusk'],
  },

  // The trench: walls on both sides from here down, closing in as it deepens.
  wall: {
    id: 'wall', name: 'the trench wall', zone: 4, m0: 6000, m1: 10500, weight: 2, walls: 2, rocks: true,
    kit: [['glass', 2], ['crinoid', 2.5], ['whip', 1], ['seapen', 1]],
    snow: 1.1, fishForms: ['snailfish', 'grenadier', 'cusk'],
  },
  // A landslide's scar: broken rock come down the wall, little growing on it.
  rubble: {
    id: 'rubble', name: 'the rubble slope', zone: 4, m0: 6000, m1: 10500, weight: 1.3, walls: 2, rocks: true,
    kit: [['glass', 1], ['brittlestar', 2], ['whip', 1]],
    haze: ['#35322C', 0.12], snow: 1.6, fishForms: ['cusk', 'snailfish'],
  },
  // The trench's own floor: soft sediment, silt hanging in the water.
  hadal: {
    id: 'hadal', name: 'the hadal floor', zone: 4, m0: 6500, m1: 10500, weight: 1.5, walls: 2, rocks: true,
    kit: [['glass', 1], ['seapen', 2], ['brittlestar', 1.5]],
    haze: ['#3A3731', 0.12], snow: 1.8, fishForms: ['snailfish', 'cusk'],
  },
  // The bottom of the deepest trench. Few sittings ever get here.
  deep: {
    id: 'deep', name: 'challenger deep', zone: 4, m0: 10500, m1: 11000, weight: 1, walls: 2, rocks: true,
    kit: [['seapen', 1], ['brittlestar', 1]],
    haze: ['#33302B', 0.14], snow: 2, fishForms: ['snailfish'],
  },
};

/** Where the legs are cut, in metres: every zone's top, the long zones again, the trench every 500 m. */
const CUTS = [0, 200, 500, 1000, 2500, 4000, 5000, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10000, 10500];

export interface Leg {
  index: number;
  place: Place;
  zone: number;
  /** Focus minutes at which it begins and ends (the last runs on). */
  from: number;
  to: number;
  /** Metres at its top. */
  m: number;
  /** The first leg of its zone. */
  first: boolean;
  /** Which side a one-sided wall is on. */
  side: -1 | 1;
}

/** Focus minutes at which a depth in metres is reached: `depthAt` turned round. */
export function minuteAt(metres: number): number {
  for (const zn of ZONES) {
    if (metres < zn.m1 || zn === ZONES[ZONES.length - 1]) {
      const t = Math.max(0, Math.min(1, (metres - zn.m0) / (zn.m1 - zn.m0)));
      return zn.from + t * (zn.to - zn.from);
    }
  }
  return ZONES[ZONES.length - 1].to;
}

function zoneOf(metres: number): number {
  let z = 0;
  for (let i = 0; i < ZONES.length; i++) if (metres >= ZONES[i].m0) z = i;
  return z;
}

const routes = new Map<string, Leg[]>();

/**
 * The places a sitting passes, leg by leg. `kelp` is the sitting's own roll
 * (`biome.env.kelp`): a kelp sitting opens in the forest, since kelp and a
 * reef never share the sunlit water. Every leg after the first rolls on its
 * own seed, so nothing past the sunlit water hangs on the kelp.
 */
export function routeOf(key: string, kelp: boolean): Leg[] {
  const memo = `${key}|${kelp ? 1 : 0}`;
  const hit = routes.get(memo);
  if (hit) return hit;
  const legs: Leg[] = [];
  let prev: PlaceId | null = null;
  for (let i = 0; i < CUTS.length; i++) {
    const m = CUTS[i];
    const zone = zoneOf(m);
    let place: Place;
    if (i === 0 && kelp) place = PLACES.kelp;
    else {
      const can = Object.values(PLACES).filter((p) => p.zone === zone && p.weight > 0 && m >= p.m0 && m < p.m1);
      // Never the place it just left, if there is anywhere else to be.
      const fresh = can.length > 1 ? can.filter((p) => p.id !== prev) : can;
      const r = mulberry32(hash32(key, 'route', i));
      place = fresh[pickIndex(r, fresh.map((p) => p.weight))];
    }
    const r = mulberry32(hash32(key, 'route-side', i));
    legs.push({
      index: i,
      place,
      zone,
      from: minuteAt(m),
      to: i + 1 < CUTS.length ? minuteAt(CUTS[i + 1]) : Infinity,
      m,
      first: i === 0 || zoneOf(CUTS[i - 1]) !== zone,
      side: r() < 0.5 ? -1 : 1,
    });
    prev = place.id;
  }
  routes.set(memo, legs);
  if (routes.size > 24) routes.delete(routes.keys().next().value as string);
  return legs;
}

/** Which leg a moment of focus is in. */
export function legAt(route: Leg[], focusSeconds: number): number {
  const min = Math.max(0, Number.isFinite(focusSeconds) ? focusSeconds : 0) / 60;
  let i = 0;
  while (i + 1 < route.length && min >= route[i + 1].from) i++;
  return i;
}

/** The line written in the margin as a leg begins: `abyss · the vent field · 4,000 m`. */
export function legMark(leg: Leg): string {
  const zone = ZONES[leg.zone].name;
  const m = `${leg.m.toLocaleString('en-US')} m`;
  if (leg.place.name === zone) return `${zone} · ${m}`;
  return leg.first ? `${zone} · ${leg.place.name} · ${m}` : `${leg.place.name} · ${m}`;
}

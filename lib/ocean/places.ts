/**
 * Where the dive goes: the places it passes on the way down.
 *
 * The zones say how deep the water is; a place says what this stretch of it
 * is like. The dive is cut into legs at round depths (the long zones cut
 * again, the abyss every 500 m, the trench every 250 m), and each leg is one
 * place: a real piece of
 * the deep sea with its own name in the margin, its own walls or floor, what
 * grows on its rocks, the haze and snow in its water, and its own animals.
 * So a long night keeps arriving somewhere it has not been yet, instead of
 * spending six hours in one trench.
 *
 * A sitting rolls its own route: each leg picks a place from the ones that
 * live at that depth, never the one it just left nor the one before that.
 * Like the rest of the ocean
 * it is a pure function of the sitting's key, so a reload or a dive again
 * passes the same places. The zones are untouched: a place sits inside one.
 */

import { ZONES } from './depth';
import type { LandmarkKind } from './landmarks';
import type { GrowthKind } from './outcrop';
import { hash32, mulberry32, pickIndex } from './random';

export type PlaceId =
  | 'kelp'
  | 'reef'
  | 'blue'
  | 'wreck'
  | 'twilight'
  | 'dropoff'
  | 'canyon'
  | 'layer'
  | 'midnight'
  | 'mounds'
  | 'seamount'
  | 'brine'
  | 'plain'
  | 'vents'
  | 'nodules'
  | 'wall'
  | 'rubble'
  | 'hadal'
  | 'seep'
  | 'flats'
  | 'xeno'
  | 'narrows'
  | 'overhang'
  | 'deep';

/**
 * What lies on a place's floor besides the silt and the stones: a cold
 * seep's mats, clams and tube worms; manganese nodules; xenophyophores, the
 * giant single cells; sea cucumbers and the tracks they leave.
 */
export type FloorDress = 'seep' | 'nodules' | 'xeno' | 'flats' | 'bottom';

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
  /** What else lies on its floor (`floor-life.ts`). */
  floor?: FloorDress;
  /** How much further in its walls stand than the trench's own, as a share of the page. */
  narrow?: number;
  /** Its wall on the leg's side leans out over the water, undercut beneath. */
  overhang?: boolean;
  /** Past the last fish: nothing with a backbone has been found living this deep. */
  fishless?: boolean;
  /** More animals in its water than the minute would otherwise hold, against the usual. */
  crowd?: number;
  /** Its plankton answers a hand more brightly than the usual, on top of the leg's own. */
  glow?: number;
  /** More rock than the usual, as the odds of a second rock half a slot out of step with the first (`outcrop.ts`). */
  rocky?: number;
  /** A great school turning slowly in its water the whole leg long (`vortex.ts`). */
  vortex?: boolean;
  /** The one big thing it is known for, passed once in its leg (`landmarks.ts`). */
  landmark?: LandmarkKind;
  /** Pinpricks of light hanging in its water, blinking on and off, how many against a full page's worth. */
  lights?: number;
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
  kelp: { id: 'kelp', name: 'the kelp forest', zone: 0, m0: 0, m1: 200, weight: 0, walls: 0, rocks: true, snow: 1, fishForms: ['jack', 'sardine', 'barracuda', 'grouper'] },
  reef: { id: 'reef', name: 'the reef', zone: 0, m0: 0, m1: 200, weight: 3, walls: 0, rocks: true, rocky: 0.95, snow: 1, fishForms: ['disc', 'puffer', 'trigger', 'grouper', 'trumpet', 'flatfish'] },
  blue: { id: 'blue', name: 'open water', zone: 0, m0: 0, m1: 200, weight: 1.2, walls: 0, rocks: false, vortex: true, snow: 0.7, fishForms: ['sardine', 'jack', 'sunfish', 'flying', 'swordfish'] },
  // A wreck on the reef: a steel ship lying on her side on the slope, her
  // plates and rails grown over with coral and fans, the big fish of the
  // reef living in and around her.
  wreck: {
    id: 'wreck', name: 'the wreck', zone: 0, m0: 0, m1: 200, weight: 1.5, walls: 0, rocks: true, landmark: 'wreck',
    snow: 1, fishForms: ['grouper', 'barracuda', 'jack', 'trumpet', 'disc'],
  },

  twilight: { id: 'twilight', name: 'twilight', zone: 1, m0: 200, m1: 1000, weight: 2, walls: 0, rocks: true, snow: 1, fishForms: ['lantern', 'hatchet', 'bristlemouth', 'swallower'] },
  // A wall down one side that the reader sinks along, the reef's slope going
  // over the edge into the dark: fans and whips, the colour leaving them.
  dropoff: {
    id: 'dropoff', name: 'the drop-off', zone: 1, m0: 200, m1: 1000, weight: 1.6, walls: 1, rocks: true,
    kit: [['plate', 3], ['fan', 3], ['whip', 2]],
    snow: 1.1, fishForms: ['hatchet', 'barreleye', 'lantern', 'snipe'],
  },
  // A submarine canyon: a gorge cut into the continental slope, walls on
  // both sides as the trench has but further apart, grown with the
  // twilight's fans and whips, the current running hard down it.
  canyon: {
    id: 'canyon', name: 'the canyon', zone: 1, m0: 200, m1: 1000, weight: 1.4, walls: 2, rocks: true,
    kit: [['fan', 3], ['whip', 3], ['plate', 1.5]],
    haze: ['#2E3A40', 0.08], snow: 1.3, fishForms: ['hatchet', 'snipe', 'swallower', 'barreleye'],
  },
  // The deep scattering layer: the band of the twilight so thick with
  // lanternfish, hatchetfish, krill and siphonophores that a ship's sonar
  // takes it for the bottom. Open water, crowded, schools in it everywhere,
  // the snow thick and the plankton quick to light.
  layer: {
    id: 'layer', name: 'the scattering layer', zone: 1, m0: 300, m1: 1000, weight: 1.3, walls: 0, rocks: false,
    crowd: 1.8, glow: 1.6, lights: 1,
    haze: ['#2F3B3A', 0.06], snow: 1.7, fishForms: ['lantern', 'bristlemouth', 'hatchet'],
  },

  midnight: { id: 'midnight', name: 'midnight', zone: 2, m0: 1000, m1: 4000, weight: 2, walls: 0, rocks: true, snow: 1, fishForms: ['viper', 'lantern', 'bristlemouth', 'angler', 'whalefish', 'swallower'] },
  // Cold-water coral: heaps of white branching coral (Lophelia, Desmophyllum)
  // with sponges and lilies among them, real down to about 3,000 m.
  mounds: {
    id: 'mounds', name: 'the coral mounds', zone: 2, m0: 1000, m1: 3000, weight: 1.6, walls: 0, rocks: true, rocky: 0.6,
    kit: [['branch', 4], ['glass', 2], ['crinoid', 1.5], ['brittlestar', 1]],
    snow: 1.2, fishForms: ['grenadier', 'fangtooth', 'viper', 'chimaera'],
  },
  // A brine pool: brine many times saltier than the sea, too heavy to mix
  // with it, lying in a hollow of the slope as a lake lies on land, with a
  // surface and a shore. Mussels crowd the shore, living off the methane in
  // it; anything that swims into the brine dies. Real from 650 m to past
  // 3,000 m. Passed on a ledge of the slope, its brine spilling over the lip.
  brine: {
    id: 'brine', name: 'the brine pool', zone: 2, m0: 1000, m1: 3300, weight: 1.3, walls: 0, rocks: true, landmark: 'brine',
    kit: [['glass', 2], ['seapen', 1], ['brittlestar', 1]],
    haze: ['#2E3236', 0.08], snow: 1, fishForms: ['grenadier', 'chimaera', 'viper', 'angler'],
  },
  // A seamount's flank down one side: sponge gardens and sea lilies.
  seamount: {
    id: 'seamount', name: 'the seamount', zone: 2, m0: 1000, m1: 4000, weight: 1.4, walls: 1, rocks: true,
    kit: [['glass', 3], ['crinoid', 2.5], ['seapen', 1.5], ['whip', 1.5]],
    snow: 1.1, fishForms: ['grenadier', 'gulper', 'angler', 'chimaera', 'snipe'],
  },

  // The abyssal plain: open ooze to the edge of sight, silt in the water.
  plain: {
    id: 'plain', name: 'the abyssal plain', zone: 3, m0: 4000, m1: 6000, weight: 2, walls: 0, rocks: true,
    haze: ['#3A3833', 0.1], snow: 1.4, fishForms: ['tripod', 'lizard', 'grenadier', 'cusk', 'cutthroat'],
  },
  // A field of black smokers, more of them than a sitting's vents, and the
  // water over them a little murky and warm.
  vents: {
    id: 'vents', name: 'the vent field', zone: 3, m0: 4000, m1: 6000, weight: 1.5, walls: 0, rocks: true, vents: 4,
    haze: ['#3B2E25', 0.14], snow: 1.2, fishForms: ['eelpout', 'cusk', 'cutthroat', 'whalefish'],
  },
  // A plain paved with manganese nodules: black lumps the size of a fist,
  // grown a few millimetres in a million years, half sunk in the ooze.
  nodules: {
    id: 'nodules', name: 'the nodule field', zone: 3, m0: 4000, m1: 6000, weight: 1.6, walls: 0, rocks: false, floor: 'nodules',
    haze: ['#33302A', 0.1], snow: 1.1, fishForms: ['grenadier', 'tripod', 'cusk', 'flatfish'],
  },

  // The trench: walls on both sides from here down, closing in as it deepens.
  wall: {
    id: 'wall', name: 'the trench wall', zone: 4, m0: 6000, m1: 10500, weight: 2, walls: 2, rocks: true,
    kit: [['glass', 2], ['crinoid', 2.5], ['whip', 1], ['seapen', 1]],
    snow: 1.1, fishForms: ['snailfish', 'ethereal', 'grenadier', 'cusk'],
  },
  // A landslide's scar: broken rock come down the wall, little growing on it.
  rubble: {
    id: 'rubble', name: 'the rubble slope', zone: 4, m0: 6000, m1: 10500, weight: 1.3, walls: 2, rocks: true,
    kit: [['glass', 1], ['brittlestar', 2], ['whip', 1]],
    haze: ['#35322C', 0.12], snow: 1.6, fishForms: ['cusk', 'cutthroat', 'snailfish', 'eelpout'],
  },
  // The trench's own floor: soft sediment, silt hanging in the water.
  hadal: {
    id: 'hadal', name: 'the hadal floor', zone: 4, m0: 6500, m1: 10500, weight: 1.5, walls: 2, rocks: true,
    kit: [['glass', 1], ['seapen', 2], ['brittlestar', 1.5]],
    haze: ['#3A3731', 0.12], snow: 1.8, fishForms: ['snailfish', 'ethereal', 'cusk', 'eelpout'],
  },
  // A cold seep: methane and sulphide leaking from the sediment, white and
  // ochre mats of bacteria on it, clam beds and thin tube worms at their
  // edges. Found in the trenches down to 9,500 m.
  seep: {
    id: 'seep', name: 'the cold seep', zone: 4, m0: 6000, m1: 9750, weight: 1.4, walls: 2, rocks: true, floor: 'seep',
    kit: [['glass', 1], ['seapen', 1], ['brittlestar', 1]],
    haze: ['#3A3626', 0.14], snow: 1, fishForms: ['snailfish', 'eelpout', 'cusk'],
  },
  // A flat of soft ooze where the sea cucumbers are most of what lives,
  // grazing it a mouthful at a time and leaving their tracks across it.
  flats: {
    id: 'flats', name: 'the sea cucumber flats', zone: 4, m0: 6000, m1: 10500, weight: 1.5, walls: 2, rocks: false, floor: 'flats',
    haze: ['#38342E', 0.1], snow: 1.5, fishForms: ['snailfish', 'ethereal', 'grenadier'],
  },
  // Xenophyophores: single cells the size of a fist, crumpled lace of
  // their own grains, standing on the ooze. Seen at 10,600 m.
  xeno: {
    id: 'xeno', name: 'the xenophyophore field', zone: 4, m0: 7000, m1: 10500, weight: 1.2, walls: 2, rocks: true, floor: 'xeno',
    kit: [['glass', 2], ['seapen', 1]],
    haze: ['#36332D', 0.1], snow: 1.4, fishForms: ['snailfish', 'ethereal', 'cusk'],
  },
  // Where the trench pinches in: the walls close on both sides and the
  // water between them is darker for it.
  narrows: {
    id: 'narrows', name: 'the narrows', zone: 4, m0: 6500, m1: 10500, weight: 1.2, walls: 2, rocks: true, narrow: 0.08,
    kit: [['whip', 1], ['crinoid', 1.5], ['glass', 1]],
    haze: ['#2B2926', 0.18], snow: 1.3, fishForms: ['cusk', 'cutthroat', 'snailfish'],
  },
  // One wall leaning out over the water, undercut beneath, its underside
  // hung with what grows out of the light.
  overhang: {
    id: 'overhang', name: 'the overhang', zone: 4, m0: 6000, m1: 10500, weight: 1.1, walls: 2, rocks: true, overhang: true,
    kit: [['glass', 2], ['crinoid', 2], ['whip', 1]],
    haze: ['#33302B', 0.12], snow: 1.1, fishForms: ['grenadier', 'snailfish', 'ethereal'],
  },
  // The bottom of the deepest trench, nine hours and more down, and past
  // the last fish: none has been seen below about 8,400 m. What lives here
  // is the amphipods in their swarms, the sea cucumbers and the
  // xenophyophores, between the walls at their narrowest. Few sittings ever
  // get here.
  deep: {
    id: 'deep', name: 'challenger deep', zone: 4, m0: 10500, m1: 11000, weight: 1, walls: 2, rocks: true, narrow: 0.06,
    floor: 'bottom', fishless: true, kit: [['seapen', 1], ['brittlestar', 1]],
    haze: ['#33302B', 0.14], snow: 2, fishForms: [],
  },
};

/** How much higher up the page a place's floor sits, a share of its height:
    a little, where there is something on it to see. */
export function floorLift(place: Place): number {
  return place.floor ? 0.07 : 0;
}

/**
 * Where the legs are cut, in metres: every zone's top, the twilight again at
 * 500 and 750 m, the midnight every 750 m, the abyss every 500 m and the
 * trench every 250 m, so the first two hours arrive somewhere new every
 * eleven to fifteen minutes and a long night every twenty or so; the last,
 * challenger deep, from 10,500 m to the bottom.
 */
const CUTS = [
  0, 200, 500, 750, 1000, 1750, 2500, 3250, 4000, 4500, 5000, 5500,
  ...Array.from({ length: 18 }, (_, i) => 6000 + i * 250),
  10500,
];

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
  /** Its own water (`waterOf`): each stretch of the dive is a little different to be in. */
  water: LegWater;
}

/**
 * The water of one leg, rolled for it: whether the current here runs the
 * other way to the sitting's (so the animals mostly swim the other way),
 * how clear it is, how much snow is in it against the place's own, and how
 * brightly its plankton answers a hand. The first leg is the sitting's own.
 */
export interface LegWater {
  flip: boolean;
  /** Against the sitting's clarity, 0.75 (murkier) to 1.2 (clearer). */
  clarity: number;
  /** Against the place's snow. */
  snow: number;
  /** How brightly the plankton lights when touched, against the usual. */
  glow: number;
}

function waterOf(key: string, i: number): LegWater {
  if (i === 0) return { flip: false, clarity: 1, snow: 1, glow: 1 };
  const r = mulberry32(hash32(key, 'route-water', i));
  return { flip: r() < 0.35, clarity: 0.75 + 0.45 * r(), snow: 0.75 + 0.55 * r(), glow: 0.6 + 1 * r() };
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
  let prev2: PlaceId | null = null;
  for (let i = 0; i < CUTS.length; i++) {
    const m = CUTS[i];
    const zone = zoneOf(m);
    let place: Place;
    if (i === 0 && kelp) place = PLACES.kelp;
    else {
      // A landmark is passed once a sitting: twice and it is not one.
      const can = Object.values(PLACES).filter((p) => p.zone === zone && p.weight > 0 && m >= p.m0 && m < p.m1 && !(p.landmark && legs.some((l) => l.place.id === p.id)));
      // Never the place it just left, nor the one before that, if there is
      // anywhere else to be: so a long stretch never goes back and forth.
      const notPrev = can.filter((p) => p.id !== prev);
      const notEither = notPrev.filter((p) => p.id !== prev2);
      const fresh = notEither.length ? notEither : notPrev.length ? notPrev : can;
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
      water: waterOf(key, i),
    });
    prev2 = prev;
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

const HOURS = ['', 'one hour', 'two hours', 'three hours', 'four hours', 'five hours', 'six hours', 'seven hours', 'eight hours', 'nine hours', 'ten hours', 'eleven hours', 'twelve hours'];

/** The line written in the margin as an hour of focus is reached: `four hours · 6,714 m`. */
export function hourMark(hours: number, metres: number): string {
  const said = HOURS[hours] ?? `${hours} hours`;
  return `${said} · ${Math.round(metres).toLocaleString('en-US')} m`;
}

/**
 * The way the dive went, in words, for the finish sheet: where it began, one
 * place it passed on the way (rather a rare one), and where it ended. Only places actually passed, by focus time; null for a dive that
 * stayed in one place.
 */
export function routeLine(route: Leg[], focusSeconds: number): string | null {
  const passed: Leg[] = [];
  for (const leg of route) {
    if (leg.from * 60 > focusSeconds) break;
    if (!passed.length || passed[passed.length - 1].place.id !== leg.place.id) passed.push(leg);
  }
  if (passed.length < 2) return null;
  const first = passed[0].place;
  const last = passed[passed.length - 1].place;
  const between = passed.slice(1, -1).filter((l) => l.place.id !== first.id && l.place.id !== last.id);
  if (!between.length) return `from ${first.name} to ${last.name}`;
  // One place on the way, leaning toward the rarer ones (the less likely
  // to be rolled), on dice of the route's own so it is not always the same.
  const r = mulberry32(hash32('route-line', ...between.map((l) => l.index)));
  const rare = between[pickIndex(r, between.map((l) => 1 / (l.place.weight * l.place.weight)))];
  return `from ${first.name} down past ${rare.place.name} to ${last.name}`;
}

/** The line written in the margin as a leg begins: `abyss · the vent field · 4,000 m`. */
export function legMark(leg: Leg): string {
  const zone = ZONES[leg.zone].name;
  const m = `${leg.m.toLocaleString('en-US')} m`;
  // The arrival: the bottom of the sea, said as such.
  if (leg.place.id === 'deep') return `the bottom of the sea · ${leg.place.name} · ${m}`;
  if (leg.place.name === zone) return `${zone} · ${m}`;
  return leg.first ? `${zone} · ${leg.place.name} · ${m}` : `${leg.place.name} · ${m}`;
}

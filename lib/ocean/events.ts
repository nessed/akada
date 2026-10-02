/**
 * The things you only sometimes see.
 *
 * Each minute of focus is one roll against the zone's rare events, laid end
 * to end so at most one can happen, and no event follows another within
 * eight minutes. The odds are per minute and never rise with the length of
 * a sitting: a long sitting has more minutes to be lucky in, and no more
 * luck per minute than a short one.
 */

import type { Biome } from './biome';
import { depthAt } from './depth';
import { hash32 } from './random';
import { swimAge, type Swim } from './schedule';

export type EventKind =
  | 'whale'
  | 'storm'
  | 'eye'
  | 'leviathan'
  | 'turtle'
  | 'siphonophore'
  | 'lure'
  | 'dumbo'
  | 'whalefall'
  | 'oarfish'
  | 'manowar';

interface Spec {
  zones: number[];
  /** Expected per hour of focus spent in those zones. */
  perHour: number;
  seconds: number;
  /** How the recap says it. */
  phrase: string;
  /** Which is worth mentioning when several happened. */
  weight: number;
}

export const EVENTS: Record<EventKind, Spec> = {
  whale: { zones: [0, 1], perHour: 0.3, seconds: 35, phrase: 'a whale went over', weight: 500 },
  storm: { zones: [2, 3], perHour: 0.25, seconds: 75, phrase: 'the water lit up', weight: 400 },
  eye: { zones: [2, 3], perHour: 0.12, seconds: 16, phrase: "a giant squid's eye, briefly", weight: 700 },
  leviathan: { zones: [3, 4], perHour: 0.005, seconds: 40, phrase: 'something very large went past', weight: 1000 },
  turtle: { zones: [0, 1], perHour: 0.2, seconds: 34, phrase: 'a turtle came to look at the jelly', weight: 300 },
  siphonophore: { zones: [1, 2], perHour: 0.05, seconds: 90, phrase: 'a siphonophore longer than the page', weight: 600 },
  lure: { zones: [2, 3], perHour: 0.12, seconds: 24, phrase: 'a light in the dark, and teeth', weight: 350 },
  dumbo: { zones: [3, 4], perHour: 0.1, seconds: 45, phrase: 'a dumbo octopus', weight: 450 },
  // Arrives over its span, then stays on the floor for the rest of the sitting.
  whalefall: { zones: [3, 4], perHour: 0.04, seconds: 20, phrase: 'a whale fall on the floor', weight: 800 },
  oarfish: { zones: [1, 2], perHour: 0.006, seconds: 60, phrase: 'an oarfish, hanging in the dark', weight: 1100 },
  // A surface animal, so only in the first of the light.
  manowar: { zones: [0], perHour: 0.8, seconds: 50, phrase: "a Portuguese man o' war drifted over", weight: 250 },
};
const ORDER: EventKind[] = ['leviathan', 'eye', 'storm', 'whale'];
/* The second roll, added after the first had been out in the world: its
   events only land in minutes the first left well alone, so no saved
   sitting loses or moves anything it already had. */
const LATER: EventKind[] = ['oarfish', 'whalefall', 'siphonophore', 'dumbo', 'lure', 'turtle'];
/* The third, the same again: only in minutes both rolls before it left
   well alone, so nothing either of them put in a sitting moves. */
const LATEST: EventKind[] = ['manowar'];
const GAP_MINUTES = 8;
const MAX_SECONDS = 90;

function rawAt(biome: Biome, minute: number): EventKind | null {
  const zone = depthAt(minute * 60).zone;
  const u = hash32(biome.key, 'event', minute) / 4294967296;
  let edge = 0;
  for (const kind of ORDER) {
    const spec = EVENTS[kind];
    if (!spec.zones.includes(zone)) continue;
    edge += spec.perHour / 60;
    if (u < edge) return kind;
  }
  return null;
}

function laterAt(biome: Biome, minute: number): EventKind | null {
  return rollAt(biome, minute, 'event-later', LATER);
}

function latestAt(biome: Biome, minute: number): EventKind | null {
  return rollAt(biome, minute, 'event-latest', LATEST);
}

function rollAt(biome: Biome, minute: number, salt: string, kinds: EventKind[]): EventKind | null {
  const zone = depthAt(minute * 60).zone;
  const u = hash32(biome.key, salt, minute) / 4294967296;
  let edge = 0;
  for (const kind of kinds) {
    const spec = EVENTS[kind];
    if (!spec.zones.includes(zone)) continue;
    edge += spec.perHour / 60;
    if (u < edge) return kind;
  }
  return null;
}

export interface OceanEvent {
  kind: EventKind;
  /** Focus seconds at which it begins. */
  start: number;
  seconds: number;
  /** Its own roll, for which side, how high. */
  seed: number;
}

/** The event that begins in a given minute, if any. */
export function eventAtMinute(biome: Biome, minute: number): OceanEvent | null {
  if (minute < 1) return null;
  const kind = rawAt(biome, minute) ?? laterEventAt(biome, minute) ?? latestEventAt(biome, minute);
  if (!kind) return null;
  // Raw hits, not kept ones, so the rule never needs to look further back.
  if (rawAt(biome, minute)) for (let m = Math.max(1, minute - GAP_MINUTES); m < minute; m++) if (rawAt(biome, m)) return null;
  const seed = hash32(biome.key, 'event-seed', minute);
  return { kind, start: minute * 60 + (seed % 20), seconds: EVENTS[kind].seconds, seed };
}

/** A later roll's event, kept only with the first roll quiet for the gap either side of it. */
function laterEventAt(biome: Biome, minute: number): EventKind | null {
  const kind = laterAt(biome, minute);
  if (!kind) return null;
  for (let m = Math.max(1, minute - GAP_MINUTES); m <= minute + GAP_MINUTES; m++) if (rawAt(biome, m)) return null;
  for (let m = Math.max(1, minute - GAP_MINUTES); m < minute; m++) if (laterAt(biome, m)) return null;
  return kind;
}

/** The third roll's event, kept only with both rolls before it quiet for the gap either side (their raw hits, kept or not). */
function latestEventAt(biome: Biome, minute: number): EventKind | null {
  const kind = latestAt(biome, minute);
  if (!kind) return null;
  for (let m = Math.max(1, minute - GAP_MINUTES); m <= minute + GAP_MINUTES; m++) if (rawAt(biome, m) || laterAt(biome, m)) return null;
  for (let m = Math.max(1, minute - GAP_MINUTES); m < minute; m++) if (latestAt(biome, m)) return null;
  return kind;
}

/** The first event of a kind at or before `t`, for the ones that stay once they arrive. */
export function firstEventUpTo(biome: Biome, kind: EventKind, t: number): OceanEvent | null {
  for (let m = 1; m * 60 <= t; m++) {
    const e = eventAtMinute(biome, m);
    if (e && e.kind === kind && e.start <= t) return e;
  }
  return null;
}

/** Events under way at `t`, with how far through each is (0 to 1). Like the
    animals, one begins on a focus second and plays out on the swim clock. */
export function eventsAt(biome: Biome, t: number, swim?: Swim): { event: OceanEvent; age: number }[] {
  const out: { event: OceanEvent; age: number }[] = [];
  for (let m = Math.max(1, Math.floor((t - MAX_SECONDS - 20) / 60)); m <= Math.floor(t / 60); m++) {
    const e = eventAtMinute(biome, m);
    if (!e) continue;
    if (e.start > t) continue;
    const age = swimAge(t, e.start, swim) / e.seconds;
    if (age >= 0 && age < 1) out.push({ event: e, age });
  }
  return out;
}

/** Every event from the start of the sitting up to `t`. */
export function eventsUpTo(biome: Biome, t: number): OceanEvent[] {
  const out: OceanEvent[] = [];
  for (let m = 1; m * 60 <= t; m++) {
    const e = eventAtMinute(biome, m);
    if (e && e.start <= t) out.push(e);
  }
  return out;
}

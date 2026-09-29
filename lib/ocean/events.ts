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

export type EventKind = 'whale' | 'storm' | 'eye' | 'leviathan';

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
};
const ORDER: EventKind[] = ['leviathan', 'eye', 'storm', 'whale'];
const GAP_MINUTES = 8;
const MAX_SECONDS = 75;

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
  const kind = rawAt(biome, minute);
  if (!kind) return null;
  // Raw hits, not kept ones, so the rule never needs to look further back.
  for (let m = Math.max(1, minute - GAP_MINUTES); m < minute; m++) if (rawAt(biome, m)) return null;
  const seed = hash32(biome.key, 'event-seed', minute);
  return { kind, start: minute * 60 + (seed % 20), seconds: EVENTS[kind].seconds, seed };
}

/** Events under way at `t`, with how far through each is (0 to 1). */
export function eventsAt(biome: Biome, t: number): { event: OceanEvent; age: number }[] {
  const out: { event: OceanEvent; age: number }[] = [];
  for (let m = Math.max(1, Math.floor((t - MAX_SECONDS - 20) / 60)); m <= Math.floor(t / 60); m++) {
    const e = eventAtMinute(biome, m);
    if (!e) continue;
    const age = (t - e.start) / e.seconds;
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

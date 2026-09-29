/**
 * How deep a sitting has gone.
 *
 * Depth is focus time and nothing else: a break is a rest on a ledge and a
 * pause holds you where you are, so neither sinks you, and since focus time
 * only ever goes up, nothing ever brings you back toward the surface. The
 * zones are the ocean's real ones, spaced so a single 25-minute block leaves
 * the light behind and a long night reaches the floor.
 */

export type ZoneName = 'sunlight' | 'twilight' | 'midnight' | 'abyss' | 'trench';

export interface Zone {
  name: ZoneName;
  /** Minutes of focus at which the zone begins and ends. */
  from: number;
  to: number;
  /** Metres at either end. */
  m0: number;
  m1: number;
  /** The generator's depth dial across the zone, 0 at the surface to 1. */
  z0: number;
  z1: number;
}

export const ZONES: Zone[] = [
  { name: 'sunlight', from: 0, to: 15, m0: 0, m1: 200, z0: 0, z1: 0.3 },
  { name: 'twilight', from: 15, to: 50, m0: 200, m1: 1000, z0: 0.3, z1: 0.6 },
  { name: 'midnight', from: 50, to: 110, m0: 1000, m1: 4000, z0: 0.6, z1: 0.85 },
  { name: 'abyss', from: 110, to: 180, m0: 4000, m1: 6000, z0: 0.85, z1: 0.96 },
  // Past three hours the descent slows right down; the trench is somewhere
  // you drift into, not something you are sent to.
  { name: 'trench', from: 180, to: 600, m0: 6000, m1: 11000, z0: 0.96, z1: 1 },
];

export interface Depth {
  meters: number;
  zone: number;
  name: ZoneName;
  /** How far through its zone, 0 to 1. */
  zoneT: number;
  /** The generator's depth dial, 0 to 1, continuous across zones. */
  z: number;
}

export function depthAt(focusSeconds: number): Depth {
  const min = Math.max(0, Number.isFinite(focusSeconds) ? focusSeconds : 0) / 60;
  let zone = ZONES.length - 1;
  for (let i = 0; i < ZONES.length; i++) {
    if (min < ZONES[i].to) {
      zone = i;
      break;
    }
  }
  const zn = ZONES[zone];
  const zoneT = Math.min(1, (min - zn.from) / (zn.to - zn.from));
  return {
    meters: Math.round(zn.m0 + (zn.m1 - zn.m0) * zoneT),
    zone,
    name: zn.name,
    zoneT,
    z: zn.z0 + (zn.z1 - zn.z0) * zoneT,
  };
}

/** The depth dial at the middle of a zone, which is what its species are rolled at. */
export function zoneMid(zone: number): number {
  const zn = ZONES[Math.max(0, Math.min(ZONES.length - 1, zone))];
  return (zn.z0 + zn.z1) / 2;
}

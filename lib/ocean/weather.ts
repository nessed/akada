/**
 * The weather over the sea, by the day.
 *
 * Every sitting opens in the light, so the light is what a reader who sits
 * every day sees most; and the light under the sea is the weather over it.
 * A bright day's water is laced with light off the surface and cut by
 * shafts; an overcast day's is greyer and flat, the light come down soft
 * from everywhere; rain pocks the surface, greys the water further and
 * hisses in the tank; and a swell running sets the shallows surging, the
 * light racing over everything and the snow swinging back and forth.
 *
 * It is the day's: every sitting on one day has the same weather, read off
 * the day in the sitting's key like the season, so a sitting dived again is
 * under its own sky. Weather comes in spells, so a day is often the one
 * before it again. It all eases out with depth (by the end of the light it
 * is gone), and nothing on the page names it.
 */

import { hash32 } from './random';
import { sittingTime } from './season';

export type WeatherKind = 'bright' | 'clear' | 'overcast' | 'rain' | 'swell';

export interface Weather {
  kind: WeatherKind;
  /** The light off the surface, against a clear day's. */
  light: number;
  /** The shafts, against a clear day's. */
  shafts: number;
  /** How much the shallows surge back and forth, against a clear day's. */
  surge: number;
  /** Rain on the surface, 0 or 1. */
  rain: number;
  /** How far the light water greys, 0 to 1. */
  grey: number;
}

const LOOKS: Record<WeatherKind, Weather> = {
  bright: { kind: 'bright', light: 1.2, shafts: 1.25, surge: 1, rain: 0, grey: 0 },
  clear: { kind: 'clear', light: 1, shafts: 1, surge: 1, rain: 0, grey: 0 },
  overcast: { kind: 'overcast', light: 0.4, shafts: 0.3, surge: 0.9, rain: 0, grey: 0.6 },
  rain: { kind: 'rain', light: 0.3, shafts: 0.22, surge: 1.2, rain: 1, grey: 0.85 },
  swell: { kind: 'swell', light: 1.1, shafts: 1, surge: 2.4, rain: 0, grey: 0.1 },
};

const ODDS: [WeatherKind, number][] = [
  ['bright', 0.3],
  ['clear', 0.27],
  ['overcast', 0.2],
  ['swell', 0.13],
  ['rain', 0.1],
];

const DAY = 86400000;

/** The weather of a day (days since 1970): often the day before's again, otherwise its own roll. */
export function weatherOfDay(day: number, depth = 0): WeatherKind {
  const keep = hash32('weather-keep', day) / 4294967296;
  if (depth < 4 && keep < 0.45) return weatherOfDay(day - 1, depth + 1);
  let u = hash32('weather', day) / 4294967296;
  for (const [kind, p] of ODDS) {
    u -= p;
    if (u < 0) return kind;
  }
  return 'clear';
}

/** The weather over a sitting: its day's, or a clear day's for a key with no time in it. */
export function weatherOf(sittingKey: string): Weather {
  const ms = sittingTime(sittingKey);
  if (ms == null) return LOOKS.clear;
  return LOOKS[weatherOfDay(Math.floor(ms / DAY))];
}

/** How much of the weather reaches down to a depth dial `z`: all of it at the surface, none past the light. */
export function weatherReach(z: number): number {
  const t = Math.max(0, Math.min(1, z / 0.42));
  return 1 - t * t * (3 - 2 * t);
}

/** The grey a day's weather lays over the light water, as a place's haze is laid. */
export function weatherHaze(w: Weather, z: number): [string, number] | undefined {
  const k = w.grey * 0.3 * weatherReach(z);
  return k > 0.005 ? ['#8C9398', k] : undefined;
}

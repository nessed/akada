/**
 * What the place and the moment add to the tank's sound, for the deep
 * (`useAquariumSound`). Read off the same sitting the scene draws, so the
 * sound and the picture agree: a cold seep fizzes, a vent field roars low
 * (and the sitting's own two vents a little, once there is a floor), a
 * slide of silt rumbles while it passes, swelling and dying away with it;
 * a sperm whale hunting at midnight knocks, a click a second, while it is
 * there.
 */

import type { Biome } from './biome';
import { depthAt } from './depth';
import { eventsAt } from './events';
import { legAt } from './places';

/** What the place and the moment add to the tank, each 0 (none) to 1. */
export interface TankScene {
  /** A cold seep's gas coming up through the silt. */
  fizz: number;
  /** A vent field. */
  roar: number;
  /** A slide of silt rolling past. */
  rumble: number;
  /** A sperm whale's clicks, knocking through the water while it hunts. */
  clicks: number;
}

export const QUIET: TankScene = { fizz: 0, roar: 0, rumble: 0, clicks: 0 };

export function tankScene(biome: Biome, focusSeconds: number): TankScene {
  const t = Math.max(0, focusSeconds);
  const place = biome.route[legAt(biome.route, t)].place;
  const zone = depthAt(t).zone;
  const fizz = place.floor === 'seep' ? 1 : 0;
  const roar = place.vents ? 1 : zone >= 3 && biome.env.vents ? 0.35 : 0;
  let rumble = 0;
  let clicks = 0;
  for (const { event, age } of eventsAt(biome, t)) {
    // In over its first fifth, out over its last half, stepped so the
    // caller only hears about a change every few seconds.
    if (event.kind === 'mudslide') rumble = Math.round(Math.max(0, Math.min(1, age / 0.2, (1 - age) / 0.5)) * 10) / 10;
    // The whale's clicks come and go with it.
    if (event.kind === 'spermwhale') clicks = Math.round(Math.max(0, Math.min(1, age / 0.15, (1 - age) / 0.25)) * 10) / 10;
  }
  return { fizz, roar, rumble, clicks };
}

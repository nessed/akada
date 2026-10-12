/**
 * The sea a sitting swims through: its water, its current, the places it
 * passes, and who lives in each of them.
 *
 * Each leg of the dive (`places.ts`) has a pool of species, and every animal
 * that swims by is one of them (`pool.ts`). Within a pool a few species are
 * common and most are rare (a long tail), so a sitting is mostly familiar
 * faces and, now and then, something you will not meet twice; and as the
 * reader sinks from one place to the next, the faces change.
 */

import { routeOf, type Leg } from './places';
import { composePool, type Species } from './pool';
import { chance, hash32, int, mulberry32, range } from './random';

export type { Species } from './pool';

export interface Env {
  /** Which way the water is going: everything leans with it. */
  current: 1 | -1;
  /** How much is suspended in the water, 0.5 clear to 1 thick. */
  visibility: number;
  shafts: number;
  shaftTilt: number;
  /** Kelp at the edges of the sunlit water. */
  kelp: boolean;
  /** What lies on the floor, when there is one. */
  vents: boolean;
  wreck: boolean;
}

export interface Biome {
  key: string;
  env: Env;
  /** The places the dive passes, leg by leg. */
  route: Leg[];
  /** Each leg's pool, in the route's order. */
  pools: Species[][];
}

export function rollBiome(sittingKey: string, courseKey: string): Biome {
  const r = mulberry32(hash32(sittingKey, 'env'));
  const env: Env = {
    current: r() < 0.5 ? 1 : -1,
    visibility: range(r, 0.5, 1),
    shafts: int(r, 3, 7),
    shaftTilt: range(r, -0.35, 0.35),
    kelp: chance(r, 0.55),
    vents: chance(r, 0.5),
    wreck: chance(r, 0.08),
  };
  const route = routeOf(sittingKey, env.kelp);
  const pools = route.map((leg) => composePool({ courseKey, sittingKey }, leg, leg.place));
  return { key: sittingKey, env, route, pools };
}

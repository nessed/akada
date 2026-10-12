/**
 * Who lives in one leg of the dive: its pool of species.
 *
 * Every leg (`places.ts`) has its own pool, so the animals turn over as the
 * reader sinks from one place to the next. Half of a pool is rolled from the
 * course and comes back every time that course is studied (its regulars),
 * half from the sitting and is never seen again. The first leg of each zone
 * rolls exactly the seeds the zone's one pool used to, so a sitting's
 * opening animals in every zone are the ones it always had.
 */

import { zoneMid } from './depth';
import { FLOOR_PLANS, rollGenome, rollPlan, type Genome } from './genome';
import { speciesName } from './names';
import type { Leg, Place } from './places';
import { chance, hash32, int, mulberry32, range } from './random';

export interface Species {
  id: string;
  seed: number;
  zone: number;
  /** The leg of the dive whose pool it is in. */
  leg: number;
  genome: Genome;
  name: string;
  /** Relative odds of being the one that swims by. */
  abundance: number;
  /** Members in a school, or 0 for a loner. */
  school: number;
  /** Comes over to look at the jelly. */
  curious: boolean;
  /** Relative swimming speed, about 1 for a fish. */
  speed: number;
  /** Lives on the floor rather than in the water. */
  floor: boolean;
  /** Seconds between its lights blinking, for species that carry lights. */
  blink: number;
  /** Whether it came from the course's sea (true) or this sitting's. */
  regular: boolean;
}

/** Species to a pool. */
export const POOL_SIZE = 12;
const SPEED: Record<Genome['plan'], number> = {
  fish: 1, eel: 0.7, ray: 0.8, squid: 1.1, bell: 0.35, comb: 0.3, chain: 0.25, star: 0.05, crawler: 0.1,
};

function rollSpecies(src: string, leg: Leg, i: number, regular: boolean): Species {
  const zone = leg.zone;
  // A zone's first leg keeps the seeds of the zone's old single pool.
  const seed = leg.first ? hash32(src, 'species', zone, i) : hash32(src, 'species', zone, i, 'leg', leg.index);
  const r = mulberry32(seed);
  const floor = zone >= 3 && i % 4 === 0;
  const z = Math.min(1, zoneMid(zone) + range(r, -0.05, 0.05));
  const plan = floor ? rollPlan(r, z, true) : rollPlan(r, z);
  const genome = rollGenome(seed, z, plan);
  const schooling = plan === 'fish' && zone <= 1 && chance(r, 0.45);
  return {
    id: `${zone}:${seed}`,
    seed,
    zone,
    leg: leg.index,
    genome,
    name: speciesName(genome, seed),
    abundance: 1,
    school: schooling ? int(r, 6, 14) : 0,
    curious: (plan === 'fish' || plan === 'squid' || plan === 'ray') && chance(r, 0.18),
    speed: SPEED[plan] * range(r, 0.85, 1.15),
    floor: FLOOR_PLANS.includes(plan),
    blink: range(r, 1.4, 5),
    regular,
  };
}

/**
 * A leg's pool. `place` says where it is (and which kinds of fish belong
 * there, in `place.fishForms`); the pool is then given its long tail: order
 * it by a roll of the sitting and give each rank a share that falls away
 * (Zipf), so which species are common changes from sitting to sitting even
 * among the course's regulars. Division only: which animal swims by must
 * come out the same in every browser, and the engines are allowed to
 * disagree in the last bit of a power.
 */
export function composePool(src: { courseKey: string; sittingKey: string }, leg: Leg, place: Place): Species[] {
  void place;
  const pool: Species[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const regular = i % 2 === 0;
    pool.push(rollSpecies(regular ? src.courseKey : src.sittingKey, leg, i, regular));
  }
  const order = pool
    .map((sp) => ({ sp, k: hash32(src.sittingKey, 'rank', sp.id) }))
    .sort((a, b) => a.k - b.k);
  order.forEach(({ sp }, rank) => {
    sp.abundance = 1 / (rank + 2);
  });
  return pool;
}

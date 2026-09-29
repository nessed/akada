/**
 * The sea a sitting swims through: its water, its current, and who lives in
 * each zone of it.
 *
 * Each zone has a pool of species, and every animal that swims by is one of
 * them. Half of each pool is rolled from the course and comes back every time
 * that course is studied, so a course's sea has its regulars; the other half
 * is rolled from the sitting and is never seen again. Within a pool a few
 * species are common and most are rare (a long tail), so a sitting is mostly
 * familiar faces and, now and then, something you will not meet twice.
 */

import { ZONES, zoneMid } from './depth';
import { FLOOR_PLANS, rollGenome, rollPlan, type Genome } from './genome';
import { speciesName } from './names';
import { chance, hash32, int, mulberry32, range } from './random';

export interface Species {
  id: string;
  seed: number;
  zone: number;
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
  pools: Species[][];
}

const PER_ZONE = 12;
const SPEED: Record<Genome['plan'], number> = {
  fish: 1, eel: 0.7, ray: 0.8, squid: 1.1, bell: 0.35, comb: 0.3, chain: 0.25, star: 0.05, crawler: 0.1,
};

function rollSpecies(src: string, zone: number, i: number, regular: boolean): Species {
  const seed = hash32(src, 'species', zone, i);
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
  const pools = ZONES.map((_, zone) => {
    const pool: Species[] = [];
    for (let i = 0; i < PER_ZONE; i++) {
      const regular = i % 2 === 0;
      pool.push(rollSpecies(regular ? courseKey : sittingKey, zone, i, regular));
    }
    // The long tail: order the pool by a roll of the sitting, then give each
    // rank a share that falls away (Zipf), so which species are common changes
    // from sitting to sitting even among the course's regulars. Division only:
    // which animal swims by must come out the same in every browser, and the
    // engines are allowed to disagree in the last bit of a power.
    const order = pool
      .map((sp) => ({ sp, k: hash32(sittingKey, 'rank', sp.id) }))
      .sort((a, b) => a.k - b.k);
    order.forEach(({ sp }, rank) => {
      sp.abundance = 1 / (rank + 2);
    });
    return pool;
  });
  return { key: sittingKey, env, pools };
}

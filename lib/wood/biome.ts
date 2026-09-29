import { animalName, planFor, rollAnimal, seenAt, type AnimalGenome } from './fauna';
import { rollLand, type Land } from './flora';
import { dice, hash32, zipf } from './random';
import { STAGES, type Stage } from './succession';

/**
 * One sitting's wood: its weather, its land and who lives in it.
 *
 * Every stage of the wood has its own pool of species. Half of each pool is
 * rolled from the course and half from the sitting, so a course grows the
 * same regulars sitting after sitting (the robin that is always at ECON 100)
 * while every sitting still brings strangers. Within a pool the species are
 * ranked on a long tail: a few turn up all the time, most are seen once in a
 * while, and one or two almost never. Nothing says which is which.
 */

export type Season = 'spring' | 'summer' | 'autumn';
export type Weather = 'clear' | 'haze' | 'drizzle';

export interface WoodEnv {
  season: Season;
  weather: Weather;
  /** How windy the sitting is, 0.2 to 1, and from which side. */
  wind: number;
  windDir: 1 | -1;
  /** The moon's phase, 0 new to 0.5 full, and where it hangs. */
  moon: number;
  moonX: number;
  /** A seed for the stars. */
  stars: number;
}

export interface Species {
  id: string;
  seed: number;
  genome: AnimalGenome;
  name: string;
  stage: Stage;
  /** Share of the stage's arrivals, from the long tail. */
  weight: number;
  /** Whether the course brought it. */
  regular: boolean;
}

export interface Wood {
  key: string;
  env: WoodEnv;
  pools: Record<Stage, Species[]>;
  land: Land;
}

/** Species in each stage's pool. */
export const POOL_SIZE = 12;

export function rollEnv(key: string): WoodEnv {
  const d = dice(hash32(key, 'env'));
  return {
    season: d.weighted([
      ['spring', 1],
      ['summer', 1.3],
      ['autumn', 1],
    ]),
    weather: d.weighted([
      ['clear', 3],
      ['haze', 1.2],
      ['drizzle', 0.7],
    ]),
    wind: d.range(0.2, 1),
    windDir: d.chance(0.5) ? 1 : -1,
    moon: d.next(),
    // Off to one side, never behind the tree's crown.
    moonX: d.chance(0.5) ? d.range(0.08, 0.26) : d.range(0.74, 0.92),
    stars: hash32(key, 'stars'),
  };
}

function rollPool(key: string, course: string, stage: Stage): Species[] {
  const out: Species[] = [];
  const half = POOL_SIZE / 2;
  for (let i = 0; i < POOL_SIZE; i++) {
    const regular = i < half;
    const source = regular ? course : key;
    const seed = hash32(source, 'species', stage, i);
    const d = dice(seed);
    // Keep both hours stocked: the first slots of each half are held for a
    // day animal and a night one, so a night wood is never empty and a day
    // wood always has birds.
    const slot = i % half;
    const need = slot === 0 ? 'day' : slot === 1 ? 'night' : slot === 2 ? 'day' : slot === 3 ? 'night' : undefined;
    const plan = planFor(stage, d, need);
    const genome = rollAnimal(hash32(seed, 'genome'), plan);
    out.push({
      id: `${stage}:${regular ? 'c' : 's'}${slot}:${seed.toString(36)}`,
      seed,
      genome,
      name: animalName(genome, seed, stage),
      stage,
      weight: 0,
      regular,
    });
  }
  // Rank them on the long tail, in an order the sitting rolls.
  const order = out.map((_, i) => i);
  const shuffle = dice(hash32(key, 'rank', stage));
  for (let i = order.length - 1; i > 0; i--) {
    const j = shuffle.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const weights = zipf(out.length);
  order.forEach((index, rank) => {
    out[index].weight = weights[rank];
  });
  return out;
}

export function rollWood(key: string, course: string): Wood {
  const pools = {} as Record<Stage, Species[]>;
  for (const spec of STAGES) pools[spec.key] = rollPool(key, course, spec.key);
  return { key, env: rollEnv(key), pools, land: rollLand(key) };
}

/** The species a view can see, day or night, with their weights renormalised. */
export function visible(pool: readonly Species[], night: boolean): { species: Species[]; weights: number[] } {
  const species = pool.filter((sp) => seenAt(sp.genome.activity, night) && sp.genome.plan !== 'firefly');
  const total = species.reduce((sum, sp) => sum + sp.weight, 0) || 1;
  return { species, weights: species.map((sp) => sp.weight / total) };
}

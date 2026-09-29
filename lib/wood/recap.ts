import type { Species, Wood } from './biome';
import { MIN_DENSITY, spawnAt } from './schedule';
import { successionAt } from './succession';

/**
 * What the log sheet says about the wood, and only what is true of it: how
 * far the land got, and the rarest animal that came while the reader sat.
 * No counts, no score, nothing to beat. It is worked out from the key and
 * the focus time alone, so the same sitting always reads the same.
 */
export interface WoodRecap {
  /** "young wood" */
  stage: string;
  years: number;
  /** The rarest species that showed itself on every size of screen. */
  notable: Species | null;
}

/* Arrivals in the last few seconds were still off the edge of the view
   when the sitting ended, so nobody saw them. */
const UNSEEN_TAIL = 12;

export function woodRecap(wood: Wood, focus: number, night: boolean): WoodRecap {
  const s = successionAt(focus);
  let notable: Species | null = null;
  const last = Math.floor(focus) - UNSEEN_TAIL;
  for (let slot = 0; slot <= last; slot++) {
    const sp = spawnAt(wood, slot, night);
    if (!sp || sp.rank >= MIN_DENSITY) continue;
    if (!notable || sp.species.weight < notable.weight) notable = sp.species;
  }
  return { stage: s.name, years: s.years, notable };
}

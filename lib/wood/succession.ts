/**
 * How the land ages.
 *
 * Left alone, a field goes to meadow, then to scrub, then to young wood, and
 * given long enough to old growth. The wood does the same on the sitting's
 * focus time: the first minutes are grass coming up round the tree, the
 * second hour is a wood. It only ever goes forward. A break is not focus, so
 * the land waits through it; nothing is ever taken back.
 */

export type Stage = 'meadow' | 'scrub' | 'young' | 'high' | 'old';

export interface StageSpec {
  key: Stage;
  /** What the reader is told, lower case: "young wood". */
  name: string;
  /** Minutes of focus the stage begins at. */
  from: number;
  /** Years of growth at its start. */
  years: number;
}

export const STAGES: readonly StageSpec[] = [
  { key: 'meadow', name: 'meadow', from: 0, years: 0 },
  { key: 'scrub', name: 'scrub', from: 15, years: 5 },
  { key: 'young', name: 'young wood', from: 50, years: 20 },
  { key: 'high', name: 'high wood', from: 110, years: 60 },
  { key: 'old', name: 'old growth', from: 180, years: 150 },
];

/* Past the last boundary old growth keeps ageing, a year every two minutes
   of focus, and its own share of the drawing fills in over about two hours. */
const OLD_YEARS_PER_MINUTE = 0.5;
const OLD_FILL_MINUTES = 120;

export interface Succession {
  stage: Stage;
  /** 0 for meadow up to 4 for old growth. */
  index: number;
  name: string;
  /** How far through its stage the land is, 0 to 1. */
  t: number;
  /** Whole years of growth: the figure beside the stage's name. */
  years: number;
  /** How grown the land is overall, 0 to 1: what every element's arrival
      is measured against. */
  z: number;
}

export function successionAt(focusSeconds: number): Succession {
  const minutes = Math.max(0, focusSeconds) / 60;
  let index = 0;
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (minutes >= STAGES[i].from) {
      index = i;
      break;
    }
  }
  const spec = STAGES[index];
  const next = STAGES[index + 1];
  let t: number;
  let years: number;
  if (next) {
    t = (minutes - spec.from) / (next.from - spec.from);
    years = spec.years + (next.years - spec.years) * t;
  } else {
    const past = minutes - spec.from;
    t = 1 - Math.exp(-past / OLD_FILL_MINUTES);
    years = spec.years + past * OLD_YEARS_PER_MINUTE;
  }
  t = Math.min(1, Math.max(0, t));
  return {
    stage: spec.key,
    index,
    name: spec.name,
    t,
    years: Math.floor(years),
    z: Math.min(1, (index + t) / STAGES.length),
  };
}

/**
 * How far along something is that starts arriving at `from` on the z scale
 * and is fully there by `from + over`: 0 before, 1 after, eased between, so
 * nothing in the wood pops in.
 */
export function arrival(z: number, from: number, over = 0.06): number {
  const t = Math.min(1, Math.max(0, (z - from) / over));
  return t * t * (3 - 2 * t);
}

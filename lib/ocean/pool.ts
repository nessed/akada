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
import { FLOOR_PLANS, FORMS, formsIn, rollGenome, rollPlan, type FishForm, type Genome } from './genome';
import { speciesName } from './names';
import type { Leg, Place } from './places';
import { chance, hash32, int, mulberry32, range, weighted, type Rand } from './random';

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
/** A form's own pace, against a jack's: a mola barely moves, a barracuda darts, a swordfish is the fastest thing in the sea. */
const FORM_SPEED: Partial<Record<FishForm, number>> = {
  sunfish: 0.4, puffer: 0.55, disc: 0.7, barracuda: 1.3, barreleye: 0.45, hatchet: 0.6, snailfish: 0.5,
  grenadier: 0.6, cusk: 0.6, fangtooth: 0.7, angler: 0.6, gulper: 0.5, eelpout: 0.12, flatfish: 0.08, tripod: 0.05,
  grouper: 0.55, trigger: 0.65, flying: 1.25, trumpet: 0.45, swordfish: 1.45, swallower: 0.6,
  snipe: 0.5, whalefish: 0.6, chimaera: 0.55, lizard: 0.06, cutthroat: 0.65, ethereal: 0.45,
};

/**
 * Most fish a pool carries, by zone: the deep has fewer kinds, and a pool's
 * fish are different kinds of fish, not more of them.
 */
export const FISH_BUDGET = [7, 7, 6, 5, 4];
/** And never fewer: no stretch of the dive is fishless. */
export const FISH_FLOOR = 2;

/** One place in a pool, rolled up to its plan; its form is chosen with the rest of the pool. */
interface Slot {
  i: number;
  seed: number;
  r: Rand;
  z: number;
  regular: boolean;
  /** One of the pool's floor places. */
  ground: boolean;
  plan: Genome['plan'];
  form: FishForm | null;
}

function slotOf(src: string, leg: Leg, i: number, regular: boolean): Slot {
  const zone = leg.zone;
  // A zone's first leg keeps the seeds of the zone's old single pool.
  const seed = leg.first ? hash32(src, 'species', zone, i) : hash32(src, 'species', zone, i, 'leg', leg.index);
  const r = mulberry32(seed);
  const ground = zone >= 3 && i % 4 === 0;
  const z = Math.min(1, zoneMid(zone) + range(r, -0.05, 0.05));
  const plan = ground ? rollPlan(r, z, true) : rollPlan(r, z);
  return { i, seed, r, z, regular, ground, plan, form: null };
}

function speciesOf(s: Slot, leg: Leg, twin: Genome | null): Species {
  const { seed, r, z, plan, form } = s;
  const zone = leg.zone;
  const genome = rollGenome(seed, z, plan, form);
  if (twin) {
    // A second of a schooling kind looks like another species of it: its
    // own colour and its own markings.
    genome.hue = (twin.hue + 3 + (seed % 5)) % 10;
    const marks: Genome['pattern'][] = ['none', 'spots', 'stripes', 'bands'];
    genome.pattern = marks.filter((m) => m !== twin.pattern)[seed % 3];
    genome.patN = Math.max(4, genome.patN ?? 6);
  }
  const schooling = !!form && !!FORMS[form].school && chance(r, 0.6);
  return {
    id: `${zone}:${seed}`,
    seed,
    zone,
    leg: leg.index,
    genome,
    name: speciesName(genome, seed),
    abundance: 1,
    school: schooling ? int(r, 6, 14) : 0,
    curious: (plan === 'fish' || plan === 'squid' || plan === 'ray') && !(form && (FORMS[form].floor || FORMS[form].low)) && chance(r, 0.18),
    speed: (form ? FORM_SPEED[form] ?? 1 : SPEED[plan]) * range(r, 0.85, 1.15),
    floor: FLOOR_PLANS.includes(plan) || (!!form && !!FORMS[form].floor),
    blink: range(r, 1.4, 5),
    regular: s.regular,
  };
}

/**
 * The fish of a pool, chosen as a set: at most the zone's budget and never
 * fewer than two, every one a different kind (a schooling kind may come
 * twice, as two species that look different), each from the forms that
 * live at that depth. The course's regulars choose first and from their
 * own dice alone, so they are the same animals in every sitting; the
 * sitting's own then lean toward the kinds its place is known for.
 */
/**
 * How readily a slot becomes one of a few kinds, against the odds a slot
 * gets where there are `full` weights' worth of them: so where only one kind
 * could be it, that one kind is not in every pool.
 */
function kinds(forms: FishForm[], full: number): number {
  return Math.min(1, forms.reduce((w, f) => w + FORMS[f].weight, 0) / full);
}

function chooseFish(slots: Slot[], leg: Leg, place: Place) {
  const zone = leg.zone;
  const budget = FISH_BUDGET[zone] ?? 4;
  const used = new Map<FishForm, number>();
  let fish = 0;
  const wish = new Set(place.fishForms);
  const pick = (s: Slot, floor: boolean): FishForm | null => {
    const r = mulberry32(hash32(s.seed, 'form'));
    const can = formsIn(zone, floor).filter((f) => {
      const n = used.get(f) ?? 0;
      return n === 0 || (n === 1 && FORMS[f].school);
    });
    if (!can.length) return null;
    return weighted(r, can.map((f) => [f, FORMS[f].weight * (s.regular ? 1 : wish.has(f) ? 3 : 1) * ((used.get(f) ?? 0) ? 0.3 : 1)] as [FishForm, number]));
  };
  const take = (s: Slot, f: FishForm) => {
    s.form = f;
    s.plan = FORMS[f].plan;
    used.set(f, (used.get(f) ?? 0) + 1);
    fish++;
  };
  const order = [...slots.filter((s) => s.regular), ...slots.filter((s) => !s.regular)];
  for (const s of order) {
    const r = mulberry32(hash32(s.seed, 'fish'));
    if (s.ground) {
      // Now and then something on the floor is a fish lying there: less
      // often where only one kind lies on it.
      const f = fish < budget && r() < 0.35 * kinds(formsIn(zone, true), 2) ? pick(s, true) : null;
      if (f) take(s, f);
      continue;
    }
    if (s.plan === 'eel') {
      // Now and then an eel is one of the eel forms that live here (a
      // gulper, a snipe eel, a cutthroat); the rest stay plain eels.
      const eels = formsIn(zone).filter((f) => FORMS[f].plan === 'eel' && !used.get(f));
      if (eels.length && fish < budget && r() < 0.35 * kinds(eels, 1.2)) {
        const fr = mulberry32(hash32(s.seed, 'form'));
        take(s, weighted(fr, eels.map((f) => [f, FORMS[f].weight * (!s.regular && wish.has(f) ? 3 : 1)] as [FishForm, number])));
      }
      continue;
    }
    if (s.plan !== 'fish') continue;
    const f = fish < budget ? pick(s, false) : null;
    if (f) {
      take(s, f);
      continue;
    }
    // Past the budget: something else lives here instead.
    let plan: Genome['plan'] = 'squid';
    for (let k = 0; k < 8; k++) {
      const p = rollPlan(r, s.z);
      if (p !== 'fish') {
        plan = p;
        break;
      }
    }
    s.plan = plan;
  }
  // The floor of two: the sitting's own swimmers become fish until there are.
  for (const s of slots) {
    if (fish >= FISH_FLOOR) break;
    if (s.regular || s.ground || s.form) continue;
    const f = pick(s, false);
    if (f) take(s, f);
  }
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
  const slots: Slot[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const regular = i % 2 === 0;
    slots.push(slotOf(regular ? src.courseKey : src.sittingKey, leg, i, regular));
  }
  chooseFish(slots, leg, place);
  const pool: Species[] = [];
  const first = new Map<FishForm, Genome>();
  for (const s of slots) {
    const twin = s.form ? first.get(s.form) ?? null : null;
    const sp = speciesOf(s, leg, twin);
    if (s.form && !twin) first.set(s.form, sp.genome);
    pool.push(sp);
  }
  const order = pool
    .map((sp) => ({ sp, k: hash32(src.sittingKey, 'rank', sp.id) }))
    .sort((a, b) => a.k - b.k);
  order.forEach(({ sp }, rank) => {
    sp.abundance = 1 / (rank + 2);
  });
  return pool;
}

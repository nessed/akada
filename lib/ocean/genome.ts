/**
 * What a creature is, rolled.
 *
 * Every animal in the ocean is a genome: a body plan and a list of traits,
 * each a dice roll. The rolls follow a body grammar (a ray has no dorsal
 * fin, a crawler has legs, only the deep grow lures) and the depth leans on
 * the dice, so what comes out reads as something that could live down there
 * rather than a pile of parts. The drawing is `anatomy.ts`; this is only the
 * recipe, plain data, so it can be mutated, compared and tested.
 */

import { ZONES, zoneMid } from './depth';
import { chance, int, mulberry32, range, weighted, type Rand } from './random';

export type Plan = 'bell' | 'comb' | 'star' | 'chain' | 'fish' | 'eel' | 'ray' | 'squid' | 'crawler';
export const RADIAL_PLANS: Plan[] = ['bell', 'comb', 'star', 'chain'];
/** The plans that live on the floor, not in the water. */
export const FLOOR_PLANS: Plan[] = ['star', 'crawler'];

export type TentacleStyle = 'straight' | 'wavy' | 'coiled' | 'beaded';
export type Tail = 'fork' | 'round' | 'lunate' | 'filament' | 'fan' | 'none';
export type Pattern = 'none' | 'spots' | 'stripes' | 'bands' | 'reticulate';
export type FinShape = 'tri' | 'sail' | 'frill' | 'spines';

/**
 * What kind of fish a fish is. A body plan says fish; a form says which
 * family, each a real one with its own silhouette, fins and way of moving,
 * so a sea's fish are different animals and not one animal in different
 * colours. The dice still roll inside a form (size, colour, markings,
 * lights, glass), so two species of one form still differ.
 */
export type FishForm =
  | 'jack'
  | 'sardine'
  | 'disc'
  | 'puffer'
  | 'barracuda'
  | 'sunfish'
  | 'lantern'
  | 'hatchet'
  | 'barreleye'
  | 'bristlemouth'
  | 'viper'
  | 'dragon'
  | 'fangtooth'
  | 'angler'
  | 'gulper'
  | 'grenadier'
  | 'tripod'
  | 'cusk'
  | 'snailfish'
  | 'eelpout'
  | 'flatfish';

export interface FormSpec {
  /** The zones it lives in, first to last (0 sunlight to 4 trench). */
  zones: [number, number];
  /** The body plan it is drawn on: a gulper is an eel's. */
  plan: 'fish' | 'eel';
  /** Lies on the floor rather than swimming over it. */
  floor?: boolean;
  /** Swims in schools. */
  school?: boolean;
  /** A dark hunter: one deep wash, never see-through. */
  dark?: boolean;
  /** How often it comes up where it lives, against the others there. */
  weight: number;
}

export const FORMS: Record<FishForm, FormSpec> = {
  jack: { zones: [0, 0], plan: 'fish', school: true, weight: 1.4 },
  sardine: { zones: [0, 1], plan: 'fish', school: true, weight: 1 },
  disc: { zones: [0, 0], plan: 'fish', weight: 1 },
  puffer: { zones: [0, 0], plan: 'fish', weight: 0.8 },
  barracuda: { zones: [0, 1], plan: 'fish', weight: 0.7 },
  sunfish: { zones: [0, 1], plan: 'fish', weight: 0.25 },
  lantern: { zones: [1, 2], plan: 'fish', school: true, weight: 1.2 },
  hatchet: { zones: [1, 1], plan: 'fish', weight: 1 },
  barreleye: { zones: [1, 1], plan: 'fish', weight: 0.5 },
  bristlemouth: { zones: [1, 2], plan: 'fish', school: true, weight: 0.9 },
  viper: { zones: [1, 2], plan: 'fish', dark: true, weight: 0.7 },
  dragon: { zones: [1, 2], plan: 'fish', dark: true, weight: 0.7 },
  fangtooth: { zones: [2, 3], plan: 'fish', dark: true, weight: 0.8 },
  angler: { zones: [2, 3], plan: 'fish', dark: true, weight: 0.9 },
  gulper: { zones: [2, 3], plan: 'eel', dark: true, weight: 0.6 },
  grenadier: { zones: [2, 4], plan: 'fish', weight: 1 },
  tripod: { zones: [3, 3], plan: 'fish', floor: true, weight: 1 },
  cusk: { zones: [3, 4], plan: 'fish', weight: 1 },
  snailfish: { zones: [4, 4], plan: 'fish', weight: 1.6 },
  eelpout: { zones: [3, 3], plan: 'fish', floor: true, weight: 0.8 },
  flatfish: { zones: [0, 3], plan: 'fish', floor: true, weight: 0.8 },
};

export const FISH_FORMS = Object.keys(FORMS) as FishForm[];

/** The forms that live in a zone, swimming (or, with `floor`, lying on its floor). */
export function formsIn(zone: number, floor = false): FishForm[] {
  return FISH_FORMS.filter((f) => {
    const s = FORMS[f];
    return zone >= s.zones[0] && zone <= s.zones[1] && !!s.floor === floor;
  });
}

/**
 * How many come together: the pool's roll, for a form that schools; a
 * puffer, a disc or a mola comes alone whatever the pool rolled for it.
 */
export function schoolOf(sp: { school: number; genome: Genome }): number {
  const f = sp.genome.form;
  return f && !FORMS[f].school ? 0 : sp.school;
}

/** A dark hunter (an angler, a dragon, a viper, a fangtooth, a gulper): one deep wash, never glass. */
export function darkHunter(g: Genome): boolean {
  return !!g.form && !!FORMS[g.form].dark;
}

/**
 * Which zones a species rolled at depth z could have come from. A pool rolls
 * its species a little either side of its zone's middle, so z says the zone,
 * except where the abyss's and the trench's overlap, which could be either.
 */
function zonesAt(z: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ZONES.length; i++) if (Math.abs(z - zoneMid(i)) <= 0.0501 || (i === ZONES.length - 1 && z >= zoneMid(i))) out.push(i);
  if (out.length) return out;
  const i = ZONES.findIndex((zn) => z < zn.z1);
  return [i < 0 ? ZONES.length - 1 : i];
}

/**
 * A form for a fish (or an eel) rolled at depth z, when the caller has not
 * chosen one: one that lives at every zone z could be, weighted. An eel is
 * only now and then a gulper; the rest stay plain eels.
 */
export function rollForm(r: Rand, z: number, plan: Plan): FishForm | undefined {
  if (plan !== 'fish' && plan !== 'eel') return undefined;
  const zones = zonesAt(z);
  const fits = FISH_FORMS.filter((f) => {
    const s = FORMS[f];
    return s.plan === plan && !s.floor && zones.every((zn) => zn >= s.zones[0] && zn <= s.zones[1]);
  });
  if (plan === 'eel') return fits.length && r() < 0.35 ? fits[0] : undefined;
  if (!fits.length) return 'jack';
  return weighted(r, fits.map((f) => [f, FORMS[f].weight] as [FishForm, number]));
}

export interface Genome {
  plan: Plan;
  radial: boolean;
  /** The depth it was rolled at, 0 surface to 1 trench. */
  z: number;
  /** Index into the course pastels, and into the glow colours. */
  hue: number;
  glow: number;
  size: number;
  /** Carries its own light. */
  lit: boolean;
  /** See-through, insides showing. */
  clear: boolean;
  /** Which kind of fish, for a fish (and a gulper among the eels). */
  form?: FishForm;

  // bell
  bw?: number;
  bh?: number;
  shape?: number;
  lobes?: number;
  tentN?: number;
  tentL?: number;
  tentStyle?: TentacleStyle;
  arms?: number;
  armL?: number;
  rings?: number;
  canals?: number;
  cap?: boolean;
  // comb
  ow?: number;
  oh?: number;
  lobed?: boolean;
  rows?: number;
  feathers?: boolean;
  featherL?: number;
  // star
  armsN?: number;
  starL?: number;
  starW?: number;
  curl?: number;
  spines?: boolean;
  feet?: boolean;
  // chain
  units?: number;
  unit?: number;
  bend?: number;
  dangle?: number;
  float?: boolean;
  // bilateral
  A?: number;
  skew?: number;
  blunt?: number;
  segs?: number;
  armor?: boolean;
  tail?: Tail;
  tailSize?: number;
  dorsal?: number;
  dorsalShape?: FinShape;
  dorsalH?: number;
  pectoral?: boolean;
  anal?: boolean;
  legs?: number;
  antennae?: number;
  headArms?: number;
  armLen?: number;
  barbels?: number;
  eyes?: number;
  eyeBig?: boolean;
  lure?: boolean;
  teeth?: boolean;
  pattern?: Pattern;
  patN?: number;
  lateral?: boolean;
  photo?: boolean;
  photoN?: number;
  wave?: number;
}

/** Which plan the depth favours, when the caller has not chosen one. */
export function rollPlan(r: Rand, z: number, floor = false): Plan {
  if (floor) return weighted(r, [['star', 1], ['crawler', 1.2]]);
  if (r() < 0.26 + 0.24 * z) {
    return weighted<Plan>(r, [
      ['bell', 0.55],
      ['comb', 0.14 + 0.1 * z],
      ['chain', 0.08 + 0.16 * z],
    ]);
  }
  return weighted<Plan>(r, [
    ['fish', 0.56 - 0.22 * z],
    ['eel', 0.14 + 0.06 * z],
    ['ray', 0.12],
    ['squid', 0.12 + 0.08 * z],
  ]);
}

/**
 * A creature rolled from its seed at depth z. A fish (and now and then an
 * eel) also gets a form: the one asked for, or one that lives at that depth
 * (`null` asks for none: a plain eel). The form has dice of its own, so
 * choosing it never moves another trait.
 */
export function rollGenome(seed: number, z: number, plan?: Plan, form?: FishForm | null): Genome {
  const r = mulberry32(seed * 7919 + 13);
  const rr = (a: number, b: number) => range(r, a, b);
  const ri = (a: number, b: number) => int(r, a, b);
  const p = form ? FORMS[form].plan : plan ?? rollPlan(r, z);
  const g: Genome = {
    plan: p,
    radial: RADIAL_PLANS.includes(p),
    z,
    hue: ri(0, 9),
    glow: ri(0, 3),
    size: rr(0.5, 1.2 + 0.8 * z),
    lit: chance(r, z * 0.85),
    clear: chance(r, z * 0.6),
  };
  if (p === 'bell') {
    Object.assign(g, {
      bw: rr(26, 58),
      bh: rr(16, 56),
      shape: rr(0.45, 2.2),
      lobes: ri(0, 16),
      tentN: ri(4, 30),
      tentL: rr(40, 170),
      tentStyle: weighted<TentacleStyle>(r, [['straight', 1], ['wavy', 1.4], ['coiled', 0.6 + 0.4 * z], ['beaded', 0.6]]),
      arms: ri(0, 6),
      armL: rr(0.25, 0.9),
      rings: weighted(r, [[0, 1], [4, 1.2], [ri(2, 8), 0.8]]),
      canals: ri(0, 16),
      cap: chance(r, 0.2),
    });
  } else if (p === 'comb') {
    Object.assign(g, {
      ow: rr(14, 30),
      oh: rr(26, 62),
      lobed: chance(r, 0.4),
      rows: weighted(r, [[8, 3], [4, 1], [12, 0.6]]),
      feathers: chance(r, 0.45),
      featherL: rr(50, 140),
    });
  } else if (p === 'star') {
    Object.assign(g, {
      armsN: ri(4, 11),
      starL: rr(26, 60),
      starW: rr(5, 14),
      curl: rr(-0.6, 0.6),
      spines: chance(r, 0.5),
      feet: chance(r, 0.6),
    });
  } else if (p === 'chain') {
    Object.assign(g, {
      units: ri(5, 15),
      unit: rr(5, 10),
      bend: rr(-1, 1),
      dangle: rr(18, 90),
      float: chance(r, 0.7),
    });
  } else {
    const A = { fish: rr(18, 40), eel: rr(4, 9), ray: rr(46, 72), squid: rr(16, 28), crawler: rr(12, 22) }[p];
    Object.assign(g, {
      A,
      skew: rr(0.55, 1.9),
      blunt: rr(0.55, 1.5),
      segs: ri(5, 20),
      armor: chance(r, p === 'crawler' ? 0.8 : 0.18),
      tail:
        p === 'fish'
          ? weighted<Tail>(r, [['fork', 1.3], ['round', 1], ['lunate', 0.8], ['filament', 0.4], ['none', 0.2]])
          : p === 'eel'
            ? weighted<Tail>(r, [['none', 1], ['filament', 0.6], ['round', 0.4]])
            : p === 'ray'
              ? 'filament'
              : p === 'crawler'
                ? weighted<Tail>(r, [['fan', 1], ['none', 1]])
                : 'none',
      tailSize: rr(0.6, 1.4),
      dorsal: p === 'fish' ? ri(0, 2) : 0,
      dorsalShape: weighted<FinShape>(r, [['tri', 1], ['sail', 0.7], ['frill', 0.7], ['spines', 0.6]]),
      dorsalH: rr(0.3, 1.3),
      pectoral: p === 'fish' && chance(r, 0.85),
      anal: p === 'fish' && chance(r, 0.6),
      legs: p === 'crawler' ? ri(3, 8) : 0,
      antennae: p === 'crawler' ? rr(30, 90) : 0,
      headArms: p === 'squid' ? ri(6, 10) : 0,
      armLen: rr(30, 90),
      barbels: p === 'fish' && chance(r, 0.22) ? ri(1, 3) : 0,
      eyes: p === 'ray' ? 0 : chance(r, 0.25 * z) ? 0 : chance(r, 0.08 + 0.14 * z) ? ri(2, 6) : 1,
      eyeBig: chance(r, 0.15 + 0.5 * z),
      lure: (p === 'fish' || p === 'eel') && chance(r, z > 0.45 ? 0.55 * z : 0),
      teeth: p === 'fish' && chance(r, 0.6 * z),
      pattern: weighted<Pattern>(r, [
        ['none', 0.6 + z],
        ['spots', 1 - 0.5 * z],
        ['stripes', 0.8 - 0.4 * z],
        ['bands', 0.6 - 0.3 * z],
        ['reticulate', 0.5],
      ]),
      patN: ri(4, 16),
      lateral: chance(r, 0.5),
      photoN: ri(6, 18),
      wave: p === 'eel' ? rr(4, 12) : rr(0, 3),
    });
    g.photo = g.lit && chance(r, 0.8);
    const fr = mulberry32(seed * 6151 + 29);
    const f = form === null && p !== 'fish' ? undefined : form ?? rollForm(fr, z, p);
    if (f) shapeForm(g, f, fr);
  }
  return g;
}

/**
 * A form's own body, laid over the dice: its depth for its length, its tail,
 * its fins, what it carries. What a form leaves alone (colour, markings, a
 * light, glass, its size within the form's) stays as rolled.
 */
function shapeForm(g: Genome, form: FishForm, r: Rand) {
  const rr = (a: number, b: number) => range(r, a, b);
  const ri = (a: number, b: number) => int(r, a, b);
  g.form = form;
  if (FORMS[form].plan === 'eel') {
    // A gulper: a mouth on a whip, black, the tip of its tail lit.
    Object.assign(g, { A: rr(5, 7), size: rr(1.2, 1.8), lure: false, lit: true, photo: false, clear: false, pattern: 'none', eyes: 1, eyeBig: false, wave: rr(6, 11) });
    return;
  }
  const lured = form === 'angler' || form === 'dragon' || form === 'viper';
  g.lure = lured;
  if (form !== 'jack') g.armor = false;
  if (FORMS[form].dark) g.clear = false;
  // The forms draw their own one eye in profile: a row of organs under it is a jack's.
  if (form !== 'jack' && form !== 'sardine' && form !== 'angler' && form !== 'dragon') g.eyes = 1;
  else if (g.eyes === 0) g.eyes = 1;
  const silver = () => [4, 7, 8][ri(0, 2)];
  switch (form) {
    case 'jack':
      // Today's fish, kept to a jack's or a mackerel's lines: a torpedo with
      // a forked tail, most of the time.
      Object.assign(g, {
        A: rr(18, 30),
        skew: rr(0.75, 1.3),
        blunt: rr(0.65, 1.15),
        tail: weighted<Tail>(r, [['fork', 1.4], ['lunate', 1], ['round', 0.2], ['filament', 0.2]]),
      });
      break;
    case 'sardine':
      Object.assign(g, {
        A: rr(13, 17),
        skew: rr(0.9, 1.1),
        blunt: rr(0.8, 1),
        size: rr(0.4, 0.62),
        tail: 'fork',
        tailSize: rr(1.1, 1.3),
        dorsal: 1,
        dorsalShape: 'tri',
        dorsalH: rr(0.4, 0.8),
        pectoral: true,
        anal: true,
        barbels: 0,
        teeth: false,
        lit: false,
        photo: false,
        clear: false,
        eyeBig: true,
        hue: silver(),
        pattern: weighted<Pattern>(r, [['none', 1], ['spots', 0.7]]),
        patN: ri(3, 6),
        lateral: false,
      });
      break;
    case 'disc':
      Object.assign(g, {
        A: rr(64, 80),
        blunt: rr(0.6, 1.4),
        size: rr(0.7, 1.1),
        tail: weighted<Tail>(r, [['none', 1], ['lunate', 0.5], ['round', 0.4]]),
        tailSize: rr(0.8, 1.1),
        barbels: 0,
        teeth: false,
        clear: false,
        pattern: weighted<Pattern>(r, [['bands', 1.2], ['stripes', 0.5], ['spots', 0.4], ['none', 0.3]]),
        patN: ri(2, 5),
      });
      break;
    case 'puffer':
      Object.assign(g, {
        A: rr(50, 64),
        blunt: rr(0.6, 1.6),
        size: rr(0.6, 1),
        tail: 'round',
        tailSize: rr(0.8, 1),
        barbels: 0,
        teeth: false,
        clear: false,
        lit: false,
        photo: false,
        eyeBig: true,
        pattern: weighted<Pattern>(r, [['spots', 1.4], ['none', 0.5], ['reticulate', 0.4]]),
        patN: ri(8, 16),
      });
      break;
    case 'barracuda':
      Object.assign(g, {
        A: rr(10, 13),
        skew: rr(1.05, 1.3),
        size: rr(1.1, 1.6),
        tail: weighted<Tail>(r, [['fork', 1], ['lunate', 0.6]]),
        tailSize: rr(1.1, 1.4),
        barbels: 0,
        teeth: true,
        clear: false,
        lit: false,
        photo: false,
        hue: chance(r, 0.6) ? silver() : g.hue,
        pattern: weighted<Pattern>(r, [['bands', 1], ['none', 0.6], ['spots', 0.4]]),
        patN: ri(10, 18),
        lateral: true,
      });
      break;
    case 'sunfish':
      Object.assign(g, {
        A: rr(74, 88),
        size: rr(1.8, 2.6),
        tail: 'none',
        barbels: 0,
        teeth: false,
        clear: false,
        lit: false,
        photo: false,
        eyeBig: false,
        hue: chance(r, 0.6) ? silver() : g.hue,
        pattern: weighted<Pattern>(r, [['none', 1], ['spots', 0.5]]),
        patN: ri(5, 10),
      });
      break;
    case 'lantern':
      Object.assign(g, {
        A: rr(20, 25),
        skew: rr(0.8, 0.95),
        blunt: rr(0.7, 0.9),
        size: rr(0.4, 0.65),
        tail: 'fork',
        tailSize: rr(1, 1.2),
        barbels: 0,
        clear: false,
        lit: true,
        photo: true,
        photoN: ri(8, 12),
        eyes: 1,
        eyeBig: true,
        pattern: 'none',
      });
      break;
    case 'hatchet':
      Object.assign(g, {
        A: rr(58, 70),
        size: rr(0.45, 0.7),
        tail: 'fork',
        tailSize: rr(0.8, 1),
        barbels: 0,
        teeth: false,
        clear: false,
        lit: true,
        photo: true,
        photoN: ri(9, 13),
        hue: silver(),
        pattern: 'none',
      });
      break;
    case 'barreleye':
      Object.assign(g, {
        A: rr(24, 30),
        skew: rr(0.9, 1.1),
        blunt: rr(0.75, 0.95),
        size: rr(0.7, 1),
        tail: 'fork',
        tailSize: rr(0.9, 1.1),
        barbels: 0,
        teeth: false,
        clear: false,
        photo: false,
        pattern: weighted<Pattern>(r, [['none', 1], ['spots', 0.6]]),
        patN: ri(6, 12),
      });
      break;
    case 'bristlemouth':
      Object.assign(g, {
        A: rr(11, 14),
        skew: rr(0.95, 1.1),
        blunt: rr(0.8, 1),
        size: rr(0.35, 0.5),
        tail: 'fork',
        tailSize: rr(1, 1.2),
        barbels: 0,
        teeth: true,
        lit: true,
        photo: true,
        photoN: ri(10, 16),
        eyeBig: false,
        pattern: 'none',
      });
      break;
    case 'viper':
      Object.assign(g, { A: rr(13, 17), size: rr(0.8, 1.2), tail: 'fork', tailSize: rr(0.8, 1), lit: true, photo: true, photoN: ri(14, 20), barbels: 0, pattern: 'none' });
      break;
    case 'dragon':
      // Today's dragonfish, drawn from a blunt roll under the angler's line.
      Object.assign(g, { blunt: Math.min(g.blunt!, 0.84) });
      break;
    case 'angler':
      Object.assign(g, { blunt: Math.max(g.blunt!, 0.85) });
      break;
    case 'fangtooth':
      Object.assign(g, { A: rr(40, 50), size: rr(0.6, 0.9), tail: 'fork', tailSize: rr(0.8, 1), lit: false, photo: false, barbels: 0, eyeBig: false, pattern: 'none' });
      break;
    case 'grenadier':
      Object.assign(g, {
        A: rr(22, 28),
        size: rr(1, 1.5),
        tail: 'none',
        barbels: 1,
        teeth: false,
        clear: false,
        photo: false,
        eyeBig: true,
        pattern: weighted<Pattern>(r, [['none', 1.4], ['bands', 0.3]]),
        patN: ri(3, 6),
      });
      break;
    case 'tripod':
      Object.assign(g, { A: rr(14, 18), size: rr(0.8, 1.2), tail: 'fork', tailSize: rr(0.9, 1.1), lit: false, photo: false, clear: false, barbels: 0, teeth: false, eyeBig: false, pattern: 'none' });
      break;
    case 'cusk':
      Object.assign(g, { A: rr(12, 16), size: rr(0.9, 1.4), tail: 'none', barbels: 0, teeth: false, photo: false, eyeBig: false, pattern: weighted<Pattern>(r, [['none', 1], ['spots', 0.4]]), patN: ri(6, 12), wave: rr(1.5, 3.5) });
      break;
    case 'snailfish':
      Object.assign(g, {
        A: rr(30, 38),
        size: rr(0.8, 1.2),
        tail: 'none',
        barbels: 0,
        teeth: false,
        clear: true,
        lit: false,
        photo: false,
        eyes: 1,
        eyeBig: false,
        hue: [1, 9][ri(0, 1)],
        pattern: 'none',
        lateral: false,
        wave: rr(1, 2.5),
      });
      break;
    case 'eelpout':
      Object.assign(g, { A: rr(16, 22), size: rr(0.9, 1.3), tail: 'none', barbels: 0, teeth: false, clear: false, photo: false, lit: false, eyeBig: false, pattern: weighted<Pattern>(r, [['none', 1], ['bands', 0.5]]), patN: ri(4, 8), wave: rr(1, 2.5) });
      break;
    case 'flatfish':
      Object.assign(g, {
        A: rr(44, 58),
        size: rr(0.8, 1.3),
        tail: 'round',
        tailSize: rr(0.8, 1),
        barbels: 0,
        teeth: false,
        clear: false,
        lit: false,
        photo: false,
        pattern: weighted<Pattern>(r, [['spots', 1.2], ['none', 0.6]]),
        patN: ri(8, 14),
        wave: 0,
      });
      break;
  }
  if (form === 'disc' || form === 'puffer' || form === 'sunfish' || form === 'hatchet' || form === 'flatfish' || form === 'tripod') g.wave = Math.min(g.wave!, 0.6);
}

const OPTIONS: Partial<Record<keyof Genome, readonly string[]>> = {
  tentStyle: ['straight', 'wavy', 'coiled', 'beaded'],
  pattern: ['none', 'spots', 'stripes', 'bands', 'reticulate'],
  dorsalShape: ['tri', 'sail', 'frill', 'spines'],
};
const COUNTS = new Set<string>([
  'lobes', 'tentN', 'arms', 'rings', 'canals', 'rows', 'armsN', 'units', 'segs', 'dorsal', 'legs',
  'headArms', 'barbels', 'eyes', 'patN', 'photoN', 'hue', 'glow',
]);
const FIXED = new Set<string>(['z', 'plan', 'radial', 'tail', 'form']);
/** Bounds a count may not mutate past, so a line never loses its body. */
const LIMITS: Record<string, [number, number]> = {
  lobes: [0, 20], tentN: [3, 40], arms: [0, 8], rings: [0, 10], canals: [0, 20], rows: [4, 12],
  armsN: [4, 12], units: [3, 18], segs: [4, 24], dorsal: [0, 2], legs: [2, 10], headArms: [6, 12],
  barbels: [0, 4], eyes: [0, 6], patN: [2, 20], photoN: [4, 22], hue: [0, 9], glow: [0, 3],
};

/**
 * A child of the creature before it, `generations` times over: numbers drift
 * a little, counts go up or down by one now and then, and once in a while a
 * whole trait flips. The body plan never changes; a jelly's line stays jelly.
 */
export function mutate(parent: Genome, seed: number, generations: number): Genome {
  const g: Genome = { ...parent };
  const rec = g as unknown as Record<string, unknown>;
  for (let i = 1; i <= generations; i++) {
    const r = mulberry32(seed * 31 + i * 977);
    for (const k of Object.keys(rec)) {
      if (FIXED.has(k)) continue;
      const v = rec[k];
      if (typeof v === 'number') {
        if (COUNTS.has(k)) {
          if (r() < 0.3) {
            const [lo, hi] = LIMITS[k] ?? [0, 99];
            rec[k] = Math.max(lo, Math.min(hi, v + (r() < 0.5 ? -1 : 1)));
          }
        } else {
          rec[k] = v * (1 + (r() - 0.5) * 0.26);
        }
      } else if (typeof v === 'boolean') {
        if (r() < 0.07) rec[k] = !v;
      } else if (typeof v === 'string' && OPTIONS[k as keyof Genome] && r() < 0.12) {
        const opts = OPTIONS[k as keyof Genome]!;
        rec[k] = opts[Math.floor(r() * opts.length)];
      }
    }
  }
  return g;
}

import { dice, type Dice } from './random';
import type { Stage } from './succession';

/**
 * What lives in the wood, as a grammar.
 *
 * The Creature Lab rolled sea animals from nine body plans; this is the same
 * idea on land. Every animal is a genome of dice rolls, but the rolls follow
 * a body plan (a songbird has a beak and a tail, a moth has four wings and a
 * furred body) and the stage of the wood leans on which plans come up, so
 * what arrives reads as something that lives there rather than a pile of
 * parts. Each plan also keeps hours: owls, bats, moths and fireflies are
 * night animals and only the open screen's night wood has them; deer and
 * foxes come at dusk, which is either.
 */

export type Plan =
  | 'songbird'
  | 'raptor'
  | 'owl'
  | 'bat'
  | 'butterfly'
  | 'moth'
  | 'dragonfly'
  | 'bee'
  | 'firefly'
  | 'deer'
  | 'fox'
  | 'hare'
  | 'hedgehog';

export type Activity = 'day' | 'night' | 'dusk';

/** The pastels the app already uses, from the Creature Lab's own list. */
export const HUES = [
  '#A8B89B', // sage
  '#D4A5A5', // rose
  '#B5A8C9', // lavender
  '#E2B594', // apricot
  '#A8BCC9', // blue-grey
  '#C99B7E', // terracotta
  '#D9C58C', // ochre
  '#9FC1B0', // mint
  '#9AA3AB', // slate
  '#B89BAA', // mauve
] as const;

/** What a firefly can glow: green-gold, amber, and a paler lime. */
export const GLOWS = ['#D8F28A', '#FFD27A', '#C6F5B0'] as const;

export interface AnimalGenome {
  plan: Plan;
  activity: Activity;
  /** Index into HUES: the body. */
  hue: number;
  /** Index into HUES: the markings. */
  accent: number;
  /** Against the plan's own size. */
  size: number;
  /** 0 to 1: how often it comes in company. */
  flock: number;
  pattern: string;
  /* Birds. */
  plump?: number;
  head?: number;
  beak?: 'seed' | 'thin' | 'long' | 'hook';
  tail?: 'short' | 'long' | 'fork' | 'cocked' | 'fan';
  crest?: 'none' | 'tuft' | 'crest';
  wing?: number;
  tufts?: boolean;
  /** An owl's eye: amber, or dark. */
  eyeLit?: boolean;
  /* Butterflies and moths. */
  fore?: number;
  hind?: number;
  tails?: boolean;
  /* Walkers. */
  antlers?: number;
  socks?: boolean;
  /* Fireflies: the glow, and the rhythm it keeps. */
  glow?: number;
  flashes?: number;
  gap?: number;
  period?: number;
  /** A bee's bands. */
  bands?: number;
  /** Ears, against the plan's own. */
  ears?: number;
}

/** Which plans each stage leans toward, by weight. */
const AFFINITY: Record<Stage, [Plan, number][]> = {
  meadow: [
    ['butterfly', 3],
    ['songbird', 3],
    ['bee', 2.4],
    ['dragonfly', 1.2],
    ['hare', 1.2],
    ['moth', 1.1],
    ['firefly', 1],
    ['raptor', 0.7],
    ['hedgehog', 0.6],
    ['bat', 0.5],
    ['fox', 0.4],
    ['owl', 0.3],
  ],
  scrub: [
    ['songbird', 3.4],
    ['butterfly', 2],
    ['moth', 1.5],
    ['hare', 1.4],
    ['fox', 1.2],
    ['bee', 1.2],
    ['firefly', 1.2],
    ['hedgehog', 1],
    ['raptor', 0.9],
    ['bat', 0.8],
    ['owl', 0.6],
    ['deer', 0.6],
    ['dragonfly', 0.6],
  ],
  young: [
    ['songbird', 3.4],
    ['deer', 1.5],
    ['moth', 1.5],
    ['owl', 1.2],
    ['fox', 1.2],
    ['bat', 1.2],
    ['firefly', 1.2],
    ['raptor', 1],
    ['butterfly', 1],
    ['hedgehog', 0.8],
    ['hare', 0.6],
    ['bee', 0.4],
  ],
  high: [
    ['songbird', 3],
    ['deer', 1.6],
    ['moth', 1.6],
    ['owl', 1.5],
    ['bat', 1.4],
    ['raptor', 1.2],
    ['firefly', 1.2],
    ['fox', 1],
    ['butterfly', 0.6],
    ['hedgehog', 0.6],
  ],
  old: [
    ['songbird', 2.5],
    ['owl', 2],
    ['deer', 1.8],
    ['moth', 1.8],
    ['bat', 1.6],
    ['firefly', 1.5],
    ['fox', 1],
    ['hedgehog', 0.8],
    ['raptor', 0.8],
    ['butterfly', 0.4],
  ],
};

/** The hours each plan keeps, before a genome leans them. */
const HOURS: Record<Plan, Activity> = {
  songbird: 'day',
  raptor: 'day',
  owl: 'night',
  bat: 'night',
  butterfly: 'day',
  moth: 'night',
  dragonfly: 'day',
  bee: 'day',
  firefly: 'night',
  deer: 'dusk',
  fox: 'dusk',
  hare: 'dusk',
  hedgehog: 'night',
};

/** Which of the pastels each plan is found in, by weight. */
const PALETTE: Record<Plan, number[]> = {
  songbird: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  raptor: [3, 5, 6, 8],
  owl: [3, 5, 6, 8, 9],
  bat: [8, 9, 5],
  butterfly: [1, 2, 3, 4, 6, 7, 9],
  moth: [8, 9, 6, 5, 0],
  dragonfly: [4, 7, 0, 1, 2],
  bee: [6, 3],
  firefly: [8, 5],
  deer: [3, 5, 6],
  fox: [5, 3],
  hare: [6, 3, 8],
  hedgehog: [6, 5, 8],
};

/** Plans a night wood can show, and a day wood. */
export function seenAt(activity: Activity, night: boolean): boolean {
  return activity === 'dusk' || (night ? activity === 'night' : activity === 'day');
}

export function planFor(stage: Stage, d: Dice, need?: 'day' | 'night'): Plan {
  const options = AFFINITY[stage].filter(([plan]) => !need || seenAt(HOURS[plan], need === 'night'));
  return d.weighted(options.length ? options : AFFINITY[stage]);
}

/** Roll an animal of the given plan. */
export function rollAnimal(seed: number, plan: Plan): AnimalGenome {
  const d = dice(seed);
  const hue = d.pick(PALETTE[plan]);
  let accent = d.pick(PALETTE[plan]);
  if (accent === hue) accent = (hue + 3) % HUES.length;
  const base: AnimalGenome = {
    plan,
    activity: HOURS[plan],
    hue,
    accent,
    size: d.range(0.85, 1.2),
    flock: 0,
    pattern: 'plain',
  };
  switch (plan) {
    case 'songbird': {
      // A few songbirds keep late hours: the ones heard at dusk.
      if (d.chance(0.15)) base.activity = 'dusk';
      base.plump = d.range(0.9, 1.18);
      base.head = d.range(0.92, 1.12);
      base.beak = d.weighted([
        ['seed', 3],
        ['thin', 3],
        ['long', 0.6],
      ]);
      base.tail = d.weighted([
        ['short', 3],
        ['long', 1.2],
        ['fork', 1.2],
        ['cocked', 0.5],
        ['fan', 0.6],
      ]);
      base.crest = d.weighted([
        ['none', 5],
        ['tuft', 1],
        ['crest', 0.6],
      ]);
      base.pattern = d.weighted([
        ['plain', 1.4],
        ['cap', 1.4],
        ['bib', 1.1],
        ['mask', 1],
        ['bars', 1.2],
        ['streaks', 1],
      ]);
      base.wing = d.range(0.9, 1.15);
      base.flock = d.chance(0.35) ? d.range(0.5, 0.9) : d.range(0, 0.15);
      break;
    }
    case 'raptor':
      base.size = d.range(0.85, 1.25);
      base.wing = d.range(0.9, 1.15);
      base.pattern = d.weighted([
        ['barred', 1],
        ['darktips', 1.2],
        ['pale', 1],
      ]);
      break;
    case 'owl':
      base.size = d.range(0.8, 1.3);
      base.tufts = d.chance(0.45);
      base.eyeLit = d.chance(0.6);
      base.pattern = d.weighted([
        ['streaked', 1.2],
        ['barred', 1],
        ['spotted', 1],
        ['plain', 0.6],
      ]);
      break;
    case 'bat':
      base.ears = d.range(0.8, 1.35);
      base.flock = d.chance(0.3) ? d.range(0.3, 0.6) : 0;
      break;
    case 'butterfly':
      base.size = d.range(0.8, 1.3);
      base.fore = d.range(0.9, 1.15);
      base.hind = d.range(0.85, 1.15);
      base.tails = d.chance(0.25);
      base.pattern = d.weighted([
        ['eyespot', 1.2],
        ['band', 1.2],
        ['margin', 1],
        ['tip', 1],
        ['veins', 0.8],
      ]);
      base.flock = d.chance(0.15) ? 0.4 : 0;
      break;
    case 'moth':
      if (d.chance(0.2)) base.activity = 'dusk';
      base.size = d.range(0.7, 1.3);
      base.fore = d.range(0.95, 1.2);
      base.hind = d.range(0.8, 1.05);
      base.pattern = d.weighted([
        ['band', 1.2],
        ['margin', 1],
        ['veins', 1],
        ['eyespot', 0.5],
      ]);
      break;
    case 'dragonfly':
      base.size = d.range(0.85, 1.2);
      base.pattern = d.weighted([
        ['plain', 1],
        ['banded', 1],
      ]);
      break;
    case 'bee':
      base.bands = d.int(2, 3);
      base.flock = d.range(0.2, 0.6);
      break;
    case 'firefly':
      base.glow = d.int(0, GLOWS.length - 1);
      base.flashes = d.int(1, 4);
      base.gap = d.range(0.22, 0.55);
      base.period = d.range(2.4, 6);
      base.flock = 1;
      break;
    case 'deer': {
      const fawn = d.chance(0.12);
      base.antlers = fawn ? 0 : d.chance(0.45) ? d.int(1, 3) : 0;
      base.pattern = fawn ? 'spots' : 'rump';
      base.size = fawn ? d.range(0.62, 0.75) : d.range(0.9, 1.2);
      base.flock = d.chance(0.3) ? d.range(0.3, 0.6) : 0;
      break;
    }
    case 'fox':
      if (d.chance(0.3)) base.activity = 'night';
      base.socks = d.chance(0.6);
      base.pattern = 'chest';
      break;
    case 'hare':
      if (d.chance(0.3)) base.activity = 'day';
      base.ears = d.range(0.85, 1.2);
      base.pattern = d.chance(0.6) ? 'eartips' : 'plain';
      break;
    case 'hedgehog':
      base.pattern = 'spines';
      break;
  }
  return base;
}

/* Name parts. The genus is a prefix that says something the dice rolled
   (long-tailed, crested, spotted, of the night) or a plain Neo/Pseudo, on a
   root that says what kind of animal it is; the epithet reads its colour,
   its markings, its hours or the stage of wood it was met in. The same
   animal is always called the same thing, so a name is worth remembering. */
const ROOTS: Record<Plan, string[]> = {
  songbird: ['spiza', 'ornis', 'sylvia', 'pipra'],
  raptor: ['aetus', 'buteo', 'ictinia'],
  owl: ['strix', 'glaux', 'otus'],
  bat: ['myotis', 'nycteris', 'pteryx'],
  butterfly: ['papilio', 'lepis', 'nymphe'],
  moth: ['phalaena', 'noctua', 'bombyx'],
  dragonfly: ['libella', 'aeshna', 'cordulia'],
  bee: ['apis', 'bombus', 'melissa'],
  firefly: ['lampyris', 'luciola', 'photinus'],
  deer: ['cervus', 'elaphus', 'capreolus'],
  fox: ['vulpes', 'alopex'],
  hare: ['lepus', 'lagus'],
  hedgehog: ['erinaceus', 'echinus'],
};

const COLOUR_WORDS: Record<number, string[]> = {
  0: ['viridis', 'olivacea'],
  1: ['rosea', 'rubella'],
  2: ['violacea', 'ianthina'],
  3: ['fulva', 'aurantia'],
  4: ['caerulea', 'glauca'],
  5: ['rufa', 'ferruginea'],
  6: ['flava', 'aurea'],
  7: ['thalassina', 'viridula'],
  8: ['cinerea', 'grisea'],
  9: ['purpurea', 'vinacea'],
};

const STAGE_WORDS: Record<Stage, string[]> = {
  meadow: ['pratensis', 'campestris'],
  scrub: ['dumetorum', 'fruticola'],
  young: ['silvestris', 'nemoralis'],
  high: ['silvatica', 'arborea'],
  old: ['antiqua', 'vetusta'],
};

export function animalName(g: AnimalGenome, seed: number, stage: Stage): string {
  const d = dice(seed * 13 + 3);
  const pre: string[] = [];
  if (g.tail === 'long' || g.tail === 'fork') pre.push('Longi');
  if (g.crest && g.crest !== 'none') pre.push('Lopho');
  if (g.tufts) pre.push('Oto');
  if (g.pattern === 'spots' || g.pattern === 'spotted' || g.pattern === 'eyespot') pre.push('Sticto');
  if (g.pattern === 'streaks' || g.pattern === 'streaked' || g.pattern === 'band' || g.pattern === 'barred') pre.push('Grammo');
  if (g.antlers) pre.push('Cerato');
  if (g.tails) pre.push('Uro');
  if (g.activity === 'night') pre.push('Nycti');
  const plain = ['Neo', 'Pseudo', 'Micro', 'Sylvi', 'Dendro', 'Phyllo'];
  const root = d.pick(ROOTS[g.plan]);
  // Never say a thing twice: no night prefix on a root that already means it.
  const own = pre.filter((x) => !root.startsWith(x.slice(0, 4).toLowerCase()));
  const prefix = own.length && d.chance(0.7) ? d.pick(own) : d.pick(plain);

  const ep: string[] = [...COLOUR_WORDS[g.hue], ...STAGE_WORDS[stage]];
  if (g.pattern === 'spots' || g.pattern === 'spotted' || g.pattern === 'eyespot') ep.push('maculata', 'ocellata');
  if (g.pattern === 'band' || g.pattern === 'barred' || g.pattern === 'banded') ep.push('fasciata', 'zonata');
  if (g.pattern === 'streaks' || g.pattern === 'streaked') ep.push('striata');
  if (g.crest === 'crest') ep.push('cristata');
  if (g.plan === 'firefly') ep.push('lucens', 'scintillans');
  if (g.activity === 'night') ep.push('noctivaga', 'nocturna');
  if (g.size > 1.15) ep.push('major');
  if (g.size < 0.8) ep.push('minor');
  ep.push('errans', 'placida', 'vesper', 'mira');
  return `${prefix}${root} ${d.pick(ep)}`;
}

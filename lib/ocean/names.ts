/**
 * A name for a species, built from what it is: a long one is Longi-, a blind
 * one Caeco-, one that glows is lucens. Latin enough to read as a label on a
 * plate, invented enough that nobody mistakes it for a real animal.
 */

import type { FishForm, Genome } from './genome';
import { mulberry32 } from './random';

const ROOTS: Record<Genome['plan'], string[]> = {
  bell: ['medusa', 'nema', 'aurelia'],
  comb: ['ctena', 'pleura'],
  star: ['aster', 'brisinga'],
  chain: ['physa', 'nectes'],
  fish: ['ichthys', 'pteryx', 'cephalus'],
  eel: ['ophis', 'murena'],
  ray: ['batis', 'raja'],
  squid: ['teuthis', 'loligo'],
  crawler: ['caris', 'podus'],
};
/**
 * A fish's root is its form's, so two kinds of fish read as two kinds of
 * animal on the label too. Built to sound like their families, never to be
 * them.
 */
const FORM_ROOTS: Record<FishForm, string[]> = {
  jack: ['ichthys', 'carangus', 'scombrus'],
  sardine: ['clupis', 'sardella'],
  disc: ['chaetus', 'pomacis', 'disca'],
  puffer: ['tetrodus', 'ostracis'],
  barracuda: ['sphyrus', 'belonis'],
  sunfish: ['mola', 'molina'],
  grouper: ['epinephis', 'serrana'],
  trigger: ['balistis', 'canthida'],
  flying: ['exocis', 'cypsella'],
  trumpet: ['aulostis', 'fistulis'],
  swordfish: ['xiphis', 'gladiola'],
  lantern: ['myctum', 'lampis'],
  hatchet: ['sternus', 'argyris'],
  barreleye: ['opisthis', 'pinnula'],
  bristlemouth: ['cyclis', 'stomula'],
  viper: ['chaulis', 'odontus'],
  dragon: ['stomis', 'dracis'],
  swallower: ['chiasmis', 'glutta'],
  snipe: ['nemis', 'avocis'],
  fangtooth: ['anoplis', 'odus'],
  angler: ['lophis', 'ceratis'],
  gulper: ['saccis', 'pharyngus'],
  whalefish: ['cetomis', 'rondeletis'],
  chimaera: ['chimaeris', 'lagis'],
  grenadier: ['coryphus', 'macrurus'],
  tripod: ['podops', 'stylis'],
  lizard: ['saurus', 'synodis'],
  cusk: ['ophidis', 'brotis'],
  cutthroat: ['synaphis', 'branchis'],
  snailfish: ['liparis', 'proctus'],
  ethereal: ['careprocta', 'vaporis'],
  eelpout: ['zoarcis', 'lycis'],
  flatfish: ['pleuris', 'soleus'],
};
const PLAIN = ['Neo', 'Pseudo', 'Micro', 'Thalasso', 'Bathy'];

export function speciesName(g: Genome, seed: number): string {
  const r = mulberry32(seed * 13 + 3);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const traits: string[] = [];
  if (g.plan === 'eel' || (g.tentL ?? 0) > 130) traits.push('Longi');
  if (g.plan === 'ray' || g.form === 'flatfish' || g.form === 'disc') traits.push('Plati');
  if (g.armor) traits.push('Lorica');
  if (g.lure) traits.push('Hami');
  if ((g.eyes ?? 1) > 1) traits.push('Poly');
  if (g.eyes === 0 && !g.radial) traits.push('Caeco');
  if (g.plan === 'bell' && (g.tentN ?? 0) > 20) traits.push('Myrio');
  if (g.spines || g.dorsalShape === 'spines') traits.push('Acantho');
  if (g.plan === 'chain') traits.push('Catena');
  const prefix = pick(traits.length ? traits.concat(pick(PLAIN)) : PLAIN);
  const epithets: string[] = [];
  if (g.lit) epithets.push('lucens', 'noctiluca');
  if (g.clear) epithets.push('pellucida', 'vitrea');
  if (g.pattern === 'spots') epithets.push('maculata');
  if (g.pattern === 'stripes' || g.pattern === 'bands') epithets.push('striata', 'zonata');
  if (g.z > 0.7) epithets.push('abyssalis', 'profunda');
  if (g.z < 0.3) epithets.push('solaris', 'littoralis');
  epithets.push('vesper', 'errans', 'placida', 'mira', 'somnia');
  return `${prefix}${pick(g.form ? FORM_ROOTS[g.form] : ROOTS[g.plan])} ${pick(epithets)}`;
}

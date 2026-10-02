/**
 * The colour of the water, and of the things in it.
 *
 * The app's grounds are warm, and the ocean keeps them warm. It is a wash,
 * not a blue: a sea-glass grey-green near the surface that deepens through
 * slate and settles, by the midnight zone, on the app's own night paper,
 * then the desk colour under it in the abyss. Sinking is literally the page
 * going from day to night. The course's colour tints the whole of it a
 * little, so a sitting's sea is recognisably that course's.
 */

import { mixHex } from '../fan';
import type { Genome } from './genome';

export type Ground = 'night' | 'paper';

interface Stop {
  z: number;
  top: string;
  bottom: string;
}

/** On the night screen: open mode, which already inverts with literal colours. */
const NIGHT: Stop[] = [
  { z: 0, top: '#56685F', bottom: '#384640' },
  { z: 0.3, top: '#34403B', bottom: '#252D29' },
  { z: 0.6, top: '#211F1B', bottom: '#1A1815' },
  { z: 0.85, top: '#1A1815', bottom: '#141210' },
  { z: 1, top: '#110F0D', bottom: '#0B0A09' },
];

/** On the notebook page: a watercolour laid over the paper. */
const PAPER: Stop[] = [
  { z: 0, top: '#EEF0E6', bottom: '#D3DCD2' },
  { z: 0.3, top: '#B9C5BD', bottom: '#8E9E97' },
  { z: 0.6, top: '#4C5552', bottom: '#2E3431' },
  { z: 0.85, top: '#221F1A', bottom: '#1A1815' },
  { z: 1, top: '#141210', bottom: '#110F0D' },
];

export interface Water {
  top: string;
  bottom: string;
  /** Whether ink on it should be the light ink. */
  dark: boolean;
  /** Marine snow and the light shafts. */
  snow: string;
  /** How strong the light from above still is, 0 to 1. */
  light: number;
}

function lerpStops(stops: Stop[], z: number): { top: string; bottom: string } {
  for (let i = 1; i < stops.length; i++) {
    if (z <= stops[i].z) {
      const a = stops[i - 1];
      const b = stops[i];
      const t = (z - a.z) / (b.z - a.z || 1);
      return { top: mixHex(a.top, b.top, t), bottom: mixHex(a.bottom, b.bottom, t) };
    }
  }
  const last = stops[stops.length - 1];
  return { top: last.top, bottom: last.bottom };
}

export function waterAt(z: number, ground: Ground, courseColor: string): Water {
  const { top, bottom } = lerpStops(ground === 'night' ? NIGHT : PAPER, Math.max(0, Math.min(1, z)));
  // The course's tint fades as the light does: in the dark there is no colour.
  const tint = 0.14 * (1 - Math.min(1, z / 0.7));
  const dark = ground === 'night' || z >= 0.42;
  return {
    top: mixHex(top, courseColor, tint),
    bottom: mixHex(bottom, courseColor, tint * 0.6),
    dark,
    snow: dark ? '#C8C0B0' : '#FFFFFF',
    light: Math.max(0, 1 - z / 0.38),
  };
}

/** The course pastels, which the ocean's creatures are coloured from. */
export const HUES = ['#A8B89B', '#D4A5A5', '#B5A8C9', '#E2B594', '#A8BCC9', '#C99B7E', '#D9C58C', '#9FC1B0', '#9AA3AB', '#B89BAA'];
const GLOWS = ['#9FE8FF', '#B8FFD9', '#FFD9A0', '#E3C2FF'];

/**
 * The one ink every animal's lines are drawn in, as a plate's are: iron-gall
 * brown-black on light water, a warm off-white on dark. The colour is all in
 * the washes, so it drains with depth while the line stays the same.
 */
export const IRON_GALL = { light: '#2A2320', dark: '#E8E0CF' } as const;

export interface CreatureInk {
  /** The animal's own tinted ink, kept for anything still drawn in it. */
  ink: string;
  /** The pen: every line, outline, hatch and stipple, in one ink. */
  pen: string;
  /** The bare paper a wash leaves as its highlight, or null for none. */
  paper: string | null;
  body: string;
  fin: string;
  tent: string;
  pat: string;
  glow: string | null;
  dot: string;
  eyeW: string;
  pupil: string;
  bodyAlpha: number;
  finAlpha: number;
}

/** Kelp's olive gold: the course pastels' ochre, greened with their sage and
    browned with their clay. */
const KELP = mixHex(mixHex('#D9C58C', '#A8B89B', 0.35), '#C99B7E', 0.25);

export interface KelpInk {
  ink: string;
  body: string;
  /** The little float at the foot of each blade. */
  float: string;
}

/** How kelp is inked, on dark water or light: the same rule as the animals. */
export function kelpInk(dark: boolean): KelpInk {
  const water = dark ? '#1A1815' : '#FBF8EF';
  return {
    ink: dark ? mixHex(KELP, '#FFFFFF', 0.35) : mixHex(KELP, '#1A1714', 0.6),
    body: dark ? mixHex(KELP, water, 0.5) : mixHex(KELP, '#8A7A4E', 0.12),
    float: dark ? mixHex(KELP, '#FFFFFF', 0.15) : mixHex(KELP, water, 0.5),
  };
}

/**
 * A pastel as it looks at depth z. Water takes the warm end of the light
 * first, so a red animal is grey by the twilight and the blues hold on
 * longest; past the light everything is near grey. Its own lights are not
 * drained, since they are made on the spot.
 */
export function drained(hex: string, z: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // The pastels are soft, so a little more red than blue is already warm.
  const warmth = Math.max(0, Math.min(1, (r - b) / 45));
  const lum = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
  const grey = `#${[lum, lum, lum].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const lost = Math.max(0, Math.min(1, (z - 0.1) / 0.45)) * (0.4 + 0.6 * warmth);
  return mixHex(hex, grey, lost);
}

/** How a creature is inked, on dark water or light. `vivid` keeps the colour
    the depth would take, for a wallpaper, which is the animal at its best. */
export function creatureInk(g: Genome, dark: boolean, vivid = false): CreatureInk {
  const hi = Math.max(0, Math.min(9, Math.round(g.hue)));
  // (A sea star is never the grey pastel: an apricot one in its place.)
  const base = HUES[g.plan === 'star' && HUES[hi] === '#9AA3AB' ? 3 : hi];
  // A sea star keeps its colour longer than a swimmer: it is drawn as a
  // specimen in the hand, and a grey star on grey ground is a cut-out.
  const hue = vivid ? base : drained(base, g.plan === 'star' ? g.z * 0.45 : g.z);
  const glow = GLOWS[Math.max(0, Math.min(3, Math.round(g.glow)))];
  const ink = dark ? mixHex(hue, '#FFFFFF', 0.45) : mixHex(hue, '#1A1714', 0.62);
  const water = dark ? '#1A1815' : '#FBF8EF';
  // A fish with a lure (an angler, a dragonfish) is a dark animal on any
  // water: one deep wash, so its jaw and its light are what show.
  const angler = g.plan === 'fish' && !!g.lure;
  return {
    ink,
    pen: dark ? IRON_GALL.dark : IRON_GALL.light,
    // On dark water there is no paper to leave bare; only a faint lift.
    paper: dark ? mixHex(hue, IRON_GALL.dark, 0.3) : '#FBF8EF',
    // A wash a little under the pastel's own value: laid over toned water it
    // must still read as pigment on the paper, not a pale cut-out.
    body: angler ? mixHex(hue, dark ? '#0B0A09' : '#1A1714', dark ? 0.72 : 0.7) : dark ? mixHex(hue, water, 0.45) : mixHex(hue, '#6E655B', 0.1),
    fin: angler ? mixHex(hue, dark ? '#0B0A09' : '#1A1714', dark ? 0.55 : 0.5) : dark ? mixHex(hue, water, 0.25) : mixHex(hue, water, 0.45),
    tent: dark ? mixHex(hue, '#FFFFFF', 0.35) : mixHex(hue, '#1A1714', 0.45),
    pat: dark ? mixHex(glow, water, 0.35) : mixHex(hue, '#1A1714', 0.42),
    glow: g.lit || dark ? glow : null,
    dot: g.lit ? mixHex(glow, '#FFFFFF', 0.4) : ink,
    eyeW: dark ? mixHex(glow, '#FFFFFF', 0.3) : '#FBF8EF',
    pupil: '#141210',
    // A comb jelly is glass whatever the dice say: its rows are what shows.
    // A bell is never opaque either: a solid dome reads as a lampshade.
    // (A sea star is never glass, whatever the dice say.)
    bodyAlpha: angler ? 0.85 : g.plan === 'star' ? 0.92 : g.clear ? 0.38 : g.plan === 'comb' ? 0.5 : g.plan === 'bell' ? 0.62 : 0.95,
    finAlpha: angler ? 0.7 : g.clear ? 0.35 : 0.8,
  };
}

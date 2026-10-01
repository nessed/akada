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

export interface CreatureInk {
  ink: string;
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

/** How a creature is inked, on dark water or light. */
export function creatureInk(g: Genome, dark: boolean): CreatureInk {
  const hue = drained(HUES[Math.max(0, Math.min(9, Math.round(g.hue)))], g.z);
  const glow = GLOWS[Math.max(0, Math.min(3, Math.round(g.glow)))];
  const ink = dark ? mixHex(hue, '#FFFFFF', 0.45) : mixHex(hue, '#1A1714', 0.62);
  const water = dark ? '#1A1815' : '#FBF8EF';
  return {
    ink,
    body: dark ? mixHex(hue, water, 0.45) : mixHex(hue, water, 0.2),
    fin: dark ? mixHex(hue, water, 0.25) : mixHex(hue, water, 0.45),
    tent: dark ? mixHex(hue, '#FFFFFF', 0.35) : mixHex(hue, '#1A1714', 0.45),
    pat: dark ? mixHex(glow, water, 0.35) : mixHex(hue, '#1A1714', 0.42),
    glow: g.lit || dark ? glow : null,
    dot: g.lit ? mixHex(glow, '#FFFFFF', 0.4) : ink,
    eyeW: dark ? mixHex(glow, '#FFFFFF', 0.3) : '#FBF8EF',
    pupil: '#141210',
    bodyAlpha: g.clear ? 0.38 : 0.95,
    finAlpha: g.clear ? 0.35 : 0.8,
  };
}

import { mixHex } from '../fan';
import type { Season } from './biome';
import { HUES } from './fauna';

/**
 * The wood's inks, for the paper it is drawn on.
 *
 * The block frame is a page of the reader's own notebook, so the wood there
 * is pencil and pale wash over whatever paper tone they chose, and the
 * rules show through it. The open screen is the night paper, and the wood
 * there is drawn in light on dark, the way the tree already is. Everything
 * leans a little toward the course's colour, so a wood grown on ECON 100
 * sits beside the tree it grew rather than beside some other palette.
 */
export interface Palette {
  /** Whether the ground is dark. */
  dark: boolean;
  paper: string;
  ink: string;
  pencil: string;
  faint: string;
  course: string;
  season: Season;
}

export function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return 1;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function makePalette(paper: string, course: string, season: Season, dark = luminance(paper) < 0.4): Palette {
  return {
    dark,
    paper,
    ink: dark ? '#EFE9DC' : '#2A2620',
    pencil: dark ? '#6E665A' : '#B9AF97',
    faint: dark ? '#3A352D' : '#DDD5C2',
    course,
    season,
  };
}

/** Toward the paper by how far back it stands: 0 at the front, 1 gone. */
export function recede(p: Palette, hex: string, amount: number): string {
  return mixHex(hex, p.paper, Math.min(0.92, Math.max(0, amount * (p.dark ? 0.7 : 1))));
}

/** The leaf colours of the season, nudged toward the course. */
export function leafHue(p: Palette, pick: number): string {
  const sets: Record<Season, string[]> = {
    spring: ['#9FC1B0', '#A8B89B', '#B7C9A2'],
    summer: ['#8FA082', '#A8B89B', '#9FB28E'],
    autumn: ['#E2B594', '#C99B7E', '#D9C58C'],
  };
  const set = sets[p.season];
  return mixHex(set[Math.abs(pick) % set.length], p.course, 0.12);
}

/** An animal's body, markings and ink on this paper. */
export function animalInks(p: Palette, hue: number, accent: number) {
  const h = HUES[hue % HUES.length];
  const a = HUES[accent % HUES.length];
  if (p.dark) {
    return {
      body: mixHex(h, p.paper, 0.42),
      belly: mixHex(h, '#EFE9DC', 0.18),
      wing: mixHex(h, p.paper, 0.55),
      pattern: mixHex(a, '#EFE9DC', 0.1),
      ink: mixHex(h, '#FFFFFF', 0.5),
      dark: mixHex(h, p.paper, 0.78),
      eye: '#1A1815',
      lit: '#C9A95E',
      shine: '#EFE9DC',
    };
  }
  return {
    body: mixHex(h, p.paper, 0.18),
    belly: mixHex(h, p.paper, 0.62),
    wing: mixHex(h, '#1A1714', 0.12),
    pattern: mixHex(a, '#1A1714', 0.35),
    ink: mixHex(h, '#1A1714', 0.64),
    dark: mixHex(h, '#1A1714', 0.72),
    eye: '#1A1714',
    lit: '#C99A45',
    shine: p.paper,
  };
}

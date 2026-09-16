'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * The paper a reader chooses to work on. Four of these are daylight papers;
 * `night` is the same page under a lamp, and it is a tone like the others
 * rather than a switch sitting beside them. One question, one answer: a
 * separate "dark mode" toggle next to the tone picker asked the same thing
 * twice, and because the tones are written onto the root element as inline
 * custom properties, a stylesheet-level dark theme could never win against
 * them anyway.
 */
export type PaperTone = 'warm' | 'paper' | 'stone' | 'night';
export type Density = 'airy' | 'normal' | 'tight';
export type PrimaryAccent = 'classic' | 'green';

export interface Preferences {
  paperTone: PaperTone;
  density: Density;
  primaryAccent: PrimaryAccent;
  dailyReminder: boolean;
  sessionSound: boolean;
  hideWeekends: boolean;
  /**
   * The pencil in the margin: drawn squiggles, tally strokes, the hand-drawn
   * underlines. Off leaves the structure and the type exactly as they are and
   * takes only the marks away, for a reader who wants the page plainer.
   */
  marginalia: boolean;
  /** The one nudge the app gives: a week is written up and ready to read. */
  sundayNudge: boolean;
  /** Which day the week is read back on. 0 is Sunday, -1 never. */
  reviewDay: number;
  /**
   * Derived, never set directly: true exactly when the chosen paper is the
   * night tone. Kept on the record so anything that wants to know whether the
   * page is dark can ask without reasoning about tone names, and so the value
   * still round-trips through the stored JSON older builds wrote.
   */
  darkMode: boolean;
  /** Hour (0-6) at which "today" rolls over into tomorrow. */
  dayEndingHour: number;
}

const DEFAULTS: Preferences = {
  paperTone: 'paper',
  density: 'normal',
  primaryAccent: 'classic',
  dailyReminder: true,
  sessionSound: false,
  hideWeekends: false,
  marginalia: true,
  sundayNudge: true,
  reviewDay: 0,
  darkMode: false,
  dayEndingHour: 0,
};

const STORAGE_KEY = 'akada.preferences.v1';

const PAPER_TONE_VALUES: PaperTone[] = ['warm', 'paper', 'stone', 'night'];
const DENSITY_VALUES: Density[] = ['airy', 'normal', 'tight'];
const PRIMARY_ACCENT_VALUES: PrimaryAccent[] = ['classic', 'green'];

/**
 * Records written by earlier builds. `white` was a fifth stock the redesign
 * drops, and it is nearest to `stone`; the density scale was renamed rather
 * than re-tuned, so each old name maps straight onto its replacement. Applied
 * on read, so nobody's page changes shape because a name changed under them.
 */
const LEGACY_TONES: Record<string, PaperTone> = { white: 'stone' };
const LEGACY_DENSITY: Record<string, Density> = {
  cozy: 'airy',
  comfy: 'normal',
  compact: 'tight',
};

function sanitizePreferences(value: unknown): Preferences {
  const parsed = value && typeof value === 'object' ? (value as Partial<Preferences>) : {};

  const rawTone = parsed.paperTone as string | undefined;
  const tone = (rawTone && LEGACY_TONES[rawTone]) || (rawTone as PaperTone | undefined);
  const paperTone = PAPER_TONE_VALUES.includes(tone as PaperTone)
    ? (tone as PaperTone)
    : DEFAULTS.paperTone;

  const rawDensity = parsed.density as string | undefined;
  const scale = (rawDensity && LEGACY_DENSITY[rawDensity]) || (rawDensity as Density | undefined);

  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

  return {
    paperTone,
    density: DENSITY_VALUES.includes(scale as Density) ? (scale as Density) : DEFAULTS.density,
    primaryAccent: PRIMARY_ACCENT_VALUES.includes(parsed.primaryAccent as PrimaryAccent)
      ? (parsed.primaryAccent as PrimaryAccent)
      : DEFAULTS.primaryAccent,
    dailyReminder: bool(parsed.dailyReminder, DEFAULTS.dailyReminder),
    sessionSound: bool(parsed.sessionSound, DEFAULTS.sessionSound),
    hideWeekends: bool(parsed.hideWeekends, DEFAULTS.hideWeekends),
    marginalia: bool(parsed.marginalia, DEFAULTS.marginalia),
    sundayNudge: bool(parsed.sundayNudge, DEFAULTS.sundayNudge),
    reviewDay:
      typeof parsed.reviewDay === 'number' && parsed.reviewDay >= -1 && parsed.reviewDay <= 6
        ? Math.round(parsed.reviewDay)
        : DEFAULTS.reviewDay,
    darkMode: paperTone === 'night',
    dayEndingHour:
      typeof parsed.dayEndingHour === 'number' && parsed.dayEndingHour >= 0 && parsed.dayEndingHour <= 6
        ? Math.round(parsed.dayEndingHour)
        : DEFAULTS.dayEndingHour,
  };
}

/**
 * Anyone who had the old standalone dark switch on keeps a dark page: their
 * stored `darkMode: true` becomes the night tone. Applied only when reading
 * what was written to storage, not on every patch, so choosing a daylight
 * paper afterwards is not undone by the legacy flag still sitting in the
 * record. The first write after that persists the migrated shape.
 */
function migrateLegacyDarkMode(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const record = parsed as Partial<Preferences>;
  if (record.darkMode === true && record.paperTone !== 'night') {
    return { ...record, paperTone: 'night' };
  }
  return record;
}

interface ToneTokens {
  bg: string;
  tint: string;
  paper: string;
  paper2: string;
  line: string;
  lineSoft: string;
  lineStrong: string;
  ink: string;
  inkSoft: string;
  muted: string;
  mutedSoft: string;
  glowA: string;
  glowB: string;
}

/** The ink family every daylight paper shares. Mirrored into `:root`. */
const DAY_INK = {
  ink: '#1A1714',
  inkSoft: '#4B4640',
  muted: '#8C8576',
  mutedSoft: '#B5AE99',
} as const;

export const PAPER_TONES: Record<PaperTone, ToneTokens> = {
  warm: {
    // Refined paper-warm tones (Akada · Vol. III)
    bg: '#FAF8F2',
    tint: '#F1ECDF',
    paper: '#FFFCF5',
    paper2: '#FBF7EA',
    line: '#E5DECC',
    lineSoft: '#EFE9D8',
    lineStrong: '#D7CDB3',
    ...DAY_INK,
    glowA: 'rgba(190, 170, 120, 0.10)',
    glowB: 'rgba(180, 150, 110, 0.07)',
  },
  paper: {
    bg: '#F5F1E8',
    tint: '#EDE7D8',
    paper: '#FBF8EF',
    paper2: '#F7F3E6',
    line: '#DDD6C2',
    lineSoft: '#EAE4D3',
    lineStrong: '#C9C0A8',
    ...DAY_INK,
    glowA: 'rgba(178, 152, 92, 0.10)',
    glowB: 'rgba(132, 112, 78, 0.08)',
  },
  stone: {
    bg: '#F4F4F1',
    tint: '#EAEAE3',
    paper: '#FFFFFF',
    paper2: '#FAFAF7',
    line: '#E5E4DE',
    lineSoft: '#EFEFEA',
    lineStrong: '#D4D2C8',
    ...DAY_INK,
    glowA: 'rgba(130, 132, 120, 0.08)',
    glowB: 'rgba(110, 112, 104, 0.06)',
  },
  night: {
    // Warm ink on a dark page, not an inversion. Same values the locked-in
    // clock is drawn in, because that screen is this stock at full bleed: the
    // ground is a deep brown charcoal, the page sits a shade above it, and
    // the ruled lines stay faint enough to read as paper rather than borders.
    bg: '#14120F',
    tint: '#1C1915',
    paper: '#1E1B17',
    paper2: '#191612',
    line: '#2B2723',
    lineSoft: '#26221E',
    lineStrong: '#332E28',
    ink: '#F2EDE0',
    inkSoft: '#E7E1D4',
    muted: '#8A857A',
    mutedSoft: '#6F6A5F',
    glowA: 'rgba(168, 184, 155, 0.08)',
    glowB: 'rgba(138, 120, 92, 0.05)',
  },
};

/**
 * What the night paper changes beyond the paper-and-ink foundation.
 *
 * The pastels themselves are left exactly as they are, because a course owns
 * its colour (PASTEL_PALETTE in lib/utils.ts) and that colour must be the
 * same object in either light. What changes is every value derived from a
 * white page: the pastel *tints*, which were near-white washes; the alarm
 * ramps, which are lifted so a muted terracotta still reads as one; the
 * highlighter alphas, which have to sit under light ink instead of dark; the
 * hand-drawn underline, which was stroked in daylight ink; and the scrim.
 */
const NIGHT_TOKENS: Record<string, string> = {
  '--sage-tint': '#393B32',
  '--rose-tint': '#433735',
  '--lav-tint': '#3C383D',
  '--peach-tint': '#463B31',
  '--sky-tint': '#393C3D',
  '--clay-tint': '#41352C',
  '--butter-tint': '#443E2F',
  '--mint-tint': '#373D37',
  '--slate-tint': '#363736',
  '--mauve-tint': '#3D3536',

  '--warn': '#CC8462',
  '--warn-soft': '#C9A96B',
  '--warn-tint': '#413026',
  '--priority': '#D89184',
  '--priority-soft': '#E0A294',
  '--priority-tint': '#44332D',

  // The swipes are opaque tints now, so on the night stock they have to be
  // dark bands that light ink still reads on, not the daylight pastels.
  '--highlight-yellow': '#443E2F',
  '--highlight-pink': '#433735',
  '--highlight-mint': '#393B32',
  '--highlight-clay': '#463B31',

  // The whole url, not a colour inside it: a custom property cannot reach
  // into a data URI. globals.css reads this through .hand-underline.
  '--underline-svg':
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 8' preserveAspectRatio='none'><path d='M2 5 Q40 2 80 4 T160 5 T198 4' stroke='%23EFE9DC' stroke-width='1.4' fill='none' stroke-linecap='round' opacity='0.55'/></svg>\")",
  '--scrim': 'rgba(6, 5, 4, 0.58)',
  '--noise-blend': 'screen',
  '--noise-opacity': '0.14',
};

const PRIMARY_ACCENTS: Record<
  PrimaryAccent,
  { primary: string; contrast: string; tint: string }
> = {
  classic: {
    primary: 'var(--ink)',
    contrast: 'var(--bg)',
    tint: 'var(--bg-tint)',
  },
  green: {
    primary: 'var(--sage)',
    contrast: 'var(--ink)',
    tint: 'var(--sage-tint)',
  },
};

function toneVariables(tone: ToneTokens): Record<string, string> {
  return {
    '--bg': tone.bg,
    '--bg-tint': tone.tint,
    '--paper': tone.paper,
    '--paper-2': tone.paper2,
    '--line': tone.line,
    '--line-soft': tone.lineSoft,
    '--line-strong': tone.lineStrong,
    '--ink': tone.ink,
    '--ink-soft': tone.inkSoft,
    '--muted': tone.muted,
    '--muted-soft': tone.mutedSoft,
    '--paper-glow-a': tone.glowA,
    '--paper-glow-b': tone.glowB,
  };
}

function readFromStorage(): Preferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return sanitizePreferences(migrateLegacyDarkMode(JSON.parse(raw)));
  } catch {
    return DEFAULTS;
  }
}

export function applyPreferences(prefs: Preferences) {
  if (typeof document === 'undefined') return;
  const toneKey = PAPER_TONES[prefs.paperTone] ? prefs.paperTone : DEFAULTS.paperTone;
  const tone = PAPER_TONES[toneKey];
  const root = document.documentElement;

  const vars = toneVariables(tone);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);

  // The night tone owns a second layer of values. Written on when it is
  // chosen and taken back off when it is not, so returning to a daylight
  // paper restores the stylesheet's own values rather than a stale wash.
  for (const [name, value] of Object.entries(NIGHT_TOKENS)) {
    if (toneKey === 'night') root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }

  const accent = PRIMARY_ACCENTS[prefs.primaryAccent] || PRIMARY_ACCENTS.classic;
  root.style.setProperty('--primary', accent.primary);
  root.style.setProperty('--primary-contrast', accent.contrast);
  root.style.setProperty('--primary-tint', accent.tint);

  // A record written by an older build may still carry a --font-serif
  // override for a family this app no longer loads. Clearing it is what keeps
  // such a reader on Source Serif 4 rather than on the browser's last resort.
  root.style.removeProperty('--font-serif');
  root.dataset.density = prefs.density;
  // Kept for form controls and scrollbars, which follow color-scheme rather
  // than any custom property (see the [data-theme] rule in globals.css).
  root.dataset.theme = toneKey === 'night' ? 'night' : 'light';

  // Everything above is now written inline, so the pre-paint stylesheet the
  // bootstrap injected has nothing left to say.
  document.getElementById(BOOT_STYLE_ID)?.remove();
}

/* ───────── first paint ─────────
   The tokens have to be on the page before the first pixel, not after the
   first effect, or a reader who chose the night paper gets a cream flash on
   every load. These serialise the same maps above into plain CSS text, so
   there is still one authority for a colour. */

export const BOOT_STYLE_ID = 'akada-boot-tokens';

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
}

const TONE_CSS: Record<PaperTone, string> = PAPER_TONE_VALUES.reduce(
  (acc, key) => {
    const base = declarations(toneVariables(PAPER_TONES[key]));
    acc[key] = key === 'night' ? `${base}${declarations(NIGHT_TOKENS)}color-scheme:dark;` : base;
    return acc;
  },
  {} as Record<PaperTone, string>,
);

const DENSITY_CSS: Record<Density, string> = {
  normal: '--density-gutter:22px;--density-gap:12px;--density-section:32px;',
  airy: '--density-gutter:26px;--density-gap:16px;--density-section:40px;',
  tight: '--density-gutter:18px;--density-gap:9px;--density-section:24px;',
};

const ACCENT_CSS: Record<PrimaryAccent, string> = {
  classic: '--primary:var(--ink);--primary-contrast:var(--bg);--primary-tint:var(--bg-tint);',
  green: '--primary:var(--sage);--primary-contrast:var(--ink);--primary-tint:var(--sage-tint);',
};

/**
 * A tiny synchronous script for the top of the document. It reads the stored
 * record, honours the legacy dark flag the same way the app does, and appends
 * one stylesheet of custom properties. applyPreferences takes it back off once
 * React is running and the values live inline instead.
 */
export const PREFERENCE_BOOTSTRAP_SCRIPT = `(function(){try{
var T=${JSON.stringify(TONE_CSS)},D=${JSON.stringify(DENSITY_CSS)},A=${JSON.stringify(ACCENT_CSS)};
var LT=${JSON.stringify(LEGACY_TONES)},LD=${JSON.stringify(LEGACY_DENSITY)};
var p={};try{p=JSON.parse(window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))||{};}catch(e){}
var t=LT[p.paperTone]||p.paperTone;
t=p.darkMode===true?'night':(T[t]!==undefined?t:'paper');
var d=LD[p.density]||p.density;
d=D[d]!==undefined?d:'normal';
var a=A[p.primaryAccent]!==undefined?p.primaryAccent:'classic';
var s=document.createElement('style');s.id=${JSON.stringify(BOOT_STYLE_ID)};
s.textContent=':root{'+T[t]+D[d]+A[a]+'}';
document.head.appendChild(s);}catch(e){}})();`;

/** Reads the stored record, migrations applied. Safe on the server. */
export function readPreferences(): Preferences {
  return readFromStorage();
}

/** Date used for planner records, honoring the chosen late-night cutoff. */
export function plannerDate(value = new Date()): string {
  let cutoff = DEFAULTS.dayEndingHour;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) cutoff = sanitizePreferences(JSON.parse(raw)).dayEndingHour;
  } catch { /* regular calendar days remain a safe fallback */ }
  const adjusted = new Date(value);
  adjusted.setHours(adjusted.getHours() - cutoff);
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}-${String(adjusted.getDate()).padStart(2, '0')}`;
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    const next = readFromStorage();
    setPrefs(next);
    applyPreferences(next);
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = sanitizePreferences({ ...current, ...patch });
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota / private mode
      }
      applyPreferences(next);
      return next;
    });
  }, []);

  return [prefs, update];
}

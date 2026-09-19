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
export type PaperTone = 'warm' | 'paper' | 'stone' | 'white' | 'night';
// Fraunces on the Paper tone is the default the app ships in; Cormorant /
// Lora / Merriweather remain selectable in Appearance.
export type HeadingFont = 'cormorant' | 'fraunces' | 'lora' | 'merriweather';
export type Density = 'cozy' | 'comfy' | 'compact';
export type PrimaryAccent = 'classic' | 'green';

export interface Preferences {
  paperTone: PaperTone;
  headingFont: HeadingFont;
  density: Density;
  primaryAccent: PrimaryAccent;
  dailyReminder: boolean;
  sessionSound: boolean;
  hideWeekends: boolean;
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
  headingFont: 'fraunces',
  density: 'comfy',
  primaryAccent: 'classic',
  dailyReminder: true,
  sessionSound: false,
  hideWeekends: false,
  darkMode: false,
  dayEndingHour: 0,
};

const STORAGE_KEY = 'akada.preferences.v1';

const PAPER_TONE_VALUES: PaperTone[] = ['warm', 'paper', 'stone', 'white', 'night'];
const HEADING_FONT_VALUES: HeadingFont[] = ['cormorant', 'fraunces', 'lora', 'merriweather'];
const DENSITY_VALUES: Density[] = ['cozy', 'comfy', 'compact'];
const PRIMARY_ACCENT_VALUES: PrimaryAccent[] = ['classic', 'green'];

function sanitizePreferences(value: unknown): Preferences {
  const parsed = value && typeof value === 'object' ? (value as Partial<Preferences>) : {};
  const paperTone = PAPER_TONE_VALUES.includes(parsed.paperTone as PaperTone)
    ? (parsed.paperTone as PaperTone)
    : DEFAULTS.paperTone;
  return {
    paperTone,
    headingFont: HEADING_FONT_VALUES.includes(parsed.headingFont as HeadingFont)
      ? (parsed.headingFont as HeadingFont)
      : DEFAULTS.headingFont,
    density: DENSITY_VALUES.includes(parsed.density as Density)
      ? (parsed.density as Density)
      : DEFAULTS.density,
    primaryAccent: PRIMARY_ACCENT_VALUES.includes(parsed.primaryAccent as PrimaryAccent)
      ? (parsed.primaryAccent as PrimaryAccent)
      : DEFAULTS.primaryAccent,
    dailyReminder:
      typeof parsed.dailyReminder === 'boolean'
        ? parsed.dailyReminder
        : DEFAULTS.dailyReminder,
    sessionSound:
      typeof parsed.sessionSound === 'boolean' ? parsed.sessionSound : DEFAULTS.sessionSound,
    hideWeekends:
      typeof parsed.hideWeekends === 'boolean' ? parsed.hideWeekends : DEFAULTS.hideWeekends,
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
  white: {
    bg: '#FFFFFF',
    tint: '#F2F2F0',
    paper: '#FFFFFF',
    paper2: '#FBFBFA',
    line: '#E8E5DC',
    lineSoft: '#F1F0EA',
    lineStrong: '#DDD8CB',
    ...DAY_INK,
    glowA: 'rgba(180, 180, 170, 0.05)',
    glowB: 'rgba(150, 150, 145, 0.04)',
  },
  night: {
    // Warm ink on a dark page, not an inversion. The ground is a deep brown
    // charcoal rather than black, the page sits a shade above it the way a
    // card sits above the desk in daylight, and the ruled lines stay faint.
    bg: '#1A1815',
    tint: '#24211C',
    paper: '#221F1A',
    paper2: '#1E1B17',
    line: '#35312A',
    lineSoft: '#2A2721',
    lineStrong: '#4A4438',
    ink: '#EFE9DC',
    inkSoft: '#C8C0B0',
    muted: '#958D7E',
    mutedSoft: '#6B6459',
    glowA: 'rgba(196, 168, 106, 0.07)',
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

  '--highlight-yellow': 'rgba(228, 197, 92, 0.26)',
  '--highlight-pink': 'rgba(214, 132, 132, 0.24)',
  '--highlight-mint': 'rgba(135, 181, 156, 0.26)',

  // The whole url, not a colour inside it: a custom property cannot reach
  // into a data URI. globals.css reads this through .hand-underline.
  '--underline-svg':
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 8' preserveAspectRatio='none'><path d='M2 5 Q40 2 80 4 T160 5 T198 4' stroke='%23EFE9DC' stroke-width='1.4' fill='none' stroke-linecap='round' opacity='0.55'/></svg>\")",
  '--scrim': 'rgba(8, 7, 6, 0.55)',
  '--noise-blend': 'screen',
  '--noise-opacity': '0.14',
};

// Maps user choice -> the next/font CSS variable that wires to that family.
// We override --font-serif (which Tailwind's font-serif resolves to) so the
// switch ripples through every heading without per-component changes.
//
// `fraunces` (the default) clears the override and lets globals.css's :root
// rule provide the Fraunces stack, so the first paint already matches.
const HEADING_VAR_OVERRIDE: Record<HeadingFont, string | null> = {
  fraunces: null,
  cormorant: 'var(--font-cormorant)',
  lora: 'var(--font-lora)',
  merriweather: 'var(--font-merriweather)',
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

  const override = HEADING_VAR_OVERRIDE[prefs.headingFont];
  if (override) {
    root.style.setProperty('--font-serif', override);
  } else {
    root.style.removeProperty('--font-serif');
  }
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
  comfy: '--density-gutter:22px;--density-gap:12px;--density-section:32px;',
  cozy: '--density-gutter:26px;--density-gap:16px;--density-section:40px;',
  compact: '--density-gutter:18px;--density-gap:9px;--density-section:24px;',
};

const FONT_CSS: Record<HeadingFont, string> = {
  fraunces: '',
  cormorant: '--font-serif:var(--font-cormorant);',
  lora: '--font-serif:var(--font-lora);',
  merriweather: '--font-serif:var(--font-merriweather);',
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
var T=${JSON.stringify(TONE_CSS)},D=${JSON.stringify(DENSITY_CSS)},F=${JSON.stringify(FONT_CSS)},A=${JSON.stringify(ACCENT_CSS)};
var p={};try{p=JSON.parse(window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))||{};}catch(e){}
var t=p.darkMode===true?'night':(T[p.paperTone]!==undefined?p.paperTone:'paper');
var d=D[p.density]!==undefined?p.density:'comfy';
var f=F[p.headingFont]!==undefined?p.headingFont:'fraunces';
var a=A[p.primaryAccent]!==undefined?p.primaryAccent:'classic';
var s=document.createElement('style');s.id=${JSON.stringify(BOOT_STYLE_ID)};
s.textContent=':root{'+T[t]+D[d]+F[f]+A[a]+'}';
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

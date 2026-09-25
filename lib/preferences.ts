'use client';

import { useSyncExternalStore } from 'react';

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
/**
 * What the Up next panel reaches for first.
 *
 * `in-progress` is the default: whatever a timer last ran on, if that task is
 * still open and the session was today or yesterday. Reopening the app in the
 * middle of a problem set and being handed something else is the one thing
 * the panel can do that is plainly wrong, and neither of the other two rules
 * could avoid it, because both only ever looked at what was due.
 *
 * `last-done` picks the task whose course has gone longest without a study
 * session, so the panel rotates through the term instead of pinning itself to
 * one course. A reader with four overdue readings in one course would
 * otherwise see that same course every time they opened Today, while the
 * courses they were actually neglecting stayed invisible.
 *
 * `overdue` is the oldest behaviour, kept because "whatever has waited
 * longest" is the right answer in the week before a deadline.
 */
export type UpNextSort = 'in-progress' | 'last-done' | 'overdue';
export type Density = 'cozy' | 'comfy' | 'compact';
export type PrimaryAccent = 'classic' | 'green';

export interface Preferences {
  paperTone: PaperTone;
  headingFont: HeadingFont;
  upNextSort: UpNextSort;
  density: Density;
  primaryAccent: PrimaryAccent;
  /**
   * Whether the timer chimes when a block ends and when a break is up. The
   * toggle predates continuous mode and did nothing until there was something
   * to announce; it now gates both notes (lib/chime.ts).
   */
  sessionSound: boolean;
  /**
   * How long the break after a block runs, in minutes. `0` turns the break
   * off, so a block that ends just keeps counting the way it always did.
   */
  breakMinutes: number;
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
  upNextSort: 'in-progress',
  density: 'comfy',
  primaryAccent: 'classic',
  // On, now that it has a job. A break whose end is not announced is a break
  // the reader has to sit and watch, which is not a break.
  sessionSound: true,
  breakMinutes: 5,
  hideWeekends: false,
  darkMode: false,
  dayEndingHour: 0,
};

const STORAGE_KEY = 'akada.preferences.v1';

const PAPER_TONE_VALUES: PaperTone[] = ['warm', 'paper', 'stone', 'white', 'night'];
const HEADING_FONT_VALUES: HeadingFont[] = ['cormorant', 'fraunces', 'lora', 'merriweather'];
const UP_NEXT_SORT_VALUES: UpNextSort[] = ['in-progress', 'last-done', 'overdue'];
const DENSITY_VALUES: Density[] = ['cozy', 'comfy', 'compact'];
const PRIMARY_ACCENT_VALUES: PrimaryAccent[] = ['classic', 'green'];
/** Zero is "no break"; the rest are what the timer offers. */
const BREAK_MINUTE_VALUES = [0, 5, 10, 15];

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
    upNextSort: UP_NEXT_SORT_VALUES.includes(parsed.upNextSort as UpNextSort)
      ? (parsed.upNextSort as UpNextSort)
      : DEFAULTS.upNextSort,
    density: DENSITY_VALUES.includes(parsed.density as Density)
      ? (parsed.density as Density)
      : DEFAULTS.density,
    primaryAccent: PRIMARY_ACCENT_VALUES.includes(parsed.primaryAccent as PrimaryAccent)
      ? (parsed.primaryAccent as PrimaryAccent)
      : DEFAULTS.primaryAccent,
    sessionSound:
      typeof parsed.sessionSound === 'boolean' ? parsed.sessionSound : DEFAULTS.sessionSound,
    hideWeekends:
      typeof parsed.hideWeekends === 'boolean' ? parsed.hideWeekends : DEFAULTS.hideWeekends,
    breakMinutes: BREAK_MINUTE_VALUES.includes(Number(parsed.breakMinutes))
      ? Number(parsed.breakMinutes)
      : DEFAULTS.breakMinutes,
    darkMode: paperTone === 'night',
    dayEndingHour:
      typeof parsed.dayEndingHour === 'number' && parsed.dayEndingHour >= 0 && parsed.dayEndingHour <= 8
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
  /**
   * The desk under the page on desktop: what the rail sits on, a step darker
   * than `bg`, so the page reads as a sheet lying over the margin with no
   * line between them.
   */
  desk: string;
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
    desk: '#EEE9DD',
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
    desk: '#E8E2D5',
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
    desk: '#E7E7E1',
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
    desk: '#F0EFEB',
  },
  night: {
    // Warm ink on a dark page, not an inversion. The ground is a deep brown
    // charcoal rather than black, the page sits a shade above it the way a
    // card sits above the desk in daylight, and the ruled lines stay faint.
    //
    // `tint` is the wash a selected filter, an active rail item, a hover or a
    // progress track is filled with, and almost all of those are drawn on a
    // `paper` card rather than on the ground. It used to be #24211C, two
    // points off `paper`, which meant every one of those states was simply
    // invisible on the night page. A daylight tint steps toward the ink from
    // the page it sits on; here the ink is the light value, so the step is
    // upward and has to be worth roughly as much.
    bg: '#1A1815',
    tint: '#2E2A23',
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
    desk: '#110F0D',
  },
};

/**
 * What the night paper changes beyond the paper-and-ink foundation.
 *
 * The pastels themselves are left exactly as they are, because a course owns
 * its colour (PASTEL_PALETTE in lib/utils.ts) and that colour must be the
 * same object in either light. What changes is every value derived from a
 * white page: the pastel *tints*, which were near-white washes, and which
 * reach a course through resolveTint rather than through the daylight hex its
 * record stores, or these overrides never touch the thing they are for; the alarm
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
  // The page lying over the margin: a shadow reads on cream and vanishes on
  // the night desk, so there the edge is carried by a lit hairline and a
  // deeper shadow, and the second sheet under the curve is left out.
  '--sheet-shadow': '-1px 0 0 rgba(255, 240, 220, 0.06), -12px 0 30px rgba(0, 0, 0, 0.55)',
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

/**
 * What the browser paints around the page: the address bar on Android, the
 * status bar of an installed app, the strip either side of a phone in
 * landscape. It is not a custom property, so it goes on the meta tag rather
 * than the root element, and the tag is ours rather than Next's: a value in
 * the `viewport` export is React-owned and came back as the shipped cream on
 * every client navigation, leaving a dark page in a cream frame. The
 * bootstrap script writes the tag before the first paint; this keeps it in
 * step, and still creates one if it is somehow missing.
 */
function applyThemeColor(bg: string) {
  const tags = document.head.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]:not([media])',
  );
  if (tags.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = bg;
    document.head.appendChild(meta);
    return;
  }
  tags.forEach((tag) => {
    tag.content = bg;
  });
}

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
    '--desk': tone.desk,
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
  applyThemeColor(tone.bg);

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

/**
 * One paper's tokens as a style object, for a surface that sits on a
 * different paper from the page around it. Notes' focus mode is the one:
 * a reader can take a single note under the lamp without changing the app.
 * Custom properties set on an element reach its descendants over the root's
 * inline ones, so this scopes cleanly.
 */
export function paperToneStyle(key: PaperTone): Record<string, string> {
  const vars = toneVariables(PAPER_TONES[key] ?? PAPER_TONES[DEFAULTS.paperTone]);
  return key === 'night' ? { ...vars, ...NIGHT_TOKENS, colorScheme: 'dark' } : vars;
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

/** The ground of each paper, for the chrome the browser draws around it. */
const TONE_THEME_COLOR: Record<PaperTone, string> = PAPER_TONE_VALUES.reduce(
  (acc, key) => {
    acc[key] = PAPER_TONES[key].bg;
    return acc;
  },
  {} as Record<PaperTone, string>,
);

/**
 * A tiny synchronous script for the top of the document. It reads the stored
 * record, honours the legacy dark flag the same way the app does, appends one
 * stylesheet of custom properties, and writes the theme-color tag so the
 * browser chrome starts on the right paper too. applyPreferences takes the
 * stylesheet back off once React is running and the values live inline.
 */
export const PREFERENCE_BOOTSTRAP_SCRIPT = `(function(){try{
var T=${JSON.stringify(TONE_CSS)},D=${JSON.stringify(DENSITY_CSS)},F=${JSON.stringify(FONT_CSS)},A=${JSON.stringify(ACCENT_CSS)},C=${JSON.stringify(TONE_THEME_COLOR)};
var p={};try{p=JSON.parse(window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))||{};}catch(e){}
var t=p.darkMode===true?'night':(T[p.paperTone]!==undefined?p.paperTone:'paper');
var d=D[p.density]!==undefined?p.density:'comfy';
var f=F[p.headingFont]!==undefined?p.headingFont:'fraunces';
var a=A[p.primaryAccent]!==undefined?p.primaryAccent:'classic';
var s=document.createElement('style');s.id=${JSON.stringify(BOOT_STYLE_ID)};
s.textContent=':root{'+T[t]+D[d]+F[f]+A[a]+'}';
document.head.appendChild(s);
var m=document.head.querySelectorAll('meta[name="theme-color"]:not([media])');
if(m.length){for(var i=0;i<m.length;i++)m[i].setAttribute('content',C[t]);}
else{var n=document.createElement('meta');n.setAttribute('name','theme-color');n.setAttribute('content',C[t]);document.head.appendChild(n);}
}catch(e){}})();`;

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

/* ───────── one record for the whole app ─────────
   Every screen used to hold its own copy of the preferences in useState.
   Today renders the settings sheet and its own Up next sort side by side, so
   picking White in the sheet and then tapping the sort wrote the page's stale
   copy back over it, and the reader was on Paper again. One record here, and
   every caller of usePreferences reads and writes that same one. */

let current: Preferences | null = null;
const listeners = new Set<() => void>();

function snapshot(): Preferences {
  if (current === null) current = readFromStorage();
  return current;
}

function serverSnapshot(): Preferences {
  return DEFAULTS;
}

function emit() {
  listeners.forEach((listener) => listener());
}

/** Another tab changed the record: take it, so two open tabs cannot fight. */
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  current = readFromStorage();
  applyPreferences(current);
  emit();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function updatePreferences(patch: Partial<Preferences>) {
  const next = sanitizePreferences({ ...snapshot(), ...patch });
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  applyPreferences(next);
  emit();
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const prefs = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [prefs, updatePreferences];
}

'use client';

import { useEffect, useState, useCallback } from 'react';

export type PaperTone = 'warm' | 'paper' | 'stone' | 'white';
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
}

const DEFAULTS: Preferences = {
  paperTone: 'paper',
  headingFont: 'fraunces',
  density: 'comfy',
  primaryAccent: 'classic',
  dailyReminder: true,
  sessionSound: false,
  hideWeekends: false,
};

const STORAGE_KEY = 'akada.preferences.v1';

const PAPER_TONE_VALUES: PaperTone[] = ['warm', 'paper', 'stone', 'white'];
const HEADING_FONT_VALUES: HeadingFont[] = ['cormorant', 'fraunces', 'lora', 'merriweather'];
const DENSITY_VALUES: Density[] = ['cozy', 'comfy', 'compact'];
const PRIMARY_ACCENT_VALUES: PrimaryAccent[] = ['classic', 'green'];

function sanitizePreferences(value: unknown): Preferences {
  const parsed = value && typeof value === 'object' ? (value as Partial<Preferences>) : {};
  return {
    paperTone: PAPER_TONE_VALUES.includes(parsed.paperTone as PaperTone)
      ? (parsed.paperTone as PaperTone)
      : DEFAULTS.paperTone,
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
  };
}

const PAPER_TONES: Record<
  PaperTone,
  {
    bg: string;
    tint: string;
    paper: string;
    paper2: string;
    line: string;
    lineSoft: string;
    lineStrong: string;
    glowA: string;
    glowB: string;
  }
> = {
  warm: {
    // Refined paper-warm tones (Akada · Vol. III)
    bg: '#FAF8F2',
    tint: '#F1ECDF',
    paper: '#FFFCF5',
    paper2: '#FBF7EA',
    line: '#E5DECC',
    lineSoft: '#EFE9D8',
    lineStrong: '#D7CDB3',
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
    glowA: 'rgba(180, 180, 170, 0.05)',
    glowB: 'rgba(150, 150, 145, 0.04)',
  },
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

function readFromStorage(): Preferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return sanitizePreferences(parsed);
  } catch {
    return DEFAULTS;
  }
}

export function applyPreferences(prefs: Preferences) {
  if (typeof document === 'undefined') return;
  const tone = PAPER_TONES[prefs.paperTone] || PAPER_TONES[DEFAULTS.paperTone];
  const root = document.documentElement;
  root.style.setProperty('--bg', tone.bg);
  root.style.setProperty('--bg-tint', tone.tint);
  root.style.setProperty('--paper', tone.paper);
  root.style.setProperty('--paper-2', tone.paper2);
  root.style.setProperty('--line', tone.line);
  root.style.setProperty('--line-soft', tone.lineSoft);
  root.style.setProperty('--line-strong', tone.lineStrong);
  root.style.setProperty('--paper-glow-a', tone.glowA);
  root.style.setProperty('--paper-glow-b', tone.glowB);
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

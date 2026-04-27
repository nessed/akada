'use client';

import { useEffect } from 'react';
import { applyPreferences } from '@/lib/preferences';

const STORAGE_KEY = 'akada.preferences.v1';

const DEFAULTS = {
  paperTone: 'warm' as const,
  headingFont: 'fraunces' as const,
  density: 'comfy' as const,
  dailyReminder: true,
  sessionSound: false,
  hideWeekends: false,
};

export default function PreferencesBootstrap() {
  useEffect(() => {
    let prefs = DEFAULTS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) prefs = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    applyPreferences(prefs);
  }, []);

  return null;
}

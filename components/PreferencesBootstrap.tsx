'use client';

import { useEffect } from 'react';
import {
  applyPreferences,
  readPreferences,
  PREFERENCE_BOOTSTRAP_SCRIPT,
} from '@/lib/preferences';
import { RAIL_BOOTSTRAP_SCRIPT } from '@/lib/rail';

/**
 * Puts the reader's chosen paper on the page before the first pixel.
 *
 * This used to apply preferences from an effect, which runs after the browser
 * has already painted the shipped cream. On the night paper that is a full
 * white flash on every load, and the effect also carried its own copy of the
 * defaults, which had drifted from the real ones. Now a synchronous script
 * writes one stylesheet of custom properties while the document is still
 * parsing, and the effect below hands the same values to applyPreferences,
 * which writes them inline and removes the bootstrap sheet it replaces.
 *
 * The same script puts the desktop rail's collapsed choice on <html> as
 * data-rail, so the rail and the page beside it are the right width on the
 * first frame too (see lib/rail.ts).
 *
 * Nothing here touches an attribute React rendered, so hydration sees the
 * markup it expects.
 */
export default function PreferencesBootstrap() {
  useEffect(() => {
    applyPreferences(readPreferences());
  }, []);

  return (
    <script dangerouslySetInnerHTML={{ __html: PREFERENCE_BOOTSTRAP_SCRIPT + RAIL_BOOTSTRAP_SCRIPT }} />
  );
}

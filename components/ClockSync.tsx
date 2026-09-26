'use client';

import { useEffect } from 'react';
import { db } from '@/lib/data';
import { usePreferences } from '@/lib/preferences';
import { deviceClock } from '@/lib/student-day';

/**
 * Tells the server what day it is for this student, so the Claude connector
 * dates a sitting, a week or a recall answer the way this screen would.
 *
 * The time zone comes off the device and the cutoff off Settings, and both
 * are written only when they change (the adapter remembers the last one).
 * Renders nothing and never complains: a failed write leaves the connector on
 * UTC, which is where it was before any of this.
 */
export default function ClockSync() {
  const [prefs] = usePreferences();
  const cutoff = prefs.dayEndingHour;

  useEffect(() => {
    db.recordClock(deviceClock(cutoff)).catch(() => {});
  }, [cutoff]);

  return null;
}

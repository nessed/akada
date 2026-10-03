'use client';

import { useEffect } from 'react';
import { useNotice } from './Notice';
import { onEnded } from '@/lib/timer-ended';

/** Reads the timer's reasons for stopping out through the notice slip. */
export default function TimerEndedNotice() {
  const { notify } = useNotice();
  useEffect(() => onEnded(notify), [notify]);
  return null;
}

'use client';

import { useEffect, useRef } from 'react';
import { useTimer } from '@/lib/timer-context';
import { stretchFace } from '@/lib/timer-face';

function formatTimerTitle(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function TimerDocumentTitle() {
  const { active, pendingLog, elapsedSeconds, onBreak, breakTarget } = useTimer();
  // What the router last put in the tab, as opposed to what this component
  // last put there. Capturing the base title once on mount meant that every
  // navigation made while a timer ran was forgotten: stopping the timer on
  // /stats restored whatever page happened to be open when it started.
  const baseTitleRef = useRef<string | null>(null);
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (document.title !== appliedRef.current) {
      baseTitleRef.current = document.title || 'Akada';
    }

    // The same number as the timer's face: the stretch on the clock, so the
    // tab starts again on the new block after a break rather than carrying
    // the whole session.
    const face = active
      ? stretchFace({ onBreak, breakTarget, target: active.targetSeconds, elapsed: elapsedSeconds })
      : null;
    const digits = face ? formatTimerTitle(face.seconds) : '';
    const next = pendingLog
      ? 'Log session | Akada'
      : active && face
        ? onBreak
          ? `${face.over ? 'Break over' : 'Break'} ${digits} | Timer`
          : active.isPaused
            ? `Paused ${digits} | Timer`
            : face.over
              ? `Over ${digits} | Timer`
              : `${digits} | Timer`
        : baseTitleRef.current;

    if (next && document.title !== next) document.title = next;
    appliedRef.current = next;
  }, [active, breakTarget, elapsedSeconds, onBreak, pendingLog]);

  // Leaving the app on a timer title after this component goes away would
  // strand the tab on a frozen clock.
  useEffect(() => {
    return () => {
      if (baseTitleRef.current && document.title === appliedRef.current) {
        document.title = baseTitleRef.current;
      }
    };
  }, []);

  return null;
}

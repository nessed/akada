'use client';

import { useEffect, useRef } from 'react';
import { useTimer } from '@/lib/timer-context';

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
  const { active, pendingLog, elapsedSeconds } = useTimer();
  const baseTitleRef = useRef<string | null>(null);

  useEffect(() => {
    baseTitleRef.current ??= document.title || 'Akada';

    if (pendingLog) {
      document.title = 'Log session | Akada';
      return;
    }

    if (active) {
      const timerText = formatTimerTitle(elapsedSeconds);
      document.title = active.isPaused
        ? `Paused ${timerText} | Timer`
        : `${timerText} | Timer`;
      return;
    }

    document.title = baseTitleRef.current;
  }, [active, elapsedSeconds, pendingLog]);

  return null;
}

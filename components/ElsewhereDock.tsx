'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCourses } from '@/lib/data-hooks';
import { deviceId } from '@/lib/device';
import { sittingFromSnapshot } from '@/lib/live-sitting';
import { setSittingElsewhere, useSittingElsewhere } from '@/lib/sitting-elsewhere';
import { useTimerState } from '@/lib/timer-context';
import { formatHHMMSS, resolveTint } from '@/lib/utils';

/**
 * A sitting running on another of the reader's devices, where the dock would
 * be, with the one thing to do about it: take it over here.
 *
 * Drawn the way the dock is, but in outline: the dot is a ring, the time is
 * the other device's, and nothing here can pause or finish it. Taking it over
 * carries the sitting on from where it is, blocks, breaks and notes and all,
 * and the other device lets go of it the next time it reads the server
 * (components/LiveSittingSync.tsx), so it is only ever logged once.
 */
export default function ElsewhereDock() {
  const router = useRouter();
  const raw = useSittingElsewhere();
  const { hydrated, active, pendingLog, adopt } = useTimerState();
  const { courses } = useCourses();
  const [now, setNow] = useState<number | null>(null);

  const showing = hydrated && raw != null && !active && !pendingLog;
  useEffect(() => {
    if (!showing) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [showing]);

  const elsewhere = useMemo(
    () => (showing && now != null ? sittingFromSnapshot(raw, now, deviceId()) : null),
    [showing, raw, now],
  );
  const course = useMemo(
    () => (elsewhere ? courses.find((c) => c.id === elsewhere.reading.course_id) ?? null : null),
    [elsewhere, courses],
  );

  if (!elsewhere) return null;

  const { reading, label } = elsewhere;
  const color = course?.color ?? 'var(--ink)';
  const tint = course ? resolveTint(course.color, course.tint) : 'var(--bg-tint)';
  const code = course?.code ?? 'Timer';
  const stretch = reading.current_stretch_seconds ?? 0;
  const held = reading.state === 'paused' || reading.quiet;
  const what = reading.state === 'break' ? 'on a break' : held ? 'paused' : 'running';

  function takeOver() {
    const fresh = sittingFromSnapshot(raw, Date.now(), deviceId());
    if (!fresh || !adopt(fresh.state)) return;
    setSittingElsewhere(null);
    router.push('/timer');
  }

  return (
    <div
      /* The dock's own lane: top on a phone, the foot of the screen from md,
         clear of the rail. See ActiveTimerDock. */
      className="fixed inset-x-0 top-[max(env(safe-area-inset-top),14px)] md:top-auto md:bottom-[calc(2rem+env(safe-area-inset-bottom))] z-50 px-[var(--density-gutter)] md:pl-[calc(var(--rail,0px)+3rem)] md:pr-12 pointer-events-none animate-fade-in"
    >
      <div className="mx-auto flex max-w-2xl md:max-w-none justify-end">
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-[10px] border border-dashed border-line-strong bg-paper/90 p-1 pl-2.5 backdrop-blur"
          style={{ boxShadow: `inset 0 0 0 1px ${tint}` }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ border: `1.5px solid ${color}` }}
            aria-hidden
          />
          <span className="min-w-0 block pl-1" aria-hidden>
            <span className="eyebrow block max-w-[74px] truncate" style={{ color }}>
              {code}
            </span>
            <span className="block leading-[1.15]">
              <span className="font-mono text-[13px] font-semibold tabular-nums text-ink-soft">
                {formatHHMMSS(stretch)}
              </span>
              <span className="ml-1.5 font-serif text-[12px] italic text-muted">on your {label}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={takeOver}
            aria-label={`${code} is ${what} on your ${label}, ${formatHHMMSS(stretch)} in. Take it over here.`}
            className="ml-1 min-h-[44px] rounded-[8px] bg-transparent px-3 text-[13px] font-medium text-ink"
          >
            Take over
          </button>
        </div>
      </div>
    </div>
  );
}

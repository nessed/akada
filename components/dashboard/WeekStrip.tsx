'use client';

import type { SpineDay } from '../notebook/WeekSpine';
import { formatHM } from '@/lib/utils';

/**
 * The week spine turned sideways, for a phone.
 *
 * Same seven days, same facts, and the same rule about who says what: the
 * duration is written out under the day, because "1h 45m" is a fact anyone
 * can read and a column of two-pixel strokes is not. The strokes belonged to
 * a version of this strip that had nothing else in it; a day with work still
 * owing now says how much, and the reader's own day is ruled under its name.
 * A day with neither hours nor anything due holds its place and says nothing.
 */
export default function WeekStrip({ days }: { days: SpineDay[] }) {
  return (
    <div className="flex items-end justify-between gap-1 border-b border-line pb-2.5">
      {days.map((day) => {
        const due = day.dueCount;
        return (
          <span
            key={day.iso}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <span
              // Past days step back in ink rather than in opacity: 55% of
              // ink-soft is a contrast failure, `muted` is a token that has
              // to clear 4.5:1 to ship.
              className={`tnum whitespace-nowrap font-mono text-[11px] ${
                day.isToday ? 'text-ink' : day.isPast ? 'text-muted' : 'text-ink-soft'
              }`}
            >
              {day.loggedSeconds > 0 ? formatHM(day.loggedSeconds) : due > 0 ? `${due} due` : '\u00a0'}
            </span>
            <span
              className={`text-[11px] uppercase tracking-[0.04em] ${
                day.isToday
                  ? 'border-b-[1.5px] border-ink pb-0.5 font-bold text-ink'
                  : 'font-semibold text-muted'
              }`}
            >
              {day.weekday.charAt(0)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

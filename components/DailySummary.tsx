'use client';

import type { Course, Session } from '@/lib/data';
import { formatHM } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';

interface Props {
  todaysSessions: Session[];
  courses: Course[];
}

export default function DailySummary({ todaysSessions, courses }: Props) {
  const safeSessions = todaysSessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const total = safeSessions.reduce((a, s) => a + clampSessionSeconds(s.durationSeconds), 0);

  // Per-course totals
  const perCourse: Record<string, number> = {};
  for (const s of safeSessions) {
    perCourse[s.courseId] = (perCourse[s.courseId] || 0) + clampSessionSeconds(s.durationSeconds);
  }

  return (
    <section className="py-2">
      {total === 0 ? (
        <>
          <p className="m-0 font-serif italic text-[17px] text-muted-soft">
            A blank page.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono font-medium text-[32px] tracking-[-0.02em] leading-none tabular-nums text-ink">
              {formatHM(total)}
            </span>
            <span className="text-[13px] text-muted font-serif italic">
              logged today
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2">
            {courses
              .filter((c) => perCourse[c.id])
              .map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 text-[13px] text-ink"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: c.color }}
                  />
                  <span className="font-serif italic">{c.name}</span>
                  <span className="text-muted font-mono text-[11px] ml-0.5">
                    {formatHM(perCourse[c.id])}
                  </span>
                </span>
              ))}
          </div>
        </>
      )}
    </section>
  );
}

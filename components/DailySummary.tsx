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
  const sessionCount = safeSessions.length;

  // Per-course totals
  const perCourse: Record<string, number> = {};
  for (const s of safeSessions) {
    perCourse[s.courseId] = (perCourse[s.courseId] || 0) + clampSessionSeconds(s.durationSeconds);
  }
  const activeCourses = courses.filter((c) => perCourse[c.id]);

  if (total === 0) {
    return (
      <section className="py-2">
        <p className="m-0 font-serif italic text-[17px] text-muted-soft">A blank page.</p>
      </section>
    );
  }

  return (
    <section
      className="deckle relative mt-2 overflow-hidden border border-line bg-paper px-[22px] py-[18px]"
    >
      {/* Page-fold corner — folded-down notebook page detail */}
      <div
        aria-hidden
        className="absolute right-0 top-0"
        style={{
          width: 22,
          height: 22,
          background: 'linear-gradient(225deg, var(--bg-tint) 50%, transparent 50%)',
        }}
      />

      <div className="flex items-baseline gap-2.5">
        <span className="font-mono font-semibold text-[34px] leading-none tracking-[-0.02em] tabular-nums text-ink">
          {formatHM(total)}
        </span>
        <span className="text-[12px] text-muted">today</span>
        <span className="ml-auto font-serif italic text-[11px] text-muted">
          {sessionCount} session{sessionCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Course-tinted ribbon */}
      <div className="mt-3.5 flex h-1.5 overflow-hidden rounded-full bg-bg-tint">
        {safeSessions.map((s) => {
          const c = courses.find((c) => c.id === s.courseId);
          const pct = (clampSessionSeconds(s.durationSeconds) / total) * 100;
          return (
            <span
              key={s.id}
              style={{ width: `${pct}%`, background: c?.color || 'var(--muted)' }}
            />
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
        {activeCourses.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 text-[10.5px] text-muted"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: c.color }}
            />
            {c.code}
            <span className="font-mono ml-0.5">{formatHM(perCourse[c.id])}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

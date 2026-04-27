'use client';

import type { Course, Session } from '@/lib/data';
import { formatHM } from '@/lib/utils';

interface Props {
  todaysSessions: Session[];
  courses: Course[];
}

export default function DailySummary({ todaysSessions, courses }: Props) {
  const total = todaysSessions.reduce((a, s) => a + s.durationSeconds, 0);
  const sessionCount = todaysSessions.length;

  // Per-course totals
  const perCourse: Record<string, number> = {};
  for (const s of todaysSessions) {
    perCourse[s.courseId] = (perCourse[s.courseId] || 0) + s.durationSeconds;
  }

  return (
    <section className="relative bg-paper rounded-[14px] border border-line py-5 px-[22px] overflow-hidden">
      <div
        aria-hidden
        className="absolute right-0 top-0 h-[22px] w-[22px]"
        style={{
          background: 'linear-gradient(225deg, var(--bg-tint) 50%, transparent 50%)',
        }}
      />
      {total === 0 ? (
        <>
          <p className="m-0 font-serif italic text-[18px] text-ink-soft">
            A blank page.
          </p>
          <p className="mt-1.5 mb-0 text-[13px] text-muted leading-[1.5]">
            Pick a course below to begin today&apos;s first session.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono font-semibold text-[36px] tracking-[-0.02em] leading-none tabular-nums">
              {formatHM(total)}
            </span>
            <span className="text-[13px] text-muted">
              across {sessionCount} session{sessionCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Sparkline ribbon */}
          <div className="mt-3.5 flex gap-[3px] h-1.5 rounded-full overflow-hidden bg-bg-tint">
            {todaysSessions.map((s) => {
              const c = courses.find((c) => c.id === s.courseId);
              const pct = (s.durationSeconds / total) * 100;
              return (
                <div
                  key={s.id}
                  style={{ width: `${pct}%`, background: c?.color || 'var(--muted)' }}
                />
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
            {courses
              .filter((c) => perCourse[c.id])
              .map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 text-xs text-ink-soft"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: c.color }}
                  />
                  {c.code}
                  <span className="text-muted font-mono">
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

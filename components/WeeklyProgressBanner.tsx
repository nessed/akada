'use client';

import type { Course, Session } from '@/lib/data';
import { formatHM, sessionsThisWeek, totalSeconds } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';

interface Props {
  courses: Course[];
  sessions: Session[];
}

export default function WeeklyProgressBanner({ courses, sessions }: Props) {
  const thisWeekSessions = sessionsThisWeek(sessions).filter((s) =>
    isLoggableDuration(s.durationSeconds),
  );
  const totalWkSec = totalSeconds(thisWeekSessions);

  // Sum weeklyGoalHours for all active courses (with default fallback to 8h or credits * 2)
  const totalGoalHours = courses.reduce((sum, c) => {
    const defaultGoal =
      typeof c.credits === 'number' && c.credits > 0 ? c.credits * 2 : 8;
    const goal =
      Number.isFinite(c.weeklyGoalHours) && c.weeklyGoalHours > 0
        ? c.weeklyGoalHours
        : defaultGoal;
    return sum + goal;
  }, 0);

  const totalGoalSec = totalGoalHours * 3600;
  const overallPct = Math.min(
    100,
    Math.round((totalWkSec / (totalGoalSec || 1)) * 100),
  );

  // Per-course study time this week
  const perCourseSec: Record<string, number> = {};
  for (const s of thisWeekSessions) {
    perCourseSec[s.courseId] =
      (perCourseSec[s.courseId] || 0) + clampSessionSeconds(s.durationSeconds);
  }

  // Where the week stands, said in words rather than in a tinted capsule.
  let standingText = 'Starting week';
  let standingColor = 'var(--muted)';

  if (overallPct >= 100) {
    standingText = 'Goal reached';
    standingColor = 'var(--sage)';
  } else if (overallPct >= 75) {
    standingText = 'Almost there';
    standingColor = 'var(--clay)';
  } else if (overallPct >= 50) {
    standingText = 'Halfway';
    standingColor = 'var(--peach)';
  } else if (overallPct >= 25) {
    standingText = 'On track';
    standingColor = 'var(--lav)';
  } else if (totalWkSec > 0) {
    standingText = 'In progress';
    standingColor = 'var(--ink-soft)';
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <section className="deckle relative mt-2 overflow-hidden border border-line bg-paper px-[22px] py-[18px]">
      {/* Page-fold corner detail */}
      <div
        aria-hidden
        className="absolute right-0 top-0"
        style={{
          width: 22,
          height: 22,
          background: 'linear-gradient(225deg, var(--bg-tint) 50%, transparent 50%)',
        }}
      />

      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono font-semibold text-[26px] leading-none tracking-[-0.02em] tabular-nums text-ink">
            {formatHM(totalWkSec)}
          </span>
          <span className="text-xs text-muted font-sans">
            / {totalGoalHours}h goal
          </span>
        </div>
        <span
          className="font-serif text-[12.5px] italic"
          style={{ color: standingColor }}
        >
          {standingText}
        </span>
      </div>

      {/* Segmented multi-color progress bar by course */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-bg-tint">
        {courses.map((course) => {
          const sec = perCourseSec[course.id] || 0;
          if (sec === 0 || !totalGoalSec) return null;
          // Width proportionally clamped against totalGoalSec
          const pct = Math.min(100, (sec / totalGoalSec) * 100);
          return (
            <span
              key={course.id}
              title={`${course.code}: ${formatHM(sec)}`}
              className="transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: course.color,
              }}
            />
          );
        })}
      </div>

      {/* Footer course badges if study time exists */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {courses
            .filter((c) => perCourseSec[c.id])
            .map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 text-[10.5px] text-muted"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: c.color }}
                />
                {c.code}
                <span className="font-mono ml-0.5">
                  {formatHM(perCourseSec[c.id])}
                </span>
              </span>
            ))}
        </div>
        <span className="font-serif italic text-[11px] text-muted ml-auto">
          Week total
        </span>
      </div>
    </section>
  );
}

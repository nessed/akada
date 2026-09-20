'use client';

import type { Course, Session } from '@/lib/data';
import { formatHM, sessionsThisWeek, totalSeconds } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';

interface Props {
  todaysSessions: Session[];
  sessions: Session[];
  courses: Course[];
}

/**
 * The day, and the week under it.
 *
 * This replaces two components that had drifted into being the same one.
 * DailySummary and WeeklyProgressBanner each drew a deckle card with a
 * folded corner, a big mono total, a course-tinted bar and a row of course
 * dots with times, and the dashboard stacked them, so the top of the app's
 * home screen was the same widget printed twice with different numbers --
 * the same course names listed twice underneath.
 *
 * One card now, two registers. Today is the headline, because it is the
 * number somebody opens the app to change. The week is a line beneath it in
 * smaller type against its goal. The week's own course breakdown is gone
 * rather than merged: it named the same four courses as the row above it.
 */
export default function StudySummary({ todaysSessions, sessions, courses }: Props) {
  const safeToday = todaysSessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const todayTotal = safeToday.reduce((a, s) => a + clampSessionSeconds(s.durationSeconds), 0);

  const weekSessions = sessionsThisWeek(sessions).filter((s) =>
    isLoggableDuration(s.durationSeconds),
  );
  const weekTotal = totalSeconds(weekSessions);

  // A course with no goal of its own falls back to two hours per credit, or
  // eight. Same rule the weekly banner used, kept so the goal does not move.
  const goalHours = courses.reduce((sum, course) => {
    const fallback =
      typeof course.credits === 'number' && course.credits > 0 ? course.credits * 2 : 8;
    const goal =
      Number.isFinite(course.weeklyGoalHours) && course.weeklyGoalHours > 0
        ? course.weeklyGoalHours
        : fallback;
    return sum + goal;
  }, 0);
  const goalSeconds = goalHours * 3600;
  const weekPct = goalSeconds > 0 ? Math.min(100, (weekTotal / goalSeconds) * 100) : 0;

  const perCourse: Record<string, number> = {};
  for (const s of safeToday) {
    perCourse[s.courseId] = (perCourse[s.courseId] || 0) + clampSessionSeconds(s.durationSeconds);
  }
  const studiedToday = courses.filter((c) => perCourse[c.id]);

  // Where the week stands, said in words rather than in a tinted capsule.
  let standing = 'Starting week';
  let standingColor = 'var(--muted)';
  if (weekPct >= 100) {
    standing = 'Goal reached';
    standingColor = 'var(--sage)';
  } else if (weekPct >= 75) {
    standing = 'Almost there';
    standingColor = 'var(--clay)';
  } else if (weekPct >= 50) {
    standing = 'Halfway';
    standingColor = 'var(--peach)';
  } else if (weekPct >= 25) {
    standing = 'On track';
    standingColor = 'var(--lav)';
  } else if (weekTotal > 0) {
    standing = 'In progress';
    standingColor = 'var(--ink-soft)';
  }

  // Nothing logged in either window, so there is nothing to draw a card
  // around. The page says so in one line and moves on.
  if (todayTotal === 0 && weekTotal === 0) {
    return (
      <section className="py-2">
        <p className="m-0 font-serif italic text-[17px] text-muted-soft">A blank page.</p>
      </section>
    );
  }

  return (
    <section className="deckle relative mt-2 overflow-hidden border border-line bg-paper px-[var(--density-gutter)] py-[18px]">
      {/* Page-fold corner, folded-down notebook page detail */}
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
        <span className="font-mono text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
          {formatHM(todayTotal)}
        </span>
        <span className="text-[12px] text-muted">today</span>
        {safeToday.length > 0 && (
          <span className="ml-auto font-serif text-[11px] italic text-muted">
            {safeToday.length} session{safeToday.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {todayTotal > 0 && (
        <>
          <div className="mt-3.5 flex h-1.5 overflow-hidden rounded-full bg-bg-tint">
            {safeToday.map((s) => {
              const course = courses.find((c) => c.id === s.courseId);
              const pct = (clampSessionSeconds(s.durationSeconds) / todayTotal) * 100;
              return (
                <span
                  key={s.id}
                  style={{ width: `${pct}%`, background: course?.color || 'var(--muted)' }}
                />
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
            {studiedToday.map((course) => (
              <span
                key={course.id}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: course.color }}
                />
                {course.code}
                <span className="ml-0.5 font-mono tabular-nums">
                  {formatHM(perCourse[course.id])}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      {/* The week, quieter, on the other side of a ruled line. */}
      {courses.length > 0 && (
        <div className="mt-4 border-t border-dashed border-line pt-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-[17px] font-semibold leading-none tabular-nums text-ink-soft">
                {formatHM(weekTotal)}
              </span>
              <span className="text-[11px] text-muted">of {goalHours}h this week</span>
            </span>
            <span
              className="shrink-0 font-serif text-[12px] italic"
              style={{ color: standingColor }}
            >
              {standing}
            </span>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-bg-tint">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${weekPct}%`, background: 'var(--primary)' }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

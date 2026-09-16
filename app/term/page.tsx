'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import MonthGrid from '@/components/term/MonthGrid';
import GradeWeighting from '@/components/term/GradeWeighting';
import { Eyebrow } from '@/components/notebook/Marks';
import { isoDate, startOfWeek } from '@/lib/utils';
import { loggable } from '@/lib/derive';
import { termWeek } from '@/lib/review';
import { usePreferences } from '@/lib/preferences';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  useActiveSemester,
} from '@/lib/data-hooks';

/**
 * The term: one month at a time, with the weighted pieces marked on it.
 *
 * This screen did not exist. The app could tell you about today and about
 * last week, and nothing at all about the shape of the next two months —
 * which is where every exam and every essay actually sits. The month grid is
 * the deadline view; the aside is the part nobody else does, which is how
 * much of each grade is still to be decided.
 */
export default function TermPage() {
  const router = useRouter();
  const [prefs] = usePreferences();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { semester } = useActiveSemester();
  const sessions = useMemo(() => loggable(rawSessions), [rawSessions]);

  const today = isoDate();
  // Held still for the life of the render tree: a fresh Date on every render
  // would make every memo below it recompute, and the month grid is the most
  // expensive thing on the page.
  const now = useMemo(() => new Date(), []);
  // Which month is on screen, as an offset from this one. A number rather
  // than a Date so stepping past December is the calendar's problem.
  const [offset, setOffset] = useState(0);
  const termStart = semester?.startDate ?? null;

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) router.replace('/onboarding');
  }, [onboarded, onboardingLoading, onboardingError, router]);

  const month = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + offset, 1),
    [offset, now],
  );

  const weekNo = termWeek(termStart, now);

  /** The term's weeks, as hours logged, for the bars in the aside. */
  const termBars = useMemo(() => {
    if (!termStart) return [];
    const start = startOfWeek(new Date(termStart + 'T00:00:00'));
    const bars: { week: number; seconds: number; isNow: boolean }[] = [];
    for (let i = 0; i < 15; i += 1) {
      const from = new Date(start);
      from.setDate(start.getDate() + i * 7);
      const to = new Date(from);
      to.setDate(from.getDate() + 6);
      const fromIso = isoDate(from);
      const toIso = isoDate(to);
      bars.push({
        week: i + 1,
        seconds: sessions
          .filter((s) => s.date >= fromIso && s.date <= toIso)
          .reduce((acc, s) => acc + s.durationSeconds, 0),
        isNow: weekNo === i + 1,
      });
    }
    return bars;
  }, [termStart, sessions, weekNo]);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || tasksLoading || sessionsLoading;
  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Loading the term" className="mb-6" />
      </PageShell>
    );
  }

  const peak = Math.max(1, ...termBars.map((b) => b.seconds));

  const aside = (
    <>
      <GradeWeighting courses={courses} tasks={tasks} today={today} />

      {termBars.length > 0 && (
        <div className="mt-7 border-t border-line-strong pt-4">
          <Eyebrow className="mb-3">The term, week by week</Eyebrow>
          <div className="flex h-[74px] items-end gap-[5px]">
            {termBars.map((bar) => (
              <span
                key={bar.week}
                title={`Week ${bar.week} · ${Math.round(bar.seconds / 3600)}h`}
                className="flex-1"
                style={{
                  height: `${Math.max(4, (bar.seconds / peak) * 100)}%`,
                  background: bar.isNow
                    ? 'var(--ink)'
                    : bar.seconds > 0
                      ? 'var(--line-strong)'
                      : 'var(--bg-tint)',
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9.5px] text-muted-soft">
            <span>wk 01</span>
            <span>wk {String(weekNo ?? 1).padStart(2, '0')}</span>
            <span>wk 15</span>
          </div>
          <Link
            href="/stats"
            className="mt-3.5 inline-block border-b border-line-strong pb-0.5 font-serif text-[13.5px] italic text-ink-soft"
          >
            read any week back →
          </Link>
        </div>
      )}
    </>
  );

  return (
    <PageShell aside={aside}>
      <div className="flex items-end justify-between gap-5">
        <div>
          <Eyebrow style={{ letterSpacing: '0.18em' }}>
            {semester?.label || 'This term'}
            {weekNo ? ` · week ${weekNo} of 15` : ''}
          </Eyebrow>
          <h1 className="mt-2 font-serif text-[32px] font-normal leading-none tracking-[-0.03em] md:text-[42px]">
            {month.toLocaleDateString(undefined, { month: 'long' })}
            {month.getFullYear() !== now.getFullYear() && (
              <span className="ml-2 text-[20px] text-muted">{month.getFullYear()}</span>
            )}
          </h1>
        </div>

        {/* Three months named rather than a pair of arrows, so stepping is a
            choice between places instead of a direction. */}
        <div className="flex items-center gap-4 pb-1.5">
          {[-1, 0, 1].map((delta) => {
            const d = new Date(now.getFullYear(), now.getMonth() + offset + delta, 1);
            const label = d.toLocaleDateString(undefined, { month: 'short' });
            return delta === 0 ? (
              <span
                key={delta}
                aria-current="true"
                className="ink-underline font-serif text-sm text-ink"
              >
                {label}
              </span>
            ) : (
              <button
                key={delta}
                type="button"
                onClick={() => setOffset(offset + delta)}
                className="bg-transparent font-serif text-sm italic text-muted hover:text-ink-soft"
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <MonthGrid
        month={month}
        today={today}
        courses={courses}
        tasks={tasks}
        sessions={sessions}
        hideWeekends={prefs.hideWeekends}
      />

      <p className="mb-6 mt-3.5 font-serif text-[13.5px] italic text-muted">
        Tally marks are hours you logged. Circled is an exam. Weekends sit on the lighter paper.
      </p>
    </PageShell>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { useNotice } from '@/components/Notice';
import SwipeRow from '@/components/SwipeRow';
import LoadingIndicator from '@/components/LoadingIndicator';
import Heatmap from '@/components/Heatmap';
import WeeklyChart from '@/components/WeeklyChart';
import GradeWeighting from '@/components/term/GradeWeighting';
import type { Course, Session, Task } from '@/lib/data';
import { formatHM, formatRelativeDate, isoDate, studyStreakDays, totalSeconds } from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import Stamp from '@/components/notebook/Stamp';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useActiveSemester,
  useTasks,
  addSessionOptimistic,
  deleteSessionOptimistic,
} from '@/lib/data-hooks';

/** One line in the log: a session studied, a task written down, a task finished. */
type JournalEntry =
  | { kind: 'session'; id: string; at: string; session: Session; course?: Course }
  | { kind: 'task-added'; id: string; at: string; task: Task; course?: Course }
  | { kind: 'task-done'; id: string; at: string; task: Task; course?: Course };

export default function StatsPage() {
  const { notify } = useNotice();
  const router = useRouter();
  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { semester } = useActiveSemester();

  const sessions = useMemo(
    () => rawSessions.filter((s) => isLoggableDuration(s.durationSeconds)),
    [rawSessions],
  );

  const [filter, setFilter] = useState<string>('all');
  const [prefs] = usePreferences();
  const [deletedSession, setDeletedSession] = useState<Session | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) {
      router.replace('/onboarding');
    }
  }, [onboarded, onboardingLoading, onboardingError, router]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || sessionsLoading || tasksLoading;

  /**
   * One dated log instead of two lists. Sessions used to be printed twice,
   * once as "Session history" and once as "Recent activity", so the two are
   * folded into a single journal: a day, then what happened on it. Sessions
   * file under the day they were studied, task events under the day they
   * happened.
   */
  const journal = useMemo(() => {
    const byDay = new Map<string, JournalEntry[]>();
    const file = (day: string, entry: JournalEntry) => {
      const existing = byDay.get(day);
      if (existing) existing.push(entry);
      else byDay.set(day, [entry]);
    };

    for (const session of sessions) {
      file(session.date, {
        kind: 'session',
        id: `session-${session.id}`,
        at: session.createdAt,
        session,
        course: courses.find((course) => course.id === session.courseId),
      });
    }
    for (const task of tasks as Task[]) {
      const course = courses.find((item) => item.id === task.courseId);
      if (task.createdAt) {
        file(task.createdAt.slice(0, 10), {
          kind: 'task-added',
          id: `task-${task.id}`,
          at: task.createdAt,
          task,
          course,
        });
      }
      if (task.completed && task.completedAt) {
        file(task.completedAt.slice(0, 10), {
          kind: 'task-done',
          id: `done-${task.id}`,
          at: task.completedAt,
          task,
          course,
        });
      }
    }

    const days = Array.from(byDay.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, entries]) => ({
        date,
        entries: entries.slice().sort((a, b) => b.at.localeCompare(a.at)),
        seconds: entries.reduce(
          (sum, entry) =>
            entry.kind === 'session'
              ? sum + clampSessionSeconds(entry.session.durationSeconds)
              : sum,
          0,
        ),
      }));

    // Whole days only, so a day is never printed half-told.
    const recent: typeof days = [];
    let printed = 0;
    for (const day of days) {
      if (printed >= 18) break;
      recent.push(day);
      printed += day.entries.length;
    }
    return recent;
  }, [courses, sessions, tasks]);

  async function deleteSession(id: string) {
    const session = rawSessions.find((s) => s.id === id) ?? null;
    try {
      await deleteSessionOptimistic(id);
      if (session) {
        if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
        setDeletedSession(session);
        undoTimerRef.current = window.setTimeout(() => {
          setDeletedSession(null);
          undoTimerRef.current = null;
        }, 7000);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      notify('That session is still here. It did not delete.');
    }
  }

  async function undoDeleteSession() {
    if (!deletedSession) return;
    const session = deletedSession;
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setDeletedSession(null);
    try {
      await addSessionOptimistic({
        courseId: session.courseId,
        taskId: session.taskId,
        date: session.date,
        durationSeconds: session.durationSeconds,
        note: session.note,
      });
    } catch (error) {
      console.error('Failed to restore session:', error);
      notify('That session did not come back.');
    }
  }

  const filteredSessions = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.courseId === filter)),
    [sessions, filter]
  );

  const accent =
    filter === 'all'
      ? 'var(--primary)'
      : courses.find((c) => c.id === filter)?.color || 'var(--ink)';

  const totals = useMemo(() => {
    return courses.map((c) => {
      const cs = sessions.filter((s) => s.courseId === c.id);
      const sec = totalSeconds(cs);
      const weeksObserved = semester?.startDate
        ? Math.max(
            1,
            Math.ceil(
              (Date.now() - new Date(semester.startDate + 'T00:00:00').getTime()) /
                86400000 /
                7
            )
          )
        : 5;
      return {
        course: c,
        totalHours: sec / 3600,
        avg: sec / 3600 / weeksObserved,
      };
    });
  }, [courses, sessions, semester]);

  // The longest-studied course sets the length of the rules beneath the codes,
  // so each rule reads as a share of the term's attention rather than progress
  // towards a number nobody set.
  const heaviestCourseHours = totals.reduce((max, t) => Math.max(max, t.totalHours), 0);

  const totalSec = totalSeconds(sessions);
  const dayCount = new Set(sessions.map((s) => s.date)).size;
  const avgPerDay = dayCount ? totalSec / dayCount : 0;
  const streak = studyStreakDays(sessions);

  // Editorial computed bits, the Vol./Issue mark, totals, and "best day"
  // headline that the redesigned stats page leans on.
  const semesterLabel = useMemo(() => {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = String(now.getFullYear()).slice(-2);
    const seasonName = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
    return `${seasonName} '${year}`;
  }, []);

  const semesterWeekMark = useMemo(() => {
    if (!semester?.startDate || !semester?.endDate) return null;
    const start = new Date(semester.startDate + 'T00:00:00').getTime();
    const end = new Date(semester.endDate + 'T00:00:00').getTime();
    const now = Date.now();
    const totalWeeks = Math.max(1, Math.ceil((end - start) / 86400000 / 7));
    const elapsedDays = Math.max(0, (now - start) / 86400000);
    const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)));
    return { current: currentWeek, total: totalWeeks };
  }, [semester]);

  const totalHrs = totalSec / 3600;
  /**
   * The session log as a spreadsheet. Settings has the same export; this is
   * the copy that belongs beside the numbers it describes, which is where
   * anyone who wants it is already standing.
   */
  function exportCsv() {
    const rows = [
      ['date', 'course', 'duration_minutes', 'note'].join(','),
      ...sessions.map((session) => {
        const course = courses.find((c) => c.id === session.courseId);
        const note = (session.note ?? '').replace(/"/g, '""');
        return [
          session.date,
          course ? `"${course.code}"` : '',
          Math.round(clampSessionSeconds(session.durationSeconds) / 60).toString(),
          `"${note}"`,
        ].join(',');
      }),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akada-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalWhole = Math.floor(totalHrs);
  const totalDecimal = `.${Math.round((totalHrs - totalWhole) * 10)}`;

  // Best day of week, name + duration. Read out in the ledger line.
  const bestDay = useMemo(() => {
    const byDow: Record<number, number> = {};
    for (const s of sessions) {
      const d = new Date(s.date + 'T00:00:00').getDay();
      byDow[d] = (byDow[d] || 0) + clampSessionSeconds(s.durationSeconds);
    }
    let bestDow = -1;
    let bestSec = 0;
    for (const [dow, sec] of Object.entries(byDow)) {
      if (sec > bestSec) {
        bestSec = sec;
        bestDow = Number(dow);
      }
    }
    if (bestDow === -1) return null;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { day: dayNames[bestDow], duration: formatHM(bestSec) };
  }, [sessions]);

  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Compiling your semester" className="mb-6" />
        {/* The shape of the page being set, not a grid of grey boxes. */}
        <div className="opacity-30" aria-hidden>
          <div className="mb-3 h-2 w-24 rounded-full bg-line" />
          <div className="mb-2 h-7 w-[62%] rounded-full bg-line" />
          <div className="mb-8 h-7 w-[40%] rounded-full bg-line" />
          <div
            className="deckle mb-[var(--density-gap)] h-[188px] border border-line bg-paper"
          />
          <div className="deckle h-[148px] border border-line bg-paper" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      {/* The masthead is the one editorial flourish in the app, and it stays.
          What moved is everything that was only there to fill a phone
          column: the week's own numbers now sit beside it rather than under
          it, which is the whole point of having the width. */}
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <p className="eyebrow m-0">{semesterLabel}</p>
            {semesterWeekMark && (
              <Stamp>
                Wk {semesterWeekMark.current} / {semesterWeekMark.total}
              </Stamp>
            )}
          </div>
          <h1 className="m-0 mt-3 font-serif text-[40px] font-medium leading-[0.95] tracking-[-0.035em] md:text-[52px]">
            The <span className="italic">Semester</span>
            <br />
            so far<span className="text-peach">.</span>
          </h1>
        </div>

        <div className="flex shrink-0 items-end gap-6">
          <div>
            <span className="font-mono text-[44px] font-semibold leading-[0.9] tracking-[-0.04em] tabular-nums text-ink md:text-[56px]">
              {totalWhole}
              <span className="text-muted-soft">{totalDecimal}</span>
            </span>
            <p className="m-0 mt-1 text-[12px] text-muted">hours logged</p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="h-10 rounded-[10px] border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            Export CSV
          </button>
        </div>
      </header>

      {/* The term so far, as a line in a ledger under a newspaper rule. */}
      <div
        className="mb-[var(--density-gap)] py-3.5"
        style={{
          borderTop: '1.5px solid var(--ink)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <p className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 font-serif text-[13px] italic text-muted">
          <span>
            <Figure>{streak}</Figure> day{streak === 1 ? '' : 's'} running
          </span>
          {avgPerDay > 0 && (
            <span>
              <Figure>{formatHM(avgPerDay)}</Figure> a day
            </span>
          )}
          {bestDay && (
            <span>
              best on <Figure>{bestDay.day}</Figure>, {bestDay.duration}
            </span>
          )}
        </p>
      </div>

      {sessions.length === 0 && (
        <EmptyState text="Your history will map itself here..." />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
      {/* Heatmap */}
      <section className="deckle mb-[var(--density-gap)] border border-line bg-paper py-5 px-[var(--density-gutter)]">
        <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-serif font-medium text-[20px]">Every day so far</h2>
          <div className="flex gap-1 overflow-x-auto app-scroll">
            <FilterChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="All"
            />
            {courses.map((c) => (
              <FilterChip
                key={c.id}
                active={filter === c.id}
                onClick={() => setFilter(c.id)}
                label={c.code}
                color={c.color}
                tint={c.tint}
              />
            ))}
          </div>
        </div>
        <div className="overflow-x-auto app-scroll">
          <Heatmap
            sessions={filteredSessions}
            accent={accent}
            weeks={13}
            hideWeekends={prefs.hideWeekends}
          />
        </div>
      </section>

      {/* Weekly bars, deckle card */}
      <section className="deckle mb-[var(--density-gap)] border border-line bg-paper py-5 px-[var(--density-gutter)]">
        <h2 className="m-0 mb-[18px] font-serif font-medium text-[20px]">This week</h2>
        <WeeklyChart sessions={sessions} courses={courses} />
      </section>

        </div>

        {/* The aside: what the week came to, per course, and the marks it
            earned. On a phone it simply follows the charts. */}
        <aside className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:sticky lg:top-10">
      {/* Totals, deckle card with hand-drawn trend arrows */}
      <section className="deckle border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-2">
        <h2 className="m-0 mb-1.5 font-serif font-medium text-[20px]">Hours by course</h2>
        <div>
          {totals.length === 0 && (
            <p className="mt-0 mb-3 text-[13px] text-muted font-serif italic">
              Nothing to weigh up yet...
            </p>
          )}
          {totals.map(({ course, totalHours, avg }) => {
            // Quick trend: compare last 7 days vs the 7 before that
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const eightDaysAgo = new Date(today);
            eightDaysAgo.setDate(today.getDate() - 7);
            const fifteenDaysAgo = new Date(today);
            fifteenDaysAgo.setDate(today.getDate() - 14);
            let recentSec = 0;
            let priorSec = 0;
            for (const s of sessions) {
              if (s.courseId !== course.id) continue;
              const d = new Date(s.date + 'T00:00:00');
              if (d >= eightDaysAgo) recentSec += clampSessionSeconds(s.durationSeconds);
              else if (d >= fifteenDaysAgo) priorSec += clampSessionSeconds(s.durationSeconds);
            }
            const trend: 'up' | 'flat' | 'down' =
              recentSec > priorSec * 1.1
                ? 'up'
                : recentSec < priorSec * 0.9
                  ? 'down'
                  : 'flat';
            const trendChar = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→';
            const trendColor =
              trend === 'up'
                ? 'var(--sage)'
                : trend === 'down'
                  ? 'var(--rose)'
                  : 'var(--muted-soft)';
            return (
              <div
                key={course.id}
                className="flex items-center justify-between py-3.5 border-b border-dashed border-line last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: course.color }}
                  />
                  <div className="min-w-0">
                    <p
                      className="eyebrow m-0"
                      style={{ color: course.color }}
                    >
                      {course.code}
                    </p>
                    <p className="mt-0.5 mb-0 font-serif font-medium text-[15px]">
                      {course.name}
                    </p>
                    {totalHours > 0 && heaviestCourseHours > 0 && (
                      <span
                        aria-hidden
                        className="mt-2 block h-[2px] rounded-full"
                        style={{
                          width: `${Math.max(
                            8,
                            (totalHours / heaviestCourseHours) * 140,
                          )}px`,
                          background: course.color,
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 pl-3">
                  {totalHours > 0 ? (
                    <>
                      <p className="m-0 font-mono font-semibold text-[18px] tabular-nums leading-none tracking-[-0.02em]">
                        {totalHours.toFixed(1)}
                        <span className="text-muted font-sans font-normal text-[11px] ml-[3px]">
                          h
                        </span>
                      </p>
                      <p className="mt-1 mb-0 text-[10.5px] text-muted italic font-serif">
                        {avg.toFixed(1)} h/wk
                        <span className="ml-1.5" style={{ color: trendColor }}>
                          {trendChar}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="m-0 text-[12px] text-muted-soft italic font-serif">
                      No sessions yet
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <GradeWeighting courses={courses} tasks={tasks} today={isoDate()} />

      {/* Progression lives on the Record tab. A second, differently worded
          copy here was two readings of the same sessions with two chances to
          disagree about what had happened. */}
      {sessions.length > 0 && (
        <Link
          href="/stamps"
          className="mt-[var(--density-gap)] block rounded-[14px] border border-dashed border-line-strong px-5 py-4 no-underline transition-colors hover:bg-paper-2"
        >
          <p className="eyebrow m-0">The record</p>
          <p className="m-0 mt-1.5 font-serif text-[15px] italic text-ink-soft">
            The run in weeks, your course pages and the impressions &rarr;
          </p>
        </Link>
      )}

        </aside>
      </div>

      {/* The log. One dated journal, sessions and task marks under the day
          they belong to, rather than two lists that printed the same thing. */}
      <section className="deckle mt-[var(--density-gap)] border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-2">
        <h2 className="m-0 mb-4 font-serif font-medium text-[20px]">The log</h2>
        {journal.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-line px-4 py-9 text-center">
            <p className="m-0 font-serif text-[14px] italic text-muted-soft">
              The first session you log opens this page.
            </p>
          </div>
        ) : (
          journal.map((day) => (
            <div key={day.date} className="pt-[18px] first:pt-0">
              <div className="flex items-baseline gap-3">
                <h3 className="eyebrow m-0 shrink-0">{formatRelativeDate(day.date)}</h3>
                <span aria-hidden className="h-px flex-1 bg-line" />
                {day.seconds > 0 && (
                  <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-soft">
                    {formatHM(day.seconds)}
                  </span>
                )}
              </div>
              <div className="mt-0.5">
                {day.entries.map((entry) =>
                  entry.kind === 'session' ? (
                    <SessionEntry
                      key={entry.id}
                      session={entry.session}
                      course={entry.course}
                      onDelete={deleteSession}
                    />
                  ) : (
                    <TaskEntry key={entry.id} entry={entry} />
                  ),
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Editorial footer, closes the issue */}
      {semester?.endDate && (
        <p
          className="mt-8 text-center text-[12px] text-muted-soft font-serif italic pt-4"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          End of issue ·{' '}
          {(() => {
            const end = new Date(semester.endDate + 'T00:00:00').getTime();
            const days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
            return `${days} day${days === 1 ? '' : 's'} remain${days === 1 ? 's' : ''} in the term`;
          })()}
          .
        </p>
      )}

      {deletedSession && (
        <div
          className="fixed inset-x-0 z-50 px-[var(--density-gutter)] md:px-8 animate-fade-in"
          style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-2xl md:max-w-3xl">
            <div className="flex items-center gap-3 rounded-[10px] border border-line bg-paper/95 px-3.5 py-3 backdrop-blur">
              <p className="m-0 flex-1 text-[13px] text-ink-soft">
                Session deleted.
              </p>
              <button
                type="button"
                onClick={undoDeleteSession}
                className="font-serif text-[13px] italic text-ink"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

/** A number inside a sentence: mono, upright, the app's ink. */
function Figure({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[15px] font-semibold not-italic text-ink tabular-nums">
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mb-[var(--density-gap)] py-12 text-center">
      <p className="m-0 font-serif text-[16px] italic text-muted-soft">{text}</p>
    </div>
  );
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  tint?: string;
}

function FilterChip({ active, onClick, label, color, tint }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 bg-transparent px-0.5 py-1 font-serif text-[14px] transition-colors ${
        active ? 'hl-swipe text-ink' : 'text-muted-soft hover:text-ink-soft'
      }`}
      style={
        active
          ? ({ '--hl': tint || 'var(--highlight-yellow)' } as React.CSSProperties)
          : undefined
      }
    >
      {label}
    </button>
  );
}

/**
 * The 12px margin every log row is written against, so the tally strokes,
 * the ticks and the open rings all fall on the same vertical rule.
 */
function EntryMargin({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="flex w-3 shrink-0 justify-center pt-[3px]">
      {children}
    </span>
  );
}

function SessionEntry({
  session,
  course,
  onDelete,
}: {
  session: Session;
  course?: Course;
  onDelete: (id: string) => void;
}) {
  return (
    <SwipeRow
      className="border-b border-dashed border-line last:border-0"
      onDelete={() => onDelete(session.id)}
      surfaceClassName="flex items-start gap-3 bg-paper py-3"
    >
      <>
        <EntryMargin>
          {/* A tally stroke, the way time spent gets marked in a ledger. */}
          <span
            className="mt-[1px] block h-[11px] w-[2px] rounded-[1px]"
            style={{
              background: course?.color || 'var(--muted-soft)',
              transform: 'rotate(9deg)',
            }}
          />
        </EntryMargin>
        <div className="min-w-0 flex-1">
          <p className="eyebrow m-0" style={course ? { color: course.color } : undefined}>
            {course?.code || 'Session'}
          </p>
          <p className="mt-0.5 mb-0 font-serif text-[15px] font-medium text-ink">
            {course?.name || 'Study session'}
          </p>
          {session.note && (
            <p className="mt-1 mb-0 text-[12px] leading-[1.45] text-ink-soft">
              {session.note}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-[13px] font-semibold text-ink tabular-nums">
            {formatHM(clampSessionSeconds(session.durationSeconds))}
          </span>
          <button
            type="button"
            onClick={() => onDelete(session.id)}
            aria-label="Delete session"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-soft opacity-70 transition-opacity hover:text-priority"
          >
            <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </>
    </SwipeRow>
  );
}

function TaskEntry({
  entry,
}: {
  entry: Extract<JournalEntry, { kind: 'task-added' | 'task-done' }>;
}) {
  const finished = entry.kind === 'task-done';
  const color = entry.course?.color;
  return (
    <div className="flex items-start gap-3 border-b border-dashed border-line py-3 last:border-0">
      <EntryMargin>
        {finished ? (
          <HandCheck size={13} color={color || 'var(--muted)'} strokeWidth={1.5} />
        ) : (
          <span
            className="mt-[3px] block h-[6px] w-[6px] rounded-full border"
            style={{ borderColor: color || 'var(--muted-soft)' }}
          />
        )}
      </EntryMargin>
      <div className="min-w-0 flex-1">
        <p className="eyebrow m-0" style={color ? { color } : undefined}>
          {entry.course?.code || 'Task'}
        </p>
        <p className="mt-0.5 mb-0 font-serif text-[15px] font-medium text-ink">
          {entry.task.title}
        </p>
      </div>
      <span className="shrink-0 pt-[3px] font-serif text-[11.5px] italic text-muted-soft">
        {finished ? 'finished' : 'written down'}
      </span>
    </div>
  );
}

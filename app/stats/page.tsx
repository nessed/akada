'use client';

import { useProgression } from '@/lib/progression/use-progression';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { useNotice } from '@/components/Notice';
import SwipeRow from '@/components/SwipeRow';
import LoadingIndicator from '@/components/LoadingIndicator';
import Heatmap from '@/components/Heatmap';
import GradeWeighting from '@/components/term/GradeWeighting';
import type { Course, Session, Task } from '@/lib/data';
import {
  formatHM,
  formatRelativeDate,
  isoDate,
  resolveTint,
  totalSeconds,
} from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';
import { clampSessionSeconds, isLoggableDuration, scoreFace } from '@/lib/session-safety';
import { readHabits } from '@/lib/progression';
import {
  hoursLookLike,
  paceChoices,
  readMilestone,
  readPace,
  readPersona,
  readRecords,
  type PaceAgainst,
} from '@/lib/stats-reading';
import {
  daysIn,
  readLengths,
  readRhythm,
  readSpan,
  readStandings,
  readTaskFlow,
  readTermWeeks,
  spanWindows,
  termStartOf,
  type Span,
} from '@/lib/stats-lens';
import SpanFigures from '@/components/stats/SpanFigures';
import CourseBalance from '@/components/stats/CourseBalance';
import TermWeeks from '@/components/stats/TermWeeks';
import WeekRhythm from '@/components/stats/WeekRhythm';
import SittingLengths from '@/components/stats/SittingLengths';
import TaskFlow from '@/components/stats/TaskFlow';
import PaceRace from '@/components/stats/PaceRace';
import PersonalBests from '@/components/stats/PersonalBests';
import NextMilestone from '@/components/stats/NextMilestone';
import StudyClock from '@/components/stats/StudyClock';
import { useCountUp } from '@/components/stats/useCountUp';
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

/** One line in the log: a session studied, a task added, a task finished. */
type JournalEntry =
  | { kind: 'session'; id: string; at: string; session: Session; course?: Course }
  | { kind: 'task-added'; id: string; at: string; task: Task; course?: Course }
  | { kind: 'task-done'; id: string; at: string; task: Task; course?: Course }
  | { kind: 'tasks-added'; id: string; at: string; count: number };

const SPANS: { key: Span; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: '4 weeks' },
  { key: 'term', label: 'Term' },
];

/** More tasks added on one day than this read as one line, not a list. */
const ADDED_ROWS_MAX = 3;

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

  // The lens: one course or all of them, read through the whole page under
  // the masthead, and the stretch of time the side-by-side block compares.
  const [filter, setFilter] = useState<string>('all');
  const [span, setSpan] = useState<Span>('week');
  const [against, setAgainst] = useState<PaceAgainst>('last');
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

  const lensSessions = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => s.courseId === filter)),
    [sessions, filter],
  );
  const lensTasks = useMemo(
    () => (filter === 'all' ? (tasks as Task[]) : (tasks as Task[]).filter((t) => t.courseId === filter)),
    [tasks, filter],
  );
  const lensCourses = useMemo(
    () => (filter === 'all' ? courses : courses.filter((c) => c.id === filter)),
    [courses, filter],
  );

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

    for (const session of lensSessions) {
      file(session.date, {
        kind: 'session',
        id: `session-${session.id}`,
        at: session.createdAt,
        session,
        course: courses.find((course) => course.id === session.courseId),
      });
    }
    for (const task of lensTasks) {
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
        entries: foldAdded(date, entries).sort((a, b) => b.at.localeCompare(a.at)),
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
  }, [courses, lensSessions, lensTasks]);

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
      // The whole sitting, not most of it. This used to send five fields and
      // drop the two that describe how the sitting actually went, so an
      // undone delete quietly returned a session with no rest and no shape —
      // and those are exactly the two the connector reads for its focus
      // pattern. The row is written the same way PendingSessionLogSheet
      // writes a new one.
      await addSessionOptimistic({
        courseId: session.courseId,
        taskId: session.taskId,
        date: session.date,
        durationSeconds: session.durationSeconds,
        note: session.note,
        breakSeconds: session.breakSeconds,
        segments: session.segments,
        score: session.score,
        scoreOutOf: session.scoreOutOf,
        recovery: session.recovery,
      });
    } catch (error) {
      console.error('Failed to restore session:', error);
      notify('That session did not come back.');
    }
  }

  const accent =
    filter === 'all'
      ? 'var(--primary)'
      : courses.find((c) => c.id === filter)?.color || 'var(--ink)';

  const totalSec = totalSeconds(sessions);
  const dayCount = new Set(sessions.map((s) => s.date)).size;
  const avgPerDay = dayCount ? totalSec / dayCount : 0;
  // One run in the whole app, counted in weeks. This line used to count
  // days while Today, the Record and the guide all said a day off costs
  // nothing, which is two streaks disagreeing on the same screen pair.
  const { progression } = useProgression();
  const run = progression?.runs.current ?? 0;

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

  /* The things to chase. A page of totals says what happened; these say
     what the next sitting would change. The CSV export that used to sit in
     the masthead lives in Settings, where a spreadsheet is looked for. */
  const today = isoDate();
  const lensSec = totalSeconds(lensSessions);
  const records = useMemo(() => readRecords(lensSessions, today), [lensSessions, today]);
  const choices = useMemo(() => paceChoices(lensSessions, today), [lensSessions, today]);
  const racing = choices[against] ? against : 'last';
  const pace = useMemo(() => readPace(lensSessions, today, racing), [lensSessions, today, racing]);
  const milestone = readMilestone(lensSec);
  const habits = useMemo(
    () => readHabits(courses, lensSessions, lensTasks),
    [courses, lensSessions, lensTasks],
  );
  const persona = readPersona(habits);
  const lookLike = hoursLookLike(totalSec, today);

  /* The side-by-side block: a stretch of the term set beside the one before,
     from every side the log can be read from. */
  const termStart = useMemo(
    () => termStartOf(sessions, semester?.startDate),
    [sessions, semester?.startDate],
  );
  const windows = useMemo(() => spanWindows(span, today, termStart), [span, today, termStart]);
  const spanNow = useMemo(
    () => readSpan(lensSessions, lensTasks, windows.now),
    [lensSessions, lensTasks, windows],
  );
  const spanBefore = useMemo(
    () => (windows.before ? readSpan(lensSessions, lensTasks, windows.before) : null),
    [lensSessions, lensTasks, windows],
  );
  const standings = useMemo(
    () => readStandings(lensCourses, sessions, windows, today, termStart),
    [lensCourses, sessions, windows, today, termStart],
  );
  const rhythm = useMemo(() => readRhythm(lensSessions, windows.now), [lensSessions, windows]);
  const lengths = useMemo(() => readLengths(lensSessions, windows.now), [lensSessions, windows]);
  const termWeeks = useMemo(
    () => readTermWeeks(lensSessions, lensTasks, termStart, semester?.endDate ?? null, today),
    [lensSessions, lensTasks, termStart, semester?.endDate, today],
  );
  const flow = useMemo(
    () => readTaskFlow(lensTasks, lensSessions, today),
    [lensTasks, lensSessions, today],
  );
  const goalSeconds = lensCourses.reduce((a, c) => a + Math.max(0, c.weeklyGoalHours || 0), 0) * 3600;
  const lensName = filter === 'all' ? null : courses.find((c) => c.id === filter)?.code ?? null;

  // The masthead figure rolls up to the term's hours rather than being
  // printed there. Held at a tenth, the way it is written.
  const rolling = useCountUp(loading ? 0 : totalSec / 3600, 1400, 150);
  const totalWhole = Math.floor(rolling);
  const totalDecimal = `.${Math.min(9, Math.floor((rolling - totalWhole) * 10))}`;

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

        <div className="shrink-0 md:text-right">
          <span className="font-mono text-[44px] font-semibold leading-[0.9] tracking-[-0.04em] tabular-nums text-ink md:text-[56px]">
            {totalWhole}
            <span className="text-muted-soft">{totalDecimal}</span>
          </span>
          <p className="m-0 mt-1 text-[12px] text-muted">hours logged</p>
          {lookLike && (
            <HandNote
              className="animate-settle mt-1.5"
              style={{ animationDelay: '1.4s' }}
              size={18}
              rotate={-2.5}
            >
              {lookLike}
            </HandNote>
          )}
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
            <Figure>{run}</Figure> {run === 1 ? 'week' : 'weeks'} running
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

      {/* The lens. One course, or all of them, read through everything
          under it: the race, the records, the side by side, the weeks, the
          heatmap and the log. It used to sit on the heatmap alone, so the
          rest of the page could only ever be read for the whole term. */}
      {courses.length > 1 && (
        <div className="mb-[var(--density-gap)] flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <span className="font-serif text-[13.5px] italic text-muted">Reading</span>
          <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Every course" />
            {courses.map((c) => (
              <FilterChip
                key={c.id}
                active={filter === c.id}
                onClick={() => setFilter(c.id)}
                label={c.code}
                color={c.color}
                tint={resolveTint(c.color, c.tint)}
              />
            ))}
          </div>
        </div>
      )}

      {/* The chase: another week, the next round number, and the hours of
          the day it all lands in. Dealt onto the desk one after another. */}
      <div className="mb-[var(--density-gap)] grid gap-[var(--density-gap)] md:grid-cols-2 xl:grid-cols-3">
        <ChaseCard title={`You vs ${pace.name}`} delay={0}>
          <PaceRace
            pace={pace}
            accent={filter === 'all' ? undefined : accent}
            choices={choices}
            onAgainst={setAgainst}
          />
        </ChaseCard>
        <ChaseCard title={lensName ? `Next milestone · ${lensName}` : 'Next milestone'} delay={120}>
          <NextMilestone milestone={milestone} totalSeconds={lensSec} />
        </ChaseCard>
        <ChaseCard title="Your day, as a clock" delay={240} className="md:col-span-2 xl:col-span-1">
          <StudyClock habits={habits} persona={persona} />
        </ChaseCard>
      </div>

      {/* Side by side. A stretch of the term, from every side the log can
          be read from, each figure set beside the same one for the stretch
          before. The race above is one line of this; this is the rest. */}
      {sessions.length > 0 && (
        <section className="mb-[var(--density-gap)]" aria-labelledby="side-by-side">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
            <div>
              <h2 id="side-by-side" className="m-0 font-serif text-[20px] font-medium">
                Side by side
              </h2>
              <p className="m-0 mt-1 font-serif text-[13px] italic text-muted">
                {windows.againstName
                  ? `${windows.name}${lensName ? ` on ${lensName}` : ''}, against ${windows.againstName}`
                  : `${windows.name} so far${lensName ? ` on ${lensName}` : ''}, week ${Math.max(1, Math.ceil(daysIn(windows.now) / 7))}`}
              </p>
            </div>
            <div className="flex gap-x-2" role="group" aria-label="Stretch of time">
              {SPANS.map((option) => (
                <FilterChip
                  key={option.key}
                  active={span === option.key}
                  onClick={() => setSpan(option.key)}
                  label={option.label}
                />
              ))}
            </div>
          </div>

          <div key={`${span}-${filter}`} className="grid gap-[var(--density-gap)] md:grid-cols-2">
            <div className="deckle border border-line bg-paper px-[var(--density-gutter)] py-5 md:col-span-2">
              <SpanFigures
                now={spanNow}
                before={spanBefore}
                againstName={windows.againstName}
                courseCount={lensCourses.length}
              />
            </div>

            <div className="deckle min-w-0 border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-2 md:col-span-2">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="m-0 font-serif text-[17px] font-medium">Course against course</h3>
                <span className="font-serif text-[12px] italic text-muted">
                  hours, against what each goal asks over {windows.name}
                </span>
              </div>
              <CourseBalance
                standings={standings}
                spanWeeks={daysIn(windows.now) / 7}
                againstName={windows.againstName}
              />
            </div>

            <div className="deckle min-w-0 border border-line bg-paper px-[var(--density-gutter)] py-5">
              <h3 className="eyebrow m-0 mb-3">When in the week</h3>
              <WeekRhythm rhythm={rhythm} accent={accent} />
            </div>

            <div className="deckle min-w-0 border border-line bg-paper px-[var(--density-gutter)] py-5">
              <h3 className="eyebrow m-0 mb-3">How long you sit</h3>
              <SittingLengths lengths={lengths} accent={accent} />
            </div>
          </div>
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="settle-in min-w-0">
      {/* The term, a week at a time. It replaced a chart of the last seven
          days that said less than Today's own week does. */}
      {sessions.length > 0 && (
      <section className="deckle mb-[var(--density-gap)] border border-line bg-paper py-5 px-[var(--density-gutter)]">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-serif font-medium text-[20px]">Week by week</h2>
          <span className="font-serif text-[12px] italic text-muted">tap a week to open it</span>
        </div>
        <TermWeeks key={filter} weeks={termWeeks} courses={lensCourses} goalSeconds={goalSeconds} />
      </section>
      )}

      {/* Heatmap */}
      <section className="deckle mb-[var(--density-gap)] border border-line bg-paper py-5 px-[var(--density-gutter)]">
        <h2 className="m-0 mb-[14px] font-serif font-medium text-[20px]">Every day so far</h2>
        <Heatmap
          sessions={lensSessions}
          accent={accent}
          weeks={Math.min(26, Math.max(13, termWeeks.filter((w) => !w.future).length))}
          hideWeekends={prefs.hideWeekends}
        />
      </section>

        </div>

        {/* The aside: the marks to beat, the list in and out, and the grade.
            On a phone it simply follows the charts. */}
        <aside className="settle-in grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="deckle border border-line bg-paper px-[var(--density-gutter)] pt-5 pb-2">
        <h2 className="m-0 mb-1 font-serif font-medium text-[20px]">Records to beat</h2>
        <PersonalBests records={records} />
      </section>

      <section className="deckle border border-line bg-paper px-[var(--density-gutter)] py-5">
        <h2 className="m-0 mb-1.5 font-serif font-medium text-[20px]">The list, in and out</h2>
        <TaskFlow flow={flow} accent={accent} />
      </section>

      <GradeWeighting courses={lensCourses} tasks={lensTasks} today={isoDate()} />

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
            The run in weeks, the term week by week, your course pages and the impressions &rarr;
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
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-soft">
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
                  ) : entry.kind === 'tasks-added' ? (
                    <AddedLine key={entry.id} count={entry.count} />
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

/** A card in the chase row, dealt onto the page a beat after the one before. */
function ChaseCard({
  title,
  delay,
  className = '',
  children,
}: {
  title: string;
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`deal-in deckle min-w-0 border border-line bg-paper px-[var(--density-gutter)] py-5 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="eyebrow m-0 mb-3">{title}</h2>
      {children}
    </section>
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
          {/* A practice paper's score, when the sitting had one: quieter
              than the hours, since the hours are what this list is. */}
          {session.score != null && session.scoreOutOf != null && (
            <span
              className="mr-1 font-mono text-[12px] text-muted tabular-nums"
              aria-label={`scored ${session.score} out of ${session.scoreOutOf}`}
            >
              {scoreFace(session.score, session.scoreOutOf)}
            </span>
          )}
          <span className="font-mono text-[13px] font-semibold text-ink tabular-nums">
            {formatHM(clampSessionSeconds(session.durationSeconds))}
          </span>
          <button
            type="button"
            onClick={() => onDelete(session.id)}
            aria-label="Delete session"
            className="flex h-7 w-7 touch:h-10 touch:w-10 items-center justify-center rounded-full text-muted-soft opacity-70 transition-opacity hover:text-priority"
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

/**
 * A day's added tasks, folded into one line past a few. An outline read in
 * by Claude adds forty in a minute, and a log of forty "added" rows buries
 * the day's actual study under it.
 */
function foldAdded(date: string, entries: JournalEntry[]): JournalEntry[] {
  const added = entries.filter((entry) => entry.kind === 'task-added');
  if (added.length <= ADDED_ROWS_MAX) return entries.slice();
  const latest = added.reduce((max, entry) => (entry.at > max ? entry.at : max), added[0].at);
  return [
    ...entries.filter((entry) => entry.kind !== 'task-added'),
    { kind: 'tasks-added', id: `added-${date}`, at: latest, count: added.length },
  ];
}

function AddedLine({ count }: { count: number }) {
  return (
    <div className="flex items-start gap-3 border-b border-dashed border-line py-3 last:border-0">
      <EntryMargin>
        <span className="mt-[3px] block h-[6px] w-[6px] rounded-full border border-muted-soft" />
      </EntryMargin>
      <p className="m-0 min-w-0 flex-1 font-serif text-[15px] text-ink-soft">
        <span className="font-mono text-[13px] text-ink">{count}</span> tasks added
      </p>
    </div>
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
        {finished ? (entry.task.completedVia === 'skip' ? 'skipped' : 'finished') : 'added'}
      </span>
    </div>
  );
}

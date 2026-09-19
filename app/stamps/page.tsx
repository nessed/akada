'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import { useCourses, useSessions, useTasks } from '@/lib/data-hooks';
import { readChallenge, readStamps, readStreak, STREAK_MINUTES, type Stamp } from '@/lib/stamps';
import { sortCourses } from '@/lib/data/course-order';
import { isoDate, resolveTint } from '@/lib/utils';

/**
 * Stamps.
 *
 * The gamified tab: the streak, the week's challenge, and the collection as
 * postmarks rather than badges. Everything on it is derived from sessions on
 * read, so there is no separate record of achievement to fall out of step
 * with what the rest of the app says happened.
 */
export default function StampsPage() {
  const router = useRouter();
  const { courses: rawCourses, isLoading: coursesLoading } = useCourses();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);

  const courses = useMemo(() => sortCourses(rawCourses), [rawCourses]);
  const today = isoDate();

  const streak = useMemo(() => readStreak(sessions, today), [sessions, today]);
  const challenge = useMemo(
    () => readChallenge(courses, sessions, today),
    [courses, sessions, today],
  );
  const stamps = useMemo(
    () => readStamps(courses, sessions, tasks, today),
    [courses, sessions, tasks, today],
  );

  const earned = stamps.filter((s) => s.earned);
  const unearned = stamps.filter((s) => !s.earned);
  // "In reach" is the honest version of a nag: the ones whose progress reads
  // as a fraction already more than half done.
  const inReach = unearned.filter((s) => {
    const m = s.progress?.match(/^([\d.]+)\s*\/\s*([\d.]+)/);
    if (!m) return false;
    return Number(m[1]) / Number(m[2]) >= 0.5;
  }).length;

  if (coursesLoading || sessionsLoading || tasksLoading) {
    return (
      <PageShell wide>
        <LoadingIndicator label="Reading your term" />
      </PageShell>
    );
  }

  const sinceLabel = streak.since
    ? new Date(streak.since + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <PageShell wide>
      <header className="mb-8">
        <p className="m-0 mb-1.5 font-mono text-[12px] tracking-[0.02em] text-muted">
          {earned.length} of {stamps.length} earned
          {inReach > 0 && ` · ${inReach} in reach this week`}
        </p>
        <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
          Stamps
        </h1>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Streak */}
        <section className="rounded-[14px] border border-line bg-paper p-6">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow m-0">Streak</p>
            <span className="font-mono text-[11px] text-muted">
              best <span className="text-ink">{streak.best}</span>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-[36px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
              {streak.days}
            </span>
            <span className="text-[13px] text-ink-soft">
              {streak.days === 1 ? 'day' : 'days'}
              {sinceLabel && ` · since ${sinceLabel}`}
            </span>
            {streak.days > 0 && (
              <HandNote className="ml-auto">today counts already</HandNote>
            )}
          </div>

          {/* Three weeks, one square a day. The day being lived is ringed
              rather than filled, because it is not over yet. */}
          <div className="mt-5 grid grid-cols-[repeat(21,minmax(0,1fr))] gap-1.5">
            {streak.recent.map((day) => (
              <span
                key={day.iso}
                title={day.iso}
                className="block h-6 rounded-[4px] md:h-7"
                style={{
                  background: day.qualified ? 'var(--ink)' : 'var(--bg-tint)',
                  boxShadow: day.isToday
                    ? '0 0 0 2px var(--paper), 0 0 0 3.5px var(--ink)'
                    : undefined,
                }}
              />
            ))}
          </div>

          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-soft">
            <span>{labelFor(streak.recent[0]?.iso)}</span>
            <span>{labelFor(streak.recent[7]?.iso)}</span>
            <span>{labelFor(streak.recent[14]?.iso)}</span>
            <span className="text-ink">{labelFor(streak.recent[20]?.iso)}</span>
          </div>

          <p className="m-0 mt-4 text-[12px] leading-[1.5] text-muted">
            A day counts after {STREAK_MINUTES} minutes logged.
          </p>
        </section>

        {/* This week's challenge */}
        <section className="rounded-[14px] border border-line bg-paper p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow m-0">This week&rsquo;s challenge</p>
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {challenge.daysLeft} {challenge.daysLeft === 1 ? 'day' : 'days'} left
            </span>
          </div>

          <h2 className="m-0 mt-2.5 font-serif text-[22px] font-medium tracking-[-0.01em]">
            {challenge.name}
          </h2>
          <p className="m-0 mt-1.5 text-[13px] text-ink-soft">{challenge.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {challenge.done.map((course) => (
              <span
                key={course.id}
                className="flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-medium text-ink"
                style={{ background: resolveTint(course.color, course.tint) }}
              >
                <HandCheck size={12} />
                {course.code}
              </span>
            ))}
            {challenge.remaining.map((course) => (
              <span
                key={course.id}
                className="flex h-9 items-center rounded-[8px] border border-dashed border-line-strong px-3 text-[12px] text-muted"
              >
                {course.code}
              </span>
            ))}
          </div>

          {challenge.remaining.length > 0 ? (
            <button
              type="button"
              onClick={(e) =>
                setStartTarget({
                  task: null,
                  course: challenge.remaining[0],
                  anchor: e.currentTarget,
                })
              }
              className="mt-5 flex h-11 w-full items-center justify-center gap-2.5 rounded-[10px] border border-line-strong text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
            >
              <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5l12 7-12 7V5z" />
              </svg>
              Start on {challenge.remaining[0].code}
            </button>
          ) : courses.length > 0 ? (
            <p className="m-0 mt-5 font-serif text-[15px] italic text-ink-soft">
              All four corners. Done for the week.
            </p>
          ) : null}
        </section>
      </div>

      {/* Collection */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between px-1 pb-3">
          <p className="eyebrow m-0">Collection</p>
          <span className="font-mono text-[11px] text-muted">
            {earned.length} / {stamps.length}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[...earned, ...unearned].map((stamp) => (
            <StampCard key={stamp.id} stamp={stamp} />
          ))}
        </div>
      </section>

      <StartTimerPopover
        target={startTarget}
        onClose={() => setStartTarget(null)}
        onStarted={() => router.push('/timer')}
      />
    </PageShell>
  );
}

function labelFor(iso?: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * One stamp. Earned it is inked and dated the way a postmark is; unearned it
 * is the same ring in dashes with the distance left inside it, so the page
 * reads as a sheet with gaps rather than a wall of locked icons.
 */
function StampCard({ stamp }: { stamp: Stamp }) {
  return (
    <div
      className={`flex flex-col items-center rounded-[14px] px-3 py-5 text-center ${
        stamp.earned ? 'border border-line bg-paper' : 'border border-dashed border-line'
      }`}
    >
      <span
        className={`grid h-[68px] w-[68px] place-items-center rounded-full px-1 text-center font-serif italic ${
          // "33 / 100h" wrapped to two lines inside the ring at the full size.
          (stamp.earned ? stamp.mark : (stamp.progress ?? stamp.mark)).length > 6
            ? 'text-[12px] leading-[1.2]'
            : 'text-[17px]'
        }`}
        style={
          stamp.earned
            ? { border: '1.6px solid var(--ink)', color: 'var(--ink)' }
            : { border: '1.4px dashed var(--line-strong)', color: 'var(--muted-soft)' }
        }
      >
        {stamp.earned ? stamp.mark : (stamp.progress ?? stamp.mark)}
      </span>

      <p
        className={`m-0 mt-3 text-[13px] font-medium ${
          stamp.earned ? 'text-ink' : 'text-muted'
        }`}
      >
        {stamp.name}
      </p>
      <p className="eyebrow m-0 mt-1 leading-[1.4]">
        {stamp.earned ? stamp.detail : stamp.goal}
      </p>
    </div>
  );
}

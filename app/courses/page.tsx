'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import HourStrokes from '@/components/HourStrokes';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import { useCourses, useSessions, useTasks } from '@/lib/data-hooks';
import { sortCourses } from '@/lib/data/course-order';
import { isLoggableDuration } from '@/lib/session-safety';
import type { Course } from '@/lib/data';
import { formatHM, isoDate, resolveTint, startOfWeek, totalSeconds } from '@/lib/utils';

/**
 * The courses index.
 *
 * The rail names every course, so this is what "Courses" in it opens: the
 * term as a shelf. Each course is a book standing face out, its spine in the
 * course colour and the week's hours as strokes on the cover, with the plank
 * under each row carrying the label a library would put there: what is open
 * and when it was last sat. Adding and editing a course still happens on
 * Today, where the cards are.
 */
export default function CoursesPage() {
  const router = useRouter();
  const { courses: raw, isLoading: coursesLoading } = useCourses();
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);
  const columns = useShelfColumns();

  const today = isoDate();
  const weekStart = isoDate(startOfWeek());

  const rows = useMemo(() => {
    const ordered = sortCourses(raw);
    return ordered.map((course) => {
      const mine = sessions.filter(
        (s) => s.courseId === course.id && isLoggableDuration(s.durationSeconds),
      );
      const open = tasks.filter((t) => t.courseId === course.id && !t.completed);
      const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
      const last = mine.reduce<string | null>(
        (acc, s) => (acc == null || s.date > acc ? s.date : acc),
        null,
      );
      return {
        course,
        weekSeconds: totalSeconds(mine.filter((s) => s.date >= weekStart)),
        termSeconds: totalSeconds(mine),
        openCount: open.length,
        overdue,
        last,
      };
    });
  }, [raw, sessions, tasks, today, weekStart]);

  if (coursesLoading || sessionsLoading || tasksLoading) {
    return (
      <PageShell wide>
        <LoadingIndicator label="Reading your courses" />
      </PageShell>
    );
  }

  // The dashed book at the end is where the next course goes, so the last
  // shelf always has somewhere for the eye to land rather than a gap.
  const items: ShelfItem[] = [...rows, 'add'];
  const shelves: ShelfItem[][] = [];
  for (let i = 0; i < items.length; i += columns) shelves.push(items.slice(i, i + columns));

  const termTotal = rows.reduce((a, r) => a + r.termSeconds, 0);
  const weekTotal = rows.reduce((a, r) => a + r.weekSeconds, 0);
  const weekGoal = rows.reduce((a, r) => a + (r.course.weeklyGoalHours || 0), 0);

  return (
    <PageShell wide>
      <header className="mb-9">
          <p className="m-0 mb-1.5 font-serif italic text-[13.5px] text-muted">
            {rows.length} {rows.length === 1 ? 'course' : 'courses'} · {formatHM(termTotal)} this
            term · {formatHM(weekTotal)} of {weekGoal}h this week
          </p>
          <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
            Courses
          </h1>
      </header>

      {rows.length === 0 ? (
        <div className="deckle border border-dashed border-line-strong bg-paper px-7 py-10 text-center">
          <p className="m-0 font-serif text-[20px] text-ink-soft">No courses this term yet.</p>
          <Link
            href="/dashboard?add=course"
            className="mt-4 inline-flex h-11 items-center rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast no-underline"
          >
            Add the first one
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-10 md:gap-12">
          {shelves.map((shelf, i) => (
            <section key={i}>
              {/* The books stand on the plank, so they are bottom-aligned and
                  a little uneven in height, the way a real shelf is. */}
              <div
                className="grid items-end gap-x-4 px-2 md:gap-x-6 md:px-3"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {shelf.map((item) =>
                  item === 'add' ? (
                    <AddBook key="add" />
                  ) : (
                    <Book key={item.course.id} row={item} onStart={setStartTarget} />
                  ),
                )}
              </div>
              <div aria-hidden className="shelf-plank" />
              <div
                className="mt-3 grid gap-x-4 px-2 md:gap-x-6 md:px-3"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {shelf.map((item) =>
                  item === 'add' ? (
                    <span key="add" />
                  ) : (
                    <Label key={item.course.id} row={item} today={today} />
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <StartTimerPopover
        target={startTarget}
        onClose={() => setStartTarget(null)}
        onStarted={() => router.push('/timer')}
      />
    </PageShell>
  );
}

type Row = {
  course: Course;
  weekSeconds: number;
  termSeconds: number;
  openCount: number;
  overdue: number;
  last: string | null;
};

type ShelfItem = Row | 'add';

/**
 * How many books stand on one shelf. The rail takes 232px from `md`, so the
 * count holds at three there rather than jumping with the window.
 */
function useShelfColumns(): number {
  const [columns, setColumns] = useState(2);
  useEffect(() => {
    const steps: [string, number][] = [
      ['(min-width: 1280px)', 5],
      ['(min-width: 1024px)', 4],
      ['(min-width: 560px)', 3],
    ];
    const queries = steps.map(([q, n]) => [window.matchMedia(q), n] as const);
    const read = () => setColumns(queries.find(([m]) => m.matches)?.[1] ?? 2);
    read();
    queries.forEach(([m]) => m.addEventListener('change', read));
    return () => queries.forEach(([m]) => m.removeEventListener('change', read));
  }, []);
  return columns;
}

/** A stable few percent off full height per course, so the row is uneven. */
function bookHeight(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 90 + (Math.abs(h) % 11);
}

function Book({ row, onStart }: { row: Row; onStart: (t: StartTarget) => void }) {
  const { course, weekSeconds } = row;
  return (
    <div className="aspect-[3/4] flex items-end">
      <div
        className="group relative w-full transition-transform duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-1.5 focus-within:-translate-y-1.5"
        style={{ height: `${bookHeight(course.id)}%` }}
      >
        <Link
          href={`/courses/${encodeURIComponent(course.id)}`}
          aria-label={`Open ${course.name}`}
          className="book-cover flex h-full flex-col justify-between py-3.5 pl-[22px] pr-3 no-underline md:py-4 md:pl-[26px] md:pr-4"
          style={{
            background: resolveTint(course.color, course.tint),
            ['--c' as string]: course.color,
          }}
        >
          <span className="min-w-0">
            <span className="eyebrow block truncate pr-8 text-ink-soft">{course.code}</span>
            <span className="mt-1.5 line-clamp-4 font-serif text-[15px] font-medium leading-[1.2] tracking-[-0.01em] text-ink md:text-[17px]">
              {course.name}
            </span>
          </span>
          <span className="block">
            <span className="block font-mono text-[10.5px] text-muted">
              <span className="text-ink">{formatHM(weekSeconds)}</span> / {course.weeklyGoalHours}h
            </span>
            <HourStrokes
              seconds={weekSeconds}
              goalHours={course.weeklyGoalHours}
              color={course.color}
              height={11}
              width={5}
              max={10}
              className="mt-1.5 !gap-1"
              label={`${course.code}, ${formatHM(weekSeconds)} of ${course.weeklyGoalHours} hours this week`}
            />
          </span>
        </Link>
        <button
          type="button"
          onClick={(e) => onStart({ task: null, course, anchor: e.currentTarget })}
          aria-label={`Start timer on ${course.code}`}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-paper text-ink-soft transition-opacity hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5l12 7-12 7V5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * The one add-course flow in the app is the catalog-backed sheet on Today, so
 * the empty slot hands the reader to it rather than keeping a second, blinder
 * copy. `?add=course` is what opens it; a bare /dashboard link just drops you
 * on Today with nothing open.
 */
function AddBook() {
  return (
    <div className="aspect-[3/4] flex items-end">
      <Link
        href="/dashboard?add=course"
        className="grid h-[94%] w-full place-items-center rounded-[3px_8px_8px_3px] border border-dashed border-line-strong text-center no-underline transition-colors hover:bg-bg-tint"
      >
        <span className="font-serif text-[14px] italic text-muted">
          <span aria-hidden className="block text-[22px] not-italic leading-none">+</span>
          Add a course
        </span>
      </Link>
    </div>
  );
}

function Label({ row, today }: { row: Row; today: string }) {
  const { termSeconds, openCount, overdue, last } = row;
  return (
    <p className="m-0 min-w-0 text-[12px] leading-[1.45] text-muted">
      <span className="block truncate font-serif italic text-[13px]">
        {openCount > 0 ? (
          <>
            <span className="text-ink-soft">{openCount} open</span>
            {overdue > 0 && <span className="text-warn"> · {overdue} overdue</span>}
          </>
        ) : (
          'Nothing open'
        )}
      </span>
      <span className="block truncate">
        <span className="font-mono text-[11px]">{formatHM(termSeconds)}</span>
        {' · '}
        {last ? relative(last, today) : 'not sat yet'}
      </span>
    </p>
  );
}

function relative(iso: string, today: string): string {
  const days = Math.round(
    (new Date(today + 'T12:00:00').getTime() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

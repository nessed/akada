'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import LoadingIndicator from '@/components/LoadingIndicator';
import JotTaskSheet from '@/components/JotTaskSheet';
import EditTaskSheet from '@/components/EditTaskSheet';
import TaskLine from '@/components/TaskLine';
import SwipeRow from '@/components/SwipeRow';
import ReadingBacklog from '@/components/list/ReadingBacklog';
import WatchList from '@/components/list/WatchList';
import { Eyebrow, Swipe, TextButton } from '@/components/notebook/Marks';
import { useNotice } from '@/components/Notice';
import type { Course, Task } from '@/lib/data';
import { formatHM, isoDate, daysBetween } from '@/lib/utils';
import { loggable } from '@/lib/derive';
import { useTimer } from '@/lib/timer-context';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  toggleTaskOptimistic,
  deleteTaskOptimistic,
} from '@/lib/data-hooks';

type Filter = 'all' | 'week' | 'late' | 'readings';
type Order = 'day' | 'course' | 'weight';

const FILTERS: { v: Filter; l: string }[] = [
  { v: 'all', l: 'Everything' },
  { v: 'week', l: 'This week' },
  { v: 'late', l: 'Late' },
  { v: 'readings', l: 'Readings' },
];

const ORDERS: { v: Order; l: string }[] = [
  { v: 'day', l: 'by day' },
  { v: 'course', l: 'by course' },
  { v: 'weight', l: 'by weight' },
];

export default function TasksPage() {
  return (
    <Suspense fallback={<TasksFallback />}>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksFallback() {
  return (
    <PageShell>
      <LoadingIndicator compact label="Loading your list" className="mb-6" />
    </PageShell>
  );
}

function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active } = useTimer();
  const { notify } = useNotice();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { sessions: rawSessions } = useSessions();
  const sessions = useMemo(() => loggable(rawSessions), [rawSessions]);

  const [filter, setFilter] = useState<Filter>('all');
  const [order, setOrder] = useState<Order>('day');
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const [jotting, setJotting] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const today = isoDate();

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) router.replace('/onboarding');
  }, [onboarded, onboardingLoading, onboardingError, router]);

  // Arriving from a course row: `?course=` narrows the list to it, `&newTask=1`
  // opens the jot sheet. The ref stops an SWR revalidation reopening it.
  const handledIntent = useRef(false);
  useEffect(() => {
    if (handledIntent.current || coursesLoading || courses.length === 0) return;
    const id = searchParams.get('course');
    if (!id || !courses.some((c) => c.id === id)) return;
    handledIntent.current = true;
    setCourseFilter(id);
    if (searchParams.get('newTask') === '1') setJotting(true);
  }, [searchParams, coursesLoading, courses]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=true]')) return;
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setJotting(true);
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        setOrder((c) => (c === 'day' ? 'course' : c === 'course' ? 'weight' : 'day'));
      }
      if (event.key === 'Escape') {
        setJotting(false);
        setEditing(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleToggle(task: Task) {
    try {
      await toggleTaskOptimistic(task);
    } catch (error) {
      console.error('Failed to update task:', error);
      notify('That task did not update.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTaskOptimistic(id);
    } catch (error) {
      console.error('Failed to delete task:', error);
      notify('That task is still here. It did not delete.');
    }
  }

  function handleStart(task: Task) {
    // A session already on the clock keeps it: the timer screen shows what is
    // running rather than quietly swapping it for this one.
    if (active) {
      router.push('/timer');
      return;
    }
    router.push(`/timer?course=${task.courseId}&task=${task.id}`);
  }

  const visible = useMemo(() => {
    let rows = tasks;
    if (courseFilter) rows = rows.filter((t) => t.courseId === courseFilter);
    if (filter === 'late') rows = rows.filter((t) => !t.completed && t.dueDate && t.dueDate < today);
    if (filter === 'readings') rows = rows.filter((t) => t.kind === 'reading' && !t.completed);
    if (filter === 'week') {
      const end = addDays(today, 7);
      rows = rows.filter((t) => !t.completed && t.dueDate && t.dueDate <= end);
    }
    return rows;
  }, [tasks, filter, courseFilter, today]);

  const groups = useMemo(
    () => groupTasks(visible, courses, order, today),
    [visible, courses, order, today],
  );

  const openCount = tasks.filter((t) => !t.completed).length;
  /** Seconds logged against each task, keyed by task id. */
  const secondsByTask = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of sessions) {
      if (s.taskId) out[s.taskId] = (out[s.taskId] || 0) + s.durationSeconds;
    }
    return out;
  }, [sessions]);
  const focused = courseFilter ? courses.find((c) => c.id === courseFilter) : null;

  const loading = onboardingLoading || onboarded === false || coursesLoading || tasksLoading;
  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Loading your list" className="mb-6" />
      </PageShell>
    );
  }

  const aside = (
    <>
      <ReadingBacklog tasks={tasks} courses={courses} sessions={sessions} />
      <WatchList tasks={tasks} courses={courses} today={today} />
    </>
  );

  return (
    <PageShell aside={aside}>
      <div className="flex items-end justify-between gap-5">
        <div className="min-w-0">
          <Eyebrow style={{ letterSpacing: '0.18em' }}>Everything written down</Eyebrow>
          <h1 className="mt-2 font-serif text-[32px] font-normal leading-none tracking-[-0.03em] md:text-[42px]">
            Tasks{' '}
            <em className="text-[20px] italic text-muted md:text-[26px]">· {openCount} open</em>
          </h1>
        </div>
        <TextButton onClick={() => setJotting(true)}>add a task</TextButton>
      </div>

      {/* The filter is a swipe of highlighter, the order is a rule underneath:
          two different kinds of choice, so they are marked two different ways. */}
      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-3 border-b border-line pb-3">
        <span className="flex flex-wrap items-baseline gap-4">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFilter(f.v)}
              aria-pressed={filter === f.v}
              className={`bg-transparent font-serif text-[15.5px] ${
                filter === f.v ? 'text-ink' : 'text-muted hover:text-ink-soft'
              }`}
            >
              {filter === f.v ? <Swipe>{f.l}</Swipe> : f.l}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-baseline gap-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            order
          </span>
          {ORDERS.map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => setOrder(s.v)}
              aria-pressed={order === s.v}
              className={`bg-transparent font-serif text-[13.5px] ${
                order === s.v ? 'ink-underline text-ink' : 'text-muted hover:text-ink-soft'
              }`}
            >
              {s.l}
            </button>
          ))}
        </span>
      </div>

      {focused && (
        <div className="mt-4 flex items-center gap-3">
          <span className="font-serif text-[14px] italic text-muted">
            Only {focused.code} right now.
          </span>
          <TextButton tone="quiet" onClick={() => setCourseFilter(null)}>
            show everything →
          </TextButton>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-10 border border-dashed border-line-strong px-5 py-10 text-center">
          <p className="m-0 font-serif text-[17px] italic text-muted">
            {filter === 'all' ? 'Nothing written down yet.' : 'Nothing here.'}
          </p>
          <TextButton className="mt-4" onClick={() => setJotting(true)}>
            add the first task
          </TextButton>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="mt-7">
            <div className="flex items-baseline gap-3.5">
              <Eyebrow as="span" style={group.tone === 'late' ? { color: 'var(--warn)' } : group.tone === 'now' ? { color: 'var(--ink)' } : undefined}>
                {group.label}
              </Eyebrow>
              <span
                aria-hidden
                className="flex-1"
                style={{
                  height: group.tone === 'now' ? 1.5 : 1,
                  background: group.tone === 'now' ? 'var(--ink)' : 'var(--line)',
                }}
              />
              {group.tone !== 'now' && (
                <span
                  className="font-mono text-[11px]"
                  style={{ color: group.tone === 'late' ? 'var(--warn)' : 'var(--muted)' }}
                >
                  {group.tasks.length}
                </span>
              )}
            </div>

            {group.tasks.map((task) => {
              const course = courses.find((c) => c.id === task.courseId);
              return (
                <SwipeRow
                  key={task.id}
                  accent={course?.color}
                  onComplete={task.completed ? undefined : () => handleToggle(task)}
                  onDelete={() => handleDelete(task.id)}
                >
                  <TaskLine
                    task={task}
                    course={course}
                    showCourse={order !== 'course'}
                    meta={metaFor(task, course, secondsByTask[task.id])}
                    onToggle={() => handleToggle(task)}
                    onOpen={() => setEditing(task)}
                    onStart={task.completed ? undefined : () => handleStart(task)}
                  />
                </SwipeRow>
              );
            })}
          </section>
        ))
      )}

      <TextButton tone="quiet" className="mt-5" onClick={() => setJotting(true)}>
        + add a task
      </TextButton>

      <JotTaskSheet
        open={jotting}
        onClose={() => setJotting(false)}
        courses={courses}
        defaultCourseId={courseFilter ?? undefined}
      />
      <EditTaskSheet task={editing} courses={courses} onClose={() => setEditing(null)} />
    </PageShell>
  );
}

/* ───────── grouping ───────── */

interface Group {
  key: string;
  label: string;
  tone: 'late' | 'now' | 'plain';
  tasks: Task[];
}

/**
 * The list is grouped by *when*, not by course. That is the whole change:
 * a student does not sit down to do "CS 200", they sit down to do what is
 * late and then what is today, and a per-course list buries both.
 *
 * Late and Today get their own headings; everything else within the next
 * week collapses into one dated span, and undated work sits at the bottom
 * where it cannot pretend to be urgent. Ordering by course or by weight
 * re-groups without changing what is in the list.
 */
function groupTasks(tasks: Task[], courses: Course[], order: Order, today: string): Group[] {
  const open = tasks.filter((t) => !t.completed);
  const doneToday = tasks.filter((t) => t.completed && t.completedAt?.slice(0, 10) === today);

  if (order === 'course') {
    return courses
      .map((course) => ({
        key: course.id,
        label: course.code,
        tone: 'plain' as const,
        tasks: open.filter((t) => t.courseId === course.id).sort(byDue),
      }))
      .filter((g) => g.tasks.length > 0);
  }

  if (order === 'weight') {
    const weighted = open.filter((t) => (t.weight ?? 0) > 0).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    const rest = open.filter((t) => !(t.weight ?? 0)).sort(byDue);
    return [
      { key: 'weighted', label: 'Carries a mark', tone: 'plain' as const, tasks: weighted },
      { key: 'rest', label: 'Everything else', tone: 'plain' as const, tasks: rest },
    ].filter((g) => g.tasks.length > 0);
  }

  const late = open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue);
  const now = [...open.filter((t) => t.dueDate === today), ...doneToday];
  const soon = open
    .filter((t) => t.dueDate && t.dueDate > today && daysBetween(today, t.dueDate) <= 7)
    .sort(byDue);
  const later = open
    .filter((t) => t.dueDate && daysBetween(today, t.dueDate) > 7)
    .sort(byDue);
  const undated = open.filter((t) => !t.dueDate);

  const soonLabel =
    soon.length > 0
      ? `${shortDate(soon[0].dueDate as string)} — ${shortDate(soon[soon.length - 1].dueDate as string)}`
      : '';

  return [
    { key: 'late', label: 'Late', tone: 'late' as const, tasks: late },
    { key: 'now', label: `Today · ${shortDate(today)}`, tone: 'now' as const, tasks: now },
    { key: 'soon', label: soonLabel, tone: 'plain' as const, tasks: soon },
    { key: 'later', label: 'Further out', tone: 'plain' as const, tasks: later },
    { key: 'undated', label: 'No date yet', tone: 'plain' as const, tasks: undated },
  ].filter((g) => g.tasks.length > 0);
}

function byDue(a: Task, b: Task): number {
  return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
}

function shortDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/**
 * The second line under a task: the course, then whatever else is true of
 * this one row. `spentSeconds` is time logged against *this task*, not against
 * its course — the course's total here read as though one task had eaten it.
 */
function metaFor(task: Task, course: Course | undefined, spentSeconds?: number): string {
  const done = task.subtasks?.filter((s) => s.completed).length ?? 0;
  const total = task.subtasks?.length ?? 0;
  return [
    course?.code,
    task.kind === 'reading' && task.pages ? `${task.pages} pages` : null,
    task.kind === 'exam' ? 'exam' : null,
    task.weight ? `counts for ${task.weight}%` : null,
    spentSeconds && spentSeconds > 0 ? `${formatHM(spentSeconds)} in` : null,
    total > 0 ? `${done} of ${total} done` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

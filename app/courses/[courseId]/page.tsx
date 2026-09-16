'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import BackButton from '@/components/BackButton';
import ConfirmSheet from '@/components/ConfirmSheet';
import DatePicker from '@/components/DatePicker';
import LoadingIndicator from '@/components/LoadingIndicator';
import TaskItem from '@/components/TaskItem';
import Stamp from '@/components/notebook/Stamp';
import { useNotice } from '@/components/Notice';
import CourseSessionLog from '@/components/course/CourseSessionLog';
import CourseWeekCard from '@/components/course/CourseWeekCard';
import { useArchivedCourse } from '@/components/course/useArchivedCourse';
import type { Course, Session, Task } from '@/lib/data';
import { cleanTaskTitle } from '@/lib/planner-safety';
import { isLoggableDuration } from '@/lib/session-safety';
import { useTimer } from '@/lib/timer-context';
import { formatHM, resolveTint, totalSeconds } from '@/lib/utils';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  addTaskOptimistic,
  toggleTaskOptimistic,
  deleteTaskOptimistic,
  updateCourseOptimistic,
} from '@/lib/data-hooks';

/**
 * One course, on its own page.
 *
 * A course card used to open the task list filtered to that course, which
 * answered one question out of the several a student actually has about a
 * course. This page is the whole answer: who teaches it and when it meets,
 * how the week is going against the goal set for it, what is still written
 * down, what has been studied, and the one button that starts the next
 * session.
 *
 * It deliberately does not become a second Tasks screen. The task list here
 * is this course's list and nothing else, with no filters and no sort: the
 * cross-course list, with its ordering, its editing and its reading view, is
 * still Tasks, and there is a link through to it at the foot of the section.
 */
export default function CoursePage() {
  const params = useParams<{ courseId: string }>();
  const courseId = typeof params?.courseId === 'string' ? params.courseId : '';
  const router = useRouter();
  const { notify } = useNotice();
  const { active, start } = useTimer();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();

  const [draftTitle, setDraftTitle] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) {
      router.replace('/onboarding');
    }
  }, [onboarded, onboardingLoading, onboardingError, router]);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || sessionsLoading || tasksLoading;

  const course = courses.find((item) => item.id === courseId);

  // Only once the active semester has been read, and the course was not in it,
  // is it worth looking through the terms that have already finished.
  const { archived, searching } = useArchivedCourse(
    courseId,
    !loading && !course && courseId !== '',
  );

  const courseSessions = useMemo(() => {
    if (!course) return [];
    return rawSessions.filter(
      (session) => session.courseId === course.id && isLoggableDuration(session.durationSeconds),
    );
  }, [rawSessions, course]);

  const log = useMemo(() => sortNewestFirst(courseSessions), [courseSessions]);

  const { open, done } = useMemo(() => {
    const mine = tasks.filter((task) => task.courseId === courseId);
    return {
      open: mine
        .filter((task) => !task.completed)
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
          return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
        }),
      done: mine
        .filter((task) => task.completed)
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')),
    };
  }, [tasks, courseId]);

  function goBack() {
    // The course list lives on the dashboard, so that is where "back" means,
    // whatever route happened to link here.
    router.push('/dashboard');
  }

  function beginTimer() {
    if (!course) return;
    start(course.id, null);
    router.push('/timer');
  }

  function handleStartSession() {
    if (!course) return;
    // A timer already running on something else would be discarded, which is
    // the one thing here worth stopping to ask about.
    if (active && (active.courseId !== course.id || active.taskId !== null)) {
      setConfirmSwitch(true);
      return;
    }
    beginTimer();
  }

  function handleStartTimerForTask(task: Task) {
    if (active) {
      router.push('/timer');
      return;
    }
    start(task.courseId, task.id);
    router.push('/timer');
  }

  async function toggleTask(id: string) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    try {
      await toggleTaskOptimistic(task);
    } catch (error) {
      console.error('Failed to update task:', error);
      notify('That task did not update.');
    }
  }

  async function removeTask(id: string) {
    try {
      await deleteTaskOptimistic(id);
    } catch (error) {
      console.error('Failed to delete task:', error);
      notify('That task is still here. It did not delete.');
    }
  }

  async function commitDraft() {
    const title = cleanTaskTitle(draftTitle);
    if (!course || !title) {
      setAdding(false);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await addTaskOptimistic({
        courseId: course.id,
        title,
        dueDate: draftDue || null,
        priority: 'normal',
      });
      setDraftTitle('');
      setDraftDue('');
      setAdding(false);
    } catch (error) {
      console.error('Failed to add task:', error);
      notify('That task was not added.');
    } finally {
      setSaving(false);
    }
  }

  async function saveGoal(hours: number) {
    if (!course) return;
    try {
      await updateCourseOptimistic(course.id, { weeklyGoalHours: hours });
    } catch (error) {
      console.error('Failed to save weekly goal:', error);
      notify('That goal did not save.');
    }
  }

  if (loading || (!course && searching)) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Opening the course" className="mb-6" />
        <div className="opacity-30" aria-hidden>
          <div className="mb-3 h-2 w-16 rounded-full bg-line" />
          <div className="mb-8 h-7 w-[58%] rounded-full bg-line" />
          <div className="deckle mb-[var(--density-gap)] h-[210px] border border-line bg-paper" />
          <div className="deckle h-[140px] border border-line bg-paper" />
        </div>
      </PageShell>
    );
  }

  if (!course && archived) {
    return <ArchivedCourseView onBack={goBack} archived={archived} />;
  }

  if (!course) {
    return (
      <PageShell>
        <BackButton onClick={goBack} label="Courses" />
        <p className="eyebrow m-0 mt-4">Course</p>
        <h1 className="mt-2 mb-0 font-serif text-[36px] font-medium leading-[1.05] tracking-[-0.025em]">
          This page was <span className="italic">torn out</span>.
        </h1>
        <p className="mt-3 mb-0 max-w-[320px] font-serif text-[14px] italic leading-[1.6] text-muted">
          The course this link points at is not in any of your terms. It may
          have been deleted.
        </p>
        <Link
          href="/dashboard"
          className="hand-underline mt-7 inline-block font-serif text-[14px] text-ink"
        >
          Back to your courses
        </Link>
      </PageShell>
    );
  }

  const tint = resolveTint(course.color, course.tint);
  const details = catalogDetails(course);

  return (
    <PageShell>
      <BackButton onClick={goBack} label="Courses" />

      <header className="mb-[22px]">
        <p className="eyebrow m-0" style={{ color: course.color }}>
          {course.code}
        </p>
        <h1 className="mt-1.5 mb-0 font-serif text-[36px] font-medium leading-[1.05] tracking-[-0.025em]">
          <span className="hl-swipe" style={{ '--hl': tint } as React.CSSProperties}>
            {course.name}
          </span>
        </h1>

        {details.length > 0 && (
          <dl className="m-0 mt-4">
            {details.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline gap-4 border-b border-dashed border-line py-2 last:border-0"
              >
                <dt className="eyebrow m-0 shrink-0">{row.label}</dt>
                <dd className="m-0 ml-auto min-w-0 text-right font-serif text-[14px] text-ink-soft">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      <CourseWeekCard course={course} sessions={courseSessions} onGoalChange={saveGoal} />

      {/* The one filled action on the page, per the guide. */}
      <button
        type="button"
        onClick={handleStartSession}
        className="mt-[var(--density-gap)] flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-[15px] font-medium text-primary-contrast transition-opacity active:opacity-90"
      >
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 5l12 7-12 7V5z" />
        </svg>
        Start a session
      </button>

      {/* Tasks. This course's list, and only this course's. */}
      <section className="mt-[var(--density-section)]">
        <div className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
          <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">Tasks</h2>
          <span className="tnum ml-auto font-mono text-[12px] text-muted">
            {open.length}
          </span>
        </div>

        <div className="pt-1.5">
          {open.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              course={course}
              onToggle={toggleTask}
              onStartTimer={handleStartTimerForTask}
              onDelete={removeTask}
            />
          ))}

          {open.length === 0 && !adding && (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setDraftTitle('');
                setDraftDue('');
              }}
              className="mt-3 w-full rounded-[10px] border border-dashed border-line px-4 py-9 text-center font-serif text-[14px] italic text-muted-soft transition-colors hover:text-ink-soft"
            >
              Nothing written down for this course yet.
            </button>
          )}

          {adding ? (
            <div
              className="mt-2 animate-fade-in rounded-[10px] bg-paper px-3 py-2.5"
              style={{ border: `1px solid ${course.color}` }}
            >
              <input
                autoFocus
                type="text"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="New task"
                className="w-full border-0 bg-transparent p-1 font-serif text-sm italic text-ink outline-none"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitDraft();
                  if (event.key === 'Escape') setAdding(false);
                }}
              />
              <div className="mt-2 flex items-center gap-2">
                <DatePicker
                  value={draftDue}
                  onChange={setDraftDue}
                  placeholder="Due"
                  compact
                  className="w-[132px]"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={commitDraft}
                  className="hand-underline ml-auto bg-transparent px-0.5 font-serif text-[13px] text-ink disabled:opacity-40"
                >
                  {saving ? 'Adding' : 'Add'}
                </button>
              </div>
            </div>
          ) : (
            open.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setDraftTitle('');
                  setDraftDue('');
                }}
                className="w-full px-1 py-3 text-left font-serif text-[13px] italic text-muted-soft transition-colors hover:text-ink"
              >
                + jot a task…
              </button>
            )
          )}
        </div>

        {done.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              aria-expanded={showDone}
              onClick={() => setShowDone((current) => !current)}
              className="bg-transparent p-0 font-serif text-[13px] italic text-muted transition-colors hover:text-ink"
            >
              {showDone ? 'hide' : 'show'} {done.length} finished
            </button>
            {showDone && (
              <div className="mt-1.5 animate-fade-in">
                {done.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    course={course}
                    onToggle={toggleTask}
                    onStartTimer={handleStartTimerForTask}
                    onDelete={removeTask}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <Link
          href={`/tasks?course=${encodeURIComponent(course.id)}`}
          className="mt-4 inline-block font-serif text-[13px] italic text-muted transition-colors hover:text-ink"
        >
          See this course beside the others →
        </Link>
      </section>

      {/* The hours. The full log, and deleting from it, stay on Stats. */}
      <section className="mt-[var(--density-section)]">
        <div className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
          <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">Sessions</h2>
          {log.length > 0 && (
            <span className="tnum ml-auto font-mono text-[12px] text-muted">
              {formatHM(totalSeconds(log))}
            </span>
          )}
        </div>
        <div className="pt-1.5">
          <CourseSessionLog
            sessions={log}
            color={course.color}
            emptyLine="No sessions yet. The button above starts the first one."
          />
        </div>
      </section>

      <ConfirmSheet
        open={confirmSwitch}
        title="Start this one instead?"
        body="The timer already running will be discarded."
        confirmLabel="Start"
        cancelLabel="Keep going"
        onCancel={() => setConfirmSwitch(false)}
        onConfirm={() => {
          setConfirmSwitch(false);
          beginTimer();
        }}
      />
    </PageShell>
  );
}

/** A course whose term has finished: the record, with nothing left to change. */
function ArchivedCourseView({
  archived,
  onBack,
}: {
  archived: { course: Course; semester: { label: string }; sessions: Session[] };
  onBack: () => void;
}) {
  const { course, semester, sessions } = archived;
  const tint = resolveTint(course.color, course.tint);
  const log = sortNewestFirst(
    sessions.filter((session) => isLoggableDuration(session.durationSeconds)),
  );
  const details = catalogDetails(course);

  return (
    <PageShell>
      <BackButton onClick={onBack} label="Courses" />

      <header className="mb-[22px]">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow m-0" style={{ color: course.color }}>
            {course.code}
          </p>
          <Stamp>{semester.label}</Stamp>
        </div>
        <h1 className="mt-1.5 mb-0 font-serif text-[36px] font-medium leading-[1.05] tracking-[-0.025em]">
          <span className="hl-swipe" style={{ '--hl': tint } as React.CSSProperties}>
            {course.name}
          </span>
        </h1>
        <p className="mt-3 mb-0 font-serif text-[13.5px] italic leading-[1.6] text-muted">
          A closed term. What was written here is kept, not edited.
        </p>

        {details.length > 0 && (
          <dl className="m-0 mt-4">
            {details.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline gap-4 border-b border-dashed border-line py-2 last:border-0"
              >
                <dt className="eyebrow m-0 shrink-0">{row.label}</dt>
                <dd className="m-0 ml-auto min-w-0 text-right font-serif text-[14px] text-ink-soft">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      <section className="deckle border border-line bg-paper px-[var(--density-gutter)] py-5">
        <p className="eyebrow m-0">Logged in all</p>
        <p className="mt-1.5 mb-0 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
          {formatHM(totalSeconds(log))}
        </p>
      </section>

      <section className="mt-[var(--density-section)]">
        <div className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
          <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">Sessions</h2>
        </div>
        <div className="pt-1.5">
          <CourseSessionLog
            sessions={log}
            color={course.color}
            limit={10}
            emptyLine="This course was never studied against the clock."
          />
        </div>
      </section>
    </PageShell>
  );
}

function sortNewestFirst(sessions: Session[]): Session[] {
  return sessions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Only what the catalog actually supplied; a typed-in course has no rows. */
function catalogDetails(course: Course): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (typeof course.credits === 'number' && course.credits > 0) {
    rows.push({ label: 'Credits', value: String(course.credits) });
  }
  if (course.section) rows.push({ label: 'Section', value: course.section });
  if (course.instructor) rows.push({ label: 'Taught by', value: course.instructor });
  if (course.meetingTime) rows.push({ label: 'Meets', value: course.meetingTime });
  return rows;
}

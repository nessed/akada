'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import BackButton from '@/components/BackButton';
import CoursePagePanel from '@/components/progression/CoursePagePanel';
import CourseRecallPanel from '@/components/recall/CourseRecallPanel';
import { useRecall } from '@/lib/recall/use-recall';
import Marginalia from '@/components/progression/Marginalia';
import { useProgression } from '@/lib/progression/use-progression';
import ConfirmSheet from '@/components/ConfirmSheet';
import DatePicker from '@/components/DatePicker';
import DueDateBadge from '@/components/DueDateBadge';
import LoadingIndicator from '@/components/LoadingIndicator';
import TaskRow from '@/components/TaskRow';
import HourStrokes from '@/components/HourStrokes';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import Stamp from '@/components/notebook/Stamp';
import { useNotice } from '@/components/Notice';
import CourseSessionLog from '@/components/course/CourseSessionLog';
import CourseWeekCard from '@/components/course/CourseWeekCard';
import GradeStanding from '@/components/course/GradeStanding';
import { useArchivedCourse } from '@/components/course/useArchivedCourse';
import type { Course, Session, Task } from '@/lib/data';
import { cleanTaskTitle } from '@/lib/planner-safety';
import { isLoggableDuration } from '@/lib/session-safety';
import { useTimer } from '@/lib/timer-context';
import {
  formatHM,
  formatRelativeDate,
  isoDate,
  resolveTint,
  sessionsThisWeek,
  totalSeconds,
} from '@/lib/utils';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  addTaskOptimistic,
  toggleTaskOptimistic,
  deleteTaskOptimistic,
  updateTaskOptimistic,
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
  const { active, start, pause, resume, focusSeconds } = useTimer();

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
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);

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

  // The progression layer reads through the same SWR caches as everything
  // above, so this costs no request and cannot disagree with the hours.
  const { progression } = useProgression();
  const pageRecord = course ? (progression?.pages.get(course.id) ?? null) : null;
  const { reading: recall, available: recallAvailable } = useRecall();

  const courseSessions = useMemo(() => {
    if (!course) return [];
    return rawSessions.filter(
      (session) => session.courseId === course.id && isLoggableDuration(session.durationSeconds),
    );
  }, [rawSessions, course]);

  const log = useMemo(() => sortNewestFirst(courseSessions), [courseSessions]);

  const courseTasks = useMemo(
    () => tasks.filter((task) => task.courseId === courseId),
    [tasks, courseId],
  );

  const { open, done } = useMemo(() => {
    const mine = courseTasks;
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
  }, [courseTasks]);

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

  async function toggleTask(task: Task) {
    try {
      await toggleTaskOptimistic(task);
    } catch (error) {
      console.error('Failed to update task:', error);
      notify('That task did not update.');
    }
  }

  /**
   * What a row needs to show, and hold, the timer running on it.
   *
   * Passed as one unit because these four belong together: the pause control
   * on a row used to draw whenever a timer was running and call a handler no
   * page ever passed, so it was a live-looking button that did nothing. It
   * now draws only when it is given something to do, and this keeps every
   * list giving it the same thing.
   */
  function timerRowProps(task: Task) {
    const mine = active?.taskId === task.id;
    return {
      running: mine,
      paused: mine && Boolean(active?.isPaused),
      runningLabel: mine ? formatHM(focusSeconds) : undefined,
      onTogglePause: active?.isPaused ? resume : pause,
    };
  }

  /**
   * Reading a task, which is where its description and its steps live.
   *
   * The Tasks screen owns that view, so this hands the task over to it rather
   * than keeping a second copy here. Until this existed the title on a course
   * page was a button that did nothing, and a task's steps could only be
   * reached by going to Tasks and finding it again.
   */
  function openTask(task: Task) {
    router.push(`/tasks?task=${encodeURIComponent(task.id)}`);
  }

  /** "Open ended": the task stays on the course, the date comes off. */
  async function openEndTask(task: Task) {
    if (!task.dueDate) return;
    try {
      await updateTaskOptimistic(task.id, { dueDate: null });
    } catch (error) {
      console.error('Failed to clear the due date:', error);
      notify('That date did not come off.');
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
  const today = isoDate();
  const weekSeconds = totalSeconds(sessionsThisWeek(courseSessions));
  const overdueCount = open.filter((t) => t.dueDate && t.dueDate < today).length;
  // The earliest dated task still open. Open is already sorted by due date,
  // so this is the first one that has a date at all.
  const nextDue = open.find((t) => t.dueDate) ?? null;
  const lastSession = log[0] ?? null;
  const lastSessionLabel = lastSession ? formatRelativeDate(lastSession.date).toLowerCase() : null;

  return (
    <PageShell wide>
      <BackButton onClick={goBack} label="Courses" />

      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="m-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="eyebrow" style={{ color: course.color }}>
              {course.code}
            </span>
            {details.length > 0 && (
              <span className="font-mono text-[11px] text-muted">
                {details.map((row) => row.value).join(' · ')}
              </span>
            )}
          </p>
          <h1 className="m-0 mt-1.5 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
            <span className="hl-swipe" style={{ '--hl': tint } as React.CSSProperties}>
              {course.name}
            </span>
          </h1>
          <Marginalia courseId={course.id} className="mt-2.5" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleStartSession}
            className="flex h-11 items-center gap-2.5 rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-contrast transition-opacity hover:opacity-90"
          >
            <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5l12 7-12 7V5z" />
            </svg>
            Start timer
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setDraftTitle('');
              setDraftDue('');
            }}
            className="h-11 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            Add task
          </button>
        </div>
      </header>

      {/* The four numbers the course is actually judged on, across the top
          rather than stacked down the side of a phone column. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-[14px] border border-line bg-paper p-4">
          <p className="eyebrow m-0">This week</p>
          <p className="m-0 mt-2 font-mono text-[20px] font-semibold tabular-nums">
            {formatHM(weekSeconds)}
            <span className="ml-1 text-[12px] font-normal text-muted">
              / {course.weeklyGoalHours}h
            </span>
          </p>
          <HourStrokes
            seconds={weekSeconds}
            goalHours={course.weeklyGoalHours}
            color={course.color}
            height={12}
            width={7}
            max={12}
            className="mt-2.5"
            label={`${formatHM(weekSeconds)} of ${course.weeklyGoalHours} hours this week`}
          />
        </div>

        <div className="rounded-[14px] border border-line bg-paper p-4">
          <p className="eyebrow m-0">Term</p>
          <p className="m-0 mt-2 font-mono text-[20px] font-semibold tabular-nums">
            {formatHM(totalSeconds(log))}
          </p>
          <p className="m-0 mt-2 text-[11px] text-muted">
            {log.length} {log.length === 1 ? 'session' : 'sessions'}
            {lastSessionLabel && ` · last ${lastSessionLabel}`}
          </p>
        </div>

        <div className="rounded-[14px] border border-line bg-paper p-4">
          <p className="eyebrow m-0">Open tasks</p>
          <p className="m-0 mt-2 font-mono text-[20px] font-semibold tabular-nums">
            {open.length}
            {overdueCount > 0 && (
              <span className="ml-1.5 text-[12px] font-normal text-warn">
                {overdueCount} overdue
              </span>
            )}
          </p>
          <p className="m-0 mt-2 text-[11px] text-muted">
            {done.length > 0 ? `${done.length} finished so far` : 'Nothing finished yet'}
          </p>
        </div>

        <div className="rounded-[14px] border border-line bg-paper p-4">
          <p className="eyebrow m-0">Next due</p>
          {nextDue ? (
            <>
              <p className="m-0 mt-2">
                <DueDateBadge dueDate={nextDue.dueDate} size="md" />
              </p>
              <p className="m-0 mt-1.5 line-clamp-2 text-[12px] leading-[1.4] text-ink">
                {nextDue.title}
              </p>
            </>
          ) : (
            <p className="m-0 mt-2 font-serif text-[15px] italic text-muted">Nothing dated</p>
          )}
        </div>
      </div>

      {/* This course's page, with its marks in the margin. Faded when the
          course has been left alone, and never a word about the fading. */}
      {pageRecord && (
        <CoursePagePanel
          course={course}
          record={pageRecord}
          ink={progression?.ink.get(course.id) ?? null}
        />
      )}

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {/* Tasks. This course's list, and only this course's, so the rows
              drop the course column they would otherwise all repeat. */}
          <section>
            <div className="flex items-baseline justify-between gap-3 px-2 pb-2">
              <p className="eyebrow m-0">
                Tasks
                <span className="ml-1.5 font-mono tracking-normal text-ink-soft">
                  {open.length}
                </span>
              </p>
              {done.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showDone}
                  onClick={() => setShowDone((current) => !current)}
                  className="h-10 rounded-[10px] px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
                >
                  {showDone ? 'Hide' : 'Done'} {done.length}
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
              {open.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  course={course}
                  hideCourse
                  {...timerRowProps(task)}
                  onToggle={toggleTask}
                  onStartTimer={(t, el) => setStartTarget({ task: t, course, anchor: el })}
                  onOpen={openTask}
                  onOpenEnded={openEndTask}
                  onDelete={(t) => removeTask(t.id)}
                />
              ))}

              {showDone &&
                done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    course={course}
                    hideCourse
                    onToggle={toggleTask}
                    onStartTimer={(t, el) => setStartTarget({ task: t, course, anchor: el })}
                    onOpen={openTask}
                    onDelete={(t) => removeTask(t.id)}
                  />
                ))}

              {open.length === 0 && !showDone && !adding && (
                <p className="m-0 px-4 py-9 text-center font-serif text-[14px] italic text-muted-soft">
                  Nothing written down for this course yet.
                </p>
              )}

              {/* The inline add sits inside the panel, on the line where the
                  next task will appear. */}
              {adding ? (
                <div className="border-t border-line-soft px-3 py-2.5">
                  <input
                    autoFocus
                    type="text"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder={`Add a task to ${course.code}`}
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
                      clearLabel="Open ended"
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
                <button
                  type="button"
                  onClick={() => {
                    setAdding(true);
                    setDraftTitle('');
                    setDraftDue('');
                  }}
                  className="w-full border-t border-line-soft px-4 py-3 text-left font-serif text-[13px] italic text-muted-soft transition-colors hover:text-ink"
                >
                  + jot a task…
                </button>
              )}
            </div>

            <Link
              href={`/tasks?course=${encodeURIComponent(course.id)}`}
              className="mt-4 inline-block font-serif text-[13px] italic text-muted no-underline transition-colors hover:text-ink"
            >
              See this course beside the others →
            </Link>
          </section>

          {/* What this course is keeping, and how much of it came back clear.
              See lib/recall. */}
          <CourseRecallPanel
            course={course}
            reading={recall}
            available={recallAvailable}
            onStudy={(state, el) => setStartTarget({ task: state.task, course, anchor: el })}
            className="mt-10"
          />
        </div>

        <aside className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:sticky lg:top-10">
          <CourseWeekCard course={course} sessions={courseSessions} onGoalChange={saveGoal} />

          <GradeStanding course={course} tasks={courseTasks} today={today} />

          {/* The hours. The full log, and deleting from it, stay on Stats. */}
          <section className="rounded-[14px] border border-line bg-paper p-5">
            <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
              <p className="eyebrow m-0">Sessions</p>
              {log.length > 0 && (
                <span className="tnum font-mono text-[11px] text-muted">
                  {formatHM(totalSeconds(log))}
                </span>
              )}
            </div>
            <div className="pt-1.5">
              <CourseSessionLog
                sessions={log.slice(0, 6)}
                color={course.color}
                emptyLine="No sessions yet. Start timer begins the first one."
              />
            </div>
            {log.length > 6 && (
              <Link
                href="/stats"
                className="mt-2 inline-block font-serif text-[13px] italic text-muted no-underline hover:text-ink"
              >
                All {log.length} on Stats →
              </Link>
            )}
          </section>
        </aside>
      </div>

      <StartTimerPopover target={startTarget} onClose={() => setStartTarget(null)} />
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
/**
 * The catalog line under the course code. `label` is for the archived view,
 * which still sets these out as a list; `value` carries its own unit, because
 * run together on one line a bare "4" beside a section number reads as
 * neither. Only what the course actually has appears.
 */
function catalogDetails(course: Course): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (typeof course.credits === 'number' && course.credits > 0) {
    rows.push({ label: 'Credits', value: `${course.credits} cr` });
  }
  if (course.section) rows.push({ label: 'Section', value: `Sec ${course.section}` });
  if (course.instructor) rows.push({ label: 'Taught by', value: course.instructor });
  if (course.meetingTime) rows.push({ label: 'Meets', value: course.meetingTime });
  return rows;
}

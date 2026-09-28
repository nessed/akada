'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import Leaving from '@/components/Leaving';
import NextMarkLine from '@/components/progression/NextMarkLine';
import Marginalia from '@/components/progression/Marginalia';
import { useProgression } from '@/lib/progression/use-progression';
import RecallDeck from '@/components/recall/RecallDeck';
import BeforeExamPanel from '@/components/today/BeforeExamPanel';
import { useRecall } from '@/lib/recall/use-recall';
import type { RecallState } from '@/lib/recall';
import { useLiveSession } from '@/lib/use-live-session';
import { withLiveSession } from '@/lib/live-session';
import TaskRow from '@/components/TaskRow';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import {
  ComingPanel,
  TodayHours,
  UpNext,
  WeekHours,
  CourseLine,
} from '@/components/today/TodayPanels';
import DatePicker from '@/components/DatePicker';
import { ReaderAvatar } from '@/components/SettingsGlyph';
import LoadingIndicator, { ButtonSpinner } from '@/components/LoadingIndicator';
import ConfirmSheet from '@/components/ConfirmSheet';
import HandCheck from '@/components/notebook/HandCheck';
import { useNotice } from '@/components/Notice';
import { finishedUndo, skippedUndo, useUndo } from '@/components/Undo';
import KindFields, { useKindDraft } from '@/components/tasks/KindFields';
import { useClaudeSheet } from '@/components/claude/ClaudeSheet';
import { outlinePrompt } from '@/lib/claude-asks';
import CourseSearchInput from '@/components/CourseSearchInput';
import type { Course, Task } from '@/lib/data';
import { upNextFrom } from '@/lib/use-up-next';
import { usePreferences } from '@/lib/preferences';
import type { CatalogCourse } from '@/lib/catalog';
import { courseFromCatalog, deriveCourseCode, parseCourseInput, weeklyGoalForCredits } from '@/lib/catalog';
import {
  addDays,
  formatHM,
  daysBetween,
  isoDate,
  logicalToday,
  PASTEL_PALETTE,
  resolveTint,
} from '@/lib/utils';
import { isLoggableDuration } from '@/lib/session-safety';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  cleanTaskTitle,
} from '@/lib/planner-safety';
import { useTimer } from '@/lib/timer-context';
import HandNote from '@/components/notebook/HandNote';
import WeeklyGoalSlider from '@/components/WeeklyGoalSlider';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  useActiveSemester,
  useUserSettings,
  addCourseOptimistic,
  addTaskOptimistic,
  toggleTaskOptimistic,
  skipTaskOptimistic,
  updateTaskOptimistic,
} from '@/lib/data-hooks';

/** The quiet uppercase caption every other form in the app labels a field with. */
function SheetField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow mb-2.5 block text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardPageContent />
    </Suspense>
  );
}

// useSearchParams opts the tree into dynamic rendering, so it needs a
// boundary above it or the build fails to prerender this route. Same fix as
// the Tasks page.
function DashboardFallback() {
  return (
    <PageShell>
      <LoadingIndicator compact label="Loading your planner" className="mb-6" />
    </PageShell>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active, start, pause, resume, focusSeconds } = useTimer();
  const { notify } = useNotice();
  const { offer } = useUndo();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses: rawCourses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { semester } = useActiveSemester();
  const { settings } = useUserSettings();
  const [prefs, updatePrefs] = usePreferences();

  const courses = rawCourses;
  const sessions = useMemo(
    () => rawSessions.filter((s) => isLoggableDuration(s.durationSeconds)),
    [rawSessions],
  );

  const displayName = settings?.displayName ?? '';
  const avatarUrl = settings?.avatarUrl ?? '';

  // Onboarding gate / auth redirect, fires once SWR has resolved the flag.
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
    onboardingLoading ||
    onboarded === false ||
    coursesLoading ||
    sessionsLoading ||
    tasksLoading;


  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskHigh, setNewTaskHigh] = useState(false);
  const newTaskKind = useKindDraft();

  // Set while a running timer stands between a tap and the timer screen.
  /** The play mark that opened the start popover, and what it points at. */
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);

  const [pendingTimer, setPendingTimer] = useState<{
    courseId: string;
    taskId: string | null;
  } | null>(null);

  // True while a sheet's own write is in flight, so its button can say so
  // and cannot be pressed a second time.
  const [savingTask, setSavingTask] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);

  const [addingCourse, setAddingCourse] = useState(false);
  // One search box drives the whole thing. `picked` is set only when a
  // catalog suggestion was chosen; everything else is a manual course.
  const [courseQuery, setCourseQuery] = useState('');
  const [pickedCourse, setPickedCourse] = useState<CatalogCourse | null>(null);
  const [newCourseSection, setNewCourseSection] = useState('');
  // Shown only when the typed text can't supply one, so the common case
  // stays a single field. There is no matching field for the code: a course
  // typed by name gets one derived from it.
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseColor, setNewCourseColor] = useState(PASTEL_PALETTE[0].value);
  const [newCourseTint, setNewCourseTint] = useState(PASTEL_PALETTE[0].tint);
  const [newCourseGoal, setNewCourseGoal] = useState(8);

  function beginTimer(courseId: string, taskId: string | null) {
    start(courseId, taskId);
    router.push('/timer');
  }

  function handleStartTimerForTask(task: Task) {
    handleStartTimer(task.courseId, task.id);
  }

  function handleStartTimer(courseId: string, taskId: string | null = null) {
    // A timer already running on something else would be discarded, which is
    // the one thing here worth stopping to ask about.
    if (active && (active.courseId !== courseId || active.taskId !== taskId)) {
      setPendingTimer({ courseId, taskId });
      return;
    }
    beginTimer(courseId, taskId);
  }

  async function handleSkipTask(task: Task) {
    try {
      await skipTaskOptimistic(task);
      offer(skippedUndo(task));
    } catch (error) {
      console.error('Failed to skip task:', error);
      notify(error instanceof Error && error.message.startsWith('Skip') ? error.message : 'That task did not skip.');
    }
  }

  async function handleToggleTask(task: Task) {
    try {
      await toggleTaskOptimistic(task);
      if (!task.completed) offer(finishedUndo(task));
    } catch (error) {
      console.error('Failed to update task:', error);
      notify('That task did not update.');
    }
  }

  /**
   * Every play mark on this screen opens the same popover. A task carries its
   * own course; a course row passes one explicitly and leaves the task null.
   * `untimed` is the "Untimed" button beside Start, which skips the length
   * picker and goes straight to a session with no target. It is not the same
   * idea as an open-ended task, which is one carrying no due date.
   */
  function openStartFor(
    task: Task | null,
    anchor: HTMLElement,
    untimed: boolean,
    course?: Course,
  ) {
    const resolved = course ?? courses.find((c) => c.id === task?.courseId);
    if (!resolved) return;
    if (untimed) {
      if (active && (active.courseId !== resolved.id || active.taskId !== (task?.id ?? null))) {
        setPendingTimer({ courseId: resolved.id, taskId: task?.id ?? null });
        return;
      }
      start(resolved.id, task?.id ?? null, null);
      router.push('/timer');
      return;
    }
    setStartTarget({ task, course: resolved, anchor });
  }

  /** "Open ended": the task stays, the date comes off. */
  async function handleOpenEndTask(task: Task) {
    if (!task.dueDate) return;
    try {
      await updateTaskOptimistic(task.id, { dueDate: null });
    } catch (error) {
      console.error('Failed to clear the due date:', error);
      notify('That date did not come off.');
    }
  }

  /** "Tomorrow": the same move the row menu calls Reschedule. */
  async function handleToggleStep(task: Task, stepId: string) {
    const subtasks = (task.subtasks ?? []).map((step) =>
      step.id === stepId ? { ...step, completed: !step.completed } : step,
    );
    try {
      await updateTaskOptimistic(task.id, { subtasks });
    } catch {
      notify('That step did not save.');
    }
  }

  async function handleSnoozeTask(task: Task) {
    try {
      await updateTaskOptimistic(task.id, { dueDate: addDays(isoDate(), 1) });
    } catch (error) {
      console.error('Failed to reschedule task:', error);
      notify('That task did not move.');
    }
  }

  /**
   * Pull the whole overdue pile onto today. Nine separate writes would be
   * nine separate chances to half-fail, so a rejection is reported once and
   * the rows that did land stay landed.
   */
  async function handleRescheduleOverdue() {
    const todayIso = isoDate();
    const stale = tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < todayIso);
    if (stale.length === 0) return;
    try {
      await Promise.all(stale.map((t) => updateTaskOptimistic(t.id, { dueDate: todayIso })));
      notify(`Moved ${stale.length} ${stale.length === 1 ? 'task' : 'tasks'} to today.`);
    } catch (error) {
      console.error('Failed to reschedule overdue tasks:', error);
      notify('Some of those did not move.');
    }
  }

  async function handleAddTask() {
    const title = cleanTaskTitle(newTaskTitle);
    if (!addingTaskFor || !title || savingTask) return;
    setSavingTask(true);
    try {
      await addTaskOptimistic({
        courseId: addingTaskFor,
        title,
        dueDate: newTaskDue || null,
        priority: newTaskHigh ? 'high' : 'normal',
        ...newTaskKind.fields(title),
      });
      setAddingTaskFor(null);
      setNewTaskTitle('');
      setNewTaskDue('');
      setNewTaskHigh(false);
      newTaskKind.reset();
    } catch (error) {
      console.error('Failed to add task:', error);
      notify('That task was not added.');
    } finally {
      setSavingTask(false);
    }
  }

  function openAddCourse() {
    const used = new Set(courses.map((c) => c.color));
    const next =
      PASTEL_PALETTE.find((p) => !used.has(p.value)) ||
      PASTEL_PALETTE[courses.length % PASTEL_PALETTE.length];
    setCourseQuery('');
    setPickedCourse(null);
    setNewCourseSection('');
    setNewCourseName('');
    setNewCourseColor(next.value);
    setNewCourseTint(next.tint);
    setNewCourseGoal(8);
    setAddingCourse(true);
  }

  // Settings sends a reader here to add a course, because the catalog search
  // and the section picker live on this sheet and nowhere else. Waiting for
  // courses to load matters: openAddCourse picks the next unused pastel off
  // the list, and on an empty list every course would arrive the same colour.
  // The param is cleared on arrival so a second trip from settings fires
  // again, and the ref stops an SWR revalidation reopening the sheet in
  // between.
  const handledAddCourseIntent = useRef(false);
  useEffect(() => {
    // The guard is armed only while the param is present. Settings is
    // rendered from this page, so arriving here does not remount it: a ref
    // left latched would swallow every trip after the first, and one cleared
    // straight away would let an SWR revalidation reopen the sheet in the
    // window before the URL settles.
    if (searchParams.get('add') !== 'course') {
      handledAddCourseIntent.current = false;
      return;
    }
    if (handledAddCourseIntent.current || coursesLoading) return;
    handledAddCourseIntent.current = true;
    openAddCourse();
    router.replace('/dashboard', { scroll: false });
    // openAddCourse reads courses and the palette, both already in scope, and
    // is stable for the life of the render, so it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, coursesLoading, router]);

  /**
   * A catalog pick supplies code/title/credits directly, and the chosen
   * section fills in its instructor and meeting time; anything else is read
   * out of whatever was typed, so submitting without touching the
   * suggestions still creates a normal manual course.
   */
  function resolveNewCourse() {
    if (pickedCourse) return courseFromCatalog(pickedCourse, newCourseSection);
    const parsed = parseCourseInput(courseQuery);
    const name = cleanCourseName(newCourseName || parsed.name);
    return {
      // Nobody is asked to type a code: one comes off the front of what was
      // typed, or is built from the name, and only the card ever shows it.
      code: cleanCourseCode(parsed.code || uniqueCourseCode(deriveCourseCode(name))),
      name,
      credits: 4,
      section: newCourseSection || null,
      instructor: null,
      meetingTime: null,
    };
  }

  /** Keeps a derived code from colliding with one already on the list. */
  function uniqueCourseCode(base: string) {
    if (!base) return '';
    const taken = new Set(courses.map((course) => cleanCourseCode(course.code)));
    if (!taken.has(base)) return base;
    let suffix = 2;
    while (taken.has(`${base} ${suffix}`)) suffix += 1;
    return `${base} ${suffix}`;
  }

  const draftCourse = resolveNewCourse();
  const canAddCourse = Boolean(draftCourse.name);
  // Everything the catalog and the chosen section supplied, in the order the
  // course card itself reads them.
  const draftPreviewDetail = [
    draftCourse.section && `Sec ${draftCourse.section}`,
    typeof draftCourse.credits === 'number' && `${draftCourse.credits} cr`,
    draftCourse.instructor,
    draftCourse.meetingTime,
  ]
    .filter(Boolean)
    .join(' · ');

  async function handleAddCourse() {
    const draft = resolveNewCourse();
    if (!draft.code || !draft.name || savingCourse) return;
    if (courses.some((course) => cleanCourseCode(course.code) === draft.code)) {
      notify(`${draft.code} is already on your list.`);
      return;
    }
    setSavingCourse(true);
    try {
      await addCourseOptimistic({
        ...draft,
        color: newCourseColor,
        tint: newCourseTint,
        weeklyGoalHours: clampWeeklyGoalHours(newCourseGoal),
      });
      setAddingCourse(false);
    } catch (error) {
      console.error('Failed to add course:', error);
      // Surface the real reason, most often a duplicate course code the
      // database rejected, which the user can act on.
      notify(error instanceof Error ? error.message : 'That course was not added.');
    } finally {
      setSavingCourse(false);
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

  // Reads through the same SWR caches as everything above, so it costs no
  // request. See lib/progression for why none of it is stored.
  const { progression } = useProgression();
  const run = progression?.runs.current ?? 0;
  /* The sitting on the clock, folded into what the panels draw. The hour
     strokes fill, the week's bar grows and "2h to go" counts down while the
     reader sits, rather than all of it jumping at once when the sitting is
     logged. Only the drawings read this list; anything that decides
     something (what is up next, which course has gone quiet) still reads
     the record. */
  const live = useLiveSession();
  const shownSessions = useMemo(() => withLiveSession(sessions, live), [sessions, live]);
  /* What is due to be recalled, within the day's few. Reads the same caches
     as everything above, plus the recall rows. */
  const { reading: recall, available: recallAvailable } = useRecall();

  /** After a slip, back to the material: the task it came from, or the course. */
  function studyRecall(state: RecallState, anchor: HTMLElement) {
    const course = courses.find((c) => c.id === state.courseId);
    if (!course) return;
    openStartFor(state.task, anchor, false, course);
  }



  if (loading) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Loading your planner" className="mb-6" />
        <div className="animate-pulse opacity-40" aria-hidden>
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="h-3 w-16 bg-line rounded mb-2.5" />
              <div className="h-8 w-32 bg-line rounded mb-3" />
              <div className="h-4 w-48 bg-line rounded" />
            </div>
            <div className="h-10 w-10 bg-line rounded-full" />
          </div>
          <div className="h-24 bg-paper border border-line rounded-[14px] mb-8" />
          <div className="flex flex-col gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-paper border border-line rounded-[14px]" />
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  const today = isoDate();
  const todayTasks = tasks.filter((t) => !t.completed && t.dueDate === today);
  const overdueTasks = tasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate < today,
  );
  // The reader's day, not the wall clock's: at 3am with a day that ends at
  // 8, the page's hours are still yesterday's and so is its date.
  const now = logicalToday();
  /* "Sat, Sep 19, 2026" is how a receipt writes a date. The app writes it
     the way a diary does, so the parts are assembled rather than handed to
     toLocaleDateString whole. */
  const dateLine = [
    now.toLocaleDateString(undefined, { weekday: 'short' }),
    now.getDate(),
    now.toLocaleDateString(undefined, { month: 'short' }),
    now.getFullYear(),
  ].join(' ');
  /* The one task the screen asks for. Which one depends on the reader's rule,
     see pickUpNext: by default whatever a timer last ran on and is still
     open, else the course that has gone longest without a session, or the
     oldest overdue thing if they have said they want that.

     upNextFrom passes the open tasks too, because the resumed task is the one
     pick that can sit outside the overdue/due-today pool: work you were in
     the middle of an hour ago is live whether or not it happens to be due.
     The rail's start reads the same function, so the two never disagree. */
  const upNext = upNextFrom(tasks, sessions, prefs.upNextSort, today);
  const dueTodayRest = todayTasks.filter((t) => t.id !== upNext?.id);
  // What Up next would offer once this one is off the list, named under it.
  const thenTask = upNext
    ? upNextFrom(tasks.filter((t) => t.id !== upNext.id), sessions, prefs.upNextSort, today)
    : null;
  // Dates are optional on a semester now (Settings → Semester lets you start
  // one with just a label). No dates just means no progress ribbon to show.
  const semesterInfo =
    semester?.startDate && semester?.endDate
      ? getSemesterInfo(semester.startDate, semester.endDate, today)
      : null;

  return (
    <PageShell wide>
      {/* The page header. The date is a line of data above the title rather
          than the title itself, "New task" lives here now that the floating
          button is gone, and search is a field rather than an icon. */}
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="m-0 mb-1.5 font-serif italic text-[13.5px] text-muted">
            {dateLine}
            {semesterInfo && (
              <>
                {' · '}Week {semesterInfo.currentWeek} of {semesterInfo.totalWeeks}
                {' · '}
                {semesterInfo.daysRemaining} days left
              </>
            )}
          </p>
          <h1 className="m-0 font-serif text-[32px] font-medium leading-[1.05] tracking-[-0.025em] md:text-[36px]">
            Today
          </h1>
          {/* A note in the margin about how this reader studies, in their
              own hand. Nothing until the term has taught the app something;
              see lib/progression/observations.ts. */}
          <Marginalia className="mt-2.5" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/tasks?search=1')}
            className="hidden h-10 w-[260px] items-center gap-2 rounded-[10px] border border-line bg-paper px-3 text-[13px] text-muted transition-colors hover:border-line-strong md:flex"
          >
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4-4" />
            </svg>
            <span className="flex-1 text-left">Search tasks</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (courses.length === 0) openAddCourse();
              else {
                newTaskKind.reset();
                setAddingTaskFor(courses[0].id);
              }
            }}
            className="h-10 rounded-[10px] border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            New task
          </button>
          {/* The way into Settings on a phone: the reader's own initials or
              photo, a link to the same /settings page the rail opens. It was
              a sliders icon that read as a filter and opened a second, older
              Settings of its own. Desktop has the rail's row instead. */}
          <Link
            href="/settings"
            aria-label="Settings"
            className="grid h-10 w-10 shrink-0 place-items-center md:hidden"
          >
            <ReaderAvatar avatarUrl={avatarUrl} displayName={displayName} />
          </Link>
        </div>
      </header>

      {courses.length === 0 ? (
        <EmptyPanel action="Add a course" onAction={openAddCourse} />
      ) : (
        <>
        {/* The head band. Up next is the one thing that spans the page, and
            today's hours sit beside it, since Start is what fills them. The
            pad's double rule closes the band; nothing below it is boxed. */}
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_288px] xl:gap-x-[81px]">
          <div className="min-w-0">
            {upNext ? (
              <UpNext
                task={upNext}
                course={courses.find((c) => c.id === upNext.courseId)}
                onStart={(task, el, untimed) => openStartFor(task, el, untimed)}
                onDone={handleToggleTask}
                onSnooze={handleSnoozeTask}
                onOpen={(task) => router.push(`/tasks?task=${encodeURIComponent(task.id)}`)}
                sort={prefs.upNextSort}
                onSortChange={(upNextSort) => updatePrefs({ upNextSort })}
                sessions={shownSessions}
                onToggleStep={handleToggleStep}
                then={
                  thenTask
                    ? { task: thenTask, course: courses.find((c) => c.id === thenTask.courseId) }
                    : null
                }
              />
            ) : !tasksLoading && tasks.length === 0 ? (
              <GettingStarted
                course={courses[0]}
                hasSessions={rawSessions.length > 0}
                onAddTask={() => {
                  newTaskKind.reset();
                  setAddingTaskFor(courses[0].id);
                }}
                onStart={(el) => openStartFor(null, el, false, courses[0])}
              />
            ) : (
              <section>
                <p className="eyebrow m-0 text-ink-soft">Up next</p>
                <p className="m-0 mt-3 font-serif text-[20px] text-ink-soft">
                  Nothing overdue and nothing due today.
                </p>
                <p className="m-0 mt-2 text-[13px] text-muted">
                  A clean page. Start a course timer when you are ready.
                </p>
              </section>
            )}

            {/* The rest of the day's work sits under Up next, in the same
                column: the recall card, Overdue and Due today are what Start
                is for after this one. Below the fold they left the band's
                left half empty for as long as the hours ran beside it. */}
            <div className="settle-in mt-8 flex flex-col divide-y divide-line border-t border-line empty:hidden [&>*:last-child]:pb-0 [&>*]:py-7">
            {/* Recall. A few things from the term to bring back with the book
                shut, and nothing at all on a day with none due. Under Up next
                rather than over it: it is a few minutes, and the day's work
                is still the day's work. See lib/recall. */}
            <RecallDeck
              states={recall?.queue ?? []}
              courses={courses}
              closing="That's today's recall."
              onStudy={studyRecall}
              available={recallAvailable}
            />

            {overdueTasks.length > 0 && (
              <TaskSection
                title="Overdue"
                count={overdueTasks.length}
                countTone="warn"
                action={
                  <button
                    type="button"
                    onClick={handleRescheduleOverdue}
                    className="-my-3 -mr-2.5 h-10 rounded-[10px] px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
                  >
                    Reschedule all to today
                  </button>
                }
              >
                {overdueTasks.slice(0, 5).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    course={courses.find((c) => c.id === task.courseId)}
                    {...timerRowProps(task)}
                    onToggle={handleToggleTask}
                    onStartTimer={(t, el) => openStartFor(t, el, false)}
                    onOpen={(t) => router.push(`/tasks?task=${encodeURIComponent(t.id)}`)}
                    onReschedule={handleSnoozeTask}
                    onOpenEnded={handleOpenEndTask}
                    onSkip={handleSkipTask}
                    ground="page"
                  />
                ))}
                {overdueTasks.length > 5 && (
                  <Link
                    href="/tasks?filter=overdue"
                    className="flex h-11 items-center justify-center text-[12px] text-muted no-underline hover:text-ink"
                  >
                    {overdueTasks.length - 5} more overdue
                  </Link>
                )}
              </TaskSection>
            )}

            {/* The rest of what is due today. Up next already carries one of
                them, and a section repeating it as its only row said the same
                thing twice. */}
            {dueTodayRest.length > 0 && (
              <TaskSection title="Due today" count={dueTodayRest.length}>
                {dueTodayRest.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    course={courses.find((c) => c.id === task.courseId)}
                    {...timerRowProps(task)}
                    onToggle={handleToggleTask}
                    onStartTimer={(t, el) => openStartFor(t, el, false)}
                    onOpen={(t) => router.push(`/tasks?task=${encodeURIComponent(t.id)}`)}
                    onReschedule={handleSnoozeTask}
                    onOpenEnded={handleOpenEndTask}
                    onSkip={handleSkipTask}
                    ground="page"
                  />
                ))}
              </TaskSection>
            )}

            </div>
          </div>
          <div className="mt-8 xl:mt-0">
            <TodayHours
              sessions={shownSessions}
              courses={courses}
              goalHours={settings?.dailyGoalHours ?? 4}
            />
            {/* The week against its goal, at the same size as the day: it is
                one of the two numbers Today is read for. */}
            <div className="mt-7 border-t border-line pt-7">
              <WeekHours courses={courses} sessions={shownSessions} />
            </div>
            {/* Next Mark. One quiet line naming the nearest true thing, and
                nothing when nothing is close. A reward line rather than a
                to-do, so it sits under the hours it comes from, not over Up
                next; and it waits for the first session, since before that
                it is a distance to a tally nobody has met. */}
            {!sessionsLoading && rawSessions.length > 0 && (
              <div className="mt-4">
                <NextMarkLine surface="today" href="/stamps" />
              </div>
            )}
          </div>
        </div>
        <div aria-hidden className="fold my-8 md:mb-9" />

        {/* Below the fold, two columns and a pencil rule between them: the
            day's work on the left, the readings on the right. Each story
            ends on a cutoff rule rather than inside a box. Below xl it is one
            column in reading order. */}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start xl:grid-cols-[minmax(0,1fr)_288px] xl:gap-x-[81px]">
          <div className="settle-in flex min-w-0 flex-col divide-y divide-line [&>*]:py-7 [&>*:first-child]:pt-0">

            {/* The courses: each one's hours this week against its goal and
                what it has open, a row of four under the fold. */}
            <CourseLine courses={courses} sessions={shownSessions} tasks={tasks} />
          </div>

          {/* The readings: what is coming, the week, and the two numbers that
              only matter in passing. The pencil column rule belongs to them,
              so it ends where they do. */}
          <aside className="relative mt-7 border-t border-line pt-7 xl:sticky xl:top-10 xl:mt-0 xl:border-t-0 xl:pt-0 xl:before:absolute xl:before:-left-[41px] xl:before:inset-y-0 xl:before:w-px xl:before:bg-line xl:before:content-['']">
            <div className="settle-in flex flex-col divide-y divide-line [&>*]:py-7 [&>*:first-child]:pt-0">
            <ComingPanel
              tasks={tasks}
              courses={courses}
              sessions={sessions}
              recall={recall}
              onOpen={(task) => router.push(`/tasks?task=${encodeURIComponent(task.id)}`)}
            />
            <BeforeExamPanel tasks={tasks} courses={courses} />
            </div>
            <div className="mt-7 flex items-baseline justify-between font-serif text-[12.5px] italic text-muted">
              {/* Continuity is measured in weeks now, not days. A daily
                  streak asks a student to study on the Saturday of a wedding
                  and then punishes them for the wedding. */}
              <span>
                <span className="font-mono text-[11px] not-italic tabular-nums text-ink">{run}</span>{' '}
                {run === 1 ? 'week' : 'weeks'} running
              </span>
              {semesterInfo && (
                <span>
                  day{' '}
                  <span className="font-mono text-[11px] not-italic tabular-nums text-ink">
                    {semesterInfo.totalWeeks * 7 - semesterInfo.daysRemaining} / {semesterInfo.totalWeeks * 7}
                  </span>{' '}
                  of the term
                </span>
              )}
            </div>
            {/* The term as a row of weeks: the ones behind, the one this is,
                and what is left. A count of weeks, never a percentage. */}
            {semesterInfo && semesterInfo.totalWeeks > 0 && (
              <div aria-hidden className="mt-2.5 flex gap-1">
                {Array.from({ length: semesterInfo.totalWeeks }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 flex-1 rounded-[2px] ${
                      i + 1 < semesterInfo.currentWeek ? 'bg-ink-soft' : i + 1 === semesterInfo.currentWeek ? '' : 'bg-bg-tint'
                    }`}
                    style={i + 1 === semesterInfo.currentWeek ? { background: 'var(--highlight-yellow)' } : undefined}
                  />
                ))}
              </div>
            )}
          </aside>
        </div>
        </>
      )}

      <StartTimerPopover target={startTarget} onClose={() => setStartTarget(null)} />

      {/* Quick task modal */}
      <Leaving value={addingTaskFor}>{(addingTaskFor, leaving) => (
        <div className={`sheet-lift fixed inset-0 z-[80] flex items-end ${leaving ? 'sheet-leaving' : 'animate-fade-in'}`}>
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setAddingTaskFor(null)}
            className="absolute inset-0 scrim backdrop-blur-sm"
          />
          <div className="relative w-full md:mx-auto md:max-w-xl bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />
            {/* Which course it goes under. The sheet opens on the first
                course, and with no way to change it every task added from
                Today landed there, so with more than one course it offers
                the rest. */}
            {courses.length > 1 ? (
              <div
                className="app-scroll -mx-6 flex gap-1 overflow-x-auto px-6 md:flex-wrap"
                role="radiogroup"
                aria-label="Course"
              >
                {courses.map((c) => {
                  const on = c.id === addingTaskFor;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setAddingTaskFor(c.id)}
                      className={`flex h-9 shrink-0 items-center gap-2 rounded-[8px] px-2.5 text-[12.5px] transition-colors first:-ml-2.5 ${
                        on ? 'text-ink' : 'text-ink-soft hover:bg-bg-tint hover:text-ink'
                      }`}
                    >
                      <span aria-hidden className="course-rule !w-3.5" style={{ ['--c' as string]: c.color }} />
                      <span
                        className={on ? 'hl-swipe' : ''}
                        style={on ? ({ '--hl': resolveTint(c.color, c.tint) } as React.CSSProperties) : undefined}
                      >
                        {c.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              (() => {
                const course = courses.find((c) => c.id === addingTaskFor);
                return course ? (
                  <p className="eyebrow m-0" style={{ color: course.color }}>
                    {course.code}
                  </p>
                ) : null;
              })()
            )}
            <h3 className="mt-1 mb-1.5 font-serif font-medium text-[22px] tracking-[-0.01em]">
              New task
            </h3>
            <p className="mt-0 mb-4 text-[13px] text-muted font-serif italic">
              A small thing to remember.
            </p>
            <input
              autoFocus
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Task title"
              className="w-full bg-paper border border-line rounded-[10px] px-4 py-3 text-sm font-serif italic text-ink outline-none focus:border-line-strong"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTask();
              }}
            />
            {/* Task, Reading or Exam, picked from the title until picked by
                hand: a reading is what gets turned into hours and asked
                about later, so the form says it knows the difference. */}
            <div className="mt-2.5">
              <KindFields draft={newTaskKind} title={newTaskTitle} />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <DatePicker
                value={newTaskDue}
                onChange={setNewTaskDue}
                placeholder="Due date"
                clearLabel="Open ended"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setNewTaskHigh((v) => !v)}
                aria-pressed={newTaskHigh}
                className="flex items-center gap-2 bg-transparent px-1 py-2"
              >
                <span className="scribble-box flex h-4 w-4 items-center justify-center">
                  {newTaskHigh && <HandCheck size={11} color="var(--priority)" strokeWidth={1.6} />}
                </span>
                <span
                  className={`font-hand text-[15px] ${newTaskHigh ? 'text-priority' : 'text-muted-soft'}`}
                >
                  !! high
                </span>
              </button>
            </div>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setAddingTaskFor(null)}
                className="flex-1 py-3.5 rounded-[10px] bg-transparent border border-line-strong text-ink-soft text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newTaskTitle.trim() || savingTask}
                onClick={handleAddTask}
                className="flex-1 py-3.5 rounded-[10px] bg-primary text-primary-contrast text-sm font-medium disabled:opacity-30"
              >
                {savingTask ? (
                  <span className="flex items-center justify-center gap-2">
                    <ButtonSpinner />
                    Adding
                  </span>
                ) : (
                  'Add task'
                )}
              </button>
            </div>
          </div>
        </div>
      )}</Leaving>

      {/* Add course sheet */}
      <Leaving value={addingCourse}>{(_open, leaving) => (
        <div className={`sheet-lift fixed inset-0 z-[80] flex items-end ${leaving ? 'sheet-leaving' : 'animate-fade-in'}`}>
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setAddingCourse(false)}
            className="absolute inset-0 scrim backdrop-blur-sm"
          />
          <div className="relative w-full md:mx-auto md:max-w-xl bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />
            <h3 className="mt-0 mb-1.5 font-serif font-medium text-[22px] tracking-[-0.01em]">
              Add a course
            </h3>
            <p className="mt-0 mb-4 text-[13px] text-muted font-serif italic">
              One more to the list.
            </p>

            <div className="flex flex-col gap-[18px]">
              <SheetField label="Course">
                <CourseSearchInput
                  autoFocus
                  query={courseQuery}
                  onQueryChange={(v) => {
                    setCourseQuery(v);
                    // The typed text is the source of truth again, so drop any
                    // name the user had filled into the fallback field.
                    setNewCourseName('');
                  }}
                  picked={pickedCourse}
                  onPick={(course) => {
                    setPickedCourse(course);
                    setNewCourseSection('');
                    if (course?.credits) setNewCourseGoal(weeklyGoalForCredits(course.credits));
                  }}
                  section={newCourseSection}
                  onSectionChange={setNewCourseSection}
                  accent={newCourseColor}
                  accentTint={newCourseTint}
                  onSubmit={handleAddCourse}
                />

                {/* A code alone ("CS 200") is the one thing that leaves nothing
                    to name the course by, so that is the only follow-up field. */}
                {!pickedCourse && courseQuery.trim().length > 0 && !canAddCourse && (
                  <input
                    type="text"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="Course name"
                    className="mt-2.5 w-full bg-paper border border-line rounded-[10px] px-4 py-3 text-sm font-serif italic text-ink outline-none focus:border-line-strong animate-fade-in"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCourse(); }}
                  />
                )}
              </SheetField>

              <SheetField label="Accent colour">
                <div className="flex flex-wrap gap-2.5">
                  {PASTEL_PALETTE.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      aria-label={p.name}
                      onClick={() => { setNewCourseColor(p.value); setNewCourseTint(p.tint); }}
                      className="w-8 h-8 touch:h-10 touch:w-10 rounded-full border-0 transition-transform"
                      style={{
                        background: p.value,
                        boxShadow: newCourseColor === p.value
                          ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${p.value}`
                          : 'none',
                        transform: newCourseColor === p.value ? 'scale(1.05)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </SheetField>

              <SheetField label="Weekly study goal">
                <WeeklyGoalSlider
                  value={newCourseGoal}
                  onChange={setNewCourseGoal}
                  credits={draftCourse.credits}
                  label="Weekly study goal for this course"
                />
              </SheetField>

              {/* The same card the course is about to become, so the colour,
                  the code and whatever the catalog filled in are seen rather
                  than described. */}
              {canAddCourse && (
                <div className="relative overflow-hidden rounded-[14px] border border-line bg-paper animate-fade-in">
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ background: newCourseColor }}
                  />
                  <div className="py-3.5 pl-5 pr-4">
                    <p
                      className="eyebrow m-0"
                      style={{ color: newCourseColor }}
                    >
                      {draftCourse.code}
                    </p>
                    <h4 className="mt-1 mb-0 font-serif font-medium text-[17px] tracking-[-0.01em]">
                      {draftCourse.name}
                    </h4>
                    {draftPreviewDetail && (
                      <p className="mt-1.5 mb-0 font-serif text-[11px] italic leading-[1.5] text-muted">
                        {draftPreviewDetail}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setAddingCourse(false)}
                className="flex-1 py-3.5 rounded-[10px] bg-transparent border border-line-strong text-ink-soft text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canAddCourse || savingCourse}
                onClick={handleAddCourse}
                className="flex-1 py-3.5 rounded-[10px] bg-primary text-primary-contrast text-sm font-medium disabled:opacity-30"
              >
                {savingCourse ? (
                  <span className="flex items-center justify-center gap-2">
                    <ButtonSpinner />
                    Adding
                  </span>
                ) : (
                  'Add course'
                )}
              </button>
            </div>
          </div>
        </div>
      )}</Leaving>

      <ConfirmSheet
        open={pendingTimer !== null}
        title="Start this one instead?"
        body="The timer already running will be discarded."
        confirmLabel="Start"
        cancelLabel="Keep going"
        onCancel={() => setPendingTimer(null)}
        onConfirm={() => {
          if (pendingTimer) beginTimer(pendingTimer.courseId, pendingTimer.taskId);
          setPendingTimer(null);
        }}
      />

    </PageShell>
  );
}

function getSemesterInfo(startDate: string, endDate: string, today: string) {
  const totalDays = Math.max(1, daysBetween(startDate, endDate) + 1);
  const elapsedDays = Math.min(Math.max(0, daysBetween(startDate, today) + 1), totalDays);
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)));
  const daysRemaining = Math.max(0, daysBetween(today, endDate));
  return {
    totalWeeks,
    currentWeek,
    daysRemaining,
    percent: Math.round((elapsedDays / totalDays) * 100),
  };
}

/**
 * Up next for a term with nothing in it yet. It used to say "Nothing overdue
 * and nothing due today. A clean page.", which to someone who has put no
 * deadlines in reads as all caught up. It says what the space is for and the
 * two ways to fill it, and goes the moment the first task exists.
 */
function GettingStarted({
  course,
  hasSessions,
  onAddTask,
  onStart,
}: {
  course: Course;
  hasSessions: boolean;
  onAddTask: () => void;
  onStart: (anchor: HTMLElement) => void;
}) {
  const claude = useClaudeSheet();
  const { courses } = useCourses();
  const courseCodes = courses.map((c) => c.code);
  return (
    <section>
      <p className="eyebrow m-0 text-ink-soft">Up next</p>
      <p className="m-0 mt-3 max-w-[560px] font-serif text-[22px] leading-[1.3] tracking-[-0.01em] text-ink">
        Put in what&apos;s due, and this is where Akada tells you what to do next.
      </p>
      <p className="m-0 mt-2 max-w-[520px] font-serif text-[14px] italic leading-[1.55] text-muted">
        Quickest is to hand Claude your course outlines and let it write every deadline
        in. Or add them one at a time.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            claude.ask({
              does: 'Claude reads your course outlines and puts every deadline into Akada, with its date and weight.',
              prompt: outlinePrompt(courseCodes),
            })
          }
          className="inline-flex h-11 items-center rounded-[10px] bg-primary px-4 text-[13px] font-medium text-primary-contrast"
        >
          Get them in with Claude
        </button>
        <button
          type="button"
          onClick={onAddTask}
          className="h-11 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
        >
          Add a deadline
        </button>
      </div>
      {!hasSessions && (
        <p className="m-0 mt-5 flex flex-wrap items-center gap-x-1.5 font-serif text-[14px] text-ink-soft">
          Studying right now?
          <button
            type="button"
            onClick={(event) => onStart(event.currentTarget)}
            className="hand-underline bg-transparent px-0.5 text-ink"
          >
            Start a timer on {course.code}
          </button>
          <span className="italic text-muted">and the hours start counting.</span>
        </p>
      )}
    </section>
  );
}

function EmptyPanel({ action, onAction }: { action: string; onAction: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="m-0 font-serif text-[16px] italic text-muted-soft">
        The page is blank. Add your first course...
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-1 self-start rounded-full border border-dashed border-line-strong bg-transparent px-3.5 py-2 font-serif text-[13px] text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden className="text-[14px] leading-none font-light">+</span>
        {action}
      </button>
    </div>
  );
}


/**
 * A titled block of task rows. The heading carries its own count and, where
 * there is one, the action that applies to the whole group.
 */
function TaskSection({
  title,
  count,
  countTone,
  action,
  children,
}: {
  title: string;
  count: number;
  countTone?: 'warn';
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <p className="eyebrow m-0">
          {title}
          <span
            className={`ml-1.5 font-mono tracking-normal ${
              countTone === 'warn' ? 'text-warn' : 'text-ink-soft'
            }`}
          >
            {count}
          </span>
        </p>
        {action}
      </div>
      {/* No box: the rows are written on the page with a hairline between
          them, and the cutoff under the section ends it. */}
      <div className="-mx-[15px]">{children}</div>
    </section>
  );
}

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import CourseCard from '@/components/CourseCard';
import TaskRow from '@/components/TaskRow';
import StartTimerPopover, { type StartTarget } from '@/components/StartTimerPopover';
import {
  ComingPanel,
  CoursesWeekPanel,
  TodayHours,
  UpNext,
  WeekPanel,
} from '@/components/today/TodayPanels';
import CourseReorderList from '@/components/dashboard/CourseReorderList';
import DatePicker from '@/components/DatePicker';
import SettingsSheet from '@/components/SettingsSheet';
import LoadingIndicator, { ButtonSpinner } from '@/components/LoadingIndicator';
import ConfirmSheet from '@/components/ConfirmSheet';
import HandCheck from '@/components/notebook/HandCheck';
import { useNotice } from '@/components/Notice';
import CourseSearchInput from '@/components/CourseSearchInput';
import type { Course, Session, Task } from '@/lib/data';
import { db } from '@/lib/data';
import { createClient } from '@/lib/supabase';
import { clearClientSessionState } from '@/lib/session-cleanup';
import { isUploadedImage, resizeAvatar } from '@/lib/avatar';
import type { CatalogCourse } from '@/lib/catalog';
import { deriveCourseCode, parseCourseInput } from '@/lib/catalog';
import {
  formatHM,
  daysBetween,
  isoDate,
  sessionsForDate,
  studyStreakDays,
  PASTEL_PALETTE,
  totalSeconds,
} from '@/lib/utils';
import { isLoggableDuration } from '@/lib/session-safety';
import {
  clampWeeklyGoalHours,
  cleanCredits,
  cleanCourseCode,
  cleanCourseName,
  cleanInstructor,
  cleanMeetingTime,
  cleanSection,
  cleanTaskTitle,
  hasDuplicateCourseCodes,
  MEETING_TIME_MAX,
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
  deleteCourseOptimistic,
  toggleTaskOptimistic,
  updateTaskOptimistic,
  updateCourseOptimistic,
  updateUserSettingsOptimistic,
  resetAllData,
  deleteAccountAndData,
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

type CourseEditDraft = {
  id: string;
  code: string;
  name: string;
  credits: string;
  section: string;
  instructor: string;
  meetingTime: string;
  weeklyGoalHours: number;
};

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
  const { active, start, clearTimerState } = useTimer();
  const { notify } = useNotice();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses: rawCourses, isLoading: coursesLoading, revalidate: revalidateCourses } =
    useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { semester } = useActiveSemester();
  const { settings } = useUserSettings();

  const courses = rawCourses;
  const sessions = useMemo(
    () => rawSessions.filter((s) => isLoggableDuration(s.durationSeconds)),
    [rawSessions],
  );

  const displayName = settings?.displayName ?? '';
  const avatarUrl = settings?.avatarUrl ?? '';

  const [showSettings, setShowSettings] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsAvatar, setSettingsAvatar] = useState('');
  const [updatingSettings, setUpdatingSettings] = useState(false);

  // Keep the in-progress edit fields in sync with persisted settings whenever
  // the sheet is opened or the underlying settings change while it's closed.
  useEffect(() => {
    if (!showSettings) {
      setSettingsName(displayName);
      setSettingsAvatar(avatarUrl);
    }
  }, [displayName, avatarUrl, showSettings]);

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

  // Set while a running timer stands between a tap and the timer screen.
  /** The play mark that opened the start popover, and what it points at. */
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null);

  const [pendingTimer, setPendingTimer] = useState<{
    courseId: string;
    taskId: string | null;
  } | null>(null);

  // True while a sheet's own write is in flight, so its button can say so
  // and cannot be pressed a second time.
  // Sign out and reset both navigate away at the end, so the screen stays
  // covered until they do rather than sitting on a dead dashboard.
  const [leaving, setLeaving] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseEditDraft | null>(null);
  const [savingCourseEdit, setSavingCourseEdit] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [deletingCourseBusy, setDeletingCourseBusy] = useState(false);

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

  async function handleUpdateSettings() {
    setUpdatingSettings(true);
    try {
      let finalAvatar = settingsAvatar;
      if (settingsAvatar && isUploadedImage(settingsAvatar)) {
        finalAvatar = await resizeAvatar(settingsAvatar);
      }
      await updateUserSettingsOptimistic({
        displayName: settingsName.trim(),
        avatarUrl: finalAvatar,
      });
      setShowSettings(false);
    } catch (err) {
      console.error(err);
      notify('Settings did not save.');
    } finally {
      setUpdatingSettings(false);
    }
  }

  async function handleSignOut() {
    setLeaving('Signing out');
    setShowSettings(false);
    clearTimerState();
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore, fall through to redirect either way
    }
    // The timer, preferences and anything the local adapter cached all
    // outlive the Supabase session, so wipe them before leaving. Otherwise
    // the next person on a shared laptop inherits them.
    clearClientSessionState();
    // A hard navigation rather than router.replace, so the SWR cache, the
    // timer context and every other in-memory copy of the previous user's
    // data goes with the page.
    window.location.replace('/auth');
  }

  async function handleDeleteAccount() {
    setLeaving('Deleting your account');
    setShowSettings(false);
    clearTimerState();
    try {
      await deleteAccountAndData();
    } catch (error) {
      console.error('Failed to delete account:', error);
      notify(error instanceof Error ? error.message : 'The account was not deleted.');
      setLeaving(null);
      return;
    }
    // Nothing of this account should outlive it on the device either.
    clearClientSessionState();
    window.location.replace('/');
  }

  async function handleResetData() {
    setLeaving('Clearing your planner');
    setShowSettings(false);
    clearTimerState();
    try {
      await resetAllData();
    } catch (err) {
      console.error('Failed to reset data:', err);
      // Navigating on to onboarding after a failed reset tells the user
      // their data is gone when it is all still there.
      notify('Nothing was deleted. The reset did not go through.');
      setLeaving(null);
      return;
    }
    router.replace('/onboarding');
  }

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

  async function handleToggleTask(task: Task) {
    try {
      await toggleTaskOptimistic(task);
    } catch (error) {
      console.error('Failed to update task:', error);
      notify('That task did not update.');
    }
  }

  /**
   * Every play mark on this screen opens the same popover. A task carries its
   * own course; a course row passes one explicitly and leaves the task null.
   * `openEnded` is the "Open ended" button beside Start, which skips the
   * length picker and goes straight to an untargeted session.
   */
  function openStartFor(
    task: Task | null,
    anchor: HTMLElement,
    openEnded: boolean,
    course?: Course,
  ) {
    const resolved = course ?? courses.find((c) => c.id === task?.courseId);
    if (!resolved) return;
    if (openEnded) {
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

  /** "Tomorrow": the same move the row menu calls Reschedule. */
  async function handleSnoozeTask(task: Task) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    try {
      await updateTaskOptimistic(task.id, { dueDate: isoDate(tomorrow) });
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
      });
      setAddingTaskFor(null);
      setNewTaskTitle('');
      setNewTaskDue('');
      setNewTaskHigh(false);
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
    if (pickedCourse) {
      const chosen = pickedCourse.sections?.find((sec) => sec.id === newCourseSection);
      const withRoom = [chosen?.meets, chosen?.room].filter(Boolean).join(' · ');
      return {
        code: cleanCourseCode(pickedCourse.code),
        name: cleanCourseName(pickedCourse.title),
        credits: pickedCourse.credits ?? 4,
        section: newCourseSection || null,
        instructor: chosen?.instructor ?? null,
        // The room earns its place only when it does not push the line past
        // what the field holds; the time is the half that must survive.
        meetingTime:
          (withRoom.length <= MEETING_TIME_MAX ? withRoom : chosen?.meets) || null,
      };
    }
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
   * The order the cards were dragged into. The cache is rewritten before the
   * write leaves, so letting go feels instant; if the write fails, SWR puts
   * the old order back and the card returns to where it was.
   */
  async function handleReorderCourses(orderedIds: string[]) {
    const rank = new Map(orderedIds.map((id, index) => [id, index]));
    const place = (current: Course[] | undefined) =>
      [...(current ?? [])]
        .map((course) => {
          const position = rank.get(course.id);
          return position === undefined ? course : { ...course, position };
        })
        .sort(
          (a, b) =>
            (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        );
    try {
      await revalidateCourses(
        async (current: Course[] | undefined) => {
          await db.reorderCourses(orderedIds);
          return place(current);
        },
        {
          optimisticData: place,
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      );
    } catch (error) {
      console.error('Failed to reorder courses:', error);
      // The most useful reason by far is a database that has not run the
      // latest schema, and reorderCourses says exactly that.
      notify(error instanceof Error ? error.message : 'That order was not saved.');
      throw error;
    }
  }

  function openEditCourse(course: Course) {
    setEditingCourse({
      id: course.id,
      code: course.code,
      name: course.name,
      credits: String(typeof course.credits === 'number' && course.credits > 0 ? course.credits : 4),
      section: course.section ?? '',
      instructor: course.instructor ?? '',
      meetingTime: course.meetingTime ?? '',
      weeklyGoalHours: clampWeeklyGoalHours(course.weeklyGoalHours),
    });
  }

  function updateCourseEdit(patch: Partial<CourseEditDraft>) {
    setEditingCourse((current) => current ? { ...current, ...patch } : current);
  }

  async function handleSaveCourseEdit() {
    if (!editingCourse || savingCourseEdit) return;
    const code = cleanCourseCode(editingCourse.code);
    const name = cleanCourseName(editingCourse.name);
    if (!code || !name) {
      notify('A course needs both a code and a name.');
      return;
    }
    if (hasDuplicateCourseCodes([
      ...courses.filter((course) => course.id !== editingCourse.id),
      { code },
    ])) {
      notify(`${code} is already on your list.`);
      return;
    }
    setSavingCourseEdit(true);
    try {
      await updateCourseOptimistic(editingCourse.id, {
        code,
        name,
        credits: cleanCredits(editingCourse.credits) ?? 4,
        section: cleanSection(editingCourse.section),
        instructor: cleanInstructor(editingCourse.instructor),
        meetingTime: cleanMeetingTime(editingCourse.meetingTime),
        weeklyGoalHours: clampWeeklyGoalHours(editingCourse.weeklyGoalHours),
      });
      setEditingCourse(null);
    } catch (error) {
      console.error('Failed to update course:', error);
      notify(error instanceof Error ? error.message : 'That course did not save.');
    } finally {
      setSavingCourseEdit(false);
    }
  }

  async function handleDeleteCourse() {
    if (!deletingCourse || deletingCourseBusy) return;
    if (active?.courseId === deletingCourse.id) {
      notify('Stop or discard the active timer before deleting this course.');
      setDeletingCourse(null);
      return;
    }
    setDeletingCourseBusy(true);
    try {
      await deleteCourseOptimistic(deletingCourse.id);
      setDeletingCourse(null);
    } catch (error) {
      console.error('Failed to delete course:', error);
      notify(error instanceof Error ? error.message : 'That course was not deleted.');
    } finally {
      setDeletingCourseBusy(false);
    }
  }

  if (leaving) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-8">
        <LoadingIndicator label={leaving} detail="One moment." />
      </div>
    );
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
  const todaysSessions = sessionsForDate(sessions, today);
  const totalToday = totalSeconds(todaysSessions);
  const todayTasks = tasks.filter((t) => !t.completed && t.dueDate === today);
  const overdueTasks = tasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate < today,
  );
  const overdueCount = overdueTasks.length;
  const urgentTasks = [...overdueTasks, ...todayTasks].slice(0, 5);
  const streak = studyStreakDays(sessions);
  const now = new Date();
  /* "Sat, Sep 19, 2026" is how a receipt writes a date. The app writes it
     the way a diary does, so the parts are assembled rather than handed to
     toLocaleDateString whole. */
  const dateLine = [
    now.toLocaleDateString(undefined, { weekday: 'short' }),
    now.getDate(),
    now.toLocaleDateString(undefined, { month: 'short' }),
    now.getFullYear(),
  ].join(' ');
  /* The one task the screen asks for: oldest overdue first, then what is due
     today, then whatever is nearest. Sorting by due date alone would put a
     task due today above one that has been overdue for a fortnight. */
  const upNext =
    [...overdueTasks].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0] ??
    todayTasks[0] ??
    null;
  /* The week's goal is the sum of the course goals, which is what the course
     panel is already measured against; a separate number would let the two
     disagree. */
  const weeklyGoalHours = courses.reduce((a, c) => a + (c.weeklyGoalHours || 0), 0) || 20;
  const weekdayLabel = now.toLocaleDateString(undefined, { weekday: 'long' });
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' });
  const dayNum = now.getDate();
  const yearLabel = String(now.getFullYear()).slice(-2);
  const openTasks = tasks.filter((t) => !t.completed);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = isoDate(tomorrow);
  const tomorrowCount = openTasks.filter((t) => t.dueDate === tomorrowIso).length;
  // Dates are optional on a semester now (Settings → Semester lets you start
  // one with just a label). No dates just means no progress ribbon to show.
  const semesterInfo =
    semester?.startDate && semester?.endDate
      ? getSemesterInfo(semester.startDate, semester.endDate, today)
      : null;
  const smartPrompts = getSmartPrompts({
    courses,
    sessions,
    tasks,
    today,
    overdueCount,
    tomorrowCount,
  });

  return (
    <PageShell wide>
      {/* The page header. The date is a line of data above the title rather
          than the title itself, "New task" lives here now that the floating
          button is gone, and search is a field rather than an icon. */}
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="m-0 mb-1.5 font-mono text-[12px] tracking-[0.02em] text-muted">
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
              else setAddingTaskFor(courses[0].id);
            }}
            className="h-10 rounded-[10px] border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            New task
          </button>
        </div>
      </header>

      {courses.length === 0 ? (
        <EmptyPanel action="Add a course" onAction={openAddCourse} />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {upNext ? (
              <UpNext
                task={upNext}
                course={courses.find((c) => c.id === upNext.courseId)}
                onStart={(task, el, open) => openStartFor(task, el, open)}
                onDone={handleToggleTask}
                onSnooze={handleSnoozeTask}
                onOpen={(task) => router.push(`/tasks?task=${encodeURIComponent(task.id)}`)}
              />
            ) : (
              <section className="deckle border border-dashed border-line-strong bg-paper px-7 py-8">
                <p className="eyebrow m-0">Up next</p>
                <p className="m-0 mt-3 font-serif text-[20px] text-ink-soft">
                  Nothing overdue and nothing due today.
                </p>
                <p className="m-0 mt-2 text-[13px] text-muted">
                  A clean page. Start a course timer when you are ready.
                </p>
              </section>
            )}

            {overdueTasks.length > 0 && (
              <TaskSection
                title="Overdue"
                count={overdueTasks.length}
                countTone="warn"
                action={
                  <button
                    type="button"
                    onClick={handleRescheduleOverdue}
                    className="h-10 rounded-[10px] px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
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
                    running={active?.taskId === task.id}
                    onToggle={handleToggleTask}
                    onStartTimer={(t, el) => openStartFor(t, el, false)}
                    onOpen={(t) => router.push(`/tasks?task=${encodeURIComponent(t.id)}`)}
                    onReschedule={handleSnoozeTask}
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

            {todayTasks.length > 0 && (
              <TaskSection title="Due today" count={todayTasks.length}>
                {todayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    course={courses.find((c) => c.id === task.courseId)}
                    running={active?.taskId === task.id}
                    onToggle={handleToggleTask}
                    onStartTimer={(t, el) => openStartFor(t, el, false)}
                    onOpen={(t) => router.push(`/tasks?task=${encodeURIComponent(t.id)}`)}
                    onReschedule={handleSnoozeTask}
                  />
                ))}
              </TaskSection>
            )}

            {/* Courses keep their cards and their drag order on Today, below
                the day's own work rather than above it. */}
            <div className="mt-8 mb-3.5 flex items-baseline justify-between">
              <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">Courses</h2>
              <button
                type="button"
                onClick={openAddCourse}
                className="flex items-center gap-1.5 font-serif text-xs italic text-muted transition-colors hover:text-ink"
              >
                <span className="text-[15px] font-light leading-none">+</span>
                {courses.length} this term
              </button>
            </div>
            <CourseReorderList
              courses={courses}
              onReorder={handleReorderCourses}
              renderCourse={(course) => (
                <CourseCard
                  course={course}
                  sessions={sessions.filter((s) => s.courseId === course.id)}
                  tasks={tasks.filter((t) => t.courseId === course.id)}
                  onStartTimer={handleStartTimer}
                  onEdit={openEditCourse}
                  onDelete={setDeletingCourse}
                  onAddTask={(courseId) =>
                    router.push(`/tasks?course=${encodeURIComponent(courseId)}&newTask=1`)
                  }
                />
              )}
            />
          </div>

          {/* The right column: the day, the week, the courses against their
              goals, and the two numbers that only matter in passing. */}
          <aside className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:sticky lg:top-10">
            <TodayHours
              sessions={sessions}
              courses={courses}
              goalHours={settings?.dailyGoalHours ?? 4}
            />
            <ComingPanel
              tasks={tasks}
              courses={courses}
              sessions={sessions}
              onOpen={(task) => router.push(`/tasks?task=${encodeURIComponent(task.id)}`)}
            />
            <WeekPanel sessions={sessions} courses={courses} goalHours={weeklyGoalHours} />
            <CoursesWeekPanel
              courses={courses}
              sessions={sessions}
              onStart={(course, el) => openStartFor(null, el, false, course)}
            />
            <div className="flex items-center justify-between px-1 font-mono text-[11px] text-muted">
              <span>
                Streak <span className="text-ink">{streak} days</span>
              </span>
              {semesterInfo && (
                <span>
                  Term{' '}
                  <span className="text-ink">
                    day {semesterInfo.totalWeeks * 7 - semesterInfo.daysRemaining} /{' '}
                    {semesterInfo.totalWeeks * 7}
                  </span>
                </span>
              )}
            </div>
          </aside>
        </div>
      )}

      <StartTimerPopover target={startTarget} onClose={() => setStartTarget(null)} />

      {/* Quick task modal */}
      {addingTaskFor && (
        <div className="fixed inset-0 z-[80] flex items-end animate-fade-in">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setAddingTaskFor(null)}
            className="absolute inset-0 scrim backdrop-blur-sm"
          />
          <div className="relative w-full md:mx-auto md:max-w-xl bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />
            {(() => {
              const course = courses.find((c) => c.id === addingTaskFor);
              return course ? (
                <p
                  className="eyebrow m-0"
                  style={{ color: course.color }}
                >
                  {course.code}
                </p>
              ) : null;
            })()}
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
            <div className="mt-2.5 flex items-center gap-2">
              <DatePicker
                value={newTaskDue}
                onChange={setNewTaskDue}
                placeholder="Due date"
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
      )}

      {/* Add course sheet */}
      {addingCourse && (
        <div className="fixed inset-0 z-[80] flex items-end animate-fade-in">
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
                    if (course?.credits) setNewCourseGoal(clampWeeklyGoalHours(course.credits * 2));
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
                      className="w-8 h-8 rounded-full border-0 transition-transform"
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
      )}

      {/* Course details stay close to the original add-course sheet: a few
          calm fields, the notebook slider, then one clear save action. */}
      {editingCourse && (
        <div className="fixed inset-0 z-[80] flex items-end animate-fade-in">
          <button
            type="button"
            aria-label="Cancel editing course"
            onClick={() => !savingCourseEdit && setEditingCourse(null)}
            className="absolute inset-0 scrim backdrop-blur-sm"
          />
          <div className="relative max-h-[92dvh] w-full overflow-y-auto md:mx-auto md:max-w-xl rounded-t-3xl bg-bg px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="mx-auto mb-[18px] h-1 w-9 rounded-full bg-line-strong" />
            <h3 className="mt-0 mb-1.5 font-serif font-medium text-[22px] tracking-[-0.01em]">
              Edit course
            </h3>
            <p className="mt-0 mb-4 font-serif text-[13px] italic text-muted">
              Shape the class around your actual term.
            </p>

            <div className="flex flex-col gap-[18px]">
              <div className="grid grid-cols-[100px_1fr] gap-2.5">
                <SheetField label="Course code">
                  <input
                    autoFocus
                    value={editingCourse.code}
                    onChange={(event) => updateCourseEdit({ code: event.target.value.toUpperCase() })}
                    className="w-full rounded-[10px] border border-line bg-paper px-3 py-3 text-sm text-ink outline-none focus:border-line-strong"
                  />
                </SheetField>
                <SheetField label="Course name">
                  <input
                    value={editingCourse.name}
                    onChange={(event) => updateCourseEdit({ name: event.target.value })}
                    className="w-full rounded-[10px] border border-line bg-paper px-3 py-3 font-serif text-sm italic text-ink outline-none focus:border-line-strong"
                  />
                </SheetField>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <SheetField label="Credit hours">
                  <input
                    type="number"
                    min="0.5"
                    max="12"
                    step="0.5"
                    value={editingCourse.credits}
                    onChange={(event) => updateCourseEdit({ credits: event.target.value })}
                    className="w-full rounded-[10px] border border-line bg-paper px-3 py-3 font-mono text-sm text-ink outline-none focus:border-line-strong"
                  />
                </SheetField>
                <SheetField label="Section">
                  <input
                    value={editingCourse.section}
                    onChange={(event) => updateCourseEdit({ section: event.target.value })}
                    placeholder="Optional"
                    className="w-full rounded-[10px] border border-line bg-paper px-3 py-3 text-sm text-ink outline-none placeholder:text-muted-soft focus:border-line-strong"
                  />
                </SheetField>
              </div>

              <SheetField label="Meeting time">
                <input
                  value={editingCourse.meetingTime}
                  onChange={(event) => updateCourseEdit({ meetingTime: event.target.value })}
                  placeholder="e.g. Mon & Wed, 9:30 AM – 10:45 AM"
                  className="w-full rounded-[10px] border border-line bg-paper px-4 py-3 font-serif text-sm italic text-ink outline-none placeholder:text-muted-soft focus:border-line-strong"
                />
              </SheetField>

              <SheetField label="Instructor">
                <input
                  value={editingCourse.instructor}
                  onChange={(event) => updateCourseEdit({ instructor: event.target.value })}
                  placeholder="Optional"
                  className="w-full rounded-[10px] border border-line bg-paper px-4 py-3 font-serif text-sm italic text-ink outline-none placeholder:text-muted-soft focus:border-line-strong"
                />
              </SheetField>

              <SheetField label="Weekly study goal">
                <WeeklyGoalSlider
                  value={editingCourse.weeklyGoalHours}
                  onChange={(weeklyGoalHours) => updateCourseEdit({ weeklyGoalHours })}
                  credits={Number(editingCourse.credits) || 4}
                  label={`Weekly study goal for ${editingCourse.name || 'this course'}`}
                />
              </SheetField>
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                disabled={savingCourseEdit}
                onClick={() => setEditingCourse(null)}
                className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingCourseEdit || !editingCourse.code.trim() || !editingCourse.name.trim()}
                onClick={handleSaveCourseEdit}
                className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast disabled:opacity-30"
              >
                {savingCourseEdit ? (
                  <span className="flex items-center justify-center gap-2"><ButtonSpinner />Saving</span>
                ) : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmSheet
        open={deletingCourse !== null}
        title={`Delete ${deletingCourse?.name ?? 'this course'}?`}
        body="Its study sessions and tasks will be removed too. Type DELETE to make sure."
        confirmLabel="Delete course"
        cancelLabel="Keep course"
        requirePhrase="DELETE"
        busy={deletingCourseBusy}
        onCancel={() => !deletingCourseBusy && setDeletingCourse(null)}
        onConfirm={handleDeleteCourse}
      />
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

      <SettingsSheet
        open={showSettings}
        updating={updatingSettings}
        displayName={displayName}
        avatarUrl={avatarUrl}
        settingsName={settingsName}
        settingsAvatar={settingsAvatar}
        courses={courses}
        sessions={sessions}
        onNameChange={setSettingsName}
        onAvatarChange={setSettingsAvatar}
        onClose={() => !updatingSettings && setShowSettings(false)}
        onSave={handleUpdateSettings}
        onCoursesChanged={() => revalidateCourses()}
        onSignOut={handleSignOut}
        onResetData={handleResetData}
        onDeleteAccount={handleDeleteAccount}
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

function getSmartPrompts({
  courses,
  sessions,
  tasks,
  today,
  overdueCount,
  tomorrowCount,
}: {
  courses: Course[];
  sessions: Session[];
  tasks: Task[];
  today: string;
  overdueCount: number;
  tomorrowCount: number;
}) {
  const prompts: string[] = [];
  const openTasks = tasks.filter((t) => !t.completed);

  if (tomorrowCount > 0) {
    prompts.push(`${tomorrowCount} ${tomorrowCount === 1 ? 'task is' : 'tasks are'} due tomorrow.`);
  }

  for (const course of courses) {
    const courseSessions = sessions.filter((s) => s.courseId === course.id);
    const last = courseSessions[0]?.date;
    const lastDate = courseSessions.reduce<string | null>(
      (latest, session) => (!latest || session.date > latest ? session.date : latest),
      last || null,
    );
    const quietDays = lastDate ? daysBetween(lastDate, today) : Infinity;
    if (quietDays >= 5) {
      prompts.push(
        `${course.code} has been quiet ${quietDays === Infinity ? 'all term' : `for ${quietDays} days`}.`,
      );
      break;
    }
  }

  if (prompts.length === 0 && openTasks.length === 0 && courses.length > 0) {
    prompts.push('No open tasks. This is a good time to start a focused session.');
  }

  return prompts.slice(0, 2);
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
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3 px-2 pb-2">
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
      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">{children}</div>
    </section>
  );
}

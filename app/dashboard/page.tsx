'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useAnimation, PanInfo } from 'framer-motion';
import PageShell from '@/components/PageShell';
import DailySummary from '@/components/DailySummary';
import CourseCard from '@/components/CourseCard';
import DatePicker from '@/components/DatePicker';
import FloatingActionButton from '@/components/FloatingActionButton';
import SettingsSheet from '@/components/SettingsSheet';
import type { Course, Semester, Session, Task } from '@/lib/data';
import { createClient } from '@/lib/supabase';
import {
  formatHM,
  daysBetween,
  isoDate,
  isoWeekNumber,
  sessionsForDate,
  studyStreakDays,
  PASTEL_PALETTE,
  totalSeconds,
} from '@/lib/utils';
import { isLoggableDuration } from '@/lib/session-safety';
import {
  clampWeeklyGoalHours,
  cleanCourseCode,
  cleanCourseName,
  cleanTaskTitle,
} from '@/lib/planner-safety';
import { useTimer } from '@/lib/timer-context';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  useSemester,
  useUserSettings,
  addCourseOptimistic,
  addTaskOptimistic,
  toggleTaskOptimistic,
  updateUserSettingsOptimistic,
  resetAllData,
} from '@/lib/data-hooks';

export default function DashboardPage() {
  const router = useRouter();
  const { active, start, clearTimerState } = useTimer();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses: rawCourses, isLoading: coursesLoading, revalidate: revalidateCourses } =
    useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { semester } = useSemester();
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

  // Onboarding gate / auth redirect — fires once SWR has resolved the flag.
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

  function resizeImage(base64: string, maxWidth = 160, maxHeight = 160): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(base64);
    });
  }

  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskHigh, setNewTaskHigh] = useState(false);

  const [addingCourse, setAddingCourse] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseColor, setNewCourseColor] = useState(PASTEL_PALETTE[0].value);
  const [newCourseTint, setNewCourseTint] = useState(PASTEL_PALETTE[0].tint);
  const [newCourseGoal, setNewCourseGoal] = useState(8);

  async function handleUpdateSettings() {
    setUpdatingSettings(true);
    try {
      let finalAvatar = settingsAvatar;
      if (settingsAvatar && !settingsAvatar.startsWith('https://')) {
        // It's a new base64 upload, resize it first
        finalAvatar = await resizeImage(settingsAvatar);
      }
      await updateUserSettingsOptimistic({
        displayName: settingsName.trim(),
        avatarUrl: finalAvatar,
      });
      setShowSettings(false);
    } catch (err) {
      console.error(err);
      alert('Failed to update settings');
    } finally {
      setUpdatingSettings(false);
    }
  }

  async function handleSignOut() {
    setShowSettings(false);
    clearTimerState();
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore — fall through to redirect either way
    }
    router.replace('/auth');
  }

  async function handleResetData() {
    setShowSettings(false);
    clearTimerState();
    try {
      await resetAllData();
    } catch (err) {
      console.error('Failed to reset data:', err);
    }
    router.replace('/onboarding');
  }

  function handleStartTimerForTask(task: Task) {
    if (active) {
      if (active.courseId !== task.courseId || active.taskId !== task.id) {
        if (!window.confirm('You have an active timer for another task. Discard it and start a new one?')) {
          return;
        }
        start(task.courseId, task.id);
      }
      router.push('/timer');
      return;
    }
    start(task.courseId, task.id);
    router.push('/timer');
  }

  function handleStartTimer(courseId: string) {
    if (active) {
      if (active.courseId !== courseId || active.taskId !== null) {
        if (!window.confirm('You have an active timer. Discard it and start a new one?')) {
          return;
        }
        start(courseId, null);
      }
      router.push('/timer');
      return;
    }
    start(courseId, null);
    router.push('/timer');
  }

  async function handleToggleTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    try {
      await toggleTaskOptimistic(task);
    } catch (error) {
      console.error('Failed to update task:', error);
      alert('Could not update that task.');
    }
  }

  async function handleAddTask() {
    const title = cleanTaskTitle(newTaskTitle);
    if (!addingTaskFor || !title) return;
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
      alert('Could not add that task.');
    }
  }

  function openAddCourse() {
    const used = new Set(courses.map((c) => c.color));
    const next =
      PASTEL_PALETTE.find((p) => !used.has(p.value)) ||
      PASTEL_PALETTE[courses.length % PASTEL_PALETTE.length];
    setNewCourseCode('');
    setNewCourseName('');
    setNewCourseColor(next.value);
    setNewCourseTint(next.tint);
    setNewCourseGoal(8);
    setAddingCourse(true);
  }

  async function handleAddCourse() {
    const code = cleanCourseCode(newCourseCode);
    const name = cleanCourseName(newCourseName);
    if (!code || !name) return;
    if (courses.some((course) => cleanCourseCode(course.code) === code)) {
      alert('That course code already exists.');
      return;
    }
    try {
      await addCourseOptimistic({
        code,
        name,
        color: newCourseColor,
        tint: newCourseTint,
        weeklyGoalHours: clampWeeklyGoalHours(newCourseGoal),
      });
      setAddingCourse(false);
    } catch (error) {
      console.error('Failed to add course:', error);
      alert('Could not add that course.');
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="animate-pulse opacity-40">
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
  const todayTasks = tasks.filter((t) => !t.completed && t.dueDate === today).slice(0, 3);
  const overdueCount = tasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate < today,
  ).length;
  const streak = studyStreakDays(sessions);
  const now = new Date();
  const weekdayLabel = now.toLocaleDateString(undefined, { weekday: 'long' });
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' });
  const dayNum = now.getDate();
  const yearLabel = String(now.getFullYear()).slice(-2);
  const weekOfYear = isoWeekNumber(now);
  const openTasks = tasks.filter((t) => !t.completed);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = isoDate(tomorrow);
  const tomorrowCount = openTasks.filter((t) => t.dueDate === tomorrowIso).length;
  const semesterInfo = semester ? getSemesterInfo(semester, today) : null;
  const smartPrompts = getSmartPrompts({
    courses,
    sessions,
    tasks,
    today,
    overdueCount,
    tomorrowCount,
  });

  return (
    <PageShell>
      {/* Journal header */}
      <header className="mb-[22px] flex items-start justify-between gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="m-0 flex items-baseline gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            <span>Wk {String(weekOfYear).padStart(2, '0')}</span>
            <span className="opacity-45">·</span>
            <span>{weekdayLabel}</span>
          </p>
          <h1 className="mt-1.5 mb-0 font-serif text-[32px] font-normal leading-[1.05] tracking-[-0.02em]">
            {monthLabel} <span className="italic">{dayNum}</span>
            <span className="ml-1.5 text-[18px] text-muted tracking-normal">
              &apos;{yearLabel}
            </span>
          </h1>
          <p className="mt-2 mb-0 max-w-[260px] text-[13px] leading-[1.5] text-ink-soft">
            {overdueCount > 0 ? (
              <>
                You have <b className="text-ink">{overdueCount} overdue</b>{' '}
                {overdueCount === 1 ? 'task' : 'tasks'} waiting.
              </>
            ) : todayTasks.length > 0 ? (
              <>
                <b className="text-ink">{todayTasks.length}</b>{' '}
                {todayTasks.length === 1 ? 'task' : 'tasks'} on the page today.

              </>
            ) : totalToday > 0 ? (
              <>
                Already <b className="text-ink">{formatHM(totalToday)}</b> in. Keep it
                going.
              </>
            ) : (
              <>Nothing pressing. A clean page to fill.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="relative w-[42px] h-[42px] rounded-full bg-bg-tint border border-line overflow-visible flex items-center justify-center shrink-0 hover:border-primary transition-colors"
          >
            <span className="block h-full w-full overflow-hidden rounded-full">
              <img src={avatarUrl || '/default-avatar.png'} alt="Settings" className="w-full h-full object-cover" />
            </span>
            {streak > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-primary px-1 font-mono text-[9px] font-bold text-primary-contrast">
                {streak}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Daily summary */}
      <DailySummary todaysSessions={todaysSessions} courses={courses} />

      {semesterInfo && (
        <section className="mt-3 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Semester
              </p>
              <h2 className="mt-1 mb-0 font-serif text-[18px] font-medium tracking-[-0.01em]">
                Week {semesterInfo.currentWeek} of {semesterInfo.totalWeeks}
              </h2>
            </div>
            <span className="font-mono text-[13px] font-semibold text-ink-soft">
              {semesterInfo.daysRemaining}d left
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-tint">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${semesterInfo.percent}%` }}
            />
          </div>
        </section>
      )}

      {smartPrompts.length > 0 && (
        <section className="mt-4 grid gap-2">
          {smartPrompts.map((prompt) => (
            <div
              key={prompt}
              className="px-2 py-1.5 text-[14px] leading-[1.45] text-muted font-serif italic border-l-2 border-line pl-3"
            >
              {prompt}
            </div>
          ))}
        </section>
      )}

      {(todayTasks.length > 0 || overdueCount > 0) && (
        <section className="mt-5 mb-[22px]">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="m-0 font-serif text-[17px] font-medium tracking-[-0.01em]">
              Due today
            </h2>
            {overdueCount > 0 && (
              <span className="rounded-full bg-priorityTint px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.06em] text-prioritySoft">
                {overdueCount} overdue
              </span>
            )}
          </div>
          <div className="overflow-hidden">
            {todayTasks.length === 0 ? (
              <p className="m-0 px-4 py-3.5 font-serif text-[13px] italic text-muted">
                Nothing due today. A clean page.
              </p>
            ) : (
              todayTasks.map((task, index) => (
                <DashboardTaskItem
                  key={task.id}
                  task={task}
                  course={courses.find((c) => c.id === task.courseId)}
                  isLast={index === todayTasks.length - 1}
                  onToggle={handleToggleTask}
                  onStartTimer={handleStartTimerForTask}
                />
              ))
            )}
          </div>
        </section>
      )}

      {/* Section header */}
      <div className={`${todayTasks.length > 0 || overdueCount > 0 ? '' : 'mt-[26px]'} mb-3.5 flex items-baseline justify-between`}>
        <h2 className="m-0 font-serif font-medium text-[20px] tracking-[-0.01em]">
          Courses
        </h2>
        <button
          type="button"
          onClick={openAddCourse}
          className="flex items-center gap-1.5 text-xs text-muted font-serif italic hover:text-ink transition-colors"
        >
          <span className="text-[15px] leading-none font-light">+</span>
          {courses.length} this term
        </button>
      </div>

      {/* Course cards */}
      {courses.length === 0 ? (
        <EmptyPanel
          title="No courses yet"
          text="Add your classes and weekly goals to make the dashboard useful."
          action="Add a course"
          onAction={openAddCourse}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              sessions={sessions.filter((s) => s.courseId === course.id)}
              tasks={tasks.filter((t) => t.courseId === course.id)}
              onStartTimer={handleStartTimer}
            />
          ))}
        </div>
      )}

      <FloatingActionButton
        courses={courses}
        onStartTimer={handleStartTimer}
        onAddTask={(courseId) => setAddingTaskFor(courseId)}
      />

      {/* Quick task modal */}
      {addingTaskFor && (
        <div className="fixed inset-0 z-[80] flex items-end animate-fade-in">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setAddingTaskFor(null)}
            className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
          />
          <div className="relative w-full bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />
            {(() => {
              const course = courses.find((c) => c.id === addingTaskFor);
              return course ? (
                <p
                  className="m-0 text-[11px] font-semibold tracking-[0.16em] uppercase"
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
                className="px-3 py-2 rounded-full text-[10px] font-medium tracking-[0.04em] uppercase"
                style={{
                  background: newTaskHigh ? '#F4DCD2' : 'var(--bg-tint)',
                  color: newTaskHigh ? '#A85C42' : 'var(--muted)',
                }}
              >
                {newTaskHigh ? '● High' : 'Normal'}
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
                disabled={!newTaskTitle.trim()}
                onClick={handleAddTask}
                className="flex-1 py-3.5 rounded-[10px] bg-primary text-primary-contrast text-sm font-medium disabled:opacity-30"
              >
                Add task
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
            className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
          />
          <div className="relative w-full bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
            <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />
            <h3 className="mt-0 mb-1.5 font-serif font-medium text-[22px] tracking-[-0.01em]">
              Add a course
            </h3>
            <p className="mt-0 mb-4 text-[13px] text-muted font-serif italic">
              One more to the list.
            </p>

            <div className="flex gap-2.5 mb-3">
              <input
                autoFocus
                type="text"
                value={newCourseCode}
                onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                placeholder="Code"
                className="w-[90px] bg-paper border border-line rounded-[10px] px-3 py-3 text-sm font-mono text-ink outline-none focus:border-line-strong uppercase"
              />
              <input
                type="text"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="Course name"
                className="flex-1 bg-paper border border-line rounded-[10px] px-4 py-3 text-sm font-serif italic text-ink outline-none focus:border-line-strong"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCourse(); }}
              />
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {PASTEL_PALETTE.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-label={p.name}
                  onClick={() => { setNewCourseColor(p.value); setNewCourseTint(p.tint); }}
                  className="w-7 h-7 rounded-full border-0 transition-transform"
                  style={{
                    background: p.value,
                    boxShadow: newCourseColor === p.value
                      ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${p.value}`
                      : 'none',
                    transform: newCourseColor === p.value ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={newCourseGoal}
                onChange={(e) => setNewCourseGoal(clampWeeklyGoalHours(e.target.value))}
                className="pl-range flex-1"
                style={{ color: newCourseColor }}
              />
              <span className="font-mono font-semibold text-sm text-ink w-14 text-right">
                {newCourseGoal}<span className="text-muted ml-1 font-normal">h/wk</span>
              </span>
            </div>

            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setAddingCourse(false)}
                className="flex-1 py-3.5 rounded-[10px] bg-transparent border border-line-strong text-ink-soft text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newCourseCode.trim() || !newCourseName.trim()}
                onClick={handleAddCourse}
                className="flex-1 py-3.5 rounded-[10px] bg-primary text-primary-contrast text-sm font-medium disabled:opacity-30"
              >
                Add course
              </button>
            </div>
          </div>
        </div>
      )}
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
      />
    </PageShell>
  );
}

function getSemesterInfo(semester: Semester, today: string) {
  const totalDays = Math.max(1, daysBetween(semester.startDate, semester.endDate) + 1);
  const elapsedDays = Math.min(Math.max(0, daysBetween(semester.startDate, today) + 1), totalDays);
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)));
  const daysRemaining = Math.max(0, daysBetween(today, semester.endDate));
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

  if (overdueCount > 0) {
    prompts.push(`${overdueCount} overdue ${overdueCount === 1 ? 'task needs' : 'tasks need'} attention.`);
  } else if (tomorrowCount > 0) {
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

function EmptyPanel({
  title,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="py-8 text-center">
      <p className="m-0 font-serif text-[16px] italic text-muted-soft">
        The page is blank. Add your first course...
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong bg-transparent px-3.5 py-1.5 text-[11px] font-medium text-muted-soft transition-colors hover:border-line-strong hover:text-ink uppercase tracking-[0.04em]"
      >
        <span aria-hidden className="text-[14px] leading-none font-light">+</span>
        {action}
      </button>
    </div>
  );
}

function DashboardTaskItem({ task, course, isLast, onToggle, onStartTimer }: { task: Task; course?: Course; isLast: boolean; onToggle: (id: string) => void; onStartTimer: (task: Task) => void; }) {
  const controls = useAnimation();

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 70;
    if (info.offset.x > threshold) {
      onToggle(task.id);
      controls.start({ x: 0 });
    } else {
      controls.start({ x: 0 });
    }
  };

  return (
    <div className={`relative overflow-hidden group ${isLast ? '' : 'border-b border-dashed border-line'}`}>
      <div className="absolute inset-0 flex items-center justify-start px-4 z-0 pointer-events-none">
        <div
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase opacity-80"
          style={{ color: course?.color || 'var(--ink)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Complete
        </div>
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="relative z-10 flex items-center gap-3 px-3.5 py-[11px] bg-bg"
      >
        <button
          type="button"
          onClick={() => onToggle(task.id)}
          aria-label="Mark complete"
          className="h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.5px] border-line-strong"
        />
        <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.4] text-ink">
          {task.title}
        </p>
        {course && (
          <button
            type="button"
            onClick={() => onStartTimer(task)}
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{
              background: course.tint || 'var(--bg-tint)',
              color: 'var(--ink)',
            }}
          >
            {course.code}
          </button>
        )}
      </motion.div>
    </div>
  );
}

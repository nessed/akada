'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import DailySummary from '@/components/DailySummary';
import CourseCard from '@/components/CourseCard';
import DatePicker from '@/components/DatePicker';
import FloatingActionButton from '@/components/FloatingActionButton';
import SettingsSheet from '@/components/SettingsSheet';
import { db } from '@/lib/data';
import type { Course, Session, Task } from '@/lib/data';
import { createClient } from '@/lib/supabase';
import {
  formatHM,
  isoDate,
  isoWeekNumber,
  sessionsForDate,
  studyStreakDays,
  PASTEL_PALETTE,
} from '@/lib/utils';
import { useTimer } from '@/lib/timer-context';

export default function DashboardPage() {
  const router = useRouter();
  const { active, start } = useTimer();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsAvatar, setSettingsAvatar] = useState('');
  const [updatingSettings, setUpdatingSettings] = useState(false);

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

  async function refresh() {
    const [c, s, t, settings] = await Promise.all([
      db.getCourses(),
      db.getSessions(),
      db.getTasks(),
      db.getUserSettings(),
    ]);
    setCourses(c);
    setSessions(s);
    setTasks(t);
    if (settings?.displayName) {
      setDisplayName(settings.displayName);
      setSettingsName(settings.displayName);
    }
    if (settings?.avatarUrl) {
      setAvatarUrl(settings.avatarUrl);
      setSettingsAvatar(settings.avatarUrl);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const onboarded = await db.isOnboardingComplete();
        if (!onboarded) {
          router.replace('/onboarding');
          return;
        }
        await refresh();
        setLoading(false);
      } catch {
        router.replace('/auth');
      }
    })();
  }, [router]);

  async function handleUpdateSettings() {
    setUpdatingSettings(true);
    try {
      let finalAvatar = settingsAvatar;
      if (settingsAvatar && !settingsAvatar.startsWith('https://')) {
        // It's a new base64 upload, resize it first
        finalAvatar = await resizeImage(settingsAvatar);
      }
      await db.updateUserSettings({
        displayName: settingsName.trim(),
        avatarUrl: finalAvatar,
      });
      setDisplayName(settingsName.trim());
      setAvatarUrl(finalAvatar);
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
    try {
      await db.resetAll();
    } catch (err) {
      console.error('Failed to reset data:', err);
    }
    router.replace('/onboarding');
  }

  function handleStartTimer(courseId: string) {
    if (active) {
      router.push('/timer');
      return;
    }
    start(courseId, null);
    router.push('/timer');
  }

  function handleStartTimerForTask(task: Task) {
    if (active) {
      router.push('/timer');
      return;
    }
    start(task.courseId, task.id);
    router.push('/timer');
  }

  async function handleToggleTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    await db.updateTask(id, {
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : null,
    });
    refresh();
  }

  async function handleAddTask() {
    if (!addingTaskFor || !newTaskTitle.trim()) return;
    await db.addTask({
      courseId: addingTaskFor,
      title: newTaskTitle.trim(),
      dueDate: newTaskDue || null,
      priority: newTaskHigh ? 'high' : 'normal',
    });
    setAddingTaskFor(null);
    setNewTaskTitle('');
    setNewTaskDue('');
    setNewTaskHigh(false);
    refresh();
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
    if (!newCourseCode.trim() || !newCourseName.trim()) return;
    await db.addCourse({
      code: newCourseCode.trim().toUpperCase(),
      name: newCourseName.trim(),
      color: newCourseColor,
      tint: newCourseTint,
      weeklyGoalHours: newCourseGoal,
    });
    setAddingCourse(false);
    refresh();
  }

  if (loading) {
    return (
      <PageShell>
        <div className="pt-20 text-center text-muted-soft text-sm font-serif italic">
          Loading…
        </div>
      </PageShell>
    );
  }

  const today = isoDate();
  const todaysSessions = sessionsForDate(sessions, today);
  const totalToday = todaysSessions.reduce((sum, session) => sum + session.durationSeconds, 0);
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
          {active && (
            <button
              type="button"
              onClick={() => router.push('/timer')}
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-paper border border-line text-xs font-medium hover:bg-bg-tint"
            >
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-priority animate-ping opacity-60" />
                <span className="relative rounded-full bg-priority w-2 h-2" />
              </span>
              Timer
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="relative w-[42px] h-[42px] rounded-full bg-bg-tint border border-line overflow-visible flex items-center justify-center shrink-0 hover:border-ink transition-colors"
          >
            <span className="block h-full w-full overflow-hidden rounded-full">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Settings" className="w-full h-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-[#E2B594] font-serif text-[17px] font-medium text-ink">
                  {displayName ? displayName.charAt(0).toUpperCase() : 'A'}
                </span>
              )}
            </span>
            {streak > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-ink px-1 font-mono text-[9px] font-bold text-bg">
                {streak}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Daily summary */}
      <DailySummary todaysSessions={todaysSessions} courses={courses} />

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
          <div className="overflow-hidden rounded-xl border border-line bg-paper">
            {todayTasks.length === 0 ? (
              <p className="m-0 px-4 py-3.5 font-serif text-[13px] italic text-muted">
                Nothing due today. A clean page.
              </p>
            ) : (
              todayTasks.map((task, index) => {
                const course = courses.find((c) => c.id === task.courseId);
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-3.5 py-[11px] ${
                      index < todayTasks.length - 1 ? 'border-b border-dashed border-line' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTask(task.id)}
                      aria-label="Mark complete"
                      className="h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.5px] border-line-strong"
                    />
                    <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.4] text-ink">
                      {task.title}
                    </p>
                    {course && (
                      <button
                        type="button"
                        onClick={() => handleStartTimerForTask(task)}
                        className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
                        style={{
                          background: course.tint || 'var(--bg-tint)',
                          color: 'var(--ink)',
                        }}
                      >
                        {course.code}
                      </button>
                    )}
                  </div>
                );
              })
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
                className="flex-1 py-3.5 rounded-[10px] bg-ink text-bg text-sm font-medium disabled:opacity-30"
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
                onChange={(e) => setNewCourseGoal(parseFloat(e.target.value))}
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
                className="flex-1 py-3.5 rounded-[10px] bg-ink text-bg text-sm font-medium disabled:opacity-30"
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
        onCoursesChanged={refresh}
        onSignOut={handleSignOut}
        onResetData={handleResetData}
      />
    </PageShell>
  );
}

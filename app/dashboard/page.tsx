'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import DailySummary from '@/components/DailySummary';
import CourseCard from '@/components/CourseCard';
import FloatingActionButton from '@/components/FloatingActionButton';
import { db } from '@/lib/data';
import type { Course, Session, Task, UserSettings } from '@/lib/data';
import { isoDate, sessionsForDate, PASTEL_PALETTE } from '@/lib/utils';
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

  function handleStartTimer(courseId: string) {
    if (active) {
      router.push('/timer');
      return;
    }
    start(courseId, null);
    router.push('/timer');
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

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  const today = isoDate();
  const todaysSessions = sessionsForDate(sessions, today);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <PageShell>
      {/* Journal header */}
      <header className="mb-[22px] flex items-center justify-between gap-3">
        <div className="flex-1">
          {displayName ? (
            <>
              <p className="m-0 text-[11px] tracking-[0.18em] uppercase text-muted font-semibold">
                {greeting()}
              </p>
              <h1 className="mt-1.5 mb-0 font-serif font-medium text-[32px] tracking-[-0.02em] leading-[1.1]">
                {displayName}
              </h1>
            </>
          ) : (
            <>
              <p className="m-0 text-[11px] tracking-[0.18em] uppercase text-muted font-semibold">
                Today
              </p>
              <h1 className="mt-1.5 mb-0 font-serif font-medium text-[32px] tracking-[-0.02em] leading-[1.1]">
                {dateLabel}
              </h1>
            </>
          )}
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
            className="w-10 h-10 rounded-full bg-bg-tint border border-line overflow-hidden flex items-center justify-center shrink-0 hover:border-ink transition-colors"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Settings" className="w-full h-full object-cover" />
            ) : (
              <span className="font-serif italic text-[16px] text-muted">
                {displayName ? displayName.charAt(0).toUpperCase() : 'A'}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Daily summary */}
      <DailySummary todaysSessions={todaysSessions} courses={courses} />

      {/* Section header */}
      <div className="mt-[26px] mb-3.5 flex items-baseline justify-between">
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
              <input
                type="date"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="flex-1 bg-bg-tint border-0 rounded-lg px-3 py-2.5 text-xs text-ink-soft outline-none"
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
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-fade-in">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => !updatingSettings && setShowSettings(false)} />
          <div className="relative bg-bg border border-line rounded-2xl w-full max-w-sm p-6 shadow-xl animate-scale-up">
            <h3 className="font-serif font-medium text-xl m-0 mb-5">Profile Settings</h3>
            
            <div className="flex flex-col items-center gap-4 mb-5">
              <label className="relative cursor-pointer group">
                <div className="w-20 h-20 rounded-full border border-line overflow-hidden bg-bg-tint flex items-center justify-center transition-colors group-hover:border-ink">
                  {settingsAvatar ? (
                    <img src={settingsAvatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-serif italic text-2xl text-muted">
                      {settingsName ? settingsName.charAt(0).toUpperCase() : 'A'}
                    </span>
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-ink text-bg flex items-center justify-center shadow-md">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setSettingsAvatar(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>

            <div className="mb-6">
              <label className="block text-[10px] font-semibold tracking-[0.12em] uppercase text-muted mb-2">Display Name</label>
              <input
                type="text"
                value={settingsName}
                onChange={(e) => setSettingsName(e.target.value)}
                className="w-full bg-bg-tint border border-line rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-line-strong transition-colors"
                placeholder="Your name"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={updatingSettings}
                onClick={() => setShowSettings(false)}
                className="flex-1 py-2.5 text-center text-sm font-medium border border-line rounded-xl text-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingSettings || !settingsName.trim()}
                onClick={handleUpdateSettings}
                className="flex-1 py-2.5 text-center text-sm font-medium bg-ink text-bg rounded-xl transition-opacity disabled:opacity-50"
              >
                {updatingSettings ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

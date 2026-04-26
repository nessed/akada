'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTimer } from '@/lib/timer-context';
import { db } from '@/lib/data';
import type { Course, Task } from '@/lib/data';
import { formatHHMMSS, isoDate, resolveTint } from '@/lib/utils';
import SessionLogModal from '@/components/SessionLogModal';

export default function TimerPage() {
  const router = useRouter();
  const { active, elapsedSeconds, pause, resume, stop } = useTimer();

  const [course, setCourse] = useState<Course | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [pendingLog, setPendingLog] = useState<{
    courseId: string;
    taskId: string | null;
    durationSeconds: number;
  } | null>(null);

  useEffect(() => {
    if (!active && !pendingLog) {
      router.replace('/dashboard');
      return;
    }
    if (!active) return;
    (async () => {
      const courses = await db.getCourses();
      setCourse(courses.find((x) => x.id === active.courseId) || null);
      if (active.taskId) {
        const tasks = await db.getTasks();
        setTask(tasks.find((t) => t.id === active.taskId) || null);
      } else {
        setTask(null);
      }
    })();
  }, [active, pendingLog, router]);

  function handleStop() {
    const result = stop();
    if (!result) {
      router.replace('/dashboard');
      return;
    }
    setPendingLog(result);
    setLogOpen(true);
  }

  async function handleSave(note: string) {
    if (!pendingLog) return;
    await db.addSession({
      courseId: pendingLog.courseId,
      taskId: pendingLog.taskId,
      date: isoDate(),
      durationSeconds: pendingLog.durationSeconds,
      note,
    });
    setLogOpen(false);
    setPendingLog(null);
    router.replace('/dashboard');
  }

  function handleDiscard() {
    setLogOpen(false);
    setPendingLog(null);
    router.replace('/dashboard');
  }

  if (!course && !pendingLog) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-muted-soft text-sm font-serif italic">
        Loading…
      </div>
    );
  }

  const isPaused = active?.isPaused ?? false;
  const tint = course ? resolveTint(course.color, course.tint) : 'var(--bg-tint)';

  return (
    <div
      className="min-h-[100dvh] flex flex-col animate-fade-in"
      style={{
        background: course
          ? `linear-gradient(180deg, ${tint} 0%, var(--bg) 60%)`
          : 'var(--bg)',
      }}
    >
      <div className="flex justify-start px-[22px] pt-[max(env(safe-area-inset-top),60px)]">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          aria-label="Back"
          className="w-[38px] h-[38px] rounded-full border border-line bg-paper flex items-center justify-center text-ink-soft"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-7">
        {course && (
          <>
            <p
              className="m-0 text-[11px] font-semibold tracking-[0.22em] uppercase"
              style={{ color: course.color }}
            >
              {course.code}
            </p>
            <h1 className="mt-2 mb-0 font-serif font-medium text-[26px] tracking-[-0.01em]">
              {course.name}
            </h1>
            {task && (
              <p className="mt-2 mb-0 text-[13px] text-ink-soft font-serif italic">
                {task.title}
              </p>
            )}

            <div className="mt-14">
              <div
                className="font-mono font-semibold text-[64px] tracking-[-0.02em] text-ink tabular-nums transition-opacity duration-200"
                style={{ opacity: isPaused ? 0.55 : 1 }}
              >
                {formatHHMMSS(elapsedSeconds)}
              </div>
              <p
                className={`mt-3.5 mb-0 text-[11px] tracking-[0.24em] uppercase text-muted font-semibold ${
                  isPaused ? '' : 'animate-tick'
                }`}
              >
                {isPaused ? 'Paused' : 'In session'}
              </p>
            </div>

            <p className="mt-14 max-w-[280px] font-serif italic text-sm text-muted leading-[1.6]">
              {isPaused
                ? '"The pause is part of the page."'
                : '"Slow is smooth. Smooth is steady."'}
            </p>
          </>
        )}
      </div>

      {course && active && (
        <div className="flex items-center justify-center gap-3.5 px-[22px] pt-4 pb-[calc(28px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={isPaused ? resume : pause}
            aria-label={isPaused ? 'Resume' : 'Pause'}
            className="w-14 h-14 rounded-full bg-paper border border-line text-ink flex items-center justify-center"
          >
            {isPaused ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5l12 7-12 7V5z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 5v14M15 5v14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="h-14 px-7 rounded-full text-sm font-semibold inline-flex items-center gap-2 tracking-[0.01em]"
            style={{ background: course.color, color: '#1A1915' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop &amp; log
          </button>
        </div>
      )}

      <SessionLogModal
        open={logOpen}
        course={course}
        durationSeconds={pendingLog?.durationSeconds ?? 0}
        onCancel={handleDiscard}
        onSave={handleSave}
      />
    </div>
  );
}

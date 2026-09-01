'use client';

import type { Course, Session, Task } from '@/lib/data';
import {
  formatHours,
  sessionsThisWeek,
  totalSeconds,
  daysBetween,
  isoDate,
  lastSeenByCourse,
} from '@/lib/utils';

interface Props {
  course: Course;
  sessions: Session[]; // sessions for this course
  tasks: Task[]; // tasks for this course
  onStartTimer: (courseId: string) => void;
  neglectedCutoffDays?: number;
}

export default function CourseCard({
  course,
  sessions,
  tasks,
  onStartTimer,
  neglectedCutoffDays = 4,
}: Props) {
  const wkSec = totalSeconds(sessionsThisWeek(sessions));
  const goalHours = Number.isFinite(course.weeklyGoalHours)
    ? Math.max(0.5, course.weeklyGoalHours)
    : 0.5;
  const goalSec = goalHours * 3600;
  const pct = Math.min(100, (wkSec / goalSec) * 100);

  const last = lastSeenByCourse(sessions)[course.id];
  const since = last ? daysBetween(last, isoDate()) : Infinity;
  const neglected = since >= neglectedCutoffDays;

  const openTaskCount = tasks.filter((t) => !t.completed).length;

  const sinceLabel =
    since === 0 ? 'today' : since === 1 ? 'yesterday' : `${since}d ago`;

  const catalogLine = [
    typeof course.credits === 'number' ? `${course.credits} cr` : null,
    course.section ? `Sec ${course.section}` : null,
    course.instructor,
    course.meetingTime,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="relative bg-paper rounded-[14px] border border-line overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: course.color }}
      />
      <div className="py-[18px] pl-[22px] pr-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className="eyebrow m-0"
              style={{ color: course.color }}
            >
              {course.code}
            </p>
            <h3 className="mt-1 mb-0 font-serif font-medium text-[19px] tracking-[-0.01em] truncate">
              {course.name}
            </h3>
            {/* Only what the catalog actually supplied — a manually typed
                course simply has no second line. */}
            {catalogLine && (
              <p className="mt-1 mb-0 truncate text-[11.5px] text-muted-soft">
                {catalogLine}
              </p>
            )}
          </div>
          {neglected && (
            <span
              className="shrink-0 font-hand text-[14px] text-warnSoft"
              style={{ transform: 'rotate(-2.5deg)' }}
            >
              {since === Infinity ? 'untouched' : `${since}d quiet`}
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="mb-1.5">
            <span className="font-mono text-sm font-semibold tabular-nums">
              {formatHours(wkSec, 1)}
            </span>
          </div>
          <div className="h-1 rounded-full bg-bg-tint overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${pct}%`, background: course.color }}
            />
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2">
          <span className="text-xs text-muted font-serif italic">
            {openTaskCount > 0
              ? `${openTaskCount} open task${openTaskCount !== 1 ? 's' : ''}`
              : last
                ? `Last seen ${sinceLabel}`
                : 'No sessions yet'}
          </span>
          <button
            type="button"
            onClick={() => onStartTimer(course.id)}
            aria-label={`Start timer for ${course.code}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
            style={{
              background: course.tint || 'var(--bg-tint)',
              color: course.color || 'var(--ink)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5l12 7-12 7V5z" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}

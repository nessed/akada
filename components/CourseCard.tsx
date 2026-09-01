'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  onAddTask: (courseId: string) => void;
  neglectedCutoffDays?: number;
}

export default function CourseCard({
  course,
  sessions,
  tasks,
  onStartTimer,
  onEdit,
  onDelete,
  onAddTask,
  neglectedCutoffDays = 4,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
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
    `${typeof course.credits === 'number' && course.credits > 0 ? course.credits : 4} cr`,
    course.section ? `Sec ${course.section}` : null,
    course.instructor,
    course.meetingTime,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="relative bg-paper rounded-[14px] border border-line overflow-hidden transition-colors focus-within:border-line-strong hover:border-line-strong">
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-1"
        style={{ background: course.color }}
      />
      {/* The whole card is the way into the course. It sits under the content
          rather than wrapping it, so the menu and the timer button stay real
          buttons instead of controls nested inside a link. */}
      <Link
        href={`/tasks?course=${encodeURIComponent(course.id)}`}
        aria-label={`Open ${course.name} tasks`}
        className="absolute inset-0 rounded-[14px]"
      />
      <div className="pointer-events-none relative py-[18px] pl-[22px] pr-[18px]">
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
            {/* Only what the catalog actually supplied, a manually typed
                course simply has no second line. */}
            {catalogLine && (
              <p className="mt-1 mb-0 truncate text-[11.5px] text-muted-soft">
                {catalogLine}
              </p>
            )}
          </div>
          <div className="pointer-events-auto relative z-10 flex shrink-0 items-start gap-2">
            {neglected && (
              <span
                className="font-hand text-[14px] text-warnSoft"
                style={{ transform: 'rotate(-2.5deg)' }}
              >
                {since === Infinity ? 'untouched' : `${since}d quiet`}
              </span>
            )}
            <button
              type="button"
              aria-label={`Manage ${course.name}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg-tint hover:text-ink"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label={`Manage ${course.name}`}
                className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-[10px] border border-line bg-paper py-1 shadow-[0_8px_20px_rgba(57,48,36,0.12)] animate-fade-in"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onEdit(course); }}
                  className="w-full px-3 py-2 text-left text-xs text-ink-soft transition-colors hover:bg-bg-tint"
                >
                  Edit course
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onAddTask(course.id); }}
                  className="w-full px-3 py-2 text-left text-xs text-ink-soft transition-colors hover:bg-bg-tint"
                >
                  Add task
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onDelete(course); }}
                  className="w-full px-3 py-2 text-left text-xs text-priority transition-colors hover:bg-priorityTint"
                >
                  Delete course
                </button>
              </div>
            )}
          </div>
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
            className="pointer-events-auto relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
            style={{
              background: course.tint || 'var(--bg-tint)',
              color: course.color || 'var(--ink)',
            }}
          >
            <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5l12 7-12 7V5z" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}

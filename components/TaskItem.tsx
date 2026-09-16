'use client';

import type { Course, Task } from '@/lib/data';
import DueDateBadge from '@/components/DueDateBadge';
import SwipeRow from '@/components/SwipeRow';
import HandCheck from './notebook/HandCheck';

interface Props {
  task: Task;
  course: Course;
  onToggle: (id: string) => void;
  onStartTimer: (task: Task) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: Task) => void;
  onOpen?: (task: Task) => void;
}

/**
 * One line of the list.
 *
 * The row itself is the way into the task's reading view: a full-bleed
 * button sits behind the line, and the marks on top of it are inert, so a
 * tap anywhere that is not the box, the timer or an icon opens the sheet.
 * A link-style underline on the title would have been a web page's idea of
 * that; a page just lets you put a finger on the line.
 *
 * The row also opens sideways the way every other task row in the app does,
 * right to complete, left to delete, with the two icon affordances kept for
 * anyone on a keyboard.
 */
export default function TaskItem({
  task,
  course,
  onToggle,
  onStartTimer,
  onDelete,
  onEdit,
  onOpen,
}: Props) {
  return (
    <SwipeRow
      className="border-b border-dashed border-line"
      accent={course.color}
      onComplete={task.completed ? undefined : () => onToggle(task.id)}
      onDelete={() => onDelete(task.id)}
      surfaceClassName={`relative bg-bg ${task.completed ? 'opacity-45' : ''}`}
    >
      <div className="flex items-start gap-3 px-1 py-3">
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(task)}
            aria-label={`Open ${task.title}`}
            className="absolute inset-0 z-0 bg-transparent"
          />
        )}

        <button
          type="button"
          onClick={() => onToggle(task.id)}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          className={`relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${
            task.completed ? 'rounded-md' : 'scribble-box'
          }`}
          style={
            task.completed
              ? { background: course.color, border: `1.5px solid ${course.color}` }
              : undefined
          }
        >
          {task.completed && <HandCheck size={12} color="var(--paper)" strokeWidth={1.8} />}
        </button>

        <div className="pointer-events-none relative z-10 min-w-0 flex-1">
          <p
            className={`m-0 text-[14.5px] leading-[1.4] ${
              task.completed ? 'text-ink-soft' : 'text-ink'
            }`}
          >
            {task.title}
          </p>
          {!task.completed && (task.priority === 'high' || task.dueDate) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              {task.priority === 'high' && (
                <span
                  className="font-hand inline-block text-[14px] font-semibold tracking-wide text-priority"
                  style={{ transform: 'rotate(-3deg)' }}
                >
                  !! high
                </span>
              )}
              {task.dueDate && <DueDateBadge dueDate={task.dueDate} />}
            </div>
          )}
        </div>

        {!task.completed && (
          <button
            type="button"
            onClick={() => onStartTimer(task)}
            aria-label="Start timer for this task"
            className="hl-swipe relative z-10 inline-flex shrink-0 items-center gap-1 bg-transparent font-serif text-[12px] text-ink"
            style={{ '--hl': course.tint || 'var(--bg-tint)' } as React.CSSProperties}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 5l12 7-12 7V5z" />
            </svg>
            Start
          </button>
        )}

        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label="Edit task"
            className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-soft opacity-70 transition-colors hover:text-ink"
          >
            <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 8l2 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={() => onDelete(task.id)}
          aria-label="Delete task"
          className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-soft opacity-70 transition-colors hover:text-warn"
        >
          <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </SwipeRow>
  );
}

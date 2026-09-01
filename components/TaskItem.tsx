'use client';

import type { Course, Task } from '@/lib/data';
import { dueLabel } from '@/lib/utils';
import HandCheck from './notebook/HandCheck';

interface Props {
  task: Task;
  course: Course;
  onToggle: (id: string) => void;
  onStartTimer: (task: Task) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: Task) => void;
}

export default function TaskItem({ task, course, onToggle, onStartTimer, onDelete, onEdit }: Props) {
  const due = dueLabel(task.dueDate);

  return (
    <div className="relative overflow-hidden border-b border-dashed border-line group">
      <div
        className={`relative z-10 flex items-start gap-3 px-1 py-3 bg-bg ${
          task.completed ? 'opacity-50' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => onToggle(task.id)}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          className={`shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center ${
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

        <div className="flex-1 min-w-0">
          <p
            className={`m-0 text-[14.5px] leading-[1.4] ${
              task.completed ? 'text-ink-soft' : 'text-ink'
            }`}
          >
            {task.title}
          </p>
          <div className="mt-1 flex items-center gap-2.5">
            {task.priority === 'high' && !task.completed && (
              <span
                className="font-hand inline-block text-[14px] text-rose"
                style={{ transform: 'rotate(-3deg)' }}
              >
                !! high
              </span>
            )}
            {due && !task.completed && (
              <span
                className={`text-[11px] font-serif italic ${
                  due.tone === 'warn' ? 'text-warn' : 'text-muted'
                }`}
              >
                {due.text}
              </span>
            )}
          </div>
        </div>

        {!task.completed && (
          <button
            type="button"
            onClick={() => onStartTimer(task)}
            aria-label="Start timer for this task"
            className="shrink-0 px-2.5 py-[5px] rounded-full text-[11px] font-medium inline-flex items-center gap-1"
            style={{ background: course.tint || 'var(--bg-tint)', color: 'var(--ink)' }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
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
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-soft opacity-70 transition-opacity hover:text-ink"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
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
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-soft opacity-70 transition-opacity hover:text-warn"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
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
    </div>
  );
}

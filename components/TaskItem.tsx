'use client';

import type { Course, Task } from '@/lib/data';
import { dueLabel } from '@/lib/utils';

interface Props {
  task: Task;
  course: Course;
  onToggle: (id: string) => void;
  onStartTimer: (task: Task) => void;
  onDelete: (id: string) => void;
}

export default function TaskItem({ task, course, onToggle, onStartTimer, onDelete }: Props) {
  const due = dueLabel(task.dueDate);

  return (
    <div
      className={`group flex items-start gap-3 px-1 py-3 border-b border-dashed border-line ${
        task.completed ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        className="shrink-0 mt-0.5 w-5 h-5 rounded-md flex items-center justify-center"
        style={{
          border: `1.5px solid ${task.completed ? course.color : 'var(--line-strong)'}`,
          background: task.completed ? course.color : 'transparent',
        }}
      >
        {task.completed && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l4 4L19 7"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`m-0 text-sm leading-[1.4] ${
            task.completed ? 'line-through text-ink' : 'text-ink'
          }`}
        >
          {task.priority === 'high' && !task.completed && (
            <span
              className="inline-block w-1 h-1 rounded-full bg-priority align-middle mr-2"
              aria-hidden
            />
          )}
          {task.title}
        </p>
        {due && (
          <p
            className="mt-1 mb-0 text-[11px] font-serif italic"
            style={{ color: due.tone === 'warn' ? '#B5694C' : 'var(--muted)' }}
          >
            {due.text}
          </p>
        )}
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

      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label="Delete task"
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-soft opacity-0 group-hover:opacity-100 hover:text-warn transition-opacity"
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
  );
}

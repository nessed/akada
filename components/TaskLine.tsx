'use client';

import { CheckBox, CourseSpine, Swipe } from './notebook/Marks';
import { TallyCount } from './notebook/Tally';
import type { Course, Task } from '@/lib/data';
import { dueLabel, resolveTint } from '@/lib/utils';

/**
 * One line of the list.
 *
 * A finished line does not get struck through — readmedesign.md's rule about
 * alarmist indicators covers this: it fades, and its box fills with the
 * course's own colour. The date is a swipe of highlighter when it is today,
 * warn clay when it is late, and plain ink otherwise. Nothing here is red and
 * nothing is a badge.
 */
export default function TaskLine({
  task,
  course,
  onToggle,
  onStart,
  onOpen,
  showCourse,
  meta,
  hoursLogged,
  emphasis = 'normal',
  startOnHover = false,
}: {
  task: Task;
  course?: Course;
  onToggle?: () => void;
  /** Omitted where starting a timer makes no sense, e.g. a finished line. */
  onStart?: () => void;
  /**
   * Opens the line. This is a button around the title rather than a wrapper
   * around the whole row, because the row already contains the checkbox and
   * the start button: nesting those inside another button is invalid HTML,
   * and it made ticking something off open the editor instead.
   */
  onOpen?: () => void;
  /** Draws the course's colour bar, for lists that mix courses together. */
  showCourse?: boolean;
  /** The second line: "ECON 100 · 40m in · 2 of 5 done". */
  meta?: string;
  /** Tally strokes for time already spent on this one thing. */
  hoursLogged?: number;
  /**
   * How loudly this row is set. `strong` is the one row in a list that most
   * wants doing — the oldest overdue thing — and `soft` is a row that is
   * technically late but only just. Everything else is `normal`.
   */
  emphasis?: 'strong' | 'normal' | 'soft';
  /**
   * Holds the start button back until the row is hovered or something in it
   * takes focus. A list of ten rows each offering to start a timer is ten
   * invitations and no recommendation, so only the first couple keep theirs
   * on the page.
   */
  startOnHover?: boolean;
}) {
  const label = dueLabel(task.dueDate);
  const done = task.completed;
  const titleTone = done
    ? 'text-ink-soft'
    : emphasis === 'soft'
      ? 'text-ink-soft'
      : emphasis === 'strong'
        ? 'font-medium text-ink'
        : 'text-ink';

  return (
    <div
      className={`row-rule group flex items-center gap-3 px-0.5 py-3 ${done ? 'opacity-45' : ''}`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        aria-pressed={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="flex flex-none items-center justify-center bg-transparent p-0"
      >
        <CheckBox checked={done} color={course?.color} />
      </button>

      {showCourse && course && <CourseSpine color={course.color} />}

      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 bg-transparent text-left"
        >
          <span className={`block text-[15px] ${titleTone}`}>{task.title}</span>
          {meta && <span className="mt-[3px] block text-[13px] text-muted">{meta}</span>}
        </button>
      ) : (
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] ${titleTone}`}>{task.title}</span>
          {meta && <span className="mt-[3px] block text-[13px] text-muted">{meta}</span>}
        </span>
      )}

      {!done && hoursLogged !== undefined && hoursLogged > 0 && (
        <TallyCount count={Math.round(hoursLogged)} color="var(--ink)" height={14} />
      )}

      {done ? (
        <span className="flex-none font-serif text-[13px] italic text-muted">
          {task.completedAt ? `done ${clockOf(task.completedAt)}` : 'done'}
        </span>
      ) : label ? (
        label.category === 'today' ? (
          <Swipe color="var(--rose-tint)" className="flex-none font-mono text-[11px] text-ink">
            today
          </Swipe>
        ) : (
          <span
            className="flex-none font-mono text-[13px]"
            style={{
              color:
                label.category === 'overdue' || label.category === 'tomorrow'
                  ? 'var(--warn)'
                  : 'var(--ink-soft)',
            }}
          >
            {label.category === 'overdue'
              ? `${-label.days}d late`
              : label.category === 'tomorrow'
                ? 'tomorrow'
                : label.formattedDate}
          </span>
        )
      ) : (
        <span className="flex-none font-serif text-[13px] italic text-muted">no date</span>
      )}

      {!done && onStart && (
        <button
          type="button"
          onClick={onStart}
          className={`hl-swipe flex-none bg-transparent font-serif text-[13px] text-ink ${
            startOnHover
              ? 'opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100'
              : ''
          }`}
          style={
            course
              ? ({ '--hl': resolveTint(course.color, course.tint) } as React.CSSProperties)
              : undefined
          }
        >
          start
        </button>
      )}
    </div>
  );
}

function clockOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

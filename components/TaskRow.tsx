'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Course, Task } from '@/lib/data';
import { dueLabel } from '@/lib/utils';
import SwipeRow from './SwipeRow';
import HandCheck from './notebook/HandCheck';

/**
 * One task on a list: a 48px row on a grid, not a card.
 *
 * It is the same row on both, read two ways. A pointer gets columns that line
 * up down the page and actions that appear on hover, because a swipe is not
 * something anyone discovers with a mouse. A finger gets the row opening
 * sideways, right to complete and left to delete, the way every task row in
 * the app has always opened. The play mark is what replaced the floating
 * action button: a timer starts from the row it belongs to.
 *
 * Below md the course column folds away, since the colour mark beside the
 * title already says which course it is.
 */

/** The menu's own box, used to place it against the trigger. */
const MENU_W = 176;
const MENU_H = 224;

interface Props {
  task: Task;
  course: Course | undefined;
  selected?: boolean;
  focused?: boolean;
  running?: boolean;
  /** Whether that running timer is currently held. */
  paused?: boolean;
  /** Live clock, only passed for the row the timer is on. */
  runningLabel?: string;
  onToggle: (task: Task) => void;
  onStartTimer: (task: Task, el: HTMLElement) => void;
  /**
   * Hold the running timer, or let it go again. The control only draws when
   * this is given: it used to draw whenever a timer was running, and since
   * nothing ever passed a handler, every one of those was a pause button that
   * did nothing when pressed.
   */
  onTogglePause?: () => void;
  onOpen?: (task: Task) => void;
  onSelect?: (task: Task, additive: boolean) => void;
  onReschedule?: (task: Task) => void;
  /** Take the date off the task and leave it open ended. */
  onOpenEnded?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  /** Hide the course column on a screen that is already one course. */
  hideCourse?: boolean;
  /** Leave the date off, on a list already cut into days where it repeats. */
  hideDue?: boolean;
  /**
   * What the row is drawn on. `paper` is a row inside a panel, the Tasks
   * table. `page` is a row written straight onto the page, on Today and a
   * course page, where lists have no box around them: it takes the page's
   * own ground, so a swipe still has something opaque to slide, and washes
   * with the tint on hover.
   */
  ground?: 'paper' | 'page';
}

export default function TaskRow({
  task,
  course,
  selected = false,
  focused = false,
  running = false,
  paused = false,
  runningLabel,
  onToggle,
  onStartTimer,
  onTogglePause,
  onOpen,
  onSelect,
  onReschedule,
  onOpenEnded,
  onDelete,
  hideCourse = false,
  hideDue = false,
  ground = 'paper',
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const playRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Where the menu goes.
   *
   * It cannot be drawn inside the row. SwipeRow clips its children so the
   * swipe wash does not bleed past the row's edges, and the list panel clips
   * its own rounded corners, so a menu hanging below a 48px row was cut to
   * nothing: the button worked, aria-expanded flipped, all four items
   * rendered, and not one pixel of it was ever on screen. It is portalled to
   * the body and placed against the trigger's box instead, pulled back inside
   * the viewport and flipped above when a row near the bottom has no room.
   */
  function openMenu() {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(12, rect.right - MENU_W), window.innerWidth - MENU_W - 12);
    const below = rect.bottom + 6;
    const top = below + MENU_H > window.innerHeight ? Math.max(12, rect.top - MENU_H - 6) : below;
    setMenuPos({ top, left });
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onAway = (e: MouseEvent) => {
      const el = e.target as Node;
      // The menu is portalled out of the row, so it is no longer inside
      // menuRef; both it and the trigger have to be checked by hand.
      if (menuRef.current?.contains(el) || panelRef.current?.contains(el)) return;
      setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    // The position is measured once, so anything that moves the row out from
    // under the menu closes it rather than leaving it floating in place.
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onAway);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  const due = dueLabel(task.dueDate);
  const color = course?.color ?? 'var(--muted)';
  const mark = kindMark(task);
  const steps = stepCount(task);

  const row = (
    <div
      data-task-row={task.id}
      className={`group relative grid h-12 items-center gap-x-2 border-b border-line-soft pl-1 pr-2 text-ink transition-colors last:border-b-0 md:gap-x-0 ${
        selected ? 'bg-bg-tint' : ground === 'page' ? 'bg-bg hover:bg-bg-tint' : 'bg-paper hover:bg-paper-2'
      } ${task.completed ? 'opacity-50' : ''} ${
        hideDue
          ? hideCourse
            ? 'grid-cols-[40px_minmax(0,1fr)_40px] md:grid-cols-[40px_minmax(0,1fr)_128px_88px]'
            : 'grid-cols-[40px_minmax(0,1fr)_40px] md:grid-cols-[40px_minmax(0,1fr)_132px_128px_88px]'
          : hideCourse
            ? 'grid-cols-[40px_minmax(0,1fr)_78px_40px] md:grid-cols-[40px_minmax(0,1fr)_128px_88px]'
            : 'grid-cols-[40px_minmax(0,1fr)_78px_40px] md:grid-cols-[40px_minmax(0,1fr)_132px_128px_88px]'
      }`}
      style={{
        boxShadow: focused ? 'inset 0 0 0 1.5px var(--ink)' : undefined,
        borderRadius: focused ? 6 : undefined,
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          if ((e.metaKey || e.ctrlKey || e.shiftKey) && onSelect) {
            onSelect(task, true);
            return;
          }
          onToggle(task);
        }}
        aria-label={task.completed ? 'Mark incomplete' : 'Complete'}
        className="grid h-10 w-10 place-items-center bg-transparent"
      >
        <span
          className={`grid h-[18px] w-[18px] place-items-center ${task.completed ? 'rounded-md' : 'scribble-box'}`}
          style={task.completed ? { background: color, border: `1.4px solid ${color}` } : undefined}
        >
          {task.completed && <HandCheck size={12} color="var(--paper)" strokeWidth={1.8} />}
        </span>
      </button>

      {/* The title is the way into the task. A full-bleed button behind the
          row would swallow the controls beside it, so the title itself is the
          target and everything else on the row keeps its own.

          `md:pr-3.5` reserves a gap before the due-date column: the grid's
          own gap-x is zeroed at that width (below it, gap-x-2 already does
          the job), and whichever badge — steps, mark or the running clock —
          happens to be last in this row otherwise lands flush against it. */}
      <span className="flex min-w-0 items-center gap-2 md:pr-3.5">
        {task.priority === 'high' && !task.completed && (
          <span
            aria-hidden
            className="font-hand shrink-0 text-[13px] font-semibold text-priority"
            style={{ transform: 'rotate(-3deg)' }}
            title="High priority"
          >
            !!
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpen?.(task)}
          className={`min-w-0 flex-1 truncate bg-transparent text-left text-[14px] leading-[1.3] ${
            onOpen ? 'task-open cursor-pointer' : ''
          }`}
          title={onOpen ? `${task.title} — open it` : task.title}
        >
          {task.title}
        </button>
        {/* How far through its steps a task is, and the only thing on the row
            that says it has any. Without it a task with four steps reads
            exactly like one with none, and nobody opens it to find out. */}
        {steps && (
          <span
            className="tnum shrink-0 font-mono text-[10.5px] text-muted"
            title={`${steps.done} of ${steps.total} steps done`}
          >
            {steps.done}/{steps.total}
          </span>
        )}
        {mark && !running && (
          <span
            className="hidden shrink-0 font-mono text-[10.5px] tracking-[0.04em] text-muted md:inline"
            title={mark.title}
          >
            {mark.label}
          </span>
        )}
        {running && (
          <span
            className="shrink-0 font-mono text-[11px] tabular-nums"
            style={{ color }}
            aria-label={paused ? 'Timer held on this task' : 'Timer running on this task'}
          >
            {runningLabel ?? (paused ? 'held' : 'running')}
          </span>
        )}
      </span>

      {!hideCourse && (
        <span className="hidden min-w-0 items-center gap-2 text-[12px] text-ink-soft md:flex">
          <span
            aria-hidden
            className="block h-3.5 w-[3px] shrink-0 rounded-[1px]"
            style={{ background: color }}
          />
          <span className="truncate">{course?.code ?? '—'}</span>
        </span>
      )}

      {/* Under a heading that already names the day, the date only repeats
          it. The column stays on desktop, empty, so the courses still line
          up down the page; on a phone it gives its width to the title. */}
      {hideDue ? (
        <span aria-hidden className="hidden md:block" />
      ) : (
        <span
          className={`tnum font-mono text-[10.5px] tracking-[0.02em] md:text-[11.5px] ${
          due?.category === 'overdue'
            ? 'text-warn'
            : due?.category === 'today'
              ? 'hl-swipe text-ink'
              : !due && !task.completed
                ? 'text-muted-soft'
                : 'text-muted'
        }`}
      >
        {task.completed
          ? 'done'
          : due
            ? due.category === 'overdue'
              ? `${due.formattedDate} · ${-due.days}d`
              : due.category === 'today'
                ? 'today'
                : due.formattedDate
            : 'open ended'}
        </span>
      )}

      <span className="flex justify-end gap-0.5">
        {!task.completed &&
          (running ? (
            onTogglePause && (
              <button
                type="button"
                onClick={onTogglePause}
                aria-label={paused ? 'Let the timer run again' : 'Hold the timer'}
                className="grid h-10 w-10 place-items-center rounded-[10px] bg-transparent transition-colors hover:bg-bg-tint"
                style={{ color }}
              >
                {paused ? (
                  <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5l12 7-12 7V5z" />
                  </svg>
                ) : (
                  <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 5v14M15 5v14" />
                  </svg>
                )}
              </button>
            )
          ) : (
            <button
              ref={playRef}
              type="button"
              onClick={() => playRef.current && onStartTimer(task, playRef.current)}
              aria-label={`Start timer on ${task.title}`}
              className="grid h-10 w-10 place-items-center rounded-[10px] bg-transparent text-ink-soft transition-opacity hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            >
              <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5l12 7-12 7V5z" />
              </svg>
            </button>
          ))}

        <div ref={menuRef} className="relative hidden md:block">
          <button
            type="button"
            onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
            aria-label="More actions"
            aria-expanded={menuOpen}
            className="grid h-10 w-10 place-items-center rounded-[10px] bg-transparent text-muted transition-opacity hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
        </div>
      </span>
    </div>
  );

  return (
    <>
      <SwipeRow
        accent={color}
        onComplete={task.completed ? undefined : () => onToggle(task)}
        onDelete={onDelete ? () => onDelete(task) : undefined}
        surfaceClassName="relative bg-paper"
      >
        {row}
      </SwipeRow>

      {menuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={`Actions for ${task.title}`}
            className="fixed z-[90] w-44 animate-fade-in rounded-[10px] border border-line bg-paper p-1 shadow-[0_8px_20px_rgba(57,48,36,.12)]"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {onOpen && (
              <MenuItem
                label="Open"
                onClick={() => {
                  setMenuOpen(false);
                  onOpen(task);
                }}
              />
            )}
            {/* Named for what it does. It moves the task to tomorrow and
                asks nothing, which is what "Tomorrow" on the Today panel
                already calls the same action; "Reschedule" promised a date
                picker that never opened. */}
            {onReschedule && !task.completed && (
              <MenuItem
                label="Tomorrow"
                onClick={() => {
                  setMenuOpen(false);
                  onReschedule(task);
                }}
              />
            )}
            {/* A task with no date is open ended: it is still on the list,
                it just is not promised to a day. The item is drawn under
                every task so the state is visible either way, and does
                nothing on one that is already open ended. */}
            {onOpenEnded && !task.completed && (
              <MenuItem
                label="Open ended"
                disabled={!task.dueDate}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenEnded(task);
                }}
              />
            )}
            {onSelect && (
              <MenuItem
                label={selected ? 'Deselect' : 'Select'}
                onClick={() => {
                  setMenuOpen(false);
                  onSelect(task, true);
                }}
              />
            )}
            {onDelete && (
              <MenuItem
                label="Delete"
                tone="warn"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(task);
                }}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * What a row is, when it is not just a task: an exam, the pages of a reading,
 * or what a piece is worth. One mark rather than three, because the row has
 * 40-odd characters of title to protect and this is the margin note beside
 * it, not a column. Hidden on a phone, where the title already crowds the
 * date.
 */
/** A task's steps, or null when it has none to show. */
function stepCount(task: Task): { done: number; total: number } | null {
  const list = task.subtasks ?? [];
  if (list.length === 0) return null;
  return { done: list.filter((item) => item.completed).length, total: list.length };
}

function kindMark(task: Task): { label: string; title: string } | null {
  const weight = task.weight ?? 0;
  if (task.kind === 'exam') {
    return {
      label: weight > 0 ? `EXAM ${trim(weight)}%` : 'EXAM',
      title: weight > 0 ? `Exam, worth ${trim(weight)}% of the course` : 'Exam',
    };
  }
  if (task.kind === 'reading' && task.pages) {
    return { label: `${task.pages}pp`, title: `Reading, ${task.pages} pages` };
  }
  if (weight > 0) {
    return { label: `${trim(weight)}%`, title: `Worth ${trim(weight)}% of the course` };
  }
  return null;
}

function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function MenuItem({
  label,
  onClick,
  tone,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  tone?: 'warn';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 w-full items-center rounded-[8px] px-3 text-left text-[13px] transition-colors ${
        disabled
          ? 'cursor-default text-muted-soft'
          : `hover:bg-bg-tint ${tone === 'warn' ? 'text-warn' : 'text-ink-soft hover:text-ink'}`
      }`}
    >
      {label}
    </button>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { Course, Task } from '@/lib/data';
import { addSessionOptimistic } from '@/lib/data-hooks';
import { isoDate } from '@/lib/utils';
import { useLeaving } from './Leaving';
import DatePicker from './DatePicker';
import { ButtonSpinner } from './LoadingIndicator';

/** The lengths offered as marks; anything else is typed. */
const LENGTHS = [15, 30, 45, 60, 90, 120];
/** A hand-logged session is one sitting, so it is held to one sitting's length. */
const MAX_MINUTES = 8 * 60;

/**
 * Time spent away from the timer, written down by hand.
 *
 * Study days count logged time and never a tick, so an hour with a paper
 * book on the bus has to be able to get in somehow. This is that way: the
 * course, the task if there was one, how long, and the day. It writes an
 * ordinary session with no chain, which everything that reads sessions
 * already understands as one unbroken stretch.
 */
export default function LogTimeSheet({
  open,
  course,
  tasks,
  onClose,
  onSaved,
}: {
  open: boolean;
  course: Course;
  /** The course's tasks, to attach the time to one. Open ones first. */
  tasks: Task[];
  onClose: () => void;
  onSaved?: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState<number>(30);
  const [typed, setTyped] = useState('');
  const [taskId, setTaskId] = useState<string>('');
  const [date, setDate] = useState(isoDate());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMinutes(30);
    setTyped('');
    setTaskId('');
    setDate(isoDate());
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const [shown, leaving] = useLeaving(open);
  if (!shown) return null;

  const typedMinutes = typed.trim() ? Math.round(Number(typed)) : null;
  const length = typedMinutes ?? minutes;
  const valid = Number.isFinite(length) && length >= 1 && length <= MAX_MINUTES;
  const future = date > isoDate();
  const choices = [
    ...tasks.filter((t) => !t.completed),
    ...tasks.filter((t) => t.completed && t.completedVia !== 'skip').slice(0, 8),
  ];

  async function save() {
    if (!valid || future || saving) return;
    setSaving(true);
    setError('');
    try {
      await addSessionOptimistic({
        courseId: course.id,
        taskId: taskId || null,
        date,
        durationSeconds: length * 60,
        note: '',
      });
      onSaved?.(length);
      onClose();
    } catch (err) {
      console.error('Failed to log time:', err);
      setError('That did not save. Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`sheet-lift fixed inset-0 z-[80] flex items-end ${leaving ? 'sheet-leaving' : 'animate-fade-in'}`}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 scrim backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Log time on ${course.code}`}
        className="relative max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-bg px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up md:mx-auto md:max-w-xl"
      >
        <div className="mx-auto mb-[18px] h-1 w-9 rounded-full bg-line-strong" />
        <p className="eyebrow m-0 text-ink-soft">
          <span
            aria-hidden
            className="course-rule relative -top-px mr-2"
            style={{ ['--c' as string]: course.color }}
          />
          {course.code}
        </p>
        <h3 className="mb-1.5 mt-2 font-serif text-[22px] font-medium tracking-[-0.01em]">Log time</h3>
        <p className="m-0 font-serif text-[13px] italic leading-[1.5] text-muted">
          For time spent without the timer, like a chapter on paper. It counts the way a timed
          session does.
        </p>

        <p className="eyebrow m-0 mt-6">How long</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          {LENGTHS.map((value) => {
            const chosen = !typed.trim() && minutes === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMinutes(value);
                  setTyped('');
                }}
                aria-pressed={chosen}
                className={`tnum bg-transparent px-0.5 font-mono text-[13px] ${
                  chosen ? 'hand-underline text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {value < 60 ? `${value}m` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}`}
              </button>
            );
          })}
          <label className="flex items-baseline gap-1.5 font-serif text-[13px] italic text-muted">
            or
            <input
              inputMode="numeric"
              value={typed}
              onChange={(event) => setTyped(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              aria-label="Minutes"
              placeholder="—"
              className="tnum w-12 border-0 border-b border-line-strong bg-transparent text-center font-mono text-[13px] not-italic text-ink outline-none"
            />
            minutes
          </label>
        </div>

        <p className="eyebrow m-0 mt-6">On</p>
        <div className="mt-2">
          <DatePicker value={date} onChange={(value) => setDate(value || isoDate())} allowClear={false} />
        </div>

        {choices.length > 0 && (
          <>
            <p className="eyebrow m-0 mt-6">Against a task</p>
            <select
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              aria-label="Task"
              className="mt-2 w-full rounded-[10px] border border-line bg-paper px-3 py-2.5 text-[14px] text-ink"
            >
              <option value="">No task, just the course</option>
              {choices.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.completed ? `${task.title} (done)` : task.title}
                </option>
              ))}
            </select>
          </>
        )}

        {(!valid || future || error) && (
          <p className="m-0 mt-4 font-serif text-[13px] italic text-warn">
            {error ||
              (future
                ? 'That day has not happened yet.'
                : `Between 1 minute and ${MAX_MINUTES / 60} hours.`)}
          </p>
        )}

        <div className="mt-7 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || future || saving}
            onClick={save}
            className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast disabled:opacity-40"
          >
            {saving ? <ButtonSpinner /> : 'Save'}
          </button>
        </div>
      </section>
    </div>
  );
}

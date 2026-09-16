'use client';

import { useEffect, useRef, useState } from 'react';
import type { Course, Task } from '@/lib/data';
import { formatHM } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import HandCheck from '@/components/notebook/HandCheck';
import { Eyebrow } from '@/components/notebook/Marks';

/**
 * What did you actually do?
 *
 * The note is the point of this sheet. A duration on its own is a number that
 * will mean nothing in a week; one line about where you got to is the thing
 * the course page can hand back to you next time you sit down, and it is what
 * the "you left off at Q3" line on Today is made of.
 *
 * So the sheet asks one question, on ruled paper, with the writing area
 * already focused — and Skip is a real answer, in the smaller of the two
 * buttons. Nothing here nags: a session with no note is still a session.
 */

/**
 * Quick marks, appended to the note as `#tag`. The data shape stays a plain
 * string, so this needed no migration and none of it is a schema decision.
 */
const MARKS = ['focused', 'scattered', 'reading', 'writing', 'practice'];

interface Props {
  open: boolean;
  course: Course | null;
  /** What was being worked on, when a task was carried into the session. */
  task?: Task | null;
  durationSeconds: number;
  /** True when the block ran without a pause, which is worth saying. */
  unbroken?: boolean;
  saving?: boolean;
  errorMessage?: string;
  contextMessage?: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export default function SessionLogModal({
  open,
  course,
  task = null,
  durationSeconds,
  unbroken = false,
  saving = false,
  errorMessage = '',
  contextMessage = '',
  onCancel,
  onSave,
}: Props) {
  const [note, setNote] = useState('');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  // Opening a sheet without moving focus into it leaves a keyboard or screen
  // reader user still standing on the page behind, with no way to know a
  // question was asked. The writing area takes it, since writing is the ask.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      (noteRef.current ?? sheetRef.current)?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !course) return null;

  const safeSeconds = clampSessionSeconds(durationSeconds);
  const canSave = isLoggableDuration(durationSeconds) && !saving;
  const finished = task?.subtasks?.filter((s) => s.completed) ?? [];

  function toggleMark(mark: string) {
    const tag = `#${mark}`;
    setNote((current) =>
      current.includes(tag)
        ? current.replace(tag, '').replace(/\s{2,}/g, ' ').trim()
        : `${current.trim()} ${tag}`.trim(),
    );
  }

  return (
    <div className="fixed inset-0 z-[90] flex animate-fade-in items-end">
      <button
        type="button"
        aria-label="Discard this session"
        onClick={onCancel}
        className="scrim absolute inset-0 backdrop-blur-sm"
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-note-question"
        className="app-scroll relative max-h-[92dvh] w-full animate-slide-up overflow-y-auto border-t border-line-strong bg-bg px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 md:mx-auto md:max-w-xl"
      >
        <span aria-hidden className="mx-auto mb-5 block h-1 w-9 rounded-sm bg-line-strong" />

        <Eyebrow style={{ color: course.color }}>
          {course.code}
          {task ? ` · ${task.title}` : ''}
        </Eyebrow>

        <div className="mt-2.5 flex items-end gap-3">
          <p className="m-0 font-mono text-[40px] font-bold leading-none tracking-[-0.03em]">
            {formatHM(safeSeconds)}
          </p>
          {unbroken && (
            <p className="m-0 mb-1.5 font-serif text-[15px] italic text-muted">
              the whole block, no pauses
            </p>
          )}
        </div>

        {contextMessage && (
          <p className="mt-2 font-serif text-[13px] italic text-muted">{contextMessage}</p>
        )}

        <p id="session-note-question" className="eyebrow mb-2.5 mt-6">
          What did you actually do?
        </p>
        <textarea
          ref={noteRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Got through Q3 and Q4. Still shaky on tax incidence."
          className="ruled-note min-h-[112px] w-full resize-none border-y border-line bg-transparent py-3 font-serif text-[16px] text-ink placeholder:text-muted"
        />

        <div className="mt-3.5 flex flex-wrap items-baseline gap-4">
          {MARKS.map((mark) => {
            const on = note.includes(`#${mark}`);
            return (
              <button
                key={mark}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMark(mark)}
                className={`bg-transparent font-serif text-[14.5px] ${
                  on ? 'hl-swipe text-ink' : 'text-muted hover:text-ink-soft'
                }`}
              >
                {mark}
              </button>
            );
          })}
        </div>

        {/* What got ticked off during the session, so the sheet confirms the
            work rather than only the time. */}
        {finished.length > 0 && (
          <div className="mt-5">
            {finished.map((sub, i) => (
              <div
                key={sub.id}
                className={`flex items-center gap-3 py-2.5 ${
                  i === finished.length - 1 ? '' : 'row-rule'
                }`}
              >
                <span
                  aria-hidden
                  className="flex h-[17px] w-[17px] flex-none items-center justify-center"
                  style={{ background: course.color, borderRadius: 4 }}
                >
                  <HandCheck size={11} color="var(--paper)" strokeWidth={1.8} />
                </span>
                <span className="flex-1 text-[13.5px] text-ink-soft">{sub.title}</span>
              </div>
            ))}
          </div>
        )}

        {errorMessage && (
          <p className="mt-4 font-serif text-[13.5px] italic text-priority">{errorMessage}</p>
        )}

        <div className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[52px] flex-none border border-line-strong bg-transparent px-[18px] text-sm text-ink-soft"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => onSave(note.trim())}
            disabled={!canSave}
            className="min-h-[52px] flex-1 bg-primary text-sm font-medium text-primary-contrast disabled:opacity-30"
          >
            {saving ? 'Logging…' : `Log ${formatHM(safeSeconds)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

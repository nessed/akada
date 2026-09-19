'use client';

import { useEffect, useRef, useState } from 'react';
import type { Course, Task } from '@/lib/data';
import { formatHHMMSS } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import HandCheck from '@/components/notebook/HandCheck';
import { ButtonSpinner } from './LoadingIndicator';

// Quick-reflection tag chips. Tapping appends `#tag` into the note so the
// data shape stays the same, no schema migration needed for this flourish.
const REFLECTION_TAGS = ['focused', 'distracted', 'reading', 'writing', 'practice'];

interface Props {
  open: boolean;
  course: Course | null;
  /** The task the session was against, when it was against one. */
  task?: Task | null;
  durationSeconds: number;
  saving?: boolean;
  errorMessage?: string;
  contextMessage?: string;
  onCancel: () => void;
  onSave: (note: string, markTaskDone: boolean) => void;
}

export default function SessionLogModal({
  open,
  course,
  task = null,
  durationSeconds,
  saving = false,
  errorMessage = '',
  contextMessage = '',
  onCancel,
  onSave,
}: Props) {
  const [note, setNote] = useState('');
  const [markDone, setMarkDone] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      // Never pre-ticked. Finishing a block is not the same as finishing the
      // chapter, and a box that arrives ticked gets confirmed without being
      // read.
      setMarkDone(false);
    }
  }, [open]);

  // Opening a sheet without moving focus into it leaves a keyboard or screen
  // reader user still standing on the page behind, with no way to know a
  // question was asked.
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.focus();
  }, [open]);

  if (!open || !course) return null;
  const canSave = isLoggableDuration(durationSeconds) && !saving;
  const safeSeconds = clampSessionSeconds(durationSeconds);
  // Big mono digits, same `00:48:23` shape as the timer ring so the user sees
  // the same number style they were watching mid-session.
  // A recovered session can run to the 18h ceiling, and the old readout was
  // total minutes, so that arrived as "1080:00". Hours get their own place
  // once there are any, the way the ring shows them.
  const hoursPart = Math.floor(safeSeconds / 3600);
  const minutesPart = String(
    hoursPart > 0 ? Math.floor((safeSeconds % 3600) / 60) : Math.floor(safeSeconds / 60),
  ).padStart(2, '0');
  const secondsPart = String(safeSeconds % 60).padStart(2, '0');

  function toggleTag(tag: string) {
    const token = `#${tag}`;
    const has = new RegExp(`(^|\\s)${token}(\\s|$)`).test(note);
    if (has) {
      setNote((current) =>
        current.replace(new RegExp(`(^|\\s)${token}(\\s|$)`, 'g'), ' ').trim(),
      );
    } else {
      setNote((current) => (current ? `${current.trim()} ${token}` : token));
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end animate-fade-in">
      {/* The scrim was a real <button> with an aria-label and no onClick: a
          focus stop that announced itself and then did nothing. Dismissing
          here discards a session, which is not something a stray tap on the
          backdrop should decide, so it is a surface now, not a control. */}
      <div aria-hidden className="absolute inset-0 scrim backdrop-blur-sm" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-log-heading"
        tabIndex={-1}
        className="relative w-full md:mx-auto md:max-w-xl bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up outline-none"
      >
        <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />

        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: course.color }}
          />
          <p
            className="eyebrow m-0"
            style={{ color: course.color }}
          >
            {course.code} · {course.name}
          </p>
        </div>
        <h3
          id="session-log-heading"
          className="mt-2 mb-0 font-serif font-medium text-[26px] tracking-[-0.015em]"
        >
          Log this <span className="italic">session</span>?
        </h3>

        <div className="mt-3.5 flex items-baseline gap-3">
          <span className="font-mono font-semibold tabular-nums text-[52px] leading-[0.95] tracking-[-0.03em] text-ink">
            {hoursPart > 0 && `${hoursPart}:`}
            {minutesPart}
            <span className="text-muted-soft">:{secondsPart}</span>
          </span>
          <span className="font-serif italic text-[13px] text-muted">focused</span>
        </div>

        {contextMessage && (
          <p className="mt-2 text-[12px] leading-[1.45] text-muted">{contextMessage}</p>
        )}

        {/* What the session was against, and the one thing worth asking at
            the end of it. */}
        {task && (
          <button
            type="button"
            onClick={() => setMarkDone((v) => !v)}
            role="switch"
            aria-checked={markDone}
            className="mt-4 flex w-full items-center gap-3 rounded-[10px] border border-line bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-paper-2"
          >
            <span
              aria-hidden
              className="scribble-box grid h-[21px] w-[21px] shrink-0 place-items-center"
              style={{ borderColor: markDone ? 'var(--ink)' : 'var(--line-strong)' }}
            >
              {markDone && <HandCheck size={14} color="var(--ink)" strokeWidth={1.7} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] text-ink">Mark the task done</span>
              <span className="mt-0.5 block truncate text-[12px] text-muted">{task.title}</span>
            </span>
          </button>
        )}

        <div className="mt-4">
          <label htmlFor="session-log-note" className="eyebrow m-0 mb-2 block">
            What did you do?
          </label>
          <textarea
            id="session-log-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional reflection…"
            className="w-full resize-none bg-paper border border-line rounded-[10px] p-3.5 text-[14px] font-serif italic text-ink leading-[1.5] outline-none focus:border-line-strong"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {REFLECTION_TAGS.map((tag) => {
            const active = new RegExp(`(^|\\s)#${tag}(\\s|$)`).test(note);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(tag)}
                className={`inline-flex min-h-[30px] items-center bg-transparent px-0.5 font-serif text-[13px] transition-colors ${
                  active ? 'hl-swipe text-ink' : 'text-muted-soft'
                }`}
                style={
                  active
                    ? ({ '--hl': course.tint || 'var(--bg-tint)' } as React.CSSProperties)
                    : undefined
                }
              >
                #{tag}
              </button>
            );
          })}
        </div>

        {errorMessage && (
          <p role="alert" className="mt-3 mb-0 text-[12px] leading-[1.45] text-priority font-serif italic">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-2.5 mt-5">
          <button
            type="button"
            onClick={saving ? undefined : onCancel}
            disabled={saving}
            aria-label="Discard pending session log"
            className="flex-1 min-h-[50px] py-3.5 rounded-[10px] bg-transparent border border-line-strong text-muted text-sm font-medium"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(note, markDone)}
            className="flex-1 min-h-[50px] py-3.5 rounded-[10px] bg-primary text-primary-contrast text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-35"
          >
            <HandCheck size={14} color="currentColor" />
            {saving ? <span className="flex items-center justify-center gap-2"><ButtonSpinner />Saving session…</span> : 'Save to journal'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { Course } from '@/lib/data';
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
  durationSeconds: number;
  saving?: boolean;
  errorMessage?: string;
  contextMessage?: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export default function SessionLogModal({
  open,
  course,
  durationSeconds,
  saving = false,
  errorMessage = '',
  contextMessage = '',
  onCancel,
  onSave,
}: Props) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  if (!open || !course) return null;
  const canSave = isLoggableDuration(durationSeconds) && !saving;
  const safeSeconds = clampSessionSeconds(durationSeconds);
  // Big mono digits, same `00:48:23` shape as the timer ring so the user sees
  // the same number style they were watching mid-session.
  const totalMinutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const minutesPart = String(totalMinutes).padStart(2, '0');
  const secondsPart = String(seconds).padStart(2, '0');

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
      <button
        type="button"
        aria-label="Session log backdrop"
        disabled={saving}
        className="absolute inset-0 bg-ink/35 backdrop-blur-sm cursor-default"
      />
      <div className="relative w-full md:mx-auto md:max-w-xl bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
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
        <h3 className="mt-2 mb-0 font-serif font-medium text-[26px] tracking-[-0.015em]">
          Log this <span className="italic">session</span>?
        </h3>

        <div className="mt-3.5 flex items-baseline gap-3">
          <span className="font-mono font-semibold tabular-nums text-[52px] leading-[0.95] tracking-[-0.03em] text-ink">
            {minutesPart}
            <span className="text-muted-soft">:{secondsPart}</span>
          </span>
          <span className="font-serif italic text-[13px] text-muted">focused</span>
        </div>

        {contextMessage && (
          <p className="mt-2 text-[12px] leading-[1.45] text-muted">{contextMessage}</p>
        )}

        <div className="mt-4">
          <p className="eyebrow m-0 mb-2 text-muted">
            What did you do?
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional reflection…"
            className="w-full resize-none bg-paper border border-line rounded-[12px] p-3.5 text-[14px] font-serif italic text-ink leading-[1.5] outline-none focus:border-line-strong"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {REFLECTION_TAGS.map((tag) => {
            const active = new RegExp(`(^|\\s)#${tag}(\\s|$)`).test(note);
            return (
              <button
                key={tag}
                type="button"
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
          <p className="mt-3 mb-0 text-[12px] leading-[1.45] text-priority font-serif italic">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-2.5 mt-5">
          <button
            type="button"
            onClick={saving ? undefined : onCancel}
            disabled={saving}
            aria-label="Discard pending session log"
            className="flex-1 min-h-[50px] py-3.5 rounded-[12px] bg-transparent border border-line-strong text-muted text-[13px] font-medium"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(note)}
            className="flex-[2] min-h-[50px] py-3.5 rounded-[10px] bg-primary text-primary-contrast text-[14px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-35"
          >
            <HandCheck size={14} color="currentColor" />
            {saving ? <span className="flex items-center justify-center gap-2"><ButtonSpinner />Saving session…</span> : 'Save to journal'}
          </button>
        </div>
      </div>
    </div>
  );
}

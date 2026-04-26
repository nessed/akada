'use client';

import { useEffect, useState } from 'react';
import type { Course } from '@/lib/data';
import { formatHM } from '@/lib/utils';

interface Props {
  open: boolean;
  course: Course | null;
  durationSeconds: number;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export default function SessionLogModal({
  open,
  course,
  durationSeconds,
  onCancel,
  onSave,
}: Props) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  if (!open || !course) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end animate-fade-in">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
      />
      <div className="relative w-full bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up">
        <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />

        <p
          className="m-0 text-[11px] font-semibold tracking-[0.16em] uppercase"
          style={{ color: course.color }}
        >
          {course.code}
        </p>
        <h3 className="mt-1 mb-0 font-serif font-medium text-[22px] tracking-[-0.01em]">
          Logged {formatHM(durationSeconds)}
        </h3>
        <p className="mt-1.5 mb-[18px] text-[13px] text-muted font-serif italic">
          A small note for your future self?
        </p>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Optional reflection…"
          className="w-full resize-none bg-paper border border-line rounded-[10px] p-3.5 text-sm font-serif italic text-ink outline-none focus:border-line-strong"
        />

        <div className="flex gap-2.5 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-[10px] bg-transparent border border-line-strong text-ink-soft text-sm font-medium"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => onSave(note)}
            className="flex-1 py-3.5 rounded-[10px] bg-ink text-bg text-sm font-medium"
          >
            Save session
          </button>
        </div>
      </div>
    </div>
  );
}

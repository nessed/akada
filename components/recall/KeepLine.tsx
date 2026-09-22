'use client';

import { useState } from 'react';
import { useNotice } from '@/components/Notice';
import { keepLine } from '@/lib/recall/actions';

/**
 * A line to write a thing to keep on.
 *
 * Drawn the way the subtask sheet's "one more step…" is: a dashed box where a
 * tick would go, the placeholder in the serif, and a word to press rather
 * than a button. What is written becomes something recall asks about from
 * tomorrow. Keeping it short is the reader's business; the prompt is simply
 * whatever they would want to be asked.
 */
export default function KeepLine({
  courseId,
  placeholder = 'something worth keeping…',
  className = '',
}: {
  courseId: string;
  placeholder?: string;
  className?: string;
}) {
  const { notify } = useNotice();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const line = text.trim();
    if (!line || saving) return;
    setSaving(true);
    try {
      await keepLine(courseId, line, 'own');
      setText('');
    } catch (error) {
      console.error('Failed to keep that:', error);
      notify(error instanceof Error ? error.message : 'That was not kept.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className={`flex items-center gap-3 ${className}`}
    >
      <span
        aria-hidden
        className="h-[17px] w-[17px] shrink-0 rounded-[5px] border border-dashed border-line-strong opacity-60"
      />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label="Something to keep for recall"
        maxLength={300}
        className="min-w-0 flex-1 border-0 bg-transparent font-serif text-[14px] italic text-ink outline-none placeholder:text-muted-soft"
      />
      <button
        type="submit"
        disabled={!text.trim() || saving}
        className="hand-underline bg-transparent px-0.5 font-serif text-[13px] text-ink disabled:opacity-30"
      >
        {saving ? 'Keeping' : 'Keep'}
      </button>
    </form>
  );
}

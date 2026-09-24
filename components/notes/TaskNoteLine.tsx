'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useNotes } from '@/lib/data-hooks';
import { minutesForNote, readingPace } from '@/lib/notes/reads';
import { readProgress, readSection, wordCount } from '@/lib/notes/store';

/**
 * On a task's sheet, the note it is studied from: where it was left and the
 * way back into it. Resuming is the reader's own place; focus picks up in
 * the same section.
 */
export default function TaskNoteLine({ taskId }: { taskId: string }) {
  const { notes } = useNotes();
  const pace = useMemo(() => readingPace(notes), [notes]);
  const linked = notes.filter((n) => n.taskId === taskId);
  if (!linked.length) return null;
  return (
    <div className="mt-4 grid gap-2">
      {linked.map((note) => {
        const minutes = minutesForNote(note, wordCount(note.markdown), pace);
        const done = readProgress(note.id);
        const section = readSection(note.id);
        const started = done > 0.03 && done < 0.98;
        const left = Math.max(1, Math.round(minutes * (1 - done)));
        const href = `/notes?n=${encodeURIComponent(note.id)}`;
        return (
          <div key={note.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-[13.5px] text-ink-soft">
            <span className="eyebrow">Note</span>
            <Link href={href} className="hand-underline text-ink">
              {note.title}
            </Link>
            <span className="italic text-muted">
              {started
                ? `${section ? `in ${section} · ` : ''}${left} min left`
                : done >= 0.98
                  ? note.reads.length
                    ? `read through in ${Math.max(1, Math.round(note.reads[note.reads.length - 1].seconds / 60))} min`
                    : 'read through'
                  : `~${minutes} min`}
            </span>
            <span className="flex gap-3 font-sans text-[12.5px]">
              <Link href={href} className="text-ink-soft hover:text-ink">
                {started ? 'Resume' : 'Read'}
              </Link>
              <Link href={`${href}&focus=1&from=saved`} className="text-ink-soft hover:text-ink">
                Focus
              </Link>
            </span>
          </div>
        );
      })}
    </div>
  );
}

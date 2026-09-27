'use client';

import { useCallback, useState } from 'react';
import type { TaskKind } from '@/lib/data';
import { looksLikeReading } from '@/lib/recall';

const KINDS: { v: TaskKind; l: string }[] = [
  { v: 'task', l: 'Task' },
  { v: 'reading', l: 'Reading' },
  { v: 'exam', l: 'Exam' },
];

/** A typed number, or null for blank. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * What a new or edited task is, as the form holds it while it is typed.
 *
 * The kind follows the title until it is picked by hand: "Read Mankiw Ch 4"
 * arrives as a reading on its own, and a kind chosen by hand always wins over
 * what the title looks like. Pages belong to a reading, a weight to anything
 * graded, so each is kept only for the kind that carries it.
 */
export function useKindDraft(initial?: { kind?: TaskKind; pages?: number | null; weight?: number | null }) {
  const [chosen, setChosen] = useState<TaskKind | null>(initial?.kind ?? null);
  const [pages, setPages] = useState(initial?.pages ? String(initial.pages) : '');
  const [weight, setWeight] = useState(initial?.weight != null ? String(initial.weight) : '');

  // Stable, so a screen can reset the form from inside its own effects.
  const reset = useCallback(
    (next?: { kind?: TaskKind; pages?: number | null; weight?: number | null }) => {
      setChosen(next?.kind ?? null);
      setPages(next?.pages ? String(next.pages) : '');
      setWeight(next?.weight != null ? String(next.weight) : '');
    },
    [],
  );

  const kindFor = (title: string): TaskKind =>
    chosen ?? (looksLikeReading({ kind: 'task', title }) ? 'reading' : 'task');

  return {
    chosen,
    pages,
    weight,
    setKind: setChosen,
    setPages,
    setWeight,
    kindFor,
    /** Back to a blank form, or to a task's own values for editing it. */
    reset,
    /** The fields to write for a task with this title. */
    fields(title: string): { kind: TaskKind; pages: number | null; weight: number | null } {
      const kind = kindFor(title);
      return {
        kind,
        pages: kind === 'reading' ? numberOrNull(pages) : null,
        weight: numberOrNull(weight),
      };
    },
  };
}

export type KindDraft = ReturnType<typeof useKindDraft>;

/**
 * Task / Reading / Exam, and the one figure each carries: pages for a
 * reading, the share of the grade for a task or an exam. The same control in
 * the New task form, the inline adders and the Edit sheet, so the forms
 * cannot drift apart. Knowing a row is a reading is what turns its pages into
 * hours, brings it back in recall, and lets a weight count toward the grade.
 */
export default function KindFields({
  draft,
  title,
  compact = false,
}: {
  draft: KindDraft;
  /** The title as typed, which picks the kind until one is picked by hand. */
  title: string;
  /** The inline adder's size, a step down from a sheet's. */
  compact?: boolean;
}) {
  const kind = draft.kindFor(title);
  const h = compact ? 'h-9' : 'h-11';
  const inner = compact ? 'h-7' : 'h-9';
  const field = `flex ${h} shrink-0 items-center gap-1 rounded-[10px] border border-line bg-paper px-3`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label="What this is"
        className={`flex ${h} min-w-[216px] flex-1 items-center rounded-[10px] border border-line bg-paper p-1`}
      >
        {KINDS.map((option) => (
          <button
            key={option.v}
            type="button"
            role="radio"
            aria-checked={kind === option.v}
            onClick={() => draft.setKind(option.v)}
            className={`${inner} flex-1 rounded-[7px] text-[13px] transition-colors ${
              kind === option.v ? 'bg-bg-tint font-medium text-ink' : 'bg-transparent text-muted hover:text-ink'
            }`}
          >
            {option.l}
          </button>
        ))}
      </div>

      {kind === 'reading' ? (
        <label className={`${field} w-[92px]`}>
          <input
            value={draft.pages}
            onChange={(e) => draft.setPages(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="—"
            aria-label="Pages"
            className="w-full min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[14px] text-ink outline-none placeholder:text-muted-soft"
          />
          <span aria-hidden className="font-mono text-[11px] text-muted">pp</span>
        </label>
      ) : (
        <label className={`${field} w-[80px]`} title="What it is worth, as a share of the course grade. Optional.">
          <input
            value={draft.weight}
            onChange={(e) => draft.setWeight(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            placeholder="—"
            aria-label="Worth, as a percentage of the course grade"
            className="w-full min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[14px] text-ink outline-none placeholder:text-muted-soft"
          />
          <span aria-hidden className="font-mono text-[11px] text-muted">%</span>
        </label>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { Assessment, Course, Task } from '@/lib/data';
import { gradeStanding } from '@/lib/derive';
import { updateCourseOptimistic } from '@/lib/data-hooks';
import { useNotice } from '@/components/Notice';
import { ButtonSpinner } from '@/components/LoadingIndicator';
import { daysBetween } from '@/lib/utils';

/**
 * Where the grade stands, and where it gets entered.
 *
 * The headline is two numbers rather than one: how much of the course has
 * actually been marked, and what was scored out of that. A single "86%" is a
 * lie by omission when only a quarter of the course has come back, and it is
 * the number every other planner shows.
 *
 * Reading and editing are the same panel. The old build put the standing on
 * the course page and the entry three screens away in settings, which meant
 * the moment you had a mark in your hand was never the moment you could type
 * it in. A piece that has not come back takes a dash, not a zero.
 */
export default function GradeStanding({
  course,
  tasks,
  today,
}: {
  course: Course;
  tasks: Task[];
  today: string;
}) {
  const { notify } = useNotice();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Assessment[]>(course.assessments ?? []);
  const [saving, setSaving] = useState(false);

  const standing = useMemo(() => gradeStanding(course), [course]);
  const draftTotal = rows.reduce((acc, r) => acc + r.weight, 0);

  function open() {
    setRows(course.assessments?.length ? course.assessments : [blankRow(0)]);
    setEditing(true);
  }

  function patch(id: string, next: Partial<Assessment>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await updateCourseOptimistic(course.id, {
        assessments: rows.filter((r) => r.label.trim() && r.weight > 0),
      });
      setEditing(false);
    } catch (error) {
      console.error('Failed to save grading:', error);
      notify('That grading did not save.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <section className="rounded-[14px] border border-line bg-paper p-5">
        <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
          <p className="eyebrow m-0">How it is marked</p>
          <span
            className="tnum font-mono text-[11px]"
            style={{ color: draftTotal > 100 ? 'var(--warn)' : 'var(--muted)' }}
          >
            {round(draftTotal)}% of 100
          </span>
        </div>

        <div className="pt-1">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5 border-b border-line-soft py-2 last:border-b-0">
              <input
                value={row.label}
                onChange={(e) => patch(row.id, { label: e.target.value })}
                placeholder="Midterm"
                aria-label="What this piece is"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none placeholder:text-muted-soft"
              />
              <input
                value={row.weight || ''}
                onChange={(e) => patch(row.id, { weight: percent(e.target.value) })}
                inputMode="decimal"
                placeholder="0"
                aria-label={`${row.label || 'This piece'} is worth, as a percentage of the course`}
                className="w-[34px] min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[13px] text-muted outline-none"
              />
              <span aria-hidden className="font-mono text-[10px] text-muted-soft">%</span>
              {/* Score and out-of sit together so an empty score reads as
                  "not back yet" rather than as a zero. */}
              <input
                value={row.score ?? ''}
                onChange={(e) =>
                  patch(row.id, {
                    score: e.target.value === '' ? null : number(e.target.value),
                    outOf: row.outOf ?? 100,
                  })
                }
                inputMode="decimal"
                placeholder="—"
                aria-label={`${row.label || 'This piece'}, what you scored`}
                className="ml-1.5 w-[36px] min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[13px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted-soft"
              />
              <span aria-hidden className="font-mono text-[10px] text-muted-soft">/</span>
              <input
                value={row.outOf ?? ''}
                onChange={(e) =>
                  patch(row.id, { outOf: e.target.value === '' ? null : number(e.target.value) || null })
                }
                inputMode="decimal"
                placeholder="100"
                aria-label={`${row.label || 'This piece'}, out of`}
                className="w-[30px] min-w-0 border-0 bg-transparent p-0 font-mono text-[13px] text-muted outline-none placeholder:text-muted-soft"
              />
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                aria-label={`Remove ${row.label || 'this piece'}`}
                className="ml-0.5 grid h-7 w-6 shrink-0 place-items-center bg-transparent font-mono text-[14px] text-muted-soft transition-colors hover:text-warn"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows((current) => [...current, blankRow(current.length)])}
          className="mt-2 bg-transparent p-0 font-serif text-[13px] italic text-muted transition-colors hover:text-ink"
        >
          + another piece…
        </button>

        {draftTotal > 100 && (
          <p className="m-0 mt-2.5 font-serif text-[12px] italic text-warn">
            That comes to more than 100%.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-10 flex-1 rounded-[10px] border border-line-strong text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-10 flex-1 rounded-[10px] bg-primary text-[13px] font-medium text-primary-contrast disabled:opacity-40"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <ButtonSpinner />
                Saving
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </section>
    );
  }

  if (standing.rows.length === 0) {
    return (
      <section className="rounded-[14px] border border-line bg-paper p-5">
        <p className="eyebrow m-0">Where the grade stands</p>
        <p className="m-0 mt-2.5 font-serif text-[15px] leading-[1.45] text-ink-soft">
          Akada does not know how {course.code} is marked yet.
        </p>
        <button
          type="button"
          onClick={open}
          className="mt-3.5 h-10 w-full rounded-[10px] border border-dashed border-line-strong text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
        >
          Say how it is marked
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-[14px] border border-line bg-paper p-5">
      <div className="flex items-baseline justify-between border-b border-line-soft pb-2.5">
        <p className="eyebrow m-0">Where the grade stands</p>
        <button
          type="button"
          onClick={open}
          className="bg-transparent p-0 font-serif text-[12px] italic text-muted transition-colors hover:text-ink"
        >
          edit
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2.5">
        <p className="m-0 max-w-[18ch] font-serif text-[17px] leading-[1.25]">
          {round(standing.marked)}% marked
          {standing.percent !== null && `, and you are at ${round(standing.earned)} of it.`}
        </p>
        {standing.percent !== null && (
          <p className="m-0 flex-none font-mono text-[24px] font-semibold leading-[0.9] tabular-nums">
            {standing.percent}
            <span className="text-[12px] font-normal text-muted">%</span>
          </p>
        )}
      </div>

      <div className="mt-3">
        {standing.rows.map((row) => {
          const marked = row.score !== null && row.outOf;
          const ratio = marked ? (row.score as number) / (row.outOf as number) : null;
          // The dated piece this row is waiting on, so an unmarked midterm can
          // say how far off it is rather than sitting blank.
          const upcoming = tasks.find(
            (t) =>
              !t.completed &&
              t.dueDate &&
              t.dueDate >= today &&
              t.title.toLowerCase() === row.label.toLowerCase(),
          );
          return (
            <div
              key={row.id}
              className="flex items-baseline gap-2.5 border-b border-line-soft py-2 last:border-b-0"
            >
              <span
                className="min-w-0 flex-1 truncate text-[13px]"
                style={{ color: marked ? undefined : 'var(--ink-soft)' }}
              >
                {row.label}
                {upcoming && (
                  <span className="ml-1.5 font-serif italic text-warn">
                    in {daysBetween(today, upcoming.dueDate as string)}d
                  </span>
                )}
              </span>
              <span className="tnum shrink-0 font-mono text-[11px] text-muted">{round(row.weight)}%</span>
              <span className="w-[46px] flex-none text-right">
                {marked ? (
                  <span
                    className="tnum font-mono text-[12px] font-semibold"
                    style={{ color: (ratio as number) < 0.66 ? 'var(--warn)' : undefined }}
                  >
                    {row.outOf === 100 ? row.score : `${row.score}/${row.outOf}`}
                  </span>
                ) : (
                  <span aria-label="Not marked yet" className="flex justify-end">
                    <i aria-hidden className="block h-[1.4px] w-[18px] bg-line-strong" />
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {standing.unmarked > 0 && (
        <p className="m-0 mt-3 font-serif text-[13px] italic leading-[1.5] text-muted">
          {round(standing.unmarked)}% of {course.code} has not happened yet.
        </p>
      )}
    </section>
  );
}

function blankRow(index: number): Assessment {
  return {
    id: `a-${Date.now().toString(36)}-${index}`,
    label: '',
    weight: 0,
    score: null,
    outOf: 100,
  };
}

function number(value: string): number {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function percent(value: string): number {
  return Math.min(100, Math.max(0, number(value)));
}

function round(value: number): number {
  return Math.round(value);
}

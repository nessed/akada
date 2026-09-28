'use client';

import type { SpanFigures as Figures } from '@/lib/stats-lens';
import { formatHM } from '@/lib/utils';

type Kind = 'time' | 'count';

interface Cell {
  key: string;
  label: string;
  figure: string;
  /** What the figure sits over, in the same unit: "of 7". */
  of?: string;
  now: number;
  before: number | null;
  kind: Kind;
}

/**
 * A span in figures, each set beside the same figure for the span before.
 *
 * The change is written, never drawn: "+1h 20m" in mono under the figure,
 * with a small arrow in sage for more and clay for less, and nothing at all
 * when the two are the same. Less is never alarming here; a lighter week is
 * a fact about the week.
 */
export default function SpanFigures({
  now,
  before,
  againstName,
  courseCount,
}: {
  now: Figures;
  before: Figures | null;
  againstName: string | null;
  /** Courses on the term, for "3 of 4". */
  courseCount: number;
}) {
  const b = before;
  const cells: Cell[] = [
    { key: 'hours', label: 'Hours', figure: formatHM(now.seconds), now: now.seconds, before: b?.seconds ?? null, kind: 'time' },
    {
      key: 'perday',
      label: 'A day',
      figure: formatHM(now.seconds / Math.max(1, now.daysElapsed)),
      now: now.seconds / Math.max(1, now.daysElapsed),
      before: b ? b.seconds / Math.max(1, b.daysElapsed) : null,
      kind: 'time',
    },
    {
      key: 'days',
      label: 'Days studied',
      figure: String(now.days),
      of: `of ${now.daysElapsed}`,
      now: now.days,
      before: b?.days ?? null,
      kind: 'count',
    },
    { key: 'sittings', label: 'Sittings', figure: String(now.sittings), now: now.sittings, before: b?.sittings ?? null, kind: 'count' },
    {
      key: 'usual',
      label: 'Usual sitting',
      figure: now.medianSitting > 0 ? formatHM(now.medianSitting) : '–',
      now: now.medianSitting,
      before: b && b.medianSitting > 0 && now.medianSitting > 0 ? b.medianSitting : null,
      kind: 'time',
    },
    {
      key: 'longest',
      label: 'Longest',
      figure: now.longestSitting > 0 ? formatHM(now.longestSitting) : '–',
      now: now.longestSitting,
      before: b && b.longestSitting > 0 && now.longestSitting > 0 ? b.longestSitting : null,
      kind: 'time',
    },
    {
      key: 'done',
      label: 'Tasks finished',
      figure: String(now.tasksDone),
      of: now.tasksAdded > 0 ? `${now.tasksAdded} added` : undefined,
      now: now.tasksDone,
      before: b?.tasksDone ?? null,
      kind: 'count',
    },
    courseCount > 1
      ? {
          key: 'courses',
          label: 'Courses touched',
          figure: String(now.courses),
          of: `of ${courseCount}`,
          now: now.courses,
          before: b?.courses ?? null,
          kind: 'count',
        }
      : {
          key: 'tasked',
          label: 'On a task',
          figure: formatHM(now.seconds * now.onTasks),
          now: now.seconds * now.onTasks,
          before: b ? b.seconds * b.onTasks : null,
          kind: 'time',
        },
  ];
  if (now.papers > 0 || (b?.papers ?? 0) > 0) {
    cells.push({
      key: 'papers',
      label: 'Practice papers',
      figure: String(now.papers),
      of: now.paperMean != null ? `avg ${Math.round(now.paperMean * 100)}%` : undefined,
      now: now.papers,
      before: b?.papers ?? null,
      kind: 'count',
    });
  }

  return (
    <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
      {cells.map((cell, i) => (
        <div key={cell.key} className="deal-in min-w-0" style={{ animationDelay: `${i * 50}ms` }}>
          <dt className="eyebrow">{cell.label}</dt>
          <dd className="m-0 mt-1.5">
            <span className="font-mono text-[24px] font-medium leading-none tracking-[-0.03em] tabular-nums text-ink">
              {cell.figure}
            </span>
            {cell.of && (
              <span className="ml-1.5 font-serif text-[12.5px] italic text-muted">{cell.of}</span>
            )}
            <Change cell={cell} againstName={againstName} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Change({ cell, againstName }: { cell: Cell; againstName: string | null }) {
  if (cell.before === null || againstName === null) return null;
  const diff = cell.now - cell.before;
  const same = cell.kind === 'time' ? Math.abs(diff) < 60 : diff === 0;
  const up = diff > 0;
  const figure = cell.kind === 'time' ? formatHM(Math.abs(diff)) : String(Math.abs(Math.round(diff)));
  return (
    <span className="mt-1.5 flex flex-wrap items-baseline gap-x-1 text-[11.5px] leading-snug text-muted">
      {same ? (
        <span className="font-serif italic">same as {againstName}</span>
      ) : (
        <>
          <span aria-hidden style={{ color: up ? 'var(--sage)' : 'var(--warn)' }}>
            {up ? '↑' : '↓'}
          </span>
          <span className="font-mono tabular-nums text-ink-soft">{figure}</span>
          <span className="sr-only">{up ? 'more than' : 'less than'}</span>
          <span className="font-serif italic">on {againstName}</span>
        </>
      )}
    </span>
  );
}

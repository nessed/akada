'use client';

import Link from 'next/link';
import type { TaskFlow as Flow } from '@/lib/stats-lens';
import { formatHM } from '@/lib/utils';
import HandCheck from '@/components/notebook/HandCheck';

const TOP_PX = 56;

/**
 * The list, in and out: what went on it and what came off it, a pair of
 * marks a week for eight weeks. Added is a pencil outline, finished is ink,
 * so a week that added more than it finished reads as an outline taller
 * than its ink. Under it, what is still open against a date, and what a
 * finished task has usually taken.
 */
export default function TaskFlow({ flow, accent }: { flow: Flow; accent: string }) {
  const top = Math.max(1, ...flow.weeks.flatMap((w) => [w.added, w.done]));
  const px = (n: number) => (n > 0 ? Math.max(3, Math.round((n / top) * TOP_PX)) : 0);
  const added = flow.weeks.reduce((a, w) => a + w.added, 0);
  const done = flow.weeks.reduce((a, w) => a + w.done, 0);
  const last = flow.weeks.length - 1;

  return (
    <div>
      <p className="m-0 font-serif text-[13px] italic text-muted">
        eight weeks: <span className="font-mono not-italic text-ink">{done}</span> finished,{' '}
        <span className="font-mono not-italic text-ink">{added}</span> added
      </p>

      <div
        className="mt-4 grid grid-cols-8 items-end gap-2 border-b border-line"
        style={{ height: TOP_PX + 4 }}
        role="img"
        aria-label={flow.weeks.map((w) => `week of ${w.start}: ${w.added} added, ${w.done} finished`).join('; ')}
      >
        {flow.weeks.map((w, i) => (
          <div key={w.start} className="flex items-end justify-center gap-[3px]">
            <span
              className="bar-grow block w-[7px] rounded-t-[2px] border border-b-0 border-line-strong"
              style={{ height: px(w.added), animationDelay: `${100 + i * 50}ms`, borderWidth: w.added ? undefined : 0 }}
            />
            <span
              className="bar-grow block w-[7px] rounded-t-[2px]"
              style={{ height: px(w.done), background: accent, animationDelay: `${160 + i * 50}ms` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1.5 grid grid-cols-8 gap-2 text-center">
        {flow.weeks.map((w, i) => (
          <span key={w.start} className={`font-mono text-[9.5px] ${i === last ? 'text-ink' : 'text-muted-soft'}`}>
            {i === last ? 'now' : `-${last - i}`}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="block h-2 w-2 rounded-[2px] border border-line-strong" /> added
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="block h-2 w-2 rounded-[2px]" style={{ background: accent }} /> finished
        </span>
      </div>

      <ul className="m-0 mt-4 list-none border-t border-line p-0">
        <Line figure={String(flow.overdue)} tone={flow.overdue > 0 ? 'warn' : undefined}>
          open past their date
        </Line>
        <Line figure={String(flow.dueSoon)}>due in the next seven days</Line>
        {flow.timedDone > 0 && (
          <Line figure={formatHM(flow.medianPerTask)} check>
            a finished task usually takes, from {flow.timedDone} with time on them
          </Line>
        )}
      </ul>
      {flow.overdue > 0 && (
        <Link
          href="/tasks"
          className="mt-2 inline-block font-serif text-[12.5px] italic text-muted no-underline transition-colors hover:text-ink"
        >
          Open the list →
        </Link>
      )}
    </div>
  );
}

function Line({
  figure,
  tone,
  check,
  children,
}: {
  figure: string;
  tone?: 'warn';
  check?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-baseline gap-3 border-b border-dashed border-line py-2 last:border-0">
      <span
        className="w-[52px] shrink-0 font-mono text-[14px] font-semibold tabular-nums"
        style={{ color: tone === 'warn' ? 'var(--warn)' : 'var(--ink)' }}
      >
        {figure}
      </span>
      <span className="flex items-baseline gap-1.5 font-serif text-[13px] leading-snug text-ink-soft">
        {check && (
          <span className="translate-y-[1px]">
            <HandCheck size={11} color="var(--muted)" />
          </span>
        )}
        {children}
      </span>
    </li>
  );
}

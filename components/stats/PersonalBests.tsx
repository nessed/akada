'use client';

import type { Best, Records } from '@/lib/stats-reading';
import { formatHM, formatRelativeDate } from '@/lib/utils';

/**
 * The term's records, each set against the one in progress that could take
 * it. A record on its own is a trophy on a shelf; a record with "40m to beat
 * it" under it is the next sitting. One set inside the last week is stamped
 * on, and the stamp comes down when the page opens, the one moment on this
 * page that is allowed to be loud.
 */
export default function PersonalBests({ records }: { records: Records }) {
  const rows = [
    {
      key: 'sitting',
      label: 'Longest sitting',
      best: records.sitting,
      figure: formatHM(records.sitting.best),
      sub: chase(records.sitting, 'today', 'your longest today'),
    },
    {
      key: 'day',
      label: 'Biggest day',
      best: records.day,
      figure: formatHM(records.day.best),
      sub: chase(records.day, 'today', 'today so far'),
    },
    {
      key: 'week',
      label: 'Best week',
      best: records.week,
      figure: formatHM(records.week.best),
      sub: chase(records.week, 'week', 'this week so far'),
    },
    {
      key: 'run',
      label: 'Longest run',
      best: records.run,
      figure: `${records.run.best}d`,
      sub: runChase(records.run),
    },
  ];

  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={row.key}
          className="relative border-b border-dashed border-line py-3.5 last:border-0"
        >
          <div className="flex items-baseline gap-2">
            <p className="eyebrow m-0 shrink-0">{row.label}</p>
            <span aria-hidden className="mb-[3px] flex-1 border-b border-dotted border-line-strong" />
            <span className="shrink-0 font-mono text-[18px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">
              {row.best.best > 0 ? row.figure : '—'}
            </span>
          </div>
          <p className="m-0 mt-1.5 pr-16 font-serif text-[12.5px] italic leading-snug text-muted">
            {row.sub}
          </p>
          {row.best.fresh && (
            <span
              className="stamp stamp-down absolute bottom-2.5 right-0"
              style={{
                animationDelay: `${0.6 + i * 0.18}s`,
                color: 'var(--warn)',
                borderColor: 'var(--warn)',
              }}
            >
              New best
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function chase(b: Best, span: 'today' | 'week', currentLabel: string): string {
  if (b.best === 0) return 'the first sitting sets it';
  const holdsIt = span === 'week' ? b.fresh : b.current >= b.best;
  if (holdsIt) return span === 'week' ? 'this week is the one. keep adding to it' : 'today holds it. still going?';
  const set = b.at ? whenSet(b.at, span) : '';
  if (b.current > 0) {
    return `${currentLabel} ${formatHM(b.current)} · ${formatHM(b.best - b.current + 60)} to beat it`;
  }
  return set;
}

function runChase(b: Best): string {
  if (b.best === 0) return 'one day starts it';
  if (b.current === 0) return `${b.at ? whenSet(b.at, 'today') : 'set'}. today starts a new one`;
  if (b.current >= b.best) return `${b.current} days and counting. every day now is a new best`;
  const ties = b.best - b.current;
  return `running now: ${b.current} · ${ties} more tie${ties === 1 ? 's' : ''} it, ${ties + 1} beat${ties + 1 === 1 ? 's' : ''} it`;
}

function whenSet(iso: string, span: 'today' | 'week'): string {
  if (span === 'week') {
    const d = new Date(iso + 'T00:00:00');
    return `set the week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  const rel = formatRelativeDate(iso);
  return `set ${rel === 'Today' || rel === 'Yesterday' ? rel.toLowerCase() : `on ${rel}`}`;
}

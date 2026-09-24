'use client';

import type { Milestone } from '@/lib/stats-reading';
import { formatHM } from '@/lib/utils';
import TallyMarks from '@/components/progression/TallyMarks';
import HandNote from '@/components/notebook/HandNote';

/**
 * The next round number in the term's hours, counted out as tally marks
 * rather than filled in as a bar. The stretch from the last line crossed to
 * the next is never more than twenty five marks, so a long stretch has each
 * mark stand for more than an hour, and the margin says how much. The marks
 * already earned draw themselves in when the page opens.
 */
export default function NextMilestone({
  milestone,
  totalSeconds,
  accent = 'var(--ink)',
}: {
  milestone: Milestone;
  totalSeconds: number;
  accent?: string;
}) {
  const gap = milestone.to - milestone.from;
  const marks = gap <= 1 ? 6 : Math.min(25, gap);
  const unitHours = gap / marks;
  const inked = Math.min(
    marks,
    Math.floor((totalSeconds / 3600 - milestone.from) / unitHours + 1e-9),
  );
  const unitLabel =
    unitHours < 1 ? `${Math.round(unitHours * 60)} minutes` : unitHours === 1 ? null : `${unitHours} hours`;

  return (
    <div>
      <p className="m-0 font-serif text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">
        {milestone.name}
      </p>
      <p className="m-0 mt-1 font-serif text-[13px] italic text-muted">
        <span className="font-mono text-[14px] font-semibold not-italic tabular-nums text-ink">
          {formatHM(milestone.remaining)}
        </span>{' '}
        to go
        {milestone.from > 0 && <> · {milestone.from} hours already behind you</>}
      </p>

      <div className="mt-5 overflow-x-auto app-scroll">
        <TallyMarks
          inked={inked}
          total={marks}
          fresh={inked}
          size={26}
          stagger={Math.max(40, Math.min(110, 1400 / Math.max(1, inked)))}
          delay={300}
          color={accent}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] tabular-nums text-muted-soft">
          {milestone.from}h
        </span>
        {unitLabel && (
          <HandNote size={15} rotate={-1.5} color="var(--muted)">
            each mark is {unitLabel}
          </HandNote>
        )}
        <span className="font-mono text-[11px] font-semibold tabular-nums text-ink">
          {milestone.to}h
        </span>
      </div>
    </div>
  );
}

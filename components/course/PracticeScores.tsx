'use client';

import type { Session, Task } from '@/lib/data';
import { scoreFace } from '@/lib/session-safety';
import { formatRelativeDate } from '@/lib/utils';

/** Papers plotted before the oldest fold off the left edge: a panel's width. */
const PLOTTED = 10;
/** Papers written out under the plot, newest first. */
const LISTED = 4;
/**
 * The plot's own measures: a mark every STEP, inside a strip TALL high.
 * Spaced so each mark reads as one paper rather than the marks running
 * together into a dashed line, and tall enough that a half mark out of eight
 * moves the pen visibly.
 */
const STEP = 26;
const TALL = 64;
const INSET = 6;

/**
 * Practice papers, and what they scored.
 *
 * Every other panel on this page reads time put in. This one reads what came
 * out of it: each practice paper the reader marked and wrote down on the log
 * sheet, plotted the way it would be in a notebook, one short pen mark per
 * paper at the height of what it scored against what it was out of, oldest on
 * the left, between a dashed line for full marks and a ruled baseline. Not a
 * bar that fills, which is the percentage bar this app does not draw, and no
 * line joining the marks or arrow over them either: four papers on four
 * different readings are four facts rather than a trend, and the reader can
 * see the shape for themselves.
 *
 * Drawn only once there is a paper to draw. A course nobody practises on
 * gets no empty panel asking why not.
 */
export default function PracticeScores({
  sessions,
  tasks,
  color,
}: {
  /** This course's sittings, in any order. */
  sessions: Session[];
  /** This course's tasks, to name a paper by what it was done against. */
  tasks: Task[];
  color: string;
}) {
  const papers = sessions
    .filter((s): s is Session & { score: number; scoreOutOf: number } =>
      s.score != null && s.scoreOutOf != null && s.scoreOutOf > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  if (papers.length === 0) return null;

  const plotted = papers.slice(-PLOTTED);
  const listed = [...papers].reverse().slice(0, LISTED);
  const nameOf = (paper: Session) => {
    // What the sitting said it was, without its tags; else the task it was
    // against; else it was a paper, and that is all the record knows.
    const note = paper.note.replace(/(^|\s)#[\w-]+/g, ' ').trim();
    if (note) return note;
    return tasks.find((task) => task.id === paper.taskId)?.title ?? 'Practice paper';
  };

  return (
    <section aria-label="Practice papers">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0">
          Practice
          <span className="ml-1.5 font-mono tracking-normal text-ink-soft">{papers.length}</span>
        </p>
      </div>

      {/* In CSS pixels, no viewBox: the rules run the width of the panel and
          the marks keep their size whatever the panel's. */}
      <svg aria-hidden width="100%" height={TALL} className="mt-3.5 block overflow-visible">
        {/* Full marks, dashed, and the ruled line under nothing at all. */}
        <line x1="0" x2="100%" y1={INSET} y2={INSET} stroke="var(--line)" strokeDasharray="3 3" />
        <line x1="0" x2="100%" y1={TALL - INSET} y2={TALL - INSET} stroke="var(--line)" />
        {plotted.map((paper, i) => {
          const x = STEP / 2 + i * STEP;
          const y = INSET + (1 - paper.score / paper.scoreOutOf) * (TALL - INSET * 2);
          // A short pen stroke, a little uphill, the way a hand plots one.
          return (
            <line
              key={paper.id}
              x1={x - 5}
              x2={x + 5}
              y1={y + 1.2}
              y2={y - 1.2}
              stroke={color}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      <div className="mt-2.5">
        {listed.map((paper) => (
          <div
            key={paper.id}
            className="flex items-baseline gap-2.5 border-b border-line-soft py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{nameOf(paper)}</span>
            <span className="shrink-0 font-serif text-[12px] italic text-muted">
              {formatRelativeDate(paper.date)}
            </span>
            <span className="tnum w-[46px] flex-none text-right font-mono text-[12px] font-semibold text-ink">
              {scoreFace(paper.score, paper.scoreOutOf)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

'use client';

import type { Impression, Ladder } from '@/lib/progression';

/**
 * The impressions sheet.
 *
 * Each entry is a ladder, and only its next rung is ever named. The rungs
 * already struck are shown as a row of dots under the name, so the sheet
 * reads as a record that is filling rather than a wall of things you do not
 * have.
 *
 * An impression is drawn as what it is named after: the ring a rubber stamp
 * leaves. A finished ladder is pressed hard, a double ring slightly off the
 * square; one under way is a single ring; one not started is a pencilled
 * dashed outline. The cards are dealt onto the desk the way Stats' are.
 *
 * None of these confers any benefit. They do not feed the pages, the run or
 * Next Mark. They are a record, and the record is the reward.
 */
export default function ImpressionSheet({
  ladders,
  impressions,
  fresh = null,
}: {
  ladders: Ladder[];
  impressions: Impression[];
  /** Rungs struck since the reader last opened the Record, by impression id. */
  fresh?: Map<string, number> | null;
}) {
  const byId = new Map(ladders.map((l) => [l.id, l]));

  return (
    <div className="grid grid-cols-2 gap-[var(--density-gap)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {impressions.map((impression, i) => (
        <ImpressionCard
          key={impression.id}
          impression={impression}
          unit={byId.get(impression.id)?.unit ?? ''}
          delay={i * 70}
          fresh={fresh?.has(impression.id) ?? false}
        />
      ))}
    </div>
  );
}

function ImpressionCard({
  impression,
  unit,
  delay,
  fresh,
}: {
  impression: Impression;
  unit: string;
  delay: number;
  fresh: boolean;
}) {
  const started = impression.struck > 0;
  const face = impression.complete ? impression.mark : (impression.progress ?? impression.mark);
  const long = face.length > 6;

  return (
    <div
      className={`deal-in deckle relative flex min-w-0 flex-col items-center px-3 pt-5 pb-4 text-center ${
        fresh
          ? 'border border-line-strong bg-paper'
          : started
            ? 'border border-line bg-paper'
            : 'border border-dashed border-line'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Struck since the last visit: the one loud moment on this page,
          the same stamp Stats brings down on a new record. */}
      {fresh && (
        <span
          className="stamp stamp-down absolute right-2 top-2"
          style={{
            animationDelay: `${delay + 700}ms`,
            color: 'var(--warn)',
            borderColor: 'var(--warn)',
          }}
        >
          New
        </span>
      )}
      <span
        className="relative grid h-[76px] w-[76px] place-items-center rounded-full"
        style={
          impression.complete
            ? {
                border: '1.8px solid var(--ink)',
                boxShadow: 'inset 0 0 0 3px var(--paper), inset 0 0 0 4px var(--ink)',
                transform: 'rotate(-4deg)',
              }
            : started
              ? { border: '1.5px solid var(--line-strong)' }
              : { border: '1.4px dashed var(--line-strong)' }
        }
      >
        <span
          className={`px-2 font-serif italic ${long ? 'text-[12px] leading-[1.2]' : 'text-[18px]'} ${
            impression.complete ? 'text-ink' : started ? 'text-ink-soft' : 'text-muted-soft'
          }`}
        >
          {face}
        </span>
      </span>

      <p
        className={`m-0 mt-3.5 font-serif text-[15px] font-medium leading-snug ${
          started ? 'text-ink' : 'text-muted'
        }`}
      >
        {impression.name}
      </p>

      <Rungs struck={impression.struck} rungs={impression.rungs} />

      <p className="m-0 mt-1.5 font-serif text-[12px] italic leading-[1.4] text-muted">
        {impression.complete
          ? `all ${impression.rungs} struck`
          : started
            ? `${impression.struck} of ${impression.rungs} struck`
            : unit}
      </p>
    </div>
  );
}

/** One dot a rung: inked when struck, a ring when still to come. */
function Rungs({ struck, rungs }: { struck: number; rungs: number }) {
  if (rungs <= 1) return null;
  return (
    <span
      className="mt-2.5 flex flex-wrap justify-center gap-1"
      role="img"
      aria-label={`${struck} of ${rungs} struck`}
    >
      {Array.from({ length: rungs }).map((_, i) => (
        <span
          key={i}
          className="h-[6px] w-[6px] rounded-full"
          style={
            i < struck ? { background: 'var(--ink)' } : { border: '1px solid var(--line-strong)' }
          }
        />
      ))}
    </span>
  );
}

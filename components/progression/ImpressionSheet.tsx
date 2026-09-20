'use client';

import type { Impression, Ladder } from '@/lib/progression';

/**
 * The impressions sheet.
 *
 * Each entry is a ladder, and only its next rung is ever named. The rungs
 * already struck are shown as a count under the name, so the sheet reads as a
 * record that is filling rather than a wall of things you do not have.
 *
 * None of these confers any benefit. They do not feed the pages, the run or
 * Next Mark. They are a record, and the record is the reward.
 */
export default function ImpressionSheet({
  ladders,
  impressions,
}: {
  ladders: Ladder[];
  impressions: Impression[];
}) {
  const byId = new Map(ladders.map((l) => [l.id, l]));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {impressions.map((impression) => (
        <ImpressionCard
          key={impression.id}
          impression={impression}
          unit={byId.get(impression.id)?.unit ?? ''}
        />
      ))}
    </div>
  );
}

function ImpressionCard({ impression, unit }: { impression: Impression; unit: string }) {
  const started = impression.struck > 0;

  return (
    <div
      className={`flex flex-col items-center rounded-[14px] px-3 py-5 text-center ${
        started ? 'border border-line bg-paper' : 'border border-dashed border-line'
      }`}
    >
      <span
        className={`grid h-[68px] w-[68px] place-items-center rounded-full px-1 text-center font-serif italic ${
          (impression.progress ?? impression.mark).length > 6
            ? 'text-[12px] leading-[1.2]'
            : 'text-[17px]'
        }`}
        style={
          impression.complete
            ? { border: '1.6px solid var(--ink)', color: 'var(--ink)' }
            : started
              ? { border: '1.6px solid var(--line-strong)', color: 'var(--ink)' }
              : { border: '1.4px dashed var(--line-strong)', color: 'var(--muted-soft)' }
        }
      >
        {impression.complete ? impression.mark : impression.progress}
      </span>

      <p className={`m-0 mt-3 text-[13px] font-medium ${started ? 'text-ink' : 'text-muted'}`}>
        {impression.name}
      </p>

      <p className="eyebrow m-0 mt-1 leading-[1.4]">
        {impression.complete
          ? `all ${impression.rungs} struck`
          : impression.struck > 0
            ? `${impression.struck} of ${impression.rungs} struck`
            : unit}
      </p>
    </div>
  );
}

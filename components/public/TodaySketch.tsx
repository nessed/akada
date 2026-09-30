import { PASTEL_PALETTE } from '@/lib/utils';

const [SAGE, ROSE] = PASTEL_PALETTE;

/**
 * Today, drawn as a loose sheet for the landing page. Markup rather than a
 * screenshot, so it sits on whichever paper the reader has and can never
 * show a screen the app no longer has. The term, the course and the numbers
 * are made up; the parts and their order are Today's own.
 *
 * Made up, but not impossible: the evening drawn here is one the real
 * ranking (lib/up-next.ts) would put up. It is Saturday, MATH's midterm is a
 * week out and the course is owed its run-up session, so Continuity concepts
 * is lifted "for Midterm I". The Prince is due Tuesday, not tomorrow, because
 * work due tomorrow outranks a run-up and would be the pick itself; and the
 * Coming rows are an exam (never the task), the midterm, and a piece further
 * out, so nothing on the sheet should have beaten the Or row to its place.
 * Change the sketch with Today, and keep it a screen Today could draw.
 */
export default function TodaySketch() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-hidden>
      {/* The sheet under it, turned the other way. */}
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-[2.6deg] rounded-[22px] bg-paper-2 lift" />
      <div className="relative -rotate-[1.1deg] rounded-[22px] bg-paper px-6 py-7 lift sm:px-10 sm:py-9">
        <span className="tape-strip left-1/2 -top-3 -translate-x-1/2 -rotate-3" />

        <p className="m-0 font-serif text-[12.5px] italic text-muted sm:text-[14px]">
          Sat 26 Sep · Week 4 of 16 · 83 days left
        </p>
        <p className="m-0 mt-1 font-serif text-[34px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[42px]">
          Today
        </p>
        <p className="m-0 font-hand text-[18px] text-muted sm:text-[20px]">this is usually your hour</p>

        <span className="eyebrow mt-6 block">Up next</span>
        <p className="m-0 mt-2.5 flex items-center gap-2.5">
          <span className="course-rule" style={{ ['--c' as string]: SAGE.value }} />
          <span className="eyebrow text-ink-soft">MATH 101</span>
          <span className="font-serif text-[12.5px] italic text-muted">Calculus I</span>
        </p>
        <p className="m-0 mt-2 font-serif text-[24px] font-medium leading-[1.15] tracking-[-0.02em] text-ink sm:text-[28px]">
          Continuity concepts
        </p>
        {/* Why this one, under the title in the serif: never a kicker over it. */}
        <p className="m-0 mt-1.5 font-serif text-[13px] italic text-ink-soft sm:text-[14px]">for Midterm I</p>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <span className="eyebrow block text-muted">Session</span>
            <span className="mt-1 block text-ink">
              <span className="font-mono text-[15px] tabular-nums">40m</span>
              <span className="ml-1.5 font-serif text-[12px] italic text-muted">your usual</span>
            </span>
          </div>
          <div>
            <span className="eyebrow block text-muted">Spent</span>
            <span className="mt-1 block text-ink">
              <span className="font-mono text-[15px] tabular-nums">1h 10m</span>
              <span className="ml-1.5 font-serif text-[12px] italic text-muted">on 21 Sep</span>
            </span>
          </div>
          <div>
            <span className="eyebrow block text-muted">Steps</span>
            <span className="mt-1 block font-mono text-[15px] tabular-nums text-ink">2 / 6</span>
          </div>
        </div>
        {/* The plan: what the session starts with, a noun phrase, not an order. */}
        <p className="m-0 mt-4 flex items-baseline gap-3">
          <span className="eyebrow shrink-0 whitespace-nowrap text-muted">Start with</span>
          <span className="min-w-0 font-serif text-[13.5px] leading-[1.45] text-ink-soft">
            the <span className="font-mono text-[12.5px] tabular-nums">2</span> MATH cards{' '}
            <span className="hand-underline">in recall, just below</span>
          </span>
        </p>
        {/* Start full width over the pair on a phone, one row from sm, the
            way Today lays its own out. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <span className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-medium text-primary-contrast">
            <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
              <path d="M0 0l9 5-9 5z" />
            </svg>
            Start 40 min
          </span>
          <span className="rounded-[10px] border border-line px-3.5 py-2.5 text-center text-[13.5px] text-ink-soft">Done</span>
          <span className="rounded-[10px] border border-line px-3.5 py-2.5 text-center text-[13.5px] text-ink-soft">
            Not now
          </span>
        </div>
        {/* One of the two Or rows: a tap puts it up next, the round mark starts it. */}
        <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-2.5 sm:gap-3">
          <span className="eyebrow w-5 shrink-0 text-muted sm:w-6">Or</span>
          <span className="course-rule !w-3.5" style={{ ['--c' as string]: ROSE.value }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-serif text-[14px] text-ink">The Prince, ch 15-18</span>
            <span className="mt-0.5 block truncate font-serif text-[12px] italic text-muted">
              <span className="eyebrow mr-1.5 not-italic text-ink-soft">POL 100</span>
              due Tuesday
            </span>
          </span>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-ink-soft">
            <svg width="8" height="9" viewBox="0 0 9 10" fill="currentColor">
              <path d="M0 0l9 5-9 5z" />
            </svg>
          </span>
        </div>

        <div className="mt-6 grid gap-6 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Today</span>
              <span className="font-serif text-[12.5px] italic text-muted">of 4h</span>
            </div>
            <p className="m-0 mt-1.5 font-mono text-[28px] font-medium tabular-nums text-ink sm:text-[34px]">
              2h 10m
            </p>
            {/* The day's ledger: the sittings where they happened, and now. */}
            <div className="relative mt-3 h-[10px] rounded-[3px] bg-bg-tint">
              <span className="absolute inset-y-0 left-[18%] w-[8%] rounded-[2px]" style={{ background: SAGE.value }} />
              <span className="absolute inset-y-0 left-[44%] w-[5%] rounded-[2px]" style={{ background: ROSE.value }} />
              <span className="absolute -inset-y-1 left-[58%] w-[1.5px] rounded-full bg-ink" />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
              <span>7a</span>
              <span>1p</span>
              <span>7p</span>
              <span>12a</span>
            </div>
          </div>
          <div>
            <span className="eyebrow">Coming</span>
            <ul className="m-0 mt-2 list-none space-y-2.5 p-0 text-[13.5px] text-ink">
              {[
                ['Mon', '28', 'Quiz 2', 'text-warn'],
                ['Sat', '3', 'Midterm I', 'text-ink'],
                ['Thu', '8', 'Essay 1 draft', 'text-ink'],
              ].map(([dow, day, title, tone]) => (
                <li key={title} className="flex items-center gap-3">
                  <span className="flex w-8 shrink-0 flex-col">
                    <span className="eyebrow text-muted">{dow}</span>
                    <span className={`font-mono text-[15px] font-medium leading-[1.2] tabular-nums ${tone}`}>{day}</span>
                  </span>
                  <span className="truncate">{title}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

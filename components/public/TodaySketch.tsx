import { PASTEL_PALETTE } from '@/lib/utils';

const [SAGE, ROSE] = PASTEL_PALETTE;

/**
 * Today, drawn as a loose sheet for the landing page. Markup rather than a
 * screenshot, so it sits on whichever paper the reader has and can never
 * show a screen the app no longer has. The term, the course and the numbers
 * are made up; the parts and their order are Today's own.
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

        <div className="mt-6 flex items-baseline justify-between gap-3">
          <span className="eyebrow">Up next</span>
          <span className="hidden font-hand text-[18px] text-muted sm:inline">carry on where you left off</span>
        </div>
        <p className="m-0 mt-2.5 flex items-center gap-2.5">
          <span className="course-rule" style={{ ['--c' as string]: SAGE.value }} />
          <span className="eyebrow text-ink-soft">ECON 100</span>
          <span className="text-[12.5px] text-muted">Principles of Economics</span>
        </p>
        <p className="m-0 mt-1.5 font-serif text-[22px] font-medium leading-[1.25] tracking-[-0.01em] text-ink sm:text-[26px]">
          <span className="hl-mint">Read Mankiw Ch 4: Supply and Demand</span>
        </p>
        <p className="m-0 mt-1 font-serif text-[13.5px] italic text-ink-soft sm:text-[15px]">
          Due tomorrow · 32 pages, about 1h 36m
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-medium text-primary-contrast">
            <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
              <path d="M0 0l9 5-9 5z" />
            </svg>
            Start
          </span>
          <span className="px-2 py-2.5 text-[13.5px] text-ink-soft">Done</span>
          <span className="px-2 py-2.5 text-[13.5px] text-ink-soft">Tomorrow</span>
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
            <div className="mt-2 flex gap-1">
              <span className="h-7 w-4 rounded-[4px]" style={{ background: SAGE.value }} />
              <span className="h-7 w-4 rounded-[4px]" style={{ background: ROSE.value }} />
              <span className="h-7 w-4 rounded-[4px] border border-line-strong" />
              <span className="h-7 w-4 rounded-[4px] border border-line-strong" />
            </div>
          </div>
          <div>
            <span className="eyebrow">Coming</span>
            <ul className="m-0 mt-2 list-none space-y-2 p-0 text-[13.5px] text-ink">
              <li className="flex items-baseline justify-between gap-2">
                <span className="truncate">Lab 3: loops</span>
                <span className="font-mono text-[12.5px] tabular-nums text-warn">1 day</span>
              </li>
              <li className="flex items-baseline justify-between gap-2">
                <span className="truncate">Problem Set 2</span>
                <span className="font-mono text-[12.5px] tabular-nums text-warnSoft">2 days</span>
              </li>
              <li className="flex items-baseline justify-between gap-2">
                <span className="truncate">Essay 1 draft</span>
                <span className="font-mono text-[12.5px] tabular-nums text-ink-soft">4 days</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

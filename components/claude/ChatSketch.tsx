import { PASTEL_PALETTE } from '@/lib/utils';

const [SAGE] = PASTEL_PALETTE;

/**
 * What handing Claude an outline looks like, drawn rather than screenshotted
 * so it holds on every paper tone. It is an example and says so: the course,
 * the file and the count are made up, the shape of the exchange is not.
 *
 * Drawn as two loose sheets taped to the page, the chat and then the slip
 * that turns up on Today, the way the landing draws Today itself.
 */
export default function ChatSketch() {
  return (
    <figure className="relative m-0 my-8">
      <div className="relative rotate-[0.6deg] rounded-[18px] bg-paper px-5 py-6 lift sm:px-8 sm:py-8">
        <span className="tape-strip -top-3 right-10 rotate-[4deg] sm:right-16" />
        <div className="ml-auto max-w-[88%] rounded-[16px_16px_4px_16px] bg-bg-tint px-4 py-3">
          <p className="m-0 mb-2 inline-flex items-center gap-2 rounded-[8px] border border-line-strong px-2.5 py-1.5 text-[12px] text-ink-soft">
            <svg aria-hidden width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M1 1h6l4 4v8H1z" />
              <path d="M7 1v4h4" />
            </svg>
            ECON100_outline.pdf
          </p>
          <p className="m-0 text-[14.5px] leading-[1.55] text-ink">
            Here&apos;s my ECON 100 outline. Put everything into Akada.
          </p>
        </div>

        <div className="mt-5">
          <p className="m-0 eyebrow">Claude · used Akada</p>
          <p className="m-0 mt-2 font-serif text-[15px] leading-[1.65] text-ink sm:text-[16px]">
            Added 14 items to ECON 100: six quizzes at 2% each (best five count), four
            problem sets, the readings for weeks 5 to 9 with page counts, the midterm
            (30%) on Oct 14 and the final (40%). The grading scheme is waiting for you to
            accept on the course page.
          </p>
        </div>
      </div>

      <svg aria-hidden className="ml-[22%] block text-muted" width="44" height="56" viewBox="0 0 44 56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 4 C 32 16, 6 32, 26 50" />
        <path d="M19 45 L 26 51 L 30 43" />
      </svg>

      <div className="ml-[8%] max-w-[420px] -rotate-[1.3deg] rounded-[14px] bg-paper-2 px-5 py-4 lift">
        <p className="eyebrow m-0">Then, on Today</p>
        <p className="m-0 mt-2 flex items-center gap-2.5">
          <span aria-hidden className="course-rule" style={{ ['--c' as string]: SAGE.value }} />
          <span className="eyebrow text-ink-soft">ECON 100</span>
        </p>
        <p className="m-0 mt-1 font-serif text-[19px] font-medium tracking-[-0.01em] text-ink">
          Read Mankiw Ch 4: Supply and Demand
        </p>
        <p className="m-0 mt-0.5 font-serif text-[13.5px] italic text-muted">Due tomorrow, and a Start button beside it</p>
      </div>
      <figcaption className="mt-4 text-right font-hand text-[20px] text-muted">
        an example. your outline, your dates
      </figcaption>
    </figure>
  );
}

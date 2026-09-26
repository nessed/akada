import { PASTEL_PALETTE } from '@/lib/utils';

const [SAGE] = PASTEL_PALETTE;

/**
 * What handing Claude an outline looks like, drawn rather than screenshotted
 * so it holds on every paper tone. It is an example and says so: the course,
 * the file and the count are made up, the shape of the exchange is not.
 */
export default function ChatSketch() {
  return (
    <figure className="m-0 my-8">
      <div className="rounded-[14px] border border-line bg-paper px-5 py-5 shadow-[0_18px_48px_rgba(26,25,21,0.08)]">
        <div className="ml-auto max-w-[88%] rounded-[12px] bg-bg-tint px-4 py-3">
          <p className="m-0 mb-2 inline-flex items-center gap-2 rounded-[8px] border border-line bg-paper px-2.5 py-1.5 text-[12px] text-ink-soft">
            <svg aria-hidden width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M1 1h6l4 4v8H1z" />
              <path d="M7 1v4h4" />
            </svg>
            ECON100_outline.pdf
          </p>
          <p className="m-0 text-[14px] leading-[1.55] text-ink">
            Here&apos;s my ECON 100 outline. Put everything into Akada.
          </p>
        </div>

        <div className="mt-4 max-w-[92%]">
          <p className="m-0 eyebrow">Claude · used Akada</p>
          <p className="m-0 mt-1.5 text-[14px] leading-[1.6] text-ink-soft">
            Added 14 items to ECON 100: six quizzes at 2% each (best five count), four
            problem sets, the readings for weeks 5 to 9 with page counts, the midterm
            (30%) on Oct 14 and the final (40%). The grading scheme is waiting for you to
            accept on the course page.
          </p>
        </div>
      </div>

      <div className="mx-auto my-3 h-6 w-px bg-line-strong" aria-hidden />

      <div className="rounded-[14px] border border-line px-5 py-4">
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
      <figcaption className="mt-3 text-center font-serif text-[12.5px] italic text-muted">
        An example. Your outline, your dates.
      </figcaption>
    </figure>
  );
}

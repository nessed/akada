import {
  FIRST_MARK_SECONDS,
  MARKS_PER_PAGE,
  MARK_SECONDS,
  PAGES_BOUND_RUNGS,
} from "@/lib/progression";

/**
 * What a mark and a bound page are, in hours, and what binding gets you.
 *
 * The margin says "3 to bind the page" and nothing else, which reads as a
 * rule to a game nobody explained. This is the explanation, folded shut the
 * same way "what makes a week count" is, since it is read once and the
 * marks are read daily.
 */
export default function PagesExplainer({
  className = "",
}: {
  className?: string;
}) {
  const markMinutes = Math.round(MARK_SECONDS / 60);
  const firstMinutes = Math.round(FIRST_MARK_SECONDS / 60);
  const pageHours = Math.round((MARKS_PER_PAGE * MARK_SECONDS) / 3600);

  return (
    <details className={`group border-t border-line pt-3 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-serif text-[12.5px] italic text-muted transition-colors hover:text-ink-soft [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="inline-block transition-transform group-open:rotate-90"
        >
          &rsaquo;
        </span>
        how pages work
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-[12px] leading-[1.6] text-muted">
        <p className="m-0">
          Every {markMinutes} minutes you study a course inks one mark on its
          page. The very first mark on a new course only takes {firstMinutes}.
          Ticking off a task for that course adds a few minutes too.
        </p>
        <p className="m-0">
          Fill all {MARKS_PER_PAGE} marks, about {pageHours} hours on that one
          course, and the page binds. It goes onto the stack beside the course
          for good and a fresh page opens. Bound pages never come off, even if
          you drop the course for a month.
        </p>
        <p className="m-0">
          Your bound pages across every course strike the Pages bound impression
          on the Record at {PAGES_BOUND_RUNGS.slice(0, -1).join(", ")} and{" "}
          {PAGES_BOUND_RUNGS.at(-1)}. Nothing gets spent or unlocked beyond
          that. The stack is just an honest picture of which courses your hours
          actually went into this term.
        </p>
      </div>
    </details>
  );
}

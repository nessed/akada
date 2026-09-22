'use client';

import { useState } from 'react';
import type { Course } from '@/lib/data';
import { useNotice } from '@/components/Notice';
import type { RecallReading, RecallState } from '@/lib/recall';
import { letGoRecall, undoRecall, type RecallChange } from '@/lib/recall/actions';
import { coursePrompt } from '@/lib/recall/prompt';
import { whenWords } from '@/lib/recall/words';
import KeepLine from './KeepLine';
import RecallDeck from './RecallDeck';
import { RecallStrokes, VerdictMark } from './RecallMarks';

/** Rows shown before the rest fold away behind "N more". */
const FOLDED = 8;

/**
 * What a course is keeping, on its own page.
 *
 * The course's things in the order they come up, each with its last few
 * answers drawn as marks in the margin and when it is next asked, so the
 * page reads as a record of what has stuck rather than a list of chores. Over
 * it, the course's standing as uprights and a count. Under it, a line to
 * write the next thing to keep on.
 *
 * Today asks for a few things a day across every course. This page asks for
 * the rest of one course's, when somebody wants them: "recall 4 now" opens
 * the same card Today uses, with no daily limit, because the reader asked.
 */
export default function CourseRecallPanel({
  course,
  reading,
  available,
  onStudy,
  className = '',
}: {
  course: Course;
  reading: RecallReading | null;
  available: boolean;
  onStudy?: (state: RecallState, anchor: HTMLElement) => void;
  className?: string;
}) {
  const { notify } = useNotice();
  const [walking, setWalking] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  // The last thing let go from the list, with the way to take it back. A line
  // written on this page or at the end of a sitting has nowhere else it could
  // be brought back from.
  const [letGoOf, setLetGoOf] = useState<RecallChange | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = reading?.byCourse.get(course.id) ?? null;
  const states = mine?.states ?? [];
  const due = states.filter((state) => state.due);
  const shown = unfolded ? states : states.slice(0, FOLDED);
  const today = reading?.today ?? '';

  /* The clipboard write has to happen in the click's own task or Safari
     treats it as untrusted, so nothing is awaited before it. */
  async function askClaude() {
    try {
      await navigator.clipboard.writeText(
        coursePrompt({ courseId: course.id, courseCode: course.code, courseName: course.name }),
      );
      notify(
        `Copied. Paste it into a chat with the Akada connector on, and it will quiz you on what is due for ${course.code}, mixed.`,
      );
    } catch (error) {
      console.error('Failed to copy the recall prompt:', error);
      notify('Akada could not reach the clipboard.');
    }
  }

  async function letGo(state: RecallState) {
    if (busy) return;
    setBusy(true);
    try {
      setLetGoOf(await letGoRecall(state));
    } catch (error) {
      console.error('Failed to let the recall go:', error);
      notify(error instanceof Error ? error.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  async function undoLetGo() {
    if (!letGoOf || busy) return;
    setBusy(true);
    try {
      await undoRecall(letGoOf);
      setLetGoOf(null);
    } catch (error) {
      console.error('Failed to bring the recall back:', error);
      notify('That could not be put back.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3 px-2 pb-2">
        <p className="eyebrow m-0">
          Recall
          {mine && (
            <span className="ml-1.5 font-mono tracking-normal text-ink-soft">{mine.kept}</span>
          )}
        </p>
        {due.length > 0 && !walking && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={askClaude}
              title="Copy a prompt that has Claude quiz you on these, mixed, and record how each went"
              className="h-10 rounded-[10px] px-2 font-serif text-[12.5px] italic text-muted-soft transition-colors hover:bg-bg-tint hover:text-ink"
            >
              ask Claude
            </button>
            <button
              type="button"
              onClick={() => setWalking(true)}
              className="h-10 rounded-[10px] px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
            >
              Recall {due.length} now
            </button>
          </span>
        )}
      </div>

      {walking && (
        <RecallDeck
          states={due}
          courses={[course]}
          title="Due"
          countLabel={`due on ${course.code}`}
          closing={`Nothing else due on ${course.code}.`}
          onStudy={onStudy}
          onClose={() => setWalking(false)}
          available={available}
          className="mb-5"
        />
      )}

      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
        {mine && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <RecallStrokes recall={mine} color={course.color} height={13} />
            <span className="font-serif text-[13px] italic text-muted">
              {standingWords(mine)}
            </span>
          </div>
        )}

        {shown.map((state) => (
          <div
            key={state.key}
            className="group flex items-center gap-3 border-t border-line-soft px-4 py-2.5"
          >
            <span className="flex w-[46px] shrink-0 items-center gap-0.5" aria-hidden>
              {state.history.length === 0 ? (
                <span className="font-serif text-[12px] italic text-muted-soft">new</span>
              ) : (
                state.history
                  .slice(-3)
                  .map((answer, i) => (
                    <VerdictMark
                      key={i}
                      verdict={answer.verdict}
                      size={13}
                      color={answer.verdict === 'gone' ? 'var(--muted)' : course.color}
                    />
                  ))
              )}
            </span>
            <span className="min-w-0 flex-1 truncate font-serif text-[14px] text-ink">
              {state.prompt}
            </span>
            <span
              className={`shrink-0 font-serif text-[12.5px] italic ${
                state.due ? 'text-ink' : 'text-muted'
              }`}
            >
              {state.due ? 'due' : whenWords(state.dueOn, today).replace(/^on /, '')}
            </span>
            {/* On a phone there is no hover to find it with, so it stays
                in view there, the way TaskRow's own row actions do. */}
            <button
              type="button"
              onClick={() => letGo(state)}
              disabled={busy}
              title="Stop asking about this one"
              aria-label={`Let go of ${state.prompt}`}
              className="h-8 shrink-0 rounded-[8px] px-1.5 font-serif text-[12px] italic text-muted-soft transition-opacity hover:text-ink focus-visible:opacity-100 disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100"
            >
              let go
            </button>
          </div>
        ))}

        {letGoOf && (
          <p
            aria-live="polite"
            className="m-0 flex flex-wrap items-center gap-x-2 border-t border-line-soft px-4 py-2.5 font-serif text-[13px] italic text-muted"
          >
            <span className="max-w-[260px] truncate text-ink-soft">{letGoOf.state.prompt}</span>
            <span>· let go</span>
            <button
              type="button"
              onClick={undoLetGo}
              disabled={busy}
              className="hand-underline bg-transparent px-0.5 not-italic text-[12.5px] text-ink disabled:opacity-40"
            >
              undo
            </button>
          </p>
        )}

        {states.length > FOLDED && (
          <button
            type="button"
            onClick={() => setUnfolded((v) => !v)}
            className="flex h-11 w-full items-center justify-center border-t border-line-soft text-[12px] text-muted transition-colors hover:text-ink"
          >
            {unfolded ? 'Fewer' : `${states.length - FOLDED} more`}
          </button>
        )}

        {states.length === 0 && (
          <p className="m-0 px-4 pb-1 pt-4 font-serif text-[13.5px] italic leading-[1.55] text-muted">
            Finished readings for {course.code} come here on their own, to be asked about
            from memory a day later, then at widening gaps. Anything else worth keeping can
            be written below.
          </p>
        )}

        <KeepLine
          courseId={course.id}
          placeholder={`something from ${course.code} worth keeping…`}
          className="border-t border-line-soft px-4 py-2.5"
        />
      </div>

      {!available && (
        <p className="m-0 mt-2.5 px-2 text-[12px] leading-[1.5] text-muted">
          Answers and kept lines are not saved until the latest supabase/schema.sql has been
          run once.
        </p>
      )}
    </section>
  );
}

/** "2 settled · 4 clear · 3 hazy · 2 gone · 3 not asked yet", leaving out the zeros. */
function standingWords(recall: {
  settled: number;
  clear: number;
  hazy: number;
  gone: number;
  fresh: number;
}): string {
  const parts = [
    recall.settled > 0 && `${recall.settled} settled`,
    recall.clear > 0 && `${recall.clear} clear`,
    recall.hazy > 0 && `${recall.hazy} hazy`,
    recall.gone > 0 && `${recall.gone} gone`,
    recall.fresh > 0 && `${recall.fresh} not asked yet`,
  ].filter(Boolean);
  return parts.join(' · ');
}

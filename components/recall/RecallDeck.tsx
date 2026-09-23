'use client';

import { useEffect, useState } from 'react';
import type { Course, RecallVerdict } from '@/lib/data';
import { useNotice } from '@/components/Notice';
import { applyVerdict, recallCue, scheduleRecall, type RecallState } from '@/lib/recall';
import { answerRecall, letGoRecall, undoRecall, type RecallChange } from '@/lib/recall/actions';
import { recallPrompt } from '@/lib/recall/prompt';
import { daysAgoWords, originVerb, studyWords, whenWords } from '@/lib/recall/words';
import { isoDate } from '@/lib/utils';
import { VerdictMark } from './RecallMarks';

/**
 * The recall card, one thing at a time.
 *
 * It shows what to recall and a short line on how, and three honest words to
 * answer with. It never shows an answer, because a recall with the answer in
 * view is a re-read, and it never scores one either: the reader knows whether
 * they had it, and the app believes them, the same bargain every other number
 * in Akada is built on.
 *
 * After an answer the next card is already there, and a line under it says
 * what the answer did, in the Next Mark voice: "hazy · back on thursday".
 * That line carries undo, because an answer is one tap and a mistaken one
 * moves a thing weeks out of sight; and when a thing slipped, it carries the
 * way back to the material, since the point of finding out is to go and fix
 * it.
 *
 * Used twice: on Today with the day's few, and on a course page with that
 * course's due ones, asked for.
 */

const VERDICTS: { verdict: RecallVerdict; label: string }[] = [
  { verdict: 'clear', label: 'Clear: had it, without looking' },
  { verdict: 'hazy', label: 'Hazy: only part of it, or with a nudge' },
  { verdict: 'gone', label: 'Gone: could not' },
];

interface Props {
  states: RecallState[];
  courses: Course[];
  /** The eyebrow over the card. */
  title?: string;
  /** What the count beside the eyebrow means, for a screen reader. */
  countLabel?: string;
  /** Said once the last card here has been answered. */
  closing: string;
  /** Back to the material after a slip: start a sitting on it. */
  onStudy?: (state: RecallState, anchor: HTMLElement) => void;
  /** Offered beside the closing line on a course page, to put the deck away. */
  onClose?: () => void;
  /**
   * False on a database without the recall table. The cards still draw,
   * since finished readings are read off the tasks, but an answer has
   * nowhere to go, and the deck says so once rather than failing each tap.
   */
  available?: boolean;
  className?: string;
}

interface Outcome {
  change: RecallChange;
  verdict: RecallVerdict | 'let go';
  /** When it comes up next, worked out at the moment of answering. */
  nextOn: string | null;
}

export default function RecallDeck({
  states,
  courses,
  title = 'Recall',
  countLabel = 'to recall',
  closing,
  onStudy,
  onClose,
  available = true,
  className = '',
}: Props) {
  const { notify } = useNotice();
  const [busy, setBusy] = useState(false);
  const [walked, setWalked] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const card = states[0] ?? null;
  const today = isoDate();

  // A new day is a new deck. Without this, a tab left open overnight would
  // still be saying yesterday's recall was done.
  const [day, setDay] = useState(today);
  useEffect(() => {
    if (day !== today) {
      setDay(today);
      setWalked(0);
      setOutcome(null);
    }
  }, [day, today]);

  if (!card && walked === 0) return null;

  const course = card ? courses.find((c) => c.id === card.courseId) : undefined;
  const color = course?.color ?? 'var(--ink)';

  async function answer(verdict: RecallVerdict) {
    if (!card || busy) return;
    setBusy(true);
    try {
      const change = await answerRecall(card, verdict, today);
      const examOn = card.examDays != null ? shift(today, card.examDays) : null;
      const history = applyVerdict(card.history, verdict, today);
      setOutcome({ change, verdict, nextOn: scheduleRecall(history, card.origin, examOn).dueOn });
      setWalked((n) => n + 1);
    } catch (error) {
      console.error('Failed to save the recall:', error);
      notify(error instanceof Error ? error.message : 'That answer did not save.');
    } finally {
      setBusy(false);
    }
  }

  async function letGo() {
    if (!card || busy) return;
    setBusy(true);
    try {
      const change = await letGoRecall(card);
      setOutcome({ change, verdict: 'let go', nextOn: null });
      setWalked((n) => n + 1);
    } catch (error) {
      console.error('Failed to let the recall go:', error);
      notify(error instanceof Error ? error.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!outcome || busy) return;
    setBusy(true);
    try {
      await undoRecall(outcome.change);
      setOutcome(null);
      setWalked((n) => Math.max(0, n - 1));
    } catch (error) {
      console.error('Failed to undo the recall:', error);
      notify('That could not be put back.');
    } finally {
      setBusy(false);
    }
  }

  /* The clipboard write has to happen in the click's own task or Safari
     treats it as untrusted, so nothing is awaited before it. */
  async function askClaude() {
    if (!card) return;
    const text = recallPrompt({
      key: card.key,
      prompt: card.prompt,
      source: card.source,
      courseCode: course?.code ?? 'this course',
      courseName: course?.name ?? '',
      detail: card.task?.description || undefined,
    });
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied. Paste it into a chat with the Akada connector on, and it will quiz you on this one.');
    } catch (error) {
      console.error('Failed to copy the recall prompt:', error);
      notify('Akada could not reach the clipboard.');
    }
  }

  const meta = card
    ? card.last
      ? `${card.last.verdict} ${daysAgoWords(card.last.on, today)}`
      : `${originVerb(card.source)} ${daysAgoWords(card.origin, today)}`
    : '';

  return (
    <section className={className} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <p className="eyebrow m-0">
          {title}
          {states.length > 0 && (
            <span
              className="ml-1.5 font-mono tracking-normal text-ink-soft"
              aria-label={`${states.length} ${countLabel}`}
            >
              {states.length}
            </span>
          )}
        </p>
        {card && (
          <span className="hidden font-serif text-[12.5px] italic text-muted-soft sm:inline">
            from memory first, then say how it went
          </span>
        )}
      </div>

      {card ? (
        // Written on the page like everything else under the double rule. It
        // is still one card at a time, keyed so the next one fades in, but it
        // has no box: the course is the short rule before its code.
        <div key={card.key} className="relative animate-fade-in">
          <div className="flex items-baseline justify-between gap-3">
            <p className="m-0 flex min-w-0 items-center gap-2.5">
              <span aria-hidden className="course-rule" style={{ ['--c' as string]: color }} />
              <span className="eyebrow shrink-0 text-ink-soft">
                {course?.code ?? 'Course'}
              </span>
              <span className="truncate font-serif text-[12.5px] italic text-muted">{meta}</span>
            </p>
            <button
              type="button"
              onClick={letGo}
              disabled={busy}
              title="Stop asking about this one"
              className="-my-2 -mr-2 h-10 shrink-0 rounded-[10px] px-2 font-serif text-[12.5px] italic text-muted-soft transition-colors hover:bg-bg-tint hover:text-ink disabled:opacity-40"
            >
              let go
            </button>
          </div>

          <h3 className="m-0 mt-1.5 font-serif text-[20px] font-medium leading-[1.25] tracking-[-0.01em] text-ink">
            {card.prompt}
          </h3>
          <p className="m-0 mt-1.5 font-serif text-[13.5px] italic text-muted">{recallCue(card)}</p>

          <div className="-ml-2.5 mt-3 flex flex-wrap items-center gap-1">
            {VERDICTS.map(({ verdict, label }) => (
              <button
                key={verdict}
                type="button"
                onClick={() => answer(verdict)}
                disabled={busy}
                aria-label={label}
                title={label}
                className="flex h-10 items-center gap-2 rounded-[10px] px-2.5 font-serif text-[15px] italic text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink disabled:opacity-40"
              >
                <VerdictMark verdict={verdict} color={verdict === 'gone' ? 'var(--muted)' : color} />
                {verdict}
              </button>
            ))}
            <button
              type="button"
              onClick={askClaude}
              className="-mr-2 ml-auto h-10 rounded-[10px] px-2 font-serif text-[12.5px] italic text-muted-soft transition-colors hover:bg-bg-tint hover:text-ink"
              title="Copy a prompt that has Claude quiz you on this and record how it went"
            >
              ask Claude
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-fade-in">
          <p className="m-0 font-serif text-[15px] italic text-ink-soft">{closing}</p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="hand-underline mt-2 bg-transparent px-0.5 font-serif text-[13px] text-ink"
            >
              Put it away
            </button>
          )}
        </div>
      )}

      {!available && card && (
        <p className="m-0 mt-2.5 text-[12px] leading-[1.5] text-muted">
          Answers are not saved until the latest supabase/schema.sql has been run once.
        </p>
      )}

      {/* What the last answer did, and the way to take it back. */}
      <p
        aria-live="polite"
        className={`m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-[13px] italic text-muted ${
          outcome ? 'mt-2.5' : ''
        }`}
      >
        {outcome && (
          <>
            {outcome.verdict !== 'let go' && (
              <VerdictMark verdict={outcome.verdict} size={13} color="var(--muted)" />
            )}
            <span className="max-w-[220px] truncate text-ink-soft">{outcome.change.state.prompt}</span>
            <span>
              · {outcome.verdict}
              {outcome.nextOn ? ` · back ${whenWords(outcome.nextOn, today)}` : ''}
              {outcome.change.unticked ? ` · unticked on ${outcome.change.state.task?.title ?? 'its task'}` : ''}
            </span>
            <button
              type="button"
              onClick={undo}
              disabled={busy}
              className="hand-underline bg-transparent px-0.5 not-italic text-[12.5px] text-ink disabled:opacity-40"
            >
              undo
            </button>
            {onStudy && (outcome.verdict === 'hazy' || outcome.verdict === 'gone') && (
              <button
                type="button"
                onClick={(event) => onStudy(outcome.change.state, event.currentTarget)}
                className="hand-underline bg-transparent px-0.5 not-italic text-[12.5px] text-ink"
              >
                {studyWords(outcome.change.state.source)}
              </button>
            )}
          </>
        )}
      </p>
    </section>
  );
}

function shift(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

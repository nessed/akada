'use client';

import { useEffect, useRef, useState } from 'react';
import type { Course, SessionSegment, Task } from '@/lib/data';
import { MARKS_PER_PAGE, type SittingEffect } from '@/lib/progression';
import { formatHM, resolveTint } from '@/lib/utils';
import { clampSessionSeconds, cleanScore, isLoggableDuration } from '@/lib/session-safety';
import HandCheck from '@/components/notebook/HandCheck';
import SessionChain from '@/components/SessionChain';
import TallyMarks from '@/components/progression/TallyMarks';
import { ButtonSpinner } from './LoadingIndicator';
import { useLeaving } from './Leaving';

// Quick-reflection tag chips. Tapping appends `#tag` into the note so the
// data shape stays the same, no schema migration needed for this flourish.
const REFLECTION_TAGS = ['focused', 'distracted', 'reading', 'writing', 'practice'];

interface Props {
  open: boolean;
  course: Course | null;
  /** The task the session was against, when it was against one. */
  task?: Task | null;
  /** Focus time. The headline figure, and the only one that gets logged. */
  durationSeconds: number;
  /** Rest taken during the sitting, reported beside the hours, never in them. */
  breakSeconds?: number;
  /** The shape of the sitting, when it had one. */
  segments?: SessionSegment[];
  /**
   * What this sitting did to the record, and what is nearest after it. The
   * one moment a reader is guaranteed to look at the sitting is the moment
   * they are asked to keep it, and for a long time this sheet showed a
   * duration and a question and not a word about why the duration mattered.
   */
  effect?: SittingEffect | null;
  /**
   * How long this reader's sittings on this course usually run, in seconds,
   * once there are enough to say. Set beside this one with no verb between
   * them, the way the week is set beside a typical week: two facts, nothing
   * to beat.
   */
  usualSeconds?: number | null;
  saving?: boolean;
  errorMessage?: string;
  contextMessage?: string;
  onCancel: () => void;
  /**
   * `keep` is one thing from the sitting the reader wants to be asked about
   * later, or an empty string. It becomes a recall item for the course.
   * `practice` is what a practice paper done in the sitting scored, when the
   * reader wrote one down.
   */
  onSave: (
    note: string,
    markTaskDone: boolean,
    keep: string,
    practice: { score: number; outOf: number } | null,
  ) => void;
}

export default function SessionLogModal({
  open,
  course,
  task = null,
  durationSeconds,
  breakSeconds = 0,
  segments = [],
  effect = null,
  usualSeconds = null,
  saving = false,
  errorMessage = '',
  contextMessage = '',
  onCancel,
  onSave,
}: Props) {
  const [note, setNote] = useState('');
  const [keep, setKeep] = useState('');
  const [scored, setScored] = useState('');
  const [outOf, setOutOf] = useState('');
  // Whether the score line has been left, so its warning waits for the
  // reader to finish rather than appearing on the first keystroke.
  const [scoreLeft, setScoreLeft] = useState(false);
  const [markDone, setMarkDone] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      setKeep('');
      setScored('');
      setOutOf('');
      setScoreLeft(false);
      // Never pre-ticked. Finishing a block is not the same as finishing the
      // chapter, and a box that arrives ticked gets confirmed without being
      // read.
      setMarkDone(false);
    }
  }, [open]);

  // Opening a sheet without moving focus into it leaves a keyboard or screen
  // reader user still standing on the page behind, with no way to know a
  // question was asked.
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.focus();
  }, [open]);

  const [shown, leaving] = useLeaving(open);

  if (!shown || !course) return null;
  const canSave = isLoggableDuration(durationSeconds) && !saving;
  const safeSeconds = clampSessionSeconds(durationSeconds);
  // Big mono digits, same `00:48:23` shape as the timer ring so the user sees
  // the same number style they were watching mid-session.
  // A recovered session can run to the 18h ceiling, and the old readout was
  // total minutes, so that arrived as "1080:00". Hours get their own place
  // once there are any, the way the ring shows them.
  const hoursPart = Math.floor(safeSeconds / 3600);
  const minutesPart = String(
    hoursPart > 0 ? Math.floor((safeSeconds % 3600) / 60) : Math.floor(safeSeconds / 60),
  ).padStart(2, '0');
  const secondsPart = String(safeSeconds % 60).padStart(2, '0');
  const rest = clampSessionSeconds(breakSeconds);
  // The rest figure is set the same way as the headline above it rather than
  // through formatHHMMSS, which always writes the hours place: "00:05:00"
  // beside "20:03" reads as two different kinds of number.
  const restFace = `${Math.floor(rest / 3600) > 0 ? `${Math.floor(rest / 3600)}:` : ''}${String(
    Math.floor(rest / 3600) > 0 ? Math.floor((rest % 3600) / 60) : Math.floor(rest / 60),
  ).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`;
  const breakCount = segments.filter((segment) => segment.kind === 'break').length;
  // What was written on each break about the block before it. The last block
  // of a sitting has no break after it, so it has none; the note field below
  // is the freshest thing in mind at that point and covers it.
  const blockNotes = segments.filter(
    (segment) => segment.kind === 'focus' && (segment.note ?? '').trim() !== '',
  );
  const practice = cleanScore(scored, outOf);
  // Something written in the score line that is not a score: said under it
  // once both halves are in or the line has been left, and left out of the
  // save rather than blocking it, since the sitting is the record and the
  // score is only commentary on it.
  const bothIn = scored.trim() !== '' && outOf.trim() !== '';
  const anyIn = scored.trim() !== '' || outOf.trim() !== '';
  const scoreProblem = !practice && (bothIn || (scoreLeft && anyIn));

  function toggleTag(tag: string) {
    const token = `#${tag}`;
    const has = new RegExp(`(^|\\s)${token}(\\s|$)`).test(note);
    if (has) {
      setNote((current) =>
        current.replace(new RegExp(`(^|\\s)${token}(\\s|$)`, 'g'), ' ').trim(),
      );
    } else {
      setNote((current) => (current ? `${current.trim()} ${token}` : token));
    }
  }

  return (
    <div className={`fixed inset-0 z-[80] flex items-end ${leaving ? 'sheet-leaving' : 'animate-fade-in'}`}>
      {/* The scrim was a real <button> with an aria-label and no onClick: a
          focus stop that announced itself and then did nothing. Dismissing
          here discards a session, which is not something a stray tap on the
          backdrop should decide, so it is a surface now, not a control. */}
      <div aria-hidden className="absolute inset-0 scrim backdrop-blur-sm" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-log-heading"
        tabIndex={-1}
        className="relative max-h-[100dvh] w-full overflow-y-auto overscroll-contain md:mx-auto md:max-w-xl bg-bg rounded-t-3xl px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up outline-none"
      >
        <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mb-[18px]" />

        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: course.color }}
          />
          <p
            className="eyebrow m-0"
            style={{ color: course.color }}
          >
            {course.code} · {course.name}
          </p>
        </div>
        <h3
          id="session-log-heading"
          className="mt-2 mb-0 font-serif font-medium text-[26px] tracking-[-0.015em]"
        >
          Log this <span className="italic">session</span>?
        </h3>

        <div className="mt-3.5 flex items-baseline gap-3">
          <span className="font-mono font-semibold tabular-nums text-[52px] leading-[0.95] tracking-[-0.03em] text-ink">
            {hoursPart > 0 && `${hoursPart}:`}
            {minutesPart}
            <span className="text-muted-soft">:{secondsPart}</span>
          </span>
          <span className="font-serif italic text-[13px] text-muted">focused</span>
        </div>

        {/* Rest, reported and never added in. The hours a course is credited
            with are the hours that were worked; what the afternoon cost in
            breaks is a different question and gets a quieter line. */}
        {rest > 0 && (
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="font-mono tabular-nums text-[15px] text-muted">{restFace}</span>
            <span className="font-serif italic text-[13px] text-muted-soft">
              rest over {breakCount} {breakCount === 1 ? 'break' : 'breaks'}
            </span>
          </div>
        )}

        {segments.length > 1 && (
          <SessionChain
            segments={segments}
            color={course.color}
            className="mt-3.5"
            height={10}
          />
        )}

        {/* The sitting read back to its reader, in the order it happened.
            Each block's length in mono beside what it covered in the serif,
            which is the same division of labour every other row in the app
            uses: the digits are tabular, the writing is not. */}
        {blockNotes.length > 0 && (
          <ul className="mt-3.5 m-0 list-none space-y-1.5 p-0">
            {blockNotes.map((segment) => (
              <li key={segment.ordinal} className="flex items-baseline gap-2.5">
                <span className="w-9 shrink-0 text-right font-mono tabular-nums text-[11px] text-muted-soft">
                  {Math.max(1, Math.round(segment.seconds / 60))}m
                </span>
                <span className="font-serif italic text-[13px] leading-[1.45] text-ink-soft">
                  {segment.note}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The sitting's marks, drawn in as it is read back. The tally is the
            course's open page as it stands with this sitting on it, and the
            strokes this sitting added draw themselves in. Under it, what the
            sitting did in the Next Mark voice, and what is nearest now, a
            step softer, so the loop the line opened is closed here and
            opened again in the same breath. */}
        {effect && (effect.lines.length > 0 || effect.next) && (
          <div className="mt-4 border-t border-line-soft pt-3.5">
            <div className="flex items-center gap-2.5">
              <TallyMarks
                inked={effect.tally.inked}
                total={MARKS_PER_PAGE}
                fresh={effect.tally.fresh}
                color={course.color}
                size={16}
              />
              <span className="font-mono text-[10.5px] text-muted-soft">
                {effect.tally.inked} / {MARKS_PER_PAGE}
              </span>
            </div>
            <p className="m-0 mt-2 font-serif italic text-[13.5px] leading-[1.5] text-ink">
              {effect.lines.join(' · ')}
              {effect.next && (
                <span className="text-muted">
                  {effect.lines.length > 0 ? ' · ' : ''}
                  {effect.next.line}
                </span>
              )}
            </p>
          </div>
        )}

        {usualSeconds != null && (
          <p className="m-0 mt-2 font-mono text-[11px] text-muted">
            your {course.code} sittings usually{' '}
            <span className="text-ink">{formatHM(usualSeconds)}</span>
            {' · '}this one <span className="text-ink">{formatHM(safeSeconds)}</span>
          </p>
        )}

        {contextMessage && (
          <p className="mt-2 text-[12px] leading-[1.45] text-muted">{contextMessage}</p>
        )}

        {/* What the session was against, and the one thing worth asking at
            the end of it. */}
        {task && (
          <button
            type="button"
            onClick={() => setMarkDone((v) => !v)}
            role="switch"
            aria-checked={markDone}
            className="mt-4 flex w-full items-center gap-3 rounded-[10px] border border-line bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-paper-2"
          >
            <span
              aria-hidden
              className="scribble-box grid h-[21px] w-[21px] shrink-0 place-items-center"
              style={{ borderColor: markDone ? 'var(--ink)' : 'var(--line-strong)' }}
            >
              {markDone && <HandCheck size={14} color="var(--ink)" strokeWidth={1.7} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] text-ink">Mark the task done</span>
              <span className="mt-0.5 block truncate text-[12px] text-muted">{task.title}</span>
            </span>
          </button>
        )}

        <div className="mt-4">
          <label htmlFor="session-log-note" className="eyebrow m-0 mb-2 block">
            What did you do?
          </label>
          <textarea
            id="session-log-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional reflection…"
            className="w-full resize-none bg-paper border border-line rounded-[10px] p-3.5 text-[14px] font-serif italic text-ink leading-[1.5] outline-none focus:border-line-strong"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {REFLECTION_TAGS.map((tag) => {
            const active = new RegExp(`(^|\\s)#${tag}(\\s|$)`).test(note);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(tag)}
                className={`inline-flex min-h-[30px] items-center bg-transparent px-0.5 font-serif text-[13px] transition-colors ${
                  active ? 'hl-swipe text-ink' : 'text-muted-soft'
                }`}
                style={
                  active
                    ? ({ '--hl': resolveTint(course.color, course.tint) } as React.CSSProperties)
                    : undefined
                }
              >
                #{tag}
              </button>
            );
          })}
        </div>

        {/* One thing from the sitting to be asked about later. The end of a
            sitting is the one moment the reader knows exactly what was in it,
            and writing it as something to be asked is itself a small recall.
            A line to write on, like the break's own question, rather than a
            second box: most sittings leave it empty and that is fine. */}
        <div className="mt-4">
          <label htmlFor="session-log-keep" className="eyebrow m-0 mb-1.5 block">
            Worth keeping?
          </label>
          <input
            id="session-log-keep"
            type="text"
            value={keep}
            onChange={(e) => setKeep(e.target.value)}
            maxLength={300}
            placeholder="one thing from this, to be asked about from memory later"
            className="hand-underline w-full bg-transparent font-serif text-[14px] italic leading-[1.5] text-ink outline-none placeholder:text-muted-soft"
          />
        </div>

        {/* A practice paper, marked. The one number in the app that is an
            outcome rather than time put in, so it is asked for on a line
            like the one above and never required: most sittings pass it by.
            Digits in mono, the words around them in the serif. */}
        <div className="mt-4">
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <label htmlFor="session-log-score" className="eyebrow m-0">
              Scored
            </label>
            <input
              id="session-log-score"
              type="text"
              inputMode="decimal"
              value={scored}
              onChange={(e) => setScored(e.target.value.slice(0, 9))}
              onBlur={() => setScoreLeft(true)}
              aria-describedby="session-log-score-problem"
              placeholder="–"
              aria-label="What a practice paper in this sitting scored"
              className="hand-underline w-12 bg-transparent text-center font-mono text-[14px] tabular-nums text-ink outline-none placeholder:text-muted-soft"
            />
            <span aria-hidden className="font-mono text-[13px] text-muted">/</span>
            <input
              type="text"
              inputMode="decimal"
              value={outOf}
              onChange={(e) => setOutOf(e.target.value.slice(0, 9))}
              onBlur={() => setScoreLeft(true)}
              aria-describedby="session-log-score-problem"
              placeholder="–"
              aria-label="Out of"
              className="hand-underline w-12 bg-transparent text-center font-mono text-[14px] tabular-nums text-ink outline-none placeholder:text-muted-soft"
            />
            <span className="font-serif text-[13px] italic text-muted-soft">
              on a practice paper, if this was one
            </span>
          </p>
          {/* Always there and usually empty, so a screen reader hears the
              line the moment it has something to say. */}
          <p
            id="session-log-score-problem"
            aria-live="polite"
            className={`m-0 font-serif text-[12.5px] italic text-muted ${scoreProblem ? 'mt-1.5' : ''}`}
          >
            {scoreProblem ? 'That does not read as a score out of something, so it will not be kept.' : ''}
          </p>
        </div>

        {errorMessage && (
          <p role="alert" className="mt-3 mb-0 text-[12px] leading-[1.45] text-priority font-serif italic">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-2.5 mt-5">
          <button
            type="button"
            onClick={saving ? undefined : onCancel}
            disabled={saving}
            aria-label="Discard pending session log"
            className="flex-1 min-h-[50px] py-3.5 rounded-[10px] bg-transparent border border-line-strong text-muted text-sm font-medium"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(note, markDone, keep, practice)}
            className="flex-1 min-h-[50px] py-3.5 rounded-[10px] bg-primary text-primary-contrast text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-35"
          >
            <HandCheck size={14} color="currentColor" />
            {saving ? <span className="flex items-center justify-center gap-2"><ButtonSpinner />Saving session…</span> : 'Save to journal'}
          </button>
        </div>
      </div>
    </div>
  );
}

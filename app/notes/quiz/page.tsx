'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import HandNote from '@/components/notebook/HandNote';
import Icon from '@/components/notes/Icon';
import QuizText from '@/components/notes/QuizText';
import { addQuizAttemptOptimistic, useCourses, useNotes, useQuizzes, useTasks } from '@/lib/data-hooks';
import { LETTERS, bestSitting, isWritten, markQuiz, writtenTally } from '@/lib/quiz/format';
import { clearQuizDraft, loadQuizDraft, saveQuizDraft } from '@/lib/quiz/draft';
import { relativeLabel } from '@/lib/notes/store';
import type { Quiz, QuizAttempt, QuizQuestion } from '@/lib/data';

function clockFace(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function spokenRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m} ${m === 1 ? 'minute' : 'minutes'} ${sec} ${sec === 1 ? 'second' : 'seconds'}`;
}

export default function QuizPage() {
  return (
    <Suspense fallback={<PageShell wide>{null}</PageShell>}>
      <QuizScreen />
    </Suspense>
  );
}

function QuizScreen() {
  const id = useSearchParams().get('q') ?? '';
  const { quizzes, loaded, available } = useQuizzes();
  const quiz = quizzes.find((q) => q.id === id);

  return (
    <PageShell wide>
      <div className="notes quiz">
        <Link href="/notes" className="back"><Icon name="back" size={14} />Notes</Link>
        {!available ? (
          <p className="standfirst">Quizzes aren’t set up in the database yet. Run the latest supabase/schema.sql once.</p>
        ) : !loaded ? null : !quiz ? (
          <div className="empty">
            <p className="standfirst">Not on the shelf</p>
            <h1 className="screen-title">No such quiz</h1>
            <p className="lede">It may have been deleted. Ask your assistant to send another.</p>
          </div>
        ) : (
          <Sitting key={quiz.id} quiz={quiz} />
        )}
      </div>
    </PageShell>
  );
}

/**
 * One sitting. Picks are pencilled in with highlighter and written answers
 * go on ruled lines; nothing is marked until the whole paper is handed in.
 * Then the multiple choice is marked on the spot, every question shows what
 * was right and why, and the written answers wait for the assistant, whose
 * marks and notes fill in on the same page when it has read them. A quiz
 * with written questions opens on its last sitting, so coming back after the
 * assistant has marked it shows everything in one place.
 */
function Sitting({ quiz }: { quiz: Quiz }) {
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const { notes } = useNotes();
  const course = quiz.courseId ? courses.find((c) => c.id === quiz.courseId) : undefined;
  const task = quiz.taskId ? tasks.find((t) => t.id === quiz.taskId) : undefined;
  const note = quiz.noteId ? notes.find((n) => n.id === quiz.noteId) : undefined;

  const hasWritten = quiz.questions.some(isWritten);
  const latest = quiz.attempts[quiz.attempts.length - 1];
  // A paper left half done on this device picks up where it was.
  const [draft] = useState(() => loadQuizDraft(quiz.id, quiz.questions.length));
  const [picks, setPicks] = useState<number[]>(() => draft?.picks ?? quiz.questions.map(() => -1));
  const [written, setWritten] = useState<Record<string, string>>(() => draft?.written ?? {});
  // Questions flagged as unclear on this paper; they're marked but don't count.
  const [unclear, setUnclear] = useState<number[]>(() => draft?.unclear ?? []);
  // The sitting on show, by when it was handed in; null is a fresh paper.
  const [viewing, setViewing] = useState<string | null>(() => (!draft && hasWritten && latest ? latest.at : null));
  const [pending, setPending] = useState<QuizAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // The assistant's suggested timer, if it sent one. Running by default; the
  // student can turn it off, on this device, before or during the sitting.
  const hasTimer = quiz.timerMinutes != null;
  const [timerOn, setTimerOn] = useState(() => hasTimer && draft?.timerPausedRemaining == null);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(() => {
    if (!hasTimer) return null;
    if (draft?.timerEndsAt) return Date.parse(draft.timerEndsAt);
    if (draft?.timerPausedRemaining != null) return null;
    return Date.now() + quiz.timerMinutes! * 60_000;
  });
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(() => (hasTimer ? draft?.timerPausedRemaining ?? null : null));
  const [tick, setTick] = useState(() => Date.now());
  const autoSubmitted = useRef(false);
  // The stored copy, so marks the assistant writes show up here when they land.
  const marked = viewing ? quiz.attempts.find((a) => a.at === viewing) ?? (pending?.at === viewing ? pending : null) : null;
  const answered = quiz.questions.filter((q, i) => (isWritten(q) ? !!written[String(i)]?.trim() : picks[i] >= 0 || unclear.includes(i))).length;
  const total = quiz.questions.length;
  const mcqCount = total - quiz.questions.filter(isWritten).length;

  // Ticking toward `timerEndsAt` rather than counting seconds down in state
  // means nothing needs saving every second: the deadline itself is what's
  // kept, so a refresh mid-quiz just reads the clock again.
  const remaining = hasTimer
    ? timerOn && timerEndsAt != null
      ? Math.max(0, Math.round((timerEndsAt - tick) / 1000))
      : pausedRemaining ?? quiz.timerMinutes! * 60
    : 0;
  const showTimer = hasTimer && !marked;

  useEffect(() => {
    if (viewing) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [viewing]);

  // Every pick and keystroke is kept as it happens, until the paper is filed.
  useEffect(() => {
    if (!viewing) {
      saveQuizDraft(quiz.id, {
        picks,
        written,
        unclear,
        timerEndsAt: timerEndsAt != null ? new Date(timerEndsAt).toISOString() : null,
        timerPausedRemaining: pausedRemaining,
      });
    }
  }, [quiz.id, viewing, picks, written, unclear, timerEndsAt, pausedRemaining]);

  useEffect(() => {
    if (!showTimer || !timerOn || timerEndsAt == null) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showTimer, timerOn, timerEndsAt]);

  useEffect(() => {
    if (showTimer && timerOn && timerEndsAt != null && remaining <= 0 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      handIn();
    }
    // handIn closes over the latest picks/written/unclear; it's rebound every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTimer, timerOn, timerEndsAt, remaining]);

  const toggleTimer = () => {
    if (timerOn) {
      setPausedRemaining(timerEndsAt != null ? Math.max(0, Math.round((timerEndsAt - Date.now()) / 1000)) : 0);
      setTimerEndsAt(null);
      setTimerOn(false);
    } else {
      const rem = pausedRemaining ?? quiz.timerMinutes! * 60;
      setTick(Date.now());
      setTimerEndsAt(Date.now() + rem * 1000);
      setPausedRemaining(null);
      setTimerOn(true);
    }
  };

  const file = async (attempt: QuizAttempt) => {
    setSaving(true);
    setFailed(false);
    try {
      await addQuizAttemptOptimistic(quiz, attempt);
      clearQuizDraft(quiz.id);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const handIn = () => {
    const attempt = markQuiz(quiz.questions, picks, written, unclear);
    setPending(attempt);
    setViewing(attempt.at);
    void file(attempt);
  };

  const again = () => {
    setPicks(quiz.questions.map(() => -1));
    setWritten({});
    setUnclear([]);
    clearQuizDraft(quiz.id);
    setViewing(null);
    setPending(null);
    autoSubmitted.current = false;
    if (hasTimer) {
      setTick(Date.now());
      setTimerEndsAt(Date.now() + quiz.timerMinutes! * 60_000);
      setPausedRemaining(null);
      setTimerOn(true);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const history = quiz.attempts;
  const best = useMemo(() => bestSitting(marked ? [...history, marked] : history), [history, marked]);
  const tally = marked ? writtenTally(quiz.questions, marked) : null;
  const standfirst = [
    course?.code,
    task?.title,
    `${total} ${total === 1 ? 'question' : 'questions'}${hasWritten && mcqCount ? `, ${total - mcqCount} written` : ''}`,
  ].filter(Boolean).join(' · ');

  const strokeFor = (attempt: QuizAttempt, q: QuizQuestion, i: number) => {
    if (!isWritten(q)) return attempt.unclear?.includes(i) ? 'unclear' : attempt.picks[i] === q.answer ? 'got' : 'miss';
    const mark = attempt.marks?.[String(i)];
    if (!mark) return 'wait';
    return mark.score >= mark.outOf ? 'got' : mark.score > 0 ? 'part' : 'miss';
  };

  return (
    <article style={{ ['--c' as string]: course?.color ?? 'var(--line-strong)' }}>
      <header className="page-head">
        <div>
          <p className="standfirst">{standfirst}</p>
          <h1 className="screen-title">{quiz.title}</h1>
          {quiz.context && <p className="quiz-context">{quiz.context}</p>}
          {note && (
            <p className="quiz-context">
              on <Link href={`/notes?n=${encodeURIComponent(note.id)}`} className="hand-underline">{note.title}</Link>
            </p>
          )}
        </div>
      </header>

      {showTimer && (
        <div className="quiz-timer" data-urgent={timerOn && remaining <= 60 ? '' : undefined}>
          <span className="quiz-timer-face" aria-label={`${spokenRemaining(remaining)} left${timerOn ? '' : ', timer off'}`}>
            {clockFace(remaining)}
          </span>
          <button type="button" className="quiz-timer-toggle" role="switch" aria-checked={timerOn} onClick={toggleTimer}>
            {timerOn ? 'timer running · turn off' : 'timer off · turn back on'}
          </button>
        </div>
      )}

      {marked && tally ? (
        <section className="quiz-mark" aria-live="polite">
          <div className="quiz-mark-hand">
            {mcqCount > 0 && <HandNote size={34} rotate={-4}>{marked.score} / {marked.total}</HandNote>}
            {tally.count > 0 && (
              <HandNote size={mcqCount ? 21 : 34} rotate={-3}>
                {tally.pending === tally.count ? 'written: to mark' : `${mcqCount ? 'written ' : ''}${tally.score} / ${tally.pending ? tally.outOf : tally.possible}`}
              </HandNote>
            )}
          </div>
          <div>
            <div className="strokes" aria-hidden>
              {quiz.questions.map((q, i) => <span key={i} data-r={strokeFor(marked, q, i)} />)}
            </div>
            <p className="strokes-label">
              {saving ? 'filing it…'
                : failed ? 'it didn’t save, try handing in again'
                  : tally.pending > 0
                    ? <>{tally.pending} written {tally.pending === 1 ? 'answer' : 'answers'} waiting · tell your assistant “grade my quiz”</>
                    : <>filed{course ? <> under <em>{course.code}</em></> : null}{marked.unclear?.length ? <> · {marked.unclear.length} unclear, not counted</> : null}{best && history.length > 1 ? <> · best <b>{best.score}</b>/{best.total}</> : null}</>}
            </p>
          </div>
        </section>
      ) : history.length > 0 ? (
        <section className="quiz-history" aria-label="Past attempts">
          <span className="eyebrow">Before</span>
          <ul>
            {history.slice(-5).reverse().map((a) => {
              const t = writtenTally(quiz.questions, a);
              return (
                <li key={a.at}>
                  <button type="button" className="quiz-past" onClick={() => setViewing(a.at)} title="See this attempt">
                    <span className="quiz-score">{mcqCount ? `${a.score}/${a.total}` : `${t.score}/${t.pending ? t.outOf : t.possible}`}</span>
                    <span className="strokes" aria-hidden>
                      {quiz.questions.map((q, i) => <span key={i} data-r={strokeFor(a, q, i)} />)}
                    </span>
                    <span className="quiz-when">{relativeLabel(Date.parse(a.at)).toLowerCase()}{t.pending ? ' · to mark' : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <ol className="quiz-list">
        {quiz.questions.map((q, i) => {
          if (isWritten(q)) {
            const text = marked ? marked.written?.[String(i)] ?? '' : written[String(i)] ?? '';
            const mark = marked?.marks?.[String(i)];
            const state = marked ? (mark ? (mark.score >= mark.outOf ? 'got' : mark.score > 0 ? 'part' : 'miss') : 'wait') : undefined;
            return (
              <li key={i} className="quiz-q quiz-written" data-state={state}>
                <p className="quiz-prompt">
                  <span className="quiz-n">{i + 1}</span>
                  <span>
                    <QuizText text={q.prompt} />
                    <span className="quiz-marks">{q.marks ?? 1} {(q.marks ?? 1) === 1 ? 'mark' : 'marks'}</span>
                  </span>
                </p>
                {marked ? (
                  <div className="quiz-answer-read">{text || <em>left blank</em>}</div>
                ) : (
                  <AnswerLines
                    label={`Answer to question ${i + 1}`}
                    value={text}
                    onChange={(value) => setWritten((all) => ({ ...all, [String(i)]: value }))}
                  />
                )}
                {marked && (
                  mark ? (
                    <div className="quiz-feedback">
                      <HandNote size={19} rotate={-2}>{mark.score} / {mark.outOf}</HandNote>
                      {mark.feedback && <p>{mark.feedback}</p>}
                      {q.modelAnswer && (
                        <details>
                          <summary>What a full answer says</summary>
                          <p><QuizText text={q.modelAnswer} /></p>
                        </details>
                      )}
                    </div>
                  ) : (
                    <p className="quiz-why">waiting for your assistant to mark it</p>
                  )
                )}
              </li>
            );
          }
          const pick = marked ? marked.picks[i] : picks[i];
          const right = marked && pick === q.answer;
          const flagged = marked ? !!marked.unclear?.includes(i) : unclear.includes(i);
          return (
            <li key={i} className="quiz-q" data-state={marked ? (flagged ? 'unclear' : right ? 'got' : 'miss') : undefined} data-unclear={flagged || undefined}>
              <p className="quiz-prompt">
                <span className="quiz-n">{i + 1}</span>
                <QuizText text={q.prompt} />
              </p>
              <div className="quiz-options" role="radiogroup" aria-label={`Question ${i + 1}`}>
                {q.options.map((option, k) => {
                  const state = marked
                    ? k === q.answer ? 'right' : k === pick ? 'wrong' : undefined
                    : k === pick ? 'picked' : undefined;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={k === pick}
                      disabled={!!marked}
                      className="quiz-option"
                      data-state={state}
                      onClick={() => setPicks((all) => all.map((p, j) => (j === i ? (p === k ? -1 : k) : p)))}
                    >
                      <span className="quiz-letter">{LETTERS[k]}</span>
                      <span className="quiz-option-text"><QuizText text={option} /></span>
                    </button>
                  );
                })}
              </div>
              {!marked && (
                <button
                  type="button"
                  className="quiz-flag"
                  aria-pressed={flagged}
                  title={flagged ? 'Count this question again' : 'Badly worded? Flag it and it won’t count toward your mark'}
                  onClick={() => setUnclear((all) => (all.includes(i) ? all.filter((j) => j !== i) : [...all, i]))}
                >
                  {flagged ? 'unclear · won’t count' : 'unclear?'}
                </button>
              )}
              {marked && (
                <p className="quiz-why">
                  {flagged ? <>marked unclear, not counted · it was <b>{LETTERS[q.answer]}</b>. </>
                    : right ? null : pick < 0 ? <>left blank · it was <b>{LETTERS[q.answer]}</b>. </> : <>it was <b>{LETTERS[q.answer]}</b>. </>}
                  {q.explain ? <QuizText text={q.explain} /> : null}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <footer className="quiz-foot">
        {marked ? (
          <>
            <button type="button" className="btn btn-primary" onClick={again}><Icon name="read" size={16} />Take it again</button>
            {failed && pending && <button type="button" className="btn" onClick={() => void file(pending)}>Save it</button>}
            <Link href="/notes" className="btn btn-ghost">Back to notes</Link>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={handIn} disabled={!answered}>
              <Icon name="check" size={16} />Hand it in
            </button>
            <span className="standfirst">{answered === total ? 'all answered' : `${answered} of ${total} answered`}{answered ? ' · kept on this device' : ''}</span>
          </>
        )}
      </footer>
    </article>
  );
}

/**
 * A written answer on ruled lines that grows a line at a time as it fills, so
 * a long answer stays on the page instead of scrolling inside a box.
 */
function AnswerLines({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const grow = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    grow();
    // A narrower page wraps the same words onto more lines.
    const observer = new ResizeObserver(grow);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="quiz-answer"
      aria-label={label}
      placeholder="Write your answer"
      rows={4}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

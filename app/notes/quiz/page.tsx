'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import HandNote from '@/components/notebook/HandNote';
import Icon from '@/components/notes/Icon';
import QuizText from '@/components/notes/QuizText';
import { addQuizAttemptOptimistic, useCourses, useNotes, useQuizzes, useTasks } from '@/lib/data-hooks';
import { LETTERS, isWritten, markQuiz, writtenTally } from '@/lib/quiz/format';
import { relativeLabel } from '@/lib/notes/store';
import type { Quiz, QuizAttempt, QuizQuestion } from '@/lib/data';

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
  const [picks, setPicks] = useState<number[]>(() => quiz.questions.map(() => -1));
  const [written, setWritten] = useState<Record<string, string>>({});
  // The sitting on show, by when it was handed in; null is a fresh paper.
  const [viewing, setViewing] = useState<string | null>(() => (hasWritten && latest ? latest.at : null));
  const [pending, setPending] = useState<QuizAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // The stored copy, so marks the assistant writes show up here when they land.
  const marked = viewing ? quiz.attempts.find((a) => a.at === viewing) ?? (pending?.at === viewing ? pending : null) : null;
  const answered = quiz.questions.filter((q, i) => (isWritten(q) ? !!written[String(i)]?.trim() : picks[i] >= 0)).length;
  const total = quiz.questions.length;
  const mcqCount = total - quiz.questions.filter(isWritten).length;

  useEffect(() => {
    if (viewing) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [viewing]);

  const file = async (attempt: QuizAttempt) => {
    setSaving(true);
    setFailed(false);
    try {
      await addQuizAttemptOptimistic(quiz, attempt);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const handIn = () => {
    const attempt = markQuiz(quiz.questions, picks, written);
    setPending(attempt);
    setViewing(attempt.at);
    void file(attempt);
  };

  const again = () => {
    setPicks(quiz.questions.map(() => -1));
    setWritten({});
    setViewing(null);
    setPending(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const history = quiz.attempts;
  const best = useMemo(() => history.reduce((b, a) => Math.max(b, a.score), 0), [history]);
  const tally = marked ? writtenTally(quiz.questions, marked) : null;
  const standfirst = [
    course?.code,
    task?.title,
    `${total} ${total === 1 ? 'question' : 'questions'}${hasWritten && mcqCount ? `, ${total - mcqCount} written` : ''}`,
  ].filter(Boolean).join(' · ');

  const strokeFor = (attempt: QuizAttempt, q: QuizQuestion, i: number) => {
    if (!isWritten(q)) return attempt.picks[i] === q.answer ? 'got' : 'miss';
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
                    : <>filed{course ? <> under <em>{course.code}</em></> : null}{mcqCount && history.length > 1 ? <> · best <b>{Math.max(best, marked.score)}</b>/{mcqCount}</> : null}</>}
            </p>
          </div>
        </section>
      ) : history.length > 0 ? (
        <section className="quiz-history" aria-label="Past sittings">
          <span className="eyebrow">Before</span>
          <ul>
            {history.slice(-5).reverse().map((a) => {
              const t = writtenTally(quiz.questions, a);
              return (
                <li key={a.at}>
                  <button type="button" className="quiz-past" onClick={() => setViewing(a.at)} title="See this sitting">
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
                  <textarea
                    className="quiz-answer"
                    aria-label={`Answer to question ${i + 1}`}
                    placeholder="Write your answer"
                    rows={4}
                    value={text}
                    onChange={(event) => { const value = event.target.value; setWritten((all) => ({ ...all, [String(i)]: value })); }}
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
          return (
            <li key={i} className="quiz-q" data-state={marked ? (right ? 'got' : 'miss') : undefined}>
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
              {marked && (
                <p className="quiz-why">
                  {right ? null : pick < 0 ? <>left blank · it was <b>{LETTERS[q.answer]}</b>. </> : <>it was <b>{LETTERS[q.answer]}</b>. </>}
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
            <span className="standfirst">{answered === total ? 'all answered' : `${answered} of ${total} answered`}</span>
          </>
        )}
      </footer>
    </article>
  );
}

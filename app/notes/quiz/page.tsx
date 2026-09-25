'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import HandNote from '@/components/notebook/HandNote';
import Icon from '@/components/notes/Icon';
import QuizText from '@/components/notes/QuizText';
import { addQuizAttemptOptimistic, useCourses, useNotes, useQuizzes, useTasks } from '@/lib/data-hooks';
import { LETTERS, markQuiz } from '@/lib/quiz/format';
import { relativeLabel } from '@/lib/notes/store';
import type { Quiz, QuizAttempt } from '@/lib/data';

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
 * One sitting. Picks are pencilled in with highlighter, nothing is marked
 * until the whole paper is handed in, and then every question shows what was
 * right and why. The mark is filed under the quiz, and so under its course
 * and task, the moment it is handed in.
 */
function Sitting({ quiz }: { quiz: Quiz }) {
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const { notes } = useNotes();
  const course = quiz.courseId ? courses.find((c) => c.id === quiz.courseId) : undefined;
  const task = quiz.taskId ? tasks.find((t) => t.id === quiz.taskId) : undefined;
  const note = quiz.noteId ? notes.find((n) => n.id === quiz.noteId) : undefined;

  const [picks, setPicks] = useState<number[]>(() => quiz.questions.map(() => -1));
  const [marked, setMarked] = useState<QuizAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const answered = picks.filter((p) => p >= 0).length;
  const total = quiz.questions.length;

  useEffect(() => {
    if (marked) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [marked]);

  const handIn = async () => {
    const attempt = markQuiz(quiz.questions, picks);
    setMarked(attempt);
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

  const again = () => {
    setPicks(quiz.questions.map(() => -1));
    setMarked(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const history = quiz.attempts;
  const best = useMemo(() => history.reduce((b, a) => Math.max(b, a.score), 0), [history]);
  const standfirst = [course?.code, task?.title, `${total} ${total === 1 ? 'question' : 'questions'}`].filter(Boolean).join(' · ');

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

      {marked ? (
        <section className="quiz-mark" aria-live="polite">
          <HandNote size={34} rotate={-4}>{marked.score} / {marked.total}</HandNote>
          <div>
            <div className="strokes" aria-hidden>
              {quiz.questions.map((q, i) => <span key={i} data-r={marked.picks[i] === q.answer ? 'got' : 'miss'} />)}
            </div>
            <p className="strokes-label">
              {saving ? 'filing it…' : failed ? 'the mark didn’t save, try handing in again' : <>filed{course ? <> under <em>{course.code}</em></> : null}{history.length > 1 ? <> · best <b>{Math.max(best, marked.score)}</b>/{total}</> : null}</>}
            </p>
          </div>
        </section>
      ) : history.length > 0 ? (
        <section className="quiz-history" aria-label="Past sittings">
          <span className="eyebrow">Before</span>
          <ul>
            {history.slice(-5).reverse().map((a) => (
              <li key={a.at}>
                <span className="quiz-score">{a.score}/{a.total}</span>
                <span className="strokes" aria-hidden>
                  {quiz.questions.map((q, i) => <span key={i} data-r={a.picks[i] === q.answer ? 'got' : 'miss'} />)}
                </span>
                <span className="quiz-when">{relativeLabel(Date.parse(a.at)).toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className="quiz-list">
        {quiz.questions.map((q, i) => {
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
            {failed && <button type="button" className="btn" onClick={handIn}>Save the mark</button>}
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

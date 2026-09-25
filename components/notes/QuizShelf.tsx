'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Icon from './Icon';
import { noteColor, relativeLabel } from '@/lib/notes/store';
import { isWritten, writtenTally } from '@/lib/quiz/format';
import { useCourses, useQuizzes, useTasks } from '@/lib/data-hooks';

/**
 * The quizzes an assistant has sent, set above the notes so a new one is the
 * first thing on the shelf. Each is a row like a note's, with its last mark
 * where a note has its minutes. Before there is any, one line says how one
 * arrives, since there is nothing in the app to make one with.
 */
export default function QuizShelf({ onDelete }: { onDelete: (id: string, title: string) => void }) {
  const { quizzes, loaded, available } = useQuizzes();
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const courseOf = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const taskOf = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  if (!loaded || !available) return null;
  const untaken = quizzes.filter((q) => !q.attempts.length).length;
  const toMark = quizzes.filter((q) => {
    const last = q.attempts[q.attempts.length - 1];
    return last && writtenTally(q.questions, last).pending > 0;
  }).length;
  const status = [untaken ? `${untaken} to take` : '', toMark ? `${toMark} waiting on your assistant` : ''].filter(Boolean).join(' · ');

  return (
    <section className="quiz-shelf" id="quizzes" aria-label="Quizzes">
      <div className="quiz-shelf-head">
        <span className="eyebrow">Quizzes</span>
        {quizzes.length > 0
          ? status && <span className="standfirst">{status}</span>
          : <span className="standfirst">none yet · tell your assistant “quiz me on this in Akada” and it lands here</span>}
      </div>
      <ul className="shelf">
        {quizzes.map((quiz) => {
          const course = quiz.courseId ? courseOf.get(quiz.courseId) : undefined;
          const task = quiz.taskId ? taskOf.get(quiz.taskId) : undefined;
          const last = quiz.attempts[quiz.attempts.length - 1];
          const tally = last ? writtenTally(quiz.questions, last) : null;
          const mcq = quiz.questions.filter((q) => !isWritten(q)).length;
          const parts = [course?.code, task?.title, `${quiz.questions.length} questions`, relativeLabel(Date.parse(quiz.createdAt))].filter(Boolean).join(' · ');
          const href = `/notes/quiz?q=${encodeURIComponent(quiz.id)}`;
          return (
            <li key={quiz.id}>
              <Link href={href} className="shelf-row" style={{ ['--c' as string]: course?.color ?? noteColor(quiz.id) }}>
                <span className="stripe" aria-hidden />
                <span className="body">
                  <span className="title">{quiz.title}</span>
                  <span className="sub">{parts}</span>
                </span>
                {last && (
                  <span className="mini" aria-hidden>
                    {quiz.questions.map((q, k) => {
                      if (!isWritten(q)) return <span key={k} data-r={last.picks[k] === q.answer ? 'got' : 'miss'} />;
                      const m = last.marks?.[String(k)];
                      return <span key={k} data-r={!m ? 'wait' : m.score >= m.outOf ? 'got' : m.score > 0 ? 'part' : 'miss'} />;
                    })}
                  </span>
                )}
                <span className="mins" title={last ? `Last mark, ${quiz.attempts.length} ${quiz.attempts.length === 1 ? 'sitting' : 'sittings'}` : undefined}>
                  {!last ? <em>new</em>
                    : tally && tally.pending ? <em>to mark</em>
                      : mcq ? <>{last.score}/{last.total}</> : <>{tally?.score}/{tally?.possible}</>}
                </span>
                <span className="row-tools">
                  <button
                    type="button"
                    className="row-tool del"
                    aria-label={`Delete ${quiz.title}`}
                    title="Delete"
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDelete(quiz.id, quiz.title); }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

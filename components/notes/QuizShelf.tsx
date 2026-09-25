'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Icon from './Icon';
import { noteColor, relativeLabel } from '@/lib/notes/store';
import { useCourses, useQuizzes, useTasks } from '@/lib/data-hooks';

/**
 * The quizzes an assistant has sent, under the notes. Each is a row like a
 * note's, with its last mark where a note has its minutes. Nothing is drawn
 * until there is a quiz, so a shelf without one looks as it always did.
 */
export default function QuizShelf({ onDelete }: { onDelete: (id: string, title: string) => void }) {
  const { quizzes } = useQuizzes();
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const courseOf = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const taskOf = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  if (!quizzes.length) return null;
  const untaken = quizzes.filter((q) => !q.attempts.length).length;

  return (
    <section className="quiz-shelf" aria-label="Quizzes">
      <div className="quiz-shelf-head">
        <span className="eyebrow">Quizzes</span>
        {untaken > 0 && <span className="standfirst">{untaken} not taken yet</span>}
      </div>
      <ul className="shelf">
        {quizzes.map((quiz) => {
          const course = quiz.courseId ? courseOf.get(quiz.courseId) : undefined;
          const task = quiz.taskId ? taskOf.get(quiz.taskId) : undefined;
          const last = quiz.attempts[quiz.attempts.length - 1];
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
                    {quiz.questions.map((q, k) => <span key={k} data-r={last.picks[k] === q.answer ? 'got' : 'miss'} />)}
                  </span>
                )}
                <span className="mins" title={last ? `Last mark, ${quiz.attempts.length} ${quiz.attempts.length === 1 ? 'sitting' : 'sittings'}` : undefined}>
                  {last ? <>{last.score}/{last.total}</> : <em>new</em>}
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

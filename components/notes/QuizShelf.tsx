'use client';

import Link from 'next/link';
import { useClaudeSheet } from '@/components/claude/ClaudeSheet';
import { quizPrompt } from '@/lib/claude-asks';
import { useMemo } from 'react';
import Icon from './Icon';
import { noteColor, relativeLabel } from '@/lib/notes/store';
import { isWritten, writtenTally } from '@/lib/quiz/format';
import { useCourses, useQuizzes, useTasks } from '@/lib/data-hooks';
import type { Course, Quiz, Task } from '@/lib/data';

export const quizHref = (id: string) => `/notes/quiz?q=${encodeURIComponent(id)}`;

/** Taken, and every written answer marked: nothing left to do on it. */
export function quizDone(quiz: Quiz) {
  const last = quiz.attempts[quiz.attempts.length - 1];
  return !!last && writtenTally(quiz.questions, last).pending === 0;
}

/** When a quiz last moved: its last sitting, its marking, or its arrival. */
export function quizTouched(quiz: Quiz) {
  const last = quiz.attempts[quiz.attempts.length - 1];
  return Date.parse(last?.markedAt ?? last?.at ?? quiz.createdAt) || 0;
}

/** What is left on the quizzes, in the standfirst's words. */
export function quizStatus(quizzes: Quiz[]) {
  const untaken = quizzes.filter((q) => !q.attempts.length).length;
  const toMark = quizzes.filter((q) => q.attempts.length && !quizDone(q)).length;
  return [untaken ? `${untaken} to take` : '', toMark ? `${toMark} waiting on your assistant` : ''].filter(Boolean).join(' · ');
}

/**
 * One quiz as a shelf row, like a note's, with its last mark where a note has
 * its minutes.
 */
export function QuizRow({ quiz, course, task, index, cursor, onDelete }: {
  quiz: Quiz;
  course?: Course;
  task?: Task;
  index?: number;
  cursor?: boolean;
  onDelete: (id: string, title: string) => void;
}) {
  const last = quiz.attempts[quiz.attempts.length - 1];
  const tally = last ? writtenTally(quiz.questions, last) : null;
  const mcq = quiz.questions.filter((q) => !isWritten(q)).length;
  const parts = ['quiz', course?.code, task?.title, `${quiz.questions.length} questions`, relativeLabel(Date.parse(quiz.createdAt))].filter(Boolean).join(' · ');
  return (
    <Link
      href={quizHref(quiz.id)}
      className="shelf-row quiz-row"
      data-index={index}
      data-cursor={cursor || undefined}
      style={{ ['--c' as string]: course?.color ?? noteColor(quiz.id) }}
    >
      <span className="stripe" aria-hidden />
      <span className="body">
        <span className="title">{quiz.title}</span>
        <span className="sub">{parts}</span>
      </span>
      {last && (
        <span className="mini" aria-hidden>
          {quiz.questions.map((q, k) => {
            if (!isWritten(q)) return <span key={k} data-r={last.unclear?.includes(k) ? 'unclear' : last.picks[k] === q.answer ? 'got' : 'miss'} />;
            const m = last.marks?.[String(k)];
            return <span key={k} data-r={!m ? 'wait' : m.score >= m.outOf ? 'got' : m.score > 0 ? 'part' : 'miss'} />;
          })}
        </span>
      )}
      <span className="mins" title={last ? `Last mark, ${quiz.attempts.length} ${quiz.attempts.length === 1 ? 'attempt' : 'attempts'}` : undefined}>
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
  );
}

/** Before any quiz has arrived, how one does. There is nothing in the app to make one with. */
export function NoQuizzesYet() {
  const claude = useClaudeSheet();
  return (
    <span className="standfirst">
      none yet · Claude makes them and they land here ·{' '}
      <button
        type="button"
        className="link"
        onClick={() =>
          claude.ask({
            does: 'Claude makes a quiz on what you choose and sends it here, to take on this shelf.',
            prompt: quizPrompt(null),
          })
        }
      >
        ask Claude for one
      </button>
    </span>
  );
}

/**
 * The quizzes on their own, for an empty notes shelf. Once there are notes
 * the quizzes are rows in the shelf itself, filtered and folded with them.
 */
export default function QuizShelf({ onDelete }: { onDelete: (id: string, title: string) => void }) {
  const { quizzes, loaded, available } = useQuizzes();
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const courseOf = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const taskOf = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  if (!loaded || !available) return null;
  const status = quizStatus(quizzes);

  return (
    <section className="quiz-shelf" aria-label="Quizzes">
      <div className="quiz-shelf-head">
        <span className="eyebrow">Quizzes</span>
        {quizzes.length > 0 ? status && <span className="standfirst">{status}</span> : <NoQuizzesYet />}
      </div>
      <ul className="shelf">
        {quizzes.map((quiz) => (
          <li key={quiz.id}>
            <QuizRow
              quiz={quiz}
              course={quiz.courseId ? courseOf.get(quiz.courseId) : undefined}
              task={quiz.taskId ? taskOf.get(quiz.taskId) : undefined}
              onDelete={onDelete}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

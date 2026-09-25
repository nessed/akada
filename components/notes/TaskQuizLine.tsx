'use client';

import Link from 'next/link';
import { useQuizzes } from '@/lib/data-hooks';

/**
 * On a task's sheet, the quizzes filed under it: the last mark, or that it
 * has not been taken, and the way in.
 */
export default function TaskQuizLine({ taskId }: { taskId: string }) {
  const { quizzes } = useQuizzes();
  const linked = quizzes.filter((q) => q.taskId === taskId);
  if (!linked.length) return null;
  return (
    <div className="mt-3 grid gap-2">
      {linked.map((quiz) => {
        const last = quiz.attempts[quiz.attempts.length - 1];
        const href = `/notes/quiz?q=${encodeURIComponent(quiz.id)}`;
        return (
          <div key={quiz.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-serif text-[13.5px] text-ink-soft">
            <span className="eyebrow">Quiz</span>
            <Link href={href} className="hand-underline text-ink">
              {quiz.title}
            </Link>
            <span className="italic text-muted">
              {last ? <>last <span className="font-mono not-italic text-[12px]">{last.score}/{last.total}</span></> : `${quiz.questions.length} questions, not taken`}
            </span>
            <span className="flex gap-3 font-sans text-[12.5px]">
              <Link href={href} className="text-ink-soft hover:text-ink">
                {last ? 'Take again' : 'Take it'}
              </Link>
            </span>
          </div>
        );
      })}
    </div>
  );
}

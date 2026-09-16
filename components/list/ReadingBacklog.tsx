'use client';

import { Eyebrow } from '../notebook/Marks';
import { TallyCount } from '../notebook/Tally';
import type { Course, Session, Task } from '@/lib/data';
import { backlogPages, readingBacklog, readingRate } from '@/lib/derive';

/**
 * Reading you are behind on, in pages rather than in vague guilt.
 *
 * The number at the top is the one that matters, and the line at the bottom
 * turns it into hours using a rate measured from the reader's own finished
 * readings — not a number the app made up. Where there is no history yet it
 * says "about" and uses a plain 20 pages an hour, which is honest about
 * being an estimate.
 */
export default function ReadingBacklog({
  tasks,
  courses,
  sessions,
}: {
  tasks: Task[];
  courses: Course[];
  sessions: Session[];
}) {
  const backlog = readingBacklog(tasks);
  if (backlog.length === 0) return null;

  const pages = backlogPages(tasks);
  const rate = readingRate(tasks, sessions);
  const hours = pages > 0 ? Math.max(1, Math.round(pages / rate)) : 0;

  // Which course the backlog is really about, when one of them dominates it.
  const byCourse = new Map<string, number>();
  for (const t of backlog) byCourse.set(t.courseId, (byCourse.get(t.courseId) || 0) + (t.pages || 0));
  const worst = [...byCourse.entries()].sort((a, b) => b[1] - a[1])[0];
  const worstCourse = worst && worst[1] > pages * 0.4 ? courses.find((c) => c.id === worst[0]) : null;

  return (
    <div>
      <div className="rule-ink pb-3.5 pt-4">
        <Eyebrow>Reading backlog</Eyebrow>
        <p className="mt-2 font-serif text-[19px] leading-[1.3]">
          {pages > 0 ? (
            <>
              {pages} pages behind
              {worstCourse ? `, mostly ${worstCourse.code}.` : '.'}
            </>
          ) : (
            <>
              {backlog.length} {backlog.length === 1 ? 'reading' : 'readings'} still open.
            </>
          )}
        </p>
      </div>

      <div className="mt-4">
        {backlog.slice(0, 6).map((task, i) => {
          const course = courses.find((c) => c.id === task.courseId);
          const spent = sessions
            .filter((s) => s.taskId === task.id)
            .reduce((acc, s) => acc + s.durationSeconds, 0);
          const started = spent > 0;
          return (
            <div
              key={task.id}
              className={i === Math.min(backlog.length, 6) - 1 ? 'py-3' : 'row-rule py-3'}
            >
              <div className="flex items-baseline gap-2.5">
                <span
                  aria-hidden
                  className="block h-[13px] w-[3px] flex-none"
                  style={{ background: course?.color || 'var(--muted)' }}
                />
                <span className="min-w-0 flex-1 text-[13.5px]">{task.title}</span>
                {task.pages ? (
                  <span
                    className="flex-none font-mono text-[11px]"
                    style={{
                      color: task.dueDate && task.dueDate < isoToday() ? 'var(--warn)' : 'var(--muted)',
                    }}
                  >
                    {task.pages}p
                  </span>
                ) : null}
              </div>
              {/* Strokes for what has already been read into it. A reading
                  someone has started is a different thing from one they have
                  not opened, and the list should show which is which. */}
              {started && (
                <div className="ml-3 mt-2">
                  <TallyCount count={Math.max(1, Math.round(spent / 1800))} height={12} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hours > 0 && (
        <p className="mt-3 font-serif text-[13.5px] italic text-muted">
          At your usual {rate} pages an hour, that is about {hours}{' '}
          {hours === 1 ? 'hour' : 'hours'}.
        </p>
      )}
    </div>
  );
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

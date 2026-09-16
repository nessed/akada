'use client';

import { Eyebrow } from '../notebook/Marks';
import type { Course, Session } from '@/lib/data';
import { formatHM } from '@/lib/utils';

/**
 * What you wrote down while studying.
 *
 * The session note existed in the data all along and had nowhere to be read.
 * That made this log a list of durations — accurate, and useless, because
 * "1h 50m on Monday" tells you nothing you can use on Tuesday. With the note
 * on the line it becomes the only record of what actually happened in those
 * hours, which is the thing worth keeping.
 *
 * A session with no note says so quietly rather than leaving a blank line: an
 * empty row reads as missing data, and "nothing written down" is a fact.
 */
export default function SessionLog({
  sessions,
  course,
  totalSeconds,
  limit = 12,
}: {
  sessions: Session[];
  course: Course;
  totalSeconds: number;
  limit?: number;
}) {
  const log = [...sessions]
    .sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date))
    .slice(0, limit);

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-3.5 border-b border-line pb-2.5">
        <p className="m-0 font-serif text-[19px]">Sessions</p>
        <span className="ml-auto font-mono text-[11px] text-muted">
          {formatHM(totalSeconds)} all term
        </span>
      </div>

      {log.length === 0 ? (
        <p className="py-4 font-serif text-[15px] italic text-muted-soft">
          Nothing logged against this one yet.
        </p>
      ) : (
        log.map((session, i) => (
          <div
            key={session.id}
            className={`flex gap-3.5 px-0.5 py-3 ${i === log.length - 1 ? '' : 'row-rule'}`}
          >
            {/* One stroke in the course's colour, the same mark the tallies
                are made of, so a session reads as a unit of the same thing. */}
            <span aria-hidden className="flex w-3 flex-none justify-center pt-1">
              <i
                className="tally-stroke"
                style={{ height: 13, background: course.color }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2.5">
                <span className="font-mono text-[11px] uppercase text-muted">
                  {stamp(session)}
                </span>
                <span className="ml-auto font-mono text-[13px] font-bold">
                  {formatHM(session.durationSeconds)}
                </span>
              </span>
              <span
                className={`mt-1.5 block font-serif text-[14.5px] leading-[1.5] ${
                  session.note ? 'text-ink-soft' : 'italic text-muted-soft'
                }`}
              >
                {session.note || 'nothing written down'}
              </span>
            </span>
          </div>
        ))
      )}

      {sessions.length > limit && (
        <p className="mt-3 font-serif text-[13px] italic text-muted-soft">
          {sessions.length - limit} older {sessions.length - limit === 1 ? 'session' : 'sessions'}{' '}
          not shown.
        </p>
      )}
    </section>
  );
}

/** "MON 5 OCT · 14:10", from the date plus the moment the timer stopped. */
function stamp(session: Session): string {
  const day = new Date(session.date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const at = new Date(session.createdAt);
  if (Number.isNaN(at.getTime())) return day;
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `${day} · ${clock}`;
}

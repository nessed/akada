'use client';

import type { Session } from '@/lib/data';
import { clampSessionSeconds } from '@/lib/session-safety';
import { formatHM, formatRelativeDate } from '@/lib/utils';

interface Props {
  /** This course's sessions, newest first. */
  sessions: Session[];
  /** The course's own colour, for the tally stroke in the margin. */
  color: string;
  /** How many to print before the page stops. */
  limit?: number;
  /** Said quietly when there is nothing logged yet. */
  emptyLine?: string;
}

/**
 * The hours, written down. Same ledger line the Stats journal uses, a tally
 * stroke in the margin, the day, whatever note was left, the duration in mono,
 * minus the swipe-to-delete: a session is deleted where the whole log lives.
 */
export default function CourseSessionLog({
  sessions,
  color,
  limit = 6,
  emptyLine = 'Nothing logged for this course yet.',
}: Props) {
  if (sessions.length === 0) {
    return (
      <p className="mt-0 mb-3 font-serif text-[13px] italic text-muted-soft">{emptyLine}</p>
    );
  }

  return (
    <div>
      {sessions.slice(0, limit).map((session) => (
        <div
          key={session.id}
          className="flex items-start gap-3 border-b border-dashed border-line py-3 last:border-0"
        >
          <span aria-hidden className="flex w-3 shrink-0 justify-center pt-[3px]">
            <span
              className="mt-[1px] block h-[11px] w-[2px] rounded-[1px]"
              style={{ background: color, transform: 'rotate(9deg)' }}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 font-serif text-[14.5px] font-medium text-ink">
              {formatRelativeDate(session.date)}
            </p>
            {session.note && (
              <p className="mt-1 mb-0 text-[12px] leading-[1.45] text-ink-soft">
                {session.note}
              </p>
            )}
          </div>
          <span className="tnum shrink-0 pt-[2px] font-mono text-[13px] font-semibold text-ink">
            {formatHM(clampSessionSeconds(session.durationSeconds))}
          </span>
        </div>
      ))}
    </div>
  );
}

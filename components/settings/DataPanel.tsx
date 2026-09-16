'use client';

import { SettingRow } from './SettingsPrimitives';
import { TextButton } from '@/components/notebook/Marks';
import type { Course, Session } from '@/lib/data';
import { formatHM } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import { cleanSessionNote } from '@/lib/planner-safety';

/**
 * Your data, and the door out of it.
 *
 * The export is a plain CSV built in the browser — no endpoint, nothing sent
 * anywhere. A planner that keeps a term of someone's attention should be
 * able to hand it back in a form a spreadsheet opens, and that claim is
 * cheaper to keep than to explain.
 */
export default function DataPanel({
  sessions,
  courses,
  onReset,
}: {
  sessions: Session[];
  courses: Course[];
  onReset: () => void;
}) {
  const real = sessions.filter((s) => isLoggableDuration(s.durationSeconds));
  const total = real.reduce((acc, s) => acc + clampSessionSeconds(s.durationSeconds), 0);

  function exportSessions() {
    const lines = [
      ['date', 'course', 'duration_minutes', 'note'].join(','),
      ...real.map((s) => {
        const course = courses.find((c) => c.id === s.courseId);
        // Doubled quotes, because a session note is free text and a stray
        // one would split the row into columns that never existed.
        const note = cleanSessionNote(s.note).replace(/"/g, '""');
        return [
          s.date,
          course ? `"${course.code}"` : '',
          Math.round(clampSessionSeconds(s.durationSeconds) / 60).toString(),
          `"${note}"`,
        ].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akada-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="m-0 font-serif text-[30px] font-normal leading-none tracking-[-0.03em] md:text-[38px]">
        Your data
      </h1>
      <p className="mt-3 max-w-[52ch] font-serif text-[15.5px] leading-[1.6] text-ink-soft">
        {real.length === 0
          ? 'Nothing logged yet.'
          : `${real.length} ${real.length === 1 ? 'session' : 'sessions'}, ${formatHM(total)} in total, across ${courses.length} ${courses.length === 1 ? 'course' : 'courses'}.`}
      </p>

      <div className="rule-ink mt-7 pt-1">
        <SettingRow
          label="Export the sessions"
          sub="A CSV, built here on your device and sent nowhere"
          onClick={exportSessions}
          value={real.length ? `${real.length} rows` : undefined}
        />
        <SettingRow
          label="Clear the planner"
          sub="Every course, task and session. The account stays."
          onClick={onReset}
          tone="care"
        />
      </div>

      <p className="mt-6 max-w-[52ch] font-serif text-[13.5px] italic leading-[1.55] text-muted">
        Row Level Security is what keeps a student&apos;s work theirs, and the app holds no key
        that can read past it. There is a fuller account of it in{' '}
        <TextButton tone="quiet" className="inline">
          <a href="/privacy">the privacy page</a>
        </TextButton>
        .
      </p>
    </div>
  );
}

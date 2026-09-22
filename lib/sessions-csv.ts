import type { Course, Session } from './data';
import { cleanSessionNote } from './planner-safety';
import { clampSessionSeconds, isLoggableDuration } from './session-safety';

/**
 * The sessions as a CSV, one sitting a line. The one exporter every "Export
 * sessions" in the app uses, so the file is the same whichever screen it was
 * taken from: there were three, and when a column was added to one of them
 * the other two went on writing the file without it under the same name.
 */
export function sessionsCsv(sessions: Session[], courses: Course[]): string {
  const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;
  return [
    ['date', 'course', 'duration_minutes', 'note', 'score', 'out_of'].join(','),
    ...sessions
      .filter((session) => isLoggableDuration(session.durationSeconds))
      .map((session) => {
        const course = courses.find((c) => c.id === session.courseId);
        return [
          session.date,
          course ? quote(course.code) : '',
          Math.round(clampSessionSeconds(session.durationSeconds) / 60).toString(),
          quote(cleanSessionNote(session.note)),
          session.score ?? '',
          session.scoreOutOf ?? '',
        ].join(',');
      }),
  ].join('\n');
}

/** Hands the reader the file. Browser only. */
export function downloadSessionsCsv(sessions: Session[], courses: Course[]): void {
  const blob = new Blob([sessionsCsv(sessions, courses)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `akada-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

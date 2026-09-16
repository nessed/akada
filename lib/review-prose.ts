import type { Course, Session, Task } from './data';
import { formatHM, daysBetween } from './utils';

/**
 * The week, written out in plain words.
 *
 * Review's whole argument is that a page of sentences beats a page of charts:
 * "POL 227 got nothing after Tuesday" is a thing you can act on, and a bar
 * two thirds the height of another bar is not. That only works if the
 * sentences are true, so every one of them is assembled here from counted
 * facts, and anything the data cannot support is simply not said.
 *
 * The rules this follows:
 *  - Never congratulate. The page reports, it does not cheer.
 *  - Never scold. A dropped course is stated, not complained about.
 *  - Say nothing rather than something vague. A week with two sessions in it
 *    gets two clauses, not a paragraph padded out to look substantial.
 */

export interface WeekFacts {
  totalSeconds: number;
  byCourse: { course: Course; seconds: number; lastDate: string | null }[];
  untouched: { course: Course; lastDate: string | null }[];
  longestSession: Session | null;
  longestCourse: Course | null;
  finished: Task[];
  carried: Task[];
  sessionCount: number;
  dayCount: number;
}

export function weekFacts(
  courses: Course[],
  sessions: Session[],
  tasks: Task[],
  from: string,
  to: string,
): WeekFacts {
  const inWeek = sessions.filter((s) => s.date >= from && s.date <= to);
  const totalSeconds = inWeek.reduce((acc, s) => acc + s.durationSeconds, 0);

  const byCourse = courses
    .map((course) => {
      const own = inWeek.filter((s) => s.courseId === course.id);
      const lastDate = own.length ? own.map((s) => s.date).sort().at(-1) ?? null : null;
      return {
        course,
        seconds: own.reduce((acc, s) => acc + s.durationSeconds, 0),
        lastDate,
      };
    })
    .sort((a, b) => b.seconds - a.seconds);

  // A course is "untouched" relative to this week, but the date it shows is
  // the last time it was opened at all — which is the useful number.
  const untouched = byCourse
    .filter((row) => row.seconds === 0)
    .map((row) => {
      const ever = sessions.filter((s) => s.courseId === row.course.id).map((s) => s.date).sort();
      return { course: row.course, lastDate: ever.at(-1) ?? null };
    });

  const longestSession =
    inWeek.length > 0
      ? inWeek.reduce((best, s) => (s.durationSeconds > best.durationSeconds ? s : best))
      : null;

  return {
    totalSeconds,
    byCourse,
    untouched,
    longestSession,
    longestCourse:
      courses.find((c) => c.id === longestSession?.courseId) ?? null,
    finished: tasks.filter(
      (t) => t.completed && t.completedAt && t.completedAt.slice(0, 10) >= from && t.completedAt.slice(0, 10) <= to,
    ),
    carried: tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < to),
    sessionCount: inWeek.length,
    dayCount: new Set(inWeek.map((s) => s.date)).size,
  };
}

/** The 52px line at the top. One sentence, and it has to be the true one. */
export function headline(facts: WeekFacts): { lead: string; emphasis: string } | null {
  if (facts.totalSeconds === 0) return { lead: 'Nothing was logged', emphasis: 'this week.' };

  const top = facts.byCourse[0];
  if (!top || top.seconds === 0) return { lead: 'A quiet', emphasis: 'week.' };

  const share = top.seconds / facts.totalSeconds;
  if (share >= 0.55) {
    return { lead: 'You spent the week', emphasis: `on ${top.course.code.split(' ')[0]}.` };
  }
  const worked = facts.byCourse.filter((r) => r.seconds > 0).length;
  if (worked >= 3) {
    return { lead: 'The week went', emphasis: `across ${worked} courses.` };
  }
  return { lead: 'Mostly', emphasis: `${top.course.code.split(' ')[0]}, then the rest.` };
}

/**
 * The paragraph under the headline. Each clause is only added when the data
 * actually supports it, which is why this builds an array rather than
 * filling in a template.
 */
export function summary(facts: WeekFacts, today: string): string {
  if (facts.totalSeconds === 0) {
    return facts.carried.length > 0
      ? `Nothing was logged, and ${facts.carried.length} ${
          facts.carried.length === 1 ? 'thing is' : 'things are'
        } still carried over.`
      : 'Nothing was logged this week, and nothing was carried over either.';
  }

  const parts: string[] = [];
  const hours = formatHM(facts.totalSeconds);
  const top = facts.byCourse[0];
  const share = top ? top.seconds / facts.totalSeconds : 0;

  if (share >= 0.55) {
    parts.push(
      `${hours}, and ${share >= 0.66 ? 'two thirds' : 'over half'} of it went to ${top.course.code}.`,
    );
  } else {
    parts.push(`${hours} across ${facts.dayCount} ${facts.dayCount === 1 ? 'day' : 'days'}.`);
  }

  const dropped = facts.untouched[0];
  if (dropped) {
    if (dropped.lastDate) {
      const days = daysBetween(dropped.lastDate, today);
      parts.push(
        `${dropped.course.code} got nothing — it has been ${days} ${
          days === 1 ? 'day' : 'days'
        } since you opened it.`,
      );
    } else {
      parts.push(`${dropped.course.code} has not been opened at all yet.`);
    }
  }

  if (facts.longestSession && facts.longestSession.durationSeconds >= 45 * 60) {
    const day = new Date(facts.longestSession.date + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'long',
    });
    parts.push(
      `Your longest sitting was ${day}, ${formatHM(facts.longestSession.durationSeconds)} at once.`,
    );
  }

  return parts.join(' ');
}

/**
 * The one question in the margin.
 *
 * It is a question, not advice: the app has noticed something and does not
 * know why, and the reader does. Null when there is nothing worth asking
 * about, because a question asked every week stops being one.
 */
export function oneQuestion(facts: WeekFacts, today: string): string | null {
  const dropped = facts.untouched[0];
  if (dropped) {
    const days = dropped.lastDate ? daysBetween(dropped.lastDate, today) : null;
    if (days !== null && days >= 10) {
      return `${dropped.course.code} has been quiet for ${days} days now. Is the work too long, or is the slot wrong?`;
    }
    return `${dropped.course.code} got nothing this week. Is the reading too long, or is the slot wrong?`;
  }

  const top = facts.byCourse[0];
  if (top && facts.totalSeconds > 0 && top.seconds / facts.totalSeconds >= 0.66) {
    return `Two thirds of the week went to ${top.course.code}. Was that the plan, or did it take the time?`;
  }

  const moved = facts.carried.filter((t) => t.dueDate && daysBetween(t.dueDate, today) >= 7);
  if (moved.length > 0) {
    return `"${moved[0].title}" has been on the list over a week. Is it bigger than one sitting?`;
  }

  if (facts.sessionCount > 0 && facts.dayCount <= 2) {
    return `The whole week landed on ${facts.dayCount} ${
      facts.dayCount === 1 ? 'day' : 'days'
    }. Would it sit better spread out?`;
  }

  return null;
}

/** The marks under "How it felt". Chosen, not typed. */
export const FEELINGS = ['steady', 'scattered', 'behind on one', 'tired', 'good week'];

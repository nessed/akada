import type { Course } from '../data';
import {
  HABIT_MIN_BLOCKS,
  HABIT_MIN_SITTINGS,
  HABIT_MIN_TAGGED,
  hourLabel,
  roughMinutes,
  settled,
  WEEKDAY_NAMES,
  windowLabel,
  type Habits,
} from './habits';

/**
 * Notes in the margin.
 *
 * Each one is a sentence about how this reader studies, drawn from
 * ./habits.ts and stated only once there is enough behind it. They are the
 * app noticing things, which is what makes a notebook feel like it has been
 * written in rather than printed: "your sittings mostly land in the evening",
 * "MATH blocks run past the block more often than not", "this is usually
 * your hour".
 *
 * They are observations and never instructions. None of them says "you
 * should"; none of them counts what was missed. A note that is true today
 * and false next month simply goes, and a new one takes its place, which is
 * the whole point: the margin changes as the term does, and it fills in as
 * the app gets to know the reader.
 *
 * `now` marks a note that is current at this moment, this hour or this
 * weekday, so the margin can say something about the present rather than
 * the term in general.
 */

export interface Observation {
  id: string;
  /** Lowercase, one clause, no verb of judgement. */
  text: string;
  courseId: string | null;
  /** How much evidence sits behind it. The margin prefers the heavier. */
  weight: number;
  /** True while the moment makes it current. */
  now: boolean;
}

export interface ObservationInput {
  habits: Habits;
  courses: Course[];
  /** The moment the notes are read at, for the ones about the present. */
  now: Date;
  /** Whether anything has been logged today; the hour's note yields to a day already begun. */
  loggedToday: boolean;
}

export function readObservations({ habits, courses, now, loggedToday }: ObservationInput): Observation[] {
  const out: Observation[] = [];
  const code = (id: string) => courses.find((c) => c.id === id)?.code ?? 'this course';
  const hour = now.getHours();

  if (habits.peak) {
    const inWindow = [0, 1, 2].some((i) => (habits.peak!.start + i) % 24 === hour);
    out.push({
      id: 'peak',
      text: `your sittings mostly land ${windowLabel(habits.peak.start)}`,
      courseId: null,
      weight: habits.days,
      now: false,
    });
    if (inWindow && !loggedToday) {
      out.push({
        id: 'peak-now',
        text: `this is usually your hour`,
        courseId: null,
        weight: habits.days * 2,
        now: true,
      });
    }
  }

  if (habits.fullestDay !== null) {
    const today = now.getDay() === habits.fullestDay;
    out.push({
      id: 'fullest-day',
      text: `${WEEKDAY_NAMES[habits.fullestDay]}s carry the most of your week`,
      courseId: null,
      weight: habits.weeks * 3,
      now: today,
    });
  }

  if (settled(habits.sittings)) {
    out.push({
      id: 'sitting',
      text: `a sitting of yours usually runs ${roughMinutes(habits.sittings.median)} minutes`,
      courseId: null,
      weight: habits.sittings.n,
      now: false,
    });
  }

  if (settled(habits.blocksPerSitting, HABIT_MIN_SITTINGS)) {
    const blocks = Math.round(habits.blocksPerSitting.median);
    if (blocks >= 2) {
      out.push({
        id: 'blocks',
        text: `you usually stop after ${blocks} blocks`,
        courseId: null,
        weight: habits.blocksPerSitting.n,
        now: false,
      });
    }
  }

  if (settled(habits.breaks.taken, HABIT_MIN_BLOCKS) && settled(habits.breaks.meant, HABIT_MIN_BLOCKS)) {
    const meant = roughMinutes(habits.breaks.meant.median);
    const taken = roughMinutes(habits.breaks.taken.median);
    if (habits.breaks.taken.median >= habits.breaks.meant.median * 1.5) {
      out.push({
        id: 'breaks-over',
        text: `a ${meant} minute break of yours usually runs to ${taken}`,
        courseId: null,
        weight: habits.breaks.taken.n,
        now: false,
      });
    } else if (habits.breaks.taken.median <= habits.breaks.meant.median) {
      out.push({
        id: 'breaks-under',
        text: `your breaks come in under what you set them to`,
        courseId: null,
        weight: habits.breaks.taken.n,
        now: false,
      });
    }
  }

  // The course that opens the day, when one clearly does.
  const opener = [...habits.byCourse.values()].sort((a, b) => b.openedDays - a.openedDays)[0];
  if (opener && opener.openedDays >= HABIT_MIN_SITTINGS && opener.openedDays >= habits.days * 0.5) {
    out.push({
      id: `opens:${opener.courseId}`,
      text: `${code(opener.courseId)} usually opens your day`,
      courseId: opener.courseId,
      weight: opener.openedDays,
      now: !loggedToday,
    });
  }

  for (const habit of habits.byCourse.values()) {
    const name = code(habit.courseId);

    if (settled(habit.blocks, HABIT_MIN_BLOCKS)) {
      out.push({
        id: `blocks:${habit.courseId}`,
        text: `${name} blocks run about ${roughMinutes(habit.blocks.median)} minutes`,
        courseId: habit.courseId,
        weight: habit.blocks.n,
        now: false,
      });
    }

    if (habit.overrun.n >= HABIT_MIN_BLOCKS && habit.overrun.over / habit.overrun.n >= 0.6) {
      out.push({
        id: `overrun:${habit.courseId}`,
        text: `${name} runs past the block more often than not · ${habit.overrun.over} of ${habit.overrun.n}`,
        courseId: habit.courseId,
        weight: habit.overrun.n * 2,
        now: false,
      });
    }

    // A course's own hour is only worth a note when it differs from the
    // reader's hour in general; otherwise it is the same fact said twice.
    if (habit.peak && (!habits.peak || hourGap(habit.peak.start, habits.peak.start) >= 3)) {
      const inWindow = [0, 1, 2].some((i) => (habit.peak!.start + i) % 24 === hour);
      out.push({
        id: `peak:${habit.courseId}`,
        text: `${name} mostly happens ${windowLabel(habit.peak.start)}, around ${hourLabel(habit.peak.start + 1)}`,
        courseId: habit.courseId,
        weight: habit.sittings.n * 2,
        now: inWindow,
      });
    }

    if (habit.distracted.n >= HABIT_MIN_TAGGED && habit.distracted.count / habit.distracted.n >= 0.5) {
      out.push({
        id: `distracted:${habit.courseId}`,
        text: `${habit.distracted.count} of ${habit.distracted.n} tagged ${name} sittings were #distracted`,
        courseId: habit.courseId,
        weight: habit.distracted.n,
        now: false,
      });
    }

    if (habit.pagesPerHour) {
      out.push({
        id: `pace:${habit.courseId}`,
        text: `${name} reads at about ${habit.pagesPerHour} pages an hour for you`,
        courseId: habit.courseId,
        weight: 4,
        now: false,
      });
    }
  }

  return out.sort((a, b) => Number(b.now) - Number(a.now) || b.weight - a.weight);
}

function hourGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}

/**
 * The one note for a margin.
 *
 * A note about the present moment wins outright. Otherwise the choice
 * rotates by `seed` (the date) among the best few, so the margin reads
 * differently tomorrow without the notes themselves having changed, the way
 * a re-read notebook catches a different line each time.
 */
export function pickMarginNote(
  observations: Observation[],
  seed: string,
  courseId: string | null = null,
): Observation | null {
  const pool = courseId
    ? observations.filter((o) => o.courseId === courseId)
    : observations;
  if (pool.length === 0) return null;
  const current = pool.find((o) => o.now);
  if (current) return current;
  const top = pool.slice(0, 4);
  return top[hash(seed) % top.length];
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

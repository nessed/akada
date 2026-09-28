import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, Task } from './data';
import {
  readLengths,
  readRhythm,
  readSpan,
  readStandings,
  readTaskFlow,
  readTermWeeks,
  spanWindows,
} from './stats-lens';
import { paceChoices, readPace } from './stats-reading';

// A Wednesday.
const TODAY = '2026-09-23';

function sat(id: string, date: string, minutes: number, patch: Partial<Session> = {}): Session {
  return {
    id, courseId: 'math', taskId: null, date, durationSeconds: minutes * 60, note: '',
    createdAt: `${date}T12:00:00.000Z`, ...patch,
  };
}

function course(id: string, goal: number): Course {
  return { id, code: id.toUpperCase(), name: id, color: '#A8B89B', weeklyGoalHours: goal, createdAt: '2026-08-01T00:00:00.000Z' };
}

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id, courseId: 'math', title: id, dueDate: null, priority: 'normal', completed: false,
    completedAt: null, createdAt: `${TODAY}T09:00:00.000Z`, ...patch,
  };
}

test('a week is raced against last week by the same day, not the whole of it', () => {
  const w = spanWindows('week', TODAY, '2026-09-01');
  assert.deepEqual(w.now, { from: '2026-09-21', to: TODAY });
  assert.deepEqual(w.before, { from: '2026-09-14', to: '2026-09-16' });
  assert.equal(w.againstName, 'last week by now');
});

test('the term stands alone, from its first day', () => {
  const w = spanWindows('term', TODAY, '2026-09-01');
  assert.equal(w.before, null);
  assert.equal(w.now.from, '2026-09-01');
});

test('a span counts days, sittings and the middle sitting, leaving recovered ones out of lengths', () => {
  const figures = readSpan(
    [
      sat('a', '2026-09-21', 30),
      sat('b', '2026-09-21', 60),
      sat('c', '2026-09-22', 90),
      sat('d', '2026-09-22', 600, { recovery: 'idle' }),
      sat('old', '2026-09-10', 45),
    ],
    [task('t1', { completed: true, completedAt: `${TODAY}T10:00:00.000Z` }), task('t2', { completed: true, completedAt: `${TODAY}T10:00:00.000Z`, completedVia: 'skip' })],
    { from: '2026-09-21', to: TODAY },
  );
  assert.equal(figures.days, 2);
  assert.equal(figures.sittings, 4);
  assert.equal(figures.medianSitting, 60 * 60);
  assert.equal(figures.longestSitting, 90 * 60);
  assert.equal(figures.tasksDone, 1);
  assert.equal(figures.tasksSkipped, 1);
  assert.equal(figures.daysElapsed, 3);
});

test('term weeks run to the end of the term, the ones to come left empty', () => {
  const weeks = readTermWeeks([sat('a', '2026-09-02', 60), sat('b', TODAY, 30)], [], '2026-09-01', '2026-10-15', TODAY);
  assert.equal(weeks[0].start, '2026-08-31');
  assert.equal(weeks[0].seconds, 3600);
  const current = weeks.find((w) => w.current)!;
  assert.equal(current.byDay[2], 1800);
  assert.ok(weeks.at(-1)!.future);
  assert.equal(weeks.at(-1)!.start, '2026-10-12');
});

test('standings weigh courses against their goals, and the week in progress is never a missed goal', () => {
  const sessions = [
    sat('a', '2026-09-15', 180), // last week, math on goal at 3h
    sat('b', TODAY, 60),
    sat('c', TODAY, 60, { courseId: 'econ' }),
  ];
  const w = spanWindows('week', TODAY, '2026-09-01');
  const [math, econ] = readStandings([course('math', 3), course('econ', 1)], sessions, w, TODAY, '2026-09-01');
  assert.equal(math.seconds, 3600);
  assert.equal(math.share, 0.5);
  assert.equal(math.goalShare, 0.75);
  assert.equal(math.weeksOnGoal, 1);
  assert.equal(math.weeksCounted, 3);
  assert.equal(econ.weeksOnGoal, 0);
  assert.equal(math.weekly.at(-1), 3600);
});

test('a timed block is spread across the hours it ran through', () => {
  const start = new Date(2026, 8, 21, 20, 30, 0); // Monday 8:30pm local
  const rhythm = readRhythm(
    [
      sat('a', '2026-09-21', 60, {
        segments: [{ kind: 'focus', ordinal: 1, startedAt: start.toISOString(), seconds: 3600, targetSeconds: null }],
      }),
      sat('b', '2026-09-22', 30),
    ],
    { from: '2026-09-21', to: TODAY },
  );
  assert.equal(rhythm.grid[0][20], 1800);
  assert.equal(rhythm.grid[0][21], 1800);
  assert.equal(rhythm.placed, 1);
  assert.equal(rhythm.byWeekday[1], 1800);
});

test('lengths sort sittings into buckets and name the one carrying the most hours', () => {
  const lengths = readLengths(
    [sat('a', TODAY, 10), sat('b', TODAY, 10), sat('c', TODAY, 10), sat('d', TODAY, 100)],
    { from: '2026-09-21', to: TODAY },
  );
  assert.equal(lengths.buckets[0].n, 3);
  assert.equal(lengths.heaviest, 5);
});

test('the list in and out counts by week and reads what a finished task took', () => {
  const flow = readTaskFlow(
    [
      task('a', { completed: true, completedAt: `${TODAY}T10:00:00.000Z` }),
      task('b', { dueDate: '2026-09-20' }),
      task('c', { dueDate: '2026-09-25' }),
    ],
    [sat('s', TODAY, 45, { taskId: 'a' })],
    TODAY,
  );
  assert.equal(flow.weeks.at(-1)!.added, 3);
  assert.equal(flow.weeks.at(-1)!.done, 1);
  assert.equal(flow.overdue, 1);
  assert.equal(flow.dueSoon, 1);
  assert.equal(flow.medianPerTask, 45 * 60);
});

test('the race can be run against a usual week or the best one', () => {
  const sessions = [
    sat('w1', '2026-08-31', 60),
    sat('w2', '2026-09-07', 600),
    sat('w3', '2026-09-14', 120),
    sat('now', '2026-09-21', 90),
  ];
  const choices = paceChoices(sessions, TODAY);
  assert.equal(choices.usual, true);
  assert.equal(choices.best, true);
  assert.equal(readPace(sessions, TODAY, 'last').lastTotal, 120 * 60);
  assert.equal(readPace(sessions, TODAY, 'best').lastTotal, 600 * 60);
  assert.equal(readPace(sessions, TODAY, 'usual').lastTotal, 120 * 60);
  assert.equal(readPace(sessions, TODAY, 'usual').name, 'a usual week');
});

test('a usual week waits for three whole weeks', () => {
  assert.equal(paceChoices([sat('a', '2026-09-14', 60), sat('b', TODAY, 60)], TODAY).usual, false);
});

test('with a day that ends at 8am, the small hours sit on the day they belong to', () => {
  // Monday 4am local, a sitting the reader's day files under Sunday.
  const start = new Date(2026, 8, 28, 4, 0, 0);
  const rhythm = readRhythm(
    [
      sat('night', '2026-09-27', 60, {
        segments: [{ kind: 'focus', ordinal: 1, startedAt: start.toISOString(), seconds: 3600, targetSeconds: null }],
      }),
    ],
    { from: '2026-09-21', to: '2026-09-28' },
    8,
  );
  assert.equal(rhythm.startHour, 8);
  // Sunday's row, twenty hours after the day began at 8am.
  assert.equal(rhythm.grid[6][20], 3600);
  assert.equal(rhythm.peak?.day, 6);
  assert.equal(rhythm.peak?.hour, 4);
  assert.equal(rhythm.byWeekday[6], 3600);
});

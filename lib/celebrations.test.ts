import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { Course, Session } from './data/types';
import {
  rankCelebrations,
  readAchievements,
  recordFingerprint,
  takeNewCelebrations,
} from './celebrations';

/**
 * What counts as reached, and the ledger that keeps a crossing from being
 * celebrated twice, on a first visit, or when a goal is merely lowered.
 */

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const MATH: Course = {
  id: 'math',
  code: 'MATH',
  name: 'Calculus',
  color: '#A8B89B',
  weeklyGoalHours: 2,
  createdAt: '2026-09-01T00:00:00.000Z',
};
const PHYS: Course = { ...MATH, id: 'phys', code: 'PHYS', weeklyGoalHours: 3 };

// Thursday, in a week that starts on Monday the 14th.
const THU = '2026-09-17';

let n = 0;
function sat(courseId: string, date: string, minutes: number): Session {
  n += 1;
  return {
    id: `s${n}`,
    courseId,
    taskId: null,
    date,
    durationSeconds: minutes * 60,
    note: '',
    createdAt: `${date}T12:00:00.000Z`,
  };
}

function read(sessions: Session[], dailyGoalHours = 3) {
  return readAchievements({
    sessions,
    courses: [MATH, PHYS],
    dailyGoalHours,
    today: THU,
    termKey: 'fall',
    ladders: [],
  });
}

beforeEach(() => store.clear());

test('the day, a course’s week, the whole week and the hours are each read off the sessions', () => {
  const early = read([sat('math', '2026-09-15', 60)]);
  assert.deepEqual(
    early.map((c) => c.key),
    ['hours:fall:1'],
  );

  const later = read([
    sat('math', '2026-09-15', 60),
    sat('math', THU, 90),
    sat('phys', THU, 120),
  ]);
  const keys = later.map((c) => c.key);
  assert.ok(keys.includes(`day:${THU}`), 'three and a half hours today meets a three hour day');
  assert.ok(keys.includes('course-week:math:2026-09-14'), 'MATH has its two hours');
  assert.ok(!keys.includes('course-week:phys:2026-09-14'), 'PHYS is an hour short');
  assert.ok(!keys.includes('week:2026-09-14'), 'four and a half of five is not the week');
  assert.ok(keys.includes('hours:fall:1'));
});

test('a session last week counts toward the term, not this week', () => {
  const keys = read([sat('math', '2026-09-10', 180)]).map((c) => c.key);
  assert.ok(!keys.includes('course-week:math:2026-09-14'));
  assert.ok(keys.includes('hours:fall:1'));
});

test('the week leads when one sitting crosses several', () => {
  const list = rankCelebrations(
    read([sat('math', THU, 120), sat('phys', THU, 180)]),
  );
  assert.equal(list[0].kind, 'week');
  assert.equal(list[list.length - 1].kind, 'day');
});

test('a first visit takes everything already true as seen', () => {
  const sessions = [sat('math', THU, 200)];
  const fresh = takeNewCelebrations(read(sessions), recordFingerprint(sessions, []));
  assert.deepEqual(fresh, []);
});

test('a crossing is celebrated once, and only the highest line of the hours', () => {
  // A half-hour day goal, met, so there is a baseline to read against.
  const before = [sat('math', THU, 30)];
  takeNewCelebrations(read(before, 0.5), recordFingerprint(before, []));

  // A long sitting that passes the first hour and the fifth at once.
  const after = [...before, sat('phys', THU, 300)];
  const fresh = takeNewCelebrations(read(after, 0.5), recordFingerprint(after, []));
  const keys = fresh.map((c) => c.key);
  assert.ok(keys.includes('hours:fall:5'));
  assert.ok(!keys.includes('hours:fall:1'), 'the fifth hour says the first as well');
  assert.ok(keys.includes('course-week:phys:2026-09-14'));
  assert.ok(!keys.includes(`day:${THU}`), 'the day was already in');

  assert.deepEqual(takeNewCelebrations(read(after, 0.5), recordFingerprint(after, [])), []);
});

test('lowering a goal under the hours already done is noted, not celebrated', () => {
  const sessions = [sat('math', THU, 30), sat('math', THU, 60)];
  takeNewCelebrations(read(sessions, 3), recordFingerprint(sessions, []));
  const fresh = takeNewCelebrations(read(sessions, 1), recordFingerprint(sessions, []));
  assert.deepEqual(fresh, []);

  // And it stays noted: the next sitting does not bring it up after all.
  const more = [...sessions, sat('phys', THU, 10)];
  const next = takeNewCelebrations(read(more, 1), recordFingerprint(more, []));
  assert.ok(!next.some((c) => c.kind === 'day'));
});

test('an empty record is no baseline, so the term does not arrive as new', () => {
  assert.deepEqual(takeNewCelebrations(read([]), recordFingerprint([], [])), []);
  const loaded = [sat('math', THU, 200), sat('phys', THU, 200)];
  assert.deepEqual(takeNewCelebrations(read(loaded), recordFingerprint(loaded, [])), []);
});

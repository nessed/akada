import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, Task } from '../data/types';
import { liveSession, withLiveSession } from '../live-session';
import { readSittingEffect } from './effect';
import { readProgression } from './index';

/**
 * The live reading, checked at the seams: the distance on the line moves
 * with the clock, the sitting's effect names what landed, and the week
 * candidate speaks on the day that would make the week count.
 */

const MATH: Course = {
  id: 'math',
  code: 'MATH',
  name: 'Calculus',
  color: '#A8B89B',
  weeklyGoalHours: 6,
  createdAt: '2026-09-01T00:00:00.000Z',
};
const PHYS: Course = { ...MATH, id: 'phys', code: 'PHYS', name: 'Physics' };

// A Monday, so the whole week is ahead of "today" when today is Thursday.
const MON = '2026-09-14';
const TUE = '2026-09-15';
const WED = '2026-09-16';
const THU = '2026-09-17';

let n = 0;
function logged(courseId: string, date: string, minutes: number): Session {
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

function readings(
  courses: Course[],
  sessions: Session[],
  tasks: Task[],
  live: { courseId: string; date: string; minutes: number } | null,
  today: string,
) {
  const before = readProgression(courses, sessions, tasks, today);
  const row = live
    ? liveSession({ ...live, taskId: null, focusSeconds: live.minutes * 60, key: 'k' })
    : null;
  const after = readProgression(courses, withLiveSession(sessions, row), tasks, today);
  return { before, after, row };
}

test('the first mark on a new course is named, and the distance moves with the clock', () => {
  const still = readings([MATH], [], [], null, THU);
  assert.equal(still.before.nextMark.shown?.line, '15 minutes to the first mark on MATH');

  const tenIn = readings([MATH], [], [], { courseId: 'math', date: THU, minutes: 10 }, THU);
  assert.equal(tenIn.after.nextMark.shown?.line, '5 minutes to the first mark on MATH');
});

test('a sitting that crosses a mark says so and names the next one', () => {
  const { before, after } = readings(
    [MATH],
    [logged('math', MON, 60)],
    [],
    { courseId: 'math', date: THU, minutes: 40 },
    THU,
  );
  const effect = readSittingEffect(before, after, [MATH], 'math', THU);
  assert.deepEqual(effect.lines.slice(0, 2), ['a mark inked on MATH', 'today counts']);
  assert.equal(effect.marks, 1);
  assert.equal(effect.tally.fresh, 1);
  // Marks land at 15, 55, 95 and 135 credited minutes. 60 before, 100 after:
  // the third mark landed and the fourth is 35 away.
  assert.equal(effect.next?.line, '35 minutes to the next mark on MATH');
});

test('the day that would make the week count is named as the week, not the day', () => {
  // Two courses, both touched, two days in: a third day counts the week by
  // the breadth route. The nearest mark on either course is 25 minutes off,
  // so the week's 20 wins the tie at the top of the ranking.
  const sessions = [logged('math', MON, 30), logged('phys', TUE, 30)];
  const { before } = readings([MATH, PHYS], sessions, [], null, THU);
  assert.equal(before.nextMark.shown?.line, '20 minutes makes this week count');
  assert.equal(before.nextMark.shown?.kind, 'week-counts');

  const { before: b, after: a } = readings(
    [MATH, PHYS],
    sessions,
    [],
    { courseId: 'phys', date: THU, minutes: 20 },
    THU,
  );
  const effect = readSittingEffect(b, a, [MATH, PHYS], 'phys', THU);
  assert.equal(effect.lines[0], 'this week counts');
  // The week said it; the day does not repeat it.
  assert.ok(!effect.lines.includes('today counts'));
});

test('a week joining a run says how long the run is', () => {
  const lastWeek = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'].map((d) =>
    logged('math', d, 30),
  );
  // One course, two days in: the third day counts the week. 180 credited
  // minutes puts the next mark 35 away, so the week's 20 speaks first.
  const thisWeek = [logged('math', MON, 30), logged('math', TUE, 30)];
  const { before, after } = readings(
    [MATH],
    [...lastWeek, ...thisWeek],
    [],
    { courseId: 'math', date: THU, minutes: 25 },
    THU,
  );
  assert.equal(before.nextMark.shown?.line, '20 minutes makes it 2 weeks running');
  const effect = readSittingEffect(before, after, [MATH], 'math', THU);
  assert.equal(effect.lines[0], 'this week joins the run · 2 weeks');
});

test('nothing is read from a sitting too short to log', () => {
  assert.equal(
    liveSession({ courseId: 'math', taskId: null, date: THU, focusSeconds: 0, key: 'k' }),
    null,
  );
});

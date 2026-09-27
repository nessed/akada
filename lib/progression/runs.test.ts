import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, Task } from '../data/types';
import { readCredit } from './credit';
import { qualifies } from './runs';

const MATH: Course = {
  id: 'math', code: 'MATH', name: 'Calculus', color: '#A8B89B', weeklyGoalHours: 6,
  createdAt: '2026-09-01T00:00:00.000Z',
};
const DAY = '2026-09-10';

function done(id: string, patch: Partial<Task> = {}): Task {
  return {
    id, courseId: 'math', title: id, dueDate: null, priority: 'normal',
    completed: true, completedAt: `${DAY}T15:00:00.000Z`, createdAt: '2026-09-01T00:00:00.000Z',
    ...patch,
  };
}

function sat(minutes: number, taskId: string | null = null): Session {
  return {
    id: `s-${taskId}-${minutes}`, courseId: 'math', taskId, date: DAY, durationSeconds: minutes * 60,
    note: '', createdAt: `${DAY}T16:00:00.000Z`,
  };
}

const dayOf = (sessions: Session[], tasks: Task[]) =>
  readCredit([MATH], sessions, tasks).find((d) => d.iso === DAY);

test('a tick never counts a day on its own', () => {
  assert.equal(qualifies(dayOf([], [done('buy the textbook'), done('email the TA')])), false);
});

test('twenty minutes logged counts a day, timer or by hand', () => {
  assert.equal(qualifies(dayOf([sat(20)], [])), true);
  assert.equal(qualifies(dayOf([sat(15)], [])), false);
});

test('pages count only as far as time on that reading stands behind them', () => {
  // 40 pages typed, 1 minute logged on it: 5 pages of time behind them.
  const thin = dayOf([sat(1, 'r')], [done('r', { kind: 'reading', pages: 40 })]);
  assert.equal(thin?.creditedPages, 5);
  assert.equal(qualifies(thin), false);
  // 12 pages with 5 minutes on them: all 12 stand, and the day counts.
  const read = dayOf([sat(5, 'r')], [done('r', { kind: 'reading', pages: 12 })]);
  assert.equal(read?.creditedPages, 12);
  assert.equal(qualifies(read), true);
  // Pages on a tick with no time behind them credit nothing at all.
  assert.equal(dayOf([], [done('r', { kind: 'reading', pages: 300 })])?.creditedPages, 0);
});

test('a skipped task contributes nothing', () => {
  const entry = dayOf([sat(5, 'r')], [done('r', { kind: 'reading', pages: 12, completedVia: 'skip' })]);
  assert.equal(entry?.creditedPages, 0);
  assert.equal(entry?.pages, 0);
  assert.equal(entry?.ticksByCourse.get('math') ?? 0, 0);
});

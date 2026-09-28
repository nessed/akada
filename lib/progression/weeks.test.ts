import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, Task } from '../data/types';
import { readProgression } from './index';
import { readWeekLedger } from './weeks';

const MATH: Course = {
  id: 'math', code: 'MATH', name: 'Calculus', color: '#A8B89B', weeklyGoalHours: 6,
  createdAt: '2026-08-01T00:00:00.000Z',
};
const TODAY = '2026-09-23';

function sat(id: string, date: string, minutes: number): Session {
  return {
    id, courseId: 'math', taskId: null, date, durationSeconds: minutes * 60, note: '',
    createdAt: `${date}T12:00:00.000Z`,
  };
}

test("a week's tallies add up to the marks on the course page", () => {
  const sessions = [
    sat('a', '2026-09-08', 90),
    sat('b', '2026-09-10', 120),
    sat('c', '2026-09-16', 180),
    sat('d', TODAY, 45),
  ];
  const tasks: Task[] = [{
    id: 't', courseId: 'math', title: 't', dueDate: null, priority: 'normal', completed: true,
    completedAt: `${TODAY}T10:00:00.000Z`, createdAt: '2026-09-01T00:00:00.000Z',
  }];
  const p = readProgression([MATH], sessions, tasks, TODAY);
  const weeks = readWeekLedger(p.ledger, p.runs.weeks, tasks);
  assert.equal(weeks.length, 3);
  assert.equal(weeks[0].start, '2026-09-07');
  assert.equal(weeks[0].seconds, 210 * 60);
  assert.equal(weeks[0].bestDay?.iso, '2026-09-10');
  assert.equal(weeks.reduce((a, w) => a + w.marks, 0), p.pages.get('math')!.marks);
  assert.equal(weeks[2].tasksDone, 1);
  assert.ok(weeks[2].run.inProgress);
});

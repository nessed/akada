import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, Task } from '../data/types';
import { readLadders } from './impressions';
import type { RunReading } from './runs';

const MATH: Course = {
  id: 'math', code: 'MATH', name: 'Calculus', color: '#A8B89B', weeklyGoalHours: 6,
  createdAt: '2026-09-01T00:00:00.000Z',
};
const RUNS: RunReading = { weeks: [], current: 0, best: 0, grace: 0, thisWeek: null };

function early(id: string, patch: Partial<Task> = {}): Task {
  return {
    id, courseId: 'math', title: id, dueDate: '2026-09-20', priority: 'normal',
    completed: true, completedAt: '2026-09-10T10:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z',
    ...patch,
  };
}

function on(taskId: string): Session {
  return {
    id: `s-${taskId}`, courseId: 'math', taskId, date: '2026-09-10', durationSeconds: 1800,
    note: '', createdAt: '2026-09-10T11:00:00.000Z',
  };
}

test('Finished early counts only work that was worked, and never a skip', () => {
  const tasks = [early('worked'), early('ticked'), early('skipped', { completedVia: 'skip' })];
  const ladders = readLadders([MATH], [on('worked'), on('skipped')], tasks, [], new Map(), RUNS);
  assert.equal(ladders.find((l) => l.id === 'early')?.value, 1);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Task } from './types';
import { compareTaskOrder } from './task-order';

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  courseId: 'c',
  title: id,
  dueDate: null,
  priority: 'normal',
  completed: false,
  completedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...patch,
});

test('an unarranged list reads in what matters: high first, then soonest due, undated last', () => {
  const list = [
    task('undated'),
    task('late', { dueDate: '2026-10-20' }),
    task('high', { priority: 'high', dueDate: '2026-11-01' }),
    task('soon', { dueDate: '2026-10-01' }),
  ];
  assert.deepEqual([...list].sort(compareTaskOrder).map((t) => t.id), ['high', 'soon', 'late', 'undated']);
});

test('placed tasks read in their order, and anything added since lands after them', () => {
  const list = [
    task('new-high', { priority: 'high', dueDate: '2026-09-30' }),
    task('second', { position: 1 }),
    task('first', { position: 0, dueDate: '2026-12-01' }),
  ];
  assert.deepEqual([...list].sort(compareTaskOrder).map((t) => t.id), ['first', 'second', 'new-high']);
});

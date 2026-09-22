import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session, Task } from './data';
import { pickUpNext } from './derive';
import { isoDate } from './utils';

/** A calendar date `n` days from today, the way a due date is written. */
function day(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    courseId: 'course-a',
    title: id,
    dueDate: null,
    priority: 'normal',
    completed: false,
    completedAt: null,
    createdAt: `${day(-20)}T09:00:00.000Z`,
    ...patch,
  };
}

function session(courseId: string, daysAgo: number): Session {
  return {
    id: `${courseId}-${daysAgo}`,
    courseId,
    taskId: null,
    date: day(-daysAgo),
    durationSeconds: 1800,
    note: '',
    createdAt: `${day(-daysAgo)}T12:00:00.000Z`,
  };
}

const SORTS = ['in-progress', 'last-done', 'overdue'] as const;

test('overdue work still comes first, whatever else is open', () => {
  const late = task('late', { dueDate: day(-2) });
  const soon = task('soon', { dueDate: day(1) });
  for (const sort of SORTS) {
    assert.equal(pickUpNext(sort, [late], [], [], [late, soon])?.id, 'late', sort);
  }
});

test('with nothing due today, the soonest task due this week is next', () => {
  const later = task('later', { dueDate: day(5) });
  const tomorrow = task('tomorrow', { dueDate: day(1) });
  for (const sort of SORTS) {
    assert.equal(pickUpNext(sort, [], [], [], [later, tomorrow])?.id, 'tomorrow', sort);
  }
});

test('with nothing dated this week, high priority open-ended work comes up, quietest course first', () => {
  const busy = task('busy course', { courseId: 'course-a', priority: 'high' });
  const quiet = task('quiet course', { courseId: 'course-b', priority: 'high' });
  // Two days back, outside the window where "carry on" would keep the reader
  // in the course they were just working on, which is its own rule.
  const sessions = [session('course-a', 2), session('course-b', 6)];
  for (const sort of SORTS) {
    assert.equal(pickUpNext(sort, [], [], sessions, [busy, quiet])?.id, 'quiet course', sort);
  }
});

test('carry on still means the course just worked, open-ended work included', () => {
  const busy = task('busy course', { courseId: 'course-a', priority: 'high' });
  const quiet = task('quiet course', { courseId: 'course-b', priority: 'high' });
  const sessions = [session('course-a', 0), session('course-b', 6)];
  assert.equal(pickUpNext('in-progress', [], [], sessions, [busy, quiet])?.id, 'busy course');
  assert.equal(pickUpNext('last-done', [], [], sessions, [busy, quiet])?.id, 'quiet course');
});

test('a course never studied counts as the quietest of all', () => {
  const studied = task('studied', { courseId: 'course-a', priority: 'high' });
  const never = task('never', { courseId: 'course-c', priority: 'high' });
  assert.equal(
    pickUpNext('last-done', [], [], [session('course-a', 3)], [studied, never])?.id,
    'never',
  );
});

test('an open-ended task of normal priority is a note to self, not the next thing', () => {
  const note = task('note to self');
  const far = task('next month', { dueDate: day(30), priority: 'high' });
  for (const sort of SORTS) {
    assert.equal(pickUpNext(sort, [], [], [], [note, far]), null, sort);
  }
});

test('finished work is never handed back', () => {
  const done = task('done', { dueDate: day(1), completed: true, completedAt: new Date().toISOString() });
  assert.equal(pickUpNext('last-done', [], [], [], [done]), null);
});

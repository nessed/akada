import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Quiz, SessionSegment, StudyNote, Task } from './data';
import { sittingSuggestions, sittingWindow } from './session-suggestions';

const segments: SessionSegment[] = [
  { kind: 'focus', ordinal: 1, startedAt: '2026-09-26T10:00:00.000Z', seconds: 1500, targetSeconds: 1500 },
  { kind: 'break', ordinal: 2, startedAt: '2026-09-26T10:25:00.000Z', seconds: 300, targetSeconds: 300 },
  { kind: 'focus', ordinal: 3, startedAt: '2026-09-26T10:30:00.000Z', seconds: 1800, targetSeconds: 1500 },
];

const quiz = (over: Partial<Quiz>): Quiz => ({
  id: 'q1',
  courseId: 'c1',
  taskId: null,
  noteId: null,
  title: 'Chapter 3',
  context: '',
  questions: [],
  attempts: [],
  timerMinutes: null,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
  ...over,
});

test('the sitting runs from its first stretch to the end of its last', () => {
  assert.deepEqual(sittingWindow(segments), {
    start: Date.parse('2026-09-26T10:00:00.000Z'),
    end: Date.parse('2026-09-26T11:00:00.000Z'),
  });
  assert.equal(sittingWindow([]), null);
});

test('a quiz handed in during the sitting is offered with its mark', () => {
  const window = sittingWindow(segments);
  const lines = sittingSuggestions({
    window,
    courseId: 'c1',
    quizzes: [
      quiz({ attempts: [{ at: '2026-09-26T10:40:00.000Z', picks: [], score: 7, total: 10 }] }),
      quiz({ id: 'q2', title: 'Old', attempts: [{ at: '2026-09-25T10:40:00.000Z', picks: [], score: 1, total: 2 }] }),
      quiz({ id: 'q3', courseId: 'other', title: 'Elsewhere', attempts: [{ at: '2026-09-26T10:40:00.000Z', picks: [], score: 1, total: 2 }] }),
      quiz({ id: 'q4', title: 'Half done' }),
    ],
    startedQuizIds: new Set(['q4']),
  });
  assert.deepEqual(lines, ['Did the Chapter 3 quiz, 7/10', 'Started the Half done quiz']);
});

test('notes read and tasks finished in the sitting are offered, and the task it was against', () => {
  const window = sittingWindow(segments);
  const note: StudyNote = {
    id: 'n1',
    courseId: 'c1',
    title: 'Enzymes',
    markdown: '',
    checks: {},
    source: 'app',
    taskId: null,
    reads: [{ seconds: 600, words: 900, at: '2026-09-26T10:15:00.000Z' }],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
  const done: Task = {
    id: 't1',
    courseId: 'c1',
    title: 'Problem set 2',
    dueDate: null,
    priority: 'normal',
    completed: true,
    completedAt: '2026-09-26T11:01:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
  };
  const against: Task = { ...done, id: 't2', title: 'Reading 4', completed: false, completedAt: null };
  assert.deepEqual(
    sittingSuggestions({ window, courseId: 'c1', task: against, notes: [note], tasks: [done] }),
    ['Read through Enzymes', 'Finished Problem set 2', 'Worked on Reading 4'],
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Assessment, Session, Task } from './data';
import { gradeProjection, gradeStanding, isSkipped, medianPace, readingPairs, readingRateDetail, workedTaskIds } from './derive';
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

function piece(id: string, weight: number, score: number | null, outOf = 100, group?: string): Assessment {
  return { id, label: id, weight, score, outOf, ...(group ? { group } : {}) };
}

test('a target already banked needs nothing more', () => {
  const p = gradeProjection({ assessments: [piece('mid', 60, 100), piece('fin', 40, null)] }, { target: 55 });
  assert.equal(p.target?.status, 'secured');
  assert.equal(p.floor, 60);
  assert.equal(p.ceiling, 100);
});

test('with everything marked the target is simply met or missed', () => {
  const p = gradeProjection({ assessments: [piece('mid', 50, 70), piece('fin', 50, 70)] }, { target: 80 });
  assert.equal(p.target?.neededAverage, null);
  assert.equal(p.target?.status, 'out_of_reach');
});

test('a drop rule trims an outstanding piece before anything is solved', () => {
  const quizzes = [piece('q1', 10, 90, 100, 'q'), piece('q2', 10, null, 100, 'q'), piece('q3', 10, null, 100, 'q')];
  const p = gradeProjection(
    { assessments: [...quizzes, piece('fin', 70, null)], grading: { dropRules: [{ group: 'q', keep: 2 }] } },
    { target: 90 },
  );
  // Best 2 of 3 counts 20, so the course totals 90 and one quiz slot is open.
  assert.equal(p.standing.total, 90);
  assert.equal(p.outstanding.length, 2);
  // 9 banked from the quiz at 90, plus the 80 still open, out of 90.
  assert.equal(Math.round((p.ceiling ?? 0) * 10) / 10, 98.9);
});

test('a group always loses exactly size minus keep, whichever pieces are back', () => {
  const papers = (scores: (number | null)[]) =>
    scores.map((score, i) => piece(`p${i + 1}`, 6, score, 12, 'rp'));
  const course = (scores: (number | null)[]) => ({
    assessments: [...papers(scores), piece('rest', 70, null)],
    grading: { dropRules: [{ group: 'rp', keep: 5 }] },
  });
  // Best 5 of 7 at 6 each is 30, so the course is 100 at every point in term.
  // The last two back while the first five are not: both marks stay.
  const late = gradeStanding(course([null, null, null, null, null, 9, 9]));
  assert.equal(late.total, 100);
  assert.deepEqual(late.dropped, ['p1', 'p2']);
  // Six of seven back: the worst mark goes, and so does the one still out.
  const six = gradeStanding(course([2, 10, 10, 10, 10, 10, null]));
  assert.equal(six.total, 100);
  assert.deepEqual(six.dropped.sort(), ['p1', 'p7']);
  assert.equal(six.percent, 83);
});

test('the reading rate says when it is only the default', () => {
  assert.deepEqual(readingRateDetail([], []), { pagesPerHour: 20, measured: false, pagesRead: 0, hoursRead: 0, readings: 0 });
});

const reading = (id: string, pages: number, patch: Partial<Task> = {}): Task =>
  task(id, { kind: 'reading', pages, completed: true, completedAt: `${day(-1)}T10:00:00.000Z`, ...patch });
const on = (taskId: string, seconds: number) => ({ taskId, durationSeconds: seconds });

test('one timed reading is not a pace; three are', () => {
  const one = readingRateDetail([reading('a', 50)], [on('a', 7200)]);
  assert.equal(one.measured, false);
  assert.equal(one.pagesPerHour, 20);
  const three = readingRateDetail(
    [reading('a', 50), reading('b', 30), reading('c', 40)],
    [on('a', 7200), on('b', 3600), on('c', 3600)],
  );
  assert.equal(three.measured, true);
  // 25, 30 and 40 pages an hour: the median, not the pooled 120 over 4h.
  assert.equal(three.pagesPerHour, 30);
});

test('pages ticked without time on them never feed the pace', () => {
  const pairs = readingPairs(
    [reading('timed', 30), reading('ticked', 400), reading('skipped', 30, { completedVia: 'skip' })],
    [on('timed', 3600), on('skipped', 3600), on('elsewhere', 3600)],
  );
  assert.deepEqual(pairs.map((p) => p.taskId), ['timed']);
});

test('a reading timed on its note counts when no session names it', () => {
  const pairs = readingPairs([reading('noted', 20)], [], [{ taskId: 'noted', reads: [{ seconds: 1800 }] }]);
  assert.equal(pairs[0]?.pagesPerHour, 40);
});

test('each reading is held between 2 and 120 pages an hour', () => {
  const pairs = readingPairs([reading('skim', 200), reading('slow', 1)], [on('skim', 300), on('slow', 36000)]);
  assert.deepEqual(pairs.map((p) => p.pagesPerHour), [120, 2]);
  assert.equal(medianPace([]), null);
  // One 200-page skim beside two honest readings does not move the median off them.
  assert.equal(medianPace([{ pagesPerHour: 120 }, { pagesPerHour: 25 }, { pagesPerHour: 30 }]), 30);
});

test('a finished task is worked only when time was logged against it', () => {
  const ticked = task('ticked', { completed: true, completedAt: `${day(-1)}T10:00:00.000Z` });
  const timed = task('timed', { completed: true, completedAt: `${day(-1)}T10:00:00.000Z` });
  const read = task('read', { completed: true, completedAt: `${day(-1)}T10:00:00.000Z` });
  const open = task('open');
  const sessions = [
    { ...session('course-a', 1), taskId: 'timed' },
    { ...session('course-a', 1), taskId: 'open' },
  ];
  const notes = [{ taskId: 'read', reads: [{ seconds: 600, words: 2000, at: day(-1) }] }];
  const worked = workedTaskIds([ticked, timed, read, open], sessions, notes);
  assert.deepEqual([...worked].sort(), ['read', 'timed']);
});

test('a note with no kept read-through does not make its task worked', () => {
  const done = task('done', { completed: true });
  assert.equal(workedTaskIds([done], [], [{ taskId: 'done', reads: [] }]).size, 0);
});

test('a session of no length is not time logged', () => {
  const done = task('done', { completed: true });
  const empty = { ...session('course-a', 1), taskId: 'done', durationSeconds: 0 };
  assert.equal(workedTaskIds([done], [empty]).size, 0);
});

test('a skipped task is never worked, whatever time went on it', () => {
  const skipped = task('skipped', { completed: true, completedVia: 'skip' });
  assert.equal(isSkipped(skipped), true);
  assert.equal(isSkipped({ ...skipped, completed: false }), false);
  const sessions = [{ ...session('course-a', 1), taskId: 'skipped' }];
  assert.equal(workedTaskIds([skipped], sessions).size, 0);
});

test('finished through the log sheet and timed is worked like any other', () => {
  const done = task('done', { completed: true, completedVia: 'session' });
  const sessions = [{ ...session('course-a', 1), taskId: 'done' }];
  assert.deepEqual([...workedTaskIds([done], sessions)], ['done']);
});

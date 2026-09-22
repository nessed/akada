import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, RecallRecord, Task } from '../data';
import {
  applyVerdict,
  looksLikeReading,
  readingPrompt,
  readRecall,
  RECALL_PER_COURSE_PER_DAY,
  RECALL_PER_DAY,
  scheduleRecall,
} from './index';

const TODAY = '2026-09-22';

function day(offset: number, from = TODAY): string {
  const d = new Date(from + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function course(id: string): Course {
  return { id, code: id.toUpperCase(), name: id, color: '#A8B89B', weeklyGoalHours: 6, createdAt: '' };
}

function task(id: string, title: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    courseId: 'pol',
    title,
    dueDate: null,
    priority: 'normal',
    completed: true,
    completedAt: `${day(-6)}T15:00:00`,
    createdAt: `${day(-14)}T09:00:00`,
    ...patch,
  };
}

function record(key: string, patch: Partial<RecallRecord> = {}): RecallRecord {
  return {
    id: `row-${key}`,
    key,
    courseId: 'pol',
    prompt: key,
    source: 'own',
    ref: null,
    history: [],
    letGo: false,
    createdAt: `${day(-3)}T10:00:00`,
    ...patch,
  };
}

/* ── Readings ─────────────────────────────────────────────────────────── */

test('the ways a reading announces itself on a real list are recognised', () => {
  for (const title of [
    'Read Machiavelli, The Prince, Ch 15 and 18 — Session 7',
    'Read: de Carvalho, Leira, Hobson (2011) - The Myths That Your Teachers Still Tell You about 1648 and 1919',
    'Mearsheimer (2011), Imperial by Design — done with Claude',
    'Todaro & Smith Ch. 1 — Introducing Economic Development',
    'read the textbook ch 1',
  ]) {
    assert.ok(looksLikeReading({ title, kind: 'task' }), title);
  }
  for (const title of [
    'Problem Set 2',
    'Get notes from classmate for both missed classes',
    'Watch Strategic Communication Part 1 lecture + make notes, bring to class',
    'HBS 1.4 Functional Models — do all example questions',
  ]) {
    assert.ok(!looksLikeReading({ title, kind: 'task' }), title);
  }
  assert.ok(looksLikeReading({ title: 'Anything at all', kind: 'reading' }));
  assert.ok(!looksLikeReading({ title: 'Midterm (2026)', kind: 'exam' }));
});

test('a reading is asked about by what it is, without the bookkeeping in its title', () => {
  assert.equal(readingPrompt('Read: Buzan and Lawson (2013)'), 'Buzan and Lawson (2013)');
  assert.equal(
    readingPrompt('Hobson (2012), Eurocentric Conception of World Politics Ch 2 — done with Claude'),
    'Hobson (2012), Eurocentric Conception of World Politics Ch 2',
  );
  assert.equal(readingPrompt('Read'), 'Read');
});

/* ── The schedule ─────────────────────────────────────────────────────── */

test('the gaps widen with each clear and close again when it slips', () => {
  const origin = day(-10);
  assert.equal(scheduleRecall([], origin).dueOn, day(-9), 'first asked the day after');
  const once = [{ on: TODAY, verdict: 'clear' as const }];
  assert.equal(scheduleRecall(once, origin).dueOn, day(3));
  const twice = [{ on: day(-3), verdict: 'clear' as const }, { on: TODAY, verdict: 'clear' as const }];
  assert.equal(scheduleRecall(twice, origin).dueOn, day(7));
  const slipped = [...twice.slice(0, 1), { on: TODAY, verdict: 'gone' as const }];
  assert.equal(scheduleRecall(slipped, origin).dueOn, day(1));
  const hazy = [...twice, { on: day(7), verdict: 'hazy' as const }];
  assert.equal(scheduleRecall(hazy, origin).dueOn, day(10), 'hazy steps one gap back in');
  const many = Array.from({ length: 9 }, (_, i) => ({ on: day(i - 9), verdict: 'clear' as const }));
  assert.equal(scheduleRecall(many, origin).dueOn, day(34), 'the widest gap is five weeks');
});

test('a near exam pulls the next asking in to the day before it, never onto a day answered', () => {
  const settled = Array.from({ length: 4 }, (_, i) => ({ on: day(i - 4), verdict: 'clear' as const }));
  // Ordinarily sixteen days out; an exam in six days pulls it to five.
  assert.equal(scheduleRecall(settled, day(-30), day(6)).dueOn, day(5));
  const answeredToday = [{ on: TODAY, verdict: 'clear' as const }];
  assert.equal(scheduleRecall(answeredToday, day(-30), day(1)).dueOn, day(1));
});

test('a second answer on the same day replaces the first', () => {
  const first = applyVerdict([], 'gone', TODAY);
  const changed = applyVerdict(first, 'hazy', TODAY);
  assert.deepEqual(changed, [{ on: TODAY, verdict: 'hazy' }]);
});

/* ── Reading the whole thing ──────────────────────────────────────────── */

test('finished readings arrive in recall on their own, and open ones do not', () => {
  const reading = readRecall({
    courses: [course('pol')],
    tasks: [
      task('a', 'Read Angell (1912), The Influence of Credit Upon International Relations'),
      task('b', 'Read Thucydides, Book V Ch 84-116', { completed: false, completedAt: null }),
      task('c', 'Get notes from classmate'),
    ],
    records: [],
    today: TODAY,
  });
  assert.deepEqual(reading.states.map((s) => s.key), ['task:a']);
  assert.equal(reading.states[0].standing, 'new');
  assert.equal(reading.states[0].due, true);
  assert.equal(reading.states[0].prompt, 'Angell (1912), The Influence of Credit Upon International Relations');
});

test('the same reading written down twice is one thing to remember', () => {
  const reading = readRecall({
    courses: [course('pol')],
    tasks: [
      task('syllabus', 'Read: de Carvalho, Leira, Hobson (2011) - The Myths That Your Teachers Still Tell You', {
        completedAt: `${day(-2)}T10:00:00`,
      }),
      task('done', 'de Carvalho, Leira, Hobson (2011) — done with Claude', {
        completedAt: `${day(-8)}T10:00:00`,
      }),
    ],
    records: [],
    today: TODAY,
  });
  assert.deepEqual(reading.states.map((s) => s.key), ['task:done'], 'the one finished first');
});

test('answers are read from the stored row, and a let go reading stays out', () => {
  const reading = readRecall({
    courses: [course('pol')],
    tasks: [task('a', 'Read Angell (1912)'), task('b', 'Read Slaughter (2009)')],
    records: [
      record('task:a', { source: 'reading', ref: 'a', history: [{ on: day(-1), verdict: 'clear' }] }),
      record('task:b', { source: 'reading', ref: 'b', letGo: true }),
    ],
    today: TODAY,
  });
  assert.deepEqual(reading.states.map((s) => s.key), ['task:a']);
  assert.equal(reading.states[0].standing, 'clear');
  assert.equal(reading.states[0].dueOn, day(2));
  assert.equal(reading.states[0].due, false);
});

test('a reading put back on the list is not asked about while it is being read again', () => {
  const reading = readRecall({
    courses: [course('pol')],
    tasks: [task('a', 'Read Angell (1912)', { completed: false, completedAt: null })],
    records: [record('task:a', { source: 'reading', ref: 'a', history: [{ on: day(-5), verdict: 'gone' }] })],
    today: TODAY,
  });
  assert.equal(reading.states.length, 0);
});

test('a kept step reads as the step is now written, ticked or not', () => {
  const concepts = task('limits', 'Limits concepts', {
    courseId: 'math',
    completed: false,
    completedAt: null,
    subtasks: [{ id: 's-1', title: '0/0 with a root — conjugate', completed: false }],
  });
  const reading = readRecall({
    courses: [course('math')],
    tasks: [concepts],
    records: [
      record('step:limits:s-1', {
        courseId: 'math',
        source: 'step',
        ref: 'limits:s-1',
        prompt: 'an older wording',
        history: [{ on: day(-1), verdict: 'gone' }],
      }),
    ],
    today: TODAY,
  });
  assert.equal(reading.states.length, 1);
  assert.equal(reading.states[0].prompt, '0/0 with a root — conjugate');
  assert.equal(reading.states[0].subtaskId, 's-1');
  assert.equal(reading.states[0].due, true);
});

test('the day asks for a few, spread across courses, slipped ones first', () => {
  const polReadings = Array.from({ length: 8 }, (_, i) => task(`p${i}`, `Read Author${i} (2011)`));
  const mathStep = record('own:m1', {
    courseId: 'math',
    history: [{ on: day(-2), verdict: 'gone' }],
  });
  const reading = readRecall({
    courses: [course('pol'), course('math')],
    tasks: polReadings,
    records: [mathStep],
    today: TODAY,
  });
  assert.equal(reading.queue.length, RECALL_PER_DAY);
  assert.equal(reading.queue[0].key, 'own:m1', 'what slipped comes first');
  const fromPol = reading.queue.filter((s) => s.courseId === 'pol').length;
  // Three from POL within the per-course share, then POL again only because
  // MATH has nothing else due.
  assert.equal(fromPol, RECALL_PER_DAY - 1);
  assert.ok(RECALL_PER_COURSE_PER_DAY < fromPol);
  assert.equal(reading.byCourse.get('pol')?.due, 8);
});

test('answers given today are counted against the day', () => {
  const readings = Array.from({ length: 8 }, (_, i) => task(`p${i}`, `Read Author${i} (2011)`));
  const answered = readings.slice(0, 3).map((t) =>
    record(`task:${t.id}`, { source: 'reading', ref: t.id, history: [{ on: TODAY, verdict: 'clear' }] }),
  );
  const reading = readRecall({ courses: [course('pol')], tasks: readings, records: answered, today: TODAY });
  assert.equal(reading.answeredToday, 3);
  assert.equal(reading.queue.length, RECALL_PER_DAY - 3);
});

test('an exam close in a course lifts that course in the asking', () => {
  const pol = task('p', 'Read Angell (1912)');
  const econ = task('e', 'Todaro & Smith Ch. 2', { courseId: 'econ' });
  const midterm: Task = {
    ...task('mid', 'Midterm I', { courseId: 'econ', kind: 'exam', completed: false, completedAt: null }),
    dueDate: day(9),
  };
  const reading = readRecall({
    courses: [course('pol'), course('econ')],
    tasks: [pol, econ, midterm],
    records: [],
    today: TODAY,
  });
  assert.equal(reading.queue[0].courseId, 'econ');
  assert.equal(reading.queue[0].examDays, 9);
});

test('a thing is settled only after clear recalls on separate days running', () => {
  const clearOn = (...offsets: number[]) =>
    offsets.map((n) => ({ on: day(n), verdict: 'clear' as const }));
  const tasks = [task('a', 'Read A (2001)'), task('b', 'Read B (2002)'), task('c', 'Read C (2003)')];
  const reading = readRecall({
    courses: [course('pol')],
    tasks,
    records: [
      record('task:a', { source: 'reading', ref: 'a', history: clearOn(-12, -9, -2) }),
      record('task:b', { source: 'reading', ref: 'b', history: clearOn(-2) }),
      record('task:c', {
        source: 'reading',
        ref: 'c',
        history: [...clearOn(-12, -9), { on: day(-5), verdict: 'hazy' }, ...clearOn(-2)],
      }),
    ],
    today: TODAY,
  });
  const pol = reading.byCourse.get('pol')!;
  assert.equal(pol.settled, 1, 'three clears running');
  assert.equal(pol.clear, 2, 'one clear, and a run broken by a hazy');
  assert.deepEqual(
    reading.states.filter((s) => s.settled).map((s) => s.key),
    ['task:a'],
  );
});

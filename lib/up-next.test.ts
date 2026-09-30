import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, Task, TaskSubtask } from './data/types';
import { shiftDate } from './student-day';
import {
  readUpNext,
  recallFirst,
  runUpOwed,
  setAsideKeys,
  usualSittingSeconds,
  type UpNextCandidate,
  type UpNextInput,
  type UpNextReading,
  type UpNextSetAside,
} from './up-next';
import { dayWord, examName, orLine, pickLine, plain, quietCopy, reasonParts, whyOf } from './up-next-copy';
import { planFor, sizeSession } from './up-next-session';

/**
 * Up next, checked against one student's week. Tuesday 29 September: a MATH
 * midterm on Saturday, a problem set Thursday, tomorrow's POL reading, two
 * ECON sets with no date, a CS lab Friday. Every date is a string worked out
 * from TODAY, and nothing here reads the clock, so the whole file holds in
 * any time zone on any day it is run.
 */

const TODAY = '2026-09-29'; // a Tuesday
const d = (n: number, from = TODAY) => shiftDate(from, n);

let made = 0;
function course(id: string, code: string, goalHours = 0): Course {
  made += 1;
  return {
    id,
    code,
    name: code,
    color: '#A8B89B',
    weeklyGoalHours: goalHours,
    createdAt: `2026-09-01T00:00:${String(made % 60).padStart(2, '0')}.000Z`,
  };
}

function task(id: string, courseId: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    courseId,
    title: id,
    dueDate: null,
    priority: 'normal',
    completed: false,
    completedAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    ...patch,
  };
}

let sid = 0;
function session(
  courseId: string,
  date: string,
  minutes: number,
  opts: { taskId?: string; id?: string } = {},
): Session {
  sid += 1;
  return {
    id: opts.id ?? `s${sid}`,
    courseId,
    taskId: opts.taskId ?? null,
    date,
    durationSeconds: minutes * 60,
    note: '',
    createdAt: `${date}T18:00:00.000Z`,
  };
}

function steps(n: number): TaskSubtask[] {
  return Array.from({ length: n }, (_, i) => ({ id: `st${i}`, title: `step ${i + 1}`, completed: false }));
}

const MATH = () => course('math', 'MATH 101', 6);
const POL = () => course('pol', 'POL 100', 4);
const ECON = () => course('econ', 'ECON 110', 4);
const CS = () => course('cs', 'CS 101', 3);

/** The student's term, as it stands on Tuesday evening. */
function week(): UpNextInput & { tasks: Task[]; sessions: Session[]; courses: Course[] } {
  return {
    today: TODAY,
    courses: [MATH(), POL(), ECON(), CS()],
    tasks: [
      task('midterm', 'math', { title: 'MATH 101 Midterm I', kind: 'exam', weight: 25, dueDate: d(4) }),
      task('ps3', 'math', { title: 'Problem set 3', weight: 10, dueDate: d(2), subtasks: steps(5) }),
      task('limits', 'math', { title: 'Limits mastery', priority: 'high', position: 1, subtasks: steps(7) }),
      task('continuity', 'math', { title: 'Continuity concepts', position: 2 }),
      task('hobbes', 'pol', { title: 'Hobbes, Leviathan ch 13', kind: 'reading', pages: 24, dueDate: d(1) }),
      task('mach', 'pol', { title: 'The Prince, ch 15-18', kind: 'reading', dueDate: d(-6) }),
      task('mach-old', 'pol', { title: 'The Prince, ch 1-5', dueDate: d(-18) }),
      task('locke', 'pol', { title: 'Locke, Second Treatise', kind: 'reading', pages: 18 }),
      task('econ5', 'econ', { title: 'Problem set 5', priority: 'high' }),
      task('econ6', 'econ', { title: 'Problem set 6', priority: 'high' }),
      task('lab4', 'cs', { title: 'Lab 4', dueDate: d(3) }),
    ],
    sessions: [
      // Sunday: 40 minutes on the limits tracker, so 27 Sep is MATH's last counted day.
      session('math', d(-2), 40, { taskId: 'limits' }),
      session('cs', TODAY, 50),
      session('pol', d(-3), 30),
    ],
  };
}

const keys = (list: UpNextCandidate[]) => list.map((c) => c.key);
const find = (r: UpNextReading, key: string) => r.ranked.find((c) => c.key === key);
function must(r: UpNextReading, key: string): UpNextCandidate {
  const c = find(r, key);
  assert.ok(c, `${key} should be a candidate; ranked ${keys(r.ranked).join(', ')}`);
  return c;
}
const without = (tasks: Task[], ...ids: string[]) => tasks.filter((t) => !ids.includes(t.id));
const patched = (tasks: Task[], id: string, patch: Partial<Task>) =>
  tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));

function cand(t: Task | null, c: Course, patch: Partial<UpNextCandidate> = {}): UpNextCandidate {
  return {
    key: t?.id ?? `runup:${c.id}`,
    task: t,
    course: c,
    title: t?.title ?? 'Before Midterm I',
    tier: 'week',
    lifted: false,
    piece: null,
    pieceDays: null,
    carry: null,
    steppedAside: false,
    todaySeconds: 0,
    spentSeconds: 0,
    lastSat: null,
    ...patch,
  };
}

test('Tuesday 9pm: tomorrow\'s reading beats an owed run-up, and the run-up lifts dated work first', () => {
  const r = readUpNext(week());
  assert.equal(r.pick?.key, 'hobbes');
  assert.equal(r.pick?.tier, 'due-now');

  // MATH's last counted day was Sunday, two days ago, and the midterm is four
  // out, so the gap is two and a session is owed. The problem set due
  // Thursday already leads up to it, so it is what gets lifted, ahead of the
  // undated trackers.
  const ps3 = must(r, 'ps3');
  assert.equal(ps3.tier, 'run-up');
  assert.equal(ps3.lifted, true);
  assert.equal(must(r, 'limits').lifted, false);

  assert.deepEqual(keys(r.others), ['ps3', 'lab4']);
  assert.equal(plain(pickLine(ps3, TODAY)), 'for Midterm I · due Thursday');
  assert.equal(plain(pickLine(r.pick as UpNextCandidate, TODAY)), 'due tomorrow');
});

test('an exam is never the thing to do, before, on or after its day', () => {
  for (const due of [d(4), d(0), d(-2)]) {
    const w = week();
    const r = readUpNext({ ...w, tasks: patched(w.tasks, 'midterm', { dueDate: due }) });
    assert.ok(!keys(r.ranked).includes('midterm'), due);
  }
});

test('no prep on the exam day itself', () => {
  const w = week();
  const r = readUpNext({ ...w, tasks: patched(w.tasks, 'midterm', { dueDate: d(0) }) });
  assert.ok(r.ranked.every((c) => !c.lifted));
  assert.ok(r.ranked.every((c) => c.piece === null));
});

test('a counted session today settles the run-up, and the reason stays', () => {
  const w = week();
  const r = readUpNext({ ...w, sessions: [...w.sessions, session('math', TODAY, 25)] });
  assert.ok(r.ranked.every((c) => !c.lifted));
  assert.equal(must(r, 'limits').piece?.id, 'midterm');
  assert.equal(must(r, 'ps3').piece?.id, 'midterm');
  assert.equal(plain(pickLine(must(r, 'ps3'), TODAY)), 'for Midterm I · due Thursday');
});

test('the run-up comes round on a gap of about three tenths of the time left', () => {
  const table: [number, number, boolean][] = [
    [12, 3, false], [12, 4, true], [10, 3, true], [7, 2, false], [7, 3, true],
    [4, 1, false], [4, 2, true], [3, 1, true], [1, 0, false], [1, 1, true],
  ];
  for (const [days, ago, owed] of table) {
    assert.equal(runUpOwed(d(-ago), TODAY, days), owed, `${days} days out, last counted ${ago} ago`);
  }
  assert.equal(runUpOwed(null, TODAY, 5), true);
});

test('the eve comes before everything, and rotates away from the last counted day', () => {
  const today = '2026-10-02'; // Friday; the midterm is tomorrow
  const w = week();
  const r = readUpNext({
    ...w,
    today,
    tasks: patched(patched(w.tasks, 'ps3', { completed: true, completedAt: '2026-10-01T20:00:00.000Z' }), 'lab4', {
      dueDate: today,
    }),
    sessions: [...w.sessions, session('math', '2026-10-01', 90, { taskId: 'limits' })],
  });
  // Thursday's ninety minutes went to the limits tracker, so the eve's
  // session is the next thing on the MATH list, above the lab due today.
  assert.equal(r.pick?.key, 'continuity');
  assert.equal(r.pick?.tier, 'eve');
  assert.equal(r.pick?.lifted, true);
  assert.ok(keys(r.others).includes('lab4'));
  assert.equal(plain(pickLine(r.pick as UpNextCandidate, today)), 'for Midterm I');
});

test('a minor exam pulls nothing', () => {
  const w = week();
  const tasks = [
    ...without(w.tasks, 'midterm'),
    task('quiz3', 'math', { title: 'Quiz 3', kind: 'exam', weight: 2, dueDate: d(1) }),
  ];
  const r = readUpNext({ ...w, tasks });
  assert.ok(r.ranked.every((c) => !c.lifted));
  assert.ok(r.ranked.every((c) => c.piece === null));
  assert.ok(!keys(r.ranked).includes('quiz3'));
});

test('with nothing on the list leading up to it, the course itself is the candidate', () => {
  const math = MATH();
  const midterm = task('midterm', 'math', { title: 'MATH 101 Midterm I', kind: 'exam', weight: 25, dueDate: d(4) });
  const r = readUpNext({
    today: TODAY,
    courses: [math, ECON()],
    tasks: [midterm, task('econ5', 'econ', { priority: 'high' })],
    sessions: [],
  });
  assert.equal(r.pick?.key, 'runup:math');
  assert.equal(r.pick?.task, null);
  assert.equal(r.pick?.title, 'Before Midterm I');
  assert.equal(r.pick?.tier, 'run-up');
  assert.equal(plain(pickLine(r.pick as UpNextCandidate, TODAY)), 'nothing on the MATH list leads up to it');
  assert.equal(examName(midterm, math), 'Midterm I');
  assert.equal(examName({ title: 'CS 101 Final' }), 'Final');
  assert.equal(examName({ title: 'Mathematics essay' }, course('m2', 'MATH')), 'Mathematics essay');
});

test('Not now on a lifted pick answers the run-up too', () => {
  const w = week();
  const ps3 = must(readUpNext(w), 'ps3');
  const passed = setAsideKeys(ps3);
  assert.deepEqual(passed, { key: 'ps3', also: ['runup:math'] });

  const r = readUpNext({ ...w, setAside: [passed] });
  assert.equal(find(r, 'ps3'), undefined);
  assert.ok(r.ranked.filter((c) => c.course.id === 'math').every((c) => !c.lifted));
  assert.ok(!keys(r.ranked).includes('runup:math'));
  assert.equal(r.setAside, 1);
  // The reason does not flip for what is left in the course.
  assert.equal(must(r, 'limits').piece?.id, 'midterm');
  assert.deepEqual(setAsideKeys(must(r, 'limits')), { key: 'limits', also: [] });
});

function setAllAside(input: UpNextInput): { reading: UpNextReading; passes: UpNextSetAside[] } {
  const passes: UpNextSetAside[] = [];
  let reading = readUpNext(input);
  for (let i = 0; reading.pick && i < 50; i++) {
    passes.push(setAsideKeys(reading.pick));
    reading = readUpNext({ ...input, setAside: passes });
  }
  return { reading, passes };
}

test('setting everything aside gives the set-aside quiet state', () => {
  const { reading, passes } = setAllAside(week());
  assert.equal(reading.pick, null);
  assert.equal(reading.quiet?.why, 'set-aside');
  assert.equal(reading.setAside, passes.length);
  assert.equal(quietCopy(reading.quiet!, TODAY).heading, 'Everything open is set aside for today.');
});

test('a promoted row leads, and the natural pick becomes the first other', () => {
  const w = week();
  const r = readUpNext({ ...w, chosen: 'econ5' });
  assert.equal(r.ranked[0].key, 'econ5');
  assert.equal(r.pick?.key, 'econ5');
  assert.equal(r.others[0].key, 'hobbes');
  assert.equal(r.chosen, 'econ5');

  // Set aside wins over chosen.
  const both = readUpNext({ ...w, chosen: 'econ5', setAside: [{ key: 'econ5', also: [] }] });
  assert.equal(both.chosen, null);
  assert.equal(both.pick?.key, 'hobbes');
  assert.equal(find(both, 'econ5'), undefined);
});

test('the others come from other courses before the same one twice', () => {
  const r = readUpNext({
    today: TODAY,
    courses: [MATH(), POL()],
    tasks: [
      task('a', 'math', { dueDate: d(1) }),
      task('b', 'math', { dueDate: d(2) }),
      task('c', 'math', { dueDate: d(3) }),
      task('p', 'pol', { dueDate: d(5) }),
    ],
    sessions: [],
  });
  assert.equal(r.pick?.key, 'a');
  assert.equal(r.others[0].course.id, 'pol');
  assert.deepEqual(keys(r.others), ['p', 'b']);
});

test('carrying on is a tie-break, not an override', () => {
  const worked = task('worked', 'math', { dueDate: d(5) });
  const due = task('due', 'pol', { dueDate: d(1) });
  const r = readUpNext({
    today: TODAY,
    courses: [MATH(), POL()],
    tasks: [worked, due],
    sessions: [session('math', d(-1), 25, { taskId: 'worked' })],
  });
  assert.equal(r.pick?.key, 'due');
  assert.equal(must(r, 'worked').carry, 'yesterday');

  const tie = readUpNext({
    today: TODAY,
    courses: [MATH(), POL()],
    tasks: [task('a', 'math', { dueDate: d(1) }), task('b', 'pol', { dueDate: d(1) })],
    sessions: [session('pol', d(-1), 15, { taskId: 'b' })],
  });
  assert.equal(tie.pick?.key, 'b');
  assert.equal(plain(pickLine(tie.pick as UpNextCandidate, TODAY)), 'you were on this yesterday · due tomorrow');
});

test('a timer dropped inside ten minutes is not work in hand', () => {
  const r = readUpNext({
    today: TODAY,
    courses: [MATH(), POL()],
    tasks: [task('dropped', 'math', { dueDate: d(3) }), task('due', 'pol', { dueDate: d(3) })],
    sessions: [session('math', TODAY, 5, { taskId: 'dropped' })],
  });
  assert.equal(must(r, 'dropped').carry, null);
  const real = readUpNext({
    today: TODAY,
    courses: [MATH(), POL()],
    tasks: [task('dropped', 'math', { dueDate: d(3) }), task('due', 'pol', { dueDate: d(3) })],
    sessions: [session('math', TODAY, 25, { taskId: 'dropped' })],
  });
  assert.equal(must(real, 'dropped').carry, 'today');
  assert.equal(real.pick?.key, 'dropped');
});

test('a full session today moves list work aside for the next task, and never work due by tomorrow', () => {
  const today = '2026-10-01'; // Thursday; the midterm is in two days
  const w = week();
  const base = patched(w.tasks, 'ps3', { completed: true, completedAt: '2026-09-30T20:00:00.000Z' });
  const full = session('math', today, 90, { taskId: 'limits' });
  const short = session('math', today, 25, { taskId: 'limits' });

  // The shape the row in the design table describes: two undated items on the
  // MATH list, and a session on the first of them today. Either length counts
  // as today's MATH session, so the run-up is not owed and nothing is lifted.
  // Twenty-five minutes leaves the first item holding the list slot; ninety,
  // past the usual forty-five, passes it to the next item, and the one worked
  // stays on the course page.
  const listed = patched(base, 'limits', { priority: 'normal' });
  const before = readUpNext({ ...w, today, tasks: listed, sessions: [...w.sessions, short] });
  assert.equal(must(before, 'limits').tier, 'list');
  assert.equal(find(before, 'continuity'), undefined);
  const after = readUpNext({ ...w, today, tasks: listed, sessions: [...w.sessions, full] });
  assert.equal(after.usualSeconds, 45 * 60);
  assert.equal(must(after, 'continuity').tier, 'list');
  assert.equal(find(after, 'limits'), undefined);
  assert.ok(after.ranked.every((c) => !c.lifted));

  // As week() has it, limits is high priority, so it is catch-up rather than
  // list work. It stays a candidate, marked stepped aside, and falls behind
  // the catch-up that has not had its session today.
  const high = readUpNext({ ...w, today, tasks: base, sessions: [...w.sessions, full] });
  const limits = must(high, 'limits');
  assert.equal(limits.tier, 'catch-up');
  assert.equal(limits.steppedAside, true);
  const catchUp = keys(high.ranked.filter((c) => c.tier === 'catch-up'));
  assert.deepEqual(catchUp, ['econ5', 'econ6', 'limits']);
  assert.equal(must(high, 'continuity').tier, 'list');

  // Work due tomorrow is never moved aside, whatever it had today.
  const lab = readUpNext({
    ...w,
    today,
    tasks: patched(base, 'lab4', { dueDate: '2026-10-02' }),
    sessions: [...w.sessions, full, session('cs', today, 90, { taskId: 'lab4' })],
  });
  assert.equal(must(lab, 'lab4').steppedAside, false);
  assert.equal(must(lab, 'lab4').tier, 'due-now');
  assert.deepEqual(keys(lab.ranked).slice(0, 2), ['hobbes', 'lab4']);
});

test('old overdue work sinks to a loose end', () => {
  const r = readUpNext(week());
  const old = must(r, 'mach-old');
  assert.equal(old.tier, 'later');
  assert.equal(orLine(old, TODAY), 'open since 11 Sep');
  assert.ok(keys(r.ranked).indexOf('mach-old') > keys(r.ranked).indexOf('econ5'));
  const mach = must(r, 'mach');
  assert.equal(mach.tier, 'week');
  assert.deepEqual(reasonParts(mach, TODAY).when, { warn: '6 days overdue' });
});

test('heavy work goes first inside a tier, and the weight is never said', () => {
  const r = readUpNext({
    today: TODAY,
    courses: [MATH(), POL()],
    tasks: [task('light', 'math', { dueDate: d(1), weight: 2 }), task('heavy', 'pol', { dueDate: d(1), weight: 15 })],
    sessions: [],
  });
  assert.equal(r.pick?.key, 'heavy');
  for (const c of r.ranked) {
    const words = `${plain(pickLine(c, TODAY))} ${orLine(c, TODAY)}`;
    assert.doesNotMatch(words, /15|%|weight/);
  }
});

test('the student\'s own order decides inside a course', () => {
  const r = readUpNext({
    today: TODAY,
    courses: [ECON()],
    tasks: [
      task('second', 'econ', { priority: 'high', position: 2 }),
      task('first', 'econ', { priority: 'high', position: 1 }),
    ],
    sessions: [],
  });
  assert.deepEqual(keys(r.ranked), ['first', 'second']);
});

test('the course that has had least of its week breaks a tie', () => {
  const tasks = [task('e1', 'econ', { priority: 'high' }), task('p1', 'pol', { priority: 'high' })];
  const r = readUpNext({
    today: TODAY,
    courses: [ECON(), POL()],
    tasks,
    sessions: [session('econ', d(-1), 180)],
  });
  assert.equal(r.pick?.key, 'p1');

  // By share of the goal, not by recency: POL was studied more recently, an
  // hour of four, against ECON's three of four.
  const share = readUpNext({
    today: TODAY,
    courses: [ECON(), POL()],
    tasks,
    sessions: [session('econ', d(-1), 180), session('pol', TODAY, 60)],
  });
  assert.equal(share.pick?.key, 'p1');

  // With no goals, the course never studied comes first (#38's case).
  const noGoals = readUpNext({
    today: TODAY,
    courses: [course('econ', 'ECON 110'), course('pol', 'POL 100')],
    tasks,
    sessions: [session('econ', d(-9), 60)],
  });
  assert.equal(noGoals.pick?.key, 'p1');
});

test('with nothing dated, the top of each list comes up, least-served course first', () => {
  const today = '2026-10-11'; // a Sunday
  const r = readUpNext({
    today,
    courses: [MATH(), POL()],
    tasks: [
      task('continuity', 'math', { position: 2 }),
      task('derivs', 'math', { position: 3 }),
      task('locke', 'pol', { kind: 'reading', pages: 18, position: 1 }),
      task('hume', 'pol', { position: 2 }),
    ],
    sessions: [session('pol', '2026-10-06', 60), session('math', '2026-10-07', 300)],
  });
  assert.equal(r.pick?.key, 'locke');
  assert.equal(r.pick?.tier, 'list');
  assert.equal(plain(pickLine(r.pick as UpNextCandidate, today)), 'next on the POL list');
  assert.deepEqual(keys(r.ranked), ['locke', 'continuity']);
});

test('a note to self past the first in its course, and anything dated past three weeks, is never a candidate', () => {
  const r = readUpNext({
    today: TODAY,
    courses: [MATH()],
    tasks: [
      task('first', 'math', { position: 1 }),
      task('second', 'math', { position: 2 }),
      task('edge', 'math', { dueDate: d(21) }),
      task('beyond', 'math', { dueDate: d(22) }),
    ],
    sessions: [],
  });
  assert.deepEqual(keys(r.ranked).sort(), ['edge', 'first']);
  assert.equal(must(r, 'edge').tier, 'later');
});

function farTerm(): UpNextInput {
  return {
    today: TODAY,
    courses: [MATH(), POL()],
    tasks: [
      task('essay', 'pol', { dueDate: d(30) }),
      task('sheet', 'math', { dueDate: d(30) }),
      task('midterm', 'math', { title: 'MATH 101 Midterm I', kind: 'exam', weight: 25, dueDate: d(18) }),
    ],
    sessions: [],
  };
}

function emptyTerm(): UpNextInput {
  return {
    today: TODAY,
    courses: [ECON()],
    tasks: [task('done', 'econ', { completed: true, completedAt: `${d(-1)}T10:00:00.000Z` })],
    sessions: [],
  };
}

test('the quiet states say why, and offer a course with one true line', () => {
  const far = readUpNext(farTerm());
  assert.equal(far.pick, null);
  assert.equal(far.quiet?.why, 'far');
  assert.equal(far.quiet?.line, 'piece');
  assert.equal(far.quiet?.course.id, 'math');
  assert.equal(far.quiet?.nextDue, d(30));
  const farCopy = quietCopy(far.quiet!, TODAY);
  assert.equal(farCopy.heading, 'Nothing on the list is due before 29 Oct.');
  assert.equal(plain(farCopy.line ?? []), 'MATH 101 is next, for Midterm I');

  const empty = readUpNext(emptyTerm());
  assert.equal(empty.pick, null);
  assert.equal(empty.quiet?.why, 'nothing-open');
  assert.equal(empty.quiet?.line, 'least-week');
  assert.equal(quietCopy(empty.quiet!, TODAY).heading, 'Nothing open on the list.');
  assert.equal(plain(quietCopy(empty.quiet!, TODAY).line ?? []), 'ECON 110 has had the least of its week so far');

  // No goals: the course never studied, then the one left longest.
  const never = readUpNext({
    today: TODAY,
    courses: [course('a', 'HIST 200'), course('b', 'PHIL 101')],
    tasks: [],
    sessions: [session('a', d(-2), 30)],
  });
  assert.equal(never.quiet?.course.id, 'b');
  assert.equal(never.quiet?.line, 'never');
  const longest = readUpNext({
    today: TODAY,
    courses: [course('a', 'HIST 200'), course('b', 'PHIL 101')],
    tasks: [],
    sessions: [session('a', d(-2), 30), session('b', d(-5), 30)],
  });
  assert.equal(longest.quiet?.course.id, 'b');
  assert.equal(longest.quiet?.line, 'longest');
  assert.equal(longest.quiet?.lastStudied, d(-5));

  // No courses, no quiet state: that screen is Add a course.
  assert.equal(readUpNext({ today: TODAY, courses: [], tasks: [], sessions: [] }).quiet, null);
});

test('the sitting on the clock never moves the pick', () => {
  const w = week();
  const live = { ...session('cs', TODAY, 60, { taskId: 'lab4', id: 'live:x' }) };
  const r = readUpNext(w);
  const withLive = readUpNext({ ...w, sessions: [...w.sessions, live] });
  assert.deepEqual(keys(withLive.ranked), keys(r.ranked));
  assert.equal(must(withLive, 'lab4').carry, null);
  // Nor does a row dated tomorrow, or one with no time on it.
  const odd = readUpNext({
    ...w,
    sessions: [...w.sessions, session('cs', d(1), 60, { taskId: 'lab4' }), session('cs', TODAY, 0, { taskId: 'lab4' })],
  });
  assert.deepEqual(keys(odd.ranked), keys(r.ranked));
});

test('recall reorders the deck, never the pick', () => {
  const queue = [
    { courseId: 'pol', n: 1 },
    { courseId: 'math', n: 2 },
    { courseId: 'econ', n: 3 },
    { courseId: 'math', n: 4 },
  ];
  assert.deepEqual(recallFirst(queue, 'math').map((q) => q.n), [2, 4, 1, 3]);
  assert.deepEqual(recallFirst(queue, null).map((q) => q.n), [1, 2, 3, 4]);
  assert.deepEqual(recallFirst(queue, 'cs').map((q) => q.n), [1, 2, 3, 4]);

  const r = readUpNext(week());
  const ps3 = must(r, 'ps3');
  const s = sizeSession(ps3, {
    habits: null,
    pace: { pagesPerHour: 20, measured: false },
    tonight: null,
    lastUsedMinutes: null,
    returning: false,
  });
  const plan = planFor(ps3, s, { recallQueue: queue, weakPoints: null });
  assert.deepEqual(plan[0], { kind: 'recall', count: 2, code: 'MATH' });
  // Reading the plan changed nothing about the order.
  assert.deepEqual(keys(readUpNext(week()).ranked), keys(r.ranked));
});

test('a usual sitting is the median of the last four weeks, once there are five', () => {
  const four = [30, 40, 50, 60].map((m, i) => session('math', d(-i), m));
  assert.equal(usualSittingSeconds(four, TODAY), 45 * 60);
  const five = [20, 30, 38, 50, 60].map((m, i) => session('math', d(-i), m));
  assert.equal(usualSittingSeconds(five, TODAY), 38 * 60);
  const long = [200, 200, 200, 200, 200].map((m, i) => session('math', d(-i), m));
  assert.equal(usualSittingSeconds(long, TODAY), 90 * 60);
  // Under ten minutes, older than four weeks, or closed for the reader: not a sitting to learn from.
  const noise = [
    ...[20, 30, 38, 50].map((m, i) => session('math', d(-i), m)),
    session('math', TODAY, 5),
    session('math', d(-40), 60),
    { ...session('math', TODAY, 300), recovery: 'idle' as const },
  ];
  assert.equal(usualSittingSeconds(noise, TODAY), 45 * 60);
});

test('returning is four quiet days and nothing yet today', () => {
  const courses = [MATH()];
  const tasks = [task('a', 'math', { dueDate: d(2) })];
  assert.equal(readUpNext({ today: TODAY, courses, tasks, sessions: [session('math', d(-6), 40)] }).returning, true);
  assert.equal(
    readUpNext({ today: TODAY, courses, tasks, sessions: [session('math', d(-6), 40), session('math', TODAY, 15)] })
      .returning,
    false,
  );
  assert.equal(readUpNext({ today: TODAY, courses, tasks, sessions: [session('math', d(-3), 40)] }).returning, false);
  assert.equal(readUpNext({ today: TODAY, courses, tasks, sessions: [] }).returning, false);
});

test('the reason line, word for word', () => {
  const math = MATH();
  const at = (due: string | null, patch: Partial<UpNextCandidate> = {}, t: Partial<Task> = {}) =>
    cand(task('t', 'math', { dueDate: due, ...t }), math, patch);
  const when = (c: UpNextCandidate) => plain(pickLine(c, TODAY));
  const midterm = task('midterm', 'math', { title: 'MATH 101 Midterm I', kind: 'exam', weight: 25, dueDate: d(4) });

  assert.equal(when(at(TODAY, { tier: 'due-now' })), 'due today');
  assert.equal(when(at(d(1), { tier: 'due-now' })), 'due tomorrow');
  assert.equal(when(at(d(2))), 'due Thursday');
  assert.equal(when(at('2026-10-12', { tier: 'later' })), 'due 12 Oct');
  assert.deepEqual(reasonParts(at(d(-1), { tier: 'due-now' }), TODAY).when, { warn: 'a day overdue' });
  assert.deepEqual(reasonParts(at(d(-3)), TODAY).when, { warn: '3 days overdue' });
  assert.deepEqual(reasonParts(at(d(-18), { tier: 'later' }), TODAY).when, { text: 'open since 11 Sep' });

  const high = reasonParts(at(null, { tier: 'catch-up' }, { priority: 'high' }), TODAY);
  assert.deepEqual(high, { why: null, when: { text: 'no date' }, high: true });
  assert.equal(reasonParts(at(null, { tier: 'list' }), TODAY).why, 'next on the MATH list');
  assert.equal(reasonParts(at(null, { tier: 'list' }), TODAY).when, null);
  assert.equal(when(at(null, { tier: 'list', piece: midterm, pieceDays: 4 })), 'for Midterm I');
  assert.equal(when(at(d(1), { tier: 'due-now', carry: 'today' })), 'you were on this earlier today · due tomorrow');

  // The Or row has room for one clause: the date if there is one.
  assert.equal(orLine(at(d(1), { tier: 'due-now', carry: 'today' }), TODAY), 'due tomorrow');
  assert.equal(orLine(at(null, { tier: 'list', piece: midterm }), TODAY), 'for Midterm I');
  assert.equal(orLine(at(null, { tier: 'catch-up' }, { priority: 'high' }), TODAY), 'no date');

  assert.equal(dayWord('2026-10-03', TODAY), 'Saturday');
  assert.equal(dayWord('2026-10-06', TODAY), '6 Oct');
  assert.equal(dayWord('2026-09-11', TODAY), '11 Sep');
});

test('no reason, Or line or quiet line counts down, praises, or tells anyone what to do', () => {
  const eve = week();
  const guard = /%|\bin \d+ days?\b|\bonly\b|should|great|well done/i;
  const inputs: UpNextInput[] = [
    week(),
    { ...eve, today: '2026-10-02' },
    { ...eve, today: '2026-10-11' },
    { ...eve, today: '2026-09-20' },
    { ...eve, chosen: 'econ5' },
    farTerm(),
    emptyTerm(),
    { ...week(), setAside: setAllAside(week()).passes },
    {
      today: TODAY,
      courses: [MATH()],
      tasks: [task('midterm', 'math', { title: 'Midterm I', kind: 'exam', weight: 25, dueDate: d(3) })],
      sessions: [],
    },
  ];
  let checked = 0;
  for (const input of inputs) {
    const r = readUpNext(input);
    for (const c of r.ranked) {
      for (const line of [plain(pickLine(c, input.today)), orLine(c, input.today)]) {
        assert.doesNotMatch(line, guard, line);
        checked += 1;
      }
    }
    if (r.quiet) {
      const q = quietCopy(r.quiet, input.today);
      assert.doesNotMatch(q.heading, guard, q.heading);
      assert.doesNotMatch(plain(q.line ?? []), guard);
      checked += 1;
    }
  }
  assert.ok(checked > 40);
});

test('the MCP why, one row of the table at a time', () => {
  const math = MATH();
  const midterm = task('midterm', 'math', { title: 'Midterm I', kind: 'exam', weight: 25, dueDate: d(4) });
  const at = (due: string | null, patch: Partial<UpNextCandidate> = {}, t: Partial<Task> = {}) =>
    cand(task('t', 'math', { dueDate: due, ...t }), math, patch);

  assert.equal(whyOf(at(d(2), { tier: 'run-up', lifted: true, piece: midterm }), TODAY), 'exam prep');
  assert.equal(whyOf(cand(null, math, { tier: 'run-up', lifted: true, piece: midterm }), TODAY), 'exam prep');
  assert.equal(whyOf(at(d(-2), { tier: 'due-now', carry: 'yesterday' }), TODAY), 'in progress');
  assert.equal(whyOf(at(d(-2), { tier: 'due-now' }), TODAY), 'overdue');
  assert.equal(whyOf(at(d(-18), { tier: 'later' }), TODAY), 'overdue');
  assert.equal(whyOf(at(TODAY, { tier: 'due-now' }), TODAY), 'due today');
  assert.equal(whyOf(at(d(1), { tier: 'due-now' }), TODAY), 'due soon');
  assert.equal(whyOf(at(d(7)), TODAY), 'due soon');
  assert.equal(whyOf(at(d(8), { tier: 'later' }), TODAY), 'due later');
  assert.equal(whyOf(at(d(21), { tier: 'later' }), TODAY), 'due later');
  assert.equal(whyOf(at(null, { tier: 'catch-up' }, { priority: 'high' }), TODAY), 'high priority, no date');
  assert.equal(whyOf(at(null, { tier: 'list' }), TODAY), 'next on the list');
});

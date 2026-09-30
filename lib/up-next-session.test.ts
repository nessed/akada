import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Task, WeakPoint } from './data/types';
import type { CourseHabit, Habits, Stat } from './progression/habits';
import type { UpNextCandidate } from './up-next';
import { planFor, readTonight, sizeSession, type Tonight } from './up-next-session';

/**
 * How long Up next's session is, and what it starts with. The length is the
 * reader's own, cut only by a reading that needs less, an evening that has
 * less, or a return after quiet days. Instants are built the same way the
 * code builds them, from local calendar dates, so the file holds in any time
 * zone.
 */

const TODAY = '2026-09-29';

const MATH: Course = {
  id: 'math',
  code: 'MATH 101',
  name: 'Calculus I',
  color: '#A8B89B',
  weeklyGoalHours: 6,
  createdAt: '2026-09-01T00:00:00.000Z',
};

const NONE: Stat = { n: 0, median: 0, upper: 0 };
const minutes = (n: number, m: number): Stat => ({ n, median: m * 60, upper: m * 60 });

function courseHabit(patch: Partial<CourseHabit> = {}): CourseHabit {
  return {
    courseId: 'math',
    blocks: NONE,
    blocksFrom: null,
    sittings: NONE,
    overrun: { n: 0, over: 0 },
    peak: null,
    distracted: { n: 0, count: 0 },
    pagesPerHour: null,
    openedDays: 0,
    ...patch,
  };
}

function habits(patch: Partial<Habits> = {}, course: Partial<CourseHabit> = {}): Habits {
  return {
    sittings: NONE,
    blocks: NONE,
    blocksFrom: null,
    blocksPerSitting: NONE,
    breaks: { taken: NONE, meant: NONE },
    reach: 50 * 60,
    reachIsOwn: false,
    hours: new Array<number>(24).fill(0),
    peak: null,
    weekdays: new Array<number>(7).fill(0),
    fullestDay: null,
    days: 0,
    weeks: 0,
    placedSittings: 0,
    timedSittings: 0,
    flatSittings: 0,
    byCourse: new Map([['math', courseHabit(course)]]),
    ...patch,
  };
}

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    courseId: 'math',
    title: id,
    dueDate: null,
    priority: 'normal',
    completed: false,
    completedAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    ...patch,
  };
}

function cand(t: Task | null, patch: Partial<UpNextCandidate> = {}): UpNextCandidate {
  return {
    key: t?.id ?? 'runup:math',
    task: t,
    course: MATH,
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

const PACE = { pagesPerHour: 20, measured: false };
const ctx = (patch: Partial<Parameters<typeof sizeSession>[1]> = {}): Parameters<typeof sizeSession>[1] => ({
  habits: null,
  pace: PACE,
  tonight: null,
  lastUsedMinutes: null,
  returning: false,
  ...patch,
});
const tonight = (minutesLeft: number): Tonight => ({ at: 0, from: 'day', label: '11pm', minutesLeft });

/** The local instant `hour` hours into `iso`, built exactly as readTonight builds it. */
function localHour(iso: string, hour: number, minute = 0): number {
  const d = new Date(`${iso}T00:00:00`);
  d.setHours(hour, minute);
  return d.getTime();
}

const problemSet = cand(task('ps3'));

test('the course\'s own settled blocks set the usual length', () => {
  const s = sizeSession(problemSet, ctx({ habits: habits({}, { blocks: minutes(4, 38) }) }));
  assert.equal(s.minutes, 40);
  assert.equal(s.basis, 'usual');
  assert.equal(s.stopLabel, null);
  assert.equal(s.reading, null);

  // Every course's blocks stand in until this course has enough of its own.
  const overall = sizeSession(problemSet, ctx({ habits: habits({ blocks: minutes(9, 52) }, { blocks: minutes(2, 30) }) }));
  assert.equal(overall.minutes, 50);
  assert.equal(overall.basis, 'usual');
});

test('before blocks settle, the last length started, and 45 before any', () => {
  const unsettled = habits({ blocks: minutes(3, 60) }, { blocks: minutes(3, 60) });
  const last = sizeSession(problemSet, ctx({ habits: unsettled, lastUsedMinutes: 25 }));
  assert.equal(last.minutes, 25);
  assert.equal(last.basis, 'last');
  const none = sizeSession(problemSet, ctx());
  assert.equal(none.minutes, 45);
  assert.equal(none.basis, 'last');
  // The usual is held between 15 and 90.
  assert.equal(sizeSession(problemSet, ctx({ habits: habits({}, { blocks: minutes(6, 150) }) })).minutes, 90);
  assert.equal(sizeSession(problemSet, ctx({ habits: habits({}, { blocks: minutes(6, 8) }) })).minutes, 15);
});

test('the evening left caps the session, never below ten', () => {
  const fits = sizeSession(problemSet, ctx({ tonight: tonight(28) }));
  assert.equal(fits.minutes, 25);
  assert.equal(fits.basis, 'fits');
  assert.equal(fits.stopLabel, '11pm');

  const late = sizeSession(problemSet, ctx({ tonight: tonight(4) }));
  assert.equal(late.minutes, 10);

  // An evening longer than the usual says nothing about it.
  const plenty = sizeSession(problemSet, ctx({ tonight: tonight(180) }));
  assert.equal(plenty.minutes, 45);
  assert.equal(plenty.basis, 'last');
  assert.equal(plenty.stopLabel, null);
});

test('a reading sized to finish what is left of it', () => {
  const reading = cand(task('hobbes', { kind: 'reading', pages: 12 }), { spentSeconds: 20 * 60 });
  const s = sizeSession(reading, ctx({ pace: { pagesPerHour: 20, measured: true } }));
  // 12 pages at 20 an hour is 36 minutes; 20 are spent, so 16 left, to the five above.
  assert.equal(s.minutes, 20);
  assert.equal(s.basis, 'finishes');
  assert.equal(s.reading?.pagesLeft, 5);
  assert.equal(s.reading?.pagesThisSession, 5);
  assert.equal(s.reading?.finishes, true);

  // A reading within five minutes of its estimate has overrun it: no estimate.
  const over = sizeSession(cand(task('h', { kind: 'reading', pages: 12 }), { spentSeconds: 34 * 60 }), ctx());
  assert.equal(over.reading, null);
  assert.equal(over.basis, 'last');
});

test('a long reading takes the usual length, and finishes it only when the usual reaches the end', () => {
  const thirty = cand(task('mach', { kind: 'reading', pages: 30 }));
  // 30 pages at 20 an hour is 90 minutes of reading.
  const usual45 = sizeSession(thirty, ctx({ habits: habits({}, { blocks: minutes(5, 45) }) }));
  assert.equal(usual45.minutes, 45);
  assert.equal(usual45.basis, 'usual');
  assert.equal(usual45.reading?.pagesThisSession, 15);
  assert.equal(usual45.reading?.finishes, false);

  const usual60 = sizeSession(thirty, ctx({ habits: habits({}, { blocks: minutes(5, 60) }) }));
  assert.equal(usual60.minutes, 60);
  assert.equal(usual60.basis, 'usual');
  assert.equal(usual60.reading?.pagesThisSession, 20);

  // A usual of 90 is exactly what the reading needs: the session finishes it,
  // and says so rather than "your usual".
  const usual90 = sizeSession(thirty, ctx({ habits: habits({}, { blocks: minutes(5, 90) }) }));
  assert.equal(usual90.minutes, 90);
  assert.equal(usual90.basis, 'finishes');
  assert.equal(usual90.reading?.pagesThisSession, 30);
  assert.equal(usual90.reading?.finishes, true);
});

test('a first session back is capped at 25', () => {
  const s = sizeSession(problemSet, ctx({ habits: habits({}, { blocks: minutes(5, 45) }), returning: true }));
  assert.equal(s.minutes, 25);
  assert.equal(s.basis, 'return');
});

test('the pace is the reader\'s own only when it was measured', () => {
  const reading = cand(task('locke', { kind: 'reading', pages: 18 }));
  const shipped = sizeSession(reading, ctx());
  assert.equal(shipped.reading?.measured, false);
  assert.equal(shipped.reading?.pagesPerHour, 20);

  const own = sizeSession(reading, ctx({ habits: habits({}, { pagesPerHour: 30 }) }));
  assert.equal(own.reading?.measured, true);
  assert.equal(own.reading?.pagesPerHour, 30);
  // 18 pages at 30 an hour is 36 minutes, to the five above.
  assert.equal(own.minutes, 40);
  assert.equal(own.basis, 'finishes');

  const measured = sizeSession(reading, ctx({ pace: { pagesPerHour: 24, measured: true } }));
  assert.equal(measured.reading?.measured, true);
});

test('tonight ends at the usual stop, and at the day\'s end once that is close', () => {
  // Evenings of nine to eleven: nine tenths of the focus is done by 11pm.
  const hours = new Array<number>(24).fill(0);
  hours[21] = 5 * 3600;
  hours[22] = 5 * 3600;
  const evenings = habits({ hours, placedSittings: 6 });

  const nine = readTonight({ today: TODAY, now: localHour(TODAY, 21), dayEndingHour: 0, habits: evenings });
  assert.equal(nine.from, 'habit');
  assert.equal(nine.at, localHour(TODAY, 23));
  assert.equal(nine.label, '11pm');
  assert.equal(nine.minutesLeft, 120);

  // Ten minutes before eleven there is not enough of the usual evening left
  // to size to, so the day's end takes over.
  const late = readTonight({ today: TODAY, now: localHour(TODAY, 22, 50), dayEndingHour: 0, habits: evenings });
  assert.equal(late.from, 'day');
  assert.equal(late.at, localHour('2026-09-30', 0));
  assert.equal(late.label, 'midnight');
  assert.equal(late.minutesLeft, 70);

  // A day that ends at 2am ends there, and the usual stop is still the same clock hour.
  const owl = readTonight({ today: TODAY, now: localHour(TODAY, 21), dayEndingHour: 2, habits: evenings });
  assert.equal(owl.from, 'habit');
  assert.equal(owl.label, '11pm');
  const owlLate = readTonight({ today: TODAY, now: localHour(TODAY, 23, 30), dayEndingHour: 2, habits: evenings });
  assert.equal(owlLate.from, 'day');
  assert.equal(owlLate.label, '2am');
  assert.equal(owlLate.minutesLeft, 150);

  // Too few placed sittings for a usual stop: the day's end.
  const unknown = readTonight({
    today: TODAY,
    now: localHour(TODAY, 21),
    dayEndingHour: 0,
    habits: habits({ hours, placedSittings: 4 }),
  });
  assert.equal(unknown.from, 'day');
  assert.equal(readTonight({ today: TODAY, now: localHour(TODAY, 21), dayEndingHour: 0, habits: null }).from, 'day');

  // Past the day's end, nothing is left.
  const after = readTonight({ today: TODAY, now: localHour('2026-09-30', 1), dayEndingHour: 0, habits: null });
  assert.equal(after.minutesLeft, 0);
});

function weak(id: string, patch: Partial<WeakPoint> = {}): WeakPoint {
  return {
    id,
    courseId: 'math',
    taskId: null,
    quizId: null,
    section: '',
    pageRef: '',
    summary: id,
    confusion: '',
    errorType: 'concept',
    timesMissed: 1,
    firstSeenAt: '2026-09-10T00:00:00Z',
    lastSeenAt: '2026-09-20T00:00:00Z',
    status: 'open',
    fixedAt: null,
    ...patch,
  };
}

test('the plan: recall, then a weak point, then the pages, at most two', () => {
  const midterm = task('midterm', { title: 'Midterm I', kind: 'exam', weight: 25, dueDate: '2026-10-03' });
  const reading = task('ch3', { kind: 'reading', pages: 30 });
  const c = cand(reading, { piece: midterm, pieceDays: 4 });
  const s = sizeSession(c, ctx());
  const queue = [{ courseId: 'math' }, { courseId: 'pol' }, { courseId: 'math' }];
  const points = [
    weak('course-most-missed', { timesMissed: 5 }),
    weak('this-task', { taskId: 'ch3', timesMissed: 1, section: '1.3', pageRef: 'p.22-24' }),
    weak('fixed', { status: 'fixed', timesMissed: 9, taskId: 'ch3' }),
    weak('other-course', { courseId: 'pol', timesMissed: 9 }),
  ];

  const plan = planFor(c, s, { recallQueue: queue, weakPoints: points });
  assert.deepEqual(plan.map((m) => m.kind), ['recall', 'weak-point']);
  assert.deepEqual(plan[0], { kind: 'recall', count: 2, code: 'MATH' });
  // The task's own weak point beats a more-missed one elsewhere in the course.
  assert.deepEqual(plan[1], { kind: 'weak-point', summary: 'this-task', where: '§ 1.3, p.22-24' });

  const noRecall = planFor(c, s, { recallQueue: [], weakPoints: points });
  assert.deepEqual(noRecall.map((m) => m.kind), ['weak-point', 'pages']);
  const pages = noRecall[1];
  assert.equal(pages.kind, 'pages');
  if (pages.kind === 'pages') {
    assert.equal(pages.spent, false);
    assert.equal(pages.reading.pagesThisSession, 15);
  }

  // No weak point without a piece, and none when they could not be read.
  assert.deepEqual(planFor(cand(reading), s, { recallQueue: [], weakPoints: points }).map((m) => m.kind), ['pages']);
  assert.deepEqual(planFor(c, s, { recallQueue: [], weakPoints: null }).map((m) => m.kind), ['pages']);

  // Without one tied to the task, the course's most missed, and no where when it has none.
  const general = planFor(cand(task('other'), { piece: midterm }), sizeSession(cand(task('other')), ctx()), {
    recallQueue: [],
    weakPoints: points,
  });
  assert.deepEqual(general, [{ kind: 'weak-point', summary: 'course-most-missed', where: null }]);

  // Some of the reading already read.
  const partly = cand(reading, { spentSeconds: 30 * 60 });
  const partlyPlan = planFor(partly, sizeSession(partly, ctx()), { recallQueue: [], weakPoints: null });
  assert.equal(partlyPlan[0].kind === 'pages' && partlyPlan[0].spent, true);
});

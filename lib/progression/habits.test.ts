import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session, SessionSegment } from '../data/types';
import { readHabits, usualStopOffset } from './habits';
import { followsLine, ledgerEntriesFromRows, mergeLedgers, rankingBias } from './log';
import { readObservations, pickMarginNote } from './observations';

/**
 * What the term teaches, checked at the seams: a habit is withheld until
 * there is enough behind it, the reach becomes the reader's own, the notes
 * say what the rows say, and the ranking leans toward what was followed.
 */

const MATH: Course = {
  id: 'math',
  code: 'MATH',
  name: 'Calculus',
  color: '#A8B89B',
  weeklyGoalHours: 6,
  createdAt: '2026-09-01T00:00:00.000Z',
};

let n = 0;
/** A sitting timed in the app on `date`, starting at `hour` local, of the given blocks. */
function timed(
  courseId: string,
  date: string,
  hour: number,
  blocks: { minutes: number; target?: number }[],
  breaks: { minutes: number; target?: number }[] = [],
  note = '',
): Session {
  n += 1;
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
  const segments: SessionSegment[] = [];
  let cursor = start.getTime();
  blocks.forEach((b, i) => {
    segments.push({
      kind: 'focus',
      ordinal: segments.length + 1,
      startedAt: new Date(cursor).toISOString(),
      seconds: b.minutes * 60,
      targetSeconds: b.target ? b.target * 60 : null,
    });
    cursor += b.minutes * 60_000;
    const rest = breaks[i];
    if (rest) {
      segments.push({
        kind: 'break',
        ordinal: segments.length + 1,
        startedAt: new Date(cursor).toISOString(),
        seconds: rest.minutes * 60,
        targetSeconds: rest.target ? rest.target * 60 : null,
      });
      cursor += rest.minutes * 60_000;
    }
  });
  const focus = blocks.reduce((a, b) => a + b.minutes, 0) * 60;
  return {
    id: `s${n}`,
    courseId,
    taskId: null,
    date,
    durationSeconds: focus,
    note,
    createdAt: new Date(cursor).toISOString(),
    breakSeconds: breaks.reduce((a, b) => a + b.minutes, 0) * 60,
    segments,
  };
}

const DATES = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-21'];

test('nothing is claimed from too few sittings, and the reach stays the shipped one', () => {
  const habits = readHabits([MATH], [timed('math', DATES[0], 20, [{ minutes: 40 }])], []);
  assert.equal(habits.sittings.n, 1);
  assert.equal(habits.reachIsOwn, false);
  assert.equal(habits.reach, 50 * 60);
  assert.equal(habits.peak, null);
  const notes = readObservations({ habits, courses: [MATH], now: new Date('2026-09-21T20:30:00'), loggedToday: false });
  assert.deepEqual(notes, []);
});

test('enough evening sittings make an evening, a usual block, and a reach of the reader\'s own', () => {
  const sessions = DATES.map((d) =>
    timed('math', d, 20, [{ minutes: 35, target: 25 }, { minutes: 30, target: 25 }], [{ minutes: 9, target: 5 }]),
  );
  const habits = readHabits([MATH], sessions, []);
  assert.equal(habits.sittings.n, 7);
  assert.equal(habits.reachIsOwn, true);
  // Every sitting is 65 minutes, so the upper quartile is 65 and the reach is that.
  assert.equal(habits.reach, 65 * 60);
  assert.ok(habits.peak && habits.peak.start >= 19 && habits.peak.start <= 20);
  assert.equal(habits.byCourse.get('math')?.blocks.n, 14);
  assert.equal(habits.byCourse.get('math')?.overrun.over, 14);

  const notes = readObservations({ habits, courses: [MATH], now: new Date('2026-09-21T20:30:00'), loggedToday: false });
  const ids = notes.map((o) => o.id);
  assert.ok(ids.includes('peak-now'), 'the hour is current at half past eight');
  assert.ok(ids.includes('overrun:math'));
  assert.ok(ids.includes('breaks-over'));
  // Fourteen blocks alternating 35 and 30: the median is 32.5, said to the nearest five.
  assert.equal(notes.find((o) => o.id === 'blocks:math')?.text, 'MATH blocks run about 35 minutes');
  // The present wins the margin outright.
  assert.equal(pickMarginNote(notes, '2026-09-21')?.id, 'peak-now');
  // Once something is logged today, the hour's note yields and the rest rotate.
  const later = readObservations({ habits, courses: [MATH], now: new Date('2026-09-21T20:30:00'), loggedToday: true });
  assert.ok(!later.some((o) => o.id === 'peak-now'));
});

test('a sitting logged days after the fact is not placed on the clock', () => {
  const late: Session = {
    id: 'late',
    courseId: 'math',
    taskId: null,
    date: '2026-09-01',
    durationSeconds: 3600,
    note: '',
    createdAt: '2026-09-05T09:00:00.000Z',
  };
  const habits = readHabits([MATH], [late], []);
  assert.equal(habits.hours.reduce((a, b) => a + b, 0), 0);
  assert.equal(habits.sittings.n, 1);
});

test('the ranking leans toward the kinds that were followed, by at most half a tier', () => {
  const rates = new Map<'course-mark' | 'week-counts' | 'day-threshold', { shown: number; followed: number }>([
    ['course-mark', { shown: 10, followed: 1 }],
    ['week-counts', { shown: 8, followed: 7 }],
    ['day-threshold', { shown: 2, followed: 2 }],
  ]);
  const bias = rankingBias(rates);
  assert.ok((bias['week-counts'] ?? 0) < 0, 'the followed kind moves up');
  assert.ok((bias['course-mark'] ?? 0) > 0, 'the ignored kind moves down');
  assert.equal(bias['day-threshold'], undefined, 'too few impressions to take part');
  assert.ok(Math.abs(bias['week-counts'] ?? 0) <= 0.5);
  assert.deepEqual(rankingBias(new Map([['course-mark', { shown: 10, followed: 1 }]])), {});
});


/* ── The part of the term that predates all of this ────────────────────── */

/** A sitting with no chain: logged before continuous mode, or through MCP. */
function flat(courseId: string, date: string, minutes: number, restMinutes = 0): Session {
  n += 1;
  return {
    id: `f${n}`,
    courseId,
    taskId: null,
    date,
    durationSeconds: minutes * 60,
    note: '',
    createdAt: `${date}T21:00:00.000Z`,
    ...(restMinutes ? { breakSeconds: restMinutes * 60 } : {}),
  };
}

test('a term recorded before continuous mode still reads as blocks, and says so', () => {
  const sessions = DATES.map((d) => flat('math', d, 50));
  const habits = readHabits([MATH], sessions, []);
  assert.equal(habits.blocksFrom, 'sittings');
  assert.equal(habits.blocks.n, 7);
  assert.equal(habits.blocks.median, 50 * 60);
  assert.equal(habits.flatSittings, 7);
  assert.equal(habits.timedSittings, 0);
  assert.equal(habits.byCourse.get('math')?.blocksFrom, 'sittings');

  // The margin says stretches rather than blocks, because that is what was read.
  const notes = readObservations({ habits, courses: [MATH], now: new Date('2026-09-21T12:00:00'), loggedToday: true });
  assert.equal(notes.find((o) => o.id === 'blocks:math')?.text, 'MATH sessions run about 50 minutes');
});

test('once there are enough timed blocks, the chainless history stops standing in', () => {
  const history = DATES.map((d) => flat('math', d, 120));
  const timedSittings = ['2026-09-22', '2026-09-23'].map((d) =>
    timed('math', d, 20, [{ minutes: 25 }, { minutes: 25 }]),
  );
  const habits = readHabits([MATH], [...history, ...timedSittings], []);
  assert.equal(habits.blocksFrom, 'timed');
  assert.equal(habits.blocks.n, 4);
  // The two hour claims are nowhere in the figure.
  assert.equal(habits.blocks.median, 25 * 60);
  // They are still sittings, and still shape the reach.
  assert.equal(habits.sittings.n, 9);
});

test('a chainless sitting that reports rest is not read as one unbroken stretch', () => {
  const habits = readHabits([MATH], DATES.map((d) => flat('math', d, 90, 15)), []);
  assert.equal(habits.blocks.n, 0);
  assert.equal(habits.blocksFrom, null);
  assert.equal(habits.flatSittings, 0);
  assert.equal(habits.sittings.n, 7, 'it is still a sitting');
});

/* ── The impressions the server already held ───────────────────────────── */

test('stored impressions are read back by the kind that was shown, and the junk is dropped', () => {
  const entries = ledgerEntriesFromRows([
    {
      shown_at: '2026-09-01T10:00:00.000Z',
      shown_id: 'week',
      candidates: [{ id: 'mark:math', kind: 'course-mark' }, { id: 'week', kind: 'week-counts' }],
      followed_at: '2026-09-01T10:20:00.000Z',
    },
    {
      shown_at: '2026-09-02T10:00:00.000Z',
      shown_id: 'mark:math',
      candidates: [{ id: 'mark:math', kind: 'course-mark' }],
      followed_at: null,
    },
    // A kind this version does not know, a shown id absent from its own
    // candidates, and an unreadable stamp. None of them are guessed at.
    { shown_at: '2026-09-03T10:00:00.000Z', shown_id: 'x', candidates: [{ id: 'x', kind: 'invented' }] },
    { shown_at: '2026-09-04T10:00:00.000Z', shown_id: 'y', candidates: [{ id: 'z', kind: 'week-goal' }] },
    { shown_at: 'not a date', shown_id: 'week', candidates: [{ id: 'week', kind: 'week-counts' }] },
  ]);
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((e) => [e.kind, e.followed]),
    [
      ['week-counts', true],
      ['course-mark', false],
    ],
  );
});

test('merging keeps the device\'s answer for an impression the server also holds', () => {
  const at = Date.parse('2026-09-01T10:00:00.000Z');
  const server = [
    { id: 'week', kind: 'week-counts' as const, at, followed: false },
    { id: 'mark:math', kind: 'course-mark' as const, at: at + 86_400_000, followed: false },
  ];
  // The device watched the same first impression and saw a sitting follow it.
  const mine = [{ id: 'week', kind: 'week-counts' as const, at, followed: true }];
  const merged = mergeLedgers(mine, server);
  assert.equal(merged.length, 2, 'the shared impression is one fact, not two');
  assert.equal(merged.find((e) => e.id === 'week')?.followed, true);
  assert.deepEqual(merged.map((e) => e.at), [at, at + 86_400_000], 'oldest first');
});

test('a term of stored impressions can bias the ranking on its own', () => {
  // What a returning reader's history looks like once it is read back: the
  // week's line acted on, the mark's line walked past.
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => ({
      shown_at: new Date(Date.UTC(2026, 8, i + 1, 10)).toISOString(),
      shown_id: 'week',
      candidates: [{ id: 'week', kind: 'week-counts' }],
      followed_at: i < 6 ? new Date(Date.UTC(2026, 8, i + 1, 10, 20)).toISOString() : null,
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      shown_at: new Date(Date.UTC(2026, 8, i + 10, 10)).toISOString(),
      shown_id: 'mark:math',
      candidates: [{ id: 'mark:math', kind: 'course-mark' }],
      followed_at: null,
    })),
  ];
  const entries = mergeLedgers([], ledgerEntriesFromRows(rows));
  const rates = new Map<string, { shown: number; followed: number }>();
  for (const entry of entries) {
    const row = rates.get(entry.kind) ?? { shown: 0, followed: 0 };
    row.shown += 1;
    if (entry.followed) row.followed += 1;
    rates.set(entry.kind, row);
  }
  const bias = rankingBias(rates as Parameters<typeof rankingBias>[0]);
  assert.ok((bias['week-counts'] ?? 0) < 0);
  assert.ok((bias['course-mark'] ?? 0) > 0);
});

test('a course pace is the median of its readings, not one pooled ratio', () => {
  const reading = (id: string, pages: number) => ({
    id, courseId: 'math', title: id, dueDate: null, priority: 'normal' as const,
    completed: true, completedAt: '2026-09-10T10:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z',
    kind: 'reading' as const, pages,
  });
  const on = (taskId: string, minutes: number): Session => ({
    ...timed('math', '2026-09-10', 10, [{ minutes }]), taskId,
  });
  // A 200-page tick with five minutes on it beside two honest readings.
  const habits = readHabits(
    [MATH],
    [on('skim', 5), on('a', 60), on('b', 60)],
    [reading('skim', 200), reading('a', 30), reading('b', 20), reading('ticked', 500)],
  );
  assert.equal(habits.byCourse.get('math')?.pagesPerHour, 30);
});

test('a sitting logged after the fact is never put on the clock', () => {
  // Nine chainless sittings all saved at 11pm: nothing is placed, so no peak.
  const late = DATES.slice(0, 7).map((date, i) => ({
    ...timed('math', date, 23, [{ minutes: 60 }]),
    id: `late-${i}`,
    segments: [],
    breakSeconds: 0,
  }));
  const habits = readHabits([MATH], late, []);
  assert.equal(habits.placedSittings, 0);
  assert.equal(habits.peak, null);
  assert.equal(habits.hours.reduce((a, b) => a + b, 0), 0);
});

test('a peak needs five timed sittings across three days', () => {
  const twoDays = [0, 1, 2, 3, 4].map((i) => timed('math', DATES[i % 2], 20, [{ minutes: 40 }]));
  assert.equal(readHabits([MATH], twoDays, []).peak, null);
  const threeDays = [0, 1, 2, 3, 4].map((i) => timed('math', DATES[i % 3], 20, [{ minutes: 40 }]));
  assert.ok(readHabits([MATH], threeDays, []).peak);
});

test('a sitting over four hours or closed for the reader moves no median', () => {
  const usual = [0, 1, 2, 3, 4].map((i) => timed('math', DATES[i], 18, [{ minutes: 45 }]));
  const forgotten = timed('math', DATES[5], 18, [{ minutes: 300 }]);
  const held = { ...timed('math', DATES[6], 18, [{ minutes: 180 }]), recovery: 'idle' as const };
  const habits = readHabits([MATH], [...usual, forgotten, held], []);
  assert.equal(habits.sittings.n, 5);
  assert.equal(habits.sittings.median, 45 * 60);
});

test('a course line is followed only by a session on that course', () => {
  assert.equal(followsLine({ kind: 'course-mark', courseId: 'math' }, 'math'), true);
  assert.equal(followsLine({ kind: 'course-mark', courseId: 'math' }, 'cs'), false);
  assert.equal(followsLine({ kind: 'untouched-course', courseId: 'econ' }, 'cs'), false);
  assert.equal(followsLine({ kind: 'course-mark' }, 'math'), false);
  // Lines about the week or the day are answered by any course.
  assert.equal(followsLine({ kind: 'week-counts', courseId: null }, 'cs'), true);
  assert.equal(followsLine({ kind: 'day-threshold', courseId: null }, 'cs'), true);
  assert.equal(followsLine({ kind: 'week-goal', courseId: 'econ' }, 'econ'), true);
  assert.equal(followsLine({ kind: 'week-goal', courseId: 'econ' }, 'cs'), false);
});

test('the usual stop is where nine tenths of the placed focus is done', () => {
  // Nine evenings done by nine, and one night that ran on past eleven: the
  // one late night is the exception a usual stop leaves out.
  const evenings = [...DATES, DATES[0], DATES[1]].map((date) => timed('math', date, 20, [{ minutes: 40 }]));
  const late = timed('math', DATES[2], 23, [{ minutes: 40 }]);
  const habits = readHabits([MATH], [...evenings, late], []);
  assert.equal(habits.placedSittings, 10);
  assert.equal(usualStopOffset(habits.hours, habits.placedSittings, 0), 21);

  // Four evenings at eight and one at ten: the eight o'clocks are four fifths
  // of it, short of nine tenths, so the evening runs to the end of the ten.
  const mixed = readHabits(
    [MATH],
    [...DATES.slice(0, 4).map((date) => timed('math', date, 20, [{ minutes: 40 }])), timed('math', DATES[4], 22, [{ minutes: 40 }])],
    [],
  );
  assert.equal(usualStopOffset(mixed.hours, mixed.placedSittings, 0), 23);
});

test('there is no usual stop under five placed sittings, or with nothing placed', () => {
  const four = readHabits([MATH], DATES.slice(0, 4).map((date) => timed('math', date, 20, [{ minutes: 40 }])), []);
  assert.equal(four.placedSittings, 4);
  assert.equal(usualStopOffset(four.hours, four.placedSittings, 0), null);
  assert.equal(usualStopOffset(new Array(24).fill(0), 9, 0), null);
});

test('the usual stop is counted from the hour the reader\'s day ends', () => {
  // A night owl: an hour and a half from eleven, into the small hours.
  const owl = readHabits([MATH], DATES.slice(0, 5).map((date) => timed('math', date, 23, [{ minutes: 90 }])), []);
  // With the day ending at midnight, the half hour after it opens the day
  // and the evening only finishes at its very end: no stop before the day's.
  assert.equal(usualStopOffset(owl.hours, owl.placedSittings, 0), 24);
  // With the day ending at 4am, the evening ends at 1am, 21 hours on.
  assert.equal(usualStopOffset(owl.hours, owl.placedSittings, 4), 21);

  // The same evenings read from a later start give the same clock hour.
  const hours = new Array(24).fill(0);
  hours[21] = 5 * 3600;
  hours[22] = 5 * 3600;
  assert.equal(usualStopOffset(hours, 5, 0), 23);
  assert.equal(usualStopOffset(hours, 5, 2), 21);
});

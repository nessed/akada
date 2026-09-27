import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from './data';
import { readRecords } from './stats-reading';

const TODAY = '2026-09-20';

function sat(id: string, date: string, hours: number, patch: Partial<Session> = {}): Session {
  return {
    id, courseId: 'math', taskId: null, date, durationSeconds: hours * 3600, note: '',
    createdAt: `${date}T12:00:00.000Z`, ...patch,
  };
}

test('a sitting closed for the reader sets no record', () => {
  const records = readRecords(
    [sat('a', '2026-09-10', 1), sat('b', '2026-09-12', 8, { recovery: 'idle' })],
    TODAY,
  );
  assert.equal(records.sitting.best, 3600);
  assert.equal(records.day.best, 3600);
});

test('no record is stamped before two weeks and ten sessions', () => {
  const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
  const early = readRecords(week.map((d, i) => sat(`e${i}`, d, 1 + i / 10)), '2026-09-18');
  assert.equal(early.settled, false);
  assert.equal(early.sitting.fresh, false);
  const later = readRecords(
    [...week, '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'].map((d, i) => sat(`l${i}`, d, 1 + i / 10)),
    '2026-09-18',
  );
  assert.equal(later.settled, true);
});

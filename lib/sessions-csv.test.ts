import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Course, Session } from './data';
import { sessionsCsv } from './sessions-csv';

const course: Course = { id: 'pol', code: 'POL 3302', name: 'Theories of IR', color: '#A8B89B', weeklyGoalHours: 6, createdAt: '' };
const base: Session = { id: 's', courseId: 'pol', taskId: null, date: '2026-09-22', durationSeconds: 3000, note: '', createdAt: '' };

test('every export writes the same six columns, a score where there is one', () => {
  const csv = sessionsCsv(
    [
      { ...base, id: 'a', note: 'Machiavelli, "closed book"', score: 4.5, scoreOutOf: 8 },
      { ...base, id: 'b', note: '', durationSeconds: 1500 },
      { ...base, id: 'c', durationSeconds: 0 },
    ],
    [course],
  ).split('\n');
  assert.equal(csv[0], 'date,course,duration_minutes,note,score,out_of');
  assert.equal(csv[1], '2026-09-22,"POL 3302",50,"Machiavelli, ""closed book""",4.5,8');
  assert.equal(csv[2], '2026-09-22,"POL 3302",25,"",,');
  assert.equal(csv.length, 3, 'a sitting with no time in it is not exported');
});

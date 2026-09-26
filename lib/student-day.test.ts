import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDayEndingHour, cleanTimeZone, shiftDate, studentDay, weekOf, zoneOffsetMinutes } from './student-day';

// 20:30 UTC on Sunday 27 September 2026 is 01:30 on Monday 28th in Lahore.
const LATE_SUNDAY_UTC = new Date('2026-09-27T20:30:00Z');

test('a stored zone puts the day where the student is, not where the server is', () => {
  const day = studentDay({ timeZone: 'Asia/Karachi', dayEndingHour: 0, now: LATE_SUNDAY_UTC });
  assert.equal(day.today, '2026-09-28');
  assert.equal(day.source, 'device');
  assert.equal(day.zoneOffsetMinutes, 300);
});

test('the late night cutoff keeps a 1:30am sitting on the day before', () => {
  const day = studentDay({ timeZone: 'Asia/Karachi', dayEndingHour: 4, now: LATE_SUNDAY_UTC });
  assert.equal(day.today, '2026-09-27');
  // The wall clock's offset is unchanged by the cutoff: an hour-of-day
  // breakdown still says half past one.
  assert.equal(day.zoneOffsetMinutes, 300);
  assert.equal(day.dayOf(new Date('2026-09-27T23:30:00Z')), '2026-09-28');
});

test('with nothing stored the day is UTC, and says so', () => {
  const day = studentDay({ timeZone: '', dayEndingHour: 0, now: LATE_SUNDAY_UTC });
  assert.equal(day.today, '2026-09-27');
  assert.equal(day.source, 'utc');
  assert.equal(day.zoneOffsetMinutes, null);
});

test('an offset from a copied prompt outranks the stored clock, and a stored clock outranks a bare date', () => {
  const offset = studentDay({ timeZone: 'America/New_York', offsetMinutes: 300, now: LATE_SUNDAY_UTC });
  assert.equal(offset.today, '2026-09-28');
  assert.equal(offset.source, 'offset');

  const clock = studentDay({ timeZone: 'Asia/Karachi', date: '2026-09-27', now: LATE_SUNDAY_UTC });
  assert.equal(clock.today, '2026-09-28');

  const bare = studentDay({ date: '2026-09-28', now: LATE_SUNDAY_UTC });
  assert.equal(bare.today, '2026-09-28');
  assert.equal(bare.source, 'date');
});

test('zone offsets follow daylight saving', () => {
  assert.equal(zoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/New_York'), -240);
  assert.equal(zoneOffsetMinutes(new Date('2026-12-01T12:00:00Z'), 'America/New_York'), -300);
  assert.equal(zoneOffsetMinutes(new Date('2026-12-01T12:00:00Z'), 'Asia/Kolkata'), 330);
});

test('weeks run Monday to Sunday off a date string', () => {
  assert.deepEqual(weekOf('2026-09-28'), { from: '2026-09-28', to: '2026-10-04' });
  assert.deepEqual(weekOf('2026-09-27'), { from: '2026-09-21', to: '2026-09-27' });
  assert.deepEqual(weekOf('2026-09-27', -1), { from: '2026-09-14', to: '2026-09-20' });
  assert.equal(shiftDate('2026-02-27', 2), '2026-03-01');
});

test('only a real zone and an hour in range are kept', () => {
  assert.equal(cleanTimeZone('Asia/Karachi'), 'Asia/Karachi');
  assert.equal(cleanTimeZone('Not/AZone'), '');
  assert.equal(cleanTimeZone(42), '');
  assert.equal(cleanTimeZone('x'.repeat(80)), '');
  assert.equal(cleanDayEndingHour(3.4), 3);
  assert.equal(cleanDayEndingHour(12), 8);
  assert.equal(cleanDayEndingHour(-1), 0);
  assert.equal(cleanDayEndingHour('nope'), 0);
});

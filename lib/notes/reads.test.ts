import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_WORDS_PER_MINUTE, cleanReads, minutesForNote, readingPace } from './reads';

const at = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString();

test('cleanReads drops skims, scrolls and junk, and keeps them in date order', () => {
  const reads = cleanReads([
    { seconds: 600, words: 2000, at: at(3) },
    { seconds: 30, words: 100, at: at(1) }, // under a minute
    { seconds: 60, words: 5000, at: at(2) }, // 5000 wpm, a jump to the end
    { seconds: 'x', words: 10, at: at(2) },
    null,
    { seconds: 300, words: 900, at: at(1) },
  ]);
  assert.deepEqual(reads.map((r) => r.at), [at(1), at(3)]);
  assert.deepEqual(cleanReads('nope'), []);
});

test('the pace stays the default until two reads are timed', () => {
  const one = readingPace([{ courseId: 'c1', reads: [{ seconds: 600, words: 1500, at: at(1) }] }]);
  assert.equal(one.personal, false);
  assert.equal(one.wpm, DEFAULT_WORDS_PER_MINUTE);
  assert.equal(one.timed, 1);
  assert.equal(one.medianMinutes, 10);

  const two = readingPace([
    { courseId: 'c1', reads: [{ seconds: 600, words: 1500, at: at(1) }] },
    { courseId: 'c1', reads: [{ seconds: 600, words: 900, at: at(2) }] },
  ]);
  assert.equal(two.personal, true);
  assert.equal(two.wpm, 120);
  assert.equal(two.byCourse.get('c1')?.wpm, 120);
});

test('a note goes by its own last read, scaled to what it says now', () => {
  const pace = readingPace([]);
  const timed = { courseId: null, reads: [{ seconds: 600, words: 1000, at: at(1) }] };
  assert.equal(minutesForNote(timed, 1000, pace), 10);
  assert.equal(minutesForNote(timed, 1500, pace), 15);
  assert.equal(minutesForNote({ courseId: null, reads: [] }, 1000, pace), 5);
});

test('a course with its own reads uses its own pace', () => {
  const pace = readingPace([
    { courseId: 'slow', reads: [{ seconds: 600, words: 600, at: at(1) }, { seconds: 600, words: 600, at: at(2) }] },
    { courseId: 'fast', reads: [{ seconds: 300, words: 1500, at: at(1) }, { seconds: 300, words: 1500, at: at(2) }] },
  ]);
  assert.equal(minutesForNote({ courseId: 'slow', reads: [] }, 600, pace), 10);
  assert.equal(minutesForNote({ courseId: 'fast', reads: [] }, 600, pace), 2);
});

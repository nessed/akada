import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_WORDS_PER_MINUTE,
  advanceRun,
  cleanReads,
  finishRun,
  minutesForNote,
  passedThrough,
  readingPace,
  startRun,
} from './reads';
import { wordCount } from './store';

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

test('a read slower than 40 words a minute is the clock left running', () => {
  assert.deepEqual(cleanReads([{ seconds: 3600, words: 1000, at: at(1) }]), []);
  assert.equal(cleanReads([{ seconds: 600, words: 1000, at: at(1) }]).length, 1);
});

test('a run has to pass each quarter of the note, with time between, to be kept', () => {
  let run = startRun('s1');
  // Read steadily: 30s to each checkpoint, 30s to the end.
  for (const [p, s] of [[0.1, 30], [0.3, 30], [0.55, 30], [0.8, 30], [0.99, 30]] as const) run = advanceRun(run, p, s);
  assert.equal(passedThrough(run), true);
  assert.deepEqual(finishRun({ ...run, seenSeconds: 150 }, 500, at(5)), { seconds: 150, words: 500, at: at(5) });

  // A jump from the top to the end after a minute passes every mark at once.
  let jump = advanceRun(startRun('s1'), 0.1, 60);
  jump = advanceRun(jump, 0.99, 1);
  assert.equal(passedThrough(jump), false);
  assert.equal(finishRun(jump, 200, at(5)), null);
});

test('a note goes by the median of its reads, not the last one', () => {
  const pace = readingPace([]);
  const note = {
    courseId: null,
    reads: [
      { seconds: 600, words: 1000, at: at(1) },
      { seconds: 660, words: 1000, at: at(2) },
      { seconds: 3000, words: 1000, at: at(3) }, // one distracted evening
    ],
  };
  assert.equal(minutesForNote(note, 1000, pace), 11);
});

test('fenced code and table rules are not words', () => {
  assert.equal(wordCount('one two\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| c | d |'), 6);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMark, parseMarks, removeMarkAt, resolveMarks, snapToWords } from './highlights';

const text = 'Supply falls when price falls. Demand rises when price falls.';

test('a stretch snaps out to whole words and lets go of its spaces', () => {
  // "ply fal" → "Supply falls"
  assert.deepEqual(snapToWords(text, 3, 10), [0, 12]);
  assert.equal(snapToWords(text, 12, 13), null);
  const [s, e] = snapToWords(text, 30, 38)!;
  assert.equal(text.slice(s, e), 'Demand');
});

test('marks that touch run together', () => {
  let marks = addMark([], text, 0, 6);
  marks = addMark(marks, text, 4, 14);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].t, 'Supply falls when');
  marks = addMark(marks, text, 31, 37);
  assert.equal(marks.length, 2);
  assert.equal(marks[1].t, 'Demand');
});

test('a tap takes off the mark it lands in and nothing else', () => {
  const marks = addMark(addMark([], text, 0, 6), text, 31, 37);
  assert.deepEqual(removeMarkAt(marks, 33).map((m) => m.t), ['Supply']);
  assert.equal(removeMarkAt(marks, 20), marks);
});

test('a mark follows its words when the text above it moves', () => {
  const marks = addMark([], text, 31, 37);
  const edited = 'A new line. ' + text;
  const [moved] = resolveMarks(marks, edited);
  assert.equal(edited.slice(moved.s, moved.e), 'Demand');
  assert.deepEqual(resolveMarks(marks, 'Nothing like it here.'), []);
});

test('a mark whose words appear twice goes to the nearer copy', () => {
  const marks = [{ s: 49, e: 60, t: 'price falls' }];
  const [placed] = resolveMarks(marks, 'x' + text);
  assert.equal(placed.s, 50);
});

test('stored marks that are not marks are left out', () => {
  assert.deepEqual(parseMarks('not json'), []);
  assert.deepEqual(parseMarks('[{"s":1,"e":0,"t":"x"},{"s":0,"e":3,"t":"abc"}]'), [{ s: 0, e: 3, t: 'abc' }]);
});

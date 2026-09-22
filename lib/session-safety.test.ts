import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanScore, MAX_SCORE_OUT_OF, scoreFace } from './session-safety';

test('a practice score is kept as the paper wrote it', () => {
  assert.deepEqual(cleanScore(6, 8), { score: 6, outOf: 8 });
  assert.deepEqual(cleanScore('4.5', '8'), { score: 4.5, outOf: 8 });
  assert.deepEqual(cleanScore('4,5', ' 8 '), { score: 4.5, outOf: 8 }, 'a comma for the decimal point');
  assert.deepEqual(cleanScore(0, 10), { score: 0, outOf: 10 }, 'nothing out of ten is still a score');
  assert.deepEqual(cleanScore(142, 170), { score: 142, outOf: 170 });
  assert.deepEqual(cleanScore(2 / 3, 1), { score: 0.67, outOf: 1 }, 'two places at most');
  assert.deepEqual(cleanScore('1,350', '1,600'), { score: 1350, outOf: 1600 }, 'thousands, an SAT');
  assert.deepEqual(cleanScore('.5', '1'), { score: 0.5, outOf: 1 });
  assert.deepEqual(cleanScore('4.500', '8'), { score: 4.5, outOf: 8 }, 'numeric as Postgres sends it');
  assert.deepEqual(
    cleanScore('1,000', '1000'),
    { score: 1000, outOf: 1000 },
    'a comma before three digits is a thousands mark, not a decimal point',
  );
  assert.equal(scoreFace(4.5, 8), '4.5/8');
});

test('anything that is not a score out of something is no score at all', () => {
  assert.equal(cleanScore(undefined, undefined), null);
  assert.equal(cleanScore('', ''), null);
  assert.equal(cleanScore(6, undefined), null, 'half a score');
  assert.equal(cleanScore('', 8), null, 'an empty score is not zero');
  assert.equal(cleanScore(9, 8), null, 'more than it was out of');
  assert.equal(cleanScore(-1, 8), null);
  assert.equal(cleanScore(1, 0), null, 'out of nothing');
  assert.equal(cleanScore(1, MAX_SCORE_OUT_OF + 1), null);
  assert.equal(cleanScore('six', 8), null);
  assert.equal(cleanScore(Number.NaN, 8), null);
  assert.equal(cleanScore(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY), null);
  assert.equal(cleanScore(0, 0.004), null, 'out of something that rounds to nothing');
  assert.equal(cleanScore('1e2', '200'), null, 'not how a mark is written');
  assert.equal(cleanScore('0x10', '20'), null);
});

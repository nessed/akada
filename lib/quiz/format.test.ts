import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markQuiz, parseQuiz, writtenTally } from './format';

const GOOD = `# Cell respiration
BIO 101 · Chapter 4

1. What does glycolysis produce
from one glucose?
A) 2 pyruvate and 2 ATP
B) 36 ATP
C) Glucose
Answer: A
Why: Glucose is split in two,
netting 2 ATP.

2. Where does the Krebs cycle run?
A) Cytoplasm
B) Mitochondrial matrix
Answer: B`;

test('parses a well-formed quiz', () => {
  const parsed = parseQuiz(GOOD);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.quiz.title, 'Cell respiration');
  assert.equal(parsed.quiz.context, 'BIO 101 · Chapter 4');
  assert.equal(parsed.quiz.questions.length, 2);
  assert.equal(parsed.quiz.questions[0].prompt, 'What does glycolysis produce from one glucose?');
  assert.equal(parsed.quiz.questions[0].answer, 0);
  assert.equal(parsed.quiz.questions[0].explain, 'Glucose is split in two, netting 2 ATP.');
  assert.equal(parsed.quiz.questions[1].answer, 1);
  assert.equal(parsed.quiz.questions[1].explain, undefined);
});

test('reports every problem by question number', () => {
  const parsed = parseQuiz(`# T\n\n1. One?\nA) x\nAnswer: C\n\n2. Two?\nA) x\nC) y`);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.ok(parsed.errors.some((e) => e.startsWith('Question 1') && e.includes('at least 2')));
  assert.ok(parsed.errors.some((e) => e.startsWith('Question 1') && e.includes('answer C')));
  assert.ok(parsed.errors.some((e) => e.startsWith('Question 2') && e.includes('in order')));
  assert.ok(parsed.errors.some((e) => e.startsWith('Question 2') && e.includes('Answer')));
});

test('marks picks, blanks count wrong', () => {
  const parsed = parseQuiz(GOOD);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const attempt = markQuiz(parsed.quiz.questions, [0]);
  assert.equal(attempt.score, 1);
  assert.equal(attempt.total, 2);
  assert.deepEqual(attempt.picks, [0, -1]);
});

const MIXED = `# Mixed
1. Pick one.
A) yes
B) no
Answer: A

2. Explain why the sky is blue.
Model answer: Rayleigh scattering; shorter wavelengths
scatter more.
Marks: 3

3. Say anything.`;

test('a question with no options is written, and needs a model answer', () => {
  const parsed = parseQuiz(MIXED);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.errors.length, 1);
  assert.ok(parsed.errors[0].startsWith('Question 3') && parsed.errors[0].includes('Model answer'));

  const fixed = parseQuiz(`${MIXED}\nModel answer: anything`);
  assert.ok(fixed.ok);
  if (!fixed.ok) return;
  const [mcq, open, open2] = fixed.quiz.questions;
  assert.equal(mcq.kind, undefined);
  assert.equal(open.kind, 'open');
  assert.equal(open.marks, 3);
  assert.equal(open.modelAnswer, 'Rayleigh scattering; shorter wavelengths\nscatter more.');
  assert.equal(open2.marks, 1);
});

test('written answers are kept unmarked; the MCQ mark stands on its own', () => {
  const parsed = parseQuiz(`${MIXED}\nModel answer: anything`);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const attempt = markQuiz(parsed.quiz.questions, [0, 1, -1], { '1': 'Scattering.', '0': 'ignored', '2': '  ' });
  assert.equal(attempt.score, 1);
  assert.equal(attempt.total, 1);
  assert.deepEqual(attempt.picks, [0, -1, -1]);
  assert.deepEqual(attempt.written, { '1': 'Scattering.' });
  const tally = writtenTally(parsed.quiz.questions, { ...attempt, marks: { '1': { score: 2, outOf: 3, feedback: 'ok' } } });
  assert.deepEqual(tally, { count: 2, pending: 1, score: 2, outOf: 3, possible: 4 });
});

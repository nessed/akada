import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markQuiz, parseQuiz } from './format';

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

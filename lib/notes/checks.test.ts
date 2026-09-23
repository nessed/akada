import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanChecks, extractChecks } from './checks';

test('extractChecks numbers checks in order and splits question from answer', () => {
  const md = [
    '# Note',
    '',
    '> [!CHECK] What is g?',
    '>',
    '> **Answer:** s over c.',
    '',
    '```md',
    '> [!CHECK] not a real check, it is in a fence',
    '```',
    '',
    '> [!DEF] **Term:** not a check.',
    '',
    '> [!CHECK] Second one?',
    '> Answer: yes.',
  ].join('\n');
  const checks = extractChecks(md);
  assert.equal(checks.length, 2);
  assert.deepEqual(checks[0], { index: 0, question: 'What is g?', answer: 's over c.' });
  assert.equal(checks[1].index, 1);
  assert.equal(checks[1].question, 'Second one?');
  assert.equal(checks[1].answer, 'yes.');
});

test('a check with no answer still counts', () => {
  assert.deepEqual(extractChecks('> [!CHECK] Just a question'), [{ index: 0, question: 'Just a question', answer: '' }]);
});

test('cleanChecks keeps only known results inside the count', () => {
  assert.deepEqual(cleanChecks({ 0: 'got', 1: 'miss', 2: 'maybe', x: 'got', 5: 'got' }, 3), { 0: 'got', 1: 'miss' });
  assert.deepEqual(cleanChecks(null), {});
  assert.deepEqual(cleanChecks(['got']), {});
});

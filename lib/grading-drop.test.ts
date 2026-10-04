import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Assessment } from '@/lib/data';
import { applyDrafts, draftRules, draftsFrom, NEW_GROUP, suggestMembers } from './grading-drop';
import { gradeStanding } from './derive';

const row = (id: string, label: string, weight: number, extra: Partial<Assessment> = {}): Assessment => ({
  id, label, weight, score: null, outOf: 100, ...extra,
});

const quizzes = () => [
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => row(`q${n}`, `Quiz ${n}`, 5)),
  row('m', 'Midterm', 25),
  row('f', 'Final', 40),
];

test('suggests the pieces that share a stem, and nothing when none do', () => {
  assert.deepEqual(suggestMembers(quizzes()), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  assert.deepEqual(suggestMembers([row('m', 'Midterm', 30), row('f', 'Final', 40)]), []);
  assert.deepEqual(suggestMembers(quizzes().map((r) => ({ ...r, group: 'x' }))), []);
});

test('dropping the lowest 2 of 7 keeps 5 and names the group from the pieces', () => {
  const rows = quizzes().map((r) => (r.label.startsWith('Quiz') ? { ...r, group: `${NEW_GROUP}1` } : r));
  const { rows: saved, dropRules } = applyDrafts(rows, [{ group: `${NEW_GROUP}1`, drop: 2 }]);
  assert.deepEqual(dropRules, [{ group: 'quiz', keep: 5 }]);
  assert.equal(saved.find((r) => r.id === 'q3')?.group, 'quiz');
  assert.equal(saved.find((r) => r.id === 'm')?.group, undefined);
  // 5 x 5% quizzes + 25 + 40 = 90 counted
  assert.equal(gradeStanding({ assessments: saved, grading: { dropRules } }).total, 90);
});

test('the two lowest marks stop counting once they are in', () => {
  const rows = quizzes().map((r) => (r.label.startsWith('Quiz') ? { ...r, group: 'quiz' } : r));
  const marks = [90, 80, 20, 70, 10, 85, 95];
  const scored = rows.map((r, i) => (i < 7 ? { ...r, score: marks[i] } : r));
  const standing = gradeStanding({ assessments: scored, grading: { dropRules: [{ group: 'quiz', keep: 5 }] } });
  assert.deepEqual([...standing.dropped].sort(), ['q3', 'q5']);
});

test('a draft over fewer than two pieces is left out and ungroups its piece', () => {
  const rows = [row('a', 'Quiz 1', 10, { group: `${NEW_GROUP}1` }), row('b', 'Final', 90)];
  const { rows: saved, dropRules } = applyDrafts(rows, [{ group: `${NEW_GROUP}1`, drop: 1 }]);
  assert.deepEqual(dropRules, []);
  assert.equal(saved[0].group, undefined);
});

test('drop is held so at least one piece always counts', () => {
  const rows = [row('a', 'Quiz 1', 5, { group: 'g' }), row('b', 'Quiz 2', 5, { group: 'g' })];
  assert.deepEqual(draftRules(rows, [{ group: 'g', drop: 9 }]), [{ group: 'g', keep: 1 }]);
});

test('a rule Claude proposed comes back as a drop, with its own group name kept', () => {
  const rows = quizzes().map((r) => (r.label.startsWith('Quiz') ? { ...r, group: 'quizzes' } : r));
  const drafts = draftsFrom(rows, [{ group: 'quizzes', keep: 6 }]);
  assert.deepEqual(drafts, [{ group: 'quizzes', drop: 1 }]);
  assert.deepEqual(applyDrafts(rows, drafts).dropRules, [{ group: 'quizzes', keep: 6 }]);
});

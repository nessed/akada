import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSections, examsWithin, confusionKey, findSameWeakPoint, groupBySection, inSection, nearlySameSummary, rankWeakPoints } from './weak-points';

test('a confusion is the same whichever side is named first', () => {
  assert.equal(confusionKey('Core values vs. objectives'), confusionKey('objectives versus core values'));
  assert.equal(confusionKey('GDP / GNP'), confusionKey('gnp vs gdp'));
  assert.notEqual(confusionKey('GDP vs GNP'), confusionKey('GDP vs NNP'));
});

test('summaries match when near-identical, not when merely related', () => {
  assert.ok(nearlySameSummary('Swaps the 3 core values with the 3 objectives', 'swaps the three core values with the 3 objectives'.replace('three', '3')));
  assert.ok(nearlySameSummary('Swaps the 3 core values with the 3 objectives.', 'Swaps the 3 core values with the 3 objectives'));
  assert.ok(!nearlySameSummary('sign error', 'unit error'));
  assert.ok(!nearlySameSummary('Forgets to divide by n minus one for sample variance', 'Uses the wrong formula for population variance entirely'));
});

test('matching prefers the confusion, then the summary', () => {
  const rows = [
    { id: 'a', summary: 'Mixes up core values and objectives', confusion: 'core values vs objectives' },
    { id: 'b', summary: 'Drops the minus sign when differentiating cos', confusion: '' },
  ];
  assert.equal(findSameWeakPoint(rows, { summary: 'something else worded differently', confusion: 'Objectives vs core values' })?.id, 'a');
  assert.equal(findSameWeakPoint(rows, { summary: 'Drops the minus sign when differentiating cos', confusion: '' })?.id, 'b');
  assert.equal(findSameWeakPoint(rows, { summary: 'New mistake entirely', confusion: 'x vs y' }), undefined);
});

test('ranked by times missed, then most recent', () => {
  const ranked = rankWeakPoints([
    { id: 1, timesMissed: 1, lastSeenAt: '2026-09-20' },
    { id: 2, timesMissed: 3, lastSeenAt: '2026-09-01' },
    { id: 3, timesMissed: 1, lastSeenAt: '2026-09-25' },
  ]);
  assert.deepEqual(ranked.map((r) => r.id), [2, 3, 1]);
});

test('sections sort naturally, with no section last, and nest', () => {
  assert.deepEqual(['1.10', '', '2', '1.2'].sort(compareSections), ['1.2', '1.10', '2', '']);
  assert.ok(inSection('1.3', '1'));
  assert.ok(inSection('1.3', '1.3'));
  assert.ok(!inSection('1.30', '1.3'));
  assert.ok(!inSection('11.2', '1'));
  const groups = groupBySection([
    { section: '2', timesMissed: 1, lastSeenAt: 'a' },
    { section: '1.3', timesMissed: 1, lastSeenAt: 'a' },
    { section: '1.3', timesMissed: 4, lastSeenAt: 'a' },
  ]);
  assert.deepEqual(groups.map((g) => [g.section, g.items.map((i) => i.timesMissed)]), [['1.3', [4, 1]], ['2', [1]]]);
});

test('the nearest exam per course within a week', () => {
  const t = (courseId: string, dueDate: string | null, kind = 'exam', completed = false) => ({ courseId, dueDate, kind: kind as 'exam', completed });
  const found = examsWithin([
    t('a', '2026-10-05'),
    t('a', '2026-10-02'),
    t('b', '2026-09-30'),
    t('c', '2026-10-20'),
    t('d', '2026-09-27', 'task'),
    t('e', '2026-09-28', 'exam', true),
    t('f', '2026-09-20'),
  ], '2026-09-26');
  assert.deepEqual(found.map((f) => [f.exam.courseId, f.exam.dueDate, f.days]), [['b', '2026-09-30', 4], ['a', '2026-10-02', 6]]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockEndAt, idleTripped, quietPoint, type IdleState } from './timer-idle';

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 8, 20, 18, 0);

function state(patch: Partial<IdleState> = {}): IdleState {
  return {
    phase: 'focus', isPaused: false, targetSeconds: null, lastInputAt: T0, startedAt: T0, accumulatedMs: 0,
    ...patch,
  };
}

test('an open sitting is held after an hour with no input, not before', () => {
  assert.equal(idleTripped(state(), T0 + 59 * MIN), false);
  assert.equal(idleTripped(state(), T0 + 60 * MIN), true);
  assert.equal(idleTripped(state({ lastInputAt: T0 + 30 * MIN }), T0 + 60 * MIN), false);
});

test('a block is held only once past its target and twenty quiet minutes', () => {
  const block = state({ targetSeconds: 45 * 60 });
  assert.equal(blockEndAt(block), T0 + 45 * MIN);
  // Reading a paper book for the whole block with no input is fine.
  assert.equal(idleTripped(block, T0 + 44 * MIN), false);
  assert.equal(idleTripped(block, T0 + 46 * MIN), true);
  assert.equal(idleTripped({ ...block, lastInputAt: T0 + 40 * MIN }, T0 + 59 * MIN), false);
  assert.equal(idleTripped({ ...block, lastInputAt: T0 + 40 * MIN }, T0 + 60 * MIN), true);
});

test('a pause or a break never trips the idle rule', () => {
  assert.equal(idleTripped(state({ isPaused: true }), T0 + 300 * MIN), false);
  assert.equal(idleTripped(state({ phase: 'break' }), T0 + 300 * MIN), false);
});

test('the quiet point is the last input, or the block end when that came later', () => {
  assert.equal(quietPoint(state({ lastInputAt: T0 + 20 * MIN }), T0 + 90 * MIN), T0 + 20 * MIN);
  const block = state({ targetSeconds: 45 * 60, lastInputAt: T0 + 2 * MIN });
  assert.equal(quietPoint(block, T0 + 70 * MIN), T0 + 45 * MIN);
  // Nothing worth trimming inside five minutes.
  assert.equal(quietPoint(state({ lastInputAt: T0 + 87 * MIN }), T0 + 90 * MIN), null);
});

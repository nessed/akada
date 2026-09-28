import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasEarlierBlock, stretchFace } from './timer-face';

const block = (elapsed: number) => stretchFace({ onBreak: false, breakTarget: 300, target: 1500, elapsed });
const rest = (elapsed: number) => stretchFace({ onBreak: true, breakTarget: 300, target: 1500, elapsed });

test('a block counts down to its target', () => {
  assert.deepEqual(block(0), { seconds: 1500, over: false, countdown: true });
  assert.deepEqual(block(1499.6), { seconds: 1, over: false, countdown: true });
  assert.deepEqual(block(1500), { seconds: 0, over: false, countdown: true });
});

test('a block past its target counts the overrun up instead of sitting at zero', () => {
  assert.deepEqual(block(1501), { seconds: 1, over: true, countdown: false });
  assert.deepEqual(block(1500 + 125), { seconds: 125, over: true, countdown: false });
});

test('a break counts down, and is over the second it reaches its length', () => {
  assert.deepEqual(rest(60), { seconds: 240, over: false, countdown: true });
  assert.deepEqual(rest(300), { seconds: 0, over: true, countdown: false });
  assert.deepEqual(rest(390), { seconds: 90, over: true, countdown: false });
});

test('an open stretch counts up and is never over', () => {
  const open = stretchFace({ onBreak: false, breakTarget: 300, target: null, elapsed: 4000 });
  assert.deepEqual(open, { seconds: 4000, over: false, countdown: false });
});

test('the total only means something once a block is behind the one on the clock', () => {
  assert.equal(hasEarlierBlock([]), false);
  assert.equal(hasEarlierBlock([{ kind: 'break' }]), false);
  assert.equal(hasEarlierBlock([{ kind: 'focus' }, { kind: 'break' }]), true);
});

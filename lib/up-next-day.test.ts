import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bringBackAll,
  choose,
  cleared,
  parseUpNextDay,
  readUpNextDay,
  setAside,
  subscribeUpNextDay,
  takeBack,
  withChosen,
  withoutSetAside,
  withSetAside,
  type UpNextDay,
} from './up-next-day';

/**
 * Not now and a promoted Or row, kept for one day on one device. The pure
 * helpers carry the rules; the storage functions are checked here too, under
 * node, where there is no window and the module's own copy stands in, which
 * is the same path a private window with storage refused takes.
 */

const TODAY = '2026-09-29';
const empty = (day = TODAY): UpNextDay => ({ day, passes: [], chosen: null });

test('another day, or anything malformed, reads as an empty today', () => {
  assert.deepEqual(parseUpNextDay(null, TODAY), empty());
  assert.deepEqual(parseUpNextDay('{not json', TODAY), empty());
  assert.deepEqual(parseUpNextDay('"a string"', TODAY), empty());
  assert.deepEqual(parseUpNextDay('null', TODAY), empty());
  const yesterday = JSON.stringify({ day: '2026-09-28', passes: [{ key: 'ps3', also: [] }], chosen: 'econ5' });
  assert.deepEqual(parseUpNextDay(yesterday, TODAY), empty());

  const kept = JSON.stringify({
    day: TODAY,
    passes: [{ key: 'ps3', also: ['runup:math', 7] }, { key: '' }, 'junk', { key: 'ps3', also: [] }, { key: 'lab4' }],
    chosen: 5,
  });
  assert.deepEqual(parseUpNextDay(kept, TODAY), {
    day: TODAY,
    passes: [{ key: 'ps3', also: ['runup:math'] }, { key: 'lab4', also: [] }],
    chosen: null,
  });
});

test('setting aside is idempotent, and a promoted row set aside stops being promoted', () => {
  const once = withSetAside(empty(), 'ps3', ['runup:math']);
  assert.deepEqual(withSetAside(once, 'ps3', ['runup:math']), once);
  assert.deepEqual(withSetAside(once, 'ps3', []).passes, [{ key: 'ps3', also: ['runup:math'] }]);

  const chosen = { ...empty(), chosen: 'ps3' };
  assert.equal(withSetAside(chosen, 'ps3', []).chosen, null);
  const lift = { ...empty(), chosen: 'runup:math' };
  assert.equal(withSetAside(lift, 'ps3', ['runup:math']).chosen, null);
  const other = { ...empty(), chosen: 'econ5' };
  assert.equal(withSetAside(other, 'ps3', ['runup:math']).chosen, 'econ5');

  assert.deepEqual(withoutSetAside(once, 'ps3'), empty());
  assert.deepEqual(withoutSetAside(once, 'lab4'), once);
});

test('choosing a row brings it back if it was set aside', () => {
  const d = withSetAside(withSetAside(empty(), 'ps3', []), 'econ5', []);
  const picked = withChosen(d, 'econ5');
  assert.equal(picked.chosen, 'econ5');
  assert.deepEqual(picked.passes, [{ key: 'ps3', also: [] }]);
  assert.deepEqual(withChosen(picked, null).passes, picked.passes);
  assert.equal(withChosen(picked, null).chosen, null);
});

test('bringing everything back empties the passes and keeps the promoted row', () => {
  const d = { ...withSetAside(empty(), 'ps3', ['runup:math']), chosen: 'econ5' };
  assert.deepEqual(cleared(d), { day: TODAY, passes: [], chosen: 'econ5' });
});

test('with no window, the store keeps today in memory and tells its listeners', () => {
  let heard = 0;
  const stop = subscribeUpNextDay(() => {
    heard += 1;
  });

  setAside(TODAY, 'ps3', ['runup:math']);
  const first = readUpNextDay(TODAY);
  assert.deepEqual(first.passes, [{ key: 'ps3', also: ['runup:math'] }]);
  // The same snapshot until something changes, as useSyncExternalStore needs.
  assert.equal(readUpNextDay(TODAY), first);

  choose(TODAY, 'econ5');
  assert.equal(readUpNextDay(TODAY).chosen, 'econ5');
  setAside(TODAY, 'econ5', []);
  assert.equal(readUpNextDay(TODAY).chosen, null);
  takeBack(TODAY, 'econ5');
  assert.deepEqual(readUpNextDay(TODAY).passes.map((p) => p.key), ['ps3']);

  // Tomorrow, none of it.
  assert.deepEqual(readUpNextDay('2026-09-30'), empty('2026-09-30'));

  bringBackAll(TODAY);
  assert.deepEqual(readUpNextDay(TODAY).passes, []);
  assert.equal(heard, 5);

  stop();
  setAside(TODAY, 'lab4', []);
  assert.equal(heard, 5);
  bringBackAll(TODAY);
});

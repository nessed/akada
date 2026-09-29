import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnatomy, LAYERS } from './anatomy';
import { rollBiome } from './biome';
import { depthAt, ZONES } from './depth';
import { mutate, rollGenome } from './genome';
import { courseKey, oceanKey, oceanKeyFromSegments } from './key';
import { childOf, DEFAULT_JELLY, jellyForBlock } from './lineage';
import { speciesName } from './names';
import { hash32, mulberry32 } from './random';
import { EVENTS, eventAtMinute, eventsAt, eventsUpTo } from './events';
import { diveRecap } from './recap';
import { populationAt, spawnAt, visitorsAt } from './schedule';

const VIEW = { width: 1280, height: 800 };

test('the hash is stable, so an ocean rolled today rolls the same next year', () => {
  assert.equal(hash32('a'), hash32('a'));
  assert.notEqual(hash32('ab', 'c'), hash32('a', 'bc'));
  assert.notEqual(hash32('slot', 41), hash32('slot', 42));
  // Golden values: if these move, every saved sitting's ocean moves with them.
  assert.equal(hash32('akada'), 3696671863);
  assert.equal(hash32('v1:c1:0', 'slot', 7), 923188793);
  const r = mulberry32(1);
  assert.ok(Math.abs(r() - 0.6270739405881613) < 1e-12);
});

test('depth only ever goes down, and the zones start where the spec says', () => {
  let last = -1;
  for (let s = 0; s <= 6 * 3600; s += 7) {
    const d = depthAt(s);
    assert.ok(d.meters >= last, `metres went back up at ${s}s`);
    assert.ok(d.z >= 0 && d.z <= 1);
    last = d.meters;
  }
  assert.equal(depthAt(0).name, 'sunlight');
  assert.equal(depthAt(15 * 60).name, 'twilight');
  assert.equal(depthAt(50 * 60).name, 'midnight');
  assert.equal(depthAt(110 * 60).name, 'abyss');
  assert.equal(depthAt(180 * 60).name, 'trench');
  assert.equal(depthAt(15 * 60).meters, 200);
  assert.equal(ZONES.length, 5);
});

test('every genome builds into a body with real numbers in it', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    for (const z of [0.05, 0.3, 0.55, 0.8, 0.98]) {
      const g = mutate(rollGenome(seed, z), seed, seed % 4);
      const a = buildAnatomy(g, seed);
      for (const n of [a.minX, a.minY, a.maxX, a.maxY]) assert.ok(Number.isFinite(n), `bounds of ${seed}@${z}`);
      assert.ok(a.maxX > a.minX && a.maxY > a.minY);
      for (const k of LAYERS) {
        for (const s of a.layers[k]) {
          if (s.kind === 'disc') assert.ok(Number.isFinite(s.x + s.y + s.rx + s.ry));
          else for (const v of s.pts) assert.ok(Number.isFinite(v), `${k} of ${seed}@${z}`);
        }
      }
      assert.ok(speciesName(g, seed).includes(' '));
    }
  }
});

test('a mutated line keeps its body plan and its counts in range', () => {
  const g = rollGenome(99, 0.5, 'bell');
  const far = mutate(g, 99, 40);
  assert.equal(far.plan, 'bell');
  assert.ok(far.tentN! >= 3 && far.tentN! <= 40);
  let j = DEFAULT_JELLY;
  for (let i = 0; i < 200; i++) j = childOf(j, i);
  assert.ok(j.tentacles >= 6 && j.tentacles <= 32);
  assert.ok(j.aspect >= 0.65 && j.aspect <= 1.25);
  assert.deepEqual(jellyForBlock('k', 3), jellyForBlock('k', 3));
  assert.notDeepEqual(jellyForBlock('k', 0), jellyForBlock('k', 1));
});

test('a sitting always rolls the same sea, and a course keeps its regulars', () => {
  const a = rollBiome(oceanKey('c1', 1000), courseKey('c1'));
  const b = rollBiome(oceanKey('c1', 1000), courseKey('c1'));
  assert.deepEqual(
    a.pools.map((p) => p.map((s) => s.name)),
    b.pools.map((p) => p.map((s) => s.name)),
  );
  const other = rollBiome(oceanKey('c1', 2000), courseKey('c1'));
  const regulars = (x: typeof a) => x.pools.flat().filter((s) => s.regular).map((s) => s.id).sort();
  assert.deepEqual(regulars(a), regulars(other));
  const visitors = (x: typeof a) => x.pools.flat().filter((s) => !s.regular).map((s) => s.id);
  assert.notDeepEqual(visitors(a), visitors(other));
  for (const pool of a.pools) assert.ok(pool.length > 0);
  // Nothing crawls about in the open water.
  for (const pool of a.pools.slice(0, 3)) assert.ok(pool.every((s) => !s.floor));
});

test('the key survives the trip through the log', () => {
  const key = oceanKey('c1', Date.parse('2026-09-28T20:14:03.117Z'));
  const fromLog = oceanKeyFromSegments('c1', [
    { kind: 'focus', ordinal: 1, startedAt: '2026-09-28T20:14:03.117Z', seconds: 1500, targetSeconds: 1500 },
  ]);
  assert.equal(fromLog, key);
  assert.equal(oceanKeyFromSegments('c1', []), null);
});

test('the water fills as the sitting goes on, and never past its cap', () => {
  const biome = rollBiome(oceanKey('c1', 5), courseKey('c1'));
  const count = (min: number) => {
    let total = 0;
    for (let k = 0; k < 20; k++) total += visitorsAt(biome, min * 60 + k * 37, VIEW).length;
    return total / 20;
  };
  const early = count(3);
  const late = count(120);
  assert.ok(late > early * 2, `${early} early, ${late} at two hours`);
  assert.ok(late < populationAt(120) * 2.2, `too crowded: ${late}`);
  for (let s = 0; s < 4 * 3600; s += 101) {
    const v = visitorsAt(biome, s, VIEW);
    assert.ok(v.filter((x) => x.layer === 2).length <= 4);
  }
});

test('the same moment always shows the same animals, and a break brings nobody new', () => {
  const biome = rollBiome(oceanKey('c2', 7), courseKey('c2'));
  const a = visitorsAt(biome, 3000, VIEW);
  const b = visitorsAt(biome, 3000, VIEW);
  assert.deepEqual(a.map((v) => [v.key, v.x, v.y]), b.map((v) => [v.key, v.x, v.y]));
  // Every visitor set off at or before now.
  for (const v of a) assert.ok(Number(v.key.split('.')[0]) <= 3000);
});

test('rare events keep their gap, stay in their zones, and are rare', () => {
  let total = 0;
  let hours = 0;
  for (let k = 0; k < 60; k++) {
    const biome = rollBiome(oceanKey('ev', k), courseKey('ev'));
    const all = eventsUpTo(biome, 4 * 3600);
    hours += 4;
    total += all.length;
    for (let i = 1; i < all.length; i++) assert.ok(all[i].start - all[i - 1].start >= 8 * 60, 'events too close');
    for (const e of all) assert.ok(EVENTS[e.kind].zones.includes(depthAt(Math.floor(e.start / 60) * 60).zone), `${e.kind} out of its zone`);
  }
  // Somewhere around a few in ten hours; never a parade.
  assert.ok(total / hours < 0.5, `${total} events in ${hours} hours`);
  assert.ok(total > 0, 'no events at all in 240 hours');
});

test('an event is under way exactly across its own span', () => {
  for (let k = 0; k < 200; k++) {
    const biome = rollBiome(oceanKey('span', k), courseKey('span'));
    for (let m = 1; m < 240; m++) {
      const e = eventAtMinute(biome, m);
      if (!e) continue;
      const mid = e.start + e.seconds / 2;
      assert.ok(eventsAt(biome, mid).some((x) => x.event.start === e.start));
      assert.ok(!eventsAt(biome, e.start + e.seconds + 1).some((x) => x.event.start === e.start));
      return;
    }
  }
  assert.fail('no event found to check');
});

test('the recap names an animal that really swam by, the same every time', () => {
  const key = oceanKey('rc', 1_700_000_000_000);
  const a = diveRecap(key, courseKey('rc'), 70 * 60);
  const b = diveRecap(key, courseKey('rc'), 70 * 60);
  assert.deepEqual([a.meters, a.zone, a.notable?.id, a.event], [b.meters, b.zone, b.notable?.id, b.event]);
  assert.equal(a.zone, 'midnight');
  assert.ok(a.notable, 'nothing met in seventy minutes');
  const biome = rollBiome(key, courseKey('rc'));
  let seen = false;
  for (let s = 0; s <= 70 * 60 && !seen; s++) seen = spawnAt(biome, s)?.id === a.notable!.id;
  assert.ok(seen);
  // It names something from the deepest water the session reached.
  assert.equal(a.notable!.zone, 2);
  // A session too short for anything is still a depth.
  assert.equal(diveRecap(key, courseKey('rc'), 0).meters, 0);
});

test('spawnAt agrees with who is drawn on a full screen', () => {
  const biome = rollBiome(oceanKey('sp', 3), courseKey('sp'));
  const view = { width: 1280, height: 800 };
  const t = 1800;
  const drawn = new Set(visitorsAt(biome, t, view).map((v) => v.key.split('.')[0]));
  for (const slot of drawn) assert.ok(spawnAt(biome, Number(slot)), `slot ${slot} drawn but not spawned`);
});

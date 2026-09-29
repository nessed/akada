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
import { populationAt, visitorsAt } from './schedule';

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

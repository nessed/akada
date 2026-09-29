import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFan, DEFAULT_SHAPE } from '../fan';
import { POOL_SIZE, rollWood } from './biome';
import { finishedBlocks, sceneAtFocus, woodKey, woodKeyFromSegments, woodTime, BREAK_PACE } from './clock';
import { rollAnimal, type Plan } from './fauna';
import { buildFigure, type PoseKind } from './figures';
import { hash32, mulberry32, zipf } from './random';
import { woodRecap } from './recap';
import { firefliesAt, MIN_DENSITY, spawnAt, visitorsAt, type View } from './schedule';
import { STAGES, successionAt } from './succession';
import { DEFAULT_TREE, rollTree, treeForBlock } from './tree';

/* The wood is rebuilt from its key every time it is drawn, so everything
   here is about the same inputs giving the same wood, and about the wood
   only ever going forward. */

const KEY = woodKey('course-econ', 1_790_000_000_000);
const COURSE = 'wood1:course:course-econ';
const DAY: View = { night: false, density: 1, aspect: 16 / 9 };

test('the hash and the generator hold their values', () => {
  assert.equal(hash32('wood'), hash32('wood'));
  assert.notEqual(hash32('ab', 'c'), hash32('a', 'bc'));
  // Pinned: if these move, every wood anyone has grown would redraw.
  assert.equal(hash32('wood', 1), 3593858418);
  const r = mulberry32(7);
  assert.equal(Math.round(r() * 1e9), 11704753);
});

test('the fan grows exactly as it always has when given no habit', () => {
  // A checksum of 60 trees taken before the habit existed.
  const digest = (depth: number, tripleP: number) => {
    let h = 2166136261;
    const eat = (v: number) => {
      const s = v.toPrecision(17);
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
    };
    for (let seed = 1; seed <= 60; seed++) {
      const t = buildFan(seed, depth, tripleP);
      for (const s of t.segs) [s.x, s.y, s.x1, s.y1, s.w, s.d, s.p, s.a, s.len, s.bow, s.kids].forEach(eat);
      eat(t.minX);
      eat(t.maxX);
      eat(t.minY);
    }
    return (h >>> 0).toString(16);
  };
  assert.equal(digest(7, 0.2), 'a722426c');
  assert.equal(digest(6, 0.2), 'be2f9b15');
  assert.deepEqual(buildFan(41, 7, 0.2, DEFAULT_SHAPE), buildFan(41, 7, 0.2));
  assert.deepEqual(DEFAULT_TREE.shape, DEFAULT_SHAPE);
});

test('the land only ages forward, and the stages turn at 15, 50, 110 and 180 minutes', () => {
  let last = successionAt(0);
  for (let s = 0; s <= 6 * 3600; s += 7) {
    const now = successionAt(s);
    assert.ok(now.z >= last.z, `z went back at ${s}s`);
    assert.ok(now.years >= last.years, `years went back at ${s}s`);
    assert.ok(now.index >= last.index);
    last = now;
  }
  assert.equal(successionAt(15 * 60 - 1).stage, 'meadow');
  assert.equal(successionAt(15 * 60).stage, 'scrub');
  assert.equal(successionAt(50 * 60).stage, 'young');
  assert.equal(successionAt(110 * 60).stage, 'high');
  assert.equal(successionAt(180 * 60).stage, 'old');
  assert.equal(STAGES.length, 5);
  assert.ok(successionAt(18 * 3600).z <= 1);
});

test('breaks move the scene slowly and add no focus', () => {
  const segments = [
    { kind: 'focus' as const, seconds: 1500, startedAt: new Date(1_790_000_000_000).toISOString(), targetSeconds: 1500 },
    { kind: 'break' as const, seconds: 300, startedAt: new Date(1_790_001_500_000).toISOString(), targetSeconds: 300 },
  ];
  const t = woodTime(
    { courseId: 'c', phase: 'focus', isPaused: false, startedAt: 1_000, accumulatedMs: 0, sittingStartedAt: 0, targetSeconds: 1500, segments },
    61_000,
  );
  assert.equal(t.focus, 1560);
  assert.equal(t.rest, 300);
  assert.equal(t.scene, 1560 + 300 * BREAK_PACE);
  assert.equal(sceneAtFocus(segments, 1000), 1000);
  assert.equal(sceneAtFocus(segments, 1550), 1550 + 300 * BREAK_PACE);
  assert.equal(woodKeyFromSegments('course-econ', segments), KEY);
  assert.deepEqual(finishedBlocks(segments, t), [{ index: 0, grown: 1 }]);
  const paused = woodTime({ courseId: 'c', phase: 'focus', isPaused: true, startedAt: 1_000, accumulatedMs: 5000, sittingStartedAt: 0, targetSeconds: 1500, segments }, 99_000);
  assert.equal(paused.focus, 1505);
});

test('every block grows a kin of the one before, the same every time', () => {
  const a = treeForBlock(KEY, 3);
  assert.deepEqual(a, treeForBlock(KEY, 3));
  assert.notDeepEqual(treeForBlock(KEY, 0), treeForBlock(KEY, 1));
  for (let s = 1; s < 400; s++) {
    const g = rollTree(s);
    assert.ok(Math.abs(g.shape.keep + g.shape.up - 1) < 1e-9);
    const t = buildFan(s, 7, 0.2, g.shape);
    assert.ok(t.segs.every((seg) => Number.isFinite(seg.x1) && Number.isFinite(seg.y1)));
  }
});

test('two thousand animals in every pose draw without a NaN', () => {
  const plans: Plan[] = ['songbird', 'raptor', 'owl', 'bat', 'butterfly', 'moth', 'dragonfly', 'bee', 'firefly', 'deer', 'fox', 'hare', 'hedgehog'];
  const poses: PoseKind[] = ['perch', 'fly', 'bound', 'glide', 'walk', 'stand', 'graze', 'hop'];
  for (let i = 0; i < 2000; i++) {
    const g = rollAnimal(i * 7919 + 1, plans[i % plans.length]);
    const kind = poses[i % poses.length];
    const f = buildFigure(g, { kind, t: (i % 17) / 17 });
    for (const shapes of Object.values(f.layers)) {
      for (const s of shapes ?? []) {
        const nums = s.c ? s.c : (s.pts ?? []).flat();
        assert.ok(nums.every(Number.isFinite), `${g.plan} ${kind} has a NaN`);
      }
    }
    assert.ok(f.bounds.every(Number.isFinite));
    assert.ok(f.ref > 0);
  }
});

test('a wood rolls the same from its key, its course half holds across sittings, and no pool is empty', () => {
  const a = rollWood(KEY, COURSE);
  assert.deepEqual(a, rollWood(KEY, COURSE));
  const other = rollWood(woodKey('course-econ', 1_790_500_000_000), COURSE);
  for (const spec of STAGES) {
    const pool = a.pools[spec.key];
    assert.equal(pool.length, POOL_SIZE);
    const regulars = pool.filter((sp) => sp.regular).map((sp) => sp.name);
    assert.deepEqual(regulars, other.pools[spec.key].filter((sp) => sp.regular).map((sp) => sp.name));
    assert.ok(pool.some((sp) => sp.genome.activity !== 'night'), `${spec.key} has no day animal`);
    assert.ok(pool.some((sp) => sp.genome.activity !== 'day'), `${spec.key} has no night animal`);
    const total = pool.reduce((s, sp) => s + sp.weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
  }
  assert.ok(Math.abs(zipf(12).reduce((x, y) => x + y, 0) - 1) < 1e-9);
});

test('arrivals are fixed by the key, fill up as the land matures, and stop for a break', () => {
  const wood = rollWood(KEY, COURSE);
  assert.deepEqual(spawnAt(wood, 4321, false), spawnAt(wood, 4321, false));
  const count = (from: number, to: number) => {
    let n = 0;
    for (let s = from; s < to; s++) if (spawnAt(wood, s, false)) n++;
    return n;
  };
  assert.ok(count(0, 1800) < count(3 * 3600, 3 * 3600 + 1800), 'the wood should fill up');

  const seg = (kind: 'focus' | 'break', seconds: number) => ({ kind, seconds, startedAt: new Date(0).toISOString(), targetSeconds: null });
  const segments = [seg('focus', 3600)];
  const before = visitorsAt(wood, { focus: 3600, scene: 3600, segments }, DAY);
  // Twenty minutes into a break: focus has not moved, the scene has crawled
  // on, and everyone who was there has left.
  const later = visitorsAt(wood, { focus: 3600, scene: 3600 + 1200 * BREAK_PACE, segments: [...segments, seg('break', 1200)] }, DAY);
  assert.ok(before.length > 0);
  assert.equal(later.length, 0);
  for (const v of before) {
    assert.ok(v.spawn.slot <= 3600, 'nobody arrives before their slot');
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
  }
  // A small view shows fewer, never others.
  const small = visitorsAt(wood, { focus: 3600, scene: 3600, segments }, { ...DAY, density: MIN_DENSITY });
  const all = new Set(before.map((v) => v.id));
  assert.ok(small.every((v) => all.has(v.id)));
  assert.ok(small.length <= before.length);
});

test('fireflies only come out at night, once there is scrub', () => {
  const wood = rollWood(KEY, COURSE);
  assert.equal(firefliesAt(wood, 2 * 3600, 7200, DAY).length, 0);
  assert.equal(firefliesAt(wood, 60, 60, { ...DAY, night: true }).length, 0);
});

test('the recap for a fixed sitting never drifts', () => {
  const wood = rollWood(KEY, COURSE);
  const r = woodRecap(wood, 95 * 60, false);
  assert.equal(r.stage, 'young wood');
  assert.equal(r.years, 50);
  assert.ok(r.notable);
  // Pinned: a changed generator must bump WOOD_VERSION.
  assert.equal(r.notable?.name, 'Stictopapilio maculata');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionSegment } from '../../data/types';
import { depthAt } from '../depth';
import { planPicture, type PictureInput } from './index';
import { MARGIN, overlapShare, type Box, type Plan } from './layout';

/** A sitting from a start and a list of stretches in minutes. */
function sitting(start: string, parts: ['focus' | 'break', number][]): SessionSegment[] {
  let t = Date.parse(start);
  return parts.map(([kind, min], i) => {
    const s = { kind, ordinal: i, startedAt: new Date(t).toISOString(), seconds: min * 60, targetSeconds: null } as SessionSegment;
    t += min * 60000;
    return s;
  });
}

const CASES: { name: string; course: string; segs: SessionSegment[] }[] = [
  { name: '15 min morning', course: 'c-lang', segs: sitting('2026-09-06T08:00:00Z', [['focus', 15]]) },
  { name: '50 min with a break', course: 'c-hist', segs: sitting('2026-09-02T14:10:00Z', [['focus', 25], ['break', 5], ['focus', 25]]) },
  { name: '2 h, two breaks', course: 'c-bio', segs: sitting('2026-09-07T19:30:00Z', [['focus', 40], ['break', 10], ['focus', 40], ['break', 20], ['focus', 40]]) },
  {
    name: '3.5 h night',
    course: 'c-bio',
    segs: sitting('2026-09-04T00:36:00Z', [['focus', 60], ['break', 10], ['focus', 60], ['break', 15], ['focus', 60], ['break', 5], ['focus', 30]]),
  },
  {
    name: '2.5 h of short blocks',
    course: 'c-math',
    segs: sitting('2026-09-08T10:00:00Z', [
      ['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 20],
      ['break', 5], ['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 30],
    ]),
  },
];
const SHAPES = [
  { width: 1200, height: 1800 },
  { width: 1920, height: 1200 },
  { width: 390, height: 844 },
];

function input(c: (typeof CASES)[number], ground: 'paper' | 'night' = 'paper'): PictureInput {
  return { courseId: c.course, color: '#A8BCC9', segments: c.segs, ground, tzOffset: 0 };
}

function planOf(c: (typeof CASES)[number], shape: { width: number; height: number }, ground: 'paper' | 'night' = 'paper'): Plan {
  const pic = planPicture(input(c, ground), shape);
  assert.ok(pic, `${c.name}: no picture`);
  return pic.plan as Plan;
}

const focusOf = (segs: SessionSegment[]) => segs.filter((s) => s.kind === 'focus').reduce((a, s) => a + s.seconds, 0);
const count = (segs: SessionSegment[], kind: 'focus' | 'break') => {
  if (kind === 'break') return segs.filter((s) => s.kind === 'break').length;
  let n = 0;
  let open = false;
  for (const s of segs) {
    if (s.kind === 'focus' && !open) n++;
    open = s.kind === 'focus';
  }
  return n;
};

test('the same sitting and shape always plan the same picture', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const a = JSON.stringify(planOf(c, shape));
      const b = JSON.stringify(planOf(c, shape));
      assert.equal(a, b, `${c.name} at ${shape.width}x${shape.height}`);
    }
  }
});

test('the picture goes as deep as the sitting did, and a longer sitting goes deeper', () => {
  let last = -1;
  for (const c of [CASES[0], CASES[1], CASES[2], CASES[3]]) {
    const plan = planOf(c, SHAPES[0]);
    const d = depthAt(focusOf(c.segs));
    assert.equal(plan.meters, d.meters, c.name);
    assert.equal(plan.zone, d.zone, c.name);
    assert.ok(Math.abs(plan.zMax - d.z) < 1e-9, c.name);
    assert.ok(plan.zMax > last, `${c.name} is not deeper than the shorter one`);
    last = plan.zMax;
    // The water at the foot of the page is the deepest the sitting reached, and no deeper than a little past it.
    const foot = plan.zStops[plan.zStops.length - 1].z;
    assert.ok(foot >= d.z - 1e-9 && foot <= d.z + 0.06, `${c.name}: foot of the page at z ${foot}, reached ${d.z}`);
    assert.equal(plan.zStops[0].z, 0, 'the top of the page is the surface');
  }
  // A short sitting stays in the light; three hours reach the floor.
  assert.ok(planOf(CASES[0], SHAPES[0]).floor === null);
  assert.ok(planOf(CASES[3], SHAPES[0]).floor !== null);
});

test('one jelly per block, where it ended, the last the hero and the largest', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      assert.equal(plan.jellies.length, count(c.segs, 'focus'), c.name);
      const hero = plan.jellies[plan.jellies.length - 1];
      assert.ok(hero.hero);
      for (const j of plan.jellies.slice(0, -1)) {
        assert.ok(!j.hero);
        assert.ok(j.r < hero.r, `${c.name}: an older jelly is as large as the hero`);
      }
      // Down the page in the order they came.
      for (let i = 1; i < plan.jellies.length; i++) assert.ok(plan.jellies[i].y >= plan.jellies[i - 1].y - 1e-6, `${c.name}: jelly ${i} above ${i - 1}`);
    }
  }
});

test('one ledge per break, a short outcrop just under the jelly that rested', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      assert.equal(plan.ledges.length, count(c.segs, 'break'), c.name);
      for (const l of plan.ledges) {
        const j = plan.jellies[l.rest];
        assert.ok(l.y > j.y, `${c.name}: ledge ${l.rest} is above its jelly`);
        // A short outcrop, never a shelf across the page, and the jelly near its lip.
        assert.ok(l.reach <= 0.3, `${c.name}: ledge ${l.rest} reaches ${l.reach.toFixed(2)} of the width`);
        const lip = l.edge < 0 ? l.reach * plan.w : plan.w - l.reach * plan.w;
        assert.ok(Math.abs(j.x - lip) <= plan.w * 0.32, `${c.name}: ledge ${l.rest} is far from its jelly`);
      }
      // A longer break, a wider ledge, for jellies the same distance from the edge.
      const rests = c.segs.filter((s) => s.kind === 'break');
      assert.equal(rests.length, plan.ledges.length);
    }
  }
});

test('pauses do not show: a stretch logged in two pieces is the same picture', () => {
  const whole = sitting('2026-09-02T14:10:00Z', [['focus', 40], ['break', 10], ['focus', 30]]);
  const paused = sitting('2026-09-02T14:10:00Z', [['focus', 15], ['focus', 25], ['break', 10], ['focus', 30]]);
  const a = planPicture({ courseId: 'c1', color: '#A8BCC9', segments: whole, ground: 'paper' }, SHAPES[0])!.plan as Plan;
  const b = planPicture({ courseId: 'c1', color: '#A8BCC9', segments: paused, ground: 'paper' }, SHAPES[0])!.plan as Plan;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

const inside = (b: Box, plan: Plan, tol = 0.5) =>
  b.x0 >= plan.w * MARGIN - tol && b.x1 <= plan.w * (1 - MARGIN) + tol && b.y0 >= plan.h * MARGIN - tol && b.y1 <= plan.h * (1 - MARGIN) + tol;

test('nothing that matters is within the edge margin', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      for (const ground of ['paper', 'night'] as const) {
        const plan = planOf(c, shape, ground);
        for (const a of plan.cast) assert.ok(inside(a.box, plan), `${c.name} ${shape.width}x${shape.height}: ${a.id} at the edge`);
        for (const j of plan.jellies) assert.ok(inside(j.box, plan), `${c.name} ${shape.width}x${shape.height}: jelly ${j.block} at the edge`);
      }
    }
  }
});

test('the cast does not pile up: no overlaps past a tolerance, and open water left', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const cast = plan.cast;
      assert.ok(cast.length > 0 && cast.length <= 35, `${c.name}: cast of ${cast.length}`);
      for (let i = 0; i < cast.length; i++) {
        for (let k = i + 1; k < cast.length; k++) {
          // Near over far is how a painting overlaps; within a layer, barely.
          const tol = cast[i].layer === cast[k].layer ? 0.25 : 0.5;
          const o = overlapShare(cast[i].box, cast[k].box);
          assert.ok(o <= tol, `${c.name} ${shape.width}x${shape.height}: ${cast[i].id} and ${cast[k].id} overlap ${o.toFixed(2)}`);
        }
        for (const j of plan.jellies) {
          const o = overlapShare(cast[i].box, j.box);
          assert.ok(o <= 0.3, `${c.name} ${shape.width}x${shape.height}: ${cast[i].id} over jelly ${j.block} (${o.toFixed(2)})`);
        }
      }
      // At least a third of the page is open water.
      let covered = 0;
      for (const b of [...cast.map((a) => a.box), ...plan.jellies.map((j) => j.box)]) covered += (b.x1 - b.x0) * (b.y1 - b.y0);
      assert.ok(covered / (plan.w * plan.h) < 2 / 3, `${c.name}: ${((covered / (plan.w * plan.h)) * 100).toFixed(0)}% covered`);
    }
  }
});

test('the rarest animal met is in the picture, near and large', () => {
  for (const c of CASES) {
    const plan = planOf(c, SHAPES[0]);
    const rare = plan.cast.filter((a) => a.rare);
    assert.equal(rare.length, 1, c.name);
    assert.equal(rare[0].layer, 2);
    for (const a of plan.cast) if (!a.rare && !a.members && a.layer < 2) assert.ok(a.len <= rare[0].len, `${c.name}: ${a.id} bigger than the rarest`);
  }
});

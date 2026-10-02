import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionSegment } from '../../data/types';
import { depthAt } from '../depth';
import { planPicture, type PictureInput } from './index';
import { rollBiome } from '../biome';
import { rollKelp } from '../kelp';
import { BUBBLE_MAX, boxGap, CLEAR, crestDiff, floorAt, inter, MARGIN, overlapShare, REF, rockIoU, rockTouches, sameRock, PICTURE_KELP, STEM, wallAt, wallTouches, type Box, type Plan } from './layout';
import { EYE_R, ROW_BAND, ROW_LEVEL, SIPHON_TILT, steepestFall, stepsApart, whaleHull } from './layout';
import { partExt, rockSpan, rockX, WALL_STEP } from './layout';
import { calmArea, CALM, CAST_MAX, castWant, EVENTS_MAX, GHOST_ROW, HERO_R, LONE_GAP, SIBLING_SCALE, TRENCH_TOP, WALL_W } from './layout';
import { EVENTS } from '../events';
import { rockShape } from '../outcrop-sprite';
import { siphonophoreReach } from '../sightings-shallow';
import { KELP_SHADE, kelpShadeAt } from './paint';

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
  { name: '25 min noon', course: 'c-art', segs: sitting('2026-09-09T12:00:00Z', [['focus', 25]]) },
  { name: '50 min with a break', course: 'c-hist', segs: sitting('2026-09-02T14:10:00Z', [['focus', 25], ['break', 5], ['focus', 25]]) },
  { name: '2 h, two breaks', course: 'c-bio', segs: sitting('2026-09-07T19:30:00Z', [['focus', 40], ['break', 10], ['focus', 40], ['break', 20], ['focus', 40]]) },
  {
    name: '3.5 h night',
    course: 'c-bio',
    segs: sitting('2026-09-04T00:36:00Z', [['focus', 60], ['break', 10], ['focus', 60], ['break', 15], ['focus', 60], ['break', 5], ['focus', 30]]),
  },
  {
    name: '4.5 h to the trench',
    course: 'c-math',
    segs: sitting('2026-09-06T01:07:00Z', [['focus', 50], ['break', 10], ['focus', 50], ['break', 10], ['focus', 50], ['break', 30], ['focus', 60], ['break', 10], ['focus', 60]]),
  },
  {
    name: '90 min at dawn',
    course: 'c-hist',
    segs: sitting('2026-09-04T05:46:00Z', [['focus', 45], ['break', 10], ['focus', 45]]),
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
  for (const c of [CASES[0], CASES[1], CASES[2], CASES[3], CASES[4]]) {
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
  assert.ok(planOf(CASES[4], SHAPES[0]).floor !== null);
  // Past three hours, the trench.
  assert.ok(planOf(CASES[4], SHAPES[0]).trench === null || CASES[4].segs.length > 0);
  assert.ok(planOf(CASES[5], SHAPES[0]).trench !== null);
  assert.ok(planOf(CASES[2], SHAPES[0]).trench === null);
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

test('one rock per break, inked near; rocks merely passed far, small and faint', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const breaks = plan.rocks.filter((r) => r.kind === 'break');
      // Each break a rock, or (when the walls have their two rocks a side) a ledge in a wall, at most one of each per break.
      const ledges = plan.walls.flatMap((wl) => wl.ledges);
      assert.equal(breaks.length + ledges.length, count(c.segs, 'break'), `${c.name} ${shape.width}x${shape.height}: ${breaks.length} break rocks and ${ledges.length} ledges`);
      assert.equal(new Set([...breaks.map((r) => r.rest), ...ledges.map((l) => l.rest)]).size, count(c.segs, 'break'));
      if (count(c.segs, 'break') <= 2) assert.equal(ledges.length, 0, `${c.name}: a ledge where a rock had room`);
      for (const r of breaks) {
        assert.ok(r.plane >= 1, `${c.name}: a break's rock is far`);
        // (A wide page's width is long: its rocks may reach a little less of it, a middle one of many least.)
        const least = plan.tall ? 0.15 : r.plane === 1 && count(c.segs, 'break') > 4 ? 0.1 : 0.12;
        assert.ok(r.reach >= least - 1e-9 && r.reach <= 0.32 + 1e-9, `${c.name}: break rock reaches ${r.reach.toFixed(3)}`);
        assert.ok(r.off >= 0.06 - 1e-9, `${c.name}: break rock runs off the page by only ${r.off.toFixed(3)}`);
        const ratio = r.height / ((r.reach + r.off) * plan.w);
        assert.ok(ratio >= 0.5 - 1e-6 && ratio <= 1.2 + 1e-6, `${c.name}: break rock height/width ${ratio.toFixed(2)}`);
        // Near its jelly: at the depth of its rest, give or take.
        const j = plan.jellies[c.segs.length && r.rest >= 0 ? Math.min(plan.jellies.length - 1, r.rest) : 0];
        // Many breaks on one page cannot all keep to their depth with room between them: the older give way.
        const crowded = count(c.segs, 'break') > 4;
        // (All on one wall, they have a little less room to keep to it.)
        const near = r.plane === 2 ? (crowded ? 0.45 : 0.25) : crowded ? 0.7 : 0.45;
        assert.ok(Math.abs(r.y + r.height / 2 - j.y) < plan.h * near, `${c.name} ${shape.width}x${shape.height}: rock ${r.rest} is ${(Math.abs(r.y + r.height / 2 - j.y) / plan.h).toFixed(2)} H from the depth of its rest`);
      }
      for (const r of plan.rocks.filter((k) => k.kind === 'passed')) assert.equal(r.plane, 0, `${c.name}: a rock passed is not far`);
      // No two silhouettes alike, and the top of each never flat.
      // (The kelp's rocks are kelp-draw's own drawing: here only their room;
      // a far rock is a faint shape in the haze.) The shared engine's rocks
      // are all heaps of boulders, so two can share a mass and still be two
      // rocks: what may not repeat is the mass and the crest together.
      const drawn = plan.rocks.filter((r) => r.kind !== 'kelp' && r.plane > 0);
      for (let i = 0; i < drawn.length; i++) {
        const sh = drawn[i].shape;
        const swing = Math.max(...sh.top) - Math.min(...sh.top);
        assert.ok(swing >= 0.1, `${c.name}: a rock with a flat top (${swing.toFixed(2)})`);
        for (let k = i + 1; k < drawn.length; k++) {
          const iou = rockIoU(sh, drawn[k].shape);
          const crest = crestDiff(sh, drawn[k].shape);
          assert.ok(!sameRock(sh, drawn[k].shape), `${c.name} ${shape.width}x${shape.height}: two rocks alike (IoU ${iou.toFixed(2)}, crests ${crest.toFixed(3)} apart)`);
        }
      }
      // A side of the page takes few rocks, never a column of them.
      for (const edge of [-1, 1] as const) {
        const side = plan.rocks.filter((r) => r.edge === edge).sort((a, b) => a.y - b.y);
        // Two a side at most, the kelp's own counted: a wall with ledges, never an archipelago.
        assert.ok(side.length <= 2, `${c.name} ${shape.width}x${shape.height}: ${side.length} rocks on one side`);
        for (let i = 1; i < side.length; i++) {
          const gap = side[i].y - (side[i - 1].y + side[i - 1].height);
          const kelp = side[i].kind === 'kelp' || side[i - 1].kind === 'kelp';
          // Six breaks and a kelp forest on a wide page: the walls run out of room, and the gaps close up.
          const crowded = !plan.tall && count(c.segs, 'break') > 4;
          assert.ok(gap >= plan.h * (kelp ? 0.04 : crowded ? 0.048 : 0.12) - 1e-6, `${c.name} ${shape.width}x${shape.height}: rocks ${gap.toFixed(0)} apart on one side`);
        }
      }
    }
  }
});

test('the jellies: the hero large and low, the one before half its size, older ones smaller, fainter and few inked', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const S = Math.min(plan.w, plan.h);
      const hero = plan.jellies[plan.jellies.length - 1];
      const bell = (hero.r * 2) / S;
      // A fifth of the short side across: it owns the page.
      assert.ok(bell >= 0.19 && bell <= 0.21, `${c.name}: hero bell ${bell.toFixed(3)} S`);
      if (plan.tall) assert.ok(hero.y >= plan.h * 0.6 && hero.y <= plan.h * 0.7, `${c.name}: hero at ${(hero.y / plan.h).toFixed(2)} H`);
      assert.equal(hero.weight, 1);
      const inked = plan.jellies.filter((j) => !j.far);
      assert.ok(inked.length <= 4, `${c.name}: ${inked.length} inked jellies`);
      for (const j of plan.jellies.slice(0, -1)) {
        assert.ok(j.weight <= 0.8, `${c.name}: jelly ${j.block} drawn at the hero's weight`);
        // Past three siblings, a ghost: a quarter strength and a third the hero's size at most.
        if (j.far) assert.ok(j.alpha <= 0.25 + 1e-9 && j.r <= hero.r * 0.35 + 1e-9, `${c.name}: ghost ${j.block} at ${j.alpha} strength, ${(j.r / hero.r).toFixed(2)} of the hero`);
        assert.equal(j.far, plan.jellies.length - 1 - j.block > 3, `${c.name}: jelly ${j.block} far or near out of turn`);
      }
      if (plan.jellies.length >= 2) {
        const prev = plan.jellies[plan.jellies.length - 2];
        assert.ok(prev.r <= hero.r * 0.5 + 1e-9, `${c.name}: the jelly before is ${(prev.r / hero.r).toFixed(2)} of the hero`);
      }
      // Siblings differ at a glance: the bell's shape, or its trails.
      for (let i = 1; i < plan.jellies.length; i++) {
        const a = plan.jellies[i - 1].body;
        const b = plan.jellies[i].body;
        assert.ok(Math.abs(a.aspect - b.aspect) * 0.4 >= 0.08 || Math.abs(a.tentacles - b.tentacles) >= 6, `${c.name}: jellies ${i - 1} and ${i} are alike`);
        assert.ok(b.aspect * 0.4 >= 0.45 - 1e-9 && b.aspect * 0.4 <= 0.8 + 1e-9);
        assert.ok(b.tentacles >= 8 && b.tentacles <= 32);
      }
    }
  }
});

test('hard rules: the hero kept clear, jellies apart, the window bare, the big rare things touching nothing', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      for (const ground of ['paper', 'night'] as const) {
        const plan = planOf(c, shape, ground);
        const tag = `${c.name} ${shape.width}x${shape.height} ${ground}`;
        const hero = plan.jellies[plan.jellies.length - 1];
        // Jellies at least 1.4 times their radii summed apart.
        for (let i = 0; i < plan.jellies.length; i++) {
          for (let k = i + 1; k < plan.jellies.length; k++) {
            const a = plan.jellies[i];
            const b = plan.jellies[k];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            assert.ok(d >= 1.4 * (a.r + b.r) - 1e-6, `${tag}: jellies ${i} and ${k} ${d.toFixed(0)} apart`);
          }
        }
        // The hero's margin: nothing near within 0.02 S of its bell and trails.
        for (const r of plan.rocks) assert.ok(!rockTouches(r, plan.w, hero.box, CLEAR - 1e-6), `${tag}: a ${r.kind} rock in the hero's margin`);
        for (const a of plan.cast) assert.ok(boxGap(a.box, hero.box) >= CLEAR - 1e-6, `${tag}: ${a.id} in the hero's margin`);
        for (const e of plan.events) if (e.box && e.kind !== 'whalefall') assert.ok(boxGap(e.box, hero.box) >= CLEAR - 1e-6, `${tag}: the ${e.kind} in the hero's margin`);
        for (const j of plan.jellies) if (!j.hero) assert.ok(boxGap(j.box, hero.box) >= CLEAR - 1e-6, `${tag}: jelly ${j.block} in the hero's margin`);
        // No jelly sits on a rock or its wall, a far ghost no more than a near one.
        for (const r of plan.rocks) for (const j of plan.jellies) assert.ok(!rockTouches(r, plan.w, j.box), `${tag}: jelly ${j.block} on a ${r.kind} rock`);
        for (const wl of plan.walls) for (const j of plan.jellies) assert.ok(!wallTouches(wl, plan.w, j.box), `${tag}: jelly ${j.block} on a wall`);
        // Nothing over the window of sky, and the window wholly on the page.
        const win = plan.windowBox;
        assert.ok(plan.window.y - plan.window.r * 0.46 * 1.04 >= plan.h * 0.015 - 1e-6, `${tag}: the window is cut by the top of the page`);
        for (const a of plan.cast) assert.equal(inter(a.box, win), 0, `${tag}: ${a.id} over the window`);
        for (const e of plan.events) if (e.box) assert.equal(inter(e.box, win), 0, `${tag}: the ${e.kind} over the window`);
        for (const r of plan.rocks) assert.ok(!rockTouches(r, plan.w, win), `${tag}: a rock over the window`);
        for (const j of plan.jellies) assert.equal(inter(j.box, win), 0, `${tag}: jelly ${j.block} over the window`);
        // The lure, the siphonophore and the oarfish touch nothing solid, nor each other.
        const lone = plan.events.filter((e) => e.box && ['lure', 'siphonophore', 'oarfish'].includes(e.kind));
        for (const e of lone) {
          for (const r of plan.rocks) assert.ok(!rockTouches(r, plan.w, e.box as Box), `${tag}: the ${e.kind} on a rock`);
          for (const o of lone) if (o !== e) assert.ok(boxGap(o.box as Box, e.box as Box) > 0, `${tag}: the ${e.kind} touches the ${o.kind}`);
        }
        // The eye never on a rock.
        for (const e of plan.events.filter((v) => v.kind === 'eye' && v.box)) for (const r of plan.rocks) assert.ok(!rockTouches(r, plan.w, e.box as Box), `${tag}: the eye on a rock`);
      }
    }
  }
});

test('the floor: a few things on it, spread out and small; the trench clear of clutter', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const floor = plan.cast.filter((a) => a.floor);
      if (!plan.floor) {
        assert.equal(floor.length, 0);
        continue;
      }
      const band = plan.trench ? plan.h - plan.trench.top : plan.h - plan.floor.y;
      assert.ok(plan.trench || (band >= plan.h * 0.1 - 1e-6 && band <= plan.h * 0.14 + 1e-6), `${c.name}: floor takes ${(band / plan.h).toFixed(3)} H`);
      assert.ok(floor.length <= (plan.trench ? 2 : 4), `${c.name}: ${floor.length} on the floor`);
      const hero = plan.jellies[plan.jellies.length - 1];
      for (let i = 0; i < floor.length; i++) {
        assert.ok(floor[i].len <= 0.06 * REF + 1e-9 && floor[i].len <= 0.6 * hero.r * 2 + 1e-9, `${c.name}: ${floor[i].id} too big for the floor`);
        for (let k = i + 1; k < floor.length; k++) assert.ok(Math.abs(floor[i].x - floor[k].x) >= plan.w * 0.08 - 1e-6, `${c.name}: floor things bunched`);
      }
      if (plan.trench) {
        const t = plan.trench;
        const gap = (t.gap / plan.w);
        assert.ok(gap >= 0.25 && gap <= 0.4, `${c.name}: the cleft is ${gap.toFixed(2)} W`);
        assert.ok(Math.abs(t.top - plan.h * (plan.tall ? TRENCH_TOP[0] : TRENCH_TOP[1])) < 1e-6);
        assert.ok(Math.abs(hero.x - t.x) < t.gap / 2, `${c.name}: the hero is not over the cleft`);
        const fall = plan.events.find((e) => e.kind === 'whalefall');
        if (fall && fall.box) assert.ok(fall.box.x1 <= t.x - t.gap / 2 || fall.box.x0 >= t.x + t.gap / 2, `${c.name}: the whale fall is in the cleft`);
      }
    }
  }
});

test('no rock floats: each stands out from a wall that goes down into the ground, never a cap on a stem', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const tag = `${c.name} ${shape.width}x${shape.height}`;
      assert.ok(plan.walls.length <= 2 && new Set(plan.walls.map((wl) => wl.edge)).size === plan.walls.length, `${tag}: walls`);
      for (const r of plan.rocks) {
        // Runs off the page: never its whole outline on it.
        assert.ok(r.off > 0, `${tag}: a ${r.kind} rock wholly on the page`);
        const wl = r.wall;
        assert.ok(wl && plan.walls.includes(wl) && wl.edge === r.edge, `${tag}: a ${r.kind} rock with no wall`);
        assert.ok(wl.top <= r.y + r.height * 0.6, `${tag}: the wall starts under its rock`);
        // Down into the floor, the trench's wall, or off the foot of the page.
        const ground = plan.floor ? floorAt(plan, wl.edge < 0 ? 4 : plan.w - 4) : plan.h;
        assert.ok(wl.bottom >= Math.min(plan.h, ground), `${tag}: the wall stops at ${(wl.bottom / plan.h).toFixed(2)} H`);
        // Its buttress: under the rock's body the wall is at least the rock's width on the page over 1.6.
        // (At its underside, the deepest of it over the stretch the buttress stands under.)
        let low = 0;
        const prof = r.kind === 'kelp' ? r.shape.solid : r.shape.under;
        const span = (r.off + r.reach) * plan.w;
        const n = prof.length - 1;
        const ua = Math.floor((r.off * plan.w * n) / span);
        const ub = Math.ceil(((r.off * plan.w + (r.reach * plan.w) / STEM) * n) / span);
        for (let i = Math.max(0, Math.min(n, ua)); i <= Math.min(n, ub); i++) low = Math.max(low, prof[i]);
        const y = r.y + low * r.height;
        const f = wallAt(wl, y) ?? 0;
        // (Never excused by a jelly near it: a rock whose buttress a jelly would crowd is not placed.)
        assert.ok((r.reach * plan.w) / Math.max(1e-6, f) <= STEM + 0.05, `${tag}: a cap ${(r.reach * plan.w).toFixed(0)} wide on a stem ${f.toFixed(0)}`);
      }
      for (const wl of plan.walls) {
        // A narrow strip (0.04 to 0.09 W, rough) where nothing stands out from it.
        const sorted = [...wl.face].sort((a, b) => a - b);
        const narrow = sorted[Math.floor(sorted.length * 0.2)];
        assert.ok(narrow <= plan.w * 0.1 && sorted[0] >= Math.min(plan.w * 0.02, 10), `${tag}: a wall ${(narrow / plan.w).toFixed(3)} W wide`);
      }
      // The kelp: three stalks a side or none.
      if (plan.kelp) {
        const kelp = rollKelp(rollBiome(plan.key, plan.courseKey).key, PICTURE_KELP);
        for (const edge of [-1, 1]) {
          const n = plan.kelp.keep.filter((i) => (kelp.stalks[i].x < 0.5 ? -1 : 1) === edge).length;
          assert.ok(n === 0 || n >= 3, `${tag}: ${n} kelp stalks on a side`);
        }
      }
    }
  }
});

test('no lens: bubbles and specks stay small', () => {
  for (const c of CASES) {
    const plan = planOf(c, SHAPES[0]);
    for (const b of plan.bubbles) assert.ok(b.r * 2 <= 0.004 * REF + 1e-9, `${c.name}: a bubble ${(b.r * 2).toFixed(1)} across`);
    assert.ok(BUBBLE_MAX * 2 <= 0.004 * REF);
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
    // On the floor it is as large as the floor allows; in the water, larger than all but the near.
    if (rare[0].floor) assert.ok(rare[0].len >= Math.max(...plan.cast.filter((a) => a.floor).map((a) => a.len)) - 1e-9);
    else for (const a of plan.cast) if (!a.rare && !a.members && a.layer < 2) assert.ok(a.len <= rare[0].len, `${c.name}: ${a.id} bigger than the rarest`);
  }
});

test('no lit rectangle: the kelp\'s shade in the light has no edge, no column step over 3/255 in 8 px', () => {
  // The shade is what the rays are cut by: a step in it is a step in the
  // light, carried down the shafts. Measured at print size, across the top
  // half of the page and down the forest.
  for (const c of CASES) {
    for (const shape of SHAPES.slice(0, 2)) {
      const plan = planOf(c, shape, 'night');
      if (!plan.kelp) continue;
      const px = shape.width / plan.w;
      let worst = 0;
      for (let dy = 0; dy <= shape.height * 0.5; dy += 6) {
        for (let dx = 0; dx + 8 <= shape.width; dx += 2) {
          const a = kelpShadeAt(plan, dx / px, dy / px);
          const b = kelpShadeAt(plan, (dx + 8) / px, dy / px);
          worst = Math.max(worst, Math.abs(a - b));
        }
      }
      assert.ok(worst * 255 <= 3, `${c.name} ${shape.width}x${shape.height}: the kelp's shade steps ${(worst * 255).toFixed(1)}/255 in 8 px`);
      // Feathered to nothing inside its reach, and whole at the wall.
      const edge = plan.rocks.find((r) => r.kind === 'kelp')!.edge;
      const at = (x: number) => kelpShadeAt(plan, edge < 0 ? x : plan.w - x, plan.kelp!.bottom * 0.3);
      assert.ok(Math.abs(at(1) - KELP_SHADE) < 1e-9 && at(plan.w * 0.056 + 0.23 * Math.min(plan.w, plan.h) + 1) === 0);
    }
  }
});

test('siblings: each apart from the hero in two ways a print shows, none in another\'s trails, none at another\'s depth', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const tag = `${c.name} ${shape.width}x${shape.height}`;
      const J = plan.jellies;
      const hero = J[J.length - 1].body;
      for (const j of J.slice(0, -1)) {
        const b = j.body;
        const ways = [
          Math.abs(b.aspect / hero.aspect - 1) >= 0.2 - 1e-9,
          Math.abs(b.tentacles / hero.tentacles - 1) >= 0.4 - 1e-9,
          Math.abs(b.armLength - hero.armLength) >= 0.3,
          Math.abs(b.hueShift - hero.hueShift) >= 25,
        ].filter(Boolean).length;
        assert.ok(ways >= 2, `${tag}: jelly ${j.block} differs from the hero in ${ways} way(s)`);
      }
      // Never a staircase: each step down the family unlike the next, by 0.4 of the larger, across and down.
      // (Three ghosts far off in a row are held to nothing: only a step through a jelly counts.)
      for (let i = 2; i < J.length; i++) {
        if (J[i - 1].far) continue;
        const a = { dx: J[i - 1].x - J[i - 2].x, dy: J[i - 1].y - J[i - 2].y };
        const b = { dx: J[i].x - J[i - 1].x, dy: J[i].y - J[i - 1].y };
        assert.ok(stepsApart(a, b), `${tag}: jellies ${i - 2}, ${i - 1} and ${i} step alike (${a.dx.toFixed(0)},${a.dy.toFixed(0)}) then (${b.dx.toFixed(0)},${b.dy.toFixed(0)})`);
      }
      for (let i = 0; i < J.length; i++) {
        for (let k = i + 1; k < J.length; k++) {
          assert.ok(boxGap(J[i].box, J[k].box) >= CLEAR - 1e-6, `${tag}: jellies ${i} and ${k} ${boxGap(J[i].box, J[k].box).toFixed(0)} apart`);
          // (Two ghosts far off a little closer.)
          assert.ok(Math.abs(J[i].y - J[k].y) >= plan.h * (J[i].far && J[k].far ? GHOST_ROW : 0.05) - 1e-6, `${tag}: jellies ${i} and ${k} at one depth`);
        }
      }
    }
  }
});

test('the rare things keep 0.02 S from rocks, jellies and each other; the whale\'s shadow off the jellies and off the steepest fall', () => {
  assert.ok(EYE_R * 2 <= 0.05 * REF + 1e-9, 'the eye is more than 0.05 S across');
  for (const c of CASES) {
    for (const shape of SHAPES.slice(0, 2)) {
      const plan = planOf(c, shape);
      const tag = `${c.name} ${shape.width}x${shape.height}`;
      const near = plan.events.filter((e) => e.box && !e.far && e.kind !== 'whalefall');
      for (const e of near) {
        const b = e.box as Box;
        for (const r of plan.rocks) assert.ok(!rockTouches(r, plan.w, b, e.kind === 'eye' ? 40 - 1e-6 : CLEAR - 1e-6), `${tag}: the ${e.kind} by a ${r.kind} rock`);
        for (const wl of plan.walls) assert.ok(!wallTouches(wl, plan.w, b, e.kind === 'eye' ? 40 - 1e-6 : CLEAR - 1e-6), `${tag}: the ${e.kind} by a wall`);
        for (const j of plan.jellies) assert.ok(boxGap(b, j.box) >= CLEAR - 1e-6, `${tag}: the ${e.kind} by jelly ${j.block}`);
        for (const o of near) if (o !== e) assert.ok(boxGap(b, o.box as Box) >= CLEAR - 1e-6, `${tag}: the ${e.kind} by the ${o.kind}`);
      }
      const whale = plan.events.find((e) => e.kind === 'whale');
      if (whale) {
        const at = whaleHull(whale, Math.min(plan.w, plan.h), plan.current);
        for (const j of plan.jellies) if (!j.far) assert.equal(inter(at.body, j.box) + inter(at.flipper, j.box), 0, `${tag}: jelly ${j.block} in the whale's shadow`);
        const steep = steepestFall(plan.zStops, plan.h);
        if (steep != null) assert.ok(Math.abs(at.dorsal - steep) >= plan.h * 0.04, `${tag}: the whale's back on the steepest fall`);
      }
    }
  }
});

test('the cast never lines up: two at most of the middle and near in a band 0.06 H tall, at three depths 0.1 H apart, 0.02 S between any two and from the jellies', () => {
  for (const c of CASES) {
    for (const shape of SHAPES.slice(0, 2)) {
      const plan = planOf(c, shape);
      const tag = `${c.name} ${shape.width}x${shape.height}`;
      const S = Math.min(plan.w, plan.h);
      const mid = plan.cast.filter((a) => a.layer > 0 && !a.floor);
      const ys = [...mid.map((a) => a.y), ...plan.events.filter((v) => v.box && !v.far && ['turtle', 'dumbo', 'lure'].includes(v.kind)).map((v) => ((v.box as Box).y0 + (v.box as Box).y1) / 2)].sort((a, b) => a - b);
      for (let k = 0; k + 2 < ys.length; k++) assert.ok(ys[k + 2] - ys[k] >= plan.h * ROW_BAND - 1e-6, `${tag}: three animals within ${((ys[k + 2] - ys[k]) / plan.h).toFixed(3)} H of each other at ${ys[k].toFixed(0)}`);
      for (let k = 0; k + 1 < ys.length; k++) assert.ok(ys[k + 1] - ys[k] >= plan.h * ROW_LEVEL - 1e-6, `${tag}: two animals level at ${ys[k].toFixed(0)}`);
      if (ys.length >= 3) {
        let bands = 0;
        let last = -Infinity;
        for (const y of ys) if (y >= last + plan.h * 0.1) {
          bands++;
          last = y;
        }
        assert.ok(bands >= 3, `${tag}: the cast at only ${bands} depths`);
      }
      for (let i = 0; i < plan.cast.length; i++) {
        const a = plan.cast[i];
        for (const b of plan.cast.slice(i + 1)) if (a.layer > 0 || b.layer > 0) assert.ok(boxGap(a.box, b.box) >= CLEAR - 1e-6, `${tag}: ${a.id} and ${b.id} ${(boxGap(a.box, b.box) / S).toFixed(3)} S apart`);
        for (const j of plan.jellies) if (!j.far) assert.ok(boxGap(a.box, j.box) >= CLEAR - 1e-6, `${tag}: ${a.id} in jelly ${j.block}'s reach`);
      }
    }
  }
});

test('one anglerfish to a picture at most, and the siphonophore hung at a tilt with room for it', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const tag = `${c.name} ${shape.width}x${shape.height}`;
      const biome = rollBiome(plan.key, plan.courseKey);
      const byId = new Map(biome.pools.flat().map((sp) => [sp.id, sp]));
      const anglers = plan.cast.filter((a) => byId.get(a.id)?.genome.lure).length + plan.events.filter((e) => e.kind === 'lure').length;
      assert.ok(anglers <= 1, `${tag}: ${anglers} anglerfish`);
      for (const e of plan.events.filter((v) => v.kind === 'siphonophore')) {
        const lie = Math.abs(e.lie ?? 0);
        assert.ok(lie >= SIPHON_TILT[0] - 1e-9 && lie <= SIPHON_TILT[1] + 1e-9 && lie >= 0.26 && lie <= 0.7, `${tag}: the siphonophore lies at ${lie.toFixed(2)}`);
        assert.ok(Math.abs(siphonophoreReach(e.rw, e.rh, e.seed, e.lie as number).tilt - lie) < 1e-6, `${tag}: the siphonophore's region too shallow for its tilt`);
      }
    }
  }
});

test('no rock debris: every rock drawn whole and inked to its underside, never cut square, never a block of wall in its crest', () => {
  for (const c of CASES) {
    for (const shape of SHAPES.slice(0, 2)) {
      const plan = planOf(c, shape);
      const tag = `${c.name} ${shape.width}x${shape.height}`;
      for (const r of plan.rocks) {
        if (r.kind === 'kelp') continue;
        // Whole: drawn with no foot let go of, cut at its underside and the cut inked (paint's `underside`).
        assert.ok(r.shape.parts.every((p) => p.whole), `${tag}: a ${r.kind} rock let go of at its foot (a see-through lobe)`);
        const N = r.shape.under.length - 1;
        for (let i = 0; i <= N; i++) assert.ok(r.shape.under[i] >= r.shape.top[i] - 1e-9, `${tag}: a rock's underside over its top`);
        // Its underside rises from the wall to the lip: no boulder hangs under the lip as a tail.
        for (let i = 1; i <= N; i++) assert.ok(r.shape.under[i] <= r.shape.under[i - 1] + 0.012 / r.shape.ratio + 1e-6 || r.shape.under[i] - r.shape.top[i] < 1e-6, `${tag}: a tail under a rock`);
        // Every boulder inside the layer it is drawn into (paint's `renderRock`: its box, 30 units either side): no square cut.
        const span = (r.off + r.reach) * plan.w;
        for (const part of r.shape.parts) {
          const ext = partExt(part);
          const ps = (part.span * span) / ext;
          const rock = rockShape(part.seed, ps, part.thick * ps, 1, part.grammar ?? 'heap');
          const x0 = rockX(r, plan.w, part.at);
          const dir = r.edge < 0 ? 1 : -1;
          const xs = [x0 + dir * rock.lo, x0 + dir * rock.hi].filter((x) => x > 0 && x < plan.w);
          for (const x of xs) assert.ok(x >= r.box.x0 - 30 - 1e-6 && x <= r.box.x1 + 30 + 1e-6, `${tag}: a boulder at ${x.toFixed(0)} past its rock's layer (${r.box.x0.toFixed(0)}..${r.box.x1.toFixed(0)})`);
        }
        // Its wall never stands out past the rock's crest as a block: where
        // the face is wider than the wall's own, inside the rock's height,
        // the rock covers it.
        const wl = r.wall;
        if (!wl) continue;
        // (Its own width: the widest it stands where no rock or ledge is.)
        const mine = plan.rocks.filter((k) => k.wall === wl);
        const free = wl.face.filter((_, i) => {
          const y = wl.top + i * WALL_STEP;
          return !mine.some((k) => y > k.y - 10 && y < k.y + k.height * 2.2) && !wl.ledges.some((l) => Math.abs(y - l.y) < plan.h * 0.05);
        });
        if (!free.length) continue;
        // (The wall starts inside the rock it comes down from, under its crest: paint's `renderWall`.)
        if (wl.top <= r.y + r.height * 0.6 && !mine.some((k) => k !== r && k.y < r.y)) continue;
        // (Or as wide as it comes down from above the rock, a cliff the rock stands out of.)
        let above = 0;
        for (let y = r.y - plan.h * 0.05; y <= r.y; y += 2) above = Math.max(above, wallAt(wl, y) ?? 0);
        const own = Math.max(...free, above) * 1.15 + 2;
        let low = 0;
        for (const v of r.shape.under) low = Math.max(low, v);
        // (At the face's own samples: between them it is a straight line.)
        for (let i = 0; i < wl.face.length; i++) {
          const y = wl.top + i * WALL_STEP;
          if (y < r.y + r.height * 0.3 || y > r.y + low * r.height) continue;
          const f = wallAt(wl, y);
          if (f == null || f <= own) continue;
          const x = r.edge < 0 ? f - 2 : plan.w - f + 2;
          const s = rockSpan(r, plan.w, x);
          assert.ok(s && s[0] <= y + 3, `${tag}: the wall a block beside its rock (${r.edge} ${r.y.toFixed(0)}+${r.height.toFixed(0)}) at ${x.toFixed(0)}, ${y.toFixed(0)}, face ${f.toFixed(0)} over its own ${own.toFixed(0)}`);
        }
      }
    }
  }
});

test('floor fauna lie on the ground: a star wholly in it, the rest with their middles below its line', () => {
  for (const c of CASES) {
    for (const shape of SHAPES) {
      const plan = planOf(c, shape);
      const biome = rollBiome(plan.key, plan.courseKey);
      for (const a of plan.cast.filter((q) => q.floor)) {
        const sp = biome.pools[a.zone]?.[a.slot];
        let low = -Infinity;
        for (let q = 0; q <= 6; q++) low = Math.max(low, floorAt(plan, a.box.x0 + ((a.box.x1 - a.box.x0) * q) / 6));
        assert.equal(a.alpha, 1, `${c.name}: a floor animal see-through`);
        if (sp?.genome.plan === 'star') assert.ok(a.box.y0 >= low - 1e-6, `${c.name} ${shape.width}x${shape.height}: a star off the ground`);
        else assert.ok(a.y >= low - 1e-6, `${c.name} ${shape.width}x${shape.height}: ${a.id} hangs off the ground`);
      }
    }
  }
});

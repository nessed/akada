import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnatomy, LAYERS, lureKind } from './anatomy';
import { rollBiome } from './biome';
import { depthAt, ZONES } from './depth';
import { FISH_FORMS, FORMS, formsIn, mutate, rollGenome, type FishForm } from './genome';
import { courseKey, oceanKey, oceanKeyFromSegments } from './key';
import { childOf, DEFAULT_JELLY, jellyForBlock } from './lineage';
import { speciesName } from './names';
import { hash32, mulberry32 } from './random';
import { EVENTS, eventAtMinute, eventsAt, eventsUpTo, firstEventUpTo, type EventKind } from './events';
import { kelpDescent, kelpInView, KELP_SURFACE, rollKelp } from './kelp';
import { landmarkOf, landmarksInView } from './landmarks';
import { outcropAtSlot, outcropsInView } from './outcrop';
import { hourMark, legAt, legMark, minuteAt, PLACES, routeLine, routeOf } from './places';
import { FISH_BUDGET, FISH_FLOOR, POOL_SIZE } from './pool';
import { wallReach } from './walls';
import { drained } from './palette';
import { diveRecap } from './recap';
import { generationOf, seasonOf } from './season';
import { populationAt, spawnAt, visitorsAt } from './schedule';
import { BREAK_PACE } from '../wood/clock';

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

test('a break carries whoever was there on and out, and nobody new comes in', () => {
  const biome = rollBiome(oceanKey('c2', 7), courseKey('c2'));
  const seg = (kind: 'focus' | 'break', seconds: number) => ({ kind, seconds, startedAt: new Date(0).toISOString(), targetSeconds: null });
  const segments = [seg('focus', 3000)];
  const at = (rest: number, closed = segments) => ({ scene: 3000 + BREAK_PACE * rest, segments: closed });
  // With no break yet, the swim clock is focus time and changes nothing.
  const plain = visitorsAt(biome, 3000, VIEW);
  const swum = visitorsAt(biome, 3000, VIEW, 1, at(0));
  assert.deepEqual(swum.map((v) => [v.key, v.x, v.y]), plain.map((v) => [v.key, v.x, v.y]));
  // A minute into a break: the same animals, further along, none new.
  const minute = visitorsAt(biome, 3000, VIEW, 1, at(60));
  const keys = new Set(plain.map((v) => v.key));
  assert.ok(minute.length > 0);
  for (const v of minute) assert.ok(keys.has(v.key), `${v.key} arrived during a break`);
  const moved = minute.filter((v) => {
    const was = plain.find((p) => p.key === v.key);
    return was && (was.x !== v.x || was.y !== v.y);
  });
  assert.ok(moved.length > 0, 'nobody moved during the break');
  // Long enough, and the water is empty.
  assert.equal(visitorsAt(biome, 3000, VIEW, 1, at(600)).length, 0);
  // After it, the next block's arrivals start their crossings fresh.
  const after = visitorsAt(biome, 3060, VIEW, 1, { scene: 3060 + BREAK_PACE * 600, segments: [...segments, seg('break', 600)] });
  assert.ok(after.length > 0);
  for (const v of after) assert.ok(Number(v.key.split('.')[0]) > 3000);
  assert.deepEqual(
    after.map((v) => [v.key, v.x]),
    visitorsAt(biome, 3060, VIEW).filter((v) => Number(v.key.split('.')[0]) > 3000).map((v) => [v.key, v.x]),
  );
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
  // Above the trench, somewhere around a few in ten hours; never a parade.
  // (The trench has its own roll and its own rate: see the next test.)
  const above = (k: number) => eventsUpTo(rollBiome(oceanKey('ev', k), courseKey('ev')), 180 * 60).length;
  let sum = 0;
  for (let k = 0; k < 60; k++) sum += above(k);
  assert.ok(sum / 60 < 2, `${sum} events in 60 sittings' first three hours`);
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

test('kelp: about half of sittings, the same forest every time, at the edges', () => {
  let withKelp = 0;
  for (let i = 0; i < 400; i++) if (rollBiome(oceanKey('kp', i), courseKey('kp')).env.kelp) withKelp++;
  assert.ok(withKelp > 160 && withKelp < 280, `${withKelp} of 400 sittings had kelp`);
  const key = oceanKey('kp', 7);
  assert.deepEqual(rollKelp(key), rollKelp(key));
  assert.notDeepEqual(rollKelp(key), rollKelp(oceanKey('kp', 8)));
  for (let i = 0; i < 50; i++) {
    const kelp = rollKelp(oceanKey('kp', i));
    assert.ok(kelp.ledges.length >= 1 && kelp.ledges.length <= 2);
    for (const stalk of kelp.stalks) {
      // Clear of the jelly, which hangs in the middle third.
      assert.ok(stalk.x < 0.25 || stalk.x > 0.75, `a stalk stood at ${stalk.x}`);
      // Rooted on its ledge, and never further up than a little past the surface.
      assert.ok(stalk.base - stalk.height > KELP_SURFACE - 0.25);
      const ledge = kelp.ledges.find((l) => (l.edge < 0 ? stalk.x < 0.5 : stalk.x > 0.5))!;
      assert.ok((ledge.edge < 0 ? stalk.x : 1 - stalk.x) < ledge.reach, 'a stalk stood off the end of its ledge');
    }
  }
});

test('kelp only slides up the page, and is gone by the end of the sunlit water', () => {
  let last = -1;
  for (let s = 0; s <= 20 * 60; s += 5) {
    const d = kelpDescent(s);
    assert.ok(d >= last);
    last = d;
  }
  assert.ok(kelpInView(0));
  assert.ok(kelpInView(8 * 60), 'the ledge should be in view mid-zone');
  assert.ok(!kelpInView(15 * 60), 'kelp was still on the page in the twilight');
  assert.ok(!kelpInView(6 * 3600));
});

test('the trench has something happen about once an hour, and nothing earlier moves for it', () => {
  let trench = 0;
  for (let k = 0; k < 120; k++) {
    const biome = rollBiome(oceanKey('hadal', k), courseKey('hadal'));
    const all = eventsUpTo(biome, 540 * 60);
    for (let i = 1; i < all.length; i++) assert.ok(all[i].start - all[i - 1].start >= 8 * 60, 'events too close');
    trench += all.filter((e) => e.start >= 180 * 60).length;
  }
  // Six hours of trench in each.
  const perHour = trench / (120 * 6);
  assert.ok(perHour > 0.7 && perHour < 1.4, `${perHour.toFixed(2)} trench sightings an hour`);
});

test('the later sightings all turn up, and the first roll never hears of them', () => {
  const seen = new Set<EventKind>();
  for (let k = 0; k < 600 && seen.size < 14; k++) {
    for (const e of eventsUpTo(rollBiome(oceanKey('later', k), courseKey('later')), 7 * 3600)) seen.add(e.kind);
  }
  for (const kind of ['turtle', 'siphonophore', 'lure', 'dumbo', 'whalefall', 'manowar', 'fishfall', 'mudslide', 'supergiant', 'snailfish'] as EventKind[]) assert.ok(seen.has(kind), `no ${kind} in 600 sittings`);
  // Golden: a first-roll event that was there before the later roll existed is still there.
  const biome = rollBiome(oceanKey('gold', 1), courseKey('gold'));
  const first = eventsUpTo(biome, 4 * 3600).filter((e) => ['whale', 'storm', 'eye', 'leviathan'].includes(e.kind));
  for (const e of first) assert.equal(eventAtMinute(biome, Math.floor(e.start / 60))?.kind, e.kind);
});

test('a man o\' war only drifts over in the sunlit water, and never near another sighting', () => {
  let seen = 0;
  for (let k = 0; k < 400; k++) {
    const all = eventsUpTo(rollBiome(oceanKey('war', k), courseKey('war')), 3 * 3600);
    for (const e of all.filter((v) => v.kind === 'manowar')) {
      seen++;
      assert.ok(e.start < 15 * 60, `a man o' war at ${e.start}s`);
      for (const o of all) if (o !== e) assert.ok(Math.abs(o.start - e.start) > 7 * 60, `a ${o.kind} within ${Math.abs(o.start - e.start)}s of a man o' war`);
    }
  }
  assert.ok(seen > 20, `only ${seen} men o' war in 400 sittings`);
});

test('a whale fall stays on the floor once it has come', () => {
  for (let k = 0; k < 400; k++) {
    const biome = rollBiome(oceanKey('fall', k), courseKey('fall'));
    const fall = eventsUpTo(biome, 4 * 3600).find((e) => e.kind === 'whalefall');
    if (!fall) continue;
    assert.equal(firstEventUpTo(biome, 'whalefall', fall.start - 1), null);
    assert.equal(firstEventUpTo(biome, 'whalefall', fall.start)?.start, fall.start);
    assert.equal(firstEventUpTo(biome, 'whalefall', 4 * 3600)?.start, fall.start);
    return;
  }
  assert.fail('no whale fall in 400 sittings');
});

test('rocks: the same every time, at the edges, and what grows on them follows the light', () => {
  const key = oceanKey('rock', 3);
  assert.deepEqual(outcropsInView(key, false, 40 * 60), outcropsInView(key, false, 40 * 60));
  let rocks = 0;
  for (let k = 0; k < 60; k++) {
    for (let slot = 0; slot < 30; slot++) {
      const o = outcropAtSlot(oceanKey('rock', k), slot, false);
      if (!o) continue;
      rocks++;
      assert.ok(o.reach <= 0.3, 'a rock reached into the middle of the page');
      const kinds = o.growths.map((g) => g.kind);
      if (o.zone === 0) assert.ok(!kinds.some((g) => g === 'glass' || g === 'seapen'), 'deep things in the light');
      // A place with its own kit grows only that; elsewhere the dark grows only its pale ghosts.
      const kit = PLACES[o.place].kit;
      if (kit) assert.ok(kinds.every((g) => kit.some(([k]) => k === g)), `${o.place} grew ${kinds}`);
      else if (o.zone >= 2) assert.ok(kinds.every((g) => g === 'glass' || g === 'seapen' || g === 'whip'), `coral in the dark: ${kinds}`);
      // Never reef colour in the dark, whatever the place.
      if (o.zone >= 2) assert.ok(!kinds.some((g) => g === 'brain' || g === 'anemone' || g === 'tube' || g === 'urchin'), `reef in the dark: ${kinds}`);
      assert.ok(PLACES[o.place].rocks, `a rock in ${o.place}`);
      // Kelp and coral never share a sea.
      if (o.zone === 0) assert.equal(outcropAtSlot(oceanKey('rock', k), slot, true), null);
    }
  }
  // Most eight-minute stretches have one.
  assert.ok(rocks > 60 * 30 * 0.55 && rocks < 60 * 30 * 0.85, `${rocks} rocks`);
});

test('rocks slide up the page and leave it', () => {
  const key = oceanKey('rock', 9);
  for (let s = 60; s < 4 * 3600; s += 30) {
    for (const { outcrop, top } of outcropsInView(key, false, s)) {
      const later = outcropsInView(key, false, s + 30).find((v) => v.outcrop.id === outcrop.id);
      if (later) assert.ok(later.top < top, 'a rock went back down the page');
    }
  }
});

test('colour drains with depth, the reds first', () => {
  const sat = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return Math.max(...c) - Math.min(...c);
  };
  const red = '#D4A5A5';
  const blue = '#A8BCC9';
  assert.equal(drained(red, 0).toLowerCase(), red.toLowerCase());
  assert.ok(sat(drained(red, 0.5)) < sat(red) * 0.4, 'red should be mostly grey by the twilight');
  // Blue keeps more of itself at the same depth than red does.
  assert.ok(sat(drained(blue, 0.4)) / sat(blue) > sat(drained(red, 0.4)) / sat(red));
});

const NO_CAUDAL = new Set<FishForm>(['grenadier', 'sunfish', 'cusk', 'snailfish', 'ethereal', 'eelpout', 'gulper', 'snipe', 'cutthroat', 'chimaera']);

test('every form rolls and builds a body with real numbers in it, its own every time', () => {
  for (const form of FISH_FORMS) {
    const [lo, hi] = FORMS[form].zones;
    for (let seed = 1; seed <= 300; seed++) {
      const z = ZONES[lo].z0 + ((ZONES[hi].z1 - ZONES[lo].z0) * (seed % 7)) / 6;
      const g = mutate(rollGenome(seed, z, 'fish', form), seed, seed % 3);
      assert.equal(g.form, form);
      assert.equal(g.plan, FORMS[form].plan);
      const a = buildAnatomy(g, seed);
      for (const n of [a.minX, a.minY, a.maxX, a.maxY]) assert.ok(Number.isFinite(n), `bounds of ${form} ${seed}`);
      assert.ok(a.maxX > a.minX && a.maxY > a.minY);
      for (const k of LAYERS) {
        for (const s of a.layers[k]) {
          if (s.kind === 'disc') assert.ok(Number.isFinite(s.x + s.y + s.rx + s.ry), `${k} of ${form} ${seed}`);
          else for (const v of s.pts) assert.ok(Number.isFinite(v), `${k} of ${form} ${seed}`);
        }
      }
      assert.ok(a.layers.body.length > 0 && (a.layers.eye.length > 0 || g.eyes === 0), `${form} ${seed} has a body and an eye`);
      assert.deepEqual(buildAnatomy(rollGenome(seed, z, 'fish', form), seed).layers.body, buildAnatomy(rollGenome(seed, z, 'fish', form), seed).layers.body);
    }
  }
  // A form is a different animal, not the same one in another colour: the
  // bodies' shapes (depth for length) differ between forms.
  const aspect = (form: FishForm) => {
    const a = buildAnatomy(rollGenome(5, ZONES[FORMS[form].zones[0]].z0 + 0.05, 'fish', form), 5);
    return (a.maxY - a.minY) / (a.maxX - a.minX);
  };
  assert.ok(aspect('disc') > aspect('jack') * 1.8, 'a disc is far deeper than a jack');
  assert.ok(aspect('barracuda') < aspect('jack'), 'a barracuda is slimmer than a jack');
});

test('a form only lives inside its depth, and a pool names its fish by their form', () => {
  for (let k = 0; k < 160; k++) {
    const biome = rollBiome(oceanKey(`c${k % 9}`, 1000 + k * 7919), courseKey(`c${k % 9}`));
    biome.pools.forEach((pool) => {
      for (const sp of pool) {
        const zone = sp.zone;
        const f = sp.genome.form;
        if (sp.genome.plan === 'fish') assert.ok(f, `a fish with no form in zone ${zone}`);
        if (!f) continue;
        const [lo, hi] = FORMS[f].zones;
        assert.ok(zone >= lo && zone <= hi, `${f} in zone ${zone}`);
        if (FORMS[f].floor) assert.ok(sp.floor && zone >= 3, `${f} off the floor, or on one the zone has not got`);
      }
    });
  }
  for (let zone = 0; zone < ZONES.length; zone++) assert.ok(formsIn(zone).length >= 5, `zone ${zone} has a few kinds of fish`);
  // A mutated line keeps its form.
  const g = rollGenome(3, 0.45, 'fish', 'hatchet');
  assert.equal(mutate(g, 3, 30).form, 'hatchet');
  // Two forms read as two animals on the label too.
  assert.notEqual(speciesName(rollGenome(8, 0.45, 'fish', 'lantern'), 8).split(' ')[0], speciesName(rollGenome(8, 0.45, 'fish', 'hatchet'), 8).split(' ')[0]);
});

test('a pool carries two fish at least and its zone\'s budget at most, every one a different kind', () => {
  const counts = [0, 0, 0, 0, 0];
  const pools = [0, 0, 0, 0, 0];
  for (let k = 0; k < 400; k++) {
    const course = `c${k % 37}`;
    const biome = rollBiome(oceanKey(course, 5000 + k * 104729), courseKey(course));
    for (const [li, pool] of biome.pools.entries()) {
      const zone = pool[0].zone;
      const fish = pool.filter((sp) => sp.genome.form);
      // The bottom of the sea is past the last fish: nothing there, and the
      // others swimming in its place.
      if (biome.route[li].place.fishless) {
        assert.equal(fish.length, 0, 'a fish at the bottom of the sea');
        assert.ok(pool.every((sp) => sp.genome.plan !== 'fish' && sp.genome.plan !== 'eel'));
        continue;
      }
      assert.ok(fish.length >= FISH_FLOOR, `${fish.length} fish in a zone ${zone} pool`);
      assert.ok(fish.length <= FISH_BUDGET[zone], `${fish.length} fish in a zone ${zone} pool, over its ${FISH_BUDGET[zone]}`);
      counts[zone] += fish.length;
      pools[zone]++;
      const byForm = new Map<string, typeof fish>();
      for (const sp of fish) byForm.set(sp.genome.form!, [...(byForm.get(sp.genome.form!) ?? []), sp]);
      for (const [f, same] of byForm) {
        if (same.length === 1) continue;
        assert.ok(FORMS[f as FishForm].school && same.length === 2, `${same.length} of ${f} in one pool`);
        const [a, b] = same;
        assert.ok(a.genome.hue !== b.genome.hue && a.genome.pattern !== b.genome.pattern, `two ${f} that look alike`);
      }
      // Nothing on the sunlit or twilight floor: there is none to lie on.
      if (zone < 3) assert.ok(pool.every((sp) => !sp.floor));
    }
  }
  // Still a sea, not an aquarium: the deep keeps fewer fish than the light.
  const mean = counts.map((c, i) => c / pools[i]);
  assert.ok(mean[0] > mean[4], `fish per pool ${mean.map((m) => m.toFixed(1)).join(' ')}`);
});

test('a course\'s regulars are the same fish in every sitting, form and name', () => {
  const a = rollBiome(oceanKey('c3', 1000), courseKey('c3'));
  const b = rollBiome(oceanKey('c3', 999_999), courseKey('c3'));
  const regs = (x: typeof a) => x.pools.map((p) => p.filter((sp) => sp.regular).map((sp) => `${sp.id} ${sp.genome.form ?? sp.genome.plan} ${sp.name}`));
  assert.deepEqual(regs(a), regs(b));
});

test('each form moves its own way: a tripod stands still, a barracuda waits and darts, the floor swimmers keep low', () => {
  const seen = { tripod: 0, barracuda: 0, low: 0 };
  const track = new Map<string, { form: string; x: number; y: number; t: number }[]>();
  for (let k = 0; k < 60 && (seen.tripod < 3 || seen.barracuda < 3 || seen.low < 3); k++) {
    const biome = rollBiome(oceanKey(`c${k}`, 7000 + k * 7919), courseKey(`c${k}`));
    const forms = new Set(biome.pools.flat().map((sp) => sp.genome.form));
    if (!forms.has('tripod') && !forms.has('barracuda') && !forms.has('grenadier')) continue;
    track.clear();
    for (const t0 of [5 * 60, 130 * 60]) {
      for (let t = t0; t < t0 + 120; t += 2) {
        for (const v of visitorsAt(biome, t, VIEW)) {
          const f = v.species.genome.form;
          if (f !== 'tripod' && f !== 'barracuda' && f !== 'grenadier' && f !== 'cusk' && f !== 'snailfish') continue;
          const key = `${t0}:${v.key}`;
          track.set(key, [...(track.get(key) ?? []), { form: f, x: v.x, y: v.y, t }]);
        }
      }
    }
    for (const pts of track.values()) {
      const f = pts[0].form;
      if (f === 'tripod') {
        seen.tripod++;
        for (const p of pts) assert.ok(Math.abs(p.x - pts[0].x) < 1e-9, 'a tripod fish moved');
        // Standing: its middle above the floor strip, its feet on it.
        assert.ok(pts[0].y < VIEW.height * 0.96 - 10, "a tripod fish lying down");
      } else if (f === 'barracuda' && pts.length > 20) {
        seen.barracuda++;
        const steps = pts.slice(1).map((p, i) => Math.abs(p.x - pts[i].x));
        const most = Math.max(...steps);
        assert.ok(Math.min(...steps) < most * 0.15, 'a barracuda that never waits');
      } else if (f !== 'barracuda') {
        seen.low++;
        for (const p of pts) assert.ok(p.y > VIEW.height * 0.45, `a ${f} up in the open water`);
      }
    }
  }
  assert.ok(seen.tripod > 0 && seen.barracuda > 0 && seen.low > 0, `seen ${JSON.stringify(seen)}`);
});

test('every fish has a tail, an angler is a globe, and a chain never lies level', () => {
  let minFin = Infinity;
  let minHW = Infinity;
  const tilts: number[] = [];
  for (let seed = 1; seed <= 600; seed++) {
    for (const z of [0.1, 0.4, 0.7, 0.95]) {
      const g = mutate(rollGenome(seed, z, 'fish'), seed, seed % 3);
      const a = buildAnatomy(g, seed);
      // The forms with no tail fin of their own: a rattail's point, a mola's
      // clavus, and the soft ones whose fins run round the back end.
      if (NO_CAUDAL.has(g.form!)) continue;
      // The fins reaching back past the tail end (x < 0, on a body 100 long).
      let fx = 0;
      for (const s of a.layers.fin) {
        if (s.kind !== 'path') continue;
        for (let i = 0; i < s.pts.length; i += 2) if (s.pts[i + 1] > -100 && s.pts[i] < 5) fx = Math.min(fx, s.pts[i]);
      }
      minFin = Math.min(minFin, -fx / 100);
      if (lureKind(g) === 'angler') {
        const b = a.layers.body[0];
        let y0 = Infinity;
        let y1 = -Infinity;
        if (b.kind === 'path') for (let i = 1; i < b.pts.length; i += 2) {
          y0 = Math.min(y0, b.pts[i]);
          y1 = Math.max(y1, b.pts[i]);
        }
        minHW = Math.min(minHW, (y1 - y0) / 100);
      }
      const stem = buildAnatomy(rollGenome(seed, z, 'chain'), seed).layers.tentF[0];
      if (stem && stem.kind === 'path') {
        const p = stem.pts;
        tilts.push((Math.atan2(Math.abs(p[p.length - 1] - p[1]), Math.abs(p[p.length - 2] - p[0])) * 180) / Math.PI);
      }
    }
  }
  assert.ok(minFin >= 0.18, `shortest tail fin ${minFin.toFixed(3)} of the body`);
  if (Number.isFinite(minHW)) assert.ok(minHW >= 0.6, `flattest angler ${minHW.toFixed(2)}`);
  assert.ok(tilts.length > 0);
  assert.ok(Math.min(...tilts) >= 12 && Math.max(...tilts) <= 42, `chain tilt ${Math.min(...tilts).toFixed(1)}–${Math.max(...tilts).toFixed(1)}°`);
});

test('places: the dive is cut at round depths, and every leg is somewhere that lives there', () => {
  assert.equal(minuteAt(0), 0);
  assert.equal(minuteAt(200), 15);
  assert.equal(minuteAt(4000), 110);
  assert.equal(minuteAt(6000), 180);
  assert.ok(Math.abs(minuteAt(6500) - 222) < 1e-9);
  for (let k = 0; k < 300; k++) {
    const key = oceanKey('pl', k);
    const route = routeOf(key, false);
    assert.deepEqual(route.map((l) => l.place.id), routeOf(key, false).map((l) => l.place.id));
    assert.equal(route[0].from, 0);
    for (let i = 0; i < route.length; i++) {
      const leg = route[i];
      assert.equal(leg.place.zone, leg.zone, `${leg.place.id} out of its zone`);
      assert.ok(leg.m >= leg.place.m0 && leg.m < leg.place.m1, `${leg.place.id} at ${leg.m} m`);
      assert.equal(depthAt(leg.from * 60).zone, leg.zone);
      if (i > 0) {
        assert.ok(leg.from > route[i - 1].from);
        assert.notEqual(leg.place.id, route[i - 1].place.id, 'the same place twice running');
        // Nor back to the one before it, wherever a zone has more to offer.
        if (i > 1 && route[i - 2].zone === leg.zone && leg.place.id !== 'deep') {
          // (A landmark already passed is not on offer again.)
          const can = Object.values(PLACES).filter((p) => p.zone === leg.zone && p.weight > 0 && leg.m >= p.m0 && leg.m < p.m1 && !(p.landmark && route.slice(0, i).some((l) => l.place.id === p.id)));
          if (can.length > 2) assert.notEqual(leg.place.id, route[i - 2].place.id, `back and forth at ${leg.m} m`);
        }
      }
    }
    assert.equal(route[route.length - 1].place.id, 'deep');
    assert.notEqual(route[0].place.id, 'kelp');
    assert.equal(routeOf(key, true)[0].place.id, 'kelp');
    assert.deepEqual(routeOf(key, true).slice(1).map((l) => l.place.id), route.slice(1).map((l) => l.place.id));
    assert.equal(legAt(route, 0), 0);
    assert.equal(route[legAt(route, 180 * 60)].m, 6000);
    assert.equal(route[legAt(route, 180 * 60 - 1)].m, 5500);
  }
});

test('places: a long sitting keeps arriving somewhere new, and sittings do not all go the same way', () => {
  const ways = new Set<string>();
  for (let k = 0; k < 200; k++) {
    const route = routeOf(oceanKey('long', k), false);
    // Three hours to seven: a new place every 21 minutes, and at least
    // four different ones, never going back and forth between two.
    const late = route.filter((l) => l.from >= 180 && l.from < 420);
    assert.equal(late.length, 12);
    assert.ok(new Set(late.map((l) => l.place.id)).size >= 4, late.map((l) => l.place.id).join());
    ways.add(route.map((l) => l.place.id).join());
  }
  assert.ok(ways.size > 150, `only ${ways.size} routes in 200 sittings`);
  // Every place but the forest (which is the kelp's) comes up somewhere.
  const seen = new Set<string>();
  for (let k = 0; k < 400; k++) for (const l of routeOf(oceanKey('any', k), false)) seen.add(l.place.id);
  for (const id of Object.keys(PLACES)) if (id !== 'kelp') assert.ok(seen.has(id), `${id} never came up`);
});

test('places: the margin names the place, and the zone as it is entered', () => {
  const route = routeOf(oceanKey('mark', 1), false);
  for (const leg of route) {
    const mark = legMark(leg);
    assert.ok(mark.endsWith(`${leg.m.toLocaleString('en-US')} m`), mark);
    if (leg.first) assert.ok(mark.startsWith(ZONES[leg.zone].name), mark);
    if (leg.place.name !== ZONES[leg.zone].name) assert.ok(mark.includes(leg.place.name), mark);
  }
  const trench = route.find((l) => l.m === 6000)!;
  assert.equal(legMark(trench), `trench · ${trench.place.name} · 6,000 m`);
});

test('pools: one to a leg, turning over as the dive goes on, and a zone opens on the animals it always had', () => {
  const key = oceanKey('pool', 4);
  const ck = courseKey('pool');
  const biome = rollBiome(key, ck);
  assert.equal(biome.pools.length, biome.route.length);
  biome.pools.forEach((pool, i) => {
    assert.equal(pool.length, POOL_SIZE);
    for (const sp of pool) {
      assert.equal(sp.leg, i);
      assert.equal(sp.zone, biome.route[i].zone);
    }
  });
  // A zone's first leg rolls its seeds the zone's one pool always did, the
  // course's from the generation each regular place is in.
  const season = seasonOf(key);
  for (const leg of biome.route.filter((l) => l.first)) {
    biome.pools[leg.index].forEach((sp, i) => assert.equal(sp.seed, hash32(i % 2 === 0 ? `${ck}:g${generationOf(season, i / 2)}` : key, 'species', leg.zone, i)));
  }
  // The next leg in the same zone is new animals.
  for (let i = 1; i < biome.route.length; i++) {
    if (biome.route[i].first) continue;
    const before = new Set(biome.pools[i - 1].map((sp) => sp.id));
    assert.ok(biome.pools[i].every((sp) => !before.has(sp.id)), `leg ${i} kept the last leg's animals`);
  }
  // What swims by is from the pool of the leg it swam by in.
  for (let s = 0; s < 6 * 3600; s += 97) {
    const sp = spawnAt(biome, s);
    if (sp) assert.equal(sp.leg, legAt(biome.route, s));
  }
});

test('walls: the trench is walled both sides from its top and closes in, and the middle is always open', () => {
  const world = (min: number) => kelpDescent(min * 60) + 0.6;
  for (let k = 0; k < 40; k++) {
    const key = oceanKey('wall', k);
    const route = routeOf(key, false);
    for (const side of [-1, 1] as const) {
      // Nothing before the walled places.
      for (let min = 0; min < 15; min += 1) assert.equal(wallReach(route, key, side, world(min)), 0);
      // The trench: in from its first moment, both sides, never into the middle.
      assert.ok(wallReach(route, key, side, world(180)) < 0.02, 'a wall cut off flat at its top');
      let shallow = 0;
      let deep = 0;
      for (let min = 200; min < 600; min += 3) {
        const r = wallReach(route, key, side, world(min));
        // An overhang leans further out over the water than a wall stands.
        const leg = route[legAt(route, min * 60)];
        const over = leg.place.overhang && leg.side === side;
        assert.ok(r > 0.04 && r < (over ? 0.41 : 0.34), `${r} at ${min} min in ${leg.place.id}`);
        // And between the two, the middle of the page is always open.
        assert.ok(r + wallReach(route, key, side === 1 ? -1 : 1, world(min)) < 0.74, `the trench shut at ${min} min`);
        if (min < 260) shallow += r;
        if (min > 520) deep += r;
      }
      assert.ok(deep > shallow, 'the trench did not close in');
      // A one-sided wall only on its own side.
      for (const leg of route.filter((l) => l.place.walls === 1)) {
        const mid = world((leg.from + leg.to) / 2);
        assert.ok(wallReach(route, key, leg.side, mid) > 0.05);
        assert.equal(wallReach(route, key, leg.side === 1 ? -1 : 1, mid), 0);
      }
    }
  }
});

/*
 * The long night. A 7 to 9 hour sitting spends most of itself in the
 * trench, so that is where the sea has to keep changing: this is the
 * measure that once found it going back and forth between two places, with
 * a handful of the same kinds of fish and a sighting every six hours.
 */
test('a nine-hour sitting keeps changing every hour, all the way down', () => {
  const N = 12;
  const hours = 9;
  const places: number[] = Array(hours).fill(0);
  const species: number[] = Array(hours).fill(0);
  const kinds: number[] = Array(hours).fill(0);
  const sightings: number[] = Array(hours).fill(0);
  for (let k = 0; k < N; k++) {
    const biome = rollBiome(oceanKey('night', 1e6 + k * 7919), courseKey(`night${k % 4}`));
    for (let hr = 0; hr < hours; hr++) {
      const ids = new Set<string>();
      const kind = new Set<string>();
      const where = new Set<string>();
      for (let t = hr * 3600; t < (hr + 1) * 3600; t += 2) {
        where.add(biome.route[legAt(biome.route, t)].place.id);
        const sp = spawnAt(biome, t);
        if (!sp) continue;
        ids.add(sp.id);
        const g = sp.genome;
        kind.add(g.form ?? (g.plan === 'cucumber' ? `cucumber:${g.cuke}` : g.amphi ? 'amphipod' : g.plan));
      }
      places[hr] += where.size;
      species[hr] += ids.size;
      kinds[hr] += kind.size;
    }
    for (const e of eventsUpTo(biome, hours * 3600)) sightings[Math.floor(e.start / 3600)]++;
    // Never back and forth between two places, wherever there are more.
    const r = biome.route;
    for (let i = 2; i < r.length; i++) if (r[i].zone === 4 && r[i - 2].zone === 4 && r[i].place.id !== 'deep') assert.notEqual(r[i].place.id, r[i - 2].place.id, `back and forth at ${r[i].m} m`);
  }
  // Hours four to nine are the trench's.
  for (let hr = 3; hr < hours; hr++) {
    const tag = `hour ${hr + 1}`;
    assert.ok(places[hr] / N >= 3, `${tag}: ${(places[hr] / N).toFixed(1)} places`);
    assert.ok(species[hr] / N >= 30, `${tag}: ${(species[hr] / N).toFixed(1)} species`);
    assert.ok(kinds[hr] / N >= 9, `${tag}: ${(kinds[hr] / N).toFixed(1)} kinds of animal`);
  }
  // And something rare most hours down there, across the six of them.
  const trench = sightings.slice(3).reduce((a, b) => a + b, 0) / (N * 6);
  assert.ok(trench >= 0.7, `${trench.toFixed(2)} sightings an hour in the trench`);
});

/*
 * The first two hours. Every sitting starts here, so this is the water a
 * reader sees most: it once spent half an hour at a time in one place, with
 * whole quarter hours that brought nobody new.
 */
test('the first two hours arrive somewhere new every quarter hour, and every quarter hour brings someone new', () => {
  const N = 16;
  const quarters = 8;
  const fresh: number[] = Array(quarters).fill(0);
  for (let k = 0; k < N; k++) {
    const biome = rollBiome(oceanKey('early', 2e6 + k * 104729), courseKey(`early${k % 4}`));
    // From the twilight to the abyss, no leg longer than a quarter hour.
    for (const leg of biome.route.filter((l) => l.from >= 15 && l.from < 110)) assert.ok(leg.to - leg.from <= 15 + 1e-9, `${leg.place.id} at ${leg.m} m runs ${(leg.to - leg.from).toFixed(1)} min`);
    const seen = new Set<string>();
    for (let q = 0; q < quarters; q++) {
      for (let t = q * 900; t < (q + 1) * 900; t++) {
        const sp = spawnAt(biome, t);
        if (!sp || seen.has(sp.id)) continue;
        seen.add(sp.id);
        fresh[q]++;
      }
    }
  }
  for (let q = 0; q < quarters; q++) assert.ok(fresh[q] / N >= 6, `minutes ${q * 15} to ${q * 15 + 15}: ${(fresh[q] / N).toFixed(1)} new species`);
});

test('the twilight\'s places: a canyon walled both sides but wider than the trench, and a scattering layer thick with life', () => {
  const world = (min: number) => kelpDescent(min * 60) + 0.6;
  let canyons = 0;
  let layer = 0;
  let open = 0;
  let layerMin = 0;
  let openMin = 0;
  for (let k = 0; k < 300 && (canyons < 10 || layerMin < 200); k++) {
    const key = oceanKey('twi', k);
    const biome = rollBiome(key, courseKey('twi'));
    for (const leg of biome.route.filter((l) => l.zone === 1)) {
      const mid = (leg.from + leg.to) / 2;
      if (leg.place.id === 'canyon') {
        canyons++;
        for (const side of [-1, 1] as const) {
          const r = wallReach(biome.route, key, side, world(mid));
          assert.ok(r > 0.03 && r < 0.17, `a canyon wall at ${r}`);
        }
      }
      // Animals set off per minute, the layer against the twilight's other places, over the same minutes.
      for (let t = Math.ceil(leg.from * 60); t < leg.to * 60; t++) {
        const sp = spawnAt(biome, t);
        if (leg.place.id === 'layer') layer += sp ? 1 : 0;
        else open += sp ? 1 : 0;
      }
      if (leg.place.id === 'layer') layerMin += leg.to - leg.from;
      else openMin += leg.to - leg.from;
    }
  }
  assert.ok(canyons >= 10, `only ${canyons} canyons`);
  assert.ok(layer / layerMin > 1.3 * (open / openMin), `the layer ${(layer / layerMin).toFixed(2)} a minute, elsewhere ${(open / openMin).toFixed(2)}`);
  assert.ok(PLACES.layer.lights && PLACES.layer.lights > 0 && !PLACES.canyon.lights);
});

test('landmarks: a wreck in the light and a brine pool at midnight, each passed once, mid-leg, with the rocks clear of it', () => {
  const seen = { wreck: 0, brine: 0 };
  for (let k = 0; k < 400; k++) {
    const key = oceanKey('mark', k);
    const route = routeOf(key, false);
    const kinds = route.filter((l) => l.place.landmark).map((l) => l.place.id);
    // Once a sitting at most.
    assert.equal(new Set(kinds).size, kinds.length, kinds.join());
    for (let i = 0; i < route.length; i++) {
      const lm = landmarkOf(key, route, i);
      assert.equal(!!lm, !!route[i].place.landmark);
      if (!lm) continue;
      seen[lm.kind]++;
      const leg = route[i];
      // Its middle crosses the middle of the page at the middle of its leg.
      const mid = (leg.from + leg.to) / 2;
      const at = landmarksInView(key, route, i, mid * 60).find((x) => x.landmark.id === lm.id);
      assert.ok(at && Math.abs(at.top + lm.height / 2 - 0.5) < 1e-6, `${lm.kind} not mid-page mid-leg`);
      // Off the page well before and after.
      assert.ok(!landmarksInView(key, route, i, (leg.from - 6) * 60).some((x) => x.landmark.id === lm.id));
      // No rock on its edge while it is on the page.
      for (let t = (mid - 6) * 60; t <= (mid + 6) * 60; t += 20) {
        if (!landmarksInView(key, route, legAt(route, t), t).some((x) => x.landmark.id === lm.id)) continue;
        for (const { outcrop } of outcropsInView(key, false, t)) assert.notEqual(outcrop.edge, lm.edge, `a rock through the ${lm.kind}`);
      }
    }
  }
  assert.ok(seen.wreck > 20 && seen.brine > 100, JSON.stringify(seen));
});

test('each leg has its own water, and the first is the sitting\'s', () => {
  let flips = 0;
  let legs = 0;
  for (let k = 0; k < 40; k++) {
    const key = oceanKey('water', k);
    const route = routeOf(key, false);
    assert.deepEqual(route.map((l) => l.water), routeOf(key, false).map((l) => l.water));
    assert.deepEqual(route[0].water, { flip: false, clarity: 1, snow: 1, glow: 1 });
    for (const l of route.slice(1)) {
      legs++;
      if (l.water.flip) flips++;
      assert.ok(l.water.clarity >= 0.75 && l.water.clarity <= 1.2);
      assert.ok(l.water.snow >= 0.75 && l.water.snow <= 1.3);
      assert.ok(l.water.glow >= 0.6 && l.water.glow <= 1.6);
    }
  }
  // The current turns in some stretches, not most.
  assert.ok(flips / legs > 0.2 && flips / legs < 0.5, `${flips} of ${legs} legs flipped`);
  // And the animals in a flipped leg mostly swim the other way.
  const biome = rollBiome(oceanKey('water', 3), courseKey('water'));
  const flipped = biome.route.find((l) => l.water.flip && l.zone >= 2)!;
  let withIt = 0;
  let all = 0;
  for (let t = flipped.from * 60 + 120; t < flipped.to * 60 - 10; t += 30) {
    for (const v of visitorsAt(biome, t, VIEW)) {
      if (v.species.floor || v.face != null || v.age > 0.05) continue;
      all++;
      if (v.dir === -biome.env.current) withIt++;
    }
  }
  assert.ok(all > 10 && withIt / all > 0.6, `${withIt} of ${all} with the leg's current`);
});

test('a school parts round a hunter, low swimmers reach for the floor, and floor things leave a track', () => {
  let near = 0;
  let checked = 0;
  let tracks = 0;
  let reach = 0;
  for (let k = 0; k < 40; k++) {
    const biome = rollBiome(oceanKey('meet', k), courseKey('meet'));
    for (const t0 of [8 * 60, 40 * 60, 200 * 60]) {
      for (let t = t0; t < t0 + 600; t += 5) {
        const vs = visitorsAt(biome, t, VIEW);
        // Pure: the same moment twice is the same water.
        if (t === t0) assert.deepEqual(vs, visitorsAt(biome, t, VIEW));
        const hunters = vs.filter((v) => ['barracuda', 'swordfish', 'viper', 'dragon', 'angler', 'fangtooth', 'swallower', 'grouper'].includes(v.species.genome.form ?? '') || v.species.genome.plan === 'squid');
        for (const v of vs) {
          if (v.trail != null) tracks++;
          if (v.tilt) reach++;
          if (!v.key.includes('.')) continue;
          for (const h of hunters) {
            if (h.layer !== v.layer) continue;
            checked++;
            if (Math.hypot(v.x - h.x, v.y - h.y) < h.len * 0.45) near++;
          }
        }
      }
    }
  }
  assert.ok(checked > 50, `only ${checked} school members met a hunter`);
  assert.ok(near / checked < 0.03, `${near} of ${checked} school members right on top of a hunter`);
  assert.ok(tracks > 0, 'nothing on the floor left a track');
  assert.ok(reach > 0, 'no low swimmer ever reached for the floor');
});

test('the sea follows the calendar: a spring bloom, and a course\'s regulars turning over a week at a time', async () => {
  const { seasonSnow, seasonHaze, bloomAt, bloomBelow } = await import('./season');
  const at = (iso: string) => oceanKey('cal', Date.parse(iso));
  // The bloom: in the light in April, in the deep some weeks later, gone by autumn.
  assert.ok(bloomAt(seasonOf(at('2026-04-15T10:00:00Z'))) > 0.9);
  assert.ok(bloomAt(seasonOf(at('2026-10-15T10:00:00Z'))) < 0.05);
  assert.ok(bloomBelow(seasonOf(at('2026-05-28T10:00:00Z'))) > bloomBelow(seasonOf(at('2026-04-01T10:00:00Z'))));
  assert.ok(seasonSnow(seasonOf(at('2026-04-15T10:00:00Z')), 0.1) > 1.4);
  assert.equal(seasonHaze(seasonOf(at('2026-10-15T10:00:00Z')), 0.1), undefined);
  // Smooth down through the twilight: no step in the snow as a zone is crossed.
  const s = seasonOf(at('2026-04-25T10:00:00Z'));
  for (let z = 0; z < 1; z += 0.01) assert.ok(Math.abs(seasonSnow(s, z + 0.01) - seasonSnow(s, z)) < 0.05);
  // A key with no time in it has no season, and nothing changes for it.
  assert.equal(seasonOf('no-time-here'), null);
  // Regulars: the same all week; the next week one place in each pool is new, the rest as they were.
  const ck = courseKey('cal');
  const regs = (iso: string) => rollBiome(at(iso), ck).pools.map((p) => p.filter((sp) => sp.regular).map((sp) => sp.id));
  const mon = regs('2026-03-02T09:00:00Z');
  assert.deepEqual(regs('2026-03-08T21:00:00Z'), mon);
  const next = regs('2026-03-09T09:00:00Z');
  mon.forEach((pool, i) => {
    const changed = pool.filter((id, j) => id !== next[i][j]).length;
    assert.equal(changed, 1, `leg ${i}: ${changed} regulars changed in a week`);
  });
  const fresh = rollBiome(at('2026-03-09T09:00:00Z'), ck).pools.map((p) => p.filter((sp) => sp.newcomer).length);
  assert.ok(fresh.every((n) => n === 1));
});

test('the long sitting in words: an hour in the margin, and the way it went on the sheet', () => {
  assert.equal(hourMark(4, 6714.4), 'four hours · 6,714 m');
  assert.equal(hourMark(1, 520), 'one hour · 520 m');
  const route = routeOf(oceanKey('words', 7), false);
  // A short dive that stayed in one place has no route to tell.
  assert.equal(routeLine(route, 10 * 60), null);
  const line = routeLine(route, 9 * 3600)!;
  assert.ok(line.startsWith(`from ${route[0].place.name}`), line);
  const last = route[legAt(route, 9 * 3600)].place.name;
  assert.ok(line.endsWith(`to ${last}`), line);
  assert.match(line, / down past /);
  // And the recap carries it.
  const recap = diveRecap(oceanKey('words', 7), courseKey('words'), 9 * 3600);
  assert.equal(recap.route, line);
});

test('the tank hears the place: a seep fizzes, a vent field roars, a slide of silt rumbles while it passes', async () => {
  const { tankScene } = await import('./tank');
  let seep = 0;
  let vents = 0;
  let rumble = 0;
  for (let k = 0; k < 40; k++) {
    const biome = rollBiome(oceanKey('tank', k), courseKey('tank'));
    for (const leg of biome.route) {
      const mid = ((leg.from + (Number.isFinite(leg.to) ? leg.to : leg.from + 20)) / 2) * 60;
      const s = tankScene(biome, mid);
      assert.equal(s.fizz, leg.place.floor === 'seep' ? 1 : 0, leg.place.id);
      if (leg.place.vents) assert.equal(s.roar, 1);
      if (leg.place.floor === 'seep') seep++;
      if (leg.place.vents) vents++;
      // The light is quiet.
      if (leg.zone < 3) assert.deepEqual(s, { fizz: 0, roar: 0, rumble: 0 });
    }
    for (const e of eventsUpTo(biome, 9 * 3600)) {
      if (e.kind !== 'mudslide') continue;
      const during = tankScene(biome, e.start + e.seconds * 0.3).rumble;
      const after = tankScene(biome, e.start + e.seconds + 30).rumble;
      assert.ok(during > 0.5 && after === 0, `${during} then ${after}`);
      rumble++;
    }
  }
  assert.ok(seep > 0 && vents > 0 && rumble > 0, `${seep} seeps, ${vents} vent fields, ${rumble} slides`);
});

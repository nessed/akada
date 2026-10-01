import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnatomy, LAYERS, lureKind } from './anatomy';
import { rollBiome } from './biome';
import { depthAt, ZONES } from './depth';
import { mutate, rollGenome } from './genome';
import { courseKey, oceanKey, oceanKeyFromSegments } from './key';
import { childOf, DEFAULT_JELLY, jellyForBlock } from './lineage';
import { speciesName } from './names';
import { hash32, mulberry32 } from './random';
import { EVENTS, eventAtMinute, eventsAt, eventsUpTo, firstEventUpTo, type EventKind } from './events';
import { kelpDescent, kelpInView, KELP_SURFACE, rollKelp } from './kelp';
import { outcropAtSlot, outcropsInView } from './outcrop';
import { drained } from './palette';
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

test('the later sightings all turn up, and the first roll never hears of them', () => {
  const seen = new Set<EventKind>();
  for (let k = 0; k < 600 && seen.size < 9; k++) {
    for (const e of eventsUpTo(rollBiome(oceanKey('later', k), courseKey('later')), 4 * 3600)) seen.add(e.kind);
  }
  for (const kind of ['turtle', 'siphonophore', 'lure', 'dumbo', 'whalefall'] as EventKind[]) assert.ok(seen.has(kind), `no ${kind} in 600 sittings`);
  // Golden: a first-roll event that was there before the later roll existed is still there.
  const biome = rollBiome(oceanKey('gold', 1), courseKey('gold'));
  const first = eventsUpTo(biome, 4 * 3600).filter((e) => ['whale', 'storm', 'eye', 'leviathan'].includes(e.kind));
  for (const e of first) assert.equal(eventAtMinute(biome, Math.floor(e.start / 60))?.kind, e.kind);
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
      if (o.zone >= 2) assert.ok(kinds.every((g) => g === 'glass' || g === 'seapen' || g === 'whip'), `coral in the dark: ${kinds}`);
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

test('every fish has a tail, an angler is a globe, and a chain never lies level', () => {
  let minFin = Infinity;
  let minHW = Infinity;
  const tilts: number[] = [];
  for (let seed = 1; seed <= 600; seed++) {
    for (const z of [0.1, 0.4, 0.7, 0.95]) {
      const g = mutate(rollGenome(seed, z, 'fish'), seed, seed % 3);
      const a = buildAnatomy(g, seed);
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

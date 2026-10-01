/**
 * What a sitting comes to, read for the picture: how deep it went, when it
 * began, its blocks and breaks, who swam by and at what depth, the rare
 * things, and the scenery it passed. Pure: the same sitting reads the same
 * on any device, from the same rolls the timer drew from.
 */

import type { SessionSegment } from '../../data/types';
import { rollBiome, type Biome, type Species } from '../biome';
import { depthAt } from '../depth';
import { eventsUpTo, type OceanEvent } from '../events';
import { kelpDescent } from '../kelp';
import { courseKey, oceanKeyFromSegments } from '../key';
import { outcropAtSlot, type Outcrop } from '../outcrop';
import { spawnAt } from '../schedule';

export interface Block {
  index: number;
  /** Focus seconds at its start and end. */
  from: number;
  to: number;
  /** Seconds of wall time from the sitting's start (focus and breaks only). */
  wallFrom: number;
  wallTo: number;
}

export interface Rest {
  index: number;
  /** The block it followed (-1 if the sitting opened on a break). */
  after: number;
  /** Focus seconds when it was taken: the depth it rested at. */
  at: number;
  seconds: number;
  wallFrom: number;
}

export interface Met {
  species: Species;
  /** Which pool, and where in it: how the plan names it without carrying it. */
  zone: number;
  slot: number;
  /** How many times it set off, and the focus seconds of the first, the middle and the last. */
  count: number;
  first: number;
  mid: number;
  last: number;
}

export interface Session {
  key: string;
  courseKey: string;
  biome: Biome;
  startMs: number;
  /** The reader's local hour the sitting began at, 0 to 24. */
  hour: number;
  focus: number;
  wall: number;
  blocks: Block[];
  rests: Rest[];
  met: Met[];
  events: OceanEvent[];
  /** The whale fall, which stays once it has come. */
  fall: OceanEvent | null;
  /** Rocks passed, each at the focus second it crossed the middle of the screen. */
  rocks: { outcrop: Outcrop; at: number }[];
  kelp: boolean;
  floor: boolean;
}

const RATE = kelpDescent(60);
/** Focus seconds the live sea is laid on: past this the clock is not a sitting. */
const MAX_FOCUS = 10 * 3600;

export function readSession(courseId: string, segments: SessionSegment[], focusSeconds?: number, tzOffset?: number): Session | null {
  const key = oceanKeyFromSegments(courseId, segments);
  if (!key) return null;
  const ck = courseKey(courseId);
  const biome = rollBiome(key, ck);
  const startMs = Date.parse(segments[0].startedAt);

  // Blocks are runs of focus between breaks: a pause splits a stretch in
  // the log but is not a block of its own, and does not show.
  const blocks: Block[] = [];
  const rests: Rest[] = [];
  let focus = 0;
  let wall = 0;
  let open: Block | null = null;
  for (const s of segments) {
    const sec = Math.max(0, Number.isFinite(s.seconds) ? s.seconds : 0);
    if (s.kind === 'focus') {
      if (!open) {
        open = { index: blocks.length, from: focus, to: focus, wallFrom: wall, wallTo: wall };
        blocks.push(open);
      }
      focus += sec;
      wall += sec;
      open.to = focus;
      open.wallTo = wall;
    } else {
      rests.push({ index: rests.length, after: open ? open.index : blocks.length - 1, at: focus, seconds: sec, wallFrom: wall });
      wall += sec;
      open = null;
    }
  }
  // A live sitting: the clock has run on past what the log holds.
  if (focusSeconds != null && Number.isFinite(focusSeconds) && focusSeconds > focus) {
    const extra = focusSeconds - focus;
    const last = blocks[blocks.length - 1];
    if (last && last === open) {
      last.to += extra;
      last.wallTo += extra;
    } else {
      blocks.push({ index: blocks.length, from: focus, to: focus + extra, wallFrom: wall, wallTo: wall + extra });
    }
    focus += extra;
    wall += extra;
  }
  focus = Math.min(MAX_FOCUS, focus);

  // Who swam by: every second of focus, as the timer rolled it.
  const T = Math.floor(focus);
  const byId = new Map<string, Met>();
  for (let slot = 0; slot <= T; slot++) {
    const sp = spawnAt(biome, slot);
    if (!sp) continue;
    let m = byId.get(sp.id);
    if (!m) {
      const zone = sp.zone;
      m = { species: sp, zone, slot: biome.pools[zone].indexOf(sp), count: 0, first: slot, mid: slot, last: slot };
      byId.set(sp.id, m);
    }
    m.count++;
    m.last = slot;
  }
  for (const m of byId.values()) m.mid = (m.first + m.last) / 2;

  const events = eventsUpTo(biome, T);
  const fall = events.find((e) => e.kind === 'whalefall') ?? null;

  const depth = depthAt(focus);
  const kelp = biome.env.kelp;
  const rocks: { outcrop: Outcrop; at: number }[] = [];
  for (let k = 0; k * 8 * 60 <= focus; k++) {
    const o = outcropAtSlot(key, k, kelp);
    if (!o) continue;
    const enter = (o.worldY - 1) / RATE;
    const mid = (enter + (0.5 + o.thick / 2) / RATE) * 60;
    if (mid <= focus) rocks.push({ outcrop: o, at: mid });
  }

  const hourUtc = (((startMs / 3600000) % 24) + 24) % 24;
  const hour = (((hourUtc - (tzOffset ?? 0) / 60) % 24) + 24) % 24;

  return {
    key,
    courseKey: ck,
    biome,
    startMs,
    hour,
    focus,
    wall,
    blocks,
    rests,
    met: [...byId.values()].sort((a, b) => a.first - b.first),
    events,
    fall,
    rocks,
    kelp,
    floor: depth.zone >= 3,
  };
}

/**
 * Outcrops: rock jutting in from the side of the page, with things growing on it.
 *
 * Every so often, as the reader sinks, a boulder of rock comes up the page
 * from one edge with a few growths standing on it. What grows there is the
 * depth's: reef coral and anemones in the sunlit water, plates and whips as
 * the colour drains in the twilight, and in the dark only the pale ghosts of
 * the deep, glass sponges and sea pens. Nothing on it moves, which is true
 * of coral and is also why each one can be inked once and only placed.
 *
 * Focus time is cut into eight-minute slots and each slot may roll one. They
 * slide up at the kelp's pace (`kelpDescent`), so a reef and the forest above
 * it move as one place. Like the rest of the ocean it is a pure function of
 * the sitting and the focus time.
 */

import { depthAt } from './depth';
import { kelpDescent } from './kelp';
import { HUES } from './palette';
import { chance, hash32, int, mulberry32, pickIndex, range, type Rand } from './random';

export type GrowthKind = 'branch' | 'brain' | 'fan' | 'anemone' | 'tube' | 'urchin' | 'plate' | 'whip' | 'glass' | 'seapen';

export interface Growth {
  kind: GrowthKind;
  /** Where it stands along the rock's top, 0 at the page edge to 1 at the lip. */
  at: number;
  /** Its height, in CSS pixels. */
  size: number;
  /** An index into `HUES`. */
  hue: number;
  seed: number;
}

export interface Outcrop {
  id: string;
  slot: number;
  /** Which side of the page it juts out from. */
  edge: -1 | 1;
  /** How far across the page it reaches, as a share of the width. */
  reach: number;
  /** How thick it is at the page edge, in frame heights. */
  thick: number;
  /** The zone it is in when it crosses the middle of the page. */
  zone: number;
  growths: Growth[];
  /** Boulders along its top, -1 to 1 each. */
  bumps: number[];
  /** Stipple on the rock, as shares of its reach and thickness. */
  specks: { x: number; y: number; r: number }[];
  /** The top of the rock, in frame heights below the top of the page at focus 0. */
  worldY: number;
  /** A sandy patch on its top with a colony of garden eels in it. */
  eels?: EelPatch;
}

export interface EelPatch {
  /** The patch's middle, 0 to 1 along the rock's top from its own edge (the crest, not the reach). */
  at: number;
  /** How wide it is, as a share of the rock's span. */
  width: number;
  /** How many eels live in it, 4 to 8. */
  count: number;
  seed: number;
}

/** Minutes of focus to a slot. */
const SLOT = 8;
/** How likely a slot is to have one. */
const ODDS = 0.7;
/** Room above the rock for its tallest growth, in frame heights. */
const GROWN = 0.15;
/** The kelp's pace, in frame heights per focus minute. */
const RATE = kelpDescent(60);

/** What grows at each depth, with how common each is. */
const KITS: [GrowthKind, number][][] = [
  [['branch', 3], ['brain', 2], ['fan', 2], ['anemone', 2], ['tube', 2], ['urchin', 1]],
  [['plate', 3], ['fan', 2], ['whip', 2], ['tube', 1], ['urchin', 1]],
  [['glass', 3], ['seapen', 2], ['whip', 2]],
];

/** The sunlit reef's colours: the course pastels, but not the grey. */
const REEF = HUES.map((_, i) => i).filter((i) => HUES[i] !== '#9AA3AB');

function rollGrowths(r: Rand, zone: number): Growth[] {
  const kit = KITS[Math.min(2, zone)];
  const n = int(r, 2, 5);
  // Two or three colours to a rock, the way a reef patch keeps to a few.
  const hues = Array.from({ length: int(r, 2, 3) }, () => REEF[int(r, 0, REEF.length - 1)]);
  const out: Growth[] = [];
  for (let i = 0; i < n; i++) {
    // Spread along the top in even shares, each nudged within its own.
    const at = 0.05 + (0.8 * (i + 0.15 + r() * 0.7)) / n;
    const kind = kit[pickIndex(r, kit.map(([, wt]) => wt))][0];
    // Bigger near the page edge, where the rock is thickest.
    const size = Math.max(22, Math.min(64, range(r, 30, 64) * (1.1 - 0.5 * at)));
    out.push({ kind, at, size, hue: hues[int(r, 0, hues.length - 1)], seed: (r() * 4294967296) >>> 0 });
  }
  // The near-edge ones are drawn last, over the smaller ones out on the rock.
  return out.sort((a, b) => b.at - a.at);
}

/** Where a growth stands as a share of the rock's span (the sprite pads the
    rock 3% of the page out past the edge, so the two scales differ). */
const spanAt = (reach: number, at: number) => (0.03 + at * reach) / (reach + 0.03);

/**
 * Garden eels live in sand on reefs in the lit water, so only rocks up there
 * get a patch. It rolls on its own stream: the rock's own dice are left
 * alone, and every rock and growth comes out as it did before eels.
 */
function rollEels(key: string, slot: number, o: Outcrop): EelPatch | undefined {
  if (o.zone > 1) return undefined;
  const r = mulberry32(hash32(key, 'eels', slot));
  if (!chance(r, 0.35)) return undefined;
  const width = range(r, 0.22, 0.32);
  // Keep to the flat of the top: clear of the wall and short of the lip.
  const lo = 0.1 + width / 2;
  const hi = 0.74 - width / 2;
  // In the widest gap between growths, so the sand isn't under the coral.
  const stands = [0.1, ...o.growths.map((g) => spanAt(o.reach, g.at)).sort((a, b) => a - b), 0.74];
  let at = (lo + hi) / 2;
  let gap = -1;
  for (let i = 1; i < stands.length; i++) {
    if (stands[i] - stands[i - 1] > gap) {
      gap = stands[i] - stands[i - 1];
      at = (stands[i] + stands[i - 1]) / 2;
    }
  }
  return {
    at: Math.max(lo, Math.min(hi, at)),
    width,
    count: int(r, 4, 8),
    seed: (r() * 4294967296) >>> 0,
  };
}

function roll(key: string, slot: number): Outcrop | null {
  if (slot < 0 || !Number.isFinite(slot)) return null;
  const r = mulberry32(hash32(key, 'outcrop', slot));
  if (!chance(r, ODDS)) return null;
  // Slot 0's waits a minute, so the sitting opens on open water.
  const enter = Math.max(slot === 0 ? 1 : 0, SLOT * slot + range(r, 0.5, 4));
  const thick = range(r, 0.1, 0.2);
  const worldY = kelpDescent(enter * 60) + 1;
  // Mid-screen is when its middle has risen to half the page.
  const mid = enter + (0.5 + thick / 2) / RATE;
  const zone = depthAt(mid * 60).zone;
  const o: Outcrop = {
    id: `oc${hash32(key, 'outcrop', slot).toString(36)}-${slot}`,
    slot,
    edge: chance(r, 0.5) ? -1 : 1,
    reach: range(r, 0.14, 0.28),
    thick,
    zone,
    growths: rollGrowths(r, zone),
    bumps: Array.from({ length: 6 }, () => range(r, -1, 1)),
    specks: Array.from({ length: 14 }, () => ({ x: r(), y: r(), r: range(r, 0.6, 1.4) })),
    worldY,
  };
  const eels = rollEels(key, slot, o);
  if (eels) o.eels = eels;
  return o;
}

// The few slots on the page are asked for every frame; keep their rolls
// rather than roll them again. Small, since only three or so are ever live.
const memo = new Map<string, Outcrop | null>();

/** The outcrop slot `slot` rolls for the sitting, if any. */
export function outcropAtSlot(key: string, slot: number, kelp: boolean): Outcrop | null {
  const k = `${key}|${slot}`;
  let o = memo.get(k);
  if (o === undefined) {
    o = roll(key, slot);
    memo.set(k, o);
    if (memo.size > 16) memo.delete(memo.keys().next().value as string);
  }
  // Kelp and reef coral don't grow together: a kelp sitting's sunlit water is the forest's.
  if (o && kelp && o.zone === 0) return null;
  return o;
}

/** The outcrops on the page, with each one's top as a share of the page height. */
export function outcropsInView(
  key: string,
  kelp: boolean,
  focusSeconds: number,
): { outcrop: Outcrop; top: number }[] {
  const down = kelpDescent(focusSeconds);
  const now = down / RATE;
  // One enters at most 4 minutes into its slot and is gone about 7.5
  // minutes after it enters, so only the slots within a dozen minutes back
  // and one ahead can be on the page.
  const first = Math.max(0, Math.floor((now - 12) / SLOT));
  const last = Math.max(0, Math.floor((now + 1) / SLOT));
  const out: { outcrop: Outcrop; top: number }[] = [];
  for (let k = first; k <= last; k++) {
    const o = outcropAtSlot(key, k, kelp);
    if (!o) continue;
    const top = o.worldY - down;
    if (top < 1.05 && top + o.thick + GROWN > -0.05) out.push({ outcrop: o, top });
  }
  return out;
}

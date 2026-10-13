/**
 * Landmarks: the one big thing a place is known for, passed once.
 *
 * Most places are their water, their walls and their rocks. A few have
 * something in them that is the reason to name them: a wreck lying on the
 * reef in the sunlit water, grown over with coral; a brine pool at
 * midnight, a lake on a ledge of the slope, its shore lined with mussels and
 * its brine spilling over the lip. A leg in such a place passes its landmark
 * once, out from one edge of the page, at the leg's middle, sliding up at
 * the kelp's pace like the rocks, so it and everything else in the place
 * move as one.
 *
 * Like the rest of the ocean it is a pure function of the sitting's key and
 * the route: which edge it comes from and its size are the leg's own dice.
 * The rocks of that leg keep to the other edge (`outcrop.ts`), so nothing
 * grows through it.
 */

import { kelpDescent } from './kelp';
import type { Leg } from './places';
import { hash32, mulberry32, range } from './random';

export type LandmarkKind = 'wreck' | 'brine';

export interface Landmark {
  id: string;
  kind: LandmarkKind;
  /** The leg it is passed in. */
  leg: number;
  zone: number;
  /** Which edge of the page it comes out from. */
  edge: -1 | 1;
  /** How far across the page it reaches, as a share of the width. */
  reach: number;
  /** How tall it is, in page heights. */
  height: number;
  /** Its top, in page heights below the top of the page at focus 0 (the rocks' frame). */
  worldY: number;
  seed: number;
}

/** The kelp's pace, in page heights per focus minute. */
const RATE = kelpDescent(60);

const SIZE: Record<LandmarkKind, { reach: [number, number]; height: [number, number] }> = {
  wreck: { reach: [0.44, 0.52], height: [0.5, 0.58] },
  brine: { reach: [0.5, 0.6], height: [0.36, 0.42] },
};

const memo = new Map<string, Landmark | null>();

/** The landmark a leg passes, if its place has one. */
export function landmarkOf(key: string, route: Leg[], i: number): Landmark | null {
  const leg = route[i];
  const kind = leg?.place.landmark;
  if (!kind) return null;
  const k = `${key}|${i}|${kind}`;
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  const seed = hash32(key, 'landmark', i);
  const r = mulberry32(seed);
  const size = SIZE[kind];
  const edge: -1 | 1 = r() < 0.5 ? -1 : 1;
  const reach = range(r, size.reach[0], size.reach[1]);
  const height = range(r, size.height[0], size.height[1]);
  // Its middle crosses the middle of the page at the middle of the leg.
  const mid = Number.isFinite(leg.to) ? (leg.from + leg.to) / 2 : leg.from + 8;
  const worldY = kelpDescent(mid * 60) + 0.5 - height / 2;
  const lm: Landmark = { id: `lm${seed.toString(36)}-${i}`, kind, leg: i, zone: leg.zone, edge, reach, height, worldY, seed };
  memo.set(k, lm);
  if (memo.size > 24) memo.delete(memo.keys().next().value as string);
  return lm;
}

/** The minute a landmark's middle crosses the middle of the page. */
function midMinute(lm: Landmark): number {
  return kelpDescent(0) + (lm.worldY - 0.5 + lm.height / 2) / RATE;
}

/**
 * The edge of any landmark on the page around a minute (a rock crossing
 * then would meet it), or 0: the rocks keep to the other edge.
 */
export function landmarkEdgeNear(key: string, route: Leg[], legIndex: number, minute: number): -1 | 0 | 1 {
  for (let i = Math.max(0, legIndex - 1); i <= Math.min(route.length - 1, legIndex + 1); i++) {
    const lm = landmarkOf(key, route, i);
    if (lm && Math.abs(midMinute(lm) - minute) < 9) return lm.edge;
  }
  return 0;
}

/** The landmarks on the page, each with its top as a share of the page height. */
export function landmarksInView(key: string, route: Leg[], legIndex: number, focusSeconds: number): { landmark: Landmark; top: number }[] {
  const down = kelpDescent(focusSeconds);
  const out: { landmark: Landmark; top: number }[] = [];
  // Its own leg and the ones either side: one is on the page for about
  // (1 + height) / RATE minutes, a little under a leg.
  for (let i = Math.max(0, legIndex - 1); i <= Math.min(route.length - 1, legIndex + 1); i++) {
    const lm = landmarkOf(key, route, i);
    if (!lm) continue;
    const top = lm.worldY - down;
    if (top < 1.05 && top + lm.height > -0.12) out.push({ landmark: lm, top });
  }
  return out;
}

/** Minutes a landmark is on the page, for the tests. */
export function landmarkMinutes(lm: Landmark): number {
  return (1 + lm.height + 0.17) / RATE;
}

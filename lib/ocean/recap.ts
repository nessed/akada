/**
 * What a sitting's dive comes to, for the finish sheet: how far down it
 * went, the one animal most worth naming, and anything rare that happened.
 *
 * Read off the same rolls the timer drew from, with a full screen as the
 * reference, so the sheet names an animal that really swam by and names the
 * same one on any device. No counts: the sheet is not a tally of catches.
 */

import { rollBiome, type Species } from './biome';
import { depthAt, type ZoneName } from './depth';
import { EVENTS, eventsUpTo, type EventKind } from './events';
import { spawnAt } from './schedule';

export interface DiveRecap {
  meters: number;
  zone: ZoneName;
  /** The rarest thing met in the deepest water reached, if anything swam by. */
  notable: Species | null;
  /** The rarest event, if one happened. */
  event: EventKind | null;
}

export function diveRecap(sittingKey: string, courseKey: string, focusSeconds: number): DiveRecap {
  const biome = rollBiome(sittingKey, courseKey);
  const t = Math.max(0, Math.floor(focusSeconds));
  const depth = depthAt(t);
  let notable: Species | null = null;
  for (let slot = 0; slot <= t; slot++) {
    const s = spawnAt(biome, slot);
    if (!s) continue;
    if (
      !notable ||
      s.zone > notable.zone ||
      (s.zone === notable.zone && s.abundance < notable.abundance)
    ) {
      notable = s;
    }
  }
  let event: EventKind | null = null;
  for (const e of eventsUpTo(biome, t)) {
    if (!event || EVENTS[e.kind].weight > EVENTS[event].weight) event = e.kind;
  }
  return { meters: depth.meters, zone: depth.name, notable, event };
}

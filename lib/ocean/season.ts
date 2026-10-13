/**
 * The sea's year, read off the day a sitting started.
 *
 * Someone who sits in the deep every day should not get the same sea on day
 * twenty as on day one, so two things follow the calendar. In spring the
 * plankton blooms in the light: the snow thickens up there and the water
 * greens a little; a few weeks later what the bloom made comes down, and
 * the deep's snow is heavier for it. And a course's regulars turn over
 * slowly, one place in each leg's pool a week (each staying six), so its sea keeps its
 * character while the faces in it change.
 *
 * Like the rest of the ocean it is a pure function of the sitting: the day
 * comes from the key, so a sitting dived again is in its own season. The
 * timing is a northern sea's; nothing on the page names a season.
 */

const DAY = 86400000;

/** When a sitting started, from its key (`v1:<course>:<ms>`), or null if the key has no time in it. */
export function sittingTime(sittingKey: string): number | null {
  const tail = sittingKey.slice(sittingKey.lastIndexOf(':') + 1);
  const ms = Number(tail);
  return tail.length > 0 && Number.isFinite(ms) ? ms : null;
}

export interface Season {
  /** Day of the year, 0 to 365. */
  day: number;
  /** Weeks since 1970, counted from Mondays: the week the regulars change on. */
  week: number;
}

export function seasonOf(sittingKey: string): Season | null {
  const ms = sittingTime(sittingKey);
  if (ms == null) return null;
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  // 1 January 1970 was a Thursday: three days on, the weeks start on a Monday.
  return { day: Math.floor((ms - start) / DAY), week: Math.floor((ms / DAY + 3) / 7) };
}

/** A soft bump of width `w` days round `at`, 0 to 1, wrapping the year. */
function bump(day: number, at: number, w: number): number {
  const d = Math.min(Math.abs(day - at), 365 - Math.abs(day - at));
  return Math.exp(-(d * d) / (2 * w * w));
}

/** How much of the spring bloom is in the light, 0 to 1: mid-April, a month either side. */
export function bloomAt(s: Season | null): number {
  return s ? bump(s.day, 105, 18) : 0;
}

/** How much of it has fallen into the deep, 0 to 1: about six weeks after. */
export function bloomBelow(s: Season | null): number {
  return s ? bump(s.day, 148, 22) : 0;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The snow against the usual at a depth (the generator's dial, 0 to 1), at
 * the sitting's time of year: the bloom's in the lit water, what it made
 * further down, handing over smoothly through the twilight's foot.
 */
export function seasonSnow(s: Season | null, z: number): number {
  const lit = 1 - smoothstep(0.5, 0.65, z);
  return 1 + lit * 0.5 * bloomAt(s) + (1 - lit) * 0.4 * bloomBelow(s);
}

/** The bloom's green in the lit water, as a haze (`hazed`), fading out through the twilight. */
export function seasonHaze(s: Season | null, z: number): [string, number] | undefined {
  const k = bloomAt(s) * 0.14 * (1 - smoothstep(0, 0.6, z));
  return k > 0.005 ? ['#8FB59A', k] : undefined;
}

/** Weeks a regular stays before someone new takes its place. */
const TURN = 6;

/**
 * Which generation the `j`th of a pool's regular places is in: each lasts
 * six weeks, and they are staggered so one of the six starts anew each week.
 */
export function generationOf(s: Season | null, j: number): number | null {
  return s ? Math.floor((s.week + j) / TURN) : null;
}

/** Whether that place's regular is new this week. */
export function isNewcomer(s: Season | null, j: number): boolean {
  return !!s && (((s.week + j) % TURN) + TURN) % TURN === 0;
}

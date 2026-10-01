/**
 * The student's day, worked out anywhere, including on a server in UTC.
 *
 * The app knows what day it is for the reader because it runs on their
 * device: `isoDate()` reads the device clock and pulls it back by the late
 * night cutoff from preferences. The connector's server has neither, so it
 * used to date everything in UTC. A sitting logged through Claude at 1am in
 * Lahore landed on the day before, and at 3am on a Monday "this week" was
 * still last week.
 *
 * So the app writes the two things that decide the day onto user_settings
 * (the IANA zone the browser reports and the cutoff hour) and everything here
 * turns those back into a date. Pure and dependency free, so the app, the
 * connector and a test all run the same arithmetic.
 */

export const TIME_ZONE_MAX = 64;
export const DAY_ENDING_HOUR_MAX = 9;

/** A zone the runtime can actually format in, or '' for "not known". */
export function cleanTimeZone(value: unknown): string {
  if (typeof value !== 'string') return '';
  const zone = value.trim();
  if (!zone || zone.length > TIME_ZONE_MAX) return '';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return '';
  }
}

/** The hour a day ends at, 0 to 9, the same range Settings offers. */
export function cleanDayEndingHour(value: unknown): number {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return 0;
  return Math.min(DAY_ENDING_HOUR_MAX, Math.max(0, Math.round(hour)));
}

/** Where a StudentDay's answer came from, so a reply can say how sure it is. */
export type DaySource = 'device' | 'offset' | 'date' | 'utc';

export interface StudentDay {
  /** The student's date, YYYY-MM-DD, after the late night cutoff. */
  today: string;
  /** The student's date for any instant, by the same rule. */
  dayOf: (instant: Date) => string;
  /**
   * The zone's offset from UTC right now, in minutes east, without the
   * cutoff: what an hour-of-day breakdown shifts by. Null when unknown.
   */
  zoneOffsetMinutes: number | null;
  source: DaySource;
  timeZone: string | null;
}

function calendarDay(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes east of UTC that `timeZone` is at `instant`. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const whole = Math.floor(instant.getTime() / 60_000) * 60_000;
  return Math.round((wall - whole) / 60_000);
}

/**
 * The student's day from what the app stored, or from what a caller passed.
 *
 * In order: an explicit offset (a prompt copied from the app carries one, and
 * it already has the cutoff taken off), the stored zone and cutoff, an
 * explicit date, then plain UTC. The stored clock outranks a bare date,
 * because a date comes from the model, which may be carrying the day a
 * conversation started on past midnight.
 */
export function studentDay({
  timeZone,
  dayEndingHour,
  offsetMinutes,
  date,
  now = new Date(),
}: {
  timeZone?: string | null;
  dayEndingHour?: number | null;
  offsetMinutes?: number;
  date?: string;
  now?: Date;
}): StudentDay {
  const zone = cleanTimeZone(timeZone);
  const cutoff = cleanDayEndingHour(dayEndingHour);

  if (offsetMinutes !== undefined) {
    const dayOf = (instant: Date) => new Date(instant.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
    return {
      today: dayOf(now),
      dayOf,
      zoneOffsetMinutes: zone ? zoneOffsetMinutes(now, zone) : offsetMinutes + cutoff * 60,
      source: 'offset',
      timeZone: zone || null,
    };
  }

  if (zone) {
    const dayOf = (instant: Date) => calendarDay(new Date(instant.getTime() - cutoff * 3_600_000), zone);
    return { today: dayOf(now), dayOf, zoneOffsetMinutes: zoneOffsetMinutes(now, zone), source: 'device', timeZone: zone };
  }

  const utcDay = (instant: Date) => instant.toISOString().slice(0, 10);
  return {
    today: date ?? utcDay(now),
    dayOf: utcDay,
    zoneOffsetMinutes: null,
    source: date ? 'date' : 'utc',
    timeZone: null,
  };
}

/** A date moved by whole days, on the calendar rather than the clock. */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The Monday-to-Sunday week `today` falls in, moved by `offsetWeeks`: the
 * same week the app's startOfWeek draws, worked out from a date string so it
 * does not depend on the clock of the machine running it.
 */
export function weekOf(today: string, offsetWeeks = 0): { from: string; to: string } {
  const d = new Date(`${today}T12:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const from = shiftDate(today, offsetWeeks * 7 - sinceMonday);
  return { from, to: shiftDate(from, 6) };
}

/** This device's clock, as the app writes it to user_settings. */
export function deviceClock(dayEndingHour: number): { timeZone: string; dayEndingHour: number } {
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    zone = '';
  }
  return { timeZone: cleanTimeZone(zone), dayEndingHour: cleanDayEndingHour(dayEndingHour) };
}

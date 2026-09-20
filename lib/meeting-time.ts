/**
 * Reading a course's meeting time back out of the string it is stored as.
 *
 * `Course.meetingTime` is already-formatted display text, written once when a
 * section is picked out of the catalog and never parsed again — the card just
 * prints it. The calendar needs the days back out of it, so this is the one
 * place that takes the string apart.
 *
 * The catalog writes it as "Mon & Wed, 12:30 PM - 1:45 PM", and the older
 * shape "Mon/Wed 10:00" is still in the type's own documentation, so both are
 * read here along with anything else that leads with day names. A section
 * with no published slot carries a cadence instead ("Once a week, 110
 * minutes"), which names no day and correctly parses to nothing.
 */

/** Monday is 0, matching the calendar grid rather than Date#getDay. */
const DAY_INDEX: Record<string, number> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  weds: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

// Longest spellings first, so "Thursday" is never read as "Thu" followed by
// the stray letters "rsday".
const DAY_PATTERN = new RegExp(
  `\\b(${Object.keys(DAY_INDEX)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'gi',
);

export interface MeetingTime {
  /** Weekdays it meets on, Monday 0, ascending and deduplicated. */
  days: number[];
  /** Whatever followed the days, e.g. "12:30 PM - 1:45 PM". Empty if none. */
  timeLabel: string;
}

/**
 * Pull the weekdays and the time out of a stored meeting string.
 *
 * Returns null when the string names no day at all, which is the honest
 * answer for a cadence line and for a course somebody typed in by hand.
 */
export function parseMeetingTime(value: string | null | undefined): MeetingTime | null {
  if (!value) return null;

  const days = new Set<number>();
  let lastEnd = 0;
  for (const match of value.matchAll(DAY_PATTERN)) {
    const index = DAY_INDEX[match[0].toLowerCase()];
    if (index === undefined) continue;
    days.add(index);
    lastEnd = (match.index ?? 0) + match[0].length;
  }
  if (days.size === 0) return null;

  // Everything after the last day name, with the punctuation that separated
  // them trimmed off: "Mon & Wed, 12:30 PM" -> "12:30 PM".
  const timeLabel = value.slice(lastEnd).replace(/^[\s,&/;·-]+/, '').trim();

  return { days: [...days].sort((a, b) => a - b), timeLabel };
}

/** True when a course meets on this weekday (Monday 0). */
export function meetsOn(meetingTime: string | null | undefined, day: number): boolean {
  return parseMeetingTime(meetingTime)?.days.includes(day) ?? false;
}

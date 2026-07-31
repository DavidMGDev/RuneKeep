/**
 * Chat-style day headings for the timeline (v0.29.1).
 *
 * A list of timestamps is hard to read as a history: "14:32" tells you nothing about whether that was
 * this afternoon or last month. Every chat app solves this the same way, with a heading above each
 * day's run of messages, and it works because it answers the question you actually have ("when was
 * this?") at the coarseness you actually want it.
 *
 * Pure and dateless by construction: `now` is always passed in, never read from the clock, so every
 * boundary is a table test rather than something that only fails at midnight.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 1st, 2nd, 3rd, 4th ... the English rule, including the teens that break it. */
function ordinal(d: number): string {
  const tens = d % 100;
  if (tens >= 11 && tens <= 13) return `${d}th`;
  switch (d % 10) {
    case 1:
      return `${d}st`;
    case 2:
      return `${d}nd`;
    case 3:
      return `${d}rd`;
    default:
      return `${d}th`;
  }
}

/** Midnight local time on the day containing `d`, which is what "the same day" has to mean. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole days between two instants, counted by CALENDAR day rather than by elapsed hours. */
export function daysApart(then: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
}

/**
 * The heading for the day an entry falls on.
 *
 * Today and Yesterday by name, because those are the two a player is usually looking for. Then the
 * weekday for the rest of the last week, which is how people actually remember recent sessions. Older
 * than that and the weekday stops being a useful handle, so it becomes a date.
 *
 * Anything in the FUTURE is dated rather than called Today: a timestamp ahead of the clock means the
 * device clock moved or the file came from elsewhere, and quietly calling it Today would hide that.
 */
export function dayLabel(at: string | number | Date, now: Date): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const apart = daysApart(d, now);
  if (apart < 0) return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}`;
  if (apart === 0) return 'Today';
  if (apart === 1) return 'Yesterday';
  if (apart < 7) return DAYS[d.getDay()];
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}${year}`;
}

/** The clock time on its own, for the entry itself. 24 hour, which is what the rest of the app uses. */
export function clockLabel(at: string | number | Date): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Split a list into runs that share a day heading, keeping the given order.
 *
 * The heading is compared rather than the date, so two entries either side of midnight land in
 * different groups and two entries in the same day never repeat theirs.
 */
export function groupByDay<T>(items: T[], at: (item: T) => string, now: Date): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(at(item), now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
}

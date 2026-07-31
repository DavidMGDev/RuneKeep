import { clockLabel, dayLabel, daysApart, groupByDay } from './day-label';

// A Wednesday, mid-afternoon. Every case below is relative to this, never to the real clock.
const NOW = new Date(2026, 6, 8, 15, 30); // 8 July 2026

const on = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();

describe('the day a timeline entry falls on', () => {
  it('names today and yesterday, because those are the two you look for', () => {
    expect(dayLabel(on(2026, 6, 8, 9, 0), NOW)).toBe('Today');
    expect(dayLabel(on(2026, 6, 8, 23, 59), NOW)).toBe('Today');
    expect(dayLabel(on(2026, 6, 7, 23, 59), NOW)).toBe('Yesterday');
  });

  it('counts by calendar day, not by elapsed hours', () => {
    // Ten minutes earlier, but the other side of midnight, so it is Yesterday and not Today.
    expect(dayLabel(on(2026, 6, 7, 23, 55), new Date(2026, 6, 8, 0, 5))).toBe('Yesterday');
    expect(daysApart(new Date(2026, 6, 7, 23, 55), new Date(2026, 6, 8, 0, 5))).toBe(1);
  });

  it('uses the weekday for the rest of the last week', () => {
    expect(dayLabel(on(2026, 6, 6), NOW)).toBe('Monday');
    expect(dayLabel(on(2026, 6, 3), NOW)).toBe('Friday');
    expect(dayLabel(on(2026, 6, 2), NOW)).toBe('Thursday'); // 6 days back, still a weekday
  });

  it('switches to a date once a weekday stops being a useful handle', () => {
    expect(dayLabel(on(2026, 6, 1), NOW)).toBe('July 1st'); // 7 days back
    expect(dayLabel(on(2026, 5, 22), NOW)).toBe('June 22nd');
    expect(dayLabel(on(2026, 6, 3, 12, 0), new Date(2026, 6, 30))).toBe('July 3rd');
  });

  it('carries the year once it is not this one', () => {
    expect(dayLabel(on(2025, 11, 25), NOW)).toBe('December 25th 2025');
  });

  it('gets the awkward ordinals right', () => {
    // Same year as NOW, so no year is carried; the teens are the point here.
    expect(dayLabel(on(2026, 0, 11), NOW)).toBe('January 11th');
    expect(dayLabel(on(2026, 0, 12), NOW)).toBe('January 12th');
    expect(dayLabel(on(2026, 0, 13), NOW)).toBe('January 13th');
    expect(dayLabel(on(2026, 0, 21), NOW)).toBe('January 21st');
    expect(dayLabel(on(2026, 0, 22), NOW)).toBe('January 22nd');
    expect(dayLabel(on(2026, 0, 23), NOW)).toBe('January 23rd');
    expect(dayLabel(on(2025, 0, 3), NOW)).toBe('January 3rd 2025');
  });

  it('dates a future timestamp rather than calling it today', () => {
    // A clock that moved, or a character from someone else's device. Saying "Today" would hide it.
    expect(dayLabel(on(2026, 6, 9), NOW)).toBe('July 9th');
  });

  it('says so when the timestamp is not one', () => {
    expect(dayLabel('not a date', NOW)).toBe('Unknown');
    expect(clockLabel('not a date')).toBe('');
  });
});

describe('the clock on an entry', () => {
  it('is padded 24 hour', () => {
    expect(clockLabel(on(2026, 6, 8, 9, 5))).toBe('09:05');
    expect(clockLabel(on(2026, 6, 8, 23, 59))).toBe('23:59');
    expect(clockLabel(on(2026, 6, 8, 0, 0))).toBe('00:00');
  });
});

describe('grouping entries under their day', () => {
  const at = (x: { at: string }) => x.at;

  it('keeps a run of one day together and never repeats a heading', () => {
    const rows = [
      { at: on(2026, 6, 8, 15) },
      { at: on(2026, 6, 8, 9) },
      { at: on(2026, 6, 7, 20) },
      { at: on(2026, 6, 1, 10) },
    ];
    expect(groupByDay(rows, at, NOW).map((g) => ({ label: g.label, n: g.items.length }))).toEqual([
      { label: 'Today', n: 2 },
      { label: 'Yesterday', n: 1 },
      { label: 'July 1st', n: 1 },
    ]);
  });

  it('preserves the order it was given', () => {
    const rows = [{ at: on(2026, 6, 8, 9) }, { at: on(2026, 6, 8, 15) }];
    expect(groupByDay(rows, at, NOW)[0].items).toEqual(rows);
  });

  it('has nothing to say about an empty list', () => {
    expect(groupByDay([], at, NOW)).toEqual([]);
  });
});

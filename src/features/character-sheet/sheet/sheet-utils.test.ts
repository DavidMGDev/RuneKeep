import { type Wildshape } from '@/data/wildshape-data';
import { armorTrackLayout, chipWidth, trackBounds, washBands, wildshapeSummary } from './sheet-utils';

describe('trackBounds', () => {
  it('points to the next markable slot and the last marked slot', () => {
    expect(trackBounds({ total: 6, active: 3 })).toEqual({ up: 3, down: 2 });
  });
  it('caps "up" at -1 when the track is full (respecting locked slots)', () => {
    expect(trackBounds({ total: 6, active: 6 }).up).toBe(-1);
    expect(trackBounds({ total: 6, active: 5, locked: 1 }).up).toBe(-1);
  });
  it('caps "down" at -1 when empty', () => {
    expect(trackBounds({ total: 6, active: 0 }).down).toBe(-1);
  });
});

describe('chipWidth', () => {
  it('grows with label length and includes padding', () => {
    expect(chipWidth('')).toBe(18);
    expect(chipWidth('Arcana')).toBeGreaterThan(chipWidth('Bone'));
  });
});

describe('wildshapeSummary', () => {
  it('formats trait/evasion/threshold deltas and skips severe (it moves with major)', () => {
    const w = {
      effects: [
        { target: 'strength', delta: 2 },
        { target: 'evasion', delta: 1 },
        { target: 'majorThreshold', delta: 2 },
        { target: 'severeThreshold', delta: 2 },
      ],
    } as Wildshape;
    expect(wildshapeSummary(w)).toBe('+2 Strength · +1 Evasion · +2 Thresholds');
  });
});

describe('the desaturation wash', () => {
  it('is one full rect when nothing is spared', () => {
    expect(washBands(412, 892, [])).toEqual([{ left: 0, top: 0, width: 412, height: 892 }]);
  });

  it('never covers a hole', () => {
    const hole = { left: 16, top: 15, width: 148, height: 222 };
    for (const b of washBands(412, 892, [hole])) {
      const overlaps = b.left < hole.left + hole.width && b.left + b.width > hole.left && b.top < hole.top + hole.height && b.top + b.height > hole.top;
      expect(overlaps).toBe(false);
    }
  });

  it('still covers everything else', () => {
    const holes = [
      { left: 16, top: 15, width: 148, height: 222 },
      { left: 21, top: 301, width: 373, height: 84 },
    ];
    const bands = washBands(412, 892, holes);
    const covered = (x: number, y: number) => bands.some((b) => x >= b.left && x < b.left + b.width && y >= b.top && y < b.top + b.height);
    expect(covered(206, 5)).toBe(true); // above the portrait
    expect(covered(300, 100)).toBe(true); // beside the portrait
    expect(covered(206, 500)).toBe(true); // below the hit points panel
    expect(covered(5, 340)).toBe(true); // left of the hit points panel
    expect(covered(100, 100)).toBe(false); // the portrait itself
    expect(covered(200, 340)).toBe(false); // the hit points panel itself
  });
});

describe('armorTrackLayout (v0.32.2)', () => {
  it('drops the SECOND ROW at five or fewer, keeping five bigger shields', () => {
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const l = armorTrackLayout(n);
      expect(l.count).toBe(5);
      expect(l.size).toBeGreaterThan(17); // bigger than the two-row shields
      expect(new Set(l.slots.map((s) => s.y)).size).toBe(1); // one row
    }
  });

  it('falls back to the full twelve in two rows at six or more', () => {
    for (const n of [6, 9, 12]) {
      const l = armorTrackLayout(n);
      expect(l.count).toBe(12);
      expect(l.size).toBe(17);
      expect(new Set(l.slots.map((s) => s.y)).size).toBe(2);
    }
  });

  it('lines the one-row band up with the two-row one it replaces', () => {
    const one = armorTrackLayout(3);
    const two = armorTrackLayout(9);
    const right = (l: { size: number; slots: { x: number }[] }) => Math.max(...l.slots.map((s) => s.x)) + l.size;
    expect(right(one)).toBe(right(two)); // same width, so the panel around it never shifts
    expect(new Set(one.slots.slice(1).map((s, i) => s.x - one.slots[i].x)).size).toBe(1); // evenly spaced
  });
});

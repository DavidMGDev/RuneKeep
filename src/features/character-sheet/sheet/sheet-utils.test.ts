import { type Wildshape } from '@/data/wildshape-data';
import { chipWidth, trackBounds, wildshapeSummary } from './sheet-utils';

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

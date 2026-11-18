import { fanHalfWidth, fanX } from './straight-carousel';
import { FORGED_W } from './forged-card';

const W0 = FORGED_W * 0.7; // the resting centre card at zoom 1
const w = (k: number) => W0 * (1 - k * 0.085);

describe('desktop deck fan', () => {
  it('keeps the neighbours nearly clear of the centre card (at most 5% covered)', () => {
    const covered = W0 / 2 + w(1) / 2 - fanX(1, 4, 0.3, W0);
    expect(covered / w(1)).toBeGreaterThan(0);
    expect(covered / w(1)).toBeLessThanOrEqual(0.05);
  });
  it('packs the outer cards in: each shows `show` of itself past the one inside it', () => {
    for (let k = 2; k <= 4; k++) {
      const shown = fanX(k, 4, 0.3, W0) + w(k) / 2 - (fanX(k - 1, 4, 0.3, W0) + w(k - 1) / 2);
      expect(shown / w(k)).toBeCloseTo(0.3, 5);
    }
  });
  it('moves smoothly between detents and scales with zoom', () => {
    expect(fanX(1.5, 4, 0.3, W0)).toBeCloseTo((fanX(1, 4, 0.3, W0) + fanX(2, 4, 0.3, W0)) / 2, 5);
    expect(fanHalfWidth(2, 4, 0.3)).toBeCloseTo(2 * fanHalfWidth(1, 4, 0.3), 5);
  });
});

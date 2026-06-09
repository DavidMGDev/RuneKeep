import { describe, expect, it } from '@jest/globals';

import { computeStageScale } from './stage-scale';

const DESIGN = { designW: 412, designH: 892 };

describe('computeStageScale', () => {
  it('returns scale 1 and no offset when the viewport matches the design exactly', () => {
    const m = computeStageScale({ availW: 412, availH: 892, ...DESIGN });
    expect(m.scale).toBe(1);
    expect(m.offsetX).toBe(0);
    expect(m.offsetY).toBe(0);
  });

  it('fits to the limiting axis (contain) — never overflows the available area', () => {
    // Wider but same-ratio-ish viewport: height is the binding constraint here.
    const m = computeStageScale({ availW: 824, availH: 892, ...DESIGN });
    expect(m.scale).toBe(892 / 892); // height-limited → scale 1
    expect(m.scaledW).toBeLessThanOrEqual(824);
    expect(m.scaledH).toBeLessThanOrEqual(892);
  });

  it('scales down to fit a smaller phone and centers horizontally', () => {
    const m = computeStageScale({ availW: 360, availH: 892, ...DESIGN });
    expect(m.scale).toBeCloseTo(360 / 412, 5); // width-limited
    expect(m.offsetX).toBe(0); // width-limited → no horizontal slack
    expect(m.offsetY).toBeGreaterThan(0); // vertical letterbox
  });

  it('uses a single uniform scale for both axes (never distorts)', () => {
    const m = computeStageScale({ availW: 500, availH: 1100, ...DESIGN });
    // scaledW/designW must equal scaledH/designH — that equality IS "no stretch".
    expect(m.scaledW / DESIGN.designW).toBeCloseTo(m.scaledH / DESIGN.designH, 10);
  });

  it('cover fills the area (uses the larger ratio) and may overflow', () => {
    const m = computeStageScale({ availW: 412, availH: 1200, ...DESIGN, fit: 'cover' });
    expect(m.scale).toBeCloseTo(1200 / 892, 5); // height-driven, larger ratio
    expect(m.scaledW).toBeGreaterThan(412);
  });

  it('returns an empty metric for degenerate (zero/negative) sizes', () => {
    expect(computeStageScale({ availW: 0, availH: 0, ...DESIGN }).scale).toBe(0);
    expect(computeStageScale({ availW: 412, availH: 892, designW: 0, designH: 0 }).scale).toBe(0);
  });
});

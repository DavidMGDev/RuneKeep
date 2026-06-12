import { describe, expect, it } from '@jest/globals';

import { ANGLE_STEP, cardScaleAt, clampRot, imageOpacityAt, maxRotation, SCALE_MAX, SCALE_MIN, slotOpacityAt, snapRot, WINDOW_HALF } from './carousel-geometry';

describe('cardScaleAt', () => {
  it('is largest at the center (theta 0)', () => {
    expect(cardScaleAt(0)).toBeCloseTo(SCALE_MAX, 5);
  });

  it('shrinks monotonically as a card moves off-center', () => {
    const a = cardScaleAt(0);
    const b = cardScaleAt(ANGLE_STEP);
    const c = cardScaleAt(2 * ANGLE_STEP);
    const d = cardScaleAt(5 * ANGLE_STEP);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(d);
  });

  it('keeps the immediate neighbors clearly large but the far ring small', () => {
    expect(cardScaleAt(ANGLE_STEP)).toBeGreaterThan(0.78); // 3-card "large" tier
    expect(cardScaleAt(5 * ANGLE_STEP)).toBeLessThan(0.62); // far cards approach the floor
  });

  it('is symmetric and never below the floor', () => {
    expect(cardScaleAt(-ANGLE_STEP)).toBeCloseTo(cardScaleAt(ANGLE_STEP), 6);
    expect(cardScaleAt(99)).toBeGreaterThanOrEqual(SCALE_MIN);
  });
});

describe('imageOpacityAt (#78 LOD: full-res sharp on the three center cards only)', () => {
  it('draws the center and immediate neighbors at full resolution', () => {
    expect(imageOpacityAt(0)).toBe(1);
    expect(imageOpacityAt(1)).toBe(1);
  });

  it('hands over to the always-mounted thumb by two steps out — integer alphas at rest', () => {
    expect(imageOpacityAt(1.5)).toBeCloseTo(0.5, 6);
    expect(imageOpacityAt(2)).toBe(0);
    expect(imageOpacityAt(5)).toBe(0);
  });
});

describe('slotOpacityAt (#54 A: integer alphas at rest, fade only pre-unmount)', () => {
  it('keeps every resting slot fully solid — the white backs must be SEEN', () => {
    for (let d = 0; d <= WINDOW_HALF; d++) expect(slotOpacityAt(d)).toBe(1);
  });

  it('is fully transparent before the slot can unmount (center re-rounds at ±3.5)', () => {
    expect(slotOpacityAt(3.45)).toBe(0);
    expect(slotOpacityAt(3.5)).toBe(0);
  });

  it('fades smoothly inside the pre-unmount band', () => {
    const mid = slotOpacityAt(3.25);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('compact hand (#95 D) draws a wider window — up to ±6 thumbs, still integer at rest', () => {
    for (let d = 0; d <= 6; d++) expect(slotOpacityAt(d, 0)).toBe(1);
    expect(slotOpacityAt(7, 0)).toBe(0);
    // expanded keeps the original ±3 window
    expect(slotOpacityAt(4, 1)).toBe(0);
  });
});

describe('rotation clamping + snapping (finite deck)', () => {
  it('maxRotation centers the last card', () => {
    expect(maxRotation(18)).toBeCloseTo(17 * ANGLE_STEP, 6);
    expect(maxRotation(1)).toBe(0);
  });

  it('clamps to [0, max] — never scrolls past the first or last card', () => {
    expect(clampRot(-5, 18)).toBe(0);
    expect(clampRot(999, 18)).toBeCloseTo(maxRotation(18), 6);
    expect(clampRot(ANGLE_STEP, 18)).toBeCloseTo(ANGLE_STEP, 6);
  });

  it('snaps to the nearest card detent, within bounds', () => {
    expect(snapRot(ANGLE_STEP * 2.4, 18)).toBeCloseTo(ANGLE_STEP * 2, 6);
    expect(snapRot(ANGLE_STEP * 2.6, 18)).toBeCloseTo(ANGLE_STEP * 3, 6);
    expect(snapRot(-1, 18)).toBe(0);
    expect(snapRot(9999, 18)).toBeCloseTo(maxRotation(18), 6);
  });
});

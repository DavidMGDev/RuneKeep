import { activeWildshapeName, applyWildshapeCost, isWildshapeId, WILDSHAPES, wildshapeById } from './wildshape-data';

describe('WILDSHAPES data', () => {
  it('has 24 forms with unique ids across all four tiers', () => {
    expect(WILDSHAPES).toHaveLength(24);
    const ids = WILDSHAPES.map((w) => w.id);
    expect(new Set(ids).size).toBe(24);
    expect(new Set(WILDSHAPES.map((w) => w.tier))).toEqual(new Set([1, 2, 3, 4]));
  });
  it('every form has an Evasion effect and a color and a Stress cost >= 1', () => {
    for (const w of WILDSHAPES) {
      expect(w.color).toMatch(/^#/);
      expect(w.stress).toBeGreaterThanOrEqual(1);
      expect(w.effects.some((e) => e.target === 'evasion')).toBe(true);
    }
  });
  it('threshold forms add to BOTH thresholds equally (e.g. Powerful Beast +2)', () => {
    const pb = wildshapeById('ws-powerful-beast')!;
    expect(pb.effects).toEqual(expect.arrayContaining([
      { target: 'majorThreshold', delta: 2 },
      { target: 'severeThreshold', delta: 2 },
    ]));
  });
  it('isWildshapeId distinguishes ws ids from others', () => {
    expect(isWildshapeId('ws-agile-scout')).toBe(true);
    expect(isWildshapeId('wpn-broadsword')).toBe(false);
  });
});

describe('activeWildshapeName', () => {
  it('returns the enabled form name', () => {
    expect(activeWildshapeName({ enabledCardIds: ['arm-gambeson', 'ws-pack-predator'] })).toBe('Pack Predator');
  });
  it('returns null when no form is enabled', () => {
    expect(activeWildshapeName({ enabledCardIds: ['arm-gambeson'] })).toBeNull();
    expect(activeWildshapeName({})).toBeNull();
  });
});

describe('applyWildshapeCost', () => {
  it('marks Stress when there is room', () => {
    expect(applyWildshapeCost({ stressActive: 2, stressUnlocked: 6, hp: 6 }, 1)).toEqual({ stressActive: 3, hp: 6 });
  });
  it('spills to HP when Stress is full', () => {
    expect(applyWildshapeCost({ stressActive: 6, stressUnlocked: 6, hp: 6 }, 1)).toEqual({ stressActive: 6, hp: 5 });
  });
  it('never deals the killing blow: 1 HP + full Stress survives', () => {
    expect(applyWildshapeCost({ stressActive: 6, stressUnlocked: 6, hp: 1 }, 1)).toEqual({ stressActive: 6, hp: 1 });
  });
  it('a multi-Stress hybrid (3) partly fills Stress then spills the rest to HP, clamped at 1', () => {
    // 1 room in Stress → +1 Stress; remaining 2 → HP 1 - 2 clamps to 1 (no kill)
    expect(applyWildshapeCost({ stressActive: 5, stressUnlocked: 6, hp: 1 }, 3)).toEqual({ stressActive: 6, hp: 1 });
    // plenty of HP → spills fully: 1 room in Stress, remaining 2 off HP
    expect(applyWildshapeCost({ stressActive: 5, stressUnlocked: 6, hp: 8 }, 3)).toEqual({ stressActive: 6, hp: 6 });
  });
});

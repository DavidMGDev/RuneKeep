import { type BaseStats, type CardEffect, computeSheet, type EffectSource, STAT_CAPS, tierForLevel } from './modifiers';

const ZERO: BaseStats = {
  agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0,
  evasion: 10, armorScore: 0, maxHp: 6, stressMax: 6, hopeMax: 6, proficiency: 1, majorThreshold: 0, severeThreshold: 0,
};
const src = (source: string, effects: CardEffect[]): EffectSource => ({ source, effects });

describe('tierForLevel', () => {
  it('maps levels to tiers at the boundaries', () => {
    expect(tierForLevel(1)).toBe(1);
    expect([2, 3, 4].map(tierForLevel)).toEqual([2, 2, 2]);
    expect([5, 6, 7].map(tierForLevel)).toEqual([3, 3, 3]);
    expect([8, 9, 10].map(tierForLevel)).toEqual([4, 4, 4]);
  });
});

describe('computeSheet', () => {
  it('returns base totals when nothing is enabled', () => {
    const s = computeSheet(ZERO, 1, []);
    expect(s.evasion.total).toBe(10);
    expect(s.evasion.contributions).toHaveLength(0);
    expect(s.maxHp.total).toBe(6);
  });

  it('sums flat deltas and records each contribution with its source', () => {
    const s = computeSheet(ZERO, 1, [
      src('Tower Shield', [{ target: 'armorScore', delta: 2 }, { target: 'evasion', delta: -1 }]),
      src('Greatsword', [{ target: 'evasion', delta: -1 }]),
    ]);
    expect(s.armorScore.total).toBe(2);
    expect(s.evasion.total).toBe(8); // 10 - 1 - 1
    expect(s.evasion.contributions.map((c) => c.source)).toEqual(['Tower Shield', 'Greatsword']);
    expect(s.evasion.contributions.map((c) => c.delta)).toEqual([-1, -1]);
  });

  it('resolves byTier effects by the character tier', () => {
    const eff: CardEffect[] = [{ target: 'severeThreshold', byTier: [1, 2, 3, 4] }];
    expect(computeSheet(ZERO, 1, [src('x', eff)]).severeThreshold.total).toBe(1);
    expect(computeSheet(ZERO, 3, [src('x', eff)]).severeThreshold.total).toBe(2); // levels 2-4 => tier 2
    expect(computeSheet(ZERO, 5, [src('x', eff)]).severeThreshold.total).toBe(3);
    expect(computeSheet(ZERO, 9, [src('x', eff)]).severeThreshold.total).toBe(4);
  });

  it('resolves dynamic proficiency against the finalized Proficiency total', () => {
    const base = { ...ZERO, proficiency: 2 };
    const s = computeSheet(base, 3, [src('Rise Up', [{ target: 'severeThreshold', dynamic: 'proficiency' }])]);
    expect(s.severeThreshold.total).toBe(2);
  });

  it('resolves dynamic halfAgility AFTER flat agility modifiers', () => {
    const base = { ...ZERO, agility: 3 };
    const s = computeSheet(base, 1, [
      src('Buff', [{ target: 'agility', delta: 1 }]), // agility -> 4
      src('Untouchable', [{ target: 'evasion', dynamic: 'halfAgility' }]), // floor(4/2) = 2
    ]);
    expect(s.agility.total).toBe(4);
    expect(s.evasion.total).toBe(12); // 10 + 2
  });

  it('clamps capped stats (maxHp/stressMax/armorScore) at 12', () => {
    const s = computeSheet(ZERO, 1, [src('Ring of HP', [{ target: 'maxHp', delta: 20 }])]);
    expect(s.maxHp.total).toBe(12);
    expect(s.maxHp.cap).toBe(STAT_CAPS.maxHp);
    // the contribution is still recorded so the panel can show the over-cap source
    expect(s.maxHp.contributions[0].delta).toBe(20);
  });

  it('handles negative deltas and ignores zero deltas', () => {
    const s = computeSheet(ZERO, 1, [src('Penalty', [{ target: 'finesse', delta: -1 }, { target: 'strength', delta: 0 }])]);
    expect(s.finesse.total).toBe(-1);
    expect(s.strength.contributions).toHaveLength(0);
  });
});

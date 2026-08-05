import { type BaseStats, type CardEffect, computeSheet, effectiveLevel, type EffectSource, STAT_CAPS, tierForLevel } from './modifiers';

const ZERO: BaseStats = {
  agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0,
  evasion: 10, armorScore: 0, maxHp: 6, stressMax: 6, hopeMax: 6, proficiency: 1, majorThreshold: 0, severeThreshold: 0, scar: 0, restMoves: 0,
  level: 1,
};
const src = (source: string, effects: CardEffect[]): EffectSource => ({ source, effects });

describe('scar target (v0.13.0)', () => {
  it('sums one scar per enabled scar card, base 0, uncapped by the engine', () => {
    const s = computeSheet(ZERO, 1, [
      src('Cursed Blade', [{ target: 'scar', delta: 1 }]),
      src('Old Wound', [{ target: 'scar', delta: 1 }]),
    ]);
    expect(s.scar.total).toBe(2);
    expect(s.hopeMax.total).toBe(6); // scars never change hope MAX — only usable slots (sheet layer)
  });
  it('no scar cards → zero scars', () => {
    expect(computeSheet(ZERO, 1, []).scar.total).toBe(0);
  });
});

describe('tierForLevel', () => {
  it('maps levels to tiers at the boundaries', () => {
    expect(tierForLevel(1)).toBe(1);
    expect([2, 3, 4].map(tierForLevel)).toEqual([2, 2, 2]);
    expect([5, 6, 7].map(tierForLevel)).toEqual([3, 3, 3]);
    expect([8, 9, 10].map(tierForLevel)).toEqual([4, 4, 4]);
  });
});

describe('formula effects (#278)', () => {
  const ev = (level: number, formula: CardEffect['formula'], base: BaseStats = ZERO) =>
    computeSheet(base, level, [src('F', [{ target: 'evasion', dynamic: 'formula', formula }])]).evasion.total;
  it('resolves level / tier / proficiency / trait (base evasion 10)', () => {
    expect(ev(4, { variable: 'level' })).toBe(14); // 10 + 4
    expect(ev(5, { variable: 'tier' })).toBe(13); // 10 + tier 3
    expect(ev(1, { variable: 'proficiency', multiply: 2 }, { ...ZERO, proficiency: 3 })).toBe(16); // 10 + 6
    expect(ev(1, { variable: 'agility' }, { ...ZERO, agility: 4 })).toBe(14); // 10 + 4
  });
  it('rounds UP (ceil), never down', () => {
    expect(ev(5, { variable: 'level', divide: 2 })).toBe(13); // 10 + ceil(5/2)=3
    expect(ev(3, { variable: 'level', divide: 2 })).toBe(12); // 10 + ceil(3/2)=2
    expect(ev(1, { variable: 'level', divide: 2 })).toBe(11); // 10 + ceil(1/2)=1
  });
});

describe('spellcast formula variable (v0.21.0 — Mage Robes)', () => {
  // Mage Robes: +Spellcast trait to both damage thresholds. The armor SETS the base, the Enchanted effect
  // adds the caster's spellcast trait on top.
  const robes = src('Mage Robes', [
    { target: 'majorThreshold', mode: 'set', delta: 4 },
    { target: 'majorThreshold', mode: 'bonus', dynamic: 'formula', formula: { variable: 'spellcast' } },
  ]);
  it('adds the named spellcast trait total to the target', () => {
    const withCast = computeSheet({ ...ZERO, knowledge: 3 }, 1, [robes], 'knowledge');
    // base 0 → set 4 → +level(1)/+? threshold bonus... isolate: at least the +3 spellcast lands on top of 4.
    expect(withCast.majorThreshold.total).toBeGreaterThanOrEqual(4 + 3);
  });
  it('resolves to 0 for a non-caster subclass (no spellcast trait passed)', () => {
    const noCast = computeSheet({ ...ZERO, knowledge: 3 }, 1, [robes]);
    const withCast = computeSheet({ ...ZERO, knowledge: 3 }, 1, [robes], 'knowledge');
    expect(withCast.majorThreshold.total - noCast.majorThreshold.total).toBe(3);
  });
});

describe('computeSheet', () => {
  it('returns base totals when nothing is enabled', () => {
    const s = computeSheet(ZERO, 1, []);
    expect(s.evasion.total).toBe(10);
    expect(s.evasion.contributions).toHaveLength(0);
    expect(s.maxHp.total).toBe(6);
  });

  it('Bare Bones (#248): set armorScore = 3 + Strength, set thresholds by tier', () => {
    const base: BaseStats = { ...ZERO, strength: 2, majorThreshold: 1, severeThreshold: 2 };
    const eff: CardEffect[] = [
      { target: 'armorScore', mode: 'set', dynamic: 'strengthPlus3' },
      { target: 'majorThreshold', mode: 'set', byTier: [9, 11, 13, 15] },
      { target: 'severeThreshold', mode: 'set', byTier: [19, 24, 31, 38] },
    ];
    const t1 = computeSheet(base, 1, [src('Bare Bones', eff)]);
    expect(t1.armorScore.total).toBe(5); // 3 + Strength(2)
    expect(t1.majorThreshold.total).toBe(9);
    expect(t1.severeThreshold.total).toBe(19);
    const t2 = computeSheet({ ...base, strength: 4 }, 3, [src('Bare Bones', eff)]); // level 3 = tier 2
    expect(t2.armorScore.total).toBe(7); // 3 + 4
    expect(t2.majorThreshold.total).toBe(11);
    expect(t2.severeThreshold.total).toBe(24);
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

  it('a formula adds its flat +constant after the ×/÷ round-up (#325)', () => {
    const base = { ...ZERO, strength: 2 };
    // Bare Bones, made editable: armorScore = Strength + 3 (a bonus on a 0 base) = 5
    const s = computeSheet(base, 1, [src('Bare Bones', [{ target: 'armorScore', dynamic: 'formula', formula: { variable: 'strength', plus: 3 } }])]);
    expect(s.armorScore.total).toBe(5);
  });

  it('resolves dynamic halfAgility AFTER flat agility modifiers', () => {
    const base = { ...ZERO, agility: 3 };
    const s = computeSheet(base, 1, [
      src('Buff', [{ target: 'agility', delta: 1 }]), // agility -> 4
      src('Untouchable', [{ target: 'evasion', dynamic: 'halfAgility' }]), // ceil(4/2) = 2
    ]);
    expect(s.agility.total).toBe(4);
    expect(s.evasion.total).toBe(12); // 10 + 2
  });

  // v0.34.5: half of an ODD number rounds UP, and must agree with the formula the Modifiers panel
  // rewrites this effect into. Disagreeing is what made Untouchable change value once you saved it.
  it('rounds halfAgility UP, the same way the equivalent formula does', () => {
    const base = { ...ZERO, agility: 3 };
    const legacy = computeSheet(base, 1, [src('Untouchable', [{ target: 'evasion', dynamic: 'halfAgility' }])]);
    const edited = computeSheet(base, 1, [src('Untouchable', [{ target: 'evasion', dynamic: 'formula', formula: { variable: 'agility', divide: 2 } }])]);
    expect(legacy.evasion.total).toBe(12); // 10 + ceil(3/2)
    expect(edited.evasion.total).toBe(legacy.evasion.total);
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

describe('damage thresholds — set / bonus (#242)', () => {
  // The level-based base (Major = level, Severe = 2×level) is supplied by the caller in BaseStats.
  const base: BaseStats = { ...ZERO, majorThreshold: 3, severeThreshold: 6 };

  it('keeps the base when no card touches thresholds', () => {
    const s = computeSheet(base, 3, []);
    expect(s.majorThreshold.total).toBe(3);
    expect(s.severeThreshold.total).toBe(6);
  });

  it('a set effect OVERRIDES the base', () => {
    const s = computeSheet(base, 3, [src('Chainmail', [{ target: 'majorThreshold', mode: 'set', delta: 7 }, { target: 'severeThreshold', mode: 'set', delta: 15 }])]);
    expect(s.majorThreshold.total).toBe(7);
    expect(s.severeThreshold.total).toBe(15);
  });

  it('a bonus effect ADDS to the base/set', () => {
    const s = computeSheet(base, 3, [src('Charm', [{ target: 'majorThreshold', mode: 'bonus', delta: 2 }])]);
    expect(s.majorThreshold.total).toBe(5); // base 3 + 2
    const s2 = computeSheet(base, 3, [
      src('Chainmail', [{ target: 'majorThreshold', mode: 'set', delta: 7 }]),
      src('Charm', [{ target: 'majorThreshold', mode: 'bonus', delta: 2 }]),
    ]);
    expect(s2.majorThreshold.total).toBe(9); // set 7 + bonus 2
  });

  it('the last set wins when two slip through', () => {
    const s = computeSheet(base, 3, [
      src('A', [{ target: 'severeThreshold', mode: 'set', delta: 10 }]),
      src('B', [{ target: 'severeThreshold', mode: 'set', delta: 20 }]),
    ]);
    expect(s.severeThreshold.total).toBe(20);
  });
});

describe('overwrite (v0.32.0) — Overwhelming Aura', () => {
  it('replaces the running total, whatever else contributed', () => {
    const base: BaseStats = { ...ZERO, presence: 1, knowledge: 4 };
    const s = computeSheet(
      base,
      5,
      [
        src('Charm', [{ target: 'presence', delta: 3 }]), // presence would be 4
        src('Overwhelming Aura', [{ target: 'presence', dynamic: 'formula', formula: { variable: 'spellcast' }, overwrite: true }]),
      ],
      'knowledge',
    );
    expect(s.presence.total).toBe(4); // = the Spellcast trait, not 1 + 3 + 4
  });

  it('runs after the flat pass whichever order the sources come in', () => {
    const first = computeSheet(ZERO, 1, [
      src('Aura', [{ target: 'evasion', delta: 2, overwrite: true }]),
      src('Cloak', [{ target: 'evasion', delta: 5 }]),
    ]);
    expect(first.evasion.total).toBe(2); // NOT 10 + 5 then overwritten to 2 by luck of ordering
  });

  it('still records what it displaced, so the panel can show provenance', () => {
    const s = computeSheet(ZERO, 1, [src('Aura', [{ target: 'evasion', delta: 3, overwrite: true }])]);
    expect(s.evasion.contributions).toEqual([{ source: 'Aura', delta: -7, note: undefined }]); // 10 → 3
  });
});

describe('stress + input variables (v0.32.0)', () => {
  const keyed = (source: string, effects: CardEffect[], key?: string): EffectSource => ({ source, effects, key });

  it('Eldritch Flesh gives +1 Armor per TWO marked Stress, rounding down', () => {
    const armorPerStress: CardEffect[] = [{ target: 'armorScore', dynamic: 'formula', formula: { variable: 'stress', divide: 2, floor: true } }];
    const at = (stress: number) => computeSheet(ZERO, 1, [src('Eldritch Flesh', armorPerStress)], null, { stress }).armorScore.total;
    expect(at(0)).toBe(0);
    expect(at(1)).toBe(0); // one Stress has not reached the first two
    expect(at(2)).toBe(1);
    expect(at(5)).toBe(2);
  });

  it("a card's number input is its OWN, never shared", () => {
    const ferocity: CardEffect[] = [{ target: 'evasion', dynamic: 'formula', formula: { variable: 'input' } }];
    const s = computeSheet(ZERO, 1, [keyed('Ferocity', ferocity, 'bone-02-1'), keyed('Homebrew', ferocity, 'custom-9')], null, {
      inputs: { 'bone-02-1': 3 },
    });
    expect(s.evasion.total).toBe(13); // base 10 + Ferocity's 3 + nothing from the card with no number
  });

  it('an input formula on a source with no key resolves to nothing rather than guessing', () => {
    const s = computeSheet(ZERO, 1, [src('Anonymous', [{ target: 'evasion', dynamic: 'formula', formula: { variable: 'input' } }])], null, { inputs: { x: 9 } });
    expect(s.evasion.total).toBe(10);
  });
});

describe('per-modifier off switch (v0.35)', () => {
  it('drops a switched-off modifier and keeps its siblings', () => {
    const s = computeSheet(ZERO, 1, [
      src('DM Changes', [
        { target: 'evasion', delta: 2 },
        { target: 'evasion', delta: 5, off: true },
        { target: 'maxHp', delta: 3, off: true },
      ]),
    ]);
    expect(s.evasion.total).toBe(12);
    expect(s.maxHp.total).toBe(6);
    expect(s.evasion.contributions).toHaveLength(1);
  });

  it('leaves a card with every modifier off out of the breakdown entirely', () => {
    const s = computeSheet(ZERO, 1, [src('Storm', [{ target: 'evasion', delta: -1, off: true }])]);
    expect(s.evasion.contributions).toEqual([]);
  });

  it('switches off a formula and an overwrite too, not just flat amounts', () => {
    const s = computeSheet(ZERO, 1, [
      src('Aura', [
        { target: 'presence', delta: 4, overwrite: true, off: true },
        { target: 'knowledge', dynamic: 'formula', formula: { variable: 'level', multiply: 3 }, off: true },
      ]),
    ]);
    expect(s.presence.total).toBe(0);
    expect(s.knowledge.total).toBe(0);
  });
});

describe('level as a modifier (v0.35)', () => {
  it('raises the level the sheet is computed at', () => {
    expect(effectiveLevel(2, [src('DM Changes', [{ target: 'level', delta: 4 }])])).toBe(6);
  });

  it('ignores a switched-off level modifier', () => {
    expect(effectiveLevel(2, [src('DM Changes', [{ target: 'level', delta: 4, off: true }])])).toBe(2);
  });

  it('never drops a character below level 1', () => {
    expect(effectiveLevel(2, [src('Curse', [{ target: 'level', delta: -9 }])])).toBe(1);
  });

  it('resolves a per-tier level modifier at the character\u2019s real tier', () => {
    // Level 5 is tier 3, so the third entry applies.
    expect(effectiveLevel(5, [src('Boon', [{ target: 'level', byTier: [1, 2, 3, 4] }])])).toBe(8);
  });

  it('ignores a formula level modifier, which cannot be resolved before the sheet exists', () => {
    expect(effectiveLevel(3, [src('Odd', [{ target: 'level', dynamic: 'formula', formula: { variable: 'proficiency' } }])])).toBe(3);
  });

  it('shows up as a contribution on the Level row, and drives tier formulas', () => {
    const sources = [src('DM Changes', [{ target: 'level', delta: 5 }, { target: 'maxHp', dynamic: 'formula', formula: { variable: 'tier' } }])];
    const lvl = effectiveLevel(1, sources);
    const s = computeSheet({ ...ZERO, level: 1 }, lvl, sources);
    expect(s.level.total).toBe(6);
    expect(tierForLevel(lvl)).toBe(3);
    expect(s.maxHp.total).toBe(9); // 6 + tier 3
  });
});

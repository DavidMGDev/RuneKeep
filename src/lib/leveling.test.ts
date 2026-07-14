import type { CharacterFile } from './character-file';
import { advRemaining, applyLevelUp, availableAdvancements, type LevelDefaults, type LevelUpPlan, picksUsed, tierForLevel } from './leveling';

const DEF: LevelDefaults = { maxHp: 6, stressMax: 6, evasion: 10 };

function baseFile(over: Partial<CharacterFile> = {}): CharacterFile {
  return {
    schemaVersion: 1,
    id: 'x',
    createdAt: '2026-01-01',
    name: 'A',
    portraitUri: null,
    className: 'sorcerer' as CharacterFile['className'],
    subclassCardId: 's',
    ancestryCardId: 'a',
    communityCardId: 'c',
    domainCardIds: ['arcana-01-1', 'midnight-01-1'],
    level: 1,
    ...over,
  };
}
const plan = (over: Partial<LevelUpPlan> = {}): LevelUpPlan => ({ domainCardId: 'arcana-02-1', advancements: [], ...over });

describe('auto per-level effects', () => {
  it('raises the level (thresholds are level-based now, not a per-level bonus — #242)', () => {
    const f = applyLevelUp(baseFile(), plan(), DEF);
    expect(f.level).toBe(2);
    expect(f.thresholdBonus ?? 0).toBe(0);
  });
  it('adds the new domain card and activates it when there is room', () => {
    const f = applyLevelUp(baseFile(), plan({ domainCardId: 'arcana-02-1' }), DEF);
    expect(f.domainCardIds).toContain('arcana-02-1');
    expect(f.activeDomainCardIds).toContain('arcana-02-1');
  });
  it('does not auto-activate a 6th domain card', () => {
    const f = applyLevelUp(baseFile({ domainCardIds: ['a', 'b', 'c', 'd', 'e'], activeDomainCardIds: ['a', 'b', 'c', 'd', 'e'] }), plan({ domainCardId: 'f' }), DEF);
    expect(f.domainCardIds).toContain('f');
    expect(f.activeDomainCardIds).not.toContain('f');
  });
});

describe('tier achievements', () => {
  it('adds a +2 Experience when a tier starts (level 2)', () => {
    const f = applyLevelUp(baseFile({ level: 1 }), plan({ experienceTitle: 'Silver Tongue' }), DEF);
    expect(f.experiences?.at(-1)).toMatchObject({ title: 'Silver Tongue', modifier: 2 });
  });
  it('persists the new Experience color, image, and body (#239 item 5)', () => {
    const f = applyLevelUp(
      baseFile({ level: 1 }),
      plan({ experienceTitle: 'Trail Sense', experienceColor: '#3A6E4F', experienceImageUri: 'file:///exp.jpg', experienceText: 'Years in the wild.' }),
      DEF,
    );
    expect(f.experiences?.at(-1)).toMatchObject({ title: 'Trail Sense', color: '#3A6E4F', imageUri: 'file:///exp.jpg', text: 'Years in the wild.', modifier: 2 });
  });
  it('clears trait marks at every tier start (2, 5, 8)', () => {
    // v0.10.0: marks reset at the START of each tier — previously only 5 & 8, which soft-locked level-up.
    for (const fromLevel of [1, 4, 7]) {
      const f = applyLevelUp(baseFile({ level: fromLevel, traitMarks: ['agility', 'finesse'] }), plan(), DEF);
      expect(f.traitMarks).toEqual([]); // entering level fromLevel+1 (2, 5, 8)
    }
  });
  it('keeps trait marks at non-tier levels (3 -> 4)', () => {
    const f = applyLevelUp(baseFile({ level: 3, traitMarks: ['agility'] }), plan(), DEF);
    expect(f.traitMarks).toEqual(['agility']);
  });
});

describe('advancements', () => {
  it('trait: +1 to two traits, marks them, marks one slot', () => {
    const f = applyLevelUp(baseFile(), plan({ advancements: [{ key: 'trait', traits: ['agility', 'strength'] }] }), DEF);
    expect(f.traitBonuses).toMatchObject({ agility: 1, strength: 1 });
    expect(f.traitMarks).toEqual(expect.arrayContaining(['agility', 'strength']));
    expect(f.advancementMarks?.trait).toBe(1);
  });
  it('hp / stress / evasion increment the override over the default', () => {
    const f = applyLevelUp(baseFile(), plan({ advancements: [{ key: 'hp' }, { key: 'stress' }] }), DEF);
    expect(f.maxHp).toBe(7);
    expect(f.stressMax).toBe(7);
    const g = applyLevelUp(baseFile(), plan({ advancements: [{ key: 'evasion' }] }), DEF);
    expect(g.evasionBase).toBe(11);
  });
  it('exp: +1 to two chosen experiences', () => {
    const f = applyLevelUp(
      baseFile({ experiences: [{ id: 'e1', title: 'A', text: '', imageUri: null, modifier: 2 }, { id: 'e2', title: 'B', text: '', imageUri: null, modifier: 2 }] }),
      plan({ advancements: [{ key: 'exp', expIds: ['e1', 'e2'] }] }),
      DEF,
    );
    expect(f.experiences?.map((e) => e.modifier)).toEqual([3, 3]);
  });
  it('prof uses 2 slots; multiclass records the class', () => {
    const f = applyLevelUp(baseFile({ level: 4 }), plan({ advancements: [{ key: 'prof' }] }), DEF);
    expect(f.proficiencyBonus).toBe(1);
    expect(f.advancementMarks?.prof).toBe(2);
    const g = applyLevelUp(baseFile({ level: 4 }), plan({ advancements: [{ key: 'multiclass', multiclass: 'wizard' }] }), DEF);
    expect(g.multiclassName).toBe('wizard');
  });
  it('never upgrades the same trait twice in one level-up (across two trait takes)', () => {
    const f = applyLevelUp(
      baseFile({ level: 3 }),
      plan({ advancements: [{ key: 'trait', traits: ['agility', 'strength'] }, { key: 'trait', traits: ['agility', 'finesse'] }] }),
      DEF,
    );
    expect(f.traitBonuses?.agility).toBe(1); // not 2 — the duplicate is dropped
    expect(f.traitBonuses).toMatchObject({ agility: 1, strength: 1, finesse: 1 });
  });
  it('always adds a chosen domain card to the owned list at level 3+, even when 5 are already active', () => {
    const f = applyLevelUp(
      baseFile({ level: 2, domainCardIds: ['a', 'b', 'c', 'd', 'e'], activeDomainCardIds: ['a', 'b', 'c', 'd', 'e'] }),
      plan({ domainCardId: 'lvl3-card' }),
      DEF,
    );
    expect(f.level).toBe(3);
    expect(f.domainCardIds).toContain('lvl3-card'); // owned/carousel never gated by the 5-active cap
    expect(f.activeDomainCardIds).not.toContain('lvl3-card'); // but not auto-activated past 5
  });
  it('subclass advances foundation -> specialization -> mastery', () => {
    const f1 = applyLevelUp(baseFile({ level: 4 }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f1.subclassTier).toBe('specialization');
    const f2 = applyLevelUp(baseFile({ level: 4, subclassTier: 'specialization' }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f2.subclassTier).toBe('mastery');
  });
});

describe('multiclass (#311)', () => {
  it('records the new class, its subclass foundation card, and its domain', () => {
    const g = applyLevelUp(
      baseFile({ level: 4 }),
      plan({ advancements: [{ key: 'multiclass', multiclass: 'ranger', multiclassSubclassCardId: 'subclass-beastbound-1-foundation', multiclassDomain: 'sage' }] }),
      DEF,
    );
    expect(g.multiclassName).toBe('ranger');
    expect(g.multiclassSubclassCardId).toBe('subclass-beastbound-1-foundation');
    expect(g.multiclassDomain).toBe('sage');
  });
  it('removes the subclass-upgrade option once multiclassed (no path to mastery)', () => {
    const before = availableAdvancements(baseFile({ level: 5 }), 6).map((o) => o.key);
    expect(before).toContain('subclass');
    const after = availableAdvancements(baseFile({ level: 5, multiclassName: 'wizard' }), 6).map((o) => o.key);
    expect(after).not.toContain('subclass');
  });
  it('does not advance the subclass tier for a multiclassed character (defensive)', () => {
    const f = applyLevelUp(baseFile({ level: 5, subclassTier: 'specialization', multiclassName: 'wizard' }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f.subclassTier).toBe('specialization');
  });
  it('can only multiclass once (slots exhaust the option)', () => {
    const after = availableAdvancements(baseFile({ level: 5, multiclassName: 'wizard', advancementMarks: { multiclass: 2 } }), 6).map((o) => o.key);
    expect(after).not.toContain('multiclass');
  });
});

describe('companion level-up (#311)', () => {
  const ranger = (over: Partial<CharacterFile> = {}) => baseFile({ className: 'ranger', subclassCardId: 'subclass-beastbound-1-foundation', ...over });
  it('folds chosen training options into the companion', () => {
    const f = applyLevelUp(ranger({ level: 2 }), plan({ companionOptions: ['resilient', 'aware'] }), DEF);
    expect(f.companion?.stressMax).toBe(4); // resilient +1 over the default 3
    expect(f.companion?.evasion).toBe(12); // aware +2 over the default 10
  });
  it('grants the companion an Experience at a tier start', () => {
    const f = applyLevelUp(ranger({ level: 1 }), plan({ experienceTitle: 'X' }), DEF); // L1 -> L2 is a tier start
    expect(f.companion?.experiences.length).toBe(3); // 2 default + 1
  });
  it('leaves no companion for a non-Beastbound character', () => {
    const f = applyLevelUp(baseFile({ level: 2 }), plan({ companionOptions: ['resilient'] }), DEF);
    expect(f.companion).toBeUndefined();
  });
});

describe('slot accounting', () => {
  it('picksUsed counts prof/multiclass as 2', () => {
    expect(picksUsed([{ key: 'prof' }])).toBe(2);
    expect(picksUsed([{ key: 'trait' }, { key: 'hp' }])).toBe(2);
  });
  it('trait has 3 slots; availableAdvancements gates tier-3 options', () => {
    expect(advRemaining(baseFile(), 'trait')).toBe(3);
    expect(availableAdvancements(baseFile(), 2).map((o) => o.key)).not.toContain('prof');
    expect(availableAdvancements(baseFile(), 5).map((o) => o.key)).toContain('prof');
  });
  it('an exhausted option drops out (within the same tier)', () => {
    // v0.10.2: marks only count when stamped for the tier being evaluated — level 2 (tier 2) marks gate
    // the level-3 (still tier 2) menu.
    expect(availableAdvancements(baseFile({ level: 2, advancementMarks: { evasion: 1 }, advancementMarksTier: 2 }), 3).map((o) => o.key)).not.toContain('evasion');
  });
});

describe('per-tier advancement reset (v0.10.2, Bug 2)', () => {
  it('reopens exhausted options at the next tier', () => {
    // trait slots spent in tier 2 are available again in tier 3.
    const f = baseFile({ level: 4, advancementMarks: { trait: 3, hp: 2 }, advancementMarksTier: 2 });
    const keys = availableAdvancements(f, 5).map((o) => o.key); // level 5 = tier 3
    expect(keys).toEqual(expect.arrayContaining(['trait', 'hp']));
  });
  it('applyLevelUp resets the marks and re-stamps the tier when crossing a boundary', () => {
    const f = applyLevelUp(baseFile({ level: 4, advancementMarks: { trait: 3 }, advancementMarksTier: 2 }), plan({ advancements: [{ key: 'trait', traits: ['agility', 'strength'] }] }), DEF);
    expect(f.advancementMarksTier).toBe(3); // now tier 3
    expect(f.advancementMarks?.trait).toBe(1); // reset, then this take
  });
  it('self-heals a pre-0.10.2 soft-locked save (stale marks, no stamp)', () => {
    const stuck = baseFile({ level: 8, advancementMarks: { trait: 3, hp: 2, stress: 2, evasion: 1 } }); // no advancementMarksTier
    const keys = availableAdvancements(stuck, 9).map((o) => o.key); // level 9 = tier 4
    expect(keys).toEqual(expect.arrayContaining(['trait', 'hp', 'stress', 'evasion']));
  });
  it('caps multiclass at once ever even though the tier resets', () => {
    const keys = availableAdvancements(baseFile({ level: 8, multiclassName: 'wizard' }), 9).map((o) => o.key);
    expect(keys).not.toContain('multiclass');
  });
});

describe('subclass upgrade adds the next card (v0.10.2, Bug 3)', () => {
  const guardian = (over: Partial<CharacterFile> = {}) => baseFile({ className: 'guardian' as CharacterFile['className'], subclassCardId: 'subclass-stalwart-1-foundation', ...over });
  it('foundation → specialization pushes the specialization card', () => {
    const f = applyLevelUp(guardian({ level: 4 }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f.subclassTier).toBe('specialization');
    expect(f.acquiredCardIds).toContain('subclass-stalwart-2-specialization');
  });
  it('specialization → mastery pushes the mastery card', () => {
    const f = applyLevelUp(guardian({ level: 7, subclassTier: 'specialization', acquiredCardIds: ['subclass-stalwart-2-specialization'] }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f.subclassTier).toBe('mastery');
    expect(f.acquiredCardIds).toEqual(expect.arrayContaining(['subclass-stalwart-2-specialization', 'subclass-stalwart-3-mastery']));
  });
  it('a multiclassed character gains no subclass card (defensive)', () => {
    const f = applyLevelUp(guardian({ level: 7, subclassTier: 'specialization', multiclassName: 'wizard' }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f.acquiredCardIds ?? []).not.toContain('subclass-stalwart-3-mastery');
  });
});

describe('level cap + subclass placement (v0.10.5)', () => {
  const guardian = (over: Partial<CharacterFile> = {}) => baseFile({ className: 'guardian' as CharacterFile['className'], subclassCardId: 'subclass-stalwart-1-foundation', ...over });
  it('never advances past level 10', () => {
    expect(applyLevelUp(baseFile({ level: 10 }), plan(), DEF).level).toBe(10);
  });
  it('routes the added subclass card to the Arsenal (abilities)', () => {
    const f = applyLevelUp(guardian({ level: 4 }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f.acquiredCardIds).toContain('subclass-stalwart-2-specialization');
    expect(f.cardCategory?.['subclass-stalwart-2-specialization']).toBe('abilities');
  });
  it('upgrades a CUSTOM subclass from its embedded tier siblings', () => {
    const f = applyLevelUp(
      baseFile({
        level: 4,
        subclassCardId: 'lc-sub-1',
        libraryCards: [
          { id: 'lc-sub-1', contentType: 'subclass', title: 'Warden F', text: '', imageUri: null, className: 'guardian', subclass: 'warden', tier: 1 },
          { id: 'lc-sub-2', contentType: 'subclass', title: 'Warden S', text: '', imageUri: null, className: 'guardian', subclass: 'warden', tier: 2 },
          { id: 'lc-sub-3', contentType: 'subclass', title: 'Warden M', text: '', imageUri: null, className: 'guardian', subclass: 'warden', tier: 3 },
        ],
      }),
      plan({ advancements: [{ key: 'subclass' }] }),
      DEF,
    );
    expect(f.subclassTier).toBe('specialization');
    expect(f.acquiredCardIds).toContain('lc-sub-2');
    expect(f.cardCategory?.['lc-sub-2']).toBe('abilities');
  });
});

describe('tierForLevel re-export', () => {
  it('matches the rest module', () => {
    expect([1, 2, 5, 8].map(tierForLevel)).toEqual([1, 2, 3, 4]);
  });
});

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
  it('raises level and bumps both thresholds by 1', () => {
    const f = applyLevelUp(baseFile(), plan(), DEF);
    expect(f.level).toBe(2);
    expect(f.thresholdBonus).toBe(1);
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
  it('clears trait marks at level 5', () => {
    const f = applyLevelUp(baseFile({ level: 4, traitMarks: ['agility', 'finesse'] }), plan(), DEF);
    expect(f.traitMarks).toEqual([]);
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
  it('subclass advances foundation -> specialization -> mastery', () => {
    const f1 = applyLevelUp(baseFile({ level: 4 }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f1.subclassTier).toBe('specialization');
    const f2 = applyLevelUp(baseFile({ level: 4, subclassTier: 'specialization' }), plan({ advancements: [{ key: 'subclass' }] }), DEF);
    expect(f2.subclassTier).toBe('mastery');
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
  it('an exhausted option drops out', () => {
    expect(availableAdvancements(baseFile({ advancementMarks: { evasion: 1 } }), 2).map((o) => o.key)).not.toContain('evasion');
  });
});

describe('tierForLevel re-export', () => {
  it('matches the rest module', () => {
    expect([1, 2, 5, 8].map(tierForLevel)).toEqual([1, 2, 3, 4]);
  });
});

import type { CharacterFile } from './character-file';
import {
  addCompanionExperience,
  applyCompanionOption,
  companionOptionRemaining,
  companionPicksPerLevel,
  DEFAULT_COMPANION,
  hasCompanion,
  setCompanionStress,
} from './companion';

function baseFile(over: Partial<CharacterFile> = {}): CharacterFile {
  return {
    schemaVersion: 1,
    id: 'x',
    createdAt: '2026-01-01',
    name: 'A',
    portraitUri: null,
    className: 'ranger' as CharacterFile['className'],
    subclassCardId: 'subclass-beastbound-1-foundation',
    ancestryCardId: 'ancestry-human',
    communityCardId: 'community-loreborne',
    domainCardIds: ['bone-01-1', 'sage-01-1'],
    level: 1,
    ...over,
  };
}

describe('companion option application', () => {
  it('Resilient adds a stress slot', () => {
    expect(applyCompanionOption(DEFAULT_COMPANION, 'resilient').stressMax).toBe(4);
    expect(applyCompanionOption(applyCompanionOption(DEFAULT_COMPANION, 'resilient'), 'resilient').stressMax).toBe(5);
  });
  it('Aware adds +2 evasion', () => {
    expect(applyCompanionOption(DEFAULT_COMPANION, 'aware').evasion).toBe(12);
  });
  it('Vicious steps the die up the ladder, then the range at max die', () => {
    let c = applyCompanionOption(DEFAULT_COMPANION, 'vicious');
    expect(c.damageDie).toBe(8);
    c = applyCompanionOption(applyCompanionOption(c, 'vicious'), 'vicious'); // 8 -> 10 -> 12
    expect(c.damageDie).toBe(12);
    c = applyCompanionOption(c, 'vicious'); // die maxed -> range steps
    expect(c.damageDie).toBe(12);
    expect(c.range).toBe('Close');
  });
  it('Intelligent bumps an experience bonus and records the take', () => {
    const c = applyCompanionOption(DEFAULT_COMPANION, 'intelligent');
    expect(c.experiences[0].bonus).toBe(3);
    expect(c.options.intelligent).toBe(1);
  });
  it('records non-stat options without changing companion stats', () => {
    const c = applyCompanionOption(DEFAULT_COMPANION, 'bonded');
    expect(c.options.bonded).toBe(1);
    expect(c.evasion).toBe(DEFAULT_COMPANION.evasion);
    expect(c.stressMax).toBe(DEFAULT_COMPANION.stressMax);
  });
  it('tracks per-option remaining against the sheet maxima', () => {
    let c = DEFAULT_COMPANION;
    expect(companionOptionRemaining(c, 'aware')).toBe(1);
    c = applyCompanionOption(c, 'aware');
    expect(companionOptionRemaining(c, 'aware')).toBe(0);
    expect(companionOptionRemaining(c, 'resilient')).toBe(3);
  });
});

describe('companion stress + experiences', () => {
  it('clamps stress to [0, stressMax]', () => {
    expect(setCompanionStress(DEFAULT_COMPANION, 5).stress).toBe(3);
    expect(setCompanionStress(DEFAULT_COMPANION, -2).stress).toBe(0);
    expect(setCompanionStress(DEFAULT_COMPANION, 2).stress).toBe(2);
  });
  it('a new experience starts at +2', () => {
    const c = addCompanionExperience(DEFAULT_COMPANION, 'Scout');
    expect(c.experiences).toHaveLength(3);
    expect(c.experiences[2]).toEqual({ name: 'Scout', bonus: 2 });
  });
});

describe('Beastbound detection + tier picks', () => {
  it('a Beastbound ranger has a companion; a Wayfinder does not', () => {
    expect(hasCompanion(baseFile())).toBe(true);
    expect(hasCompanion(baseFile({ subclassCardId: 'subclass-wayfinder-1-foundation' }))).toBe(false);
  });
  it('a non-ranger who multiclassed into Beastbound has a companion', () => {
    expect(hasCompanion(baseFile({ subclassCardId: 'subclass-nightwalker-1-foundation', multiclassSubclassCardId: 'subclass-beastbound-1-foundation' }))).toBe(true);
  });
  it('picks per level-up scale with the Beastbound tier (1 / 2 / 4)', () => {
    expect(companionPicksPerLevel(baseFile({ subclassTier: 'foundation' }))).toBe(1);
    expect(companionPicksPerLevel(baseFile({ subclassTier: 'specialization' }))).toBe(2);
    expect(companionPicksPerLevel(baseFile({ subclassTier: 'mastery' }))).toBe(4);
  });
  it('a multiclass companion is always foundation (1 pick)', () => {
    expect(companionPicksPerLevel(baseFile({ subclassCardId: 'subclass-wayfinder-1-foundation', multiclassSubclassCardId: 'subclass-beastbound-1-foundation', subclassTier: 'mastery' }))).toBe(1);
  });
  it('a non-Beastbound character gets 0 picks', () => {
    expect(companionPicksPerLevel(baseFile({ subclassCardId: 'subclass-wayfinder-1-foundation' }))).toBe(0);
  });
});

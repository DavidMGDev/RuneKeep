import { type CharacterFile, modSum, parseCharacterFile, serializeCharacterFile, type StatModifier, toSheetCharacter } from './character-file';

function baseFile(over: Partial<CharacterFile> = {}): CharacterFile {
  return {
    schemaVersion: 1,
    id: 'x',
    createdAt: '2026-01-01',
    name: 'Test',
    portraitUri: null,
    className: 'guardian',
    subclassCardId: 'subclass-stalwart-1-foundation',
    ancestryCardId: 'ancestry-giant',
    communityCardId: 'community-wildborne',
    domainCardIds: ['valor-01-1', 'blade-01-1'],
    level: 1,
    ...over,
  };
}

describe('embedded library cards (v0.10.3)', () => {
  const withLib = (over: Partial<CharacterFile> = {}) =>
    baseFile({
      subclassCardId: 'lc-custom-sub',
      libraryCards: [{ id: 'lc-custom-sub', contentType: 'subclass', title: 'Custom Sub', text: 'body', imageUri: null, className: 'guardian' }],
      ...over,
    });
  it('parseCharacterFile accepts a structural id backed by libraryCards', () => {
    const f = parseCharacterFile(serializeCharacterFile(withLib()));
    expect(f.subclassCardId).toBe('lc-custom-sub');
    expect(f.libraryCards?.[0].title).toBe('Custom Sub');
  });
  it('rejects a structural id in neither the catalog nor libraryCards', () => {
    expect(() => parseCharacterFile(serializeCharacterFile(baseFile({ subclassCardId: 'nope' })))).toThrow();
  });
  it('toSheetCharacter labels the slot from the embedded card', () => {
    expect(toSheetCharacter(withLib()).subclass).toBe('Custom Sub');
  });
  it('a character with no libraryCards round-trips unchanged', () => {
    expect(parseCharacterFile(serializeCharacterFile(baseFile())).libraryCards).toBeUndefined();
  });
});

describe('toSheetCharacter resource persistence (v0.9.7)', () => {
  const armorUnlocked = (c: ReturnType<typeof toSheetCharacter>) => c.armor.total - (c.armor.locked ?? 0);
  it('starts full/default when the file has no saved resources', () => {
    const c = toSheetCharacter(baseFile());
    expect(c.hp).toBe(c.maxHp);
    expect(c.stress.active).toBe(0);
    expect(c.hope.active).toBe(2);
    expect(c.armor.active).toBe(armorUnlocked(c));
  });
  it('rehydrates saved in-play resources', () => {
    const full = toSheetCharacter(baseFile());
    const armor = Math.max(0, armorUnlocked(full) - 1);
    const c = toSheetCharacter(baseFile({ resources: { hp: 2, stress: 3, hope: 5, armor } }));
    expect(c.hp).toBe(2);
    expect(c.stress.active).toBe(3);
    expect(c.hope.active).toBe(5);
    expect(c.armor.active).toBe(armor);
  });
  it('clamps saved resources above the current maxes', () => {
    const c = toSheetCharacter(baseFile({ resources: { hp: 999, stress: 999, hope: 999, armor: 999 } }));
    expect(c.hp).toBe(c.maxHp);
    expect(c.stress.active).toBe(c.stress.total - (c.stress.locked ?? 0));
    expect(c.hope.active).toBe(c.hope.total);
    expect(c.armor.active).toBe(armorUnlocked(c));
  });
});

describe('modSum', () => {
  const mods: StatModifier[] = [
    { id: 'a', target: 'evasion', delta: -1, label: 'Heavy armor' },
    { id: 'b', target: 'evasion', delta: 2, label: 'Cloak' },
    { id: 'c', target: 'agility', delta: 1, label: 'Boots' },
  ];
  it('sums only the modifiers aimed at the target', () => {
    expect(modSum(mods, 'evasion')).toBe(1);
    expect(modSum(mods, 'agility')).toBe(1);
    expect(modSum(mods, 'strength')).toBe(0);
  });
  it('is 0 for an empty or missing list', () => {
    expect(modSum([], 'evasion')).toBe(0);
    expect(modSum(undefined, 'evasion')).toBe(0);
  });
});

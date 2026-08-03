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

describe('scars (v0.13.0)', () => {
  const scarCard = (id: string) => ({ id, title: 'Scarred Relic', text: '', imageUri: null, target: 'inventory' as const, effects: [{ target: 'scar' as const, delta: 1 }] });
  it('each enabled scar card kills one hope slot from the right; hope clamps below them', () => {
    const cards = [scarCard('sc1'), scarCard('sc2')];
    const c = toSheetCharacter(baseFile({ customCards: cards, enabledCardIds: ['sc1', 'sc2'], resources: { hp: 2, stress: 0, hope: 6, armor: 0 } }));
    expect(c.scars).toBe(2);
    expect(c.hope.total).toBe(6); // slots still drawn — the last 2 render scarred
    expect(c.hope.active).toBe(4); // saved hope 6 clamps to the 4 usable slots
  });
  it('scar count clamps at the hope total; fully scarred = zero usable hope', () => {
    const cards = Array.from({ length: 8 }, (_, i) => scarCard(`s${i}`));
    const c = toSheetCharacter(baseFile({ customCards: cards, enabledCardIds: cards.map((x) => x.id), resources: { hp: 2, stress: 0, hope: 3, armor: 0 } }));
    expect(c.scars).toBe(6);
    expect(c.hope.active).toBe(0);
  });
  it('unequipping any scar card frees one slot (flat count, order-independent)', () => {
    const cards = [scarCard('a'), scarCard('b'), scarCard('c')];
    const c = toSheetCharacter(baseFile({ customCards: cards, enabledCardIds: ['a', 'c'], resources: { hp: 2, stress: 0, hope: 6, armor: 0 } }));
    expect(c.scars).toBe(2);
    expect(c.hope.active).toBe(4);
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

/**
 * The moodboard travels with the character (v0.34.0, pinned v0.34.1).
 *
 * The board is stored on the character precisely so that sharing a character shares what it looks
 * like. Three separate mechanisms have to agree about it, and all three key off the field being
 * called `imageUri`, which is easy to rename by accident and impossible to notice afterwards.
 */
describe('a shared character carries its moodboard', () => {
  const board = [
    { id: 'mb-1', imageUri: 'data:image/png;base64,AAAA', x: 100, y: 200, scale: 1.4, rotation: 90, aspect: 1.5 },
    { id: 'mb-2', imageUri: 'data:image/png;base64,BBBB', x: 300, y: 400, scale: 0.8, rotation: 0, aspect: 0.75 },
  ];

  it('survives a write and a read with every image and every placement', () => {
    const back = parseCharacterFile(serializeCharacterFile(baseFile({ moodboard: board, moodboardAsPortrait: true })));
    expect(back.moodboard).toEqual(board);
    expect(back.moodboardAsPortrait).toBe(true);
  });

  it('keeps the image bytes, which are the whole point of sharing one', () => {
    const text = serializeCharacterFile(baseFile({ moodboard: board }));
    expect(text).toContain('data:image/png;base64,AAAA');
    expect(text).toContain('data:image/png;base64,BBBB');
  });

  it('drops a browser blob reference on the way in, the same as every other image', () => {
    const raw = JSON.stringify(baseFile({ moodboard: [{ ...board[0], imageUri: 'blob:https://runekeep.pages.dev/dead' }] }));
    expect(parseCharacterFile(raw).moodboard?.[0].imageUri).toBeNull();
  });

  it('is absent, not broken, on a character that has never opened one', () => {
    expect(parseCharacterFile(serializeCharacterFile(baseFile())).moodboard).toBeUndefined();
  });
});

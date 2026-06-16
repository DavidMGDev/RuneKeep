import { type CharacterFile, toSheetCharacter } from '@/lib/character-file';
import { cardHasEffects, catalogIdOf, editableCardIds, effectsForCardId, findEditableCard, isEditableCard, sourceLabelForCardId } from './card-effects';

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
    armorId: 'arm-chainmail', // 7 / 15, score 4
    level: 1,
    ...over,
  };
}

describe('effectsForCardId', () => {
  it('resolves a weapon feature to its effects', () => {
    expect(effectsForCardId('wpn-greatsword')).toEqual([{ target: 'evasion', delta: -1 }]);
  });
  it('resolves armor and catalog cards', () => {
    // Armor now also SETS the damage thresholds when enabled (#242 item 9), parsed from "5 / 11".
    expect(effectsForCardId('arm-gambeson')).toEqual([
      { target: 'evasion', delta: 1 },
      { target: 'majorThreshold', mode: 'set', delta: 5 },
      { target: 'severeThreshold', mode: 'set', delta: 11 },
    ]);
    expect(effectsForCardId('ancestry-giant')[0]).toMatchObject({ target: 'maxHp', delta: 1 });
  });
  it('resolves a player-authored custom card from the file', () => {
    const file = baseFile({ customCards: [{ id: 'cc-1', title: 'Lucky Ring', text: '', imageUri: null, target: 'inventory', effects: [{ target: 'evasion', delta: 2 }] }] });
    expect(effectsForCardId('cc-1', file)).toEqual([{ target: 'evasion', delta: 2 }]);
  });
  it('returns [] for an unknown id and a no-effect card', () => {
    expect(effectsForCardId('nope')).toEqual([]);
    expect(effectsForCardId('wpn-longsword')).toEqual([]);
    expect(cardHasEffects('wpn-longsword')).toBe(false);
  });
  it('labels a card by its human name', () => {
    expect(sourceLabelForCardId('wpn-greatsword')).toBe('Greatsword');
    expect(sourceLabelForCardId('ancestry-giant')).toBe('Giant');
  });
});

describe('catalogIdOf + duplicate copies (#269)', () => {
  it('strips a trailing instance suffix only', () => {
    expect(catalogIdOf('wpn-greatsword')).toBe('wpn-greatsword');
    expect(catalogIdOf('wpn-greatsword#2')).toBe('wpn-greatsword');
    expect(catalogIdOf('wpn-greatsword#10')).toBe('wpn-greatsword');
    // mid-string digits/dashes are NOT suffixes
    expect(catalogIdOf('subclass-stalwart-1-foundation')).toBe('subclass-stalwart-1-foundation');
    expect(catalogIdOf('cc-abc123')).toBe('cc-abc123');
  });
  it('resolves a duplicate copy to its catalog effects + label', () => {
    expect(effectsForCardId('ancestry-giant#2')[0]).toMatchObject({ target: 'maxHp', delta: 1 });
    expect(sourceLabelForCardId('ancestry-giant#2')).toBe('Giant');
  });
  it('applies an effect once per enabled copy', () => {
    const one = toSheetCharacter(baseFile({ enabledCardIds: ['ancestry-giant'] }));
    const two = toSheetCharacter(baseFile({ enabledCardIds: ['ancestry-giant', 'ancestry-giant#2'] }));
    expect(two.maxHp).toBe(one.maxHp + 1); // each copy contributes its +1 Max HP
  });
});

describe('editable-card helpers (#264 item 5)', () => {
  const file = baseFile({
    customCards: [{ id: 'cc-1', title: 'Lucky Ring', text: '', imageUri: null, target: 'inventory' }],
    notes: [{ id: 'note-1', title: 'A note', text: '', imageUri: null }],
    inventoryCustom: [{ id: 'inv-1', title: 'Rope', text: '', imageUri: null }],
  });
  it('finds a custom card and its collection', () => {
    expect(findEditableCard(file, 'cc-1')).toMatchObject({ collection: 'customCards', card: { title: 'Lucky Ring' } });
    expect(findEditableCard(file, 'note-1')?.collection).toBe('notes');
    expect(findEditableCard(file, 'inv-1')?.collection).toBe('inventoryCustom');
  });
  it('treats catalog cards as not editable', () => {
    expect(findEditableCard(file, 'ancestry-giant')).toBeNull();
    expect(isEditableCard('ancestry-giant', file)).toBe(false);
    expect(isEditableCard('wpn-greatsword', file)).toBe(false);
  });
  it('reports editability for custom cards', () => {
    expect(isEditableCard('cc-1', file)).toBe(true);
    expect(editableCardIds(file)).toEqual(new Set(['cc-1', 'note-1', 'inv-1']));
  });
  it('is safe with no file', () => {
    expect(isEditableCard('cc-1', undefined)).toBe(false);
    expect(editableCardIds(undefined).size).toBe(0);
  });
});

describe('toSheetCharacter with enabled cards', () => {
  it('base thresholds are level-based when no armor is enabled (#242)', () => {
    const c = toSheetCharacter(baseFile()); // level 1, armor NOT enabled
    expect(c.damageThresholds).toEqual({ major: 1, severe: 2 }); // Major = level, Severe = 2×level
    expect(c.armorScore).toBe(4);
  });

  it('enabling armor SETS the thresholds; a bonus card stacks on top (#242)', () => {
    const set = toSheetCharacter(baseFile({ enabledCardIds: ['arm-chainmail'] })); // 7 / 15
    expect(set.damageThresholds).toEqual({ major: 7, severe: 15 });
    const bonus = toSheetCharacter(
      baseFile({
        customCards: [{ id: 'cc-thr', title: 'Wardstone', text: '', imageUri: null, target: 'inventory', effects: [{ target: 'majorThreshold', mode: 'bonus', delta: 2 }] }],
        enabledCardIds: ['arm-chainmail', 'cc-thr'],
      }),
    );
    expect(bonus.damageThresholds).toEqual({ major: 9, severe: 15 }); // set 7 + bonus 2
  });

  it('applies an enabled armor + shield + ancestry to the derived sheet', () => {
    const c = toSheetCharacter(
      baseFile({ enabledCardIds: ['arm-chainmail', 'wpn-tower-shield', 'ancestry-giant'] }),
    );
    // chainmail Heavy: evasion -1 (guardian base evasion 9 -> 8), tower shield -1 -> 7
    expect(c.evasion).toBe(7);
    // armor score base 4 + tower shield +2 = 6
    expect(c.armorScore).toBe(6);
    // giant +1 max HP (guardian base 7 -> 8)
    expect(c.maxHp).toBe(8);
  });

  it('applies an enabled subclass threshold passive as a bonus on the level-based base', () => {
    const c = toSheetCharacter(baseFile({ enabledCardIds: ['subclass-stalwart-1-foundation'] }));
    expect(c.damageThresholds).toEqual({ major: 2, severe: 3 }); // base 1/2 + bonus +1/+1
  });

  it('never exceeds the HP cap of 12', () => {
    const file = baseFile({
      customCards: [{ id: 'cc-hp', title: 'HP Ring', text: '', imageUri: null, target: 'inventory', effects: [{ target: 'maxHp', delta: 9 }] }],
      enabledCardIds: ['cc-hp'],
    });
    expect(toSheetCharacter(file).maxHp).toBe(12); // 7 + 9 clamped to 12
  });
});

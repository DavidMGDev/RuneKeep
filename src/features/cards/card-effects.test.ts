import { type CharacterFile, toSheetCharacter } from '@/lib/character-file';
import { cardHasEffects, effectsForCardId, sourceLabelForCardId } from './card-effects';

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
    expect(effectsForCardId('arm-gambeson')).toEqual([{ target: 'evasion', delta: 1 }]);
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

describe('toSheetCharacter with enabled cards', () => {
  it('matches the legacy derivation when nothing is enabled', () => {
    const c = toSheetCharacter(baseFile());
    expect(c.damageThresholds).toEqual({ major: 7, severe: 15 }); // chainmail base, level 1 (+0)
    expect(c.armorScore).toBe(4);
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

  it('applies an enabled subclass threshold passive', () => {
    const c = toSheetCharacter(baseFile({ enabledCardIds: ['subclass-stalwart-1-foundation'] }));
    expect(c.damageThresholds).toEqual({ major: 8, severe: 16 }); // +1 / +1
  });

  it('never exceeds the HP cap of 12', () => {
    const file = baseFile({
      customCards: [{ id: 'cc-hp', title: 'HP Ring', text: '', imageUri: null, target: 'inventory', effects: [{ target: 'maxHp', delta: 9 }] }],
      enabledCardIds: ['cc-hp'],
    });
    expect(toSheetCharacter(file).maxHp).toBe(12); // 7 + 9 clamped to 12
  });
});

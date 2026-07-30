/**
 * Permanent and chosen modifiers (v0.25.0), tested through the character file rather than the engine,
 * because the interesting behaviour is the interaction: a permanent effect has to survive being
 * unequipped, and a chosen one has to stay unapplied until the player answers.
 *
 * Vitality is the case that motivated both: "permanently gain two of the following benefits ... then
 * place this card in your vault permanently."
 */
import { effectsForCardId, isPermanentCard, rawEffectsForCardId, unequippedPermanentSources } from '@/features/cards/card-effects';
import { sheetBreakdown, type CharacterFile } from './character-file';

const VITALITY = 'blade-05-2';

/** A minimal level-1 Warrior holding Vitality. `enabled` decides whether it is equipped. */
function warrior(over: Partial<CharacterFile> = {}): CharacterFile {
  return {
    schemaVersion: 1,
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Test',
    portraitUri: null,
    className: 'warrior',
    subclassCardId: 'subclass-stalwart-1-foundation',
    ancestryCardId: 'ancestry-human',
    communityCardId: 'community-highborne',
    domainCardIds: [VITALITY],
    level: 1,
    ...over,
  } as CharacterFile;
}

describe('a card that asks the player to choose', () => {
  it('grants nothing until the player has picked', () => {
    expect(effectsForCardId(VITALITY, warrior())).toEqual([]);
  });

  it('still knows what it COULD grant, so the UI can offer the choice', () => {
    expect(rawEffectsForCardId(VITALITY, warrior()).length).toBeGreaterThan(0);
    expect(isPermanentCard(VITALITY, warrior())).toBe(true);
  });

  it('grants only the options picked', () => {
    const file = warrior({ cardChoices: { [VITALITY]: [0, 1] } });
    const targets = effectsForCardId(VITALITY, file).map((e) => e.target);
    expect(targets).toContain('stressMax');
    expect(targets).toContain('maxHp');
    expect(targets).not.toContain('majorThreshold');
  });

  it('grants the threshold pair as one option', () => {
    const file = warrior({ cardChoices: { [VITALITY]: [2] } });
    const targets = effectsForCardId(VITALITY, file).map((e) => e.target);
    expect(targets).toEqual(['majorThreshold', 'severeThreshold']);
  });
});

describe('a permanent effect survives being put away', () => {
  const picked = { [VITALITY]: [0, 1] };

  it('applies while the card is equipped', () => {
    const file = warrior({ cardChoices: picked, enabledCardIds: [VITALITY] });
    const sheet = sheetBreakdown(file);
    expect(sheet.stressMax.contributions.some((c) => c.note?.includes('Vitality'))).toBe(true);
    expect(sheet.maxHp.contributions.some((c) => c.note?.includes('Vitality'))).toBe(true);
  });

  // The card's own text tells the player to vault it, so this is the case that used to be broken:
  // following the instructions turned the benefit off.
  it('still applies once the card is unequipped and vaulted', () => {
    const file = warrior({ cardChoices: picked, enabledCardIds: [] });
    const sheet = sheetBreakdown(file);
    expect(sheet.stressMax.contributions.some((c) => c.note?.includes('Vitality'))).toBe(true);
    expect(sheet.maxHp.contributions.some((c) => c.note?.includes('Vitality'))).toBe(true);
  });

  it('is not counted twice when the card IS equipped', () => {
    const file = warrior({ cardChoices: picked, enabledCardIds: [VITALITY] });
    const hits = sheetBreakdown(file).stressMax.contributions.filter((c) => c.note?.includes('Vitality'));
    expect(hits).toHaveLength(1);
  });

  it('stops only when the card is gone from every category', () => {
    const file = warrior({ cardChoices: picked, enabledCardIds: [], domainCardIds: [] });
    const sheet = sheetBreakdown(file);
    expect(sheet.stressMax.contributions.some((c) => c.note?.includes('Vitality'))).toBe(false);
    expect(unequippedPermanentSources(file)).toEqual([]);
  });

  it('grants nothing while unequipped if the player never chose', () => {
    const file = warrior({ enabledCardIds: [] });
    expect(unequippedPermanentSources(file)).toEqual([]);
  });
});

describe('undo and re-equip', () => {
  // History stores snapshots, so a restored snapshot brings the pick back with it. What matters is
  // that the pick lives ON the file, which this asserts by round-tripping one.
  it('keeps the pick through a snapshot round trip', () => {
    const file = warrior({ cardChoices: { [VITALITY]: [1, 2] } });
    const restored = JSON.parse(JSON.stringify(file)) as CharacterFile;
    expect(effectsForCardId(VITALITY, restored).map((e) => e.target)).toEqual(['maxHp', 'majorThreshold', 'severeThreshold']);
  });

  it('re-equipping does not disturb the pick', () => {
    const file = warrior({ cardChoices: { [VITALITY]: [0] }, enabledCardIds: [VITALITY] });
    const unequipped = { ...file, enabledCardIds: [] };
    const reequipped = { ...unequipped, enabledCardIds: [VITALITY] };
    expect(effectsForCardId(VITALITY, reequipped).map((e) => e.target)).toEqual(['stressMax']);
  });
});

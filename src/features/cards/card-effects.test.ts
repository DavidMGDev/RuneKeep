import { type CharacterFile, sheetBreakdown, toSheetCharacter } from '@/lib/character-file';
import { VOID_ANCESTRIES } from '@/data/void-ancestries';
import { cardHasEffects, catalogIdOf, contentIdOf, editableCardIds, effectsForCardId, findEditableCard, isEditableCard, refOf, sourceLabelForCardId } from './card-effects';

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

describe('embedded library cards (v0.10.3)', () => {
  it('resolves a custom armor library card to score + threshold effects', () => {
    const f = baseFile({ libraryCards: [{ id: 'lc-arm', contentType: 'armor', title: 'Hide', text: '', imageUri: null, armor: { baseScore: 5, thresholds: '8/16', tier: 1 } }] });
    expect(effectsForCardId('lc-arm', f)).toEqual([
      { target: 'armorScore', mode: 'bonus', delta: 5 },
      { target: 'majorThreshold', mode: 'set', delta: 8 },
      { target: 'severeThreshold', mode: 'set', delta: 16 },
    ]);
  });
  it('labels a custom card by its title', () => {
    const f = baseFile({ libraryCards: [{ id: 'lc-x', contentType: 'generic', title: 'Relic', text: '', imageUri: null }] });
    expect(sourceLabelForCardId('lc-x', f)).toBe('Relic');
  });
});

describe('effectsForCardId', () => {
  it('resolves a weapon feature to its effects', () => {
    expect(effectsForCardId('wpn-greatsword')).toEqual([{ target: 'evasion', delta: -1 }]);
  });
  it('resolves armor and catalog cards', () => {
    // Armor grants its ARMOR SCORE (#297) and SETS the damage thresholds when enabled (#242 item 9,
    // parsed from "5 / 11"); the unarmored base is now 0, so the score arrives as a modifier.
    expect(effectsForCardId('arm-gambeson')).toEqual([
      { target: 'evasion', delta: 1 },
      { target: 'armorScore', mode: 'bonus', delta: 3 },
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

describe('mixed ancestry effect filtering (#265)', () => {
  it('keeps a passive on the ACTIVE half, drops it on the crossed-out half', () => {
    // Giant's +1 Max HP is trait 1 ("Endurance").
    const asFirst = baseFile({ mixedAncestry: { first: 'ancestry-giant', second: 'ancestry-human' } });
    expect(effectsForCardId('ancestry-giant', asFirst)[0]).toMatchObject({ target: 'maxHp', delta: 1 });
    const asSecond = baseFile({ mixedAncestry: { first: 'ancestry-human', second: 'ancestry-giant' } });
    expect(effectsForCardId('ancestry-giant', asSecond)).toEqual([]); // Reach (trait 2) → no Max HP
  });
  it('handles a trait-2 passive (Simiah Nimble = +1 Evasion)', () => {
    const keep = baseFile({ mixedAncestry: { first: 'ancestry-human', second: 'ancestry-simiah' } });
    expect(effectsForCardId('ancestry-simiah', keep)[0]).toMatchObject({ target: 'evasion', delta: 1 });
    const drop = baseFile({ mixedAncestry: { first: 'ancestry-simiah', second: 'ancestry-human' } });
    expect(effectsForCardId('ancestry-simiah', drop)).toEqual([]);
  });
  it('a no-passive ancestry contributes nothing either way', () => {
    const file = baseFile({ mixedAncestry: { first: 'ancestry-drakona', second: 'ancestry-katari' } });
    expect(effectsForCardId('ancestry-drakona', file)).toEqual([]);
    expect(effectsForCardId('ancestry-katari', file)).toEqual([]);
  });
  // v0.25.0: the Elf gained one. Celestial Trance was a hard-coded rule in rest.ts and is now an
  // effect, so it has to obey the same mixed-ancestry rule as every other passive. It is feature 2.
  it('the Elf keeps Celestial Trance as the SECOND pick and loses it as the first', () => {
    const keep = baseFile({ mixedAncestry: { first: 'ancestry-drakona', second: 'ancestry-elf' } });
    expect(effectsForCardId('ancestry-elf', keep)[0]).toMatchObject({ target: 'restMoves', delta: 1 });
    const drop = baseFile({ mixedAncestry: { first: 'ancestry-elf', second: 'ancestry-drakona' } });
    expect(effectsForCardId('ancestry-elf', drop)).toEqual([]);
  });
  it('single-ancestry characters are unaffected', () => {
    expect(effectsForCardId('ancestry-giant', baseFile())[0]).toMatchObject({ target: 'maxHp', delta: 1 });
  });
  it('end-to-end: a mixed Giant(1st)+Human(2nd) gets +1 Max HP but NOT +1 Stress', () => {
    const c = toSheetCharacter(
      baseFile({ mixedAncestry: { first: 'ancestry-giant', second: 'ancestry-human' }, enabledCardIds: ['ancestry-giant', 'ancestry-human'] }),
    );
    const plain = toSheetCharacter(baseFile());
    expect(c.maxHp).toBe(plain.maxHp + 1); // Giant Endurance (trait 1) applies
    expect(c.stress.total).toBe(plain.stress.total); // Human High Stamina (trait 1) is crossed out → no +1 Stress
  });
});

describe('Void structured ancestries (v0.12.3)', () => {
  const earthkin = VOID_ANCESTRIES.find((a) => a.id === 'ancestry-earthkin')!;
  it('Earthkin carries the Stoneskin passive on trait 1; the other 5 carry none', () => {
    expect(earthkin.ancestryEffectTrait).toBe(1);
    expect(earthkin.effects).toEqual([
      { target: 'armorScore', mode: 'bonus', delta: 1, note: expect.any(String) },
      { target: 'majorThreshold', mode: 'bonus', delta: 1, note: expect.any(String) },
      { target: 'severeThreshold', mode: 'bonus', delta: 1, note: expect.any(String) },
    ]);
    for (const a of VOID_ANCESTRIES) if (a.id !== 'ancestry-earthkin') expect(a.effects ?? []).toEqual([]);
  });
  it('applies Stoneskin as a single ancestry, drops it only when its trait is crossed out in a mix', () => {
    const single = baseFile({ ancestryCardId: 'ancestry-earthkin', libraryCards: [earthkin] });
    expect(effectsForCardId('ancestry-earthkin', single)).toEqual(earthkin.effects);
    // Earthkin picked SECOND keeps trait 2 → Stoneskin (trait 1) is crossed out → dropped.
    const drop = baseFile({ mixedAncestry: { first: 'ancestry-giant', second: 'ancestry-earthkin' }, libraryCards: [earthkin] });
    expect(effectsForCardId('ancestry-earthkin', drop)).toEqual([]);
    // Earthkin picked FIRST keeps trait 1 → Stoneskin stays.
    const keep = baseFile({ mixedAncestry: { first: 'ancestry-earthkin', second: 'ancestry-giant' }, libraryCards: [earthkin] });
    expect(effectsForCardId('ancestry-earthkin', keep)).toEqual(earthkin.effects);
  });
});

describe('custom ancestry without an authored effect-trait (v0.13.2 #359)', () => {
  // A homebrew ancestry with a passive but NO ancestryEffectTrait (the "Passive on feature line" chip
  // was removed): the passive rides Feature 1 by convention, so it drops when Feature 1 is crossed out.
  const custom = {
    id: 'lc-emberkin', contentType: 'ancestry' as const, title: 'Emberkin', text: '', imageUri: null,
    effects: [{ target: 'evasion' as const, delta: 1 }],
    sections: [{ body: 'Cinderborn', feature: true }, { body: 'Ashwalk', feature: true }],
  };
  it('single ancestry applies the passive', () => {
    expect(effectsForCardId('lc-emberkin', baseFile({ libraryCards: [custom] }))).toEqual(custom.effects);
  });
  it('picked SECOND (Feature 1 crossed out) drops the passive', () => {
    const drop = baseFile({ mixedAncestry: { first: 'ancestry-giant', second: 'lc-emberkin' }, libraryCards: [custom] });
    expect(effectsForCardId('lc-emberkin', drop)).toEqual([]);
  });
  it('picked FIRST (Feature 2 crossed out) keeps the passive', () => {
    const keep = baseFile({ mixedAncestry: { first: 'lc-emberkin', second: 'ancestry-giant' }, libraryCards: [custom] });
    expect(effectsForCardId('lc-emberkin', keep)).toEqual(custom.effects);
  });
});

describe('card copies — synced references (#277)', () => {
  it('refOf resolves a copy to its source; a plain duplicate is its OWN card (v0.34.8)', () => {
    const file = baseFile({ cardCopies: [{ id: 'cp-1', ref: 'wpn-greatsword' }] });
    expect(refOf('cp-1', file)).toBe('wpn-greatsword');
    expect(refOf('wpn-greatsword', file)).toBe('wpn-greatsword');
    // Two of the same weapon picked up separately are two weapons: their own equip, own tokens.
    expect(refOf('wpn-greatsword#2', file)).toBe('wpn-greatsword#2');
    // Their CONTENT still resolves to the one card they are both printed from.
    expect(contentIdOf('wpn-greatsword#2', file)).toBe('wpn-greatsword');
    expect(contentIdOf('cp-1', file)).toBe('wpn-greatsword');
    expect(sourceLabelForCardId('wpn-greatsword#2', file)).toBe(sourceLabelForCardId('wpn-greatsword', file));
  });
  it('a copy resolves its effects via the underlying card', () => {
    const file = baseFile({ cardCopies: [{ id: 'cp-g', ref: 'ancestry-giant' }] });
    expect(effectsForCardId('cp-g', file)[0]).toMatchObject({ target: 'maxHp', delta: 1 });
  });
  it('the effect applies ONCE no matter how many copies are enabled', () => {
    const plain = toSheetCharacter(baseFile());
    // enabledCardIds holds refs; even a duplicated ref dedupes to a single application.
    const c = toSheetCharacter(baseFile({ cardCopies: [{ id: 'cp-g', ref: 'ancestry-giant' }], enabledCardIds: ['ancestry-giant', 'ancestry-giant'] }));
    expect(c.maxHp).toBe(plain.maxHp + 1); // +1, not +2
  });
});

describe('per-card effect overrides (#278)', () => {
  it('a player override replaces a catalog card effects', () => {
    const file = baseFile({ cardEffectOverrides: { 'ancestry-giant': [{ target: 'evasion', delta: 5 }] } });
    expect(effectsForCardId('ancestry-giant', file)).toEqual([{ target: 'evasion', delta: 5 }]);
    expect(effectsForCardId('ancestry-giant', baseFile())[0]).toMatchObject({ target: 'maxHp', delta: 1 }); // catalog stands without override
  });
  it('an override applies to all copies (keyed by catalog id)', () => {
    const file = baseFile({ cardEffectOverrides: { 'wpn-greatsword': [{ target: 'strength', delta: 1 }] } });
    expect(effectsForCardId('wpn-greatsword#2', file)).toEqual([{ target: 'strength', delta: 1 }]);
  });
  it('lets the user ADD effects to a catalog card that had none', () => {
    const file = baseFile({ cardEffectOverrides: { 'wpn-longsword': [{ target: 'maxHp', delta: 2 }] } });
    expect(effectsForCardId('wpn-longsword', file)).toEqual([{ target: 'maxHp', delta: 2 }]);
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
  it('base thresholds are level-based and armor score is 0 when no armor is enabled (#242/#297)', () => {
    const c = toSheetCharacter(baseFile()); // level 1, armor NOT enabled
    expect(c.damageThresholds).toEqual({ major: 1, severe: 2 }); // Major = level, Severe = 2×level
    expect(c.armorScore).toBe(0); // #297: unarmored = 0; armor adds its score only when equipped
  });

  it('an unarmored character scales Major = level, Severe = 2×level (#320)', () => {
    expect(toSheetCharacter(baseFile({ level: 3 })).damageThresholds).toEqual({ major: 3, severe: 6 });
    expect(toSheetCharacter(baseFile({ level: 5 })).damageThresholds).toEqual({ major: 5, severe: 10 });
  });

  it('enabling armor SETS the thresholds + adds your level; a bonus card stacks on top (#242/#320)', () => {
    const set = toSheetCharacter(baseFile({ enabledCardIds: ['arm-chainmail'] })); // 7 / 15, level 1
    expect(set.damageThresholds).toEqual({ major: 8, severe: 16 }); // #320: set 7/15 + level (1)
    const bonus = toSheetCharacter(
      baseFile({
        customCards: [{ id: 'cc-thr', title: 'Wardstone', text: '', imageUri: null, target: 'inventory', effects: [{ target: 'majorThreshold', mode: 'bonus', delta: 2 }] }],
        enabledCardIds: ['arm-chainmail', 'cc-thr'],
      }),
    );
    expect(bonus.damageThresholds).toEqual({ major: 10, severe: 16 }); // set 7 + level 1 + Wardstone 2
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

  it('always adds your level to an armor set, per level from level 1 (#282/#320)', () => {
    const l1 = toSheetCharacter(baseFile({ enabledCardIds: ['arm-chainmail'] })); // L1, chainmail sets 7/15
    expect(l1.damageThresholds).toEqual({ major: 8, severe: 16 }); // #320: set 7/15 + level (1)
    const l2 = toSheetCharacter(baseFile({ level: 2, enabledCardIds: ['arm-chainmail'] }));
    expect(l2.damageThresholds).toEqual({ major: 9, severe: 17 }); // set 7/15 + level (2)
    const l3 = toSheetCharacter(baseFile({ level: 3, enabledCardIds: ['arm-chainmail'] }));
    expect(l3.damageThresholds).toEqual({ major: 10, severe: 18 }); // set 7/15 + level (3)
  });
  it('the level threshold bonus appears in the breakdown attributed to each level (#282/#320)', () => {
    const b = sheetBreakdown(baseFile({ level: 3, enabledCardIds: ['arm-chainmail'] }));
    const sources = b.majorThreshold.contributions.map((c) => c.source);
    expect(sources).toContain('Level 1'); // #320: now from level 1
    expect(sources).toContain('Level 3');
    expect(b.majorThreshold.total).toBe(10); // set 7 + level (3)
  });
  it('never exceeds the HP cap of 12', () => {
    const file = baseFile({
      customCards: [{ id: 'cc-hp', title: 'HP Ring', text: '', imageUri: null, target: 'inventory', effects: [{ target: 'maxHp', delta: 9 }] }],
      enabledCardIds: ['cc-hp'],
    });
    expect(toSheetCharacter(file).maxHp).toBe(12); // 7 + 9 clamped to 12
  });
});

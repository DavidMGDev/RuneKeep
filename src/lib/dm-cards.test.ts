import { asCopy, asUpdate, copyName, planImports } from './import-characters';
import { DM_CARD_ID, dmCardOf, dmEffectsOf, dmPartyCardId, isDmCardId, isPartyCardId, partyCardOf, setDmEffects, setPartyEffects, stripDmCards } from './dm-cards';
import { markMemberUpdated, newParty, setGlobalEffects } from './party';
import type { CharacterFile } from './character-file';

const FILE = { id: 'ch-1', name: 'Auren', level: 3, customCards: [], enabledCardIds: [] } as unknown as CharacterFile;

describe('DM modifiers as a card', () => {
  it('creates nothing until there is a modifier', () => {
    const f = setDmEffects(FILE, []);
    expect(dmCardOf(f)).toBeUndefined();
    expect(f.enabledCardIds).toEqual([]);
  });

  it('creates the card equipped on the first modifier', () => {
    const f = setDmEffects(FILE, [{ target: 'evasion', delta: -1 }]);
    expect(dmCardOf(f)?.title).toBe('DM Changes');
    expect(f.enabledCardIds).toContain(DM_CARD_ID);
    expect(dmEffectsOf(f)).toHaveLength(1);
  });

  it('replaces the modifier list rather than appending to it', () => {
    let f = setDmEffects(FILE, [{ target: 'evasion', delta: -1 }]);
    f = setDmEffects(f, [{ target: 'maxHp', delta: 2 }]);
    expect(dmEffectsOf(f)).toEqual([{ target: 'maxHp', delta: 2 }]);
    expect((f.customCards ?? []).filter((c) => c.id === DM_CARD_ID)).toHaveLength(1);
  });

  it('removes the card, its equip and its mute with the last modifier', () => {
    let f = setDmEffects(FILE, [{ target: 'evasion', delta: -1 }]);
    f = { ...f, modifiersOffCardIds: [DM_CARD_ID] };
    f = setDmEffects(f, []);
    expect(dmCardOf(f)).toBeUndefined();
    expect(f.enabledCardIds).not.toContain(DM_CARD_ID);
    expect(f.modifiersOffCardIds).not.toContain(DM_CARD_ID);
  });

  it('leaves the player’s own cards alone', () => {
    const own = { ...FILE, customCards: [{ id: 'cc-1', title: 'Mine', text: '', imageUri: null, target: 'arsenal' as const }] };
    const f = setDmEffects(own, [{ target: 'evasion', delta: 1 }]);
    expect(f.customCards?.map((c) => c.id)).toContain('cc-1');
  });
});

describe('party modifiers as a card', () => {
  it('files one card per party, named after it', () => {
    let f = setPartyEffects(FILE, 'pt-1', 'The Wardens', [{ target: 'stressMax', delta: 1 }]);
    f = setPartyEffects(f, 'pt-2', 'Night Crew', [{ target: 'hopeMax', delta: 1 }]);
    expect(partyCardOf(f, 'pt-1')?.title).toBe('The Wardens Effects');
    expect(partyCardOf(f, 'pt-2')?.title).toBe('Night Crew Effects');
    expect(f.enabledCardIds).toEqual([dmPartyCardId('pt-1'), dmPartyCardId('pt-2')]);
  });

  it('clearing one party leaves the other standing', () => {
    let f = setPartyEffects(FILE, 'pt-1', 'A', [{ target: 'stressMax', delta: 1 }]);
    f = setPartyEffects(f, 'pt-2', 'B', [{ target: 'hopeMax', delta: 1 }]);
    f = setPartyEffects(f, 'pt-1', 'A', []);
    expect(partyCardOf(f, 'pt-1')).toBeUndefined();
    expect(partyCardOf(f, 'pt-2')).toBeDefined();
  });

  it('knows which ids it owns', () => {
    expect(isDmCardId(DM_CARD_ID)).toBe(true);
    expect(isDmCardId(dmPartyCardId('pt-9'))).toBe(true);
    expect(isPartyCardId(DM_CARD_ID)).toBe(false);
    expect(isDmCardId('cc-1')).toBe(false);
  });
});

describe('importing a character that is already here', () => {
  const roster = [{ id: 'ch-1', name: 'Auren' }, { id: 'ch-9', name: 'Auren 2' }];

  it('spots the collision by id, not by name', () => {
    const other = { ...FILE, id: 'ch-7', name: 'Auren' } as CharacterFile;
    expect(planImports([FILE, other], roster).map((p) => p.collides)).toEqual([true, false]);
  });

  it('numbers a copy from the lowest free number', () => {
    expect(copyName('Auren', roster)).toBe('Auren 3');
    expect(copyName('Auren', [{ id: 'x', name: 'Auren' }])).toBe('Auren 2');
    expect(copyName('Nobody', roster)).toBe('Nobody');
  });

  it('a copy is a new character with the DM’s work left behind', () => {
    const dressed = setDmEffects(FILE, [{ target: 'evasion', delta: -2 }]);
    const copy = asCopy(dressed, roster, 'ch-new');
    expect(copy.id).toBe('ch-new');
    expect(copy.name).toBe('Auren 3');
    expect(dmCardOf(copy)).toBeUndefined();
  });

  it('an update keeps the id and drops every DM card', () => {
    let incoming = setDmEffects(FILE, [{ target: 'evasion', delta: -2 }]);
    incoming = setPartyEffects(incoming, 'pt-1', 'A', [{ target: 'maxHp', delta: 1 }]);
    const updated = asUpdate(incoming);
    expect(updated.id).toBe('ch-1');
    expect(updated.customCards).toEqual([]);
    expect(updated.enabledCardIds).toEqual([]);
  });

  it('stripping is a no-op on a character no DM has touched', () => {
    expect(stripDmCards(FILE)).toBe(FILE);
  });
});

describe('party modifiers and the update tally', () => {
  const base = { ...newParty('Wardens'), memberIds: ['a', 'b'] };

  it('clears only once every member has handed in a sheet', () => {
    let p = setGlobalEffects(base, [{ target: 'evasion', delta: -1 }]);
    const first = markMemberUpdated(p, 'a');
    expect(first.cleared).toBe(false);
    expect(first.party.globalEffects).toHaveLength(1);
    const second = markMemberUpdated(first.party, 'b');
    expect(second.cleared).toBe(true);
    expect(second.party.globalEffects).toBeUndefined();
    p = second.party;
    expect(p.globalUpdated).toBeUndefined();
  });

  it('does not let one member count twice', () => {
    const p = setGlobalEffects(base, [{ target: 'evasion', delta: -1 }]);
    const once = markMemberUpdated(p, 'a');
    const twice = markMemberUpdated(once.party, 'a');
    expect(twice.cleared).toBe(false);
    expect(twice.party.globalUpdated).toEqual(['a']);
  });

  it('ignores a character who is not in the party', () => {
    const p = setGlobalEffects(base, [{ target: 'evasion', delta: -1 }]);
    expect(markMemberUpdated(p, 'z').cleared).toBe(false);
    expect(markMemberUpdated(p, 'z').party.globalUpdated).toEqual([]);
  });

  it('starts the tally over when the modifiers are replaced', () => {
    let p = setGlobalEffects(base, [{ target: 'evasion', delta: -1 }]);
    p = markMemberUpdated(p, 'a').party;
    p = setGlobalEffects(p, [{ target: 'maxHp', delta: 1 }]);
    expect(p.globalUpdated).toEqual([]);
    expect(markMemberUpdated(p, 'b').cleared).toBe(false);
  });

  it('says nothing happened when the party has no shared modifiers', () => {
    expect(markMemberUpdated(base, 'a')).toEqual({ party: base, cleared: false });
  });
});

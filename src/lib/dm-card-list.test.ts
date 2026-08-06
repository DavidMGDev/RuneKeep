import { dmCategories, fileDecks, type SeedCard } from './dm-card-list';
import type { CharacterFile } from './character-file';

const FILE = { id: 'ch-1', name: 'Auren', level: 3 } as unknown as CharacterFile;

const SEEDS: SeedCard[] = [
  { id: 'dom-1', cat: 'abilities' },
  { id: 'dom-2', cat: 'abilities' },
  { id: 'kit-warrior-0', cat: 'inventory' },
  { id: 'note-1', cat: 'notes' },
  { id: 'ws-bear', cat: 'wildshape' },
];

describe('filing the cards the sheet built', () => {
  it('keeps every card in the category it came from', () => {
    expect(fileDecks(FILE, SEEDS)).toEqual({
      abilities: ['dom-1', 'dom-2'],
      inventory: ['kit-warrior-0'],
      notes: ['note-1'],
      wildshape: ['ws-bear'],
    });
  });

  it('carries the starting kit, which the character file never mentions', () => {
    // The regression this module was rewritten for: the kit is derived from the class, so walking the
    // file could not find it and a player's default inventory was invisible to their DM.
    expect(fileDecks(FILE, SEEDS).inventory).toContain('kit-warrior-0');
  });

  it('honours a card the player moved', () => {
    const moved = { ...FILE, cardCategory: { 'dom-1': 'archive' } } as CharacterFile;
    const decks = fileDecks(moved, SEEDS);
    expect(decks.archive).toEqual(['dom-1']);
    expect(decks.abilities).toEqual(['dom-2']);
  });

  it('never lets a Beastform card leave, or anything else in', () => {
    const moved = { ...FILE, cardCategory: { 'ws-bear': 'inventory', 'dom-1': 'wildshape' } } as CharacterFile;
    const decks = fileDecks(moved, SEEDS);
    expect(decks.wildshape).toEqual(['ws-bear']);
    expect(decks.abilities).toContain('dom-1');
  });

  it('drops what the player deleted', () => {
    const decks = fileDecks({ ...FILE, removedCardIds: ['dom-1', 'note-1'] } as CharacterFile, SEEDS);
    expect(decks.abilities).toEqual(['dom-2']);
    expect(decks.notes).toBeUndefined();
  });

  it('places a copy where its source sits, unless it was moved', () => {
    const copied = { ...FILE, cardCopies: [{ id: 'dom-1-copy', ref: 'dom-1' }] } as CharacterFile;
    expect(fileDecks(copied, SEEDS).abilities).toEqual(['dom-1', 'dom-2', 'dom-1-copy']);
    const moved = { ...copied, cardCategory: { 'dom-1-copy': 'archive' } } as CharacterFile;
    expect(fileDecks(moved, SEEDS).archive).toEqual(['dom-1-copy']);
  });

  it('ignores a copy of a card that is not there', () => {
    const orphan = { ...FILE, cardCopies: [{ id: 'x-copy', ref: 'nope' }] } as CharacterFile;
    expect(Object.values(fileDecks(orphan, SEEDS)).flat()).not.toContain('x-copy');
  });

  it('sorts by the order the player dragged them into', () => {
    const ordered = { ...FILE, cardOrder: { abilities: ['dom-2', 'dom-1'] } } as CharacterFile;
    expect(fileDecks(ordered, SEEDS).abilities).toEqual(['dom-2', 'dom-1']);
  });
});

describe('which categories to offer', () => {
  it('offers only the ones holding something, in ring order', () => {
    const decks = fileDecks(FILE, SEEDS);
    expect(dmCategories(FILE, decks).map((c) => c.key)).toEqual(['abilities', 'inventory', 'notes', 'wildshape']);
  });

  it('names the vault by its new name and a custom category by its own', () => {
    const withCustom = { ...FILE, customCategories: [{ id: 'cat-x', label: 'Spells', icon: 'star' }], cardCategory: { 'dom-1': 'cat-x', 'dom-2': 'archive' } } as unknown as CharacterFile;
    const cats = dmCategories(withCustom, fileDecks(withCustom, SEEDS));
    expect(cats.map((c) => c.label)).toContain('Vault');
    expect(cats.map((c) => c.label)).toContain('Spells');
  });
});

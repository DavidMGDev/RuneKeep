import { characterCardsByCategory, dmCategories } from './dm-card-list';
import type { CharacterFile } from './character-file';

const FILE = {
  id: 'ch-1',
  name: 'Auren',
  level: 3,
  domainCardIds: ['dom-1', 'dom-2'],
  ancestryCardId: 'anc-1',
  communityCardId: 'com-1',
  subclassCardId: 'sub-1',
  weaponPrimaryId: 'wpn-1',
  armorId: 'arm-1',
  inventoryItemIds: ['item-rope'],
  experiences: [{ id: 'exp-1', title: 'Sailor', text: '', imageUri: null }],
  customCards: [
    { id: 'cc-arsenal', title: 'A', text: '', imageUri: null, target: 'arsenal' as const },
    { id: 'cc-inv', title: 'B', text: '', imageUri: null, target: 'inventory' as const },
  ],
  notes: [{ id: 'note-1', title: 'N', text: '', imageUri: null }],
} as unknown as CharacterFile;

describe('filing a character’s cards for the DM', () => {
  it('files each kind of card where the sheet would', () => {
    const decks = characterCardsByCategory(FILE);
    expect(decks.abilities).toEqual(['dom-1', 'dom-2', 'anc-1', 'com-1', 'sub-1', 'wpn-1', 'exp-1', 'cc-arsenal']);
    expect(decks.inventory).toEqual(['cc-inv', 'arm-1', 'item-rope']);
    expect(decks.notes).toEqual(['note-1']);
  });

  it('an explicit move by the player wins over the default', () => {
    const moved = { ...FILE, cardCategory: { 'dom-1': 'archive', 'note-1': 'inventory' } } as CharacterFile;
    const decks = characterCardsByCategory(moved);
    expect(decks.archive).toEqual(['dom-1']);
    expect(decks.abilities).not.toContain('dom-1');
    expect(decks.inventory).toContain('note-1');
  });

  it('leaves out cards the player deleted', () => {
    const decks = characterCardsByCategory({ ...FILE, removedCardIds: ['dom-1', 'note-1'] } as CharacterFile);
    expect(decks.abilities).not.toContain('dom-1');
    expect(decks.notes).toBeUndefined();
  });

  it('never lists one card twice, however many fields mention it', () => {
    const dup = { ...FILE, acquiredCardIds: ['dom-1', 'wpn-1'] } as CharacterFile;
    const all = Object.values(characterCardsByCategory(dup)).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('follows the player’s own ordering inside a category', () => {
    const ordered = { ...FILE, cardOrder: { abilities: ['sub-1', 'anc-1'] } } as CharacterFile;
    const decks = characterCardsByCategory(ordered);
    expect(decks.abilities.slice(0, 2)).toEqual(['sub-1', 'anc-1']);
  });

  it('lists a copy as a card of its own', () => {
    const copied = { ...FILE, cardCopies: [{ id: 'dom-1-copy', ref: 'dom-1' }], cardCategory: { 'dom-1-copy': 'archive' } } as CharacterFile;
    expect(characterCardsByCategory(copied).archive).toEqual(['dom-1-copy']);
  });
});

describe('which categories to offer', () => {
  it('offers only the ones holding something, in ring order', () => {
    const decks = characterCardsByCategory(FILE);
    expect(dmCategories(FILE, decks).map((c) => c.key)).toEqual(['abilities', 'inventory', 'notes']);
  });

  it('names the vault by its new name and custom categories by theirs', () => {
    const withCustom = { ...FILE, customCategories: [{ id: 'cat-x', label: 'Spells', icon: 'star' }], cardCategory: { 'dom-1': 'cat-x', 'dom-2': 'archive' } } as unknown as CharacterFile;
    const decks = characterCardsByCategory(withCustom);
    const cats = dmCategories(withCustom, decks);
    expect(cats.map((c) => c.label)).toContain('Vault');
    expect(cats.map((c) => c.label)).toContain('Spells');
    expect(cats[cats.length - 1].key).toBe('cat-x'); // custom categories come after the built-ins
  });
});

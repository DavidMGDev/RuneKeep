import { CATALOG } from '@/data/catalog';
import { ALL_LOOT } from '@/data/loot-data';
import { PRIMARY_WEAPONS } from '@/data/equipment-data';

import { itemExists, itemTitleFor, MISSING_ITEM } from './item-title';
import type { LibraryCard } from './library';

const own: LibraryCard[] = [
  { id: 'lc-1', contentType: 'inventory', title: 'A coil of rope', text: '', imageUri: null },
  { id: 'lc-2', contentType: 'inventory', title: '  ', text: '', imageUri: null },
];

describe('itemTitleFor', () => {
  it('names a card from the expansion being edited', () => {
    expect(itemTitleFor('lc-1', own)).toBe('A coil of rope');
  });

  it('names a card the author has not titled yet, rather than calling it missing', () => {
    expect(itemTitleFor('lc-2', own)).toBe('Untitled');
  });

  it('names a base-game loot item', () => {
    const loot = ALL_LOOT[0];
    expect(itemTitleFor(loot.id, own)).toBe(loot.name);
  });

  it('names a base-game weapon', () => {
    const w = PRIMARY_WEAPONS[0];
    expect(itemTitleFor(w.id, own)).toBe(w.name);
  });

  it('names a catalog card, which is what a domain card picked by an older pack is', () => {
    const c = CATALOG.find((x) => x.kind === 'domain')!;
    expect(itemTitleFor(c.id, own)).toBe(c.label);
  });

  it('says a genuinely missing card is missing, and says it only then', () => {
    expect(itemTitleFor('nothing-at-all', own)).toBe(MISSING_ITEM);
  });

  it('copes with no expansion cards at all', () => {
    expect(itemTitleFor(ALL_LOOT[0].id, undefined)).toBe(ALL_LOOT[0].name);
  });

  it('prefers the expansion own card when an id somehow collides', () => {
    const shadow: LibraryCard[] = [{ id: ALL_LOOT[0].id, contentType: 'inventory', title: 'Mine', text: '', imageUri: null }];
    expect(itemTitleFor(ALL_LOOT[0].id, shadow)).toBe('Mine');
  });
});

describe('itemExists', () => {
  it('is true for anything that resolves and false only for what does not', () => {
    expect(itemExists('lc-1', own)).toBe(true);
    expect(itemExists(ALL_LOOT[0].id, own)).toBe(true);
    expect(itemExists('nothing-at-all', own)).toBe(false);
  });
});

import { type CharacterFile } from './character-file';
import { addFavorite, favoriteCopies, hasFavorites, isFavorited, orphanedFavoriteIds, removeFavoriteByRef, removeFavoriteCopies, toggleFavorite } from './favorites';

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

let seq = 0;
const makeId = () => `fav-test-${seq++}`;

describe('favorites (v0.9.8)', () => {
  beforeEach(() => { seq = 0; });

  it('addFavorite creates a duplicate copy routed to the favorites category', () => {
    const f = addFavorite(baseFile(), 'valor-01-1', makeId);
    expect(f.cardCopies).toEqual([{ id: 'fav-test-0', ref: 'valor-01-1' }]);
    expect(f.cardCategory?.['fav-test-0']).toBe('favorites');
    expect(favoriteCopies(f).map((c) => c.ref)).toEqual(['valor-01-1']);
    expect(hasFavorites(f)).toBe(true);
  });

  it('cannot favorite the same card twice (one favorite per card ref)', () => {
    let f = addFavorite(baseFile(), 'valor-01-1', makeId);
    f = addFavorite(f, 'valor-01-1', makeId);
    expect(f.cardCopies).toHaveLength(1);
  });

  it('a second copy of the same card is its own card, so its own favorite (v0.34.8)', () => {
    const f = addFavorite(baseFile(), 'valor-01-1', makeId);
    expect(isFavorited(f, 'valor-01-1')).toBe(true);
    // Held twice = two cards. Starring one is not starring the other, which is what the owner
    // asked for: identical cards are only linked when you have deliberately copied one.
    expect(isFavorited(f, 'valor-01-1#2')).toBe(false);
    expect(isFavorited(f, 'blade-01-1')).toBe(false);
  });

  it('un-favorite removes only the favorite copy and leaves the source untouched', () => {
    const base = baseFile({ domainCardIds: ['valor-01-1'] });
    const f = addFavorite(base, 'valor-01-1', makeId);
    const back = removeFavoriteCopies(f, ['fav-test-0']);
    expect(hasFavorites(back)).toBe(false);
    expect(back.cardCopies).toEqual([]);
    expect(back.domainCardIds).toEqual(['valor-01-1']); // original is never affected
  });

  it('toggleFavorite adds then removes', () => {
    const on = toggleFavorite(baseFile(), 'valor-01-1');
    expect(hasFavorites(on)).toBe(true);
    const off = toggleFavorite(on, 'valor-01-1');
    expect(hasFavorites(off)).toBe(false);
  });

  it('removeFavoriteByRef un-favorites from the source side', () => {
    const f = addFavorite(baseFile(), 'blade-01-1', makeId);
    expect(isFavorited(removeFavoriteByRef(f, 'blade-01-1'), 'blade-01-1')).toBe(false);
  });

  it('orphanedFavoriteIds drops favorites whose last live source was deleted', () => {
    const f = addFavorite(baseFile(), 'valor-01-1', makeId);
    const live = [
      { id: 'valor-01-1', ref: 'valor-01-1' }, // the source
      { id: 'fav-test-0', ref: 'valor-01-1' }, // the favorite copy
    ];
    // nothing deleted → favorite stays
    expect(orphanedFavoriteIds(f, live, new Set())).toEqual([]);
    // delete the source → favorite is orphaned
    expect(orphanedFavoriteIds(f, live, new Set(['valor-01-1']))).toEqual(['fav-test-0']);
  });

  it('orphanedFavoriteIds keeps a favorite while any non-favorite copy of the ref survives', () => {
    const f = addFavorite(baseFile(), 'valor-01-1', makeId);
    const live = [
      { id: 'valor-01-1', ref: 'valor-01-1' },
      { id: 'valor-01-1#2', ref: 'valor-01-1' }, // a normal duplicate still present
      { id: 'fav-test-0', ref: 'valor-01-1' },
    ];
    expect(orphanedFavoriteIds(f, live, new Set(['valor-01-1']))).toEqual([]); // #2 still backs it
  });
});

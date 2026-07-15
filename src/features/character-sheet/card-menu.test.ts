import { cardMenuOptions } from './card-menu';
import { availableCategories, activeRing } from './carousel-categories';

describe('cardMenuOptions (v0.10.7)', () => {
  it('offers the full action set, gating Send NFC on availability', () => {
    expect(cardMenuOptions(false, false).map((o) => o.kind)).toEqual(['duplicate', 'favorite', 'move', 'delete']);
    expect(cardMenuOptions(false, true).map((o) => o.kind)).toEqual(['duplicate', 'favorite', 'move', 'delete', 'nfc']);
  });
  it('in the Favorites mirror the ONLY action is Unfavorite (never Duplicate/Move/Delete)', () => {
    expect(cardMenuOptions(true, true).map((o) => o.kind)).toEqual(['unfavorite']);
    expect(cardMenuOptions(true, false).map((o) => o.kind)).toEqual(['unfavorite']);
  });
});

describe('Favorites is hidden from the ring (v0.10.7)', () => {
  it('never appears in availableCategories, even with favorites present', () => {
    expect(availableCategories({ isDruid: true, hasCompanion: true, hasFavorites: true })).not.toContain('favorites');
  });
  it('never appears in the active ring', () => {
    expect(activeRing({ isDruid: false, hasCompanion: false, hasFavorites: true })).not.toContain('favorites');
  });
});

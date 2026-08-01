import { cardMenuOptions } from './card-menu';
import { availableCategories, activeRing } from './carousel-categories';

describe('cardMenuOptions (v0.10.7)', () => {
  it('offers the same five wedges wherever it opens (v0.30.0)', () => {
    // The count is what the wheel hit-tests against, so it must not depend on the hardware.
    expect(cardMenuOptions(false, false).map((o) => o.kind)).toEqual(['bulkEquip', 'favorite', 'move', 'delete', 'nfc']);
    expect(cardMenuOptions(false, true).map((o) => o.kind)).toEqual(['bulkEquip', 'favorite', 'move', 'delete', 'nfc']);
  });
  it('names the share wedge for what the device can actually do', () => {
    expect(cardMenuOptions(false, true).find((o) => o.kind === 'nfc')?.label).toBe('Share');
    expect(cardMenuOptions(false, false).find((o) => o.kind === 'nfc')?.label).toBe('Export');
  });
  it('in the Favorites mirror the ONLY action is Unfavorite (never Duplicate/Move/Delete)', () => {
    expect(cardMenuOptions(true, true).map((o) => o.kind)).toEqual(['unfavorite']);
    expect(cardMenuOptions(true, false).map((o) => o.kind)).toEqual(['unfavorite']);
  });
  it('flips the Favorite label to Unfavorite when the whole selection is already favorited (item 9)', () => {
    const kinds = cardMenuOptions(false, false, true).map((o) => o.kind);
    expect(kinds).toEqual(['bulkEquip', 'favorite', 'move', 'delete', 'nfc']); // kind + order stay stable
    const fav = cardMenuOptions(false, false, true).find((o) => o.kind === 'favorite');
    expect(fav?.label).toBe('Unfavorite');
    expect(cardMenuOptions(false, false, false).find((o) => o.kind === 'favorite')?.label).toBe('Favorite');
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

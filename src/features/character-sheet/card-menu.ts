/**
 * The Golden Gear Edit card-hold radial menu options (v0.10.7). ONE source of truth so the wheel that
 * renders the wedges and the dispatcher that fires the chosen action never drift. In the hidden
 * Favorites mirror the only safe action is Unfavorite — Duplicate/Move/Delete would touch the original.
 */
// v0.19.1 item 8: the old `duplicate` slot is now `bulkEquip` — equip/unequip the whole selection at once.
// Copying cards moved to the Move panel's "Copy instead of move" toggle.
export type CardMenuKind = 'bulkEquip' | 'favorite' | 'move' | 'delete' | 'nfc' | 'unfavorite';

export interface CardMenuOption {
  kind: CardMenuKind;
  label: string;
}

/**
 * The wheel options. `allFavorited` (item 9): when EVERY selected card is already favorited the
 * Favorite slot flips to "Unfavorite" (its kind stays `favorite`; the handler toggles). A partial
 * selection keeps "Favorite" — firing it favorites only the ones that aren't yet. Option COUNT and
 * ORDER never depend on `allFavorited`, so the index→kind mapping stays stable for the dispatcher.
 */
export function cardMenuOptions(isFavorites: boolean, nfcAvailable: boolean, allFavorited = false): CardMenuOption[] {
  if (isFavorites) return [{ kind: 'unfavorite', label: 'Unfavorite' }];
  return [
    { kind: 'bulkEquip', label: 'Equip All' },
    { kind: 'favorite', label: allFavorited ? 'Unfavorite' : 'Favorite' },
    { kind: 'move', label: 'Move' },
    { kind: 'delete', label: 'Delete' },
    // v0.30.0: always present. It used to appear only where the NFC radio did, which meant a browser
    // had no way to share a card at all; the panel it opens exports a `.rune` file when there is no
    // radio to tap. `nfcAvailable` now only decides what to CALL it, so the wedge count is constant
    // across platforms and the index→kind mapping the dispatcher relies on never shifts.
    { kind: 'nfc', label: nfcAvailable ? 'Share' : 'Export' },
  ];
}

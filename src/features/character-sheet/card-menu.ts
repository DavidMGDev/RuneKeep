/**
 * The Golden Gear Edit card-hold radial menu options (v0.10.7). ONE source of truth so the wheel that
 * renders the wedges and the dispatcher that fires the chosen action never drift. In the hidden
 * Favorites mirror the only safe action is Unfavorite — Duplicate/Move/Delete would touch the original.
 */
export type CardMenuKind = 'duplicate' | 'favorite' | 'move' | 'delete' | 'nfc' | 'unfavorite';

export interface CardMenuOption {
  kind: CardMenuKind;
  label: string;
}

export function cardMenuOptions(isFavorites: boolean, nfcAvailable: boolean): CardMenuOption[] {
  if (isFavorites) return [{ kind: 'unfavorite', label: 'Unfavorite' }];
  const opts: CardMenuOption[] = [
    { kind: 'duplicate', label: 'Duplicate' },
    { kind: 'favorite', label: 'Favorite' },
    { kind: 'move', label: 'Move' },
    { kind: 'delete', label: 'Delete' },
  ];
  if (nfcAvailable) opts.push({ kind: 'nfc', label: 'Send NFC' });
  return opts;
}

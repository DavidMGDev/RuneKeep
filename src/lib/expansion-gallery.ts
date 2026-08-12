/**
 * The expansion's cards as a GALLERY of real cards (v0.42.3, owner).
 *
 * "I want each card to be visible and rendered as cards not as fucking list items in separate
 * categories, I want cards, RENDERED CARDS as they look like in game, paginated to however many can
 * fit on a grid on my screen as a gallery where I can move through the pages of all the cards I have
 * created and tap them to edit the cards depending on their type, hold to select multiple cards and
 * even share / move from that selection mode."
 *
 * Only the arithmetic lives here: how many tiles fit, and which cards are on a page. The SELECTION
 * rules are not reimplemented, they are `features/character-sheet/gallery-select`, which already
 * encodes tap-focuses / hold-selects and the one trap that matters (a select mode with nothing
 * selected shows no footer, so it offers no way out). Two answers to that question would be two sets
 * of bugs.
 *
 * The page is derived from the measured viewport rather than fixed, because the app runs in a 412dp
 * phone frame, on a magnified tablet frame, and in a browser window somebody can resize.
 */

import { sortExpansionCards } from './expansion-sort';
import type { LibraryCard } from './library';

/** A forged card's aspect, so a tile's height follows from its width. */
export const TILE_ASPECT = 1.4;

/** How the grid comes out for a given viewport. */
export interface GridSpec {
  columns: number;
  rows: number;
  /** One tile's width in design px. */
  tileW: number;
  tileH: number;
  perPage: number;
}

/**
 * Fit as many whole tiles as the box holds, within a readable size.
 *
 * A minimum width, because a card small enough to fit twelve across is a card whose title cannot be
 * read, and the point of the gallery is recognising a card by looking at it. A maximum, because two
 * enormous cards on a tablet is not a gallery either.
 */
export function gridFor(width: number, height: number, gap = 10, minTile = 84, maxTile = 132): GridSpec {
  const columns = Math.max(1, Math.min(6, Math.floor((width + gap) / (minTile + gap))));
  const tileW = Math.max(minTile, Math.min(maxTile, (width - gap * (columns - 1)) / columns));
  const tileH = tileW * TILE_ASPECT;
  const rows = Math.max(1, Math.floor((height + gap) / (tileH + gap)));
  return { columns, rows, tileW, tileH, perPage: columns * rows };
}

/** The cards, sorted the way the editor lists them, cut into pages of `perPage`. */
export function galleryPages(cards: LibraryCard[], perPage: number): LibraryCard[][] {
  const sorted = sortExpansionCards(cards);
  const size = Math.max(1, perPage);
  if (!sorted.length) return [[]];
  const out: LibraryCard[][] = [];
  for (let i = 0; i < sorted.length; i += size) out.push(sorted.slice(i, i + size));
  return out;
}

/** Keep a page number inside a list that may have shrunk since it was set. */
export const clampPage = (page: number, pageCount: number): number => Math.max(0, Math.min(pageCount - 1, page));

/**
 * The page a particular card is on, so editing a card and coming back does not jump to page one.
 *
 * Returns 0 for a card that is not there, which is what a just-deleted card should do.
 */
export function pageOfCard(pages: LibraryCard[][], id: string): number {
  const i = pages.findIndex((p) => p.some((c) => c.id === id));
  return i < 0 ? 0 : i;
}

/** What a selection of this size can be told to do, phrased for a button. */
export const selectionLabel = (n: number): string => (n === 1 ? '1 card' : `${n} cards`);

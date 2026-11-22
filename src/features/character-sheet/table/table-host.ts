/**
 * What the play table needs from whatever it belongs to (v0.49.0).
 *
 * On a character's sheet that is the carousel's context, unchanged. The DM screen has no carousel and no character,
 * so it provides this narrower thing instead, and the table cannot tell the two apart except where `dm` says so.
 */
import { createContext, type ReactNode, useContext } from 'react';

import { useCarousel, useCarouselMaybe } from '../carousel-context';
import type { DeckLook } from './deck-look';
import type { TableAction } from './table-dice';

type Carousel = ReturnType<typeof useCarousel>;

export type TableRow = { label: string; onPress: () => void; danger?: boolean; gap?: boolean; hidden?: boolean };

/** What only the DM screen's table has. */
export interface TableDm {
  /** The table a campaign starts at. */
  start: DeckLook;
  /** The control dice, in place of Cards, State and Sort deck. */
  controls: TableAction[];
  /** What a card can have done to it, by its id (the table adds its own rows round these). */
  cardRows: (id: string) => TableRow[];
  /** What an empty deck says. */
  emptyDeck: string;
  /** The counters' corner button and its rows on the table's menu. `add` takes shares of the felt. */
  counters: { open: () => void; add: (at?: { x: number; y: number }) => void };
  /** Drawn on the felt, given its size (the Fear tracker and the counters). */
  layer?: (w: number, h: number) => ReactNode;
}

export interface TableHost extends Pick<Carousel,
  | 'decks' | 'category' | 'ring' | 'categoryMeta' | 'setCategory' | 'cycleCategory' | 'openFavorites'
  | 'enabledIds' | 'cardStates' | 'crossOuts' | 'toggleCard' | 'isFavorited' | 'cardAction' | 'nfcAvailable' | 'onReorderCards'
  | 'cardTokens' | 'tokenColor' | 'setTokenColor' | 'placeToken' | 'removeToken' | 'updateToken'> {
  dm?: TableDm;
}

export const TableHostContext = createContext<TableHost | null>(null);

export function useTableHost(): TableHost {
  const given = useContext(TableHostContext);
  const carousel = useCarouselMaybe();
  const host = given ?? carousel;
  if (!host) throw new Error('the play table needs a carousel or a TableHostContext round it');
  return host;
}

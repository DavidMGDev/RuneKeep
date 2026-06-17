import { type ClassName } from '@/constants/identity';
import { type TraitKey } from '@/features/character-sheet/character';
import { type ExperienceDef } from '@/lib/character-file';
import { type GoldAmount } from './components/gold-card';

// ---------- draft ----------

export type CardDeckKey = 'class' | 'subclass' | 'ancestry' | 'community' | 'domains';
export type DeckKey = CardDeckKey | 'traits' | 'experiences' | 'weapons' | 'armor' | 'inventory';

export const isCardDeck = (k: DeckKey): k is CardDeckKey => k === 'class' || k === 'subclass' || k === 'ancestry' || k === 'community' || k === 'domains';
/** Decks that drive the STRAIGHT carousel (card scans + forged cards), incl. weapons/armor/inventory. */
export const isCarouselDeck = (k: DeckKey): boolean => isCardDeck(k) || k === 'weapons' || k === 'armor' || k === 'inventory';

export interface Draft {
  name: string;
  portraitUri: string | null;
  className: ClassName | null;
  subclassCardId: string | null;
  ancestryCardId: string | null;
  /** Mixed ancestry (#265): two ancestries — `first` keeps its 1st trait, `second` keeps its 2nd.
   *  null = single-ancestry mode. While picking, either slot may be null. */
  mixedAncestry: { first: string | null; second: string | null } | null;
  communityCardId: string | null;
  domainCardIds: string[];
  traits: Partial<Record<TraitKey, number>>;
  experiences: ExperienceDef[];
  weaponPrimaryId: string | null;
  weaponSecondaryId: string | null;
  armorId: string | null;
  /** Inventory (#128): selected suggested-item ids (+ a synthetic 'item-gold'), and user-authored
   *  custom item cards. */
  inventoryItemIds: string[];
  inventoryCustom: ExperienceDef[];
  gold: GoldAmount;
}

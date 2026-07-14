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

/**
 * v0.10.6 (Feature 3): which mixed-ancestry slot the Random button fills next, and the alternation
 * state to carry forward. Empty slots fill in order (first, then second) so a deselect always refills
 * that slot; once both are full, Random alternates re-rolling first ↔ second. `alt` is the tie-breaker
 * used only when both are full. Pure so the exact Random-press sequence is unit-testable.
 */
export function nextMixSlot(
  first: string | null,
  second: string | null,
  alt: 'first' | 'second',
): { slot: 'first' | 'second'; alt: 'first' | 'second' } {
  if (!first) return { slot: 'first', alt };
  if (!second) return { slot: 'second', alt };
  return { slot: alt, alt: alt === 'first' ? 'second' : 'first' };
}

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
  /** Inventory (#128): selected suggested-item ids. Custom in-creation items were removed in v0.10.2
   *  (homebrew items now come from Library expansions). */
  inventoryItemIds: string[];
  /** v0.10.3 (B4): custom homebrew INVENTORY cards (from enabled expansions) selected this creation.
   *  Loose items — they ride the inventory deck. Structural/armor customs are held by their slot ids. */
  inventoryLibIds: string[];
  /** v0.10.2 (Feature 3): explicitly skip a step that's otherwise required — start with no weapon / no
   *  armor / no inventory picks. Selecting a real item clears the matching flag. */
  weaponsSkipped?: boolean;
  armorSkipped?: boolean;
  inventorySkipped?: boolean;
  gold: GoldAmount;
}

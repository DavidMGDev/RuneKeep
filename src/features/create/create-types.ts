import { type ClassName } from '@/constants/identity';
import { type TraitKey } from '@/features/character-sheet/character';
import { type ExperienceDef } from '@/lib/character-file';
import { type GoldAmount } from './components/gold-card';

// ---------- draft ----------

export type CardDeckKey = 'class' | 'subclass' | 'ancestry' | 'community' | 'domains' | 'transformation';
/** v0.36 adds three CHARACTERIZE-only steps: `carry` (what the stat block hands over), `level`, and
 *  `transformation`. They never appear in ordinary character creation. */
export type DeckKey = CardDeckKey | 'carry' | 'level' | 'traits' | 'experiences' | 'weapons' | 'armor' | 'inventory';

export const isCardDeck = (k: DeckKey): k is CardDeckKey => k === 'class' || k === 'subclass' || k === 'ancestry' || k === 'community' || k === 'domains' || k === 'transformation';
/** Decks that drive the STRAIGHT carousel (card scans + forged cards), incl. weapons/armor/inventory. */
export const isCarouselDeck = (k: DeckKey): boolean => isCardDeck(k) || k === 'carry' || k === 'weapons' || k === 'armor' || k === 'inventory';

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
  /** DEPRECATED by `inventorySkips` (v0.26.0). Kept so a saved draft from an older build still loads. */
  inventorySkipped?: boolean;
  /** v0.26.0: which of the class guide's two inventory choices the player deliberately took nothing
   *  from. Per choice, because the two are separate questions. */
  inventorySkips?: number[];
  gold: GoldAmount;
  // --- v0.36 CHARACTERIZE. All optional, so an ordinary creation draft is byte-identical. ---
  /** The combatant this character is being made from, and where it came back to. */
  characterize?: { encounterId: string; combatantId: string; side: 'adversary' | 'ally' };
  /** Steps the DM pressed Skip on. A skipped step counts as done and takes its default. */
  skipped?: DeckKey[];
  /** The NAME, which is not a deck but is a step in the skip menu. */
  nameSkipped?: boolean;
  /** v0.36.3: steps the DM has actually touched. A value the stat block seeded is not one of them,
   *  so the skip menu can tell 'you answered this' from 'this arrived with an answer'. */
  touched?: (DeckKey | 'name')[];
  /** Carry-over item ids the DM greyed out on the first step. Greyed = dropped entirely. */
  carryDisabled?: string[];
  /** The level chosen on the Level step (characterize only). Absent = whatever the stat block said. */
  level?: number;
  transformationCardId?: string | null;
}

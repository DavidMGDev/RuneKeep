import { TRAIT_ORDER } from '@/features/character-sheet/character';
import { GOLD_DEFAULT } from './components/gold-card';
import { type DeckKey, type Draft } from './create-types';

/** The rulebook's starting spread (#107): one +2, two +1, two 0, one −1, any order. */
export const TRAIT_POOL = [2, 1, 1, 0, 0, -1];

export const EMPTY: Draft = {
  name: '',
  portraitUri: null,
  className: null,
  subclassCardId: null,
  ancestryCardId: null,
  mixedAncestry: null,
  communityCardId: null,
  domainCardIds: [],
  traits: {},
  experiences: [],
  weaponPrimaryId: null,
  weaponSecondaryId: null,
  armorId: null,
  inventoryItemIds: [],
  inventoryLibIds: [],
  gold: GOLD_DEFAULT,
};

/** Synthetic ancestry-carousel cards (#265): the last card toggles single↔mixed mode. */
export const MIXED_ANCESTRY_ID = 'ancestry-mixed';
export const SINGLE_ANCESTRY_ID = 'ancestry-single';

export function deckDone(deck: DeckKey, d: Draft): boolean {
  switch (deck) {
    case 'class':
      return !!d.className;
    case 'subclass':
      return !!d.subclassCardId;
    case 'ancestry':
      return d.mixedAncestry ? !!(d.mixedAncestry.first && d.mixedAncestry.second) : !!d.ancestryCardId;
    case 'community':
      return !!d.communityCardId;
    case 'domains':
      return d.domainCardIds.length === 2;
    case 'traits':
      return TRAIT_ORDER.every((t) => d.traits[t.key] !== undefined);
    case 'experiences':
      return d.experiences.length === 2;
    case 'weapons':
      return d.weaponsSkipped || !!d.weaponPrimaryId; // primary required, or explicitly skipped (v0.10.2)
    case 'armor':
      return d.armorSkipped || !!d.armorId;
    case 'inventory':
      // v0.26.0: the guide asks TWO questions, and the step is done when both have an answer. Taking
      // nothing counts as an answer. An older draft that set the whole-step skip still counts.
      return d.inventorySkipped || (d.inventoryItemIds.length + (d.inventorySkips?.length ?? 0)) >= 2 || (d.inventoryLibIds?.length ?? 0) > 0;
  }
}

export const DECKS: { key: DeckKey; label: string; stub?: boolean }[] = [
  { key: 'class', label: 'Class' },
  { key: 'subclass', label: 'Subclass' },
  { key: 'ancestry', label: 'Ancestry' },
  { key: 'community', label: 'Community' },
  { key: 'domains', label: 'Domains' },
  { key: 'traits', label: 'Traits' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'weapons', label: 'Weapons' },
  { key: 'armor', label: 'Armor' },
  { key: 'inventory', label: 'Inventory' },
];

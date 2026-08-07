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
  // v0.36: SKIP answers a step. A stat block being characterized does not have to acquire a
  // community it never had, so every step but Class can be answered with nothing, and Forge arms.
  if (d.skipped?.includes(deck)) return true;
  switch (deck) {
    case 'carry':
      // Reviewing what is carried over is not a decision that can be left unmade: the DM either
      // greys things out or does not, and either way the step is answered the moment it is seen.
      return true;
    case 'level':
      return d.level !== undefined;
    case 'transformation':
      return !!d.transformationCardId;
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

/**
 * The rail, for the kind of creation this is (v0.36, owner).
 *
 * Characterize leads with what the stat block hands over, because that is the one screen where the
 * DM is reviewing rather than choosing, and it should be settled before anything is decided. Level
 * rides with it for the same reason: it is another number the stat block worked out, not a choice.
 * Then the ordinary order, with Transform sitting after Ancestry, where it reads as another thing
 * you ARE rather than another thing you carry.
 */
export function decksFor(characterize: boolean, transformations: boolean): { key: DeckKey; label: string; stub?: boolean }[] {
  /**
   * TRANSFORM is not characterize-only (v0.36.2, owner).
   *
   * Enabling a pack that adds transformations turns the step on for everyone, players included, and
   * a player gets a Skip on it because being a vampire is not something the game asks of you. The
   * two new steps above it stay characterize-only: a player has nothing to inherit and levels up
   * through play rather than choosing a level at creation.
   */
  const withTransform = (list: { key: DeckKey; label: string; stub?: boolean }[]) =>
    !transformations ? list : list.flatMap((d) => (d.key === 'ancestry' ? [d, { key: 'transformation' as DeckKey, label: 'Transform' }] : [d]));
  if (!characterize) return withTransform(DECKS);
  const out: { key: DeckKey; label: string; stub?: boolean }[] = [
    // v0.36.1 (owner): LEVEL sits with Inherit, not after Class. Both are things the stat block
    // decided; Class is the first thing the DM decides, so the two groups should not interleave.
    { key: 'carry', label: 'Inherit' },
    { key: 'level', label: 'Level' },
  ];
  // Only when the pack is switched on in the app's own expansion list. A step listing six cards the
  // app has been told not to show would be a step that cannot be answered.
  return [...out, ...withTransform(DECKS)];
}

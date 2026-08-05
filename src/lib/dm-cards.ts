/**
 * A DM's modifiers, as cards on the character (v0.35, owner).
 *
 * The DM wants to say "you are at −1 Evasion in this storm" without opening five character sheets and
 * authoring five cards by hand. That is exactly what this does, except the player still ends up with a
 * card, because a card is the only thing in this app that can carry a modifier.
 *
 * ## Why a card and not a new kind of thing
 *
 * Everything the app already does to cards, it does to these for free: the modifier engine applies
 * them, the Modifiers panel shows where a number came from, a history snapshot rewinds them, an export
 * carries them, and an import that overwrites a character removes them (which is precisely the rule
 * the owner asked for in item 10). A parallel "DM modifiers" store would have needed every one of
 * those written again, and would have been wrong in a different way each time.
 *
 * Two cards, told apart by their id:
 *  - **DM Changes** — this DM's adjustments to THIS character. Editable and per-modifier toggleable
 *    from the DM panel; the player can see it and unequip it like any card, but cannot flip the
 *    individual switches.
 *  - **Party Effects** — the party-wide set, written identically onto every CHARACTER in the party.
 *    Read-only everywhere except the party sheet's own panel, so there is exactly one place it is
 *    managed. Allies never receive one: they are combatant-shaped entries with their own stat model.
 *
 * Pure: no React, no theme, no I/O. The colours are literals rather than theme imports so this module
 * stays loadable in a plain unit test.
 */

import type { CardEffect } from './modifiers';
import type { CharacterFile, CustomCardDef } from './character-file';

/** The one DM-changes card on a character. Fixed, because there is only ever one. */
export const DM_CARD_ID = 'rk-dm-changes';

/** The party card's id carries the party, so a character in two parties keeps both straight. */
export function dmPartyCardId(partyId: string): string {
  return `rk-dmparty-${partyId}`;
}

/** Whether a card id is one this module owns, and therefore not the player's to author. */
export function isDmCardId(id: string): boolean {
  return id === DM_CARD_ID || id.startsWith('rk-dmparty-');
}

/** Whether a card id is a PARTY card, which is read-only outside the party sheet. */
export function isPartyCardId(id: string): boolean {
  return id.startsWith('rk-dmparty-');
}

// The DM palette's desaturated steel, and a colder blue for the party card, so the two are told apart
// on the carousel at a glance without reading them.
const DM_COLOR = '#4A5160';
const PARTY_COLOR = '#3B4A63';

const DM_TEXT = 'Changes your DM has made to this character. They can switch each one on and off from their own screen.';
const PARTY_TEXT = 'Effects on the whole party, set by your DM. They are managed from the party sheet, so they cannot be changed here.';

function makeCard(id: string, title: string, effects: CardEffect[], color: string, text: string): CustomCardDef {
  return { id, title, text, imageUri: null, color, effects, typeLabel: 'DM', target: 'arsenal' };
}

/** The character's DM-changes card, if they have one. */
export function dmCardOf(file: CharacterFile): CustomCardDef | undefined {
  return (file.customCards ?? []).find((c) => c.id === DM_CARD_ID);
}

/** The character's card for one party, if they have one. */
export function partyCardOf(file: CharacterFile, partyId: string): CustomCardDef | undefined {
  return (file.customCards ?? []).find((c) => c.id === dmPartyCardId(partyId));
}

/** Every DM-owned card on a character, whoever wrote it. */
export function dmCardsOf(file: CharacterFile): CustomCardDef[] {
  return (file.customCards ?? []).filter((c) => isDmCardId(c.id));
}

/**
 * Write one DM-owned card onto a file, or take it away when it has nothing left to say.
 *
 * The card is created LAZILY, on the first modifier, so a character the DM has not touched carries
 * nothing at all, and it is removed with the last one rather than left behind as an empty card that
 * does nothing and cannot be explained.
 *
 * It is equipped when it is created, because a DM's adjustment that needs the player to equip
 * something before it applies is not an adjustment, it is a request.
 */
function writeCard(file: CharacterFile, id: string, title: string, color: string, text: string, effects: CardEffect[]): CharacterFile {
  const others = (file.customCards ?? []).filter((c) => c.id !== id);
  const enabled = (file.enabledCardIds ?? []).filter((x) => x !== id);
  if (effects.length === 0) {
    return {
      ...file,
      customCards: others,
      enabledCardIds: enabled,
      // A card that no longer exists must not leave its per-card state behind.
      modifiersOffCardIds: (file.modifiersOffCardIds ?? []).filter((x) => x !== id),
    };
  }
  return { ...file, customCards: [...others, makeCard(id, title, effects, color, text)], enabledCardIds: [...enabled, id] };
}

/** Set (or clear) this DM's adjustments to one character. */
export function setDmEffects(file: CharacterFile, effects: CardEffect[]): CharacterFile {
  return writeCard(file, DM_CARD_ID, 'DM Changes', DM_COLOR, DM_TEXT, effects);
}

/** Set (or clear) one party's shared effects on one member. */
export function setPartyEffects(file: CharacterFile, partyId: string, partyName: string, effects: CardEffect[]): CharacterFile {
  const title = partyName.trim() ? `${partyName.trim()} Effects` : 'Party Effects';
  return writeCard(file, dmPartyCardId(partyId), title, PARTY_COLOR, PARTY_TEXT, effects);
}

/** This character's DM modifiers, or an empty list. */
export function dmEffectsOf(file: CharacterFile): CardEffect[] {
  return dmCardOf(file)?.effects ?? [];
}

export function partyEffectsOf(file: CharacterFile, partyId: string): CardEffect[] {
  return partyCardOf(file, partyId)?.effects ?? [];
}

/**
 * Every DM-owned card off a file (v0.35, item 10).
 *
 * Used when an incoming import overwrites a character the DM has already adjusted: the player's export
 * cannot legitimately contain one of these, and the DM's adjustments were made against the sheet that
 * is being replaced. Applying them to a new sheet would apply them twice as often as not.
 */
export function stripDmCards(file: CharacterFile): CharacterFile {
  const dmIds = new Set(dmCardsOf(file).map((c) => c.id));
  if (dmIds.size === 0) return file;
  return {
    ...file,
    customCards: (file.customCards ?? []).filter((c) => !dmIds.has(c.id)),
    enabledCardIds: (file.enabledCardIds ?? []).filter((id) => !dmIds.has(id)),
    modifiersOffCardIds: (file.modifiersOffCardIds ?? []).filter((id) => !dmIds.has(id)),
  };
}

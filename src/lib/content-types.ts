/**
 * INVENTED KINDS OF CARD, and the creation steps they bring with them (v0.43.0, owner).
 *
 * "As a user, I want to go into creating a new type of card... I need to make it so that the orders
 * of the knights are actually be selectable in character creation."
 *
 * A `type` card is a TEMPLATE: it declares that a kind of card exists. Cards name it with
 * `customType`, and from that single field everything else follows — the kind gets a filter chip in
 * the archive, a tab in ADD GEAR, a section in the pack's gallery, an entry in the library's type
 * chooser, and (if its author asked for one) a step in character creation.
 *
 * This module is the pure half: which types a set of cards declares, which cards belong to each, and
 * what the creation rail should show. Every screen reads it rather than re-deriving the same three
 * filters, because five screens quietly disagreeing about what belongs to a type is exactly the bug
 * this shape is meant to make impossible.
 */

import { type LibraryCard, typeStepPick } from './library';

/** A creation step's deck key. Namespaced so it can never collide with a built-in one. */
export const CUSTOM_STEP_PREFIX = 'custom:';

/** Whether a deck key belongs to an invented type rather than to the game. */
export const isCustomStep = (k: string): boolean => k.startsWith(CUSTOM_STEP_PREFIX);

/** The type card id a custom step is asking about. */
export const stepTypeId = (k: string): string => (isCustomStep(k) ? k.slice(CUSTOM_STEP_PREFIX.length) : '');

/** The deck key for one type. */
export const stepKeyFor = (typeId: string): string => `${CUSTOM_STEP_PREFIX}${typeId}`;

/** Every type these cards declare, in authoring order, with a name. An unnamed one is still in
 *  progress and has nothing to offer any list yet. */
export function contentTypes(cards: readonly LibraryCard[] | undefined): LibraryCard[] {
  return (cards ?? []).filter((c) => c.contentType === 'type' && c.title.trim());
}

/** The cards that belong to one type. */
export function cardsOfType(cards: readonly LibraryCard[] | undefined, typeId: string): LibraryCard[] {
  return (cards ?? []).filter((c) => c.customType === typeId);
}

/** One step the character creator should offer, resolved from a type card. */
export interface CustomStep {
  /** The type card's id. */
  typeId: string;
  /** Its deck key on the rail. */
  key: string;
  /** What the rail calls it. */
  label: string;
  /** How many cards it asks for. */
  pick: number;
  /** One line of guidance under the step's title, if the author wrote one. */
  hint?: string;
}

/**
 * The creation steps a set of cards asks for.
 *
 * A type only becomes a step when its author turned the step on AND the type has cards to offer: a
 * step with no answers is a step nobody can finish, and the Forge button would sit disabled with
 * nothing on screen explaining why.
 */
export function customSteps(cards: readonly LibraryCard[] | undefined): CustomStep[] {
  return contentTypes(cards)
    .filter((t) => t.typeSpec?.step && cardsOfType(cards, t.id).length > 0)
    .map((t) => ({
      typeId: t.id,
      key: stepKeyFor(t.id),
      label: (t.typeSpec?.stepLabel ?? '').trim() || t.title.trim(),
      pick: typeStepPick(t.typeSpec),
      hint: (t.typeSpec?.stepHint ?? '').trim() || undefined,
    }));
}

/**
 * The names an invented type contributes to the sheet's card-type picker.
 *
 * A player with the pack installed can write a card of that kind, which is the owner's "players who
 * have this expansion enabled will be able to create this type of card in the menu". The picker deals
 * in plain labels, so a type contributes the word its chip prints.
 */
export function typeLabelsFrom(cards: readonly LibraryCard[] | undefined): string[] {
  return contentTypes(cards).map((t) => (t.plaque?.label ?? '').trim() || t.title.trim());
}

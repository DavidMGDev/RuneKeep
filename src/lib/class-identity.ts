/**
 * A CLASS'S LOOK, decided once (v0.42.7, owner).
 *
 * "The goal is to have a cohesive class styling that only has to be done once, and by the time i go
 * into the card creator i already see the same style of its assigned class."
 *
 * Every card that belongs to a class should already look like it: its pages, its feature cards, its
 * subclasses. Until now each one carried its own colour and its own art and the author had to repeat
 * themselves on every card, and get it right every time.
 *
 * So a class has an IDENTITY: a title, a colour and a banner. It comes from the class's base card if
 * the class is homebrew, and from the bundled palette if it is one of the published ones. Everything
 * pointing at that class is drawn through it, at READ time, so recolouring the class recolours the
 * set and nothing has to be found and edited again.
 *
 * ## What a card keeps
 *
 * Its TYPE and its own words. A subclass drawn in its class's colours is still plaqued "Subclass"
 * (the owner's own exception), and a feature card is still a Feature. Identity is the paint, not the
 * card.
 */

import { type ClassName, classColor, classInfo, CLASSES } from '@/constants/identity';
import { classKeyOf } from './custom-class';
import type { LibraryCard } from './library';

/** What every card of one class shares. */
export interface ClassIdentity {
  title: string;
  /** The background colour, when the class has chosen one. */
  color?: string | null;
  /** The banner picture, when the class has one. Drawn at the published banner's box. */
  imageUri?: string | null;
  /** The bundled class this belongs to or borrows from, for the banner art and the palette. */
  key?: ClassName;
}

/** The bundled classes, by the name a card would name them with. */
const BUILTIN = new Map(CLASSES.map((c) => [classKeyOf(c.label), c]));

/**
 * The identity of the class this card names.
 *
 * A homebrew class's own base card wins; a published class falls back to its bundled colour, which is
 * what makes a page written for the Bard look like the Bard without the author choosing anything.
 * Returns nothing for a card that names no class, which is most cards.
 */
export function classIdentityFor(cards: LibraryCard[] | undefined, className: string | undefined): ClassIdentity | undefined {
  const key = classKeyOf(className);
  if (!key) return undefined;
  const base = (cards ?? []).find((c) => c.contentType === 'class' && c.classSpec?.role !== 'page' && classKeyOf(c.title) === key);
  if (base) {
    return { title: base.title.trim(), color: base.color, imageUri: base.imageUri, key: undefined };
  }
  const builtin = BUILTIN.get(key);
  if (builtin) return { title: builtin.label, color: classColor(builtin.key).deep, imageUri: null, key: builtin.key };
  // A class named but not present. Its name is still worth carrying: a page of it should say so.
  return { title: (className ?? '').trim() };
}

/**
 * A card, wearing its class's look.
 *
 * `keepTitle` is the difference between a PAGE and everything else. A page IS the class card, so it
 * takes the class's title (the owner: pages "must copy their title in the preview ui"). A feature
 * card or a subclass is its own card with its own name, and only the paint is inherited.
 */
export function withClassIdentity(card: LibraryCard, id: ClassIdentity | undefined, opts?: { keepTitle?: boolean }): LibraryCard {
  if (!id) return card;
  return {
    ...card,
    title: opts?.keepTitle === false ? id.title : card.title,
    // The card's own art wins if it has some; otherwise it inherits the class's banner.
    imageUri: card.imageUri ?? id.imageUri ?? null,
    color: card.color ?? id.color ?? null,
  };
}

/** A class page, which takes the title as well as the paint. */
export const withClassIdentityAsPage = (card: LibraryCard, id: ClassIdentity | undefined): LibraryCard =>
  withClassIdentity(card, id, { keepTitle: false });

/**
 * Whether this card kind should be painted in its class's colours.
 *
 * Pages, features and subclasses. Not the class card itself, which IS the identity, and not gear: a
 * rope handed out by a class is a rope.
 */
export const inheritsClassLook = (c: LibraryCard): boolean =>
  (c.contentType === 'class' && c.classSpec?.role === 'page') || c.contentType === 'feature' || c.contentType === 'subclass';

/**
 * The title a card should SHOW, once identity is applied.
 *
 * Only a page borrows one. This is what stops "give the class a name" being demanded of a page that
 * was always going to be called whatever its class is called (owner, item 10).
 */
export function displayTitle(card: LibraryCard, cards: LibraryCard[] | undefined): string {
  if (card.contentType === 'class' && card.classSpec?.role === 'page') {
    return classIdentityFor(cards, card.className)?.title || card.title.trim();
  }
  return card.title.trim();
}

/** The published classes, capitalised, for every list that offers one (owner, item 11). */
export const BUILTIN_CLASS_LABELS: string[] = CLASSES.map((c) => c.label);

/** The bundled key a label names, so a picked label can still resolve to art and a palette. */
export const builtinKeyFor = (label: string): ClassName | undefined => BUILTIN.get(classKeyOf(label))?.key;

/** A class's label, capitalised, whatever case the card carries. */
export const classDisplayName = (name: string | undefined): string => {
  const key = classKeyOf(name);
  const builtin = BUILTIN.get(key);
  if (builtin) return builtin.label;
  const t = (name ?? '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

void classInfo;

/**
 * WHICH CHIP A CARD WEARS (v0.43.0, owner).
 *
 * "Give me the capability to have more control over the chip when creating a class, a domain, and a
 * type."
 *
 * A chip is one word on a coloured band at the seam between a card's art and its text, and it is the
 * one place a card says what it is. Three kinds of card are TEMPLATES: a class, a custom domain and a
 * content type. Each declares a set, and the chip it chooses is the chip its whole set wears, for
 * exactly the reason a class's colour and banner already work that way (`lib/class-identity`): the
 * author should decide a look once and not have to repeat it on every card, correctly, every time.
 *
 * Resolution order, and only these three steps:
 *
 *  1. The card's OWN `plaque`, if it has one. A card is allowed to disagree with its set.
 *  2. Its TEMPLATE's `plaque` — its type, its domain, or its class, in that order.
 *  3. Nothing, which leaves the bundled palette (`KIND_THEMES`) exactly as it was.
 *
 * Pure, and given the pack rather than reaching for it, because the three callers hold three
 * different card lists: the library holds one expansion, the archive holds every installed pack, and
 * a character holds the copies embedded on its own file.
 */

import { classKeyOf } from './custom-class';
import type { LibraryCard, PlaqueSpec } from './library';

/** Whether this card is a TEMPLATE: a declaration of a set rather than a card anybody holds. */
export const isTemplateCard = (c: Pick<LibraryCard, 'contentType'>): boolean =>
  c.contentType === 'class' || c.contentType === 'customDomain' || c.contentType === 'type';

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

/**
 * The template card this one belongs to, if any.
 *
 * A class PAGE is excluded from being its own class's template on purpose: pages carry
 * `classSpec.role === 'page'` and the base card is the one that owns the look, which is the same rule
 * `classIdentityFor` follows.
 */
export function templateOf(card: LibraryCard, cards: readonly LibraryCard[] | undefined): LibraryCard | undefined {
  const pack = cards ?? [];
  if (card.customType) return pack.find((c) => c.contentType === 'type' && c.id === card.customType);
  if (card.contentType === 'domain' && norm(card.domain)) {
    return pack.find((c) => c.contentType === 'customDomain' && norm(c.title) === norm(card.domain));
  }
  const key = classKeyOf(card.className);
  if (key) return pack.find((c) => c.contentType === 'class' && c.classSpec?.role !== 'page' && classKeyOf(c.title) === key);
  return undefined;
}

/**
 * The chip spec that should be drawn for this card.
 *
 * A template never inherits: it IS the source, and a class page asking its own class would be the
 * same card asking itself. Everything else looks up exactly one level, which is enough — a domain
 * card belongs to a domain, not to a domain's class.
 */
export function resolvedPlaque(card: LibraryCard, cards?: readonly LibraryCard[]): PlaqueSpec | undefined {
  if (card.plaque && plaqueIsSet(card.plaque)) return card.plaque;
  return templateOf(card, cards)?.plaque;
}

/** Whether a spec says anything at all. An empty one is stored by the editor and means "the default". */
export const plaqueIsSet = (p: PlaqueSpec | undefined): boolean =>
  !!p && !!((p.label ?? '').trim() || p.from || p.to || p.text);

/**
 * A COPY of this card that carries its inherited chip outright (v0.43.0).
 *
 * An embedded card is meant to be self-contained: a character renders and resolves it with the pack
 * uninstalled, disabled or deleted, which is the whole reason `file.libraryCards` holds copies rather
 * than ids. A chip that had to be looked up in a pack would be the one part of the card that stopped
 * working the moment somebody removed it.
 *
 * So the copy is stamped at the moment it is made, and only then. In the library and the archive the
 * pack is present and the chip stays live, which is what lets an author recolour a type and see every
 * card of it change. A character keeps the chip it was given, exactly as it keeps the words.
 */
export function withResolvedPlaque(card: LibraryCard, pack?: readonly LibraryCard[]): LibraryCard {
  if (plaqueIsSet(card.plaque)) return card;
  const tpl = templateOf(card, pack);
  if (!tpl) return card;
  const base = tpl.plaque ?? {};
  // A type with no chip of its own still names its cards, so the name comes along as the label.
  const label = (base.label ?? '').trim() || (tpl.contentType === 'type' ? tpl.title.trim() : '');
  const spec: PlaqueSpec = { ...base, ...(label ? { label } : {}) };
  return plaqueIsSet(spec) ? { ...card, plaque: spec } : card;
}

/**
 * The label a card's chip prints.
 *
 * The card's OWN typeLabel still wins, because that is the field the sheet's type picker writes and a
 * player renaming their own card's chip should not be overruled by a pack. Then the resolved spec,
 * then the fallback the caller supplies (which is what kind of card it is).
 */
export function plaqueLabelFor(card: LibraryCard, fallback: string, cards?: readonly LibraryCard[]): string {
  const own = (card.typeLabel ?? '').trim();
  if (own) return own;
  if ((card.plaque?.label ?? '').trim()) return card.plaque!.label!.trim();
  const tpl = templateOf(card, cards);
  const inherited = (tpl?.plaque?.label ?? '').trim();
  if (inherited) return inherited;
  // A card of an invented kind says the KIND'S NAME when nothing else has named its chip. Without
  // this an Order of the Knights Radiant would print the word "Card", which is the one thing the
  // whole feature exists to stop.
  if (tpl?.contentType === 'type' && tpl.title.trim()) return tpl.title.trim();
  return fallback;
}

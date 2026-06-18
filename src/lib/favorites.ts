/**
 * Favorites (v0.9.8) — a special card category of DUPLICATES. A favorite is a `cardCopy` (so it shares
 * its source's enable state, effects, and now tokens/dice by `ref`) routed to the `favorites` category
 * via a `cardCategory` override. Favorites never appear in the Move panel — favoriting is its own action
 * (the star). Deleting a favorite just removes the copy (un-favorites, never touches the source);
 * deleting the last real source of a card cascades its favorites away. The category is unavailable until
 * there's ≥1 favorite, then it auto-joins the ring; the player may still toggle it off (then it's
 * reachable only via the Favorites button). All additive — built entirely on existing file fields.
 */
import type { CharacterFile } from './character-file';
import { catalogIdOf, refOf } from '@/features/cards/card-effects';

export const FAVORITES_CATEGORY = 'favorites';
export const FAVORITES_LABEL = 'Favorites';

/** The favorite copies on a file (cardCopies routed to the Favorites category). */
export function favoriteCopies(file: CharacterFile): { id: string; ref: string }[] {
  const cat = file.cardCategory ?? {};
  return (file.cardCopies ?? []).filter((c) => cat[c.id] === FAVORITES_CATEGORY);
}

/** Whether the character has any favorites at all (the category is unavailable when empty). */
export function hasFavorites(file: CharacterFile): boolean {
  return favoriteCopies(file).length > 0;
}

/** Whether a card (resolved by its underlying ref, so any duplicate counts) is already favorited. */
export function isFavorited(file: CharacterFile, cardId: string): boolean {
  const ref = refOf(cardId, file);
  return favoriteCopies(file).some((c) => c.ref === ref);
}

let favSeq = 0;
const newFavId = (): string => `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${favSeq++}`;

/** Add a favorite duplicate of a card. No-op (returns the same file) if it's already favorited. */
export function addFavorite(file: CharacterFile, sourceCardId: string, makeId: () => string = newFavId): CharacterFile {
  const ref = refOf(sourceCardId, file);
  if (favoriteCopies(file).some((c) => c.ref === ref)) return file;
  const id = makeId();
  return {
    ...file,
    cardCopies: [...(file.cardCopies ?? []), { id, ref }],
    cardCategory: { ...(file.cardCategory ?? {}), [id]: FAVORITES_CATEGORY },
  };
}

/** Remove specific favorite copies by their OWN ids (un-favorite from the favorites side). Never touches
 *  the source: tokens are ref-keyed and shared, so dropping the copy leaves the source's board intact. */
export function removeFavoriteCopies(file: CharacterFile, favIds: string[]): CharacterFile {
  const drop = new Set(favIds.filter((id) => (file.cardCategory ?? {})[id] === FAVORITES_CATEGORY));
  if (!drop.size) return file;
  const cardCategory = { ...(file.cardCategory ?? {}) };
  const cardTokens = { ...(file.cardTokens ?? {}) };
  for (const id of drop) { delete cardCategory[id]; delete cardTokens[id]; } // cardTokens[favId] is normally absent (ref-keyed)
  return { ...file, cardCopies: (file.cardCopies ?? []).filter((c) => !drop.has(c.id)), cardCategory, cardTokens };
}

/** Remove a card's favorite(s) from the SOURCE side (un-favorite by the source card's ref). */
export function removeFavoriteByRef(file: CharacterFile, sourceCardId: string): CharacterFile {
  const ref = refOf(sourceCardId, file);
  return removeFavoriteCopies(file, favoriteCopies(file).filter((c) => c.ref === ref).map((c) => c.id));
}

/** Toggle: favorite the card if it isn't, else remove its favorite. */
export function toggleFavorite(file: CharacterFile, sourceCardId: string): CharacterFile {
  return isFavorited(file, sourceCardId) ? removeFavoriteByRef(file, sourceCardId) : addFavorite(file, sourceCardId);
}

/** Cascade: drop favorites whose source ref no longer has any surviving NON-favorite live card.
 *  `liveCards` is the deck card list AFTER the primary deletion (each item carries id + ref). */
export function orphanedFavoriteIds(file: CharacterFile, liveCards: { id: string; ref?: string }[], deleted: Set<string>): string[] {
  const cat = file.cardCategory ?? {};
  const liveSourceRefs = new Set(
    liveCards.filter((c) => !deleted.has(c.id) && cat[c.id] !== FAVORITES_CATEGORY).map((c) => c.ref ?? catalogIdOf(c.id)),
  );
  return favoriteCopies(file).filter((c) => !deleted.has(c.id) && !liveSourceRefs.has(c.ref)).map((c) => c.id);
}

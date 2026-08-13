/**
 * Naming a picked card, wherever it came from (v0.42.4, owner).
 *
 * A class's starting-item lists print "A card that is no longer here" for most of what an author
 * picks. The lists are ids, and the thing resolving them only knew about the expansion's own gear and
 * the base game's loot tables. The picker, meanwhile, is the whole card browser: the catalog, every
 * enabled expansion's records, and this expansion's own cards. Three of the four sources were missing.
 *
 * So this asks EVERY source, in the order a card is most likely to have come from, and only says a
 * card is gone when none of them has heard of it. That distinction matters: "this item was deleted"
 * is worth telling an author, and it is useless if it is also what a working item looks like.
 */

import { cardById } from '@/data/catalog';
import { lootById } from '@/data/loot-data';
import { armorById, weaponById } from '@/data/equipment-data';
import type { LibraryCard } from './library';

/** What a genuinely missing card reads as. The only case where the author has something to fix. */
export const MISSING_ITEM = 'This card was deleted';

/**
 * The title of whatever this id names.
 *
 * `cards` is the expansion being edited plus anything else worth searching; passing the whole library
 * is fine and cheap, because the lookup is a scan of an array an author can count.
 */
export function itemTitleFor(id: string, cards: LibraryCard[] | undefined): string {
  const own = (cards ?? []).find((c) => c.id === id);
  if (own) return own.title.trim() || 'Untitled';
  const loot = lootById(id);
  if (loot) return loot.name;
  const w = weaponById(id);
  if (w) return w.name;
  const a = armorById(id);
  if (a) return a.name;
  const cat = cardById(id);
  if (cat) return cat.label;
  return MISSING_ITEM;
}

/** Whether this id resolves to anything at all, for a form that wants to flag the broken ones. */
export const itemExists = (id: string, cards: LibraryCard[] | undefined): boolean =>
  itemTitleFor(id, cards) !== MISSING_ITEM;

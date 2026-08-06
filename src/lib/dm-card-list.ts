/**
 * Filing a character's cards into decks, for the DM (v0.35, rewritten v0.35.3).
 *
 * v0.35 walked the character FILE to find the cards. That could never be right: the starting kit is
 * derived from the class, not stored, so a player's default inventory was invisible to the DM. The
 * cards are handed in now, by `features/dm/dm-decks`, which builds them from the same job list the
 * character sheet builds its own decks from.
 *
 * What is left here is the part that has nothing to do with rendering, and everything to do with what
 * the player has DONE to their decks: cards they deleted, cards they moved to another category,
 * copies they made, and the order they dragged them into. It is the same sequence of passes the sheet
 * applies, in the same order, and it is pure so it can be tested.
 */

import type { CharacterFile } from './character-file';

/** A card and the category it belongs to before the player's own arrangement is applied. */
export interface SeedCard {
  id: string;
  cat: string;
}

/** The categories this module files into, in the ring's order. Custom categories follow. */
export const DM_CATEGORY_ORDER = ['abilities', 'inventory', 'notes', 'wildshape', 'companion', 'martialform', 'archive'] as const;

/** Beastform and Martial Form cards are locked to their own decks, however they are moved. */
const LOCKED = new Set(['wildshape', 'martialform']);

/**
 * Apply the player's arrangement to a set of cards: drop what they deleted, honour where they moved
 * things, add their copies, and sort by the order they dragged them into.
 */
export function fileDecks(file: CharacterFile, seeds: SeedCard[]): Record<string, string[]> {
  const removed = new Set(file.removedCardIds ?? []);
  const override = file.cardCategory ?? {};
  const custom = new Set((file.customCategories ?? []).map((c) => c.id));
  const valid = new Set<string>([...DM_CATEGORY_ORDER, 'favorites', ...custom]);
  const out: Record<string, string[]> = {};
  const catOf = new Map<string, string>();

  const place = (id: string, natural: string) => {
    if (removed.has(id)) return;
    // A card locked to a special deck ignores any override, and nothing can be moved INTO one.
    const ov = override[id];
    const target = LOCKED.has(natural) ? natural : ov && valid.has(ov) && !LOCKED.has(ov) ? ov : natural;
    (out[target] ??= []).push(id);
    catOf.set(id, target);
  };

  for (const s of seeds) place(s.id, s.cat);
  // A copy is another window onto a card: its own id and position, its source's face. It defaults to
  // wherever its source sits, which is what makes "copy into the vault" land in the vault.
  for (const c of file.cardCopies ?? []) {
    const home = catOf.get(c.ref);
    if (!home || removed.has(c.id) || LOCKED.has(home)) continue;
    place(c.id, home);
  }

  const order = file.cardOrder ?? {};
  for (const [cat, ids] of Object.entries(out)) {
    const ord = order[cat];
    if (!ord?.length) continue;
    const rank = new Map(ord.map((id, i) => [id, i]));
    out[cat] = [...ids].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  }
  return out;
}

/** The categories that actually hold something, in ring order, with custom categories last. */
export function dmCategories(file: CharacterFile, decks: Record<string, { length: number }>): { key: string; label: string }[] {
  const custom = file.customCategories ?? [];
  const label = (key: string) =>
    custom.find((c) => c.id === key)?.label ??
    ({ abilities: 'Arsenal', inventory: 'Inventory', notes: 'Notes', wildshape: 'Beastform', companion: 'Companion', martialform: 'Martial Form', archive: 'Vault', favorites: 'Favorites' } as Record<string, string>)[key] ??
    key;
  const keys = [
    ...DM_CATEGORY_ORDER.filter((k) => decks[k]?.length),
    'favorites',
    ...custom.map((c) => c.id),
    ...Object.keys(decks),
  ].filter((k) => decks[k]?.length);
  return [...new Set(keys)].map((key) => ({ key, label: label(key) }));
}

/**
 * A character's cards, filed by category, for a DM (v0.35, owner).
 *
 * The character sheet assembles its decks inside its own render, interleaved with forging, live
 * cards, drag state and the carousel. None of that can be called from a DM screen, and lifting it out
 * would be a rewrite of the sheet in a release that already touches the engine.
 *
 * So this is a SEPARATE, smaller answer to a smaller question: which cards does this character hold,
 * and which category does each one belong to. It reads the same fields the sheet reads and applies the
 * same explicit override, so a card the player has moved is where the player put it. What it does NOT
 * do is forge anything, resolve multi-page faces, or order cards inside a category the way the sheet's
 * drag-and-drop does.
 *
 * ponytail: an approximation of the sheet's own filing, stated in one place so the two cannot drift
 * silently. If a DM ever needs to see the deck exactly as the player sees it, the sheet's assembly has
 * to come out of the sheet first.
 *
 * Pure: no React, no theme, no I/O.
 */

import type { CharacterFile } from './character-file';

/** The categories this module files into, in the ring's order. Custom categories appear after these,
 *  in the order the character defined them, and only when something is filed in one. */
export const DM_CATEGORY_ORDER = ['abilities', 'inventory', 'notes', 'wildshape', 'companion', 'martialform', 'archive'] as const;

/** Where a card goes when the player has not said otherwise. */
function defaultCategory(file: CharacterFile, id: string): string {
  if ((file.notes ?? []).some((n) => n.id === id)) return 'notes';
  if ((file.inventoryCustom ?? []).some((c) => c.id === id)) return 'inventory';
  const custom = (file.customCards ?? []).find((c) => c.id === id);
  if (custom) return custom.target === 'inventory' ? 'inventory' : 'abilities';
  if ((file.experiences ?? []).some((e) => e.id === id)) return 'abilities';
  if ((file.inventoryItemIds ?? []).includes(id)) return 'inventory';
  if (id === file.armorId) return 'inventory';
  return 'abilities';
}

/**
 * Every card the character holds, in filing order, with the category each one sits in.
 *
 * Deliberately a superset in the same spirit as `heldCardIds`: it exists to answer "show me their
 * cards", and a card that is hard to classify is better shown in the wrong drawer than not shown.
 */
export function characterCardsByCategory(file: CharacterFile): Record<string, string[]> {
  const removed = new Set(file.removedCardIds ?? []);
  const override = file.cardCategory ?? {};
  const out: Record<string, string[]> = {};
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (!id || removed.has(id) || seen.has(id)) return;
    seen.add(id);
    const cat = override[id] ?? defaultCategory(file, id);
    (out[cat] ??= []).push(id);
  };

  for (const id of file.domainCardIds ?? []) add(id);
  add(file.ancestryCardId);
  if (file.mixedAncestry) add(file.mixedAncestry.second);
  add(file.communityCardId);
  add(file.subclassCardId);
  add(file.multiclassSubclassCardId);
  add(file.weaponPrimaryId);
  add(file.weaponSecondaryId);
  for (const e of file.experiences ?? []) add(e.id);
  for (const c of file.customCards ?? []) add(c.id);
  add(file.armorId);
  for (const id of file.inventoryItemIds ?? []) add(id);
  for (const c of file.inventoryCustom ?? []) add(c.id);
  for (const id of file.acquiredCardIds ?? []) add(id);
  for (const c of file.libraryCards ?? []) add(c.id);
  for (const n of file.notes ?? []) add(n.id);
  // A copy is its own card in its own place; it just reads its content from somewhere else.
  for (const c of file.cardCopies ?? []) add(c.id);

  // Respect the player's own ordering where they have set one, so a DM sees the deck in the order the
  // player arranged it rather than in the order this function happens to walk the file.
  for (const [cat, ids] of Object.entries(out)) {
    const order = file.cardOrder?.[cat];
    if (!order) continue;
    const rank = new Map(order.map((id, i) => [id, i]));
    out[cat] = [...ids].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  }
  return out;
}

/** The categories that actually hold something, in ring order, with custom categories last. */
export function dmCategories(file: CharacterFile, decks: Record<string, string[]>): { key: string; label: string }[] {
  const custom = file.customCategories ?? [];
  const label = (key: string) =>
    custom.find((c) => c.id === key)?.label ??
    ({ abilities: 'Arsenal', inventory: 'Inventory', notes: 'Notes', wildshape: 'Beastform', companion: 'Companion', martialform: 'Martial Form', archive: 'Vault' } as Record<string, string>)[key] ??
    key;
  const keys = [
    ...DM_CATEGORY_ORDER.filter((k) => decks[k]?.length),
    ...custom.map((c) => c.id).filter((k) => decks[k]?.length),
    ...Object.keys(decks).filter((k) => !(DM_CATEGORY_ORDER as readonly string[]).includes(k) && !custom.some((c) => c.id === k) && decks[k]?.length),
  ];
  return [...new Set(keys)].map((key) => ({ key, label: label(key) }));
}

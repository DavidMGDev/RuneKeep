/**
 * Card-effects registry — resolves any deck card id to its structured `CardEffect[]` and a human
 * label, regardless of where the card comes from: equipment (weapons/armor), loot/consumables, the
 * catalog (domain/ancestry/community/subclass via the generated effect table), or a player-authored
 * custom card carried on the character file. This is the one lookup `toSheetCharacter` and the
 * Modifiers UI use, so they never need to know a card's category.
 */

import type { CardEffect } from '@/lib/modifiers';
import type { CharacterFile, ExperienceDef } from '@/lib/character-file';
import { armorById, weaponById } from '@/features/create/equipment-data';
import { lootById } from '@/lib/loot-data';
import { wildshapeById } from '@/lib/wildshape-data';
import { cardById } from './catalog';
import { CATALOG_EFFECTS } from './catalog-effects';

/** All player-authored cards on a file (experiences, inventory items, sheet-made cards). */
function customCards(file?: CharacterFile): ExperienceDef[] {
  if (!file) return [];
  return [...(file.experiences ?? []), ...(file.inventoryCustom ?? []), ...(file.customCards ?? []), ...(file.notes ?? [])];
}

/** The file collections that hold player-authored, editable cards (#264 item 5). */
export type EditableCollection = 'customCards' | 'inventoryCustom' | 'notes' | 'experiences';

/** Locate an editable (player-authored) card by id and which collection holds it. Catalog cards
 *  (ancestry/domain/subclass/equipment/loot) are NOT editable → null. */
export function findEditableCard(file: CharacterFile | undefined, id: string): { card: ExperienceDef; collection: EditableCollection } | null {
  if (!file) return null;
  const order: EditableCollection[] = ['customCards', 'inventoryCustom', 'notes', 'experiences'];
  for (const collection of order) {
    const card = (file[collection] as ExperienceDef[] | undefined)?.find((c) => c.id === id);
    if (card) return { card, collection };
  }
  return null;
}

/** Whether a card id can be edited in place (it's player-authored, not a catalog card). */
export function isEditableCard(id: string, file?: CharacterFile): boolean {
  return findEditableCard(file, id) != null;
}

/** The set of all editable (player-authored) card ids on a file. */
export function editableCardIds(file?: CharacterFile): Set<string> {
  return new Set(customCards(file).map((c) => c.id));
}

/** The structured effects a card applies when enabled. Empty when the card has none. */
export function effectsForCardId(id: string, file?: CharacterFile): CardEffect[] {
  const custom = customCards(file).find((c) => c.id === id);
  if (custom?.effects?.length) return custom.effects;
  if (CATALOG_EFFECTS[id]?.length) return CATALOG_EFFECTS[id];
  const w = weaponById(id);
  if (w?.effects?.length) return w.effects;
  const a = armorById(id);
  if (a) {
    // Armor SETS the damage thresholds when enabled (#242 item 9) — parsed from its "major / severe"
    // string — on top of any other effects it carries (e.g. ±Evasion). Base thresholds are level-based.
    const [mj, sv] = a.thresholds.split('/').map((n) => parseInt(n.trim(), 10) || 0);
    const thr: CardEffect[] = [];
    if (mj) thr.push({ target: 'majorThreshold', mode: 'set', delta: mj });
    if (sv) thr.push({ target: 'severeThreshold', mode: 'set', delta: sv });
    const eff = [...(a.effects ?? []), ...thr];
    if (eff.length) return eff;
  }
  const l = lootById(id);
  if (l?.effects?.length) return l.effects;
  const ws = wildshapeById(id);
  if (ws?.effects?.length) return ws.effects;
  return [];
}

/** Whether a card has any stat effect at all (so the UI can decide if it is "equippable for stats"). */
export function cardHasEffects(id: string, file?: CharacterFile): boolean {
  return effectsForCardId(id, file).length > 0;
}

/** A human label for a card id — used as the modifier source in the Modifiers panel. */
export function sourceLabelForCardId(id: string, file?: CharacterFile): string {
  const custom = customCards(file).find((c) => c.id === id);
  if (custom) return custom.title;
  return cardById(id)?.label ?? weaponById(id)?.name ?? armorById(id)?.name ?? lootById(id)?.name ?? wildshapeById(id)?.name ?? id;
}

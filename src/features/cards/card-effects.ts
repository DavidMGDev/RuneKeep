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
import { cardById } from './catalog';
import { CATALOG_EFFECTS } from './catalog-effects';

/** All player-authored cards on a file (experiences, inventory items, sheet-made cards). */
function customCards(file?: CharacterFile): ExperienceDef[] {
  if (!file) return [];
  return [...(file.experiences ?? []), ...(file.inventoryCustom ?? []), ...(file.customCards ?? [])];
}

/** The structured effects a card applies when enabled. Empty when the card has none. */
export function effectsForCardId(id: string, file?: CharacterFile): CardEffect[] {
  const custom = customCards(file).find((c) => c.id === id);
  if (custom?.effects?.length) return custom.effects;
  if (CATALOG_EFFECTS[id]?.length) return CATALOG_EFFECTS[id];
  const w = weaponById(id);
  if (w?.effects?.length) return w.effects;
  const a = armorById(id);
  if (a?.effects?.length) return a.effects;
  const l = lootById(id);
  if (l?.effects?.length) return l.effects;
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
  return cardById(id)?.label ?? weaponById(id)?.name ?? armorById(id)?.name ?? lootById(id)?.name ?? id;
}

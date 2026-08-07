/**
 * Card "types" (#246) — the middle-ribbon label on a card (e.g. Ability / Item / Note). There is a
 * fixed set of BUILT-IN types plus player-created CUSTOM types; everywhere a type is chosen the player
 * picks from built-in + custom through one picker. Pure + testable (no React, no I/O).
 */

import { type CardEffect } from '@/lib/modifiers';

import { type CardCategory, isBuiltinCategory } from './card-data';

/** The card type that authors a real Experience rather than a custom card (v0.14.0). */
export const EXPERIENCE_TYPE = 'Experience';
export const isExperienceType = (t: string | undefined): boolean => (t ?? '').trim().toLowerCase() === EXPERIENCE_TYPE.toLowerCase();

/**
 * The card type that IS a scar (v0.37.1, owner).
 *
 * Choosing it puts a +1 scar effect on the card and choosing anything else takes it off again, with no
 * label saying so. A scar is not a thing you describe and then separately configure; the type is the
 * whole statement, and a card that says SCAR while doing nothing to the Hope track would be a lie.
 */
export const SCAR_TYPE = 'Scar';
export const isScarType = (t: string | undefined): boolean => (t ?? '').trim().toLowerCase() === SCAR_TYPE.toLowerCase();

/** Built-in types grouped by the context they suit (used to pre-fill the default + group the picker). */
export const BUILTIN_TYPE_GROUPS: { label: string; types: string[] }[] = [
  { label: 'Arsenal', types: ['Ability', 'Attack', 'Skill', 'Weapon', 'Spell', 'Trick', 'Maneuver'] },
  { label: 'Inventory', types: ['Item', 'Armor', 'Tool', 'Treasure', 'Key', 'Trinket', 'Supply', 'Relic'] },
  { label: 'Notes', types: ['Note', 'Reminder', 'Important', 'Story', 'Lore', 'Flavor', 'Mystery', 'Place', 'Person', 'Quest'] },
  // v0.14.0: an Experience card becomes a real Experience on the file, so level-up advancements and
  // experience-targeting effects can find it. v0.37.1: Scar carries its own effect (see SCAR_TYPE).
  // These two are the only types that do anything beyond naming the ribbon.
  { label: 'Character', types: [EXPERIENCE_TYPE, SCAR_TYPE] },
];

/**
 * The card's effects after its TYPE changes.
 *
 * Only Scar has anything to say: it adds one scar and takes it away again. Every other effect on the
 * card is left exactly as the player wrote it, because the type is not allowed to edit their work.
 */
export function effectsForType(effects: CardEffect[] | undefined, nextType: string | undefined): CardEffect[] {
  const kept = (effects ?? []).filter((e) => e.target !== 'scar');
  return isScarType(nextType) ? [...kept, { target: 'scar', delta: 1 }] : kept;
}

/** Flat list of every built-in type, de-duplicated in group order. */
export const BUILTIN_CARD_TYPES: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of BUILTIN_TYPE_GROUPS) for (const t of g.types) if (!seen.has(t)) { seen.add(t); out.push(t); }
  return out;
})();

/** The default middle-ribbon type for a category — the first built-in type of its matching group. */
export function defaultTypeForCategory(key: CardCategory): string {
  if (key === 'inventory') return 'Item';
  if (key === 'notes') return 'Note';
  if (key === 'abilities' || key === 'wildshape' || key === 'martialform') return 'Ability';
  return 'Card'; // custom categories
}

/** All selectable types: built-in + the player's custom types, de-duplicated (custom-first wins order). */
export function allCardTypes(custom: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...custom, ...BUILTIN_CARD_TYPES]) {
    const v = t.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/** Whether a type label is one of the immutable built-ins (custom types can be deleted, built-ins not). */
export function isBuiltinType(t: string): boolean {
  return BUILTIN_CARD_TYPES.some((b) => b.toLowerCase() === t.trim().toLowerCase());
}

/** Picker groups for the editor: built-in groups, plus a "Custom" group when the player has any. */
export function typePickerGroups(custom: string[] = []): { label: string; types: string[] }[] {
  const customClean = allCardTypes(custom).filter((t) => !isBuiltinType(t));
  return customClean.length ? [{ label: 'Custom', types: customClean }, ...BUILTIN_TYPE_GROUPS] : [...BUILTIN_TYPE_GROUPS];
}

/** The deck a built-in category authors into (custom categories author into the Arsenal deck + an override). */
export function isInventoryCategory(key: CardCategory): boolean {
  return key === 'inventory';
}
export { isBuiltinCategory };

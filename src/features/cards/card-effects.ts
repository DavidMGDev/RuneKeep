/**
 * Card-effects registry — resolves any deck card id to its structured `CardEffect[]` and a human
 * label, regardless of where the card comes from: equipment (weapons/armor), loot/consumables, the
 * catalog (domain/ancestry/community/subclass via the generated effect table), or a player-authored
 * custom card carried on the character file. This is the one lookup `toSheetCharacter` and the
 * Modifiers UI use, so they never need to know a card's category.
 */

import type { CardEffect } from '@/lib/modifiers';
import type { CharacterFile, ExperienceDef } from '@/lib/character-file';
import type { LibraryCard } from '@/lib/library';
import { armorById, weaponById } from '@/data/equipment-data';
import { lootById } from '@/data/loot-data';
import { martialStanceById } from '@/data/martial-form-data';
import { wildshapeById } from '@/data/wildshape-data';
import { cardById } from '@/data/catalog';
import { CATALOG_EFFECTS } from '@/data/catalog-effects';
import { effectsForChoice } from '@/data/card-choices';
import { isAncestryEffectDisabled } from '@/data/ancestry-traits';
import { libraryCardById, libraryCardEffects, mixedCrossedTrait } from '@/lib/library-embed';

/** All player-authored cards on a file (experiences, inventory items, sheet-made cards). */
function customCards(file?: CharacterFile): ExperienceDef[] {
  if (!file) return [];
  return [...(file.experiences ?? []), ...(file.inventoryCustom ?? []), ...(file.customCards ?? []), ...(file.notes ?? [])];
}

/** Strip the per-instance suffix from a card id (#269). A player can hold several copies of one catalog
 *  card; each deck copy gets a unique instance id (`wpn-x`, `wpn-x#2`, …) so it can be selected/dragged/
 *  tokened independently, but its CONTENT (effects, label, art) still resolves by the catalog id. The
 *  first copy is unsuffixed, so existing saves are unchanged. Custom-card ids never carry a `#n` suffix. */
export function catalogIdOf(id: string): string {
  return id.replace(/#\d+$/, '');
}

/** The SYNC KEY for a deck-card instance (#277): an explicit copy points to its underlying card's id;
 *  every other instance resolves to its catalog/custom id (suffix stripped). Enable state + effects are
 *  keyed by this, so all copies of one card share an equip and apply their effect ONCE. */
export function refOf(id: string, file?: CharacterFile): string {
  const copy = file?.cardCopies?.find((c) => c.id === id);
  return copy ? copy.ref : catalogIdOf(id);
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

/**
 * The structured effects a card applies when enabled. Empty when the card has none.
 *
 * v0.25.0: a card offering a CHOICE (Vitality) contributes only the options the player picked, so an
 * unanswered card contributes nothing rather than everything.
 */
export function effectsForCardId(rawId: string, file?: CharacterFile): CardEffect[] {
  const id = refOf(rawId, file); // resolve a copy (#277) or suffixed duplicate (#269) to its underlying card
  return effectsForChoice(rawEffectsForCardId(id, file), file?.cardChoices?.[id]);
}

/** Everything the card COULD grant, before the player's choice narrows it. */
export function rawEffectsForCardId(rawId: string, file?: CharacterFile): CardEffect[] {
  const id = refOf(rawId, file);
  const custom = customCards(file).find((c) => c.id === id);
  if (custom?.effects?.length) return custom.effects;
  // v0.10.3: an embedded homebrew (library) card resolves its effects here — armor bakes in its score +
  // thresholds so custom armor works exactly like equipment.
  const lib = libraryCardById(file, id);
  if (lib) {
    // v0.10.4: a custom ancestry in a MIX drops its passive when that feature is the crossed-out one.
    // v0.13.2 (#359): authors no longer pick which feature holds the passive — it rides Feature 1 by
    // convention (like Void's Earthkin), so a missing ancestryEffectTrait defaults to 1.
    if (lib.contentType === 'ancestry' && mixedCrossedTrait(file, id) === (lib.ancestryEffectTrait ?? 1)) return [];
    return libraryCardEffects(lib);
  }
  // #278: a player override replaces a CATALOG card's code-defined effects (custom cards edit their own
  // `effects` above). Override wins so the Modifiers panel + card editor share one source of truth.
  const override = file?.cardEffectOverrides?.[id];
  if (override) {
    if (isAncestryEffectDisabled(file?.mixedAncestry, id)) return [];
    return override;
  }
  if (CATALOG_EFFECTS[id]?.length) {
    // #265: in a mixed ancestry, an ancestry's passive is dropped when it sits on the crossed-out half.
    if (isAncestryEffectDisabled(file?.mixedAncestry, id)) return [];
    return CATALOG_EFFECTS[id];
  }
  const w = weaponById(id);
  if (w?.effects?.length) return w.effects;
  const a = armorById(id);
  if (a) {
    // Armor, when enabled (#242 item 9 / #297): grants its ARMOR SCORE (slots — the unarmored base is
    // now 0) and SETS the damage thresholds (parsed from its "major / severe" string), on top of any
    // other effects it carries (e.g. ±Evasion). All of it shows in the Modifiers panel.
    const [mj, sv] = a.thresholds.split('/').map((n) => parseInt(n.trim(), 10) || 0);
    const thr: CardEffect[] = [];
    if (a.baseScore) thr.push({ target: 'armorScore', mode: 'bonus', delta: a.baseScore });
    if (mj) thr.push({ target: 'majorThreshold', mode: 'set', delta: mj });
    if (sv) thr.push({ target: 'severeThreshold', mode: 'set', delta: sv });
    const eff = [...(a.effects ?? []), ...thr];
    if (eff.length) return eff;
  }
  const l = lootById(id);
  if (l?.effects?.length) return l.effects;
  const ws = wildshapeById(id);
  if (ws?.effects?.length) return ws.effects;
  const ms = martialStanceById(id);
  if (ms?.effects?.length) return ms.effects; // #357: active martial stance (Steady, Immovable)
  return [];
}

/** Whether a card has any stat effect at all (so the UI can decide if it is "equippable for stats"). */
export function cardHasEffects(id: string, file?: CharacterFile): boolean {
  return effectsForCardId(id, file).length > 0;
}

/** Convert a sheet deck-card id into a portable `LibraryCard` for NFC / `.rkp` sharing (v0.10.7 — now
 *  used for single- AND multi-card sends). An embedded homebrew card is sent WHOLE (its sections /
 *  weapon / armor / effects), with a fresh id; a player-authored custom keeps its title/body/art/
 *  effects; a catalog card sends as a generic card labelled by the catalog + its resolved effects. The
 *  image is a URI reference — the caller inlines the bytes (async/platform) when it wants them to travel. */
export function cardToLibraryCard(file: CharacterFile | undefined, id: string, makeId: (srcId: string) => string): LibraryCard {
  const ref = refOf(id, file);
  const lib = libraryCardById(file, ref);
  if (lib) return { ...lib, id: makeId(id) }; // homebrew: full data survives the trip
  const authored = (findEditableCard(file, ref) ?? findEditableCard(file, id))?.card;
  const cat = cardById(catalogIdOf(id));
  return {
    id: makeId(id),
    contentType: 'generic',
    title: authored?.title || cat?.label || 'Card',
    text: authored?.text ?? '',
    imageUri: authored?.imageUri ?? null,
    color: authored?.color ?? null,
    effects: effectsForCardId(ref, file),
  };
}

/** A human label for a card id — used as the modifier source in the Modifiers panel. */
export function sourceLabelForCardId(rawId: string, file?: CharacterFile): string {
  const id = refOf(rawId, file); // a copy/duplicate shares its underlying card's label (#269/#277)
  const custom = customCards(file).find((c) => c.id === id);
  if (custom) return custom.title;
  const lib = libraryCardById(file, id);
  if (lib) return lib.title || id;
  return cardById(id)?.label ?? weaponById(id)?.name ?? armorById(id)?.name ?? lootById(id)?.name ?? wildshapeById(id)?.name ?? martialStanceById(id)?.name ?? id;
}


/**
 * Every card id the character HOLDS, wherever it sits: equipped, in the vault, in the archive, in a
 * pocket. Deliberately a superset, because it exists to answer one question, "does this character
 * still have the card at all", which is what ends a permanent effect (v0.25.0).
 *
 * Ids are raw instance ids; callers resolve them through `refOf` as usual.
 */
export function heldCardIds(file?: CharacterFile): string[] {
  if (!file) return [];
  const ids: (string | null | undefined)[] = [
    file.subclassCardId,
    file.multiclassSubclassCardId,
    file.ancestryCardId,
    file.communityCardId,
    file.weaponPrimaryId,
    file.weaponSecondaryId,
    file.armorId,
    ...(file.domainCardIds ?? []),
    ...(file.inventoryItemIds ?? []),
    ...customCards(file).map((c) => c.id),
    ...(file.libraryCards ?? []).map((c) => c.id),
    ...(file.cardCopies ?? []).map((c) => c.id),
  ];
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

/**
 * Cards granting a PERMANENT effect that the character holds but has NOT equipped.
 *
 * The equipped ones already contribute through the normal path, so counting them here would double
 * every permanent bonus. This is the other half: Vitality sitting in the vault, exactly as its own
 * rules text instructs.
 */
export function unequippedPermanentSources(file: CharacterFile): { source: string; effects: CardEffect[] }[] {
  const equipped = new Set((file.enabledCardIds ?? []).map((id) => refOf(id, file)));
  const seen = new Set<string>();
  const out: { source: string; effects: CardEffect[] }[] = [];
  for (const rawId of heldCardIds(file)) {
    const id = refOf(rawId, file);
    if (equipped.has(id) || seen.has(id)) continue;
    seen.add(id);
    const permanent = effectsForCardId(id, file).filter((e) => e.permanent);
    if (permanent.length) out.push({ source: sourceLabelForCardId(id, file), effects: permanent });
  }
  return out;
}

/** Whether a card grants anything permanent, so the UI can mark it and exempt it from the loadout
 *  limit. Reads the RAW effects: a card the player has not answered yet is still a permanent card. */
export function isPermanentCard(id: string, file?: CharacterFile): boolean {
  return rawEffectsForCardId(id, file).some((e) => e.permanent);
}

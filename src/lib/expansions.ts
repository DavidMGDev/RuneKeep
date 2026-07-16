/**
 * Expansion gating (v0.12.2). Base-game catalog cards are always visible; expansion cards (tagged with
 * an `expansion` id, e.g. 'void') are shown only when that expansion is enabled — globally (Card Library
 * toggle) or per-character (chosen at creation, stored on the file's `enabledExpansionIds`).
 *
 * "The Void" is an OFFICIAL expansion: hard-coded in the app (its cards live in the catalog, its classes
 * in class-data), OFF by default. It shows read-only in the library's "Official Expansions" section.
 */
import { CATALOG, type CatalogCard } from '@/data/catalog';
import { VOID_EXPANSION_ID, VOID_CLASSES, type ClassName } from '@/constants/identity';
import { VOID_ANCESTRIES } from '@/data/void-ancestries';
import type { Expansion } from './library';
import { getExpansion, saveExpansion } from './library-store';

/** Bump when bundled Void content (VOID_ANCESTRIES, …) changes so already-installed copies refresh in place. */
export const VOID_BUNDLE_VERSION = 2;

/** Metadata for the bundled Void record (its CARDS live in the catalog; this holds the name + global toggle). */
export const VOID_META = {
  id: VOID_EXPANSION_ID,
  name: 'The Void',
  author: 'Darrington Press',
  description:
    "Official homebrew — 6 classes (Assassin, Witch, Warlock, Blood Hunter, Summoner, Brawler), 2 domains (Blood, Dread), plus new ancestries, communities & transformations. The card art is the publisher's work-in-progress designs.",
};

/** Official (bundled) expansion ids this build ships. Always listed FIRST in the library. */
export const OFFICIAL_EXPANSION_IDS: string[] = [VOID_EXPANSION_ID];
export const isOfficialExpansion = (id: string): boolean => OFFICIAL_EXPANSION_IDS.includes(id);

/** Which expansion a class belongs to (undefined = base game). */
export function classExpansion(key: ClassName): string | undefined {
  return VOID_CLASSES.includes(key) ? VOID_EXPANSION_ID : undefined;
}

/** Catalog cards visible for a set of enabled expansions: base cards (untagged) always, plus any card
 *  whose `expansion` is enabled. */
export function catalogFor(ids: string[] | Set<string> | undefined): CatalogCard[] {
  const set = ids instanceof Set ? ids : new Set(ids ?? []);
  return CATALOG.filter((c) => !c.expansion || set.has(c.expansion));
}

/** Total cards a user sees for an expansion: its record `cards` PLUS any catalog cards tagged to it.
 *  Official packs keep most cards in the catalog but some (e.g. the Void ancestries) live on the record. */
export function expansionCardCount(e: Expansion): number {
  return e.cards.length + CATALOG.filter((c) => c.expansion === e.id).length;
}

/** Seed the bundled official-expansion record(s) into the library store if absent, so their global
 *  enable toggle persists next to user expansions. OFF by default (A2). Idempotent — call on library load. */
export async function seedOfficialExpansions(): Promise<void> {
  const existing = await getExpansion(VOID_META.id);
  if (!existing) {
    const seed: Expansion = { ...VOID_META, official: true, enabled: false, version: VOID_BUNDLE_VERSION, createdAt: new Date().toISOString(), cards: VOID_ANCESTRIES };
    await saveExpansion(seed);
  } else if ((existing.version ?? 0) < VOID_BUNDLE_VERSION) {
    // refresh the bundled cards in place, preserving the user's global enable toggle + createdAt.
    await saveExpansion({ ...existing, ...VOID_META, official: true, version: VOID_BUNDLE_VERSION, cards: VOID_ANCESTRIES });
  }
}

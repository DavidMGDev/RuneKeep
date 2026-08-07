/**
 * A character's decks, for the DM, built from the SHEET'S OWN job list (v0.35.3, owner).
 *
 * v0.35's viewer read the character file and resolved each id it found. That missed cards the file
 * does not mention: the starting kit is derived from the class, so a player's default inventory was
 * simply absent, and anything the file names but the resolver could not draw came out as a bare
 * "Card". The owner's requirement is exact: the DM sees what the player sees.
 *
 * So the cards come from `buildDeckJobs`, the same function the character sheet uses, and the
 * composition below mirrors the sheet's: the same order, the same category for each group, the same
 * per-card override, delete, copy and ordering passes (`lib/dm-card-list`). What it does NOT do is
 * forge: every card is its live node, which is what the sheet itself shows until a bitmap lands.
 *
 * The interactive cards (gold, the class trackers, the companion facets, the martial Focus token) are
 * shown READ ONLY. A DM looking at someone's gold should see it; changing it from here would be a
 * second, hidden way to edit a card the player owns.
 */
import { type ReactNode } from 'react';

import { cardById } from '@/data/catalog';
import { CLASS_CARDS } from '@/features/create/components/class-cards';
import { featurePages } from '@/data/class-data';
import { isClassTrackerId, SummonerTrackerCard, SUMMONER_TRACKER_ID, WarlockTrackerCard, WARLOCK_TRACKER_ID } from '@/features/character-sheet/components/class-tracker-card';
import { CompanionFacetCard, companionCardId, type CompanionFacet } from '@/features/character-sheet/components/companion-card';
import { MartialFocusCard } from '@/features/character-sheet/components/martial-focus-card';
import { GoldCard } from '@/features/create/components/gold-card';
import { buildDeckJobs, type DeckJob } from '@/features/character-sheet/sheet/deck-jobs';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { companionOf, hasCompanion } from '@/lib/companion';
import { hasMartialForm, MARTIAL_STANCES } from '@/data/martial-form-data';
import { WILDSHAPES } from '@/data/wildshape-data';
import { libraryCardById } from '@/lib/library-embed';
import { tierForLevel } from '@/lib/modifiers';
import type { CharacterFile } from '@/lib/character-file';
import { fileDecks, type SeedCard } from '@/lib/dm-card-list';

/** One card as the DM's carousel wants it: printed artwork where the game has some, else the live card. */
export interface DmCard {
  id: string;
  label: string;
  thumb?: number | { uri: string };
  source?: number | { uri: string };
  node?: ReactNode;
  /** A multi-page card's remaining faces, so a class card can still be read page by page. */
  faces?: ReactNode[];
}

const jobCard = (j: DeckJob, label: string): DmCard => ({ id: j.id ?? j.key, label, node: j.node });

/** The label under a card in the picker. Kept short: the carousel prints it under the art. */
function labelOf(file: CharacterFile, id: string, fallback: string): string {
  return cardById(id)?.label ?? libraryCardById(file, id)?.title ?? fallback;
}

export function dmDecks(file: CharacterFile): Record<string, DmCard[]> {
  const jobs = buildDeckJobs(file);
  const seeds: SeedCard[] = [];
  const cards = new Map<string, DmCard>();
  const push = (cat: string, card: DmCard) => {
    if (cards.has(card.id)) return; // the sheet holds one card per id; so does this
    cards.set(card.id, card);
    seeds.push({ id: card.id, cat });
  };
  const catalogCard = (cat: string, id: string | undefined | null) => {
    if (!id) return;
    const c = cardById(id);
    if (c) { push(cat, { id: c.id, label: c.label, thumb: c.thumb, source: c.source }); return; }
    const lib = libraryCardById(file, id);
    if (lib) push(cat, { id, label: lib.title || 'Card', node: <LibraryForgedCard card={lib} /> });
  };

  // --- Arsenal, in the sheet's order: domains, origins, class, weapons, experiences, authored ---
  for (const id of file.domainCardIds ?? []) catalogCard('abilities', id);
  catalogCard('abilities', file.ancestryCardId);
  if (file.mixedAncestry) catalogCard('abilities', file.mixedAncestry.second);
  catalogCard('abilities', file.communityCardId);
  catalogCard('abilities', file.subclassCardId);
  catalogCard('abilities', file.multiclassSubclassCardId);
  // The class feature card is ONE card with pages, exactly as the sheet shows it.
  if (jobs.classJob) {
    push('abilities', { id: jobs.classJob.key, label: 'Class', node: jobs.classJob.node, faces: jobs.featJobs.map((j) => j.node) });
  }
  if (jobs.mcClassJob) {
    push('abilities', { id: jobs.mcClassJob.key, label: 'Class', node: jobs.mcClassJob.node, faces: jobs.mcFeatJobs.map((j) => j.node) });
  }
  for (const j of jobs.weaponJobs) push('abilities', jobCard(j, labelOf(file, j.id ?? j.key, 'Weapon')));
  for (const j of jobs.acqWeaponJobs) push('abilities', jobCard(j, labelOf(file, j.id ?? j.key, 'Weapon')));
  // Acquired class cards: one multi-page card per class, like the primary one.
  for (const id of new Set((file.acquiredCardIds ?? []).filter((x) => x.startsWith('class-')))) {
    const k = id.slice(6);
    const def = CLASS_CARDS.find((c) => c.key === k);
    if (!def) continue;
    const cover = jobs.acqClassJobs.find((j) => j.key === `acqclass-${k}`);
    if (!cover) continue;
    const pages = featurePages(k as CharacterFile['className']).map((p) => jobs.acqClassJobs.find((j) => j.key === `acqfeat-${k}-${p.pageIndex}`)?.node);
    push('abilities', { id, label: def.title, node: cover.node, faces: pages.filter(Boolean) as ReactNode[] });
  }
  for (const j of jobs.expJobs) push('abilities', jobCard(j, 'Experience'));
  for (const j of jobs.customCardJobs) if (j.target !== 'inventory') push('abilities', jobCard(j, 'Card'));
  if (file.className === 'summoner') {
    const sub = file.subclassCardId?.includes('theurgy') ? ('theurgy' as const) : file.subclassCardId?.includes('necromancy') ? ('necromancy' as const) : undefined;
    push('abilities', { id: SUMMONER_TRACKER_ID, label: 'Summoner', node: <SummonerTrackerCard state={file.classTracker} subclass={sub} level={file.level} onChange={() => {}} /> });
  }
  if (file.className === 'warlock') push('abilities', { id: WARLOCK_TRACKER_ID, label: 'Warlock', node: <WarlockTrackerCard state={file.classTracker} level={file.level} onChange={() => {}} /> });

  // --- Inventory: the kit, the chosen items, gold, gear, authored items, loose homebrew ---
  for (const j of jobs.invJobs) push('inventory', jobCard(j, labelOf(file, j.id ?? j.key, 'Item')));
  // v0.37.1 (owner): a CHARACTERIZED character has no purse, here either. The sheet has left the gold
  // card out since v0.36.3, but this deck is what the DM's own card panel shows, and it was still
  // adding one, so every characterized ally and adversary appeared to be carrying money.
  if (!file.characterized) push('inventory', { id: 'gold', label: 'Gold', node: <GoldCard gold={file.gold ?? { handfuls: 1, bags: 0, chest: 0 }} onChange={() => {}} /> });
  if (jobs.armorJob) push('inventory', jobCard(jobs.armorJob, labelOf(file, jobs.armorJob.id ?? jobs.armorJob.key, 'Armor')));
  for (const j of jobs.acqArmorJobs) push('inventory', jobCard(j, labelOf(file, j.id ?? j.key, 'Armor')));
  for (const j of jobs.acqLootJobs) push('inventory', jobCard(j, labelOf(file, j.id ?? j.key, 'Loot')));
  for (const j of jobs.customCardJobs) if (j.target !== 'arsenal') push('inventory', jobCard(j, 'Card'));
  const structural = new Set<string>([file.subclassCardId, file.ancestryCardId, file.communityCardId, ...(file.mixedAncestry ? [file.mixedAncestry.second] : []), ...(file.domainCardIds ?? [])]);
  for (const j of jobs.libJobs) {
    const id = j.id ?? j.key;
    if (structural.has(id)) continue;
    push('inventory', jobCard(j, labelOf(file, id, 'Card')));
  }
  for (const id of file.acquiredCardIds ?? []) if (!id.startsWith('class-')) catalogCard('inventory', id);

  // --- Notes, Beastform, Martial Form, Companion ---
  for (const j of jobs.notesJobs) push('notes', jobCard(j, 'Note'));
  const tier = tierForLevel(file.level);
  for (const w of WILDSHAPES.filter((x) => x.tier <= tier)) {
    const a = jobs.wildshapeFaceJobs.find((j) => j.key === `ws-${w.id}-0`);
    const b = jobs.wildshapeFaceJobs.find((j) => j.key === `ws-${w.id}-1`);
    if (a) push('wildshape', { id: w.id, label: w.name, node: a.node, faces: b ? [b.node] : undefined });
  }
  if (hasMartialForm(file)) {
    push('martialform', { id: 'martial-focus', label: 'Focus', node: <MartialFocusCard focus={file.martialFocus ?? 0} onChange={() => {}} /> });
    for (const j of jobs.martialJobs) push('martialform', jobCard(j, MARTIAL_STANCES.find((s) => s.id === j.key)?.name ?? 'Stance'));
  }
  if (hasCompanion(file)) {
    const state = companionOf(file);
    const facet = (f: CompanionFacet, i?: number) => push('companion', { id: companionCardId(f, i), label: 'Companion', node: <CompanionFacetCard facet={f} expIndex={i} companion={state} onChange={() => {}} /> });
    (['name', 'evasion', 'damage', 'range', 'stress'] as CompanionFacet[]).forEach((f) => facet(f));
    state.experiences.forEach((_, i) => facet('exp', i));
  }

  // The player's own moves: deletions, category overrides, copies and drag order.
  const filed = fileDecks(file, seeds);
  const out: Record<string, DmCard[]> = {};
  for (const [cat, ids] of Object.entries(filed)) {
    const list = ids.map((id) => cards.get(id) ?? cards.get(file.cardCopies?.find((c) => c.id === id)?.ref ?? '')).filter((c): c is DmCard => !!c);
    // A copy is the same card in another place, so it borrows its source's face and keeps its own id.
    out[cat] = list.map((c, i) => (c.id === ids[i] ? c : { ...c, id: ids[i] }));
  }
  return out;
}

/** Whether a card id is one of the read-only live cards above, so a caller can say so. */
export const isLiveOnlyCard = (id: string): boolean => id === 'gold' || id === 'martial-focus' || isClassTrackerId(id) || id.startsWith('companion');

/**
 * Leveling (#167) — the Daggerheart advancement system, transcribed from the rulebook advancement tables.
 *
 * Each level you gain (auto): +1 level, +1 to BOTH damage thresholds, and a new domain card of your
 * level or lower. At the start of a new TIER (levels 2, 5, 8) you also gain a new Experience at +2
 * and a permanent +1 Proficiency (already encoded by proficiencyForLevel), and at 5 & 8 you clear all
 * trait marks. Then you choose TWO advancements from the tier's list (proficiency and multiclass each
 * consume both choices). Tiers: T1 = lvl 1, T2 = 2-4, T3 = 5-7, T4 = 8-10.
 *
 * This module is the pure, testable core. The UI builds a LevelUpPlan; applyLevelUp folds it into a
 * new CharacterFile (which toSheetCharacter then derives the runtime stats from).
 */

import type { TraitKey } from '@/features/character-sheet/character';
import { CATALOG, cardById } from '@/data/catalog';
import type { CharacterFile } from './character-file';
import { type AdvanceCard, hasCardAdvances } from './card-advances';
import { addCompanionExperience, applyCompanionOption, companionOf, hasCompanion } from './companion';
import { subclassFamilyKey } from './library';
import { tierForLevel } from './rest';

export { tierForLevel };

/** Daggerheart tops out at level 10 (tier 4 = 8-10). No character advances past it. */
export const MAX_LEVEL = 10;

export type AdvKey = 'trait' | 'hp' | 'stress' | 'exp' | 'domain' | 'evasion' | 'prof' | 'subclass' | 'multiclass' | 'card';

export interface AdvancementOption {
  key: AdvKey;
  label: string;
  desc: string;
  /** Slots available PER TIER (v0.10.2): the menu resets at each tier start, so e.g. `trait: 3` means
   *  up to three +1-to-two-traits takes within a tier, then again in the next tier. */
  slots: number;
  /** How many of the level's 2 choices a single take consumes (prof/multiclass = 2). */
  picks: number;
  /** Lowest tier this option is available at (prof/subclass/multiclass = tier 3). */
  minTier: number;
  /** Sub-selection the UI must collect. */
  needs?: 'traits' | 'exps' | 'domain' | 'multiclass' | 'card';
}

export const ADVANCEMENTS: AdvancementOption[] = [
  { key: 'trait', label: '+1 to two traits', desc: 'Gain +1 to two unmarked character traits and mark them.', slots: 3, picks: 1, minTier: 2, needs: 'traits' },
  { key: 'hp', label: '+1 Hit Point slot', desc: 'Permanently gain one Hit Point slot.', slots: 2, picks: 1, minTier: 2 },
  { key: 'stress', label: '+1 Stress slot', desc: 'Permanently gain one Stress slot.', slots: 2, picks: 1, minTier: 2 },
  { key: 'exp', label: '+1 to two Experiences', desc: 'Permanently gain a +1 bonus to two Experiences.', slots: 1, picks: 1, minTier: 2, needs: 'exps' },
  { key: 'domain', label: 'Extra domain card', desc: 'Take an additional domain card of your level or lower.', slots: 1, picks: 1, minTier: 2, needs: 'domain' },
  { key: 'evasion', label: '+1 Evasion', desc: 'Permanently gain a +1 bonus to your Evasion.', slots: 1, picks: 1, minTier: 2 },
  { key: 'prof', label: '+1 Proficiency', desc: 'Increase your Proficiency by +1. Uses both choices.', slots: 2, picks: 2, minTier: 3 },
  { key: 'subclass', label: 'Upgrade subclass', desc: 'Take the next subclass card (specialization, then mastery).', slots: 1, picks: 1, minTier: 3 },
  { key: 'multiclass', label: 'Multiclass', desc: 'Take an additional class. Uses both choices.', slots: 2, picks: 2, minTier: 3, needs: 'multiclass' },
  /**
   * v0.42.1 (owner): an advancement a CARD offers, such as the Brawler's Combo Die going up a size.
   *
   * The rulebook writes these on the class rather than in the advancement table, so the option only
   * appears for a character that actually has one (see `availableAdvancements`). The real limit is
   * per-advancement and per-tier and lives on the card itself; the slot count here is only a ceiling
   * on how many card options one tier may spend, which no printed class comes near.
   */
  { key: 'card', label: 'A class option', desc: 'Take an advancement one of your cards offers.', slots: 4, picks: 1, minTier: 2, needs: 'card' },
];

export function advOption(key: AdvKey): AdvancementOption {
  return ADVANCEMENTS.find((o) => o.key === key)!;
}
export function advMarksUsed(file: CharacterFile, key: AdvKey, tier: number = tierForLevel(file.level)): number {
  // v0.10.2: advancement slots are PER-TIER. A mark counts only when it was stamped in the tier being
  // evaluated; a stamp from a prior tier (or an old save with no `advancementMarksTier`) reads as 0. This
  // both resets the menu at each new tier AND self-heals characters soft-locked under the old
  // campaign-wide accounting (where marks accumulated forever and options ran out by the upper levels).
  if (file.advancementMarksTier !== tier) return 0;
  return file.advancementMarks?.[key] ?? 0;
}
export function advRemaining(file: CharacterFile, key: AdvKey, tier: number = tierForLevel(file.level)): number {
  return advOption(key).slots - advMarksUsed(file, key, tier);
}
/** Options selectable at the given (new) level: in-tier and with slots left. */
export function availableAdvancements(file: CharacterFile, newLevel: number): AdvancementOption[] {
  const tier = tierForLevel(newLevel);
  const multiclassed = !!file.multiclassName;
  return ADVANCEMENTS.filter((o) => {
    if (o.minTier > tier || advRemaining(file, o.key, tier) <= 0) return false;
    // #311: multiclassing crosses out a subclass-upgrade option, so a multiclassed character can no
    // longer take "upgrade subclass" (and therefore can never reach a subclass mastery card).
    if (multiclassed && o.key === 'subclass') return false;
    // v0.10.2: the per-tier reset would otherwise re-offer multiclass every tier, but the file holds a
    // single `multiclassName` — a second take would silently overwrite the first. Cap it at once ever.
    if (multiclassed && o.key === 'multiclass') return false;
    // v0.42.1: only offered to a character whose cards actually offer something at this tier.
    if (o.key === 'card' && !hasCardAdvances(advanceCardsOf(file), tier, file.cardAdvances)) return false;
    return true;
  });
}

/**
 * Every card of this character that could carry an advancement (v0.42.1).
 *
 * Both kinds: the homebrew cards embedded on the file, and the authored ones, which is where a
 * bundled class's own trackers live once the class has been expanded into cards.
 */
export function advanceCardsOf(file: CharacterFile): AdvanceCard[] {
  return [...(file.libraryCards ?? []), ...(file.customCards ?? [])].filter((c) => c.advances?.length);
}
export function isTierStart(newLevel: number): boolean {
  return newLevel === 2 || newLevel === 5 || newLevel === 8;
}
export function clearsTraitMarks(newLevel: number): boolean {
  // Trait marks reset at the start of EVERY tier (2, 5, 8), not just 5 & 8 (owner, v0.10.0). Before,
  // marks accumulated through tier 2 and never cleared at level 2, so by the upper levels every trait
  // could be marked at once and the trait advancement could never be completed — soft-locking level-up.
  return isTierStart(newLevel);
}

const SUBCLASS_NEXT: Record<string, 'foundation' | 'specialization' | 'mastery'> = { foundation: 'specialization', specialization: 'mastery', mastery: 'mastery' };

/** The subclass card at a target progression tier (2 = specialization, 3 = mastery) in the same family as
 *  a foundation card. Catalog families derive from the `subclass` slug (ids like `subclass-stalwart-1-
 *  foundation`). Custom (homebrew) subclasses match on `subclassFamilyKey` (v0.14.0), which falls back
 *  from the explicit family field to the card TITLE, case-insensitively — authors overwhelmingly just
 *  name all three tier cards the same thing and never fill the family field in, and the upgrade used to
 *  silently do nothing for them. Used to auto-add the card on a subclass upgrade (Bug 3). */
export function nextSubclassCardId(file: CharacterFile, foundationCardId: string, targetTier: 2 | 3): string | undefined {
  const slug = cardById(foundationCardId)?.subclass;
  if (slug) return CATALOG.find((c) => c.kind === 'subclass' && c.subclass === slug && c.tier === targetTier)?.id;
  const found = file.libraryCards?.find((c) => c.id === foundationCardId);
  if (found?.contentType === 'subclass') {
    const key = subclassFamilyKey(found);
    return file.libraryCards?.find((c) => c.contentType === 'subclass' && (c.tier ?? 1) === targetTier && subclassFamilyKey(c) === key)?.id;
  }
  return undefined;
}

export interface ChosenAdv {
  key: AdvKey;
  traits?: TraitKey[]; // exactly 2 for 'trait'
  expIds?: string[]; // exactly 2 for 'exp'
  domainCardId?: string; // for 'domain'
  multiclass?: string; // for 'multiclass' — the new class key
  multiclassSubclassCardId?: string; // for 'multiclass' — a foundation card from the new class (#311)
  multiclassDomain?: string; // for 'multiclass' — one domain from the new class (#311)
  /** for 'card' (v0.42.1) — the `cardId|advanceId` key of the advancement chosen. */
  cardAdvanceKey?: string;
}
export interface LevelUpPlan {
  /** The automatic per-level domain card (≤ new level). */
  domainCardId: string;
  /** New Experience name when this level starts a tier (2/5/8). */
  experienceTitle?: string;
  /** The new Experience's authored art + body (#239 item 5): persisted so it forges with the chosen
   *  color/image instead of a blank card. */
  experienceColor?: string | null;
  experienceImageUri?: string | null;
  experienceText?: string;
  advancements: ChosenAdv[];
  /** Beastbound companion (#311): training option keys chosen this level-up (companion.ts keys). */
  companionOptions?: string[];
}
export interface LevelDefaults {
  maxHp: number;
  stressMax: number;
  evasion: number;
}

/** Total choices consumed by a set of chosen advancements (prof/multiclass = 2 each). */
export function picksUsed(advs: ChosenAdv[]): number {
  return advs.reduce((n, a) => n + advOption(a.key).picks, 0);
}

/** Fold a level-up plan into a new CharacterFile. Pure — deterministic ids, no Date/Math.random. */
export function applyLevelUp(file: CharacterFile, plan: LevelUpPlan, def: LevelDefaults): CharacterFile {
  if (file.level >= MAX_LEVEL) return file; // level 10 is the cap — never advance past it
  const newLevel = file.level + 1;
  const next: CharacterFile = { ...file, level: newLevel };
  // Thresholds are level-based now (#242 item 9): Major = level, Severe = 2×level, derived in
  // toSheetCharacter. No per-level thresholdBonus to accumulate.

  const activate = (ids: string[], add: string) => (ids.length < 5 ? [...ids, add] : ids);
  let domainIds = [...file.domainCardIds, plan.domainCardId];
  let activeIds = activate(file.activeDomainCardIds ?? file.domainCardIds.slice(0, 5), plan.domainCardId);

  let experiences = [...(file.experiences ?? [])];
  if (isTierStart(newLevel) && plan.experienceTitle) {
    experiences.push({
      id: `exp-lvl${newLevel}-${experiences.length}`,
      title: plan.experienceTitle,
      text: plan.experienceText ?? '',
      imageUri: plan.experienceImageUri ?? null,
      color: plan.experienceColor ?? null,
      modifier: 2,
    });
  }
  let traitMarks = clearsTraitMarks(newLevel) ? [] : [...(file.traitMarks ?? [])];

  // v0.10.2: advancement marks are per-tier — carry them only within the same tier, else start the new
  // tier's menu fresh. `curTier` stamps the result so advMarksUsed can tell a live tier from a stale one.
  const curTier = tierForLevel(newLevel);
  const marks = file.advancementMarksTier === curTier ? { ...(file.advancementMarks ?? {}) } : {};
  let acquired = file.acquiredCardIds ?? [];
  let acquiredChanged = false;
  let cardCategory = file.cardCategory;
  const traitBonuses = { ...(file.traitBonuses ?? {}) };
  let maxHp = file.maxHp ?? def.maxHp;
  let stressMax = file.stressMax ?? def.stressMax;
  let evasionBase = file.evasionBase ?? def.evasion;
  let proficiencyBonus = file.proficiencyBonus ?? 0;
  let subclassTier = file.subclassTier ?? 'foundation';
  let multiclassName = file.multiclassName;
  let multiclassSubclassCardId = file.multiclassSubclassCardId;
  let multiclassDomain = file.multiclassDomain;
  let cardAdvances = [...(file.cardAdvances ?? [])];

  const traitsUpgradedThisLevel = new Set<TraitKey>(); // a trait can't be raised twice in one level-up
  for (const a of plan.advancements) {
    const opt = advOption(a.key);
    marks[a.key] = (marks[a.key] ?? 0) + opt.picks;
    switch (a.key) {
      case 'trait':
        for (const t of a.traits ?? []) {
          if (traitsUpgradedThisLevel.has(t) || traitMarks.includes(t)) continue; // never double-upgrade
          traitsUpgradedThisLevel.add(t);
          traitBonuses[t] = (traitBonuses[t] ?? 0) + 1;
          traitMarks.push(t);
        }
        break;
      case 'hp':
        maxHp += 1;
        break;
      case 'stress':
        stressMax += 1;
        break;
      case 'exp':
        experiences = experiences.map((e) => ((a.expIds ?? []).includes(e.id) ? { ...e, modifier: (e.modifier ?? 2) + 1 } : e));
        break;
      case 'domain':
        if (a.domainCardId) {
          domainIds = [...domainIds, a.domainCardId];
          activeIds = activate(activeIds, a.domainCardId);
        }
        break;
      case 'evasion':
        evasionBase += 1;
        break;
      case 'prof':
        proficiencyBonus += 1;
        break;
      case 'subclass':
        // #311: a multiclassed character can't gain a subclass mastery; never advance the tier for them
        // (the option is also removed from availableAdvancements — this is a defensive backstop).
        if (!file.multiclassName) {
          subclassTier = SUBCLASS_NEXT[subclassTier];
          // v0.10.2 (Bug 3): actually ADD the next subclass card so it lands in the loadout and applies
          // its effects, instead of only bumping the tier enum. subclassCardId stays the tier-1 foundation,
          // so the target tier comes from the just-advanced enum (specialization → 2, mastery → 3). Resolves
          // catalog subclasses AND custom (homebrew) ones embedded on the file (v0.10.5).
          const nextId = nextSubclassCardId(file, file.subclassCardId, subclassTier === 'mastery' ? 3 : 2);
          if (nextId && !acquired.includes(nextId)) {
            acquired = [...acquired, nextId];
            acquiredChanged = true;
            // v0.10.5: ride the Arsenal next to the foundation subclass card, not off in Inventory.
            cardCategory = { ...(cardCategory ?? {}), [nextId]: 'abilities' };
          }
        }
        break;
      case 'multiclass':
        multiclassName = (a.multiclass as CharacterFile['multiclassName']) ?? multiclassName;
        if (a.multiclassSubclassCardId) multiclassSubclassCardId = a.multiclassSubclassCardId;
        if (a.multiclassDomain) multiclassDomain = a.multiclassDomain;
        break;
      // v0.42.1: the TAKE is recorded, never its result. The card's element is derived from the takes
      // wherever it is drawn, so a Combo Die that becomes a d6 does so in one place.
      case 'card':
        if (a.cardAdvanceKey) cardAdvances = [...cardAdvances, { key: a.cardAdvanceKey, tier: curTier }];
        break;
    }
  }

  next.domainCardIds = domainIds;
  next.activeDomainCardIds = activeIds;
  next.experiences = experiences;
  next.traitMarks = traitMarks;
  next.advancementMarks = marks;
  next.advancementMarksTier = curTier;
  if (acquiredChanged) {
    next.acquiredCardIds = acquired;
    next.cardCategory = cardCategory;
  }
  next.traitBonuses = traitBonuses;
  next.maxHp = maxHp;
  next.stressMax = stressMax;
  next.evasionBase = evasionBase;
  next.proficiencyBonus = proficiencyBonus;
  next.subclassTier = subclassTier;
  next.multiclassName = multiclassName;
  next.multiclassSubclassCardId = multiclassSubclassCardId;
  next.multiclassDomain = multiclassDomain;
  if (cardAdvances.length) next.cardAdvances = cardAdvances;

  // Beastbound companion (#311): it gains an Experience whenever the character does (tier start), then
  // folds in any training options chosen this level-up. `next` is used so a companion gained THIS
  // level-up via multiclass also advances.
  if (hasCompanion(next)) {
    let companion = companionOf(next);
    if (isTierStart(newLevel)) companion = addCompanionExperience(companion);
    for (const key of plan.companionOptions ?? []) companion = applyCompanionOption(companion, key);
    next.companion = companion;
  }
  return next;
}

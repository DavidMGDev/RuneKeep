/**
 * CharacterFile — the versioned, serializable document a character IS (PRODUCT.md principle 6).
 * This is the wire/disk format: plain JSON, no requires, no derived state. The sheet's richer
 * runtime `Character` shape is DERIVED from it (`toSheetCharacter`), never stored.
 * Bump `schemaVersion` + extend `parseCharacterFile` when the shape changes.
 */

import { type ClassName, classInfo } from '@/constants/identity';
import { CATALOG, cardById } from '@/data/catalog';
import { normalizeLibraryCard, type LibraryCard } from '@/lib/library';
import { effectsForCardId, sourceLabelForCardId } from '@/features/cards/card-effects';
import { type Character, SAMPLE_CHARACTER, type TraitKey } from '@/features/character-sheet/character';
import { CLASS_DATA } from '@/data/class-data';
import { activeWildshapeName } from '@/data/wildshape-data';
import { type BaseStats, type CardEffect, computeSheet, type EffectSource } from '@/lib/modifiers';

/** Daggerheart proficiency by level (#128): tier 1 = 1, tier 2 (L2-4) = 2, tier 3 (L5-7) = 3, tier 4 = 4. */
export function proficiencyForLevel(level: number): number {
  return level <= 1 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4;
}

export const CHARACTER_SCHEMA_VERSION = 1;

export interface ExperienceDef {
  id: string;
  title: string;
  text: string;
  imageUri: string | null;
  /** Flat random art color (#153) — used when there's no image. */
  color?: string | null;
  /** Numeric bonus on the experience (#164 level-up: starts at +2, advancements add +1). */
  modifier?: number;
  /** Structured stat effects a player attached to this card (#175): applied when the card is
   *  enabled in the carousel. Authored via the card editor's "add effect" control. */
  effects?: CardEffect[];
  /** The player-chosen card "type" shown on the plaque (#214): e.g. Note / Reminder / Story, or
   *  Item / Tool, or Ability / Skill. Cycled via the editor's type chip; falls back per category. */
  typeLabel?: string;
}

/** A player-authored card created on the sheet (#164), routed to one or both decks. */
export interface CustomCardDef extends ExperienceDef {
  target: 'inventory' | 'arsenal' | 'both';
}

export type ModTarget = TraitKey | 'evasion';
/** A named, reversible modifier (#166 settings): e.g. armor's -1 Evasion while equipped. Kept as a
 *  history so any one can be removed without touching the base value. */
export interface StatModifier {
  id: string;
  target: ModTarget;
  delta: number;
  label: string;
}
/** Net delta from all modifiers aimed at one target. */
export function modSum(mods: StatModifier[] | undefined, target: ModTarget): number {
  return (mods ?? []).reduce((sum, m) => sum + (m.target === target ? m.delta : 0), 0);
}

export interface CharacterFile {
  schemaVersion: number;
  id: string;
  createdAt: string; // ISO
  name: string;
  portraitUri: string | null;
  className: ClassName;
  /** Catalog ids — the actual cards picked at creation. */
  subclassCardId: string;
  ancestryCardId: string;
  communityCardId: string;
  domainCardIds: string[];
  /** v0.12.2: which EXPANSIONS this character was created with (e.g. ['void'] + custom ids). Undefined
   *  or empty = base game only (back-compat). Gates which catalog/library content the sheet + ADD GEAR
   *  show; travels with the character so a shared hero still shows all its cards. */
  enabledExpansionIds?: string[];
  /** Trait modifiers, distributed at creation (+2, +1, +1, 0, 0, −1 in any order, #107). */
  traits?: Record<TraitKey, number>;
  /** The two creation experiences — player-authored cards (#107). */
  experiences?: ExperienceDef[];
  /** Tier-1 starting equipment ids (#121): a required primary weapon, an optional 1H secondary, an
   *  armor. Ids reference equipment-data (immutable forged cards), not the catalog. */
  weaponPrimaryId?: string;
  weaponSecondaryId?: string | null;
  armorId?: string;
  /** Inventory (#128): selected suggested-item ids (incl. 'item-gold') + user-authored item cards. */
  inventoryItemIds?: string[];
  inventoryCustom?: ExperienceDef[];
  /** Gold (#128): handfuls/bags/chest counts (max 10/10/1). */
  gold?: { handfuls: number; bags: number; chest: number };
  /** In-play resource state (v0.9.7): current HP, spent Stress, current Hope, available Armor slots —
   *  persisted so they survive an app restart (the runtime Character used to reset to full/default on
   *  every load). Gold lives in its own field above. Additive; absent on old saves → derived defaults. */
  resources?: { hp: number; stress: number; hope: number; armor: number };
  /** Portrait position in its mask (#155): zoom + offset. */
  portraitTransform?: { scale: number; x: number; y: number };
  /** Player-authored cards made on the sheet (#164), each routed to inventory / arsenal / both. */
  customCards?: CustomCardDef[];
  /** Notes (#214): freeform note-taking cards, their own carousel category. Optional titles. Not in
   *  the inventory. Additive — absent on existing saves. */
  notes?: ExperienceDef[];
  /** Whether the Notes category appears in the over-scroll ring (#214). DEPRECATED by
   *  `hiddenCategories` (#227) — read only for back-compat (showNotes === false → notes hidden). */
  showNotes?: boolean;
  /** Card categories the player toggled OFF in the Cards panel (#227). Absent → all shown. At least
   *  one category always stays on (enforced in the UI + activeRing's fallback). */
  hiddenCategories?: import('@/features/character-sheet/card-data').CardCategory[];
  // --- settings + level-up overrides (#166/#167). All additive; schemaVersion stays 1 so existing
  //     saved characters keep loading and simply fall back to the class/creation defaults. ---
  /** HP ceiling override (#166: edit "instead of 6 I want 7"; #167: +1 per Hit Point advancement). */
  maxHp?: number;
  /** Unlocked Stress slots (default 6; +1 per Stress advancement). */
  stressMax?: number;
  /** Unlocked Armor slots (default = armor card's base score). */
  armorScoreMax?: number;
  /** Base Evasion override (default = class starting Evasion; +1 per Evasion advancement). */
  evasionBase?: number;
  /** Permanent Proficiency bonus from level-up advancements (on top of the level-derived value). */
  proficiencyBonus?: number;
  /** Permanent per-trait bonuses from level-up advancements. */
  traitBonuses?: Partial<Record<TraitKey, number>>;
  /** Reversible settings modifiers on traits/evasion (#166). */
  modifiers?: StatModifier[];
  /** Vault (#166): which domain cards are active (≤5). Undefined → the first ≤5 of domainCardIds. */
  activeDomainCardIds?: string[];
  // --- level-up (#167) ---
  /** +1 to both damage thresholds per level (added to the armor card's base thresholds). */
  thresholdBonus?: number;
  /** Advancement slots marked per option key. v0.10.2: PER-TIER — `advancementMarksTier` stamps which
   *  tier these marks belong to; leveling ignores (and resets) marks from a different tier. */
  advancementMarks?: Record<string, number>;
  /** The tier `advancementMarks` were stamped in (v0.10.2). Absent on pre-0.10.2 saves → their marks read
   *  as stale and the current tier's menu opens fresh (self-heals characters soft-locked by the old
   *  campaign-wide accounting). */
  advancementMarksTier?: number;
  /** Traits marked by the trait advancement (can't raise again until cleared at level 5/8). */
  traitMarks?: TraitKey[];
  /** Subclass progression from the "upgrade subclass" advancement. */
  subclassTier?: 'foundation' | 'specialization' | 'mastery';
  /** Multiclass (#311) chosen via the multiclass advancement: the additional class, a subclass
   *  foundation card from it, and one domain from it. Domain cards from `multiclassDomain` become
   *  selectable at half the character's level (rounded up) going forward. All additive. */
  multiclassName?: ClassName;
  multiclassSubclassCardId?: string;
  multiclassDomain?: string;
  /** Cards the player has ENABLED/equipped (#175): the modifier engine layers each enabled card's
   *  effects onto the base stats. Ids are stable deck-card ids (catalog / equipment / loot / custom).
   *  Additive + optional, so existing saves (undefined) compute exactly as before. */
  enabledCardIds?: string[];
  /** System equipment/loot the player picked up beyond creation (#175/#180): weapon/armor/loot ids
   *  from the rulebook catalog, forged into the decks so tier 2+ gear can be equipped + enabled. */
  acquiredCardIds?: string[];
  /** Card tokens (#244): cosmetic "buttons" the player drags onto a fullscreen card, keyed by deck-card
   *  id. Purely decorative — never read by the modifier engine. Additive; absent on old saves. */
  cardTokens?: Record<string, import('@/features/character-sheet/components/card-tokens-data').PlacedToken[]>;
  /** The custom-colour token drawer button's colour, persisted across all cards (#244). */
  tokenColor?: string;
  /** The token drawer's horizontal anchor along the top (#244), normalized 0..1. */
  tokenDrawerX?: number;
  // --- card management (#246) — all additive; absent on old saves means "no customisation". ---
  /** Player-created carousel categories: id, label, icon key (from the category icon library). */
  customCategories?: import('@/features/character-sheet/carousel-categories').CustomCategory[];
  /** Per-card category OVERRIDE (#246): deck-card id → category key. Moves a card to a different
   *  (built-in or custom) category than its default. Cards without an entry stay in their default. */
  cardCategory?: Record<string, string>;
  /** Explicit category order for the over-scroll ring (#246): keys lead in this order, rest follow. */
  categoryOrder?: string[];
  /** Player-created card "type" labels (#246) for the middle ribbon, on top of the built-in types. */
  customCardTypes?: string[];
  /** Cards the player DELETED from the gallery (#248 item 5): any deck-card id here is filtered out of
   *  every deck. Lets system cards (domains, origins, equipment, gold) be removed without corrupting
   *  the file's structure. Authored/acquired cards are also dropped from their own arrays. */
  removedCardIds?: string[];
  /** Explicit per-category card order (#252): category key → ordered card ids. Drag-drop in the Cards
   *  gallery writes this; deck assembly sorts each category by it (ids not listed keep their natural
   *  order, after the listed ones). Additive. */
  cardOrder?: Record<string, string[]>;
  /** Mixed ancestry (#265): two ancestries combined — `first` keeps its FIRST trait, `second` keeps its
   *  SECOND trait. Both cards are added to the sheet; each card's inactive half is crossed out and its
   *  modifiers dropped. When set, the single `ancestryCardId` is unused. Additive; absent → single. */
  mixedAncestry?: { first: string; second: string };
  /** Per-card EFFECT OVERRIDES (#278): catalog card id → the player's edited effect list, applied
   *  INSTEAD of the card's code-defined effects. Lets players fix/add/remove modifiers on catalog cards
   *  (custom cards edit their own `effects`). Keyed by catalog id (so all copies share). Additive. */
  cardEffectOverrides?: Record<string, import('@/lib/modifiers').CardEffect[]>;
  /** Card copies (#277): extra deck instances of an existing card. Each has its own unique instance
   *  `id` (for position/category/tokens) but a `ref` to the underlying card (catalog id or custom-card
   *  id) — copies SHARE enable state + apply their effect once (enable is keyed by ref). Additive. */
  cardCopies?: { id: string; ref: string }[];
  /** Beastform (#279): while transformed, weapon cards are auto-unequipped and stored here so they
   *  re-equip when the form ends; `beastformDomainSnapshot` records the domain cards enabled at
   *  transform time (re-equipping one is allowed mid-form; new domains are blocked). Additive. */
  beastformUnequipped?: string[];
  beastformDomainSnapshot?: string[];
  /** Ranger Beastbound companion (#311): the companion sheet's tracked state (Evasion, Stress, damage
   *  die + range, Experiences, training options). Present only for a Beastbound character (primary or
   *  via multiclass); absent → a fresh companion is used. Additive. */
  companion?: import('@/lib/companion').CompanionState;
  /** Martial Artist Brawler (#357): Focus tokens tracked on the live Focus card (0–6, rolled with
   *  physical d6s at rest). Additive; absent → 0. */
  martialFocus?: number;
  /** v0.10.3: embedded homebrew (library) cards this character USES — a self-contained COPY of each
   *  picked LibraryCard, so it renders + resolves effects with no expansion installed and survives the
   *  expansion being disabled/deleted (Bug 4). Structural slot ids (ancestry/subclass/community/domain/
   *  armor) may reference these ids. Additive; absent on old saves = unchanged behavior. */
  libraryCards?: LibraryCard[];
  level: number;
}

export function newCharacterId(): string {
  // Collision-safe enough for a local roster; not a global uuid on purpose (no crypto needed).
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parse + validate unknown JSON (imports!) into a CharacterFile. Throws with a readable reason. */
export function parseCharacterFile(raw: string): CharacterFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Not a JSON file');
  }
  const f = data as Partial<CharacterFile>;
  if (typeof f !== 'object' || f === null) throw new Error('Not a character file');
  if (f.schemaVersion !== CHARACTER_SCHEMA_VERSION) throw new Error(`Unsupported version ${f.schemaVersion}`);
  if (typeof f.id !== 'string' || typeof f.name !== 'string' || !f.name.trim()) throw new Error('Missing name');
  // v0.10.3: normalize embedded homebrew cards (trust boundary for imported characters), then let the
  // structural/domain ids resolve against them as well as the catalog. No `libraryCards` = old behavior.
  if (f.libraryCards !== undefined) {
    if (!Array.isArray(f.libraryCards)) throw new Error('libraryCards must be an array');
    f.libraryCards = f.libraryCards.map((c, i) => normalizeLibraryCard(c, i));
  }
  const libIds = new Set((f.libraryCards ?? []).map((c) => c.id));
  const known = (id: unknown): boolean => typeof id === 'string' && (!!cardById(id) || libIds.has(id));
  for (const key of ['subclassCardId', 'ancestryCardId', 'communityCardId'] as const) {
    if (!known(f[key])) throw new Error(`Unknown card: ${String(f[key])}`);
  }
  if (!Array.isArray(f.domainCardIds) || f.domainCardIds.some((id) => !known(id))) throw new Error('Unknown domain card');
  if (typeof f.className !== 'string' || !classInfo(f.className as ClassName)) throw new Error('Unknown class');
  // v0.10.2 (Bug 3 backfill): older saves advanced `subclassTier` without ever gaining the matching
  // specialization/mastery card. Ensure every sibling up to the current tier is present so the deck shows
  // it. Idempotent (guarded by includes) and only touches non-multiclassed subclass upgraders.
  if ((f.subclassTier === 'specialization' || f.subclassTier === 'mastery') && !f.multiclassName) {
    const slug = cardById(f.subclassCardId!)?.subclass;
    if (slug) {
      const acquired = [...(f.acquiredCardIds ?? [])];
      const cardCategory = { ...(f.cardCategory ?? {}) };
      const targets = f.subclassTier === 'mastery' ? [2, 3] : [2];
      for (const t of targets) {
        const id = CATALOG.find((c) => c.kind === 'subclass' && c.subclass === slug && c.tier === t)?.id;
        if (id && !acquired.includes(id)) { acquired.push(id); cardCategory[id] = 'abilities'; } // v0.10.5: ride the Arsenal
      }
      if (acquired.length !== (f.acquiredCardIds?.length ?? 0)) { f.acquiredCardIds = acquired; f.cardCategory = cardCategory; }
    }
  }
  return f as CharacterFile;
}

export function serializeCharacterFile(file: CharacterFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * Per-level damage-threshold bonus as MODIFIER sources (#282/#320), one per level INCLUDING level 1,
 * so the base thresholds are 0/0 and ALL of the value comes from these bonuses (the threshold pass adds
 * bonuses after a `set`, so they stack on an armor/Bare-Bones set instead of being wiped).
 *
 * The Daggerheart rule (#320): you always ADD YOUR LEVEL to the thresholds of your armor or domain card.
 * So when a card SETS the thresholds (`armored`), each level grants +1 major / +1 severe → set + level.
 * An UNARMORED character (no set) instead scales 1×level major / 2×level severe (base 0/0) — the same
 * 1 / 2 at level 1 as before, now treated as a per-level bonus rather than a baked-in base.
 */
function levelThresholdSources(level: number, armored: boolean): EffectSource[] {
  const out: EffectSource[] = [];
  const severeDelta = armored ? 1 : 2;
  for (let L = 1; L <= level; L++) {
    // #297: the source is already "Level N"; the note must NOT repeat it (the panel renders
    // "{source} · {note}", so a "Level N:" note printed "Level 2 · Level 2: …").
    out.push({ source: `Level ${L}`, effects: [
      { target: 'majorThreshold', mode: 'bonus', delta: 1, note: '+1 major threshold' },
      { target: 'severeThreshold', mode: 'bonus', delta: severeDelta, note: `+${severeDelta} severe threshold` },
    ] });
  }
  return out;
}

/** The enabled cards' effect sources (#175), deduped by ref so several copies apply once. */
function enabledCardSources(file: CharacterFile): EffectSource[] {
  return [...new Set(file.enabledCardIds ?? [])]
    .map((id) => ({ source: sourceLabelForCardId(id, file), effects: effectsForCardId(id, file) }))
    .filter((s) => s.effects.length > 0);
}

/** Full effect sources = the per-level threshold bonus (armored-aware, #320) + the enabled cards. */
function allEffectSources(file: CharacterFile): EffectSource[] {
  const cards = enabledCardSources(file);
  // "Armored" = some enabled card SETS a threshold (armor card, or Bare Bones). Then the level bonus is
  // +1/+1 (add-your-level on top of the set); otherwise the unarmored 1×/2× scaling applies.
  const armored = cards.some((s) => s.effects.some((e) => (e.target === 'majorThreshold' || e.target === 'severeThreshold') && e.mode === 'set'));
  return [...levelThresholdSources(file.level, armored), ...cards];
}

/**
 * Derive the sheet's runtime Character. Class starting stats come from the rulebook data
 * (#104: starting Evasion + starting Hit Points per class; hearts = HP slots, full at creation).
 * Traits and the other tracks stay at the sheet baseline until leveling/traits ship.
 */
export function toSheetCharacter(file: CharacterFile): Character {
  const cls = classInfo(file.className);
  const data = CLASS_DATA[file.className];
  const subclass = cardById(file.subclassCardId);
  const ancestry = cardById(file.ancestryCardId);
  const community = cardById(file.communityCardId);
  // v0.10.3: an embedded homebrew card's title labels the slot when it isn't a catalog card.
  const libTitle = (id: string) => file.libraryCards?.find((c) => c.id === id)?.title;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Armor (#128/#242/#297): an UNARMORED character has armor score 0 — the base is 0, never the chosen
  // card's score. Equipping an armor card contributes its base score (and SETS the damage thresholds)
  // through the modifier engine, so all of it shows in the Modifiers panel. `armorScoreMax` is kept only
  // as a legacy manual override. Damage thresholds are likewise level-based at the base (#242 item 9).
  const ARMOR_SLOTS = 12;
  // Settings/level-up overrides (#166/#167) layer on the class/creation defaults; modifiers add on top.
  const TRAIT_KEYS: TraitKey[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
  const baseTraits = file.traits ?? SAMPLE_CHARACTER.traits;
  // The BASE stats are the intrinsic class/creation values plus the legacy file overrides (so an
  // existing save with no enabled cards derives exactly as before). The modifier engine (#175) then
  // layers every ENABLED card's effects on top.
  const base: BaseStats = {
    agility: (baseTraits.agility ?? 0) + (file.traitBonuses?.agility ?? 0) + modSum(file.modifiers, 'agility'),
    strength: (baseTraits.strength ?? 0) + (file.traitBonuses?.strength ?? 0) + modSum(file.modifiers, 'strength'),
    finesse: (baseTraits.finesse ?? 0) + (file.traitBonuses?.finesse ?? 0) + modSum(file.modifiers, 'finesse'),
    instinct: (baseTraits.instinct ?? 0) + (file.traitBonuses?.instinct ?? 0) + modSum(file.modifiers, 'instinct'),
    presence: (baseTraits.presence ?? 0) + (file.traitBonuses?.presence ?? 0) + modSum(file.modifiers, 'presence'),
    knowledge: (baseTraits.knowledge ?? 0) + (file.traitBonuses?.knowledge ?? 0) + modSum(file.modifiers, 'knowledge'),
    evasion: (file.evasionBase ?? data.startingEvasion) + modSum(file.modifiers, 'evasion'),
    armorScore: file.armorScoreMax ?? 0, // #297: unarmored = 0; equipped armor adds its score as a modifier
    maxHp: file.maxHp ?? data.startingHp,
    stressMax: file.stressMax ?? 6,
    hopeMax: 6,
    proficiency: proficiencyForLevel(file.level) + (file.proficiencyBonus ?? 0), // level 1 → 1 (#128)
    // #320: base thresholds are 0/0 — ALL value is per-level bonuses (levelThresholdSources), so the
    // character's level is always added to an armor/Bare-Bones `set`, and an unarmored character scales
    // 1×level / 2×level (still 1 / 2 at level 1). Nothing is baked into the base for a `set` to wipe.
    majorThreshold: 0,
    severeThreshold: 0,
    scar: 0, // v0.13.0: scars come only from enabled "Add Scar" cards
  };
  const sources = allEffectSources(file);
  const sheet = computeSheet(base, file.level, sources);
  // v0.13.0 SCARS: each enabled scar card disables one Hope slot from the RIGHT. Flat count — freeing
  // any scar card always releases the leftmost scarred slot. Hope in play can never sit on a scarred slot.
  const scars = Math.max(0, Math.min(sheet.hopeMax.total, sheet.scar.total));
  const usableHope = sheet.hopeMax.total - scars;
  const maxHp = sheet.maxHp.total;
  const stressMax = sheet.stressMax.total;
  const armorMax = sheet.armorScore.total;
  const traits = Object.fromEntries(TRAIT_KEYS.map((k) => [k, sheet[k].total])) as Record<TraitKey, number>;
  // (v0.9.7) Rehydrate the in-play resource positions saved on the file, clamped to the current maxes.
  const res = file.resources;
  const clampRes = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));
  return {
    ...SAMPLE_CHARACTER,
    // Wild Shape (#214): while a Beastform is enabled, the sheet shows the FORM's name so the player
    // always knows they're transformed — even when browsing other categories. file.name is unchanged.
    name: activeWildshapeName(file) ?? file.name,
    level: file.level,
    className: cls.label,
    subclass: subclass?.label.replace(/ Foundation$/, '') ?? libTitle(file.subclassCardId) ?? '',
    ancestry: ancestry?.label ?? libTitle(file.ancestryCardId) ?? '',
    community: community?.label ?? libTitle(file.communityCardId) ?? '',
    domains: [cap(cls.domains[0]), cap(cls.domains[1])],
    portraitUri: file.portraitUri,
    portraitTransform: file.portraitTransform ?? { scale: 1, x: 0, y: 0 },
    evasion: sheet.evasion.total,
    proficiency: sheet.proficiency.total,
    armorScore: armorMax,
    damageThresholds: { major: sheet.majorThreshold.total, severe: sheet.severeThreshold.total },
    // Rulebook starting resources (#107): hearts full at the class's max (only that many hearts
    // are drawn; 7 hp = one golden + five red), 6 of 12 stress unlocked, hope starts at 2 of 6.
    hp: res ? clampRes(res.hp, maxHp) : maxHp,
    maxHp,
    // armor: the unlocked slots are enabled (filled), the rest disabled (#128)
    armor: { active: res ? clampRes(res.armor, armorMax) : armorMax, total: ARMOR_SLOTS, locked: Math.max(0, ARMOR_SLOTS - armorMax) },
    stress: { active: res ? clampRes(res.stress, stressMax) : 0, total: 12, locked: Math.max(0, 12 - stressMax) },
    // Scarred slots ride the Track's `locked` convention, so every ±1/rest path caps at the usable slots.
    hope: { active: res ? clampRes(res.hope, usableHope) : Math.min(2, usableHope), total: sheet.hopeMax.total, locked: scars || undefined },
    scars,
    gold: file.gold ?? { handfuls: 1, bags: 0, chest: 0 }, // the kit's handful of gold (#136)
    traits,
  };
}

/**
 * The full stat breakdown for the Modifiers panel (#175): base value + every enabled card's
 * contribution + capped total, per sheet stat. Re-derived from the file like `toSheetCharacter`,
 * but exposing the provenance the panel renders.
 */
export function sheetBreakdown(file: CharacterFile): import('@/lib/modifiers').SheetBreakdown {
  const data = CLASS_DATA[file.className];
  const baseTraits = file.traits ?? SAMPLE_CHARACTER.traits;
  const base: BaseStats = {
    agility: (baseTraits.agility ?? 0) + (file.traitBonuses?.agility ?? 0) + modSum(file.modifiers, 'agility'),
    strength: (baseTraits.strength ?? 0) + (file.traitBonuses?.strength ?? 0) + modSum(file.modifiers, 'strength'),
    finesse: (baseTraits.finesse ?? 0) + (file.traitBonuses?.finesse ?? 0) + modSum(file.modifiers, 'finesse'),
    instinct: (baseTraits.instinct ?? 0) + (file.traitBonuses?.instinct ?? 0) + modSum(file.modifiers, 'instinct'),
    presence: (baseTraits.presence ?? 0) + (file.traitBonuses?.presence ?? 0) + modSum(file.modifiers, 'presence'),
    knowledge: (baseTraits.knowledge ?? 0) + (file.traitBonuses?.knowledge ?? 0) + modSum(file.modifiers, 'knowledge'),
    evasion: (file.evasionBase ?? data.startingEvasion) + modSum(file.modifiers, 'evasion'),
    armorScore: file.armorScoreMax ?? 0, // #297: unarmored = 0; equipped armor adds its score as a modifier
    maxHp: file.maxHp ?? data.startingHp,
    stressMax: file.stressMax ?? 6,
    hopeMax: 6,
    proficiency: proficiencyForLevel(file.level) + (file.proficiencyBonus ?? 0),
    majorThreshold: 0, // #320: thresholds come entirely from per-level bonuses (see toSheetCharacter)
    severeThreshold: 0,
    scar: 0, // v0.13.0
  };
  return computeSheet(base, file.level, allEffectSources(file));
}

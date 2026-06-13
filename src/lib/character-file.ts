/**
 * CharacterFile — the versioned, serializable document a character IS (PRODUCT.md principle 6).
 * This is the wire/disk format: plain JSON, no requires, no derived state. The sheet's richer
 * runtime `Character` shape is DERIVED from it (`toSheetCharacter`), never stored.
 * Bump `schemaVersion` + extend `parseCharacterFile` when the shape changes.
 */

import { type ClassName, classInfo } from '@/constants/identity';
import { cardById } from '@/features/cards/catalog';
import { type Character, SAMPLE_CHARACTER, type TraitKey } from '@/features/character-sheet/character';
import { CLASS_DATA } from '@/features/create/class-data';
import { armorById } from '@/features/create/equipment-data';

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
  /** Portrait position in its mask (#155): zoom + offset. */
  portraitTransform?: { scale: number; x: number; y: number };
  /** Player-authored cards made on the sheet (#164), each routed to inventory / arsenal / both. */
  customCards?: CustomCardDef[];
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
  for (const key of ['subclassCardId', 'ancestryCardId', 'communityCardId'] as const) {
    const id = f[key];
    if (typeof id !== 'string' || !cardById(id)) throw new Error(`Unknown card: ${String(f[key])}`);
  }
  if (!Array.isArray(f.domainCardIds) || f.domainCardIds.some((id) => !cardById(id))) throw new Error('Unknown domain card');
  if (typeof f.className !== 'string' || !classInfo(f.className as ClassName)) throw new Error('Unknown class');
  return f as CharacterFile;
}

export function serializeCharacterFile(file: CharacterFile): string {
  return JSON.stringify(file, null, 2);
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
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Armor (#128): the chosen card sets the damage thresholds (used VERBATIM, no level bonus per
  // owner) and the base score = how many armor slots are enabled (the rest stay locked/disabled).
  const armor = file.armorId ? armorById(file.armorId) : undefined;
  const [tMajor, tSevere] = (armor?.thresholds ?? '0 / 0').split('/').map((n) => parseInt(n.trim(), 10) || 0);
  const baseScore = armor?.baseScore ?? 0;
  const ARMOR_SLOTS = 12;
  // Settings/level-up overrides (#166/#167) layer on the class/creation defaults; modifiers add on top.
  const maxHp = file.maxHp ?? data.startingHp;
  const stressMax = file.stressMax ?? 6;
  const armorMax = file.armorScoreMax ?? baseScore;
  const baseEvasion = file.evasionBase ?? data.startingEvasion;
  const TRAIT_KEYS: TraitKey[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
  const baseTraits = file.traits ?? SAMPLE_CHARACTER.traits;
  const traits = Object.fromEntries(
    TRAIT_KEYS.map((k) => [k, (baseTraits[k] ?? 0) + (file.traitBonuses?.[k] ?? 0) + modSum(file.modifiers, k)]),
  ) as Record<TraitKey, number>;
  return {
    ...SAMPLE_CHARACTER,
    name: file.name,
    level: file.level,
    className: cls.label,
    subclass: subclass?.label.replace(/ Foundation$/, '') ?? '',
    ancestry: ancestry?.label ?? '',
    community: community?.label ?? '',
    domains: [cap(cls.domains[0]), cap(cls.domains[1])],
    portraitUri: file.portraitUri,
    portraitTransform: file.portraitTransform ?? { scale: 1, x: 0, y: 0 },
    evasion: baseEvasion + modSum(file.modifiers, 'evasion'),
    proficiency: proficiencyForLevel(file.level) + (file.proficiencyBonus ?? 0), // level 1 → 1 (#128)
    armorScore: armorMax,
    damageThresholds: { major: tMajor, severe: tSevere },
    // Rulebook starting resources (#107): hearts full at the class's max (only that many hearts
    // are drawn; 7 hp = one golden + five red), 6 of 12 stress unlocked, hope starts at 2 of 6.
    hp: maxHp,
    maxHp,
    // armor: the unlocked slots are enabled (filled), the rest disabled (#128)
    armor: { active: armorMax, total: ARMOR_SLOTS, locked: Math.max(0, ARMOR_SLOTS - armorMax) },
    stress: { active: 0, total: 12, locked: Math.max(0, 12 - stressMax) },
    hope: { active: 2, total: 6 },
    gold: file.gold ?? { handfuls: 1, bags: 0, chest: 0 }, // the kit's handful of gold (#136)
    traits,
  };
}

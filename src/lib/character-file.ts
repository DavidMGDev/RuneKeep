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
    evasion: data.startingEvasion,
    proficiency: proficiencyForLevel(file.level), // level 1 → 1 (#128, was stuck at the sample's 2)
    armorScore: baseScore,
    damageThresholds: { major: tMajor, severe: tSevere },
    // Rulebook starting resources (#107): hearts full at the class's max (only that many hearts
    // are drawn; 7 hp = one golden + five red), 6 of 12 stress unlocked, hope starts at 2 of 6.
    hp: data.startingHp,
    maxHp: data.startingHp,
    // armor: the base-score slots are enabled (filled), the rest disabled (#128)
    armor: { active: baseScore, total: ARMOR_SLOTS, locked: Math.max(0, ARMOR_SLOTS - baseScore) },
    stress: { active: 0, total: 12, locked: 6 },
    hope: { active: 2, total: 6 },
    ...(file.traits ? { traits: file.traits } : null),
  };
}

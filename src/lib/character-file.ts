/**
 * CharacterFile — the versioned, serializable document a character IS (PRODUCT.md principle 6).
 * This is the wire/disk format: plain JSON, no requires, no derived state. The sheet's richer
 * runtime `Character` shape is DERIVED from it (`toSheetCharacter`), never stored.
 * Bump `schemaVersion` + extend `parseCharacterFile` when the shape changes.
 */

import { type ClassName, classInfo } from '@/constants/identity';
import { cardById } from '@/features/cards/catalog';
import { type Character, SAMPLE_CHARACTER } from '@/features/character-sheet/character';

export const CHARACTER_SCHEMA_VERSION = 1;

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
 * Derive the sheet's runtime Character. Until leveling ships, resources/traits use the current
 * sheet baseline (owner: "start them as the character sheet is", level 1).
 */
export function toSheetCharacter(file: CharacterFile): Character {
  const cls = classInfo(file.className);
  const subclass = cardById(file.subclassCardId);
  const ancestry = cardById(file.ancestryCardId);
  const community = cardById(file.communityCardId);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
  };
}

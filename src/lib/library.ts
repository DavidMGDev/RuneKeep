/**
 * Library model (v0.10.0) — reusable homebrew content that lives at the APP level, independent of any
 * character. Content is organised into EXPANSIONS (named, versioned bundles of cards) that the player
 * authors or receives from others and enables per character-creation session.
 *
 * A `LibraryCard` is a `CharacterFile.ExperienceDef` (same authored shape — title/text/art/effects)
 * plus the bits that let it act as a specific kind of creation content (ancestry / community / domain /
 * subclass / class / generic). Everything is plain JSON: this is a wire/disk shape with no requires and
 * no derived state, exactly like `CharacterFile`.
 */
import type { CardEffect } from '@/lib/modifiers';

export type LibraryContentType = 'ancestry' | 'community' | 'domain' | 'subclass' | 'class' | 'weapon' | 'armor' | 'inventory' | 'generic';

export const CONTENT_TYPE_LABEL: Record<LibraryContentType, string> = {
  ancestry: 'Ancestry',
  community: 'Community',
  domain: 'Domain card',
  subclass: 'Subclass',
  class: 'Class',
  weapon: 'Weapon',
  armor: 'Armor',
  inventory: 'Item',
  generic: 'Card',
};

/** A titled body block (v0.10.2): the multi-field card body. `name` is an optional bold lead-in (e.g. a
 *  feature name); `body` is markdown. Composed to a single `text` for simple rendering, kept structured
 *  so mixed-ancestry cross-out can strike a specific feature (Feature 4/8). */
export interface CardSection {
  name?: string;
  body: string;
}

/** Mechanical fields for a custom WEAPON (v0.10.2) — mirrors data/equipment WeaponDef so a custom weapon
 *  can act as a real weapon in creation/on the sheet (damage roll, trait, slot). */
export interface WeaponSpec {
  trait: string;
  range: string;
  damage: string;
  damageType: 'phy' | 'mag';
  burden: 'One-Handed' | 'Two-Handed';
  kind: 'physical' | 'magic';
  slot: 'primary' | 'secondary';
  tier: 1 | 2 | 3 | 4;
}

/** Mechanical fields for custom ARMOR (v0.10.2) — mirrors data/equipment ArmorDef ("major/severe"). */
export interface ArmorSpec {
  baseScore: number;
  thresholds: string;
  tier: 1 | 2 | 3 | 4;
}

export interface LibraryCard {
  /** Stable id, immutable across expansion versions (so existing characters keep resolving). */
  id: string;
  contentType: LibraryContentType;
  title: string;
  text: string;
  imageUri: string | null;
  color?: string | null;
  effects?: CardEffect[];
  typeLabel?: string;
  /** domain content: which domain (built-in name or a custom one) + its level (1–10). */
  domain?: string;
  level?: number;
  /** subclass/class content: the class this belongs to (built-in key or a custom class id). */
  className?: string;
  /** ancestry content: which feature line (1 or 2) carries the passive effect — for mixed-ancestry
   *  cross-out (mirrors data/ancestry-traits ANCESTRY_EFFECT_TRAIT). */
  ancestryEffectTrait?: 1 | 2;
  /** v0.10.2: the multi-field body (add/del/reorder). When present, the card renders per-section; `text`
   *  stays as a composed-markdown fallback for simple renderers. */
  sections?: CardSection[];
  /** v0.10.2: mechanical data for weapon/armor content so it works in creation + on the sheet. */
  weapon?: WeaponSpec;
  armor?: ArmorSpec;
}

export interface Expansion {
  /** Stable identity that survives renames — the key for update-in-place on import. */
  id: string;
  name: string;
  author: string;
  description: string;
  /** Monotonic integer; a higher incoming version updates an installed expansion in place. */
  version: number;
  createdAt: string; // ISO
  cards: LibraryCard[];
  /** v0.10.3: when false, the expansion's content is HIDDEN from character creation + ADD GEAR (but
   *  never deleted — characters already using its cards keep them, since those are embedded). Default
   *  (undefined) = enabled. */
  enabled?: boolean;
}

/** Whether an installed expansion is offered in creation / ADD GEAR (default: yes). v0.10.3. */
export const isExpansionEnabled = (e: Expansion): boolean => e.enabled !== false;

export const LIBRARY_SCHEMA_VERSION = 1;

/** Quick details for the picker / list rows: counts per content type. */
export interface ExpansionSummary {
  id: string;
  name: string;
  author: string;
  version: number;
  cardCount: number;
  byType: Partial<Record<LibraryContentType, number>>;
}

export function expansionSummary(exp: Expansion): ExpansionSummary {
  const byType: Partial<Record<LibraryContentType, number>> = {};
  for (const c of exp.cards) byType[c.contentType] = (byType[c.contentType] ?? 0) + 1;
  return { id: exp.id, name: exp.name, author: exp.author, version: exp.version, cardCount: exp.cards.length, byType };
}

/** Decide what an incoming expansion should do against the currently-installed one (if any). */
export type MergeDecision = 'add' | 'update' | 'skip' | 'same';
export function mergeDecision(existing: Expansion | undefined, incoming: Expansion): MergeDecision {
  if (!existing) return 'add';
  if (incoming.version > existing.version) return 'update';
  if (incoming.version < existing.version) return 'skip';
  return 'same';
}

/** Content offered to character creation by a set of ENABLED expansions, bucketed by type. Card ids
 *  are immutable, so creation/sheets reference them stably across versions. */
export interface CreationContent {
  ancestries: LibraryCard[];
  communities: LibraryCard[];
  domains: LibraryCard[];
  subclasses: LibraryCard[];
  classes: LibraryCard[];
  weapons: LibraryCard[];
  armor: LibraryCard[];
  inventory: LibraryCard[];
}

export function contentForCreation(enabled: Expansion[]): CreationContent {
  const out: CreationContent = { ancestries: [], communities: [], domains: [], subclasses: [], classes: [], weapons: [], armor: [], inventory: [] };
  for (const exp of enabled) {
    for (const c of exp.cards) {
      if (c.contentType === 'ancestry') out.ancestries.push(c);
      else if (c.contentType === 'community') out.communities.push(c);
      else if (c.contentType === 'domain') out.domains.push(c);
      else if (c.contentType === 'subclass') out.subclasses.push(c);
      else if (c.contentType === 'class') out.classes.push(c);
      else if (c.contentType === 'weapon') out.weapons.push(c);
      else if (c.contentType === 'armor') out.armor.push(c);
      else if (c.contentType === 'inventory') out.inventory.push(c);
    }
  }
  return out;
}

const CONTENT_TYPES: LibraryContentType[] = ['ancestry', 'community', 'domain', 'subclass', 'class', 'weapon', 'armor', 'inventory', 'generic'];

/** Validate + normalize ONE raw card into a LibraryCard. Throws on a malformed/id-less card. Shared by
 *  `validateExpansion` and `parseCharacterFile` (embedded `libraryCards`) — one trust boundary. */
export function normalizeLibraryCard(raw: unknown, i = 0): LibraryCard {
  if (!raw || typeof raw !== 'object') throw new Error(`Card ${i} malformed`);
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string' || !c.id) throw new Error(`Card ${i} missing id`);
  const contentType = (CONTENT_TYPES.includes(c.contentType as LibraryContentType) ? c.contentType : 'generic') as LibraryContentType;
  return {
    id: c.id,
    contentType,
    title: typeof c.title === 'string' ? c.title : '',
    text: typeof c.text === 'string' ? c.text : '',
    imageUri: typeof c.imageUri === 'string' ? c.imageUri : null,
    color: typeof c.color === 'string' ? c.color : null,
    effects: Array.isArray(c.effects) ? (c.effects as CardEffect[]) : undefined,
    typeLabel: typeof c.typeLabel === 'string' ? c.typeLabel : undefined,
    domain: typeof c.domain === 'string' ? c.domain : undefined,
    level: typeof c.level === 'number' ? c.level : undefined,
    className: typeof c.className === 'string' ? c.className : undefined,
    ancestryEffectTrait: c.ancestryEffectTrait === 1 || c.ancestryEffectTrait === 2 ? c.ancestryEffectTrait : undefined,
    sections: Array.isArray(c.sections)
      ? (c.sections as unknown[]).map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return { name: typeof o.name === 'string' ? o.name : undefined, body: typeof o.body === 'string' ? o.body : '' };
        })
      : undefined,
    weapon: c.weapon && typeof c.weapon === 'object' ? (c.weapon as WeaponSpec) : undefined,
    armor: c.armor && typeof c.armor === 'object' ? (c.armor as ArmorSpec) : undefined,
  };
}

/** Validate + normalize a parsed object into an Expansion. Throws on anything that isn't one — the
 *  single trust boundary for imported `.rkp` expansion payloads. */
export function validateExpansion(o: unknown): Expansion {
  if (!o || typeof o !== 'object') throw new Error('Not an expansion');
  const e = o as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) throw new Error('Expansion missing id');
  if (typeof e.name !== 'string') throw new Error('Expansion missing name');
  if (!Array.isArray(e.cards)) throw new Error('Expansion missing cards');
  const cards: LibraryCard[] = (e.cards as unknown[]).map((raw, i) => normalizeLibraryCard(raw, i));
  return {
    id: e.id,
    name: e.name,
    author: typeof e.author === 'string' ? e.author : '',
    description: typeof e.description === 'string' ? e.description : '',
    version: typeof e.version === 'number' && e.version > 0 ? Math.floor(e.version) : 1,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date(0).toISOString(),
    cards,
    enabled: typeof e.enabled === 'boolean' ? e.enabled : undefined,
  };
}

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
import type { CardFunction } from '@/lib/card-functions';
import { expansionClassProblems, type CustomClassSpec } from '@/lib/custom-class';
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
  /** v0.30.0: this section was WRITTEN BY the card's detail form (a weapon's stat rows, a domain
   *  card's domain and level), not by the author. It is rewritten whenever the form changes, so it is
   *  the one section the app may replace, and the one renderers can drop where the card already
   *  prints those facts itself. See `lib/card-form`. */
  generated?: boolean;
  /** v0.13.0: this section IS one of an ancestry's two mandatory features. Features can sit anywhere
   *  among the sections (description first, etc.); their 1/2 identity is their RELATIVE order — the
   *  upper flagged section is always "Feature 1". Cards without any flags (legacy + bundled Void
   *  ancestries) resolve features to sections 0/1 via `featureSectionIndexes`. */
  feature?: boolean;
}

/** The section indexes of an ancestry's Feature 1 and Feature 2, in vertical order. Falls back to the
 *  legacy convention (the first two sections) when fewer than two sections carry the `feature` flag.
 *  THE single place positional feature resolution lives — every strike/effect consumer routes here. */
export function featureSectionIndexes(lc: { sections?: CardSection[] }): [number, number] {
  const flagged: number[] = [];
  (lc.sections ?? []).forEach((s, i) => { if (s.feature) flagged.push(i); });
  return flagged.length >= 2 ? [flagged[0], flagged[1]] : [0, 1];
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
  /** subclass content (v0.10.5): the family slug shared by a custom subclass's 3 tier cards, and which
   *  tier this card is (1 = foundation, 2 = specialization, 3 = mastery). The foundation is picked at
   *  creation; the upgrade advancement adds the matching specialization then mastery. */
  subclass?: string;
  tier?: 1 | 2 | 3;
  /**
   * subclass content (v0.42.0, owner): the trait this subclass CASTS with, if it casts at all.
   *
   * Official subclasses carry one (see `SUBCLASS_SPELLCAST`), and an authored caster had nowhere to
   * put it, so a homebrew Spellcast number was always wrong. Absent means a martial subclass, which
   * is the common case and therefore the default.
   */
  spellcastTrait?: string;
  /**
   * class content (v0.42.0, owner): everything a homebrew class needs to be PLAYED.
   *
   * Absent on every other kind of card, and on a class card written before this existed, which is
   * exactly what `classProblems` reports as "fill in the class details". See `lib/custom-class`.
   */
  classSpec?: CustomClassSpec;
  /**
   * FUNCTIONAL ELEMENTS on this card (v0.42.0, owner): a counter, a text field, a cycling button.
   *
   * The configuration lives here because it is authored; the player's live state lives on the
   * character file, keyed by card and function, so updating an expansion never resets a number
   * somebody is mid-session with. See `lib/card-functions`.
   */
  functions?: CardFunction[];
  /**
   * Where this card lands on the sheet (v0.42.0, owner).
   *
   * "They can choose if they appear inside a custom card category that they create for the functional
   * cards of this class (they can name it and give it an svg icon from the library) or they can choose
   * if they appear in the arsenal." Absent means the arsenal.
   */
  functionCategory?: { key: string; label: string; icon?: string };
  /** ancestry content: which feature line (1 or 2) carries the passive effect — for mixed-ancestry
   *  cross-out (mirrors data/ancestry-traits ANCESTRY_EFFECT_TRAIT). */
  ancestryEffectTrait?: 1 | 2;
  /** v0.10.2: the multi-field body (add/del/reorder). When present, the card renders per-section; `text`
   *  stays as a composed-markdown fallback for simple renderers. */
  sections?: CardSection[];
  /** v0.10.2: mechanical data for weapon/armor content so it works in creation + on the sheet. */
  weapon?: WeaponSpec;
  armor?: ArmorSpec;
  /** v0.13.1 (#357): a catalog-reference card — points at a bundled CATALOG id so a receiving phone
   *  resolves the real card art/identity locally (system card scans are images, never sent as bytes). */
  catalogId?: string;
  /**
   * v0.34.8: the card IS `imageUri`, edge to edge, exactly like the printed scans.
   *
   * For faces authored somewhere else (cardcreator.daggerheart.com exports a finished PNG) where the
   * app has nothing to lay out. Everything else about the card is unchanged: it still carries a
   * title, a content type and whatever the author configured, because that is what makes it a domain
   * card rather than a picture. Only the RENDERING is the image.
   */
  fullImage?: boolean;
}

/** The word printed under a subclass card's title, matching the official scans. */
export const SUBCLASS_TIER_LABEL: Record<1 | 2 | 3, string> = { 1: 'Foundation', 2: 'Specialization', 3: 'Mastery' };
export const SUBCLASS_TIERS: (1 | 2 | 3)[] = [1, 2, 3];

/** v0.14.0: the key that LINKS a custom subclass's three tier cards into one family. Authors may fill
 *  the explicit family field, but the common case is giving all three cards the SAME title — so the
 *  title is the fallback, and matching is case- and whitespace-insensitive ("Blood Mage" == "blood
 *  mage"). Cards of different classes never merge, so the class rides the key too. */
export function subclassFamilyKey(lc: Pick<LibraryCard, 'subclass' | 'title' | 'className'>): string {
  const fam = (lc.subclass?.trim() || lc.title?.trim() || '').toLowerCase().replace(/\s+/g, ' ');
  return `${(lc.className ?? '').trim().toLowerCase()}::${fam}`;
}

/** The display name of a subclass family — the explicit family name if given, else the shared title. */
export function subclassFamilyName(lc: Pick<LibraryCard, 'subclass' | 'title'>): string {
  return lc.subclass?.trim() || lc.title?.trim() || 'Untitled';
}

/** v0.14.0: subclass families in a card set that are missing any of the three tiers. A subclass is only
 *  fully playable with all three — the player can still save/enable the pack, but is warned. */
export function incompleteSubclasses(cards: LibraryCard[]): { name: string; missing: string[] }[] {
  const fams = new Map<string, { name: string; tiers: Set<number> }>();
  for (const c of cards) {
    if (c.contentType !== 'subclass') continue;
    const key = subclassFamilyKey(c);
    const fam = fams.get(key) ?? { name: subclassFamilyName(c), tiers: new Set<number>() };
    fam.tiers.add(c.tier ?? 1);
    fams.set(key, fam);
  }
  return [...fams.values()]
    .map((f) => ({ name: f.name, missing: SUBCLASS_TIERS.filter((t) => !f.tiers.has(t)).map((t) => SUBCLASS_TIER_LABEL[t]) }))
    .filter((f) => f.missing.length > 0);
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
  /** v0.12.2: a bundled OFFICIAL expansion (e.g. The Void) — hard-coded in the app, its cards live in
   *  the catalog (tagged), read-only in the library (can't edit/delete/add cards), and OFF by default. */
  official?: boolean;
}

/** v0.12.2: official expansions default to DISABLED (must be opted into); user expansions default enabled. */
export const isEnabledForCreation = (e: Expansion): boolean => (e.official ? e.enabled === true : e.enabled !== false);

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
    subclass: typeof c.subclass === 'string' ? c.subclass : undefined,
    tier: c.tier === 1 || c.tier === 2 || c.tier === 3 ? c.tier : undefined,
    ancestryEffectTrait: c.ancestryEffectTrait === 1 || c.ancestryEffectTrait === 2 ? c.ancestryEffectTrait : undefined,
    sections: Array.isArray(c.sections)
      ? (c.sections as unknown[]).map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return { name: typeof o.name === 'string' ? o.name : undefined, body: typeof o.body === 'string' ? o.body : '', feature: o.feature === true ? true : undefined, generated: o.generated === true ? true : undefined };
        })
      : undefined,
    weapon: c.weapon && typeof c.weapon === 'object' ? (c.weapon as WeaponSpec) : undefined,
    armor: c.armor && typeof c.armor === 'object' ? (c.armor as ArmorSpec) : undefined,
    catalogId: typeof c.catalogId === 'string' ? c.catalogId : undefined,
    fullImage: c.fullImage === true ? true : undefined,
  };
}

/**
 * Why an expansion is not ready to hand to someone else (v0.34.8, owner).
 *
 * Bulk-importing images makes cards fast, and a card made that way starts with a picture and nothing
 * else. That is fine to keep working on and NOT fine to send: the person receiving it gets an
 * untitled card the app cannot file, and there is no way for them to guess what it was meant to be.
 * So saving is always allowed and sharing is gated on the author finishing the job.
 *
 * Configuration is checked for every card, not only the image ones, because a domain card with no
 * domain is the same broken card whichever door it came in through.
 */
export function expansionShareIssues(exp: Expansion): string[] {
  const out: string[] = [];
  const name = (c: LibraryCard, i: number) => c.title.trim() || `Card ${i + 1}`;
  exp.cards.forEach((c, i) => {
    if (!c.title.trim()) out.push(`Card ${i + 1} has no name.`);
    if (c.contentType === 'domain' && !c.domain?.trim()) out.push(`${name(c, i)} is a domain card with no domain set.`);
    // v0.42.0: a STANDALONE class is its own class, so it needs no parent. One that carries no spec
    // is the old "group this under an existing class" kind and still does.
    if (c.contentType === 'subclass' && !c.className?.trim()) out.push(`${name(c, i)} needs the class it belongs to.`);
    if (c.contentType === 'class' && !c.classSpec && !c.className?.trim()) out.push(`${name(c, i)} needs the class it belongs to.`);
    if (c.fullImage && !c.imageUri) out.push(`${name(c, i)} is an image card with no image.`);
  });
  // v0.42.0 (owner): a homebrew CLASS must be complete and must have a subclass, or the person who
  // receives it cannot make a character with it. ONE gate, so the toast and the button cannot disagree.
  out.push(...expansionClassProblems(exp).map((p) => `${p}.`));
  return out;
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

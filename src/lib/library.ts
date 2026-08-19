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
import type { CardAdvance, CardFunction } from '@/lib/card-functions';
import type { CampaignSettings } from '@/lib/campaign-settings';
import { expansionClassProblems, type CustomClassSpec } from '@/lib/custom-class';
import type { CardEffect } from '@/lib/modifiers';

/**
 * v0.42.3 (owner): `feature` is the FEATURE CARD, and it is the only type that carries functional
 * elements. Renamed from "functional card", which described the machinery rather than the thing: a
 * feature card is how a class gives a player something to track, switch or write on.
 */
export type LibraryContentType = 'ancestry' | 'community' | 'domain' | 'customDomain' | 'subclass' | 'class' | 'type' | 'feature' | 'weapon' | 'armor' | 'inventory' | 'generic';

/** Only a Feature card offers functional elements, and only a Feature card may have any. */
export const CARRIES_FUNCTIONS = (t: LibraryContentType): boolean => t === 'feature';

export const CONTENT_TYPE_LABEL: Record<LibraryContentType, string> = {
  ancestry: 'Ancestry',
  community: 'Community',
  domain: 'Domain card',
  customDomain: 'Domain',
  subclass: 'Subclass',
  class: 'Class',
  type: 'Type',
  feature: 'Feature',
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
  /**
   * v0.42.3 (owner): this section IS a functional element, named here by id.
   *
   * The body is unused when this is set. Making an element a section is what lets it sit between two
   * paragraphs instead of choosing between above-all-the-text and below-all-the-text. Additive on
   * purpose: anything that does not know about elements reads this as a section with no body. See
   * `lib/card-blocks`.
   */
  functionId?: string;
  /**
   * v0.42.3 (owner): how this section's text is set. Absent means left, which is every card written
   * before this existed.
   */
  align?: 'left' | 'center' | 'right' | 'justify';
  /**
   * v0.42.5 (owner): this section IS A GAP, this many card px tall.
   *
   * It draws nothing and composes to nothing; it exists to push what follows it away from what came
   * before. A section rather than a margin on its neighbours, because it moves and deletes like every
   * other block and two of them are twice the space. See `lib/card-blocks`.
   */
  space?: number;
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

/**
 * THE CHIP, as a thing an author decides (v0.43.0, owner).
 *
 * "I can't customize the chip. It will always say class with a red and darker red gradient, and I
 * don't like that." Every card prints one word on a coloured band at the seam between its art and its
 * text, and until now that band was chosen for you by the card's kind.
 *
 * Two stops and a text colour, and no more: the band is 10dp of type, and every rule the bundled
 * palette follows (`KIND_THEMES`) exists because a gradient with any more range in it loses the word
 * at one end. Absent on every card written before this existed, which keeps the bundled palette.
 */
export interface PlaqueSpec {
  /** The word printed on it. Blank falls back to what the card IS, which is the old behaviour. */
  label?: string;
  /** Gradient start. Both colours absent means only the label was customised. */
  from?: string;
  /** Gradient end. */
  to?: string;
  /** The label's colour. */
  text?: string;
}

/**
 * A CONTENT TYPE: a kind of card an expansion invents (v0.43.0, owner).
 *
 * "The user doesn't have the ability to add a new type of card that adds a new step to the character
 * creation, and I feel like that's necessary." The owner's case is a campaign where a character
 * belongs to one of the Orders of the Knights Radiant: not an ancestry, not a community, not a
 * subclass, but a new question the character creator should ask.
 *
 * The card carrying this is a TEMPLATE, exactly as a class card and a custom domain card are. It is
 * never held by anybody. What it does is declare that a kind exists, so cards can name it and every
 * surface that lists kinds of card lists this one too.
 */
export interface TypeSpec {
  /** Whether character creation asks this question at all. */
  step: boolean;
  /** The word on the rail. Blank uses the type's own name. */
  stepLabel?: string;
  /** How many cards the step asks for. One unless the author says otherwise. */
  pick: number;
  /** One line under the step's title, telling the player what they are choosing. */
  stepHint?: string;
}

/** A type's step, ready to ask. `pick` is clamped, because a step that wants zero cards is not a step. */
export const typeStepPick = (t: TypeSpec | undefined): number => Math.max(1, Math.min(10, Math.round(t?.pick ?? 1)));

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
   * LEVEL ADVANCEMENTS this card offers (v0.42.1, owner).
   *
   * Each names one of the elements above and says what taking it does. Stored beside the element
   * because that is the only place it means anything. See `lib/card-advances`.
   */
  advances?: CardAdvance[];
  /**
   * Where this card lands on the sheet (v0.42.0, owner).
   *
   * "They can choose if they appear inside a custom card category that they create for the functional
   * cards of this class (they can name it and give it an svg icon from the library) or they can choose
   * if they appear in the arsenal." Absent means the arsenal.
   */
  functionCategory?: { key: string; label: string; icon?: string };
  /**
   * v0.42.1 (owner): the SUBCLASS this card belongs to, within the class named by `className`.
   *
   * "I can create a subclass for an existing class and I can link a functional card to a subclass
   * (i can also link them to classes, not just subclasses)." Absent means the whole class. Together
   * with `className` this is the whole of `lib/class-links`.
   */
  linkSubclass?: string;
  /**
   * v0.42.1 (owner): what this card IS to the class it names.
   *
   * A generic card attached to a class is ambiguous on its own: it might be one of the class's
   * abilities or a tracker the player uses. `feature` says it is an ability, which is what the class
   * validator counts and what the class card lists.
   */
  classRole?: 'feature';
  /** ancestry content: which feature line (1 or 2) carries the passive effect — for mixed-ancestry
   *  cross-out (mirrors data/ancestry-traits ANCESTRY_EFFECT_TRAIT). */
  ancestryEffectTrait?: 1 | 2;
  /** v0.10.2: the multi-field body (add/del/reorder). When present, the card renders per-section; `text`
   *  stays as a composed-markdown fallback for simple renderers. */
  sections?: CardSection[];
  /** v0.10.2: mechanical data for weapon/armor content so it works in creation + on the sheet. */
  weapon?: WeaponSpec;
  armor?: ArmorSpec;
  /**
   * v0.43.0 (owner): this card's own chip, overriding both its kind's colours and any it inherits.
   *
   * On a TEMPLATE card (a class, a custom domain, a type) it is the chip the whole set wears; on an
   * ordinary card it is that card saying something different from its set. See `lib/card-plaque`.
   */
  plaque?: PlaqueSpec;
  /**
   * v0.43.0 (owner): the CONTENT TYPE this card declares. Only a `type` card carries one.
   */
  typeSpec?: TypeSpec;
  /**
   * v0.43.0 (owner): the id of the `type` card this card is an instance of.
   *
   * This is the whole of belonging to an invented kind: the card is still an ordinary card with an
   * ordinary body, and this one field is what puts it in the type's creation step, its archive
   * filter, its ADD GEAR tab and its section of the pack's gallery.
   */
  customType?: string;
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
  /**
   * v0.42.1 (owner): CAMPAIGN SETTINGS shipped with the pack.
   *
   * What character creation offers at this DM's table. Absent, or present and off, means the pack
   * limits nothing, which is every expansion written before this existed. See `lib/campaign-settings`.
   */
  campaign?: CampaignSettings;
  /**
   * v0.42.5 (owner): what this pack looked like the LAST TIME IT WAS SHARED.
   *
   * "Instead of making the expansion pack bump its version with every save (makes no sense since
   * expansions have auto-save upon every card modification / creation) then make it so that when the
   * user can successfully share it then the expansion bumps the version if there have been changes
   * with respect to the last time it was shared."
   *
   * v0.42.1 bumped on every save, which with auto-save meant a version per keystroke: by the time a
   * pack was finished it was at v340 and the number said nothing. A version is a thing OTHER PEOPLE
   * see, so it moves when other people would see something different, which is at the moment of
   * sharing and only if the contents changed. A signature rather than a flag, so it survives being
   * exported and re-imported and cannot drift out of step with what was actually sent.
   */
  sharedSig?: string;
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

/**
 * Every content type a card may arrive as.
 *
 * v0.43.0: `customDomain`, `feature` and `type` were missing, so importing a pack silently DOWNGRADED
 * a custom domain or a feature card to a plain Card, which is the one thing this normalizer must
 * never do to content somebody wrote.
 */
const CONTENT_TYPES: LibraryContentType[] = ['ancestry', 'community', 'domain', 'customDomain', 'subclass', 'class', 'type', 'feature', 'weapon', 'armor', 'inventory', 'generic'];

/** One plaque spec off the wire, with anything that is not a string dropped. */
function normalizePlaque(raw: unknown): PlaqueSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
  const out: PlaqueSpec = { label: str('label'), from: str('from'), to: str('to'), text: str('text') };
  return out.label || out.from || out.to || out.text ? out : undefined;
}

/** One type spec off the wire. A pack that says it has a step but no count still gets a workable one. */
function normalizeTypeSpec(raw: unknown): TypeSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  return {
    step: o.step === true,
    stepLabel: typeof o.stepLabel === 'string' ? o.stepLabel : undefined,
    stepHint: typeof o.stepHint === 'string' ? o.stepHint : undefined,
    pick: typeof o.pick === 'number' ? o.pick : 1,
  };
}

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
    // v0.43.0: the invented-kind fields. All optional, so a pack written before them is unchanged.
    plaque: normalizePlaque(c.plaque),
    typeSpec: contentType === 'type' ? normalizeTypeSpec(c.typeSpec) : undefined,
    customType: typeof c.customType === 'string' ? c.customType : undefined,
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
    // v0.43.0: a card of an invented kind whose kind is not in the pack is a card nobody can file.
    if (c.customType && !exp.cards.some((t) => t.contentType === 'type' && t.id === c.customType)) {
      out.push(`${name(c, i)} belongs to a type that is not in this pack.`);
    }
  });
  // v0.42.0 (owner): a homebrew CLASS must be complete and must have a subclass, or the person who
  // receives it cannot make a character with it. ONE gate, so the toast and the button cannot disagree.
  out.push(...expansionClassProblems(exp).map((p) => `${p}.`));
  return out;
}

/** Validate + normalize a parsed object into an Expansion. Throws on anything that isn't one — the
 *  single trust boundary for imported `.rkp` expansion payloads. */
/**
 * A pack's cards, with duplicates and strays removed (v0.42.7, owner).
 *
 * "On old expansions some cards are duplicated or some cards are missing from the gallery but present
 * in the data."
 *
 * Two ids the same is a card that draws twice and deletes once, which is how a pack ends up with a
 * card an author cannot get rid of. It has happened through copy-between-expansions and through
 * importing a pack over itself, and both are one-liners to guard: the FIRST of a repeated id wins,
 * because that is the one the author has been editing.
 */
export function dedupeCards(cards: LibraryCard[]): LibraryCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (!c?.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

export function validateExpansion(o: unknown): Expansion {
  if (!o || typeof o !== 'object') throw new Error('Not an expansion');
  const e = o as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) throw new Error('Expansion missing id');
  if (typeof e.name !== 'string') throw new Error('Expansion missing name');
  if (!Array.isArray(e.cards)) throw new Error('Expansion missing cards');
  // v0.42.7: DEDUPED on the way in, so an older pack carrying a repeated id stops drawing one card
  // twice and deleting it once. See `dedupeCards`.
  const cards: LibraryCard[] = dedupeCards((e.cards as unknown[]).map((raw, i) => normalizeLibraryCard(raw, i)));
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

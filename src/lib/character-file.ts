/**
 * CharacterFile — the versioned, serializable document a character IS (PRODUCT.md principle 6).
 * This is the wire/disk format: plain JSON, no requires, no derived state. The sheet's richer
 * runtime `Character` shape is DERIVED from it (`toSheetCharacter`), never stored.
 * Bump `schemaVersion` + extend `parseCharacterFile` when the shape changes.
 */

import { type ClassName, classInfo } from '@/constants/identity';
import { CATALOG, cardById } from '@/data/catalog';
import { withoutLegacyClassCards } from '@/lib/class-cards';
import { withRequiredExpansions } from '@/lib/expansion-membership';
import type { CharacterHistory } from '@/lib/character-history';
import type { DicePreset } from '@/lib/dice-presets';
import type { CardAdvance, CardFunction } from '@/lib/card-functions';
import { functionVars, functionVarValues } from '@/lib/function-vars';
import { normalizeLibraryCard, type LibraryCard } from '@/lib/library';
import { effectsForCardId, refOf, sourceLabelForCardId, unequippedPermanentSources } from '@/features/cards/card-effects';
import { type Character, SAMPLE_CHARACTER, type TraitKey } from '@/features/character-sheet/character';
import { CLASS_DATA, spellcastTraitForSubclass } from '@/data/class-data';
import { activeWildshapeName } from '@/data/wildshape-data';
import { type BaseStats, type CardEffect, computeSheet, type Contribution, effectiveLevel, type EffectSource } from '@/lib/modifiers';

/** Daggerheart proficiency by level (#128): tier 1 = 1, tier 2 (L2-4) = 2, tier 3 (L5-7) = 3, tier 4 = 4. */
export function proficiencyForLevel(level: number): number {
  return level <= 1 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4;
}

export const CHARACTER_SCHEMA_VERSION = 1;

/** Class-tracker state (v0.19.1 item 7). Summoner uses summonerCircles (4 counts) + divineHope (Theurgy
 *  Mastery only). Warlock uses patron / spheres / favor. All optional so a fresh card falls back to
 *  sensible defaults (Favor starts at 3, spheres at +2, circles at 0). */
export interface ClassTrackerState {
  /** Summoner: entities held in circles 1–4 (Fate Spirit, subclass Foundation/Specialization/Mastery). */
  summonerCircles?: number[];
  /** Theurgy Mastery: the Divine Manifestation's remaining Hope dice (starts at 3, disappears at 0). */
  divineHope?: number;
  /** Warlock: the named patron. */
  patron?: string;
  /** Warlock: the patron's sphere of influence, as printed (one free-text field). v0.25.0. */
  sphere?: string;
  /** Warlock, DEPRECATED: two valued spheres, a shape the printed card does not have. Kept only so an
   *  existing save's text can be folded into `sphere` instead of vanishing. */
  spheres?: { name: string; value: number }[];
  /** Warlock: Favor — spendable resource, starts at 3, printed track shows 6. */
  favor?: number;
}

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
  /** v0.34.8: the card IS `imageUri`, edge to edge — no art zone, no plaque, no typeset body. For
   *  faces made somewhere else (the official Daggerheart card creator) that already have their own
   *  layout. The title/type/effects still exist as data; they are simply not printed. */
  fullImage?: boolean;
  /**
   * v0.42.1: FUNCTIONAL ELEMENTS on an authored card, the same ones a library card carries.
   *
   * A bundled class card can have them too, which is how the Brawler's Combo Die is a tracker rather
   * than a sentence about one. A card with any of these renders LIVE, never as a bitmap.
   */
  functions?: CardFunction[];
  /** v0.42.1: level advancements this card offers. See `lib/card-advances`. */
  advances?: CardAdvance[];
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
  /**
   * CHARACTERIZED (v0.36, owner): this character was an adversary or an ally before it was one.
   *
   * Three flags rather than one, because they are three separate decisions the DM made and each one
   * has to be honoured somewhere different:
   *
   *  - `characterized` is provenance. It puts the character in its own section of the adversary and
   *    ally library and marks the encounter entry that is backed by it.
   *  - `arsenalOnly` sends every card to the Arsenal. A stat block has no inventory, no vault and no
   *    notes, and a DM who wanted those can make them; what they must not have to do is unpick five
   *    categories they never asked for.
   *  - `skipStartingKit` refuses the class's default inventory outright. A wraith does not carry a
   *    torch and fifty feet of rope because a Guardian would.
   *
   * The last two are read in exactly one place, the module that builds the deck jobs, so the
   * character sheet and the DM's card view obey them without either of them knowing they exist.
   */
  characterized?: boolean;
  /**
   * The dice tray's three roll presets (v0.41.0, owner). A hole is an empty slot.
   *
   * On the character rather than in a setting because a preset is built out of that character's dice
   * and reads that character's modifiers: "duality + 1d6 + Attack Rolls" means something different
   * for everyone, and it travels with an export like everything else they own.
   */
  dicePresets?: (DicePreset | null)[];
  arsenalOnly?: boolean;
  skipStartingKit?: boolean;
  /**
   * v0.36.2: this character has NO class. `className` still names one because every derived number
   * starts from a class and the file has to have one, but the step was skipped, so its cards and its
   * label are dropped and the carried Evasion and hit points overwrite its numbers. Only reachable
   * when the stat block carries both of those, which is what makes the fallback invisible.
   */
  classless?: boolean;
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
  /**
   * The character's moodboard (v0.34.0): images the player has placed on a canvas of their own.
   *
   * Cosmetic, like the card tokens above it, and stored on the character so it travels with them. The
   * image field inside each entry is called `imageUri` deliberately: export embedding, history
   * snapshot stripping and the import-side blob drop all key off that name.
   */
  moodboard?: import('./moodboard').MoodboardItem[];
  /** v0.34.1: leaving the moodboard saves a picture of it over the character's portrait. */
  moodboardAsPortrait?: boolean;
  /** v0.34.2: the moodboard's ground colour. Absent means the default deep blue. */
  moodboardColor?: string;
  /**
   * The portrait the board REPLACED, so turning "use as portrait" back off restores it (v0.34.3).
   *
   * Exactly one is kept. A stack of every portrait a character has ever had would be a stack of
   * images inside a file that is already the biggest thing the app saves, and the rewind screen says
   * plainly that anything older than this is not on file and cannot come back.
   */
  portraitBefore?: string | null;
  portraitBeforeTransform?: { scale: number; x: number; y: number };
  // --- card management (#246) — all additive; absent on old saves means "no customisation". ---
  /** Player-created carousel categories: id, label, icon key (from the category icon library). */
  customCategories?: import('@/features/character-sheet/carousel-categories').CustomCategory[];
  /** Per-card category OVERRIDE (#246): deck-card id → category key. Moves a card to a different
   *  (built-in or custom) category than its default. Cards without an entry stay in their default. */
  cardCategory?: Record<string, string>;
  /**
   * v0.42.0 (owner): this character's class has been EXPANDED into individual ability cards.
   *
   * The paged class card is derived from `className`, not stored, so there is nothing to delete when
   * it is converted: this flag is what stops it being derived. The cards it became are ordinary
   * entries in `customCards` from that moment on, which is exactly why the conversion is one-way.
   * A character created in v0.42.0 or later starts expanded.
   */
  classExpanded?: boolean;
  /**
   * v0.42.4 (owner): the ACQUIRED class cards that have been expanded into their own pages.
   *
   * By acquired card id (`class-<key>`). A separate list from `classExpanded` because these are other
   * people's classes a character picked up from Add Gear, and each one is expanded on its own. Like
   * `classExpanded` it stores a rendering decision and never any cards: the pages are derived.
   */
  expandedClassCards?: string[];
  /**
   * v0.42.0 (owner): the live state of every FUNCTIONAL element the character's cards carry.
   *
   * Keyed by card id, then by function id. The configuration lives on the library card because it is
   * authored; this is what the player has done with it, which is why updating an expansion can rename
   * a counter without putting somebody's three back to five. An absent entry is the author's default,
   * derived rather than stored (see `lib/card-functions`), so a card nobody has touched costs nothing.
   */
  cardFunctions?: Record<string, Record<string, { n?: number; s?: string; i?: number }>>;
  /**
   * v0.42.1 (owner): level advancements taken FROM A CARD, such as the Brawler's Combo Die.
   *
   * The takes are stored, never their result. Folding them over the authored element at read time is
   * what lets an expansion fix a counter's ceiling without stranding a character mid-campaign, and it
   * is the same rule as everywhere else: derive the total, never accumulate it. See `lib/card-advances`.
   */
  cardAdvances?: { key: string; tier: number }[];
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
  /**
   * v0.25.0: which options the player took on a card that offers a CHOICE, keyed by the card's ref
   * (so all copies share the pick, like effects do). Values are indexes into that card's
   * `CardChoice.options`. Vitality is the first: "permanently gain two of the following."
   *
   * Kept ON THE FILE rather than derived, which is what makes history work: character history stores
   * snapshots, so undoing the moment Vitality was taken restores the pick along with everything else,
   * and re-equipping later finds it still there. No replay logic needed.
   */
  cardChoices?: Record<string, number[]>;
  /**
   * v0.32.0: equipped cards whose MODIFIERS are switched off, keyed by card ref.
   *
   * A domain card like Frenzy only does anything at certain moments, but it occupies one of your five
   * loadout slots the whole session. Unequipping it to stop its bonus was the only way to turn it off,
   * and that lied about your loadout. This separates the two: the card stays equipped and counted, and
   * its bonuses simply are not applied.
   *
   * PERMANENT effects are exempt. They survive the card being unequipped entirely, so muting cannot
   * sensibly be stronger than removing it. Additive: an absent field means every equipped card is live,
   * which is what every existing save means.
   */
  modifiersOffCardIds?: string[];
  /**
   * v0.32.0: per-card numbers the player typed, keyed by card ref, for the `input` formula variable.
   *
   * Ferocity gives Evasion equal to the Hit Points its target marked, which is not on the sheet and
   * never will be, so the card asks. Per card, never global: two cards reading "a number" are reading
   * two different numbers. Additive; absent resolves to 0.
   */
  numberInputs?: Record<string, number>;
  /**
   * v0.35: modifier GROUPS the player has collapsed, as `<cardRef>|<group name>` keys.
   *
   * Groups are open by default, so only the closed ones are listed and an absent field means every
   * group is open, which is what every existing save means. Per card, because two cards can have a
   * group of the same name and they are not the same group.
   */
  collapsedModifierGroups?: string[];
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
  /** v0.19.1 (item 7): unique class trackers rendered as one live card in the Arsenal — the Summoner's
   *  four summoning circles + Divine Manifestation Hope dice, and the Warlock's Patron / Spheres of
   *  Influence / Favor. Only ever used by summoner / warlock characters. Additive; absent → defaults. */
  classTracker?: ClassTrackerState;
  /** v0.10.3: embedded homebrew (library) cards this character USES — a self-contained COPY of each
   *  picked LibraryCard, so it renders + resolves effects with no expansion installed and survives the
   *  expansion being disabled/deleted (Bug 4). Structural slot ids (ancestry/subclass/community/domain/
   *  armor) may reference these ids. Additive; absent on old saves = unchanged behavior. */
  libraryCards?: LibraryCard[];
  /** v0.22.0: the character's state history — every change, rewindable from the State interface.
   *  Additive and optional; a character saved before v0.22.0 simply starts recording from its next
   *  edit. TRAVELS with the file on export (owner) so a shared character carries its whole story.
   *  Snapshots inside never nest a history of their own. */
  history?: CharacterHistory;
  level: number;
}

export function newCharacterId(): string {
  // Collision-safe enough for a local roster; not a global uuid on purpose (no crypto needed).
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parse + validate unknown JSON (imports!) into a CharacterFile. Throws with a readable reason. */
/**
 * Forward migrations, keyed by the version they upgrade FROM. Empty today — v1 is current — but the
 * hook has to exist BEFORE anything depends on the schema moving: `parseCharacterFile` used to hard
 * reject any version but 1 with no migration path, so the first bump would have made every existing
 * save (and, since v0.22.0, every history snapshot inside them) unloadable at once.
 */
const MIGRATIONS: Record<number, (f: Record<string, unknown>) => void> = {};

/** Upgrade an older file in place, or explain plainly why it can't be opened. */
function migrateInPlace(f: Partial<CharacterFile>): void {
  let v = f.schemaVersion;
  if (typeof v !== 'number') throw new Error('Not a character file');
  if (v > CHARACTER_SCHEMA_VERSION) {
    throw new Error('This character was made by a newer version of RuneKeep. Update the app to open it.');
  }
  while (v < CHARACTER_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error("This character is from an older version RuneKeep can no longer read.");
    step(f as unknown as Record<string, unknown>);
    v += 1;
    f.schemaVersion = v;
  }
}

/**
 * Strip `blob:` image references on the way in (v0.33.0).
 *
 * A browser's image picker hands back a `blob:` URL, which addresses one page session's memory and
 * nothing else. Exports written before v0.33.0 carry those handles verbatim, so importing one on a
 * phone gave a character a portrait that could never load: a white rectangle with no explanation and
 * no way to tell it apart from an image that simply had not decoded yet.
 *
 * Dropping the reference makes it an empty portrait, which the sheet already handles and offers to
 * fill. Exports written from v0.33.0 onward carry the bytes, so this only ever fires on old files.
 */
function dropBlobUris(f: Partial<CharacterFile>): void {
  const dead = (u: unknown): boolean => typeof u === 'string' && u.startsWith('blob:');
  if (dead(f.portraitUri)) f.portraitUri = null;
  for (const key of ['customCards', 'inventoryCustom', 'notes', 'experiences', 'libraryCards', 'moodboard'] as const) {
    const arr = (f as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) continue;
    for (const card of arr) {
      const c = card as { imageUri?: string | null };
      if (c && dead(c.imageUri)) c.imageUri = null;
    }
  }
}

export function parseCharacterFile(raw: string): CharacterFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Not a JSON file');
  }
  const f = data as Partial<CharacterFile>;
  if (typeof f !== 'object' || f === null) throw new Error('Not a character file');
  migrateInPlace(f);
  dropBlobUris(f);
  /**
   * v0.42.4 (owner): drop the cards the OLD expand wrote.
   *
   * Between v0.42.0 and v0.42.3, expanding a class wrote authored cards onto the file, in the wrong
   * format with the wrong plaque. The pages are derived now, so those cards are duplicates of what the
   * sheet draws for itself. A tolerant read, the rule since v0.41.4: the file is not rewritten until
   * it is next saved for some other reason, and a character that never expanded is untouched.
   */
  f.customCards = withoutLegacyClassCards(f.customCards, f.classExpanded);
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
  // v0.25.0: the official pack split in two, so a character saved before the split lists only 'void'
  // while half its content is now tagged 'thevoid'. Derive what it actually needs and top the list up,
  // or a Blood Hunter opens with no class. Additive and idempotent.
  f.enabledExpansionIds = withRequiredExpansions(f);
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

/**
 * The enabled cards' effect sources (#175), deduped by ref so several copies apply once.
 *
 * v0.32.0: a card the player has MUTED contributes only its permanent effects. See
 * `modifiersOffCardIds` for why muting is not the same as unequipping, and why permanent survives it.
 */
function enabledCardSources(file: CharacterFile): EffectSource[] {
  const muted = new Set(file.modifiersOffCardIds ?? []);
  return [...new Set(file.enabledCardIds ?? [])]
    .map((id) => {
      const key = refOf(id, file);
      const all = effectsForCardId(id, file);
      return { source: sourceLabelForCardId(id, file), effects: muted.has(key) ? all.filter((e) => e.permanent) : all, key };
    })
    .filter((s) => s.effects.length > 0);
}

/** The number this card's `input` formulas read (v0.32.0). 0 until the player types one. */
export function numberInputFor(file: CharacterFile | undefined, id: string): number {
  return file ? file.numberInputs?.[refOf(id, file)] ?? 0 : 0;
}

/**
 * Full effect sources = the per-level threshold bonus (armored-aware, #320) + the enabled cards + any
 * PERMANENT effect from a card the character holds but has not equipped (v0.25.0).
 *
 * That last group is what lets Vitality do what its own text says: gain the benefit permanently, then
 * put the card in your vault. Before this, following the card's instructions turned its benefit off.
 */
/**
 * What a formula can read that is not a sheet stat (v0.32.0): the character's marked Stress and the
 * per-card numbers they typed. Both live on the file, so both are inside a history snapshot and undo
 * restores them with everything else.
 */
function sheetContext(file: CharacterFile): import('@/lib/modifiers').SheetContext {
  return {
    stress: file.resources?.stress ?? 0,
    inputs: file.numberInputs,
    // v0.42.3: every numeric functional element the character is carrying, so a formula can scale by
    // one. Derived rather than stored, like everything else a card element is, so an advancement that
    // raised a Combo Die is already folded in. See `lib/function-vars`.
    functions: functionVarValues(functionVars([...(file.libraryCards ?? []), ...(file.customCards ?? [])], file.cardFunctions, file.cardAdvances)),
  };
}

/**
 * v0.35: the sources AND the level they are computed at, together.
 *
 * A `level` modifier changes how many per-level threshold bonuses there are, so the two cannot be
 * derived independently: the level has to be resolved from the cards before the level-derived sources
 * are built. Callers take both from here so none of them can compute the sheet at one level and the
 * thresholds at another.
 */
function allEffectSources(file: CharacterFile): { sources: EffectSource[]; level: number } {
  const cards = [...enabledCardSources(file), ...unequippedPermanentSources(file)];
  const level = effectiveLevel(file.level, cards);
  // "Armored" = some enabled card SETS a threshold (armor card, or Bare Bones). Then the level bonus is
  // +1/+1 (add-your-level on top of the set); otherwise the unarmored 1×/2× scaling applies.
  const armored = cards.some((s) => s.effects.some((e) => (e.target === 'majorThreshold' || e.target === 'severeThreshold') && e.mode === 'set'));
  return { sources: [...levelThresholdSources(level, armored), ...cards], level };
}

/**
 * Derive the sheet's runtime Character. Class starting stats come from the rulebook data
 * (#104: starting Evasion + starting Hit Points per class; hearts = HP slots, full at creation).
 * Traits and the other tracks stay at the sheet baseline until leveling/traits ship.
 */
/**
 * What to CALL a character's class in a list (v0.36.3).
 *
 * A classless character (a characterized adversary whose class step was skipped) still names one in
 * its file, because every derived number starts from a class. Printing that name anywhere the player
 * can see it would be the file's bookkeeping leaking out as a lie, so it prints nothing.
 */
export const classLabel = (file: CharacterFile): string => (file.classless ? '' : classInfo(file.className).label);

/**
 * The trait a subclass CASTS with, authored or official (v0.42.0, owner).
 *
 * An embedded homebrew subclass answers first, because it is the only one that can: the built-in map
 * is keyed on the official subclass slugs and knows nothing about a family somebody wrote last night.
 * Everything else falls through to that map exactly as before, so no official character takes a
 * different path than it did.
 *
 * A trait the author typed that is not one of the six resolves to NOTHING rather than to a broken
 * lookup. An expansion is a file from someone else, and this is the boundary.
 */
function subclassSpellcast(file: CharacterFile, subclassCardId: string | null | undefined, officialSlug: string | undefined): TraitKey | null {
  const authored = (subclassCardId ? file.libraryCards?.find((c) => c.id === subclassCardId)?.spellcastTrait : undefined)?.trim().toLowerCase();
  const valid: TraitKey[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
  if (authored && (valid as string[]).includes(authored)) return authored as TraitKey;
  return spellcastTraitForSubclass(officialSlug);
}

export function toSheetCharacter(file: CharacterFile): Character {
  const cls = classInfo(file.className);
  const data = CLASS_DATA[file.className];
  // v0.35: the cards, and the level they put the character at, resolved together.
  const { sources, level } = allEffectSources(file);
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
    // v0.41.0: what cards add to a ROLL. No base, because the sheet has no such number.
    attackRoll: 0,
    spellcastRoll: 0,
    damageRoll: 0,
    proficiency: proficiencyForLevel(level) + (file.proficiencyBonus ?? 0), // level 1 → 1 (#128)
    // #320: base thresholds are 0/0 — ALL value is per-level bonuses (levelThresholdSources), so the
    // character's level is always added to an armor/Bare-Bones `set`, and an unarmored character scales
    // 1×level / 2×level (still 1 / 2 at level 1). Nothing is baked into the base for a `set` to wipe.
    majorThreshold: 0,
    severeThreshold: 0,
    scar: 0, // v0.13.0: scars come only from enabled "Add Scar" cards
    restMoves: 0, // v0.25.0: the baseline two moves live in rest.ts; this counts only the extras
    level: file.level, // v0.35: the character's OWN level; a `level` modifier adds to it
  };
  // v0.21.0 item 5: the Spellcast trait (from the chosen subclass) powers the `spellcast` formula variable
  // — e.g. Mage Robes' Enchanted feature adds it to the damage thresholds.
  const spellcastTrait = subclassSpellcast(file, file.subclassCardId, subclass?.subclass);
  const sheet = computeSheet(base, level, sources, spellcastTrait, sheetContext(file));
  // v0.13.0 SCARS: each enabled scar card disables one Hope slot from the RIGHT. Flat count — freeing
  // any scar card always releases the leftmost scarred slot. Hope in play can never sit on a scarred slot.
  const scars = Math.max(0, Math.min(sheet.hopeMax.total, sheet.scar.total));
  const usableHope = sheet.hopeMax.total - scars;
  /**
   * The GAME's ceilings, not the engine's (v0.36.3, owner).
   *
   * A character sheet is drawn with twelve hit point slots, twelve stress slots and twelve armour
   * slots, because that is how Daggerheart is designed; six hope, less any taken by a scar. A
   * modifier may total whatever it likes and the Modifiers panel will happily show it, but the sheet
   * cannot hold more than it has room for, and a track that claims fourteen slots draws fourteen
   * boxes into the panel below it.
   *
   * Clamped HERE, after the engine, so the breakdown still shows the DM their whole +6 and the sheet
   * still shows twelve. Hope is not clamped by a number: `liveSources` already drops every effect
   * aimed at it, so its only mover is a scar, which is the rulebook's own exception.
   */
  const TRACK_MAX = 12;
  const maxHp = Math.min(TRACK_MAX, sheet.maxHp.total);
  const stressMax = Math.min(TRACK_MAX, sheet.stressMax.total);
  const armorMax = Math.min(TRACK_MAX, sheet.armorScore.total);
  const traits = Object.fromEntries(TRAIT_KEYS.map((k) => [k, sheet[k].total])) as Record<TraitKey, number>;
  // (v0.9.7) Rehydrate the in-play resource positions saved on the file, clamped to the current maxes.
  const res = file.resources;
  const clampRes = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));
  return {
    ...SAMPLE_CHARACTER,
    // Wild Shape (#214): while a Beastform is enabled, the sheet shows the FORM's name so the player
    // always knows they're transformed — even when browsing other categories. file.name is unchanged.
    name: activeWildshapeName(file) ?? file.name,
    // v0.35: the level the sheet is computed at, so a DM's level modifier reads on the sheet too.
    level: sheet.level.total,
    className: file.classless ? '' : cls.label, // v0.36.2: a classless character names no class
    subclass: subclass?.label.replace(/ Foundation$/, '') ?? libTitle(file.subclassCardId) ?? '',
    spellcastTrait,
    // v0.41.0: what cards add to a roll. Carried, never applied: the app does not roll your checks.
    attackRoll: sheet.attackRoll?.total ?? 0,
    spellcastRoll: sheet.spellcastRoll?.total ?? 0,
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
    restMoves: sheet.restMoves.total,
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
  const { sources, level } = allEffectSources(file);
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
    // v0.41.0: what cards add to a ROLL. No base, because the sheet has no such number.
    attackRoll: 0,
    spellcastRoll: 0,
    damageRoll: 0,
    proficiency: proficiencyForLevel(level) + (file.proficiencyBonus ?? 0),
    majorThreshold: 0, // #320: thresholds come entirely from per-level bonuses (see toSheetCharacter)
    severeThreshold: 0,
    scar: 0, // v0.13.0
    restMoves: 0, // v0.25.0
    level: file.level, // v0.35
  };
  const spellcastTrait = subclassSpellcast(file, file.subclassCardId, cardById(file.subclassCardId)?.subclass);
  return computeSheet(base, level, sources, spellcastTrait, sheetContext(file));
}

/** The starting bonus on a new Experience (rulebook: +2, at creation and at each tier start). */
const EXPERIENCE_BASE = 2;

/** One Experience's resolved bonus, with provenance, the Modifiers panel's Experiences section. */
export interface ExperienceBreakdown {
  id: string;
  title: string;
  base: number;
  contributions: Contribution[];
  total: number;
}

/**
 * v0.14.0: resolve every Experience's CURRENT bonus and where it came from.
 *
 * Experiences can't live in `sheetBreakdown`, that's a record keyed by target, which structurally
 * can't hold one value per Experience. So they get their own pass over the same effect sources.
 *
 * Two kinds of contribution: the level-up advancements (folded into `modifier` at apply time, so only
 * the total above the +2 start survives — it's shown as one "Level up" row) and enabled cards carrying
 * an `experience` effect. An effect with no `experienceId` means the FIRST Experience (what a shipped
 * card like the Honing Relic does before the player picks); one naming a deleted Experience is dropped.
 */
export function experienceBreakdown(file: CharacterFile): ExperienceBreakdown[] {
  const exps = file.experiences ?? [];
  if (!exps.length) return [];
  const rows: ExperienceBreakdown[] = exps.map((e) => {
    const mod = e.modifier ?? EXPERIENCE_BASE;
    const base = Math.min(mod, EXPERIENCE_BASE);
    const contributions: Contribution[] = [];
    if (mod > base) contributions.push({ source: 'Level up', delta: mod - base, note: 'Experience advancements' });
    return { id: e.id, title: e.title, base, contributions, total: mod };
  });
  for (const src of allEffectSources(file).sources) {
    for (const e of src.effects) {
      if (e.target !== 'experience') continue;
      const row = e.experienceId ? rows.find((r) => r.id === e.experienceId) : rows[0];
      if (!row) continue; // targets an Experience that no longer exists — contributes nothing
      const d = e.delta ?? 0;
      if (!d) continue;
      row.contributions.push({ source: src.source, delta: d, note: e.note });
      row.total += d;
    }
  }
  return rows;
}

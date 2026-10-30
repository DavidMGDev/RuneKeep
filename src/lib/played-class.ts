/**
 * THE CLASS A CHARACTER IS ACTUALLY PLAYING (v0.42.6, owner).
 *
 * "Custom classes do not appear in character creation."
 *
 * They did not appear because a homebrew class had never been playable. `classSpec` has been authored
 * since v0.42.0 and read by NOTHING: the sheet took its numbers from `CLASS_DATA[file.className]`,
 * which is keyed on the nine bundled classes, and `parseCharacterFile` threw "Unknown class" for
 * anything else. A picker would have offered a class the forge then rejected.
 *
 * So this is the one place that answers "what class is this character, and what does it give them",
 * and every site that used to reach for `CLASS_DATA` reaches for this instead. A bundled class
 * resolves exactly as it did; a homebrew one resolves from the card embedded on the character file,
 * which is where its pack put it at creation and where it stays even if the pack is later deleted.
 *
 * ## Why the card is embedded rather than looked up
 *
 * The same reason every other homebrew card a character uses is embedded: a character is a FILE
 * somebody owns and can send to a friend. A class resolved by pointing at an installed pack would
 * break the moment the file travelled, and the friend would open a character with no numbers.
 */

import { type ClassName, classInfo } from '@/constants/identity';
import { CLASS_DATA } from '@/data/class-data';
import type { CharacterFile } from './character-file';
import { linksToClass } from './class-links';
import { classKeyOf } from './custom-class';
import { assembleClass } from './custom-class-pages';
import { type LibraryCard, subclassFamilyName } from './library';

/** Everything the sheet needs to know about a character's class, whoever wrote it. */
export interface PlayedClass {
  /** Its name, as printed. */
  label: string;
  startingEvasion: number;
  startingHp: number;
  /** The two domains it grants, by key. */
  domains: string[];
  /** The homebrew card this came from, when it is not a bundled class. */
  card?: LibraryCard;
  /** The bundled key, for art, colour and anything else keyed on it. */
  key: ClassName;
}

/** The shape this needs of a character file. Kept small so the module is testable with a literal. */
export interface ClassCarrier {
  className: ClassName;
  /** v0.42.6: the embedded homebrew class card this character is playing, if it is playing one. */
  customClassId?: string;
  libraryCards?: LibraryCard[];
  /** v0.43.4: a homebrew subclass decides which of the class's subclass feature cards apply. */
  subclassCardId?: string;
}

/** The homebrew class card a character is playing, if any. */
export const customClassCard = (file: ClassCarrier): LibraryCard | undefined =>
  file.customClassId ? file.libraryCards?.find((c) => c.id === file.customClassId) : undefined;

/**
 * The class, resolved.
 *
 * A homebrew class falls back to its bundled carrier for anything it does not carry itself: an
 * incomplete spec yields the carrier's numbers rather than zeroes, because a character with no hit
 * points is not a state the rest of the app has an answer for. `className` is still a real bundled
 * key on every file, which is what lets the class COLOUR, the banner and every keyed lookup go on
 * working without a second code path.
 */
export function playedClass(file: ClassCarrier): PlayedClass {
  const key = file.className;
  const data = CLASS_DATA[key];
  const card = customClassCard(file);
  const spec = card?.classSpec;
  if (!card || !spec) {
    return { label: classInfo(key).label, startingEvasion: data.startingEvasion, startingHp: data.startingHp, domains: classInfo(key).domains as string[], key };
  }
  return {
    label: card.title.trim() || classInfo(key).label,
    startingEvasion: spec.startingEvasion > 0 ? spec.startingEvasion : data.startingEvasion,
    startingHp: spec.startingHp > 0 ? spec.startingHp : data.startingHp,
    domains: spec.domains.filter((d) => d.trim()).length ? spec.domains.filter((d) => d.trim()) : (classInfo(key).domains as string[]),
    card,
    key,
  };
}

/** Whether a card belongs to the class this character is playing, homebrew or bundled. */
export function belongsToPlayedClass(file: ClassCarrier, cardClassName: string | undefined): boolean {
  const pc = playedClass(file);
  const want = classKeyOf(pc.card ? pc.card.title : pc.key);
  return classKeyOf(cardClassName) === want;
}

/**
 * The bundled class whose CONTENT this character gets (v0.43.3, playtest).
 *
 * "Al crear el personaje me da la clase de Druida." `className` on a homebrew character is the carrier
 * from `playedClass` above: it paints the sheet and it means nothing else. Every question of the form
 * "is this a Druid", "which class cards", "which kit" asks here, so a Shaman carried by Druid gets no
 * Beastform, no Druid pages and no Druid inventory.
 */
export const bundledClassOf = (file: ClassCarrier): ClassName | undefined => (customClassCard(file) ? undefined : file.className);

/** Druids get Beastform, whether it is their class or their multiclass. */
export const hasBeastform = (file: ClassCarrier & { multiclassName?: string }): boolean =>
  bundledClassOf(file) === 'druid' || file.multiclassName === 'druid';

/** The pages of the homebrew class this character plays, each wearing the class's title and art. */
export function customClassPages(file: ClassCarrier): LibraryCard[] {
  const card = customClassCard(file);
  return card ? assembleClass(file.libraryCards ?? [], card).pages : [];
}

/** A class's FEATURE CARD: its own type since v0.42.3, or a generic card marked as one before that. */
const isFeatureCard = (c: LibraryCard): boolean => c.contentType === 'feature' || (c.contentType === 'generic' && c.classRole === 'feature');

/** The homebrew subclass family this character took, if it took one. */
const subclassFamilyOf = (file: ClassCarrier): string | undefined => {
  const lc = file.subclassCardId ? file.libraryCards?.find((c) => c.id === file.subclassCardId) : undefined;
  return lc?.contentType === 'subclass' ? subclassFamilyName(lc) : undefined;
};

/**
 * The feature cards a character of this class holds (v0.43.4, playtest).
 *
 * "Vodou Healing Powers" is a feature card that names the Shaman, and nothing ever handed it to a
 * Shaman: creation embedded the class and its pages and stopped there. A card linked to the whole
 * class is every Shaman's; one linked to a subclass is only that subclass's.
 */
export function classFeatureCards(cards: LibraryCard[], classTitle: string, subclassFamily?: string): LibraryCard[] {
  return cards.filter((c) => isFeatureCard(c) && linksToClass(c, classTitle) && (!classKeyOf(c.linkSubclass) || classKeyOf(c.linkSubclass) === classKeyOf(subclassFamily)));
}

/** The feature cards of the homebrew class this character plays, as held on the file. */
export function customClassFeatures(file: ClassCarrier): LibraryCard[] {
  const card = customClassCard(file);
  return card ? classFeatureCards(file.libraryCards ?? [], card.title, subclassFamilyOf(file)) : [];
}

/** What `normalizeLibraryCard` dropped from every embedded card before v0.43.4. */
const STRIPPED = ['spellcastTrait', 'classSpec', 'functions', 'advances', 'functionCategory', 'linkSubclass', 'classRole'] as const;
const hasElements = (c: LibraryCard): boolean => !!c.sections?.some((s) => s.functionId || s.align || s.space !== undefined);

/**
 * A character's homebrew cards made whole from the packs on this device (v0.43.4, playtest).
 *
 * Two things, both the same complaint, "Shaman's feature card isn't in the arsenal":
 *
 * 1. RESTORE. Until v0.43.4 every load of a character stripped its embedded cards of the fields v0.42
 *    added, and the next save made that permanent. A Shaman saved that way has a class card with no
 *    spec, so it read as its carrier and its pages fell into the Inventory. Whatever a held card is
 *    missing that the same card in an installed pack has, it gets back. Nothing it HAS is touched.
 * 2. FEATURES. Its class's feature cards, embedded like its pages, each in the category its author
 *    chose for it. Creation runs this too, so a new character and a repaired one end up the same.
 *
 * Returns the same object when there is nothing to do, so a caller can tell whether to save.
 */
export function withClassCards(file: CharacterFile, packCards: LibraryCard[]): CharacterFile {
  const byId = new Map(packCards.map((c) => [c.id, c]));
  let restoredAny = false;
  const held = (file.libraryCards ?? []).map((c) => {
    const src = byId.get(c.id);
    if (!src) return c;
    const patch: Partial<LibraryCard> = {};
    for (const k of STRIPPED) if (c[k] === undefined && src[k] !== undefined) Object.assign(patch, { [k]: src[k] });
    if (hasElements(src) && !hasElements(c)) patch.sections = src.sections;
    if (!Object.keys(patch).length) return c;
    restoredAny = true;
    return { ...c, ...patch };
  });
  const next = restoredAny ? { ...file, libraryCards: held } : file;
  const card = customClassCard(next);
  if (!card) return next;
  const missing = classFeatureCards(packCards, card.title, subclassFamilyOf(next)).filter((c) => !held.some((h) => h.id === c.id));
  if (!missing.length) return next;
  const cats = [...(next.customCategories ?? [])];
  const placed: Record<string, string> = {};
  for (const c of missing) {
    const fc = c.functionCategory;
    if (!fc) continue;
    if (!cats.some((x) => x.id === fc.key)) cats.push({ id: fc.key, label: fc.label.trim() || 'Features', icon: fc.icon ?? 'star' });
    placed[c.id] = fc.key;
  }
  const effective = missing.filter((c) => (c.effects?.length ?? 0) > 0).map((c) => c.id);
  return {
    ...next,
    libraryCards: [...held, ...missing],
    ...(effective.length ? { enabledCardIds: [...(next.enabledCardIds ?? []), ...effective] } : {}),
    ...(Object.keys(placed).length ? { customCategories: cats, cardCategory: { ...(next.cardCategory ?? {}), ...placed } } : {}),
  };
}

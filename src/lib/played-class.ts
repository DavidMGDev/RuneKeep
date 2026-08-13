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
import { classKeyOf } from './custom-class';
import type { LibraryCard } from './library';

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
 * The starting items a class hands out, by list.
 *
 * Bundled classes keep their own kit (`CLASS_INVENTORY`), which this deliberately does not touch: a
 * homebrew class's three lists are the only thing here.
 */
export function customStartingItems(file: ClassCarrier): { fixed: string[]; choiceA: string[]; choiceB: string[] } | null {
  const spec = customClassCard(file)?.classSpec;
  if (!spec) return null;
  return { fixed: spec.fixedItemIds ?? [], choiceA: spec.choiceAItemIds ?? [], choiceB: spec.choiceBItemIds ?? [] };
}
